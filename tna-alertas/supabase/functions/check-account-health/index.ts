// Saude das contas de anuncio (pg_cron a cada 2h). Gera dois tipos de problema
// por conta, com a regra de notificacao do banco (alerta_abrir/alerta_resolver):
//   conta:<slug>  pagamento ou suspensao. Avisa ao abrir, 1x por dia enquanto
//                 durar e quando resolver.
//   saldo:<slug>  pre-pago. Chegou a R$ 50: avisa 1 vez. Zerou: avisa e repete
//                 1x por dia. Recarregou: avisa que voltou.
// conta_saude continua sendo gravada porque o app mostra a situacao por cliente.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const GRAPH_VERSION = "v21.0";
const META_TOKEN = Deno.env.get("META_ADS_TOKEN")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// Sem isso a biblioteca manda urgency "normal", e o FCM trata mensagem normal
// como adiavel: com o aparelho em Doze ela fica na fila e so aparece quando o
// app volta pro primeiro plano. TTL de 24h: alerta de ontem nao ajuda mais.
const OPCOES_ENVIO = { urgency: "high", TTL: 86400 } as const;
const APP_URL = "https://thenewads.com.br/alertas";

const LIMITE_SALDO = 50;
const SALDO_ZERADO = 1;

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "Ativa",
  2: "Desativada",
  3: "Conta com saldo pendente (unsettled)",
  7: "Em revisão de risco",
  8: "Pendente de pagamento",
  9: "Em período de carência (pagamento atrasado)",
  100: "Em processo de encerramento",
  101: "Encerrada",
  201: "Anúncio ativo sem forma de pagamento",
};

const ACCOUNT_STATUS_MOTIVOS: Record<number, string> = {
  2: "Conta desativada pela Meta",
  3: "Pagamento falhou, tem valor pendente pra pagar",
  7: "Meta está revisando a conta por suspeita de risco",
  8: "Aguardando confirmação do pagamento",
  9: "Pagamento atrasado, poucos dias antes de bloquear os anúncios",
  100: "Conta em processo de encerramento",
  101: "Conta encerrada, não roda mais nada",
  201: "Anúncio rodando sem forma de pagamento cadastrada",
};

const DISABLE_REASON_MOTIVOS: Record<number, string> = {
  1: "Anúncio removido por violar política da Meta",
  2: "Denúncia de direitos autorais ou marca registrada",
  3: "Pagamento sinalizado como suspeito",
  4: "Pagamento atrasado",
  7: "Conta fechada definitivamente",
  11: "Conta em análise da Meta",
  17: "Fatura não paga",
};

function parseSaldoPrepago(fundingSourceDetails: any): number | null {
  if (!fundingSourceDetails || fundingSourceDetails.type !== 20) return null;
  const texto: string = fundingSourceDetails.display_string ?? "";
  const match = texto.match(/R\$\s?([\d.,]+)/);
  if (!match) return null;
  return Number(match[1].replace(/\./g, "").replace(",", "."));
}

function reais(v: number) {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

function problemaConta(status: number, disableReason: number): { nivel: "critico" | "atencao"; motivo: string } | null {
  if ([2, 3, 8, 100, 101, 201].includes(status)) {
    return { nivel: "critico", motivo: ACCOUNT_STATUS_MOTIVOS[status] ?? `Conta com status ${status}` };
  }
  if (status === 7 || status === 9) {
    return { nivel: "atencao", motivo: ACCOUNT_STATUS_MOTIVOS[status] ?? `Conta com status ${status}` };
  }
  if (disableReason) {
    return { nivel: "critico", motivo: DISABLE_REASON_MOTIVOS[disableReason] ?? `Conta desativada (motivo ${disableReason})` };
  }
  return null;
}

function problemaSaldo(saldo: number | null): { nivel: "critico" | "atencao"; motivo: string; lembrete: number | null } | null {
  if (saldo === null) return null;
  if (saldo < SALDO_ZERADO) {
    return { nivel: "critico", motivo: "Saldo acabou, os anúncios param de rodar até recarregar", lembrete: 24 };
  }
  if (saldo <= LIMITE_SALDO) {
    return { nivel: "atencao", motivo: `Saldo quase acabando: ${reais(saldo)}`, lembrete: null };
  }
  return null;
}

async function fetchAccountHealth(contaAnuncio: string) {
  const fields = "account_status,disable_reason,balance,spend_cap,amount_spent,currency,funding_source_details";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${contaAnuncio}?fields=${fields}&access_token=${META_TOKEN}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`Meta API error (${contaAnuncio}): ${json.error.message}`);
  return json;
}

async function enviarPush(titulo: string, corpo: string) {
  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  if (!subs || subs.length === 0) return { enviados: 0, erros: [] as unknown[] };
  const payload = JSON.stringify({ title: titulo, body: corpo, url: APP_URL });
  const erros: unknown[] = [];
  let enviados = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, OPCOES_ENVIO);
      enviados++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
      erros.push({ statusCode: err?.statusCode, message: String(err?.body ?? err) });
    }
  }));
  return { enviados, erros };
}

async function abrir(chave: string, slug: string, tipo: string, nivel: string, titulo: string, mensagem: string, lembrete: number | null) {
  const { data, error } = await supabase.rpc("alerta_abrir", {
    p_chave: chave, p_slug: slug, p_tipo: tipo, p_nivel: nivel, p_titulo: titulo, p_mensagem: mensagem,
    p_url: "https://adsmanager.facebook.com/", p_lembrete_horas: lembrete, p_dados: {},
  });
  if (error) throw new Error(`alerta_abrir ${chave}: ${error.message}`);
  if (data) await enviarPush(`${nivel === "critico" ? "🔴" : "🟡"} ${titulo}`, mensagem);
  return !!data;
}

async function resolver(chave: string, avisar: boolean, corpo: string) {
  const { data, error } = await supabase.rpc("alerta_resolver", { p_chave: chave, p_avisar: avisar });
  if (error) throw new Error(`alerta_resolver ${chave}: ${error.message}`);
  if (data) await enviarPush(`🟢 ${data}`, corpo);
  return !!data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Antes a rotina de tracking notificava por aqui a cada rodada. Agora ela
      // so grava tracking_saude e o monitor decide. Mantido pra nao quebrar
      // chamada antiga, mas nao notifica mais.
      if (body?.tipo === "tracking") {
        return new Response(JSON.stringify({ ok: true, ignorado: "tracking agora e avaliado pela funcao monitor" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (body?.test === "resolvido") {
        const resultado = await enviarPush("🟢 Cliente Teste", "Conta normalizada (estava: critico)");
        return new Response(JSON.stringify({ ok: true, teste: resultado }), { headers: { "Content-Type": "application/json" } });
      }
      if (body?.test) {
        const resultado = await enviarPush("🔴 Cliente Teste", "Pagamento falhou, tem valor pendente pra pagar");
        return new Response(JSON.stringify({ ok: true, teste: resultado }), { headers: { "Content-Type": "application/json" } });
      }
    } catch {
      // corpo vazio ou invalido - segue fluxo normal
    }
  }

  const { data: clientes, error } = await supabase
    .from("clientes_meta_contas")
    .select("slug, nome, conta_anuncio, moeda")
    .eq("ativo", true);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const ativos = new Set((clientes ?? []).map((c) => c.slug));
  const resultados: Record<string, unknown> = {};

  // conta desligada (ex-cliente): sai da tela e fecha o que tiver aberto, sem avisar
  const { data: saudeAntiga } = await supabase.from("conta_saude").select("slug");
  for (const r of saudeAntiga ?? []) {
    if (!ativos.has(r.slug)) {
      await supabase.from("conta_saude").delete().eq("slug", r.slug);
      await resolver(`conta:${r.slug}`, false, "");
      await resolver(`saldo:${r.slug}`, false, "");
    }
  }

  for (const cliente of clientes ?? []) {
    try {
      const health = await fetchAccountHealth(cliente.conta_anuncio);
      const status = Number(health.account_status);
      const disableReason = Number(health.disable_reason ?? 0);
      const saldo = parseSaldoPrepago(health.funding_source_details);

      const pConta = problemaConta(status, disableReason);
      const pSaldo = problemaSaldo(saldo);

      let notificou = false;
      if (pConta) {
        notificou = await abrir(`conta:${cliente.slug}`, cliente.slug, "saude_conta", pConta.nivel, `${cliente.nome}: problema na conta`, pConta.motivo, 24) || notificou;
      } else {
        await resolver(`conta:${cliente.slug}`, true, "Conta de anúncio voltou ao normal.");
      }
      if (pSaldo) {
        notificou = await abrir(`saldo:${cliente.slug}`, cliente.slug, "saldo", pSaldo.nivel, `${cliente.nome}: saldo`, pSaldo.motivo, pSaldo.lembrete) || notificou;
      } else {
        await resolver(`saldo:${cliente.slug}`, true, saldo !== null ? `Saldo recarregado: ${reais(saldo)}.` : "Saldo normalizado.");
      }

      const pior = [pConta, pSaldo].some((p) => p?.nivel === "critico") ? "critico" : (pConta || pSaldo) ? "atencao" : "ok";
      const motivo = [pConta?.motivo, pSaldo?.motivo].filter(Boolean).join(" · ");

      await supabase.from("conta_saude").upsert({
        slug: cliente.slug,
        account_status: status,
        disable_reason: disableReason,
        saldo,
        spend_cap: health.spend_cap !== undefined ? Number(health.spend_cap) / 100 : null,
        amount_spent: health.amount_spent !== undefined ? Number(health.amount_spent) / 100 : null,
        status_texto: motivo || (ACCOUNT_STATUS_LABELS[status] ?? String(status)),
        nivel: pior,
        checked_at: new Date().toISOString(),
        ...(notificou ? { alertado_em: new Date().toISOString() } : {}),
      });

      resultados[cliente.slug] = { status, disableReason, saldo, nivel: pior, motivo, notificou };
    } catch (err) {
      resultados[cliente.slug] = { error: String(err) };
    }
  }

  return new Response(JSON.stringify(resultados, null, 2), { headers: { "Content-Type": "application/json" } });
});

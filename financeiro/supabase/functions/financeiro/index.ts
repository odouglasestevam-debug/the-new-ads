// Financeiro da The New Ads. Uma função com três portas (verify_jwt desligado: cada porta se autentica):
//  POST /functions/v1/financeiro/asaas   webhook do Asaas; header asaas-access-token = segredo financeiro_webhook_token
//  POST /functions/v1/financeiro         pg_cron com x-cron-secret = financeiro_cron
//      {"tarefa":"sincronizar"} | {"tarefa":"sincronizar","inicial":true} | {"tarefa":"cobrancas"} | {"tarefa":"mes"} | {"tarefa":"avisos"}
//  POST /functions/v1/financeiro         Douglas logado: {"acao":"teste"} | {"acao":"sincronizar"}
// Segredos no Vault (financeiro_*): asaas_token, webhook_token, cron, vapid_publica, vapid_privada,
// whatsapp_url, whatsapp_token. Nenhum fica em variável de ambiente nem no código.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Asaas, ErroAsaas } from "./asaas.ts";
import { configurarVapid, enviarPush, type Carga, type Inscricao } from "./push.ts";
import { enviarWhatsApp, pausa } from "./whatsapp.ts";
import { modeloDaEtapa, montarMensagem, telefoneWhatsApp } from "./mensagem.js";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CHAVE_PUBLICA = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
const ORIGENS = ["https://financeiro.thenewads.com.br", "http://localhost:8791"];
const ABERTAS = ["a_vencer", "vence_hoje", "atrasada"];
// Teto por rodada: o cron passa de hora em hora das 9h às 18h e pega o que sobrou.
// Mantém a função longe do limite de tempo, que poderia cortar entre o envio e o registro.
const MAX_ENVIOS_POR_RODADA = 12;

type Segredo = (nome: string) => Promise<string | null>;

function cors(req: Request) {
  const origem = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

// Comparação em tempo constante.
function igual(a: string | null, b: string | null) {
  if (!a || !b) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function somarDias(iso: string, dias: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function rpc(admin: SupabaseClient, nome: string, args?: Record<string, unknown>) {
  const { data, error } = await admin.rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data;
}

async function clienteAsaas(segredo: Segredo) {
  const token = await segredo("asaas_token");
  if (!token) throw new Error("Chave do Asaas não cadastrada (segredo financeiro_asaas_token).");
  return new Asaas(token);
}

// ---------------- avisos no celular ----------------
async function enviarAvisos(admin: SupabaseClient, segredo: Segredo) {
  const lista = (await rpc(admin, "financeiro_reservar_avisos")) as
    { id: string; titulo: string; corpo: string; url: string; inscricoes: Inscricao[] }[];
  if (!lista?.length) return { avisos: 0 };
  const [publica, privada] = await Promise.all([segredo("vapid_publica"), segredo("vapid_privada")]);
  if (!publica || !privada) throw new Error("Chaves VAPID do financeiro não cadastradas.");
  configurarVapid(publica, privada);
  const apagar = (endpoint: string) => admin.rpc("financeiro_apagar_push", { p_endpoint: endpoint });
  let enviados = 0;
  for (const a of lista) {
    const r = await enviarPush(a.inscricoes || [], { titulo: a.titulo, corpo: a.corpo, url: a.url }, apagar);
    await rpc(admin, "financeiro_marcar_aviso", { p_id: a.id, p_ok: r.enviados > 0, p_erro: r.erros.join("; ") || "Nenhum aparelho recebeu." });
    if (r.enviados > 0) enviados++;
  }
  return { avisos: enviados };
}

async function testePush(admin: SupabaseClient, segredo: Segredo, userId: string) {
  const { data, error } = await admin.from("financeiro_push_inscricoes").select("endpoint, p256dh, auth").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const [publica, privada] = await Promise.all([segredo("vapid_publica"), segredo("vapid_privada")]);
  if (!publica || !privada) throw new Error("Chaves VAPID do financeiro não cadastradas.");
  configurarVapid(publica, privada);
  const carga: Carga = { titulo: "Teste do Financeiro", corpo: "Se você está lendo isto, os avisos de pagamento vão chegar aqui.", url: "/#/ajustes" };
  return await enviarPush((data || []) as Inscricao[], carga, (endpoint) => admin.rpc("financeiro_apagar_push", { p_endpoint: endpoint }));
}

// ---------------- leitura do Asaas ----------------
async function garantirCliente(admin: SupabaseClient, segredo: Segredo, id: string) {
  if (!id) return;
  const { data } = await admin.from("financeiro_clientes").select("nome").eq("asaas_id", id).maybeSingle();
  if (data?.nome) return;
  // Sem o nome o aviso sairia "Cliente pagou". Se o Asaas falhar aqui, a cobrança é gravada mesmo assim
  // e o nome entra na próxima conferência.
  try {
    const asaas = await clienteAsaas(segredo);
    await rpc(admin, "financeiro_salvar_cliente", { p: await asaas.get(`/customers/${encodeURIComponent(id)}`) });
  } catch (e) {
    console.error("garantirCliente", id, (e as Error).message);
  }
}

async function conferirCobranca(admin: SupabaseClient, asaas: Asaas, id: string, avisar: boolean) {
  try {
    const atual = await asaas.get(`/payments/${encodeURIComponent(id)}`);
    return { atual, situacao: (await rpc(admin, "financeiro_salvar_cobranca", { p: atual, p_avisar: avisar })) as string };
  } catch (e) {
    if (e instanceof ErroAsaas && e.status === 404) {
      await rpc(admin, "financeiro_marcar_sumido", { p_tipo: "cobranca", p_id: id });
      return { atual: null, situacao: "excluida" };
    }
    throw e;
  }
}

async function sincronizar(admin: SupabaseClient, segredo: Segredo, origem: "agendada" | "manual" | "inicial") {
  const avisar = origem !== "inicial";
  const id = await rpc(admin, "financeiro_iniciar_sync", { p_origem: origem });
  const resumo = { clientes: 0, assinaturas: 0, cobrancas: 0, conferidas: 0 };
  let erro: string | null = null;
  try {
    const asaas = await clienteAsaas(segredo);
    const lote = (tipo: string, itens: unknown[]) =>
      rpc(admin, "financeiro_salvar_lote", { p_tipo: tipo, p_itens: itens, p_avisar: avisar }) as Promise<number>;

    // A listagem só termina se todas as páginas vierem; aí o que não apareceu foi excluído no Asaas.
    const clientes = new Set<string>();
    for await (const pagina of asaas.paginas("/customers")) {
      pagina.forEach((c) => clientes.add(c.id));
      resumo.clientes += await lote("clientes", pagina);
    }
    const { data: locaisCli } = await admin.from("financeiro_clientes").select("asaas_id, nome").eq("excluido", false);
    for (const c of locaisCli || []) {
      if (!clientes.has(c.asaas_id) && c.nome) await rpc(admin, "financeiro_marcar_sumido", { p_tipo: "cliente", p_id: c.asaas_id });
    }

    const assinaturas = new Set<string>();
    for await (const pagina of asaas.paginas("/subscriptions")) {
      pagina.forEach((s) => assinaturas.add(s.id));
      resumo.assinaturas += await lote("assinaturas", pagina);
    }
    const { data: locaisAss } = await admin.from("financeiro_assinaturas").select("asaas_id").eq("excluida", false);
    for (const s of locaisAss || []) {
      if (!assinaturas.has(s.asaas_id)) await rpc(admin, "financeiro_marcar_sumido", { p_tipo: "assinatura", p_id: s.asaas_id });
    }

    // 13 meses pra trás (métricas) e 70 dias pra frente (o "10 dias antes" e o previsto do mês seguinte).
    const hoje = hojeSP();
    const ini = somarDias(hoje, -400);
    const fim = somarDias(hoje, 70);
    const cobrancas = new Set<string>();
    for await (const pagina of asaas.paginas(`/payments?dueDate%5Bge%5D=${ini}&dueDate%5Ble%5D=${fim}`)) {
      pagina.forEach((p) => cobrancas.add(p.id));
      resumo.cobrancas += await lote("cobrancas", pagina);
    }
    // Em aberto aqui e fora da lista do Asaas: excluída sem o webhook chegar. Confere uma a uma.
    const { data: abertas } = await admin.from("financeiro_cobrancas").select("asaas_id")
      .in("situacao", ABERTAS).gte("vencimento", ini).lte("vencimento", fim);
    for (const c of abertas || []) {
      if (cobrancas.has(c.asaas_id)) continue;
      await conferirCobranca(admin, asaas, c.asaas_id, avisar);
      resumo.conferidas++;
    }
  } catch (e) {
    erro = (e as Error).message;
  }
  await rpc(admin, "financeiro_concluir_sync", { p_id: id, p_ok: !erro, p_resumo: resumo, p_erro: erro });
  await enviarAvisos(admin, segredo).catch((e) => console.error("avisos", e));
  return { ok: !erro, erro, ...resumo };
}

// ---------------- cobrança pelo WhatsApp ----------------
type Envio = {
  cobranca_id: string; cliente_id: string; cliente_nome: string; contato: string; celular: string | null;
  etapa: "antes" | "no_dia" | "atraso"; valor: number; vencimento: string; descricao: string | null;
  link_fatura: string | null; forma: string | null; dias_atraso: number;
};

async function cobrancas(admin: SupabaseClient, segredo: Segredo) {
  const { data: cfg, error } = await admin.from("financeiro_config").select("*").single();
  if (error || !cfg) throw new Error("Configuração do financeiro não encontrada.");
  await rpc(admin, "financeiro_gerar_avisos_atraso");

  const lista = ((await rpc(admin, "financeiro_envios_de_hoje")) || []) as Envio[];
  const resultado = { pendentes: lista.length, enviadas: 0, simuladas: 0, falhas: 0, puladas: 0 };
  if (!lista.length) {
    await enviarAvisos(admin, segredo).catch((e) => console.error("avisos", e));
    return resultado;
  }
  const asaas = await clienteAsaas(segredo);
  const [url, token] = await Promise.all([segredo("whatsapp_url"), segredo("whatsapp_token")]);
  const registrar = (e: Envio, tel: string | null, texto: string, situacao: string, erro: string | null) =>
    rpc(admin, "financeiro_registrar_mensagem", {
      p_cobranca: e.cobranca_id, p_etapa: e.etapa, p_telefone: tel, p_texto: texto, p_situacao: situacao, p_erro: erro,
    });

  let reais = 0;
  for (const e of lista) {
    if (cfg.cobranca_ativa && reais >= MAX_ENVIOS_POR_RODADA) break;
    // Confere no Asaas na hora do envio: quem pagou agora há pouco não pode receber cobrança.
    let conferida;
    try {
      conferida = await conferirCobranca(admin, asaas, e.cobranca_id, true);
    } catch (err) {
      await registrar(e, telefoneWhatsApp(e.celular), "(não montada)", "falhou", `Não deu pra conferir no Asaas: ${(err as Error).message}`);
      resultado.falhas++;
      continue;
    }
    const { atual, situacao } = conferida;
    if (!atual || !ABERTAS.includes(situacao) || atual.dueDate !== e.vencimento) { resultado.puladas++; continue; }

    const dados = { ...e, valor: atual.value, link_fatura: atual.invoiceUrl || e.link_fatura, descricao: atual.description ?? e.descricao };
    const texto = montarMensagem(modeloDaEtapa(cfg, e.etapa), dados);
    const tel = telefoneWhatsApp(e.celular);

    if (!cfg.cobranca_ativa) {
      await registrar(e, tel, texto, "simulada", tel ? null : "Sem celular válido no Asaas: não seria enviada.");
      resultado.simuladas++;
      continue;
    }
    if (!url || !token) { await registrar(e, tel, texto, "falhou", "Número de cobrança não configurado"); resultado.falhas++; continue; }
    if (!tel) { await registrar(e, null, texto, "falhou", "Cliente sem celular válido no Asaas"); resultado.falhas++; continue; }

    if (reais > 0) await pausa();
    reais++;
    try {
      await enviarWhatsApp(url, token, tel, texto);
    } catch (err) {
      await registrar(e, tel, texto, "falhou", (err as Error).message);
      resultado.falhas++;
      continue;
    }
    // O Pix vai numa mensagem separada, só com o código: no celular é segurar e copiar.
    let erroPix: string | null = null;
    if (cfg.enviar_pix && atual.billingType !== "CREDIT_CARD") {
      try {
        const pix = await asaas.get(`/payments/${encodeURIComponent(e.cobranca_id)}/pixQrCode`);
        if (pix?.payload) await enviarWhatsApp(url, token, tel, pix.payload);
      } catch (err) {
        erroPix = `Mensagem enviada, mas o Pix copia e cola não: ${(err as Error).message}`;
      }
    }
    await registrar(e, tel, texto, "enviada", erroPix);
    resultado.enviadas++;
  }
  await enviarAvisos(admin, segredo).catch((err) => console.error("avisos", err));
  return resultado;
}

// ---------------- webhook do Asaas ----------------
async function webhook(req: Request, admin: SupabaseClient, segredo: Segredo) {
  const esperado = await segredo("webhook_token");
  if (!esperado || !igual(req.headers.get("asaas-access-token"), esperado)) return json(req, 401, { erro: "Token inválido." });
  const corpo = await req.json().catch(() => null);
  if (!corpo?.event) return json(req, 400, { erro: "Corpo inválido." });

  const cobranca = corpo.payment;
  const assinatura = corpo.subscription;
  const id = String(corpo.id || `${corpo.event}:${cobranca?.id || assinatura?.id || ""}:${corpo.dateCreated || ""}`);
  const repetido = await rpc(admin, "financeiro_registrar_evento", {
    p_id: id, p_evento: corpo.event, p_cobranca: cobranca?.id ?? null, p_payload: corpo,
  });
  if (repetido) return json(req, 200, { ok: true, repetido: true });

  if (cobranca?.id) {
    await garantirCliente(admin, segredo, cobranca.customer);
    await rpc(admin, "financeiro_salvar_cobranca", { p: cobranca, p_avisar: true });
  } else if (assinatura?.id) {
    await garantirCliente(admin, segredo, assinatura.customer);
    await rpc(admin, "financeiro_salvar_assinatura", { p: assinatura });
  }
  await rpc(admin, "financeiro_evento_processado", { p_id: id });
  // Responde já: o Asaas pausa a fila se o webhook demora ou falha várias vezes seguidas.
  EdgeRuntime.waitUntil(enviarAvisos(admin, segredo).catch((e) => console.error("avisos", e)));
  return json(req, 200, { ok: true });
}

// ---------------- entrada ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { erro: "Método não permitido." });

  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const segredo: Segredo = async (nome) => (await rpc(admin, "financeiro_ler_segredo", { p_nome: nome })) as string | null;

  try {
    if (new URL(req.url).pathname.endsWith("/asaas")) return await webhook(req, admin, segredo);

    const cron = req.headers.get("x-cron-secret");
    if (cron) {
      if (!igual(cron, await segredo("cron"))) return json(req, 401, { erro: "Não autorizado." });
      const corpo = await req.json().catch(() => ({}));
      switch (corpo.tarefa) {
        case "sincronizar": return json(req, 200, await sincronizar(admin, segredo, corpo.inicial ? "inicial" : "agendada"));
        case "cobrancas": return json(req, 200, await cobrancas(admin, segredo));
        case "mes":
          await rpc(admin, "financeiro_gerar_aviso_mes");
          return json(req, 200, await enviarAvisos(admin, segredo));
        case "avisos": return json(req, 200, await enviarAvisos(admin, segredo));
        default: return json(req, 400, { erro: "Tarefa desconhecida." });
      }
    }

    // Douglas logado. O próprio banco decide o acesso (inclui o segundo fator).
    const autorizacao = req.headers.get("Authorization") || "";
    const usuario = createClient(SUPABASE_URL, CHAVE_PUBLICA, {
      global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false },
    });
    const { error: semAcesso } = await usuario.rpc("financeiro_vapid_publica");
    const { data: quem } = await usuario.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
    if (semAcesso || !quem?.user) return json(req, 403, { erro: "Sem acesso ao financeiro." });

    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === "teste") return json(req, 200, await testePush(admin, segredo, quem.user.id));
    if (corpo.acao === "sincronizar") return json(req, 200, await sincronizar(admin, segredo, "manual"));
    return json(req, 400, { erro: "Ação desconhecida." });
  } catch (e) {
    console.error(e);
    return json(req, 500, { erro: (e as Error).message });
  }
});

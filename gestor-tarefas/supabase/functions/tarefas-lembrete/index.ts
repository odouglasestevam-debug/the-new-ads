// Lembrete de prazo do gestor de tarefas, por push no aparelho de cada responsável.
// Duas entradas:
//  - pg_cron todo dia às 8h (header x-cron-secret igual ao segredo tarefas_cron do Vault): manda o resumo do dia
//  - usuário logado com {"acao":"teste"}: manda uma notificação de teste só para os aparelhos dele
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { endpointPermitido } from "./push-seguro.ts";

const ORIGENS = ["https://tarefas.thenewads.com.br", "http://localhost:8790"];
const APP = "https://tarefas.thenewads.com.br/";

function cors(req: Request) {
  const origem = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function resposta(req: Request, status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

type Inscricao = { endpoint: string; p256dh: string; auth: string };

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const segredo = async (nome: string) => (await admin.rpc("tarefas_ler_segredo", { p_nome: nome })).data as string;

  const [publica, privada] = await Promise.all([segredo("vapid_publica"), segredo("vapid_privada")]);
  webpush.setVapidDetails("mailto:odouglasestevam@gmail.com", publica, privada);

  // urgency high: com "normal" o Android adia a exibição até o app abrir.
  async function enviar(inscricoes: Inscricao[], carga: Record<string, string>) {
    let enviados = 0;
    const erros: string[] = [];
    for (const i of inscricoes) {
      if (!endpointPermitido(i.endpoint)) { erros.push("Serviço de notificação não permitido."); continue; }
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify(carga),
          { urgency: "high", TTL: 86400, timeout: 10000 },
        );
        enviados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.rpc("tarefas_apagar_push", { p_endpoint: i.endpoint });
        else erros.push(`${status || ""} ${(e as Error).message}`.trim());
      }
    }
    return { enviados, erros };
  }

  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    if (cron !== (await segredo("cron"))) return resposta(req, 401, { erro: "Segredo inválido." });
    const { data: pendentes, error } = await admin.rpc("tarefas_lembretes_pendentes");
    if (error) return resposta(req, 500, { erro: error.message });

    const resultado = [];
    for (const p of pendentes || []) {
      const partes = [];
      if (p.atrasadas) partes.push(plural(p.atrasadas, "atrasada", "atrasadas"));
      if (p.hoje) partes.push(plural(p.hoje, "vence hoje", "vencem hoje"));
      if (p.amanha) partes.push(plural(p.amanha, "vence amanhã", "vencem amanhã"));
      const titulo = p.atrasadas ? "Você tem tarefas em atraso" : "Tarefas do dia";
      const envio = await enviar(p.inscricoes || [], { titulo, corpo: partes.join(" · "), url: APP });
      if (envio.enviados > 0) {
        await admin.rpc("tarefas_registrar_lembrete", {
          p_user: p.user_id, p_resumo: { atrasadas: p.atrasadas, hoje: p.hoje, amanha: p.amanha },
        });
      }
      resultado.push({ user_id: p.user_id, ...envio });
    }
    return resposta(req, 200, { ok: true, usuarios: resultado.length, resultado });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return resposta(req, 401, { erro: "Sessão inválida." });
  const { data: nivel, error: erroNivel } = await admin.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (erroNivel || !nivel || (quem.user.factors?.some(f => f.status === "verified") && nivel.currentLevel !== "aal2")) {
    return resposta(req, 403, { erro: "Conclua a verificação em duas etapas." });
  }
  const { data: inscricoes } = await admin.rpc("tarefas_inscricoes_do_usuario", { p_user: quem.user.id });
  if (!inscricoes?.length) return resposta(req, 400, { erro: "Nenhum aparelho com notificação ativada." });
  const envio = await enviar(inscricoes, {
    titulo: "Notificação ativada",
    corpo: "Todo dia às 8h você recebe aqui o que está atrasado e o que vence.",
    url: APP,
  });
  return resposta(req, 200, { ok: true, ...envio });
});

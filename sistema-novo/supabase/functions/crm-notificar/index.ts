// Notificação no celular do atendente. Duas entradas:
//  - servidor (gatilho do banco ou pg_cron, com x-cron-secret): manda a fila de avisos pendentes
//  - pessoa logada com {"acao":"teste"}: manda uma notificação de teste só para os aparelhos dela
// As chaves VAPID e o segredo do cron ficam no Vault e nunca saem daqui.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ORIGENS = ["https://crm.thenewads.com.br", "http://localhost:8788"];
const APP = "https://crm.thenewads.com.br/";

function cors(req: Request) {
  const origem = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
const resposta = (req: Request, status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// Só serviços de push conhecidos; inscrição não pode apontar para endereço qualquer.
function endpointPermitido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !url.hash && endpoint.length <= 4096 &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9-]+\.push\.apple\.com)$/.test(url.hostname);
  } catch { return false; }
}

type Aparelho = { endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const segredo = async (nome: string) => (await admin.rpc("crm_ler_segredo", { p_nome: nome })).data as string;

  const [publica, privada] = await Promise.all([segredo("vapid_publica"), segredo("vapid_privada")]);
  if (!publica || !privada) return resposta(req, 500, { erro: "Chaves de notificação não configuradas." });
  webpush.setVapidDetails("mailto:odouglasestevam@gmail.com", publica, privada);

  // urgency high: com "normal" o Android segura a notificação até o app abrir.
  async function enviar(aparelhos: Aparelho[], carga: Record<string, string>) {
    let enviados = 0;
    const erros: string[] = [];
    for (const a of aparelhos) {
      if (!endpointPermitido(a.endpoint)) { erros.push("Serviço de notificação não permitido."); continue; }
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify(carga),
          { urgency: "high", TTL: 86400, timeout: 10000 },
        );
        enviados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        const morto = status === 404 || status === 410;
        await admin.rpc("crm_push_falhou", { p_endpoint: a.endpoint, p_remover: morto });
        if (!morto) erros.push(`${status || ""} ${(e as Error).message}`.trim());
      }
    }
    return { enviados, erros };
  }

  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    if (cron !== (await segredo("cron"))) return resposta(req, 401, { erro: "Segredo inválido." });
    const { data: avisos, error } = await admin.rpc("crm_avisos_pendentes");
    if (error) return resposta(req, 500, { erro: error.message });

    let mandados = 0;
    for (const a of (avisos || []) as Array<Record<string, any>>) {
      const envio = await enviar(a.aparelhos || [], { titulo: a.titulo, corpo: a.corpo, url: a.url || APP });
      // sem aparelho inscrito o aviso morre aqui: não adianta tentar de novo
      const semAparelho = !(a.aparelhos || []).length;
      await admin.rpc("crm_aviso_concluido", {
        p_id: a.id,
        p_enviados: semAparelho ? 1 : envio.enviados,
        p_erro: semAparelho ? "sem aparelho inscrito" : envio.erros.join(" | ") || null,
      });
      mandados += envio.enviados;
    }
    return resposta(req, 200, { ok: true, avisos: (avisos || []).length, enviados: mandados });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return resposta(req, 401, { erro: "Sessão inválida." });
  const { data: nivel } = await admin.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (quem.user.factors?.some((f) => f.status === "verified") && nivel?.currentLevel !== "aal2") {
    return resposta(req, 403, { erro: "Conclua a verificação em duas etapas." });
  }

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* corpo vazio vale como teste */ }
  if (b.acao !== "teste") return resposta(req, 400, { erro: "Ação desconhecida." });

  const { data: aparelhos } = await admin.rpc("crm_push_do_usuario", { p_user: quem.user.id });
  const lista = (aparelhos || []) as Aparelho[];
  if (!lista.length) return resposta(req, 400, { erro: "Nenhum aparelho com notificação ligada." });
  const envio = await enviar(lista, {
    titulo: "Notificação ligada",
    corpo: "É assim que você vai receber cada lead atribuído a você.",
    url: APP,
  });
  return resposta(req, 200, { ok: true, ...envio });
});

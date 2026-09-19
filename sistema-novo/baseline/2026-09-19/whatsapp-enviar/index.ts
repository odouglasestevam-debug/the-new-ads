// Envia mensagem de texto para o lead pelo WhatsApp da empresa: API oficial ou NeoGo.
// Confere a mesma permissão de edição de lead do banco; na oficial, também a janela de 24h da Meta.
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const ORIGENS = ["https://crm.thenewads.com.br", "http://localhost:8788"];
const JANELA_MS = 24 * 3600 * 1000;

function cors(req: Request) {
  const origem = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
const resposta = (req: Request, status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// NeoGo: sem janela de 24h. Token da instância no cabeçalho apikey, POST /send/text.
async function enviarNeoGo(req: Request, admin: any, conversa: any, mensagem: string, autorId: string) {
  const { data: integ } = await admin.from("integracoes").select("*")
    .eq("empresa_id", conversa.empresa_id).eq("tipo", "whatsapp_nao_oficial").maybeSingle();
  if (!integ || integ.status !== "ativa") return resposta(req, 400, { erro: "WhatsApp (NeoGo) não está ativo nesta empresa." });
  const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
  const s = (seg || {}) as Record<string, string>;
  if (!s.instance_token) return resposta(req, 400, { erro: "Falta o token da instância NeoGo." });

  const { data: registro, error: erroInsert } = await admin.from("mensagens").insert({
    empresa_id: conversa.empresa_id, conversa_id: conversa.id, direcao: "saida", tipo: "texto",
    texto: mensagem, status: "enviando", autor_id: autorId,
  }).select().single();
  if (erroInsert) return resposta(req, 500, { erro: erroInsert.message });

  let r: Response;
  try {
    r = await fetch(`${(integ.config as Record<string, string>).base_url}/send/text`, {
      method: "POST",
      headers: { apikey: s.instance_token, "Content-Type": "application/json" },
      body: JSON.stringify({ number: conversa.wa_id, text: mensagem }),
    });
  } catch (e) {
    await admin.from("mensagens").update({ status: "falhou", erro: "NeoGo fora do ar: " + String(e) }).eq("id", registro.id);
    return resposta(req, 502, { erro: "Não consegui falar com a NeoGo." });
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = d?.message || d?.error || `HTTP ${r.status}`;
    await admin.from("mensagens").update({ status: "falhou", erro: String(erro).slice(0, 500) }).eq("id", registro.id);
    return resposta(req, 502, { erro: "A NeoGo recusou o envio: " + erro });
  }

  // O ID pode vir em formatos diferentes conforme a versão; sem ele, o eco do webhook amarra depois.
  const waId = d?.id || d?.messageId || d?.message_id || d?.key?.id || d?.data?.id || d?.data?.Info?.ID || d?.data?.ID || null;
  const { data: enviada } = await admin.from("mensagens")
    .update({ status: "enviada", wa_message_id: waId }).eq("id", registro.id).select().single();
  await admin.from("conversas").update({ ultima_mensagem_em: new Date().toISOString(), ultima_previa: mensagem.slice(0, 140) })
    .eq("id", conversa.id);
  return resposta(req, 200, { ok: true, mensagem: enviada });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem?.user) return resposta(req, 401, { erro: "Sessão inválida." });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resposta(req, 400, { erro: "Corpo inválido." }); }
  const mensagem = String(b.texto || "").trim();
  if (!mensagem) return resposta(req, 400, { erro: "Escreva a mensagem." });
  if (mensagem.length > 4096) return resposta(req, 400, { erro: "Mensagem longa demais (máximo 4096 caracteres)." });

  const { data: conversa } = await admin.from("conversas").select("*, leads(responsavel_id)").eq("id", String(b.conversa_id || "")).maybeSingle();
  if (!conversa) return resposta(req, 404, { erro: "Conversa não encontrada." });

  const [{ data: agencia }, { data: membro }] = await Promise.all([
    admin.from("agencia_admins").select("user_id").eq("user_id", quem.user.id).maybeSingle(),
    admin.from("membros").select("papel").eq("empresa_id", conversa.empresa_id).eq("user_id", quem.user.id).maybeSingle(),
  ]);
  const responsavel = (conversa as any).leads?.responsavel_id;
  const pode = !!agencia || ["dono", "gestor"].includes(membro?.papel) ||
    (membro?.papel === "vendedor" && responsavel === quem.user.id);
  if (!pode) return resposta(req, 403, { erro: "Você não pode responder este lead." });

  if (conversa.canal === "whatsapp_nao_oficial") return await enviarNeoGo(req, admin, conversa, mensagem, quem.user.id);
  if (conversa.canal !== "whatsapp_oficial") return resposta(req, 400, { erro: "Canal ainda não suportado para envio." });
  if (!conversa.ultima_entrada_em || Date.now() - new Date(conversa.ultima_entrada_em).getTime() > JANELA_MS) {
    return resposta(req, 422, {
      erro: "Passaram 24h desde a última mensagem do lead. Pela regra da Meta, só dá para retomar com um modelo aprovado.",
      codigo: "fora_da_janela",
    });
  }

  const { data: integ } = await admin.from("integracoes").select("*")
    .eq("empresa_id", conversa.empresa_id).eq("tipo", "whatsapp_oficial").maybeSingle();
  if (!integ || integ.status !== "ativa") return resposta(req, 400, { erro: "WhatsApp oficial não está ativo nesta empresa." });
  const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
  const s = (seg || {}) as Record<string, string>;
  if (!s.token) return resposta(req, 400, { erro: "Falta o token da integração." });

  const { data: registro, error: erroInsert } = await admin.from("mensagens").insert({
    empresa_id: conversa.empresa_id, conversa_id: conversa.id, direcao: "saida", tipo: "texto",
    texto: mensagem, status: "enviando", autor_id: quem.user.id,
  }).select().single();
  if (erroInsert) return resposta(req, 500, { erro: erroInsert.message });

  // Celular brasileiro chega ora com o 9, ora sem. Se a Meta recusar o formato que veio
  // no webhook, tenta o outro antes de desistir e guarda o que funcionou.
  const alternativo = (n: string) =>
    /^55\d{2}9\d{8}$/.test(n) ? n.slice(0, 4) + n.slice(5)
    : /^55\d{2}[6-9]\d{7}$/.test(n) ? n.slice(0, 4) + "9" + n.slice(4)
    : null;
  const formatos = [conversa.wa_id, alternativo(conversa.wa_id)].filter(Boolean) as string[];
  const RECUSA_DE_NUMERO = ["131030", "131026", "131009"];

  let r!: Response, d: any = {}, usado = conversa.wa_id;
  for (const numero of formatos) {
    r = await fetch(`${GRAPH}/${(integ.config as Record<string, string>).phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "text", text: { body: mensagem, preview_url: true } }),
    });
    d = await r.json().catch(() => ({}));
    usado = numero;
    if (r.ok && d?.messages?.[0]?.id) break;
    if (!RECUSA_DE_NUMERO.includes(String(d?.error?.code ?? ""))) break;
  }
  if (r.ok && d?.messages?.[0]?.id && usado !== conversa.wa_id) {
    await admin.from("conversas").update({ wa_id: usado }).eq("id", conversa.id);
  }

  if (!r.ok || !d?.messages?.[0]?.id) {
    const bruto = d?.error?.error_user_msg || d?.error?.message || `HTTP ${r.status}`;
    // Erros que a pessoa consegue resolver sozinha, ditos em português.
    const CLAROS: Record<string, string> = {
      "131030": "Esse número não está na lista de permitidos do número de teste da Meta. Em WhatsApp, Configuração da API, abra o campo Para, clique em Gerenciar lista de números de telefone e cadastre o número. Isso some quando o número de produção entrar.",
      "131047": "Passaram 24h desde a última mensagem do cliente. Só dá para retomar com um modelo aprovado pela Meta.",
      "131026": "Esse número não tem WhatsApp, ou não consegue receber mensagem.",
      "190": "O token da integração expirou. Gere um novo token permanente e salve em Ajustes, Integrações.",
      "10": "Esse token não tem permissão para enviar por este número. Confira se o usuário do sistema tem acesso à conta do WhatsApp.",
    };
    const codigo = String(d?.error?.code ?? "");
    const erro = CLAROS[codigo] || bruto;
    await admin.from("mensagens").update({ status: "falhou", erro }).eq("id", registro.id);
    return resposta(req, 502, { erro: "A Meta recusou o envio: " + erro });
  }

  const { data: enviada } = await admin.from("mensagens")
    .update({ status: "enviada", wa_message_id: d.messages[0].id }).eq("id", registro.id).select().single();
  await admin.from("conversas").update({ ultima_mensagem_em: new Date().toISOString(), ultima_previa: mensagem.slice(0, 140) })
    .eq("id", conversa.id);
  return resposta(req, 200, { ok: true, mensagem: enviada });
});


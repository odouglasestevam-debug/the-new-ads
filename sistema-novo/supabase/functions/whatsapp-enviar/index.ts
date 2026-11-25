import {jsonLimitado,headersSeguros} from '../_shared/security.ts';
// Envia mensagem de texto para o lead pelo WhatsApp da empresa: API oficial ou NeoGo.
// Confere a mesma permissão de edição de lead do banco; o envio em si (janela de 24h da Meta,
// formato do número, idempotência) fica em _shared/enviar-texto.ts, que a mensagem agendada também usa.
import { createClient } from "npm:@supabase/supabase-js@2";
import { temMfaPendente, UUID, checarLimiteCRM } from "../_shared/security.ts";
import { enviarTextoWhatsApp, repetirEnvioTexto, podeResponderLead } from "../_shared/enviar-texto.ts";

const ORIGENS = ["https://crm.thenewads.com.br", "http://localhost:8788"];

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
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), ...headersSeguros(status), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem?.user) return resposta(req, 401, { erro: "Sessão inválida." });
  if (temMfaPendente(quem.user, token)) return resposta(req, 403, { erro: 'Conclua a autenticação em duas etapas antes de enviar.' });

  let b: Record<string, unknown>;
  try { b = await jsonLimitado(req); } catch (e) { return resposta(req, (e as any).status||400, { erro: "Corpo inválido ou acima do limite." }); }
  const mensagem = String(b.texto || "").trim();
  if (!mensagem) return resposta(req, 400, { erro: "Escreva a mensagem." });
  if (mensagem.length > 4096) return resposta(req, 400, { erro: "Mensagem longa demais (máximo 4096 caracteres)." });
  const mensagemId = b.mensagem_id ? String(b.mensagem_id) : crypto.randomUUID();
  if (!UUID.test(mensagemId)) return resposta(req, 400, { erro:'Identificador de envio inválido.' });
  const responderId = b.responder_id ? String(b.responder_id) : null;
  if (responderId && !UUID.test(responderId)) return resposta(req,400,{erro:'Mensagem citada inválida.'});

  const { data: conversa } = await admin.from("conversas").select("*, leads(responsavel_id)").eq("id", String(b.conversa_id || "")).maybeSingle();
  if (!conversa) return resposta(req, 404, { erro: "Conversa não encontrada." });
  if (!(await podeResponderLead(admin, quem.user.id, conversa))) return resposta(req, 403, { erro: "Você não pode responder este lead." });
  const { data: empresa } = await admin.from('empresas').select('ativo').eq('id',conversa.empresa_id).maybeSingle();
  if (!empresa?.ativo) return resposta(req,403,{erro:'Esta empresa está inativa.'});
  const { data: existente } = await admin.from('mensagens').select('*').eq('id',mensagemId).maybeSingle();
  if (existente) {
    const repetido = await repetirEnvioTexto(admin,conversa,mensagemId,quem.user.id,mensagem,responderId);
    return resposta(req, repetido.status, repetido.corpo);
  }
  const limite=await checarLimiteCRM(admin,quem.user.id,'envio');
  if(limite)return resposta(req,limite.status,{erro:limite.erro});

  const envio = await enviarTextoWhatsApp(admin, conversa, mensagem, quem.user.id, mensagemId, responderId);
  return resposta(req, envio.status, envio.corpo);
});

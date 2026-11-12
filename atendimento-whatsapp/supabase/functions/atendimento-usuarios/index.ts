// Cadastro de quem acessa o monitor de atendimento. Precisa da service_role (criar conta no Auth),
// por isso roda no servidor. Só quem tem papel "admin" no monitor chama.
// Conta que já existe no Auth (gestor de tarefas, CRM) só ganha o acesso, sem trocar a senha dela.
// Tirar o acesso é pela função do banco atendimento_usuario_remover (não apaga a conta de login).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const ORIGENS = ["https://atendimento.thenewads.com.br", "http://localhost:8788"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(req: Request) {
  const origem = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function resposta(req: Request, status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return resposta(req, 401, { erro: "Sessão inválida. Entre de novo." });
  const { data: nivel, error: erroNivel } = await admin.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (erroNivel || !nivel || (quem.user.factors?.some((f) => f.status === "verified") && nivel.currentLevel !== "aal2")) {
    return resposta(req, 403, { erro: "Conclua a verificação em duas etapas." });
  }
  const { data: ehAdmin } = await admin.rpc("atendimento_eh_admin", { p_user: quem.user.id });
  if (ehAdmin !== true) return resposta(req, 403, { erro: "Só o administrador cadastra acessos." });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return resposta(req, 400, { erro: "Corpo inválido." }); }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return resposta(req, 400, { erro: "Corpo inválido." });
  if (corpo.acao !== "salvar") return resposta(req, 400, { erro: "Ação desconhecida." });

  const email = String(corpo.email || "").trim().toLowerCase();
  const nome = String(corpo.nome || "").trim();
  const senha = String(corpo.senha || "");
  const papel = String(corpo.papel || "");
  const rede = corpo.rede_id ? String(corpo.rede_id) : null;
  const contas = Array.isArray(corpo.contas) ? corpo.contas.map(String) : [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return resposta(req, 400, { erro: "E-mail inválido." });
  if (!nome || nome.length > 200) return resposta(req, 400, { erro: "Informe um nome de até 200 caracteres." });
  if (!["admin", "rede", "unidade"].includes(papel)) return resposta(req, 400, { erro: "Escolha o tipo de acesso." });
  if (papel === "rede" && (!rede || !UUID.test(rede))) return resposta(req, 400, { erro: "Escolha a rede." });
  if (papel === "unidade" && (!contas.length || contas.length > 50 || !contas.every((c) => UUID.test(c)))) {
    return resposta(req, 400, { erro: "Marque pelo menos uma unidade." });
  }

  const { data: existente, error: erroBusca } = await admin.rpc("usuario_id_por_email", { p_email: email });
  if (erroBusca) return resposta(req, 503, { erro: "Não foi possível verificar a conta existente. Tente de novo." });
  let userId = existente as string | null;
  let contaNova = false;
  if (userId === quem.user.id) return resposta(req, 400, { erro: "Não dá pra mudar o próprio acesso por aqui." });
  if (!userId) {
    if (senha.length < 8) return resposta(req, 400, { erro: "A senha inicial precisa ter pelo menos 8 caracteres." });
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error || !data?.user) return resposta(req, 400, { erro: "Não deu pra criar a conta: " + (error?.message || "") });
    userId = data.user.id;
    contaNova = true;
  }

  const { error } = await admin.rpc("atendimento_cadastrar_usuario", {
    p_user: userId, p_nome: nome, p_email: email, p_papel: papel,
    p_rede: papel === "rede" ? rede : null, p_contas: papel === "unidade" ? contas : null,
  });
  if (error) return resposta(req, 400, { erro: "Não deu pra liberar o acesso: " + error.message });
  return resposta(req, 200, { ok: true, conta_nova: contaNova });
});

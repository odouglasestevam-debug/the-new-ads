// Cadastro de usuários do gestor de tarefas.
// Precisa da service_role (criar conta no Auth), por isso roda no servidor. Só admin do gestor chama.
// Conta que já existe no Auth (ex: usuário do CRM) é só liberada no gestor, sem trocar a senha dela.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGENS = ["https://tarefas.thenewads.com.br", "http://localhost:8790"];

function cors(req: Request) {
  const origem = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return resposta(req, 401, { erro: "Sessão inválida." });
  const { data: nivel, error: erroNivel } = await admin.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (erroNivel || !nivel || (quem.user.factors?.some(f => f.status === "verified") && nivel.currentLevel !== "aal2")) {
    return resposta(req, 403, { erro: "Conclua a verificação em duas etapas." });
  }

  const { data: ehAdmin } = await admin.rpc("tarefas_eh_admin", { p_user: quem.user.id });
  if (!ehAdmin) return resposta(req, 403, { erro: "Só admin do gestor cadastra usuários." });

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return resposta(req, 400, { erro: "Corpo inválido." });
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return resposta(req, 400, { erro: "Corpo inválido." });

  if (corpo.acao === "adicionar") {
    const email = String(corpo.email || "").trim().toLowerCase();
    const nome = String(corpo.nome || "").trim();
    const senha = String(corpo.senha || "");
    const ehNovoAdmin = corpo.admin === true;
    const permissoes = corpo.permissoes as Record<string, unknown> | undefined;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!permissoes || typeof permissoes.acesso_total !== "boolean" ||
        !["espacos", "pastas", "listas"].every(k => Array.isArray(permissoes[k]) &&
          (permissoes[k] as unknown[]).length <= 10000 && (permissoes[k] as unknown[]).every(v => typeof v === "string" && uuid.test(v)))) {
      return resposta(req, 400, { erro: "Defina os espaços, pastas e listas permitidos para este membro." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta(req, 400, { erro: "E-mail inválido." });
    if (!nome || nome.length > 200) return resposta(req, 400, { erro: "Informe um nome de até 200 caracteres." });

    const { data: usuarioExistente, error: erroBusca } = await admin.rpc("usuario_id_por_email", { p_email: email });
    if (erroBusca) return resposta(req, 503, { erro: "Não foi possível verificar a conta existente. Tente novamente." });
    let userId = usuarioExistente as string | null;
    let contaNova = false;
    if (!userId) {
      if (senha.length < 8) return resposta(req, 400, { erro: "A senha inicial precisa ter pelo menos 8 caracteres." });
      const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (error || !data?.user) return resposta(req, 400, { erro: "Não deu pra criar a conta: " + (error?.message || "") });
      userId = data.user.id;
      contaNova = true;
    }

    const { error } = await admin.rpc("tarefas_cadastrar_membro", {
      p_user: userId, p_nome: nome, p_email: email, p_admin: ehNovoAdmin,
      p_total: permissoes.acesso_total, p_espacos: permissoes.espacos,
      p_pastas: permissoes.pastas, p_listas: permissoes.listas,
    });
    if (error) return resposta(req, 400, { erro: "Não deu pra liberar o acesso: " + error.message });
    return resposta(req, 200, { ok: true, conta_nova: contaNova });
  }

  return resposta(req, 400, { erro: "Ação desconhecida." });
});

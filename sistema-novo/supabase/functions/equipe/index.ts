// Convites e links de acesso da equipe de uma empresa.
// Precisa da service_role (criar usuário e gerar link), por isso roda no servidor.
// Quem chama: agência ou dono da empresa, conferido aqui antes de qualquer ação.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGENS = ["https://crm.thenewads.com.br", "http://localhost:8788"];
const DESTINO = "https://crm.thenewads.com.br/";
const PAPEIS = ["dono", "gestor", "vendedor", "leitura"];

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
  const eu = quem.user.id;

  let corpo: Record<string, string>;
  try {
    corpo = await req.json();
  } catch {
    return resposta(req, 400, { erro: "Corpo inválido." });
  }
  const { acao, empresa_id } = corpo;
  if (!empresa_id) return resposta(req, 400, { erro: "Empresa não informada." });

  const [{ data: agencia }, { data: meuPapel }] = await Promise.all([
    admin.from("agencia_admins").select("user_id").eq("user_id", eu).maybeSingle(),
    admin.from("membros").select("papel").eq("empresa_id", empresa_id).eq("user_id", eu).maybeSingle(),
  ]);
  if (!agencia && meuPapel?.papel !== "dono") {
    return resposta(req, 403, { erro: "Só a agência ou o dono da empresa gerenciam a equipe." });
  }

  if (acao === "convidar") {
    const email = String(corpo.email || "").trim().toLowerCase();
    const papel = String(corpo.papel || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta(req, 400, { erro: "E-mail inválido." });
    if (!PAPEIS.includes(papel)) return resposta(req, 400, { erro: "Nível de acesso inválido." });

    const { data: existente } = await admin.rpc("usuario_id_por_email", { p_email: email });
    let userId = existente as string | null;
    let link: string | null = null;

    if (!userId) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: DESTINO },
      });
      if (error) return resposta(req, 500, { erro: "Não deu pra criar o convite: " + error.message });
      userId = data.user.id;
      link = data.properties.action_link;
    }

    const { error: erroMembro } = await admin
      .from("membros")
      .upsert({ empresa_id, user_id: userId, papel }, { onConflict: "empresa_id,user_id" });
    if (erroMembro) return resposta(req, 500, { erro: "Não deu pra adicionar à equipe: " + erroMembro.message });

    return resposta(req, 200, { ok: true, novo: !existente, link });
  }

  if (acao === "link_acesso") {
    const alvo = String(corpo.user_id || "");
    const { data: membro } = await admin
      .from("membros").select("user_id").eq("empresa_id", empresa_id).eq("user_id", alvo).maybeSingle();
    if (!membro) return resposta(req, 404, { erro: "Essa pessoa não é da equipe desta empresa." });

    const { data: usuario } = await admin.auth.admin.getUserById(alvo);
    if (!usuario?.user?.email) return resposta(req, 404, { erro: "Usuário não encontrado." });

    // Link de definir senha: serve para quem não aceitou o convite e para quem esqueceu a senha.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: usuario.user.email,
      options: { redirectTo: DESTINO },
    });
    if (error) return resposta(req, 500, { erro: "Não deu pra gerar o link: " + error.message });
    return resposta(req, 200, { ok: true, link: data.properties.action_link });
  }

  return resposta(req, 400, { erro: "Ação desconhecida." });
});

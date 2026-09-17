// Credenciais de integração por empresa (WhatsApp API oficial).
// Segredos ficam no Vault e nunca voltam para o navegador; a tela só sabe se estão preenchidos.
// Quem chama: agência ou dono da empresa.
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
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
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

function aleatorio(bytes = 24) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return resposta(req, 405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem?.user) return resposta(req, 401, { erro: "Sessão inválida." });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resposta(req, 400, { erro: "Corpo inválido." }); }
  const empresaId = String(b.empresa_id || "");
  if (!empresaId) return resposta(req, 400, { erro: "Empresa não informada." });

  const [{ data: agencia }, { data: membro }] = await Promise.all([
    admin.from("agencia_admins").select("user_id").eq("user_id", quem.user.id).maybeSingle(),
    admin.from("membros").select("papel").eq("empresa_id", empresaId).eq("user_id", quem.user.id).maybeSingle(),
  ]);
  if (!agencia && membro?.papel !== "dono") {
    return resposta(req, 403, { erro: "Só a agência ou o dono da empresa configuram integrações." });
  }

  const { data: atual } = await admin.from("integracoes").select("*")
    .eq("empresa_id", empresaId).eq("tipo", "whatsapp_oficial").maybeSingle();

  async function estado(integ: Record<string, unknown> | null) {
    if (!integ) return { existe: false };
    const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
    const s = (seg || {}) as Record<string, string>;
    return {
      existe: true,
      status: integ.status,
      config: integ.config,
      token_salvo: !!s.token,
      app_secret_salvo: !!s.app_secret,
      verify_token: s.verify_token || null,
      webhook_url: `${url}/functions/v1/whatsapp-webhook?i=${integ.id}`,
    };
  }

  if (b.acao === "ver") return resposta(req, 200, await estado(atual));

  if (b.acao === "salvar") {
    const phoneNumberId = String(b.phone_number_id || "").trim();
    const wabaId = String(b.waba_id || "").trim();
    if (!/^\d{5,25}$/.test(phoneNumberId)) return resposta(req, 400, { erro: "Phone Number ID precisa ser só números." });
    if (wabaId && !/^\d{5,25}$/.test(wabaId)) return resposta(req, 400, { erro: "WABA ID precisa ser só números." });

    const config = { ...((atual?.config as Record<string, unknown>) || {}), phone_number_id: phoneNumberId, waba_id: wabaId || null };
    let integ = atual;
    if (integ) {
      const { data, error } = await admin.from("integracoes").update({ config, status: "pendente" }).eq("id", integ.id).select().single();
      if (error) return resposta(req, 400, { erro: error.code === "23505" ? "Esse número já está ligado a outra empresa." : error.message });
      integ = data;
    } else {
      const { data, error } = await admin.from("integracoes")
        .insert({ empresa_id: empresaId, tipo: "whatsapp_oficial", config, status: "pendente" }).select().single();
      if (error) return resposta(req, 400, { erro: error.code === "23505" ? "Esse número já está ligado a outra empresa." : error.message });
      integ = data;
    }

    const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ!.id });
    const novos: Record<string, string | null> = {
      token: String(b.token || "").trim() || null,
      app_secret: String(b.app_secret || "").trim() || null,
      verify_token: (seg as Record<string, string>)?.verify_token ? null : aleatorio(),
    };
    const { error: erroSeg } = await admin.rpc("integracao_salvar_segredos", { p_integracao: integ!.id, p_segredos: novos });
    if (erroSeg) return resposta(req, 500, { erro: "Não deu pra guardar as credenciais: " + erroSeg.message });

    const { data: recarregada } = await admin.from("integracoes").select("*").eq("id", integ!.id).single();
    return resposta(req, 200, await estado(recarregada));
  }

  if (b.acao === "testar") {
    if (!atual) return resposta(req, 400, { erro: "Salve as credenciais primeiro." });
    const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: atual.id });
    const s = (seg || {}) as Record<string, string>;
    const cfg = atual.config as Record<string, string>;
    if (!s.token) return resposta(req, 400, { erro: "Falta o token." });

    const r = await fetch(`${GRAPH}/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      await admin.from("integracoes").update({ status: "erro" }).eq("id", atual.id);
      const msg = d?.error?.error_user_msg || d?.error?.message || `HTTP ${r.status}`;
      return resposta(req, 200, { ok: false, erro: "A Meta recusou: " + msg, estado: await estado({ ...atual, status: "erro" }) });
    }
    const config = { ...cfg, numero_exibido: d.display_phone_number, nome_verificado: d.verified_name, qualidade: d.quality_rating };
    const { data: ok } = await admin.from("integracoes").update({ status: "ativa", config }).eq("id", atual.id).select().single();
    return resposta(req, 200, { ok: true, estado: await estado(ok) });
  }

  if (b.acao === "desligar") {
    if (atual) await admin.from("integracoes").delete().eq("id", atual.id);
    return resposta(req, 200, { existe: false });
  }

  return resposta(req, 400, { erro: "Ação desconhecida." });
});

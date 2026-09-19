// Credenciais de integração por empresa: WhatsApp API oficial, NeoGo (não oficial) e Meta (nomes de anúncio).
// Segredos ficam no Vault e nunca voltam para o navegador; a tela só sabe se estão preenchidos.
// Quem chama: agência ou dono da empresa.
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const ORIGENS = ["https://crm.thenewads.com.br", "http://localhost:8788"];
const TIPOS = ["whatsapp_oficial", "whatsapp_nao_oficial", "meta"];

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
const limpo = (v: unknown) => String(v ?? "").trim();
const erroMeta = (d: any, status: number) => d?.error?.error_user_msg || d?.error?.message || `HTTP ${status}`;

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
  const empresaId = limpo(b.empresa_id);
  if (!empresaId) return resposta(req, 400, { erro: "Empresa não informada." });

  const [{ data: agencia }, { data: membro }] = await Promise.all([
    admin.from("agencia_admins").select("user_id").eq("user_id", quem.user.id).maybeSingle(),
    admin.from("membros").select("papel").eq("empresa_id", empresaId).eq("user_id", quem.user.id).maybeSingle(),
  ]);
  if (!agencia && membro?.papel !== "dono") {
    return resposta(req, 403, { erro: "Só a agência ou o dono da empresa configuram integrações." });
  }

  const tipo = limpo(b.tipo) || "whatsapp_oficial";
  if (b.acao !== "ver" && !TIPOS.includes(tipo)) return resposta(req, 400, { erro: "Tipo de integração inválido." });

  const buscar = async (t: string) =>
    (await admin.from("integracoes").select("*").eq("empresa_id", empresaId).eq("tipo", t).maybeSingle()).data;
  const segredos = async (id: string) =>
    ((await admin.rpc("integracao_ler_segredos", { p_integracao: id })).data || {}) as Record<string, string>;

  async function estado(integ: Record<string, any> | null) {
    if (!integ) return { existe: false };
    const s = await segredos(integ.id);
    const base = { existe: true, status: integ.status, config: integ.config };
    if (integ.tipo === "whatsapp_oficial") {
      return { ...base, token_salvo: !!s.token, app_secret_salvo: !!s.app_secret, verify_token: s.verify_token || null,
        webhook_url: `${url}/functions/v1/whatsapp-webhook?i=${integ.id}` };
    }
    if (integ.tipo === "whatsapp_nao_oficial") {
      return { ...base, token_salvo: !!s.instance_token, webhook_secret: s.webhook_secret || null,
        webhook_url: `${url}/functions/v1/neogo-webhook?i=${integ.id}&t=${s.url_token}` };
    }
    return { ...base, token_salvo: !!s.token };
  }

  // grava config e segredos (campo vazio mantém o anterior)
  async function gravar(config: Record<string, unknown>, novos: Record<string, string | null>) {
    let integ = await buscar(tipo);
    const cfg = { ...(integ?.config || {}), ...config };
    const res = integ
      ? await admin.from("integracoes").update({ config: cfg, status: "pendente" }).eq("id", integ.id).select().single()
      : await admin.from("integracoes").insert({ empresa_id: empresaId, tipo, config: cfg, status: "pendente" }).select().single();
    if (res.error) {
      throw new Error(res.error.code === "23505" ? "Esse número ou instância já está ligado a outra empresa." : res.error.message);
    }
    integ = res.data;
    const { error } = await admin.rpc("integracao_salvar_segredos", { p_integracao: integ.id, p_segredos: novos });
    if (error) throw new Error("Não deu pra guardar as credenciais: " + error.message);
    return integ;
  }

  async function marcar(integ: Record<string, any>, status: string, extra: Record<string, unknown> = {}) {
    const { data } = await admin.from("integracoes").update({ status, config: { ...integ.config, ...extra } })
      .eq("id", integ.id).select().single();
    return data;
  }

  try {
    if (b.acao === "ver") {
      const [oficial, neogo, meta] = await Promise.all(TIPOS.map(buscar));
      return resposta(req, 200, {
        whatsapp_oficial: await estado(oficial), whatsapp_nao_oficial: await estado(neogo), meta: await estado(meta),
      });
    }

    if (b.acao === "desligar") {
      const integ = await buscar(tipo);
      if (integ) await admin.from("integracoes").delete().eq("id", integ.id);
      return resposta(req, 200, { existe: false });
    }

    if (b.acao === "salvar") {
      if (tipo === "whatsapp_oficial") {
        const phoneNumberId = limpo(b.phone_number_id), wabaId = limpo(b.waba_id);
        if (!/^\d{5,25}$/.test(phoneNumberId)) return resposta(req, 400, { erro: "Phone Number ID precisa ser só números." });
        if (wabaId && !/^\d{5,25}$/.test(wabaId)) return resposta(req, 400, { erro: "WABA ID precisa ser só números." });
        const atual = await buscar(tipo);
        const s = atual ? await segredos(atual.id) : {};
        const integ = await gravar({ phone_number_id: phoneNumberId, waba_id: wabaId || null }, {
          token: limpo(b.token) || null, app_secret: limpo(b.app_secret) || null, verify_token: s.verify_token ? null : aleatorio(),
        });
        return resposta(req, 200, await estado(integ));
      }

      if (tipo === "whatsapp_nao_oficial") {
        const baseUrl = limpo(b.base_url).replace(/\/+$/, "");
        const instanceId = limpo(b.instance_id);
        if (!/^https:\/\/[^\s/]+/.test(baseUrl)) return resposta(req, 400, { erro: "A URL da NeoGo precisa começar com https://" });
        if (!/^[\w-]{3,80}$/.test(instanceId)) return resposta(req, 400, { erro: "ID da instância inválido." });
        const atual = await buscar(tipo);
        const s = atual ? await segredos(atual.id) : {};
        const integ = await gravar({ base_url: baseUrl, instance_id: instanceId }, {
          instance_token: limpo(b.instance_token) || null,
          url_token: s.url_token ? null : aleatorio(),
          webhook_secret: s.webhook_secret ? null : aleatorio(),
        });
        return resposta(req, 200, await estado(integ));
      }

      const adAccount = limpo(b.ad_account_id).replace(/^act_/, "");
      if (adAccount && !/^\d{5,25}$/.test(adAccount)) return resposta(req, 400, { erro: "Conta de anúncios precisa ser só números." });
      const integ = await gravar({ ad_account_id: adAccount || null }, { token: limpo(b.token) || null });
      return resposta(req, 200, await estado(integ));
    }

    if (b.acao === "testar") {
      const integ = await buscar(tipo);
      if (!integ) return resposta(req, 400, { erro: "Salve as credenciais primeiro." });
      const s = await segredos(integ.id);
      const cfg = integ.config as Record<string, string>;

      if (tipo === "whatsapp_oficial") {
        if (!s.token) return resposta(req, 400, { erro: "Falta o token." });
        const r = await fetch(`${GRAPH}/${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`, {
          headers: { Authorization: `Bearer ${s.token}` },
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return resposta(req, 200, { ok: false, erro: "A Meta recusou: " + erroMeta(d, r.status), estado: await estado(await marcar(integ, "erro")) });

        // O número responder só prova que dá para enviar. Receber depende deste app estar
        // inscrito no webhook da conta, e isso a Meta sabe dizer.
        let inscrito: boolean | null = null;
        try {
          const [rToken, rApps] = await Promise.all([
            fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(s.token)}&access_token=${encodeURIComponent(s.token)}`),
            fetch(`${GRAPH}/${cfg.waba_id}/subscribed_apps`, { headers: { Authorization: `Bearer ${s.token}` } }),
          ]);
          const dToken = await rToken.json().catch(() => ({}));
          const dApps = await rApps.json().catch(() => ({}));
          const meuApp = dToken?.data?.app_id ? String(dToken.data.app_id) : null;
          if (rApps.ok && Array.isArray(dApps.data) && meuApp) {
            inscrito = dApps.data.some((x: any) => String(x?.whatsapp_business_api_data?.id || "") === meuApp);
          }
        } catch (e) { console.error("subscribed_apps", String(e)); }

        const ok = await marcar(integ, "ativa", {
          numero_exibido: d.display_phone_number, nome_verificado: d.verified_name,
          qualidade: d.quality_rating, webhook_inscrito: inscrito,
        });
        const aviso = inscrito === true
          ? `Conectado como ${d.display_phone_number}. O webhook está inscrito, as mensagens chegam em Conversas.`
          : inscrito === false
            ? `Conectado como ${d.display_phone_number}, mas este app ainda não está inscrito no webhook da conta. Enquanto isso, o CRM envia mas não recebe. Configure o webhook na Meta e marque o campo messages.`
            : `Conectado como ${d.display_phone_number}. Não consegui conferir o webhook com este token: confirme na Meta que o webhook aponta para o CRM e que o campo messages está marcado.`;
        return resposta(req, 200, { ok: true, parcial: inscrito !== true, aviso, estado: await estado(ok) });
      }

      if (tipo === "whatsapp_nao_oficial") {
        if (!s.instance_token) return resposta(req, 400, { erro: "Falta o token da instância." });
        // O token da instância só autentica rotas de envio e de chat. Tenta a consulta da instância;
        // se a NeoGo exigir a Global Key, a conexão é confirmada pelo primeiro envio ou mensagem recebida.
        const r = await fetch(`${cfg.base_url}/instance/info/${encodeURIComponent(cfg.instance_id)}`, { headers: { apikey: s.instance_token } })
          .catch((e) => ({ ok: false, status: 0, json: async () => ({ message: String(e) }) } as unknown as Response));
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          const info = (d as any)?.data || d;
          const ok = await marcar(integ, "ativa", { numero_exibido: info?.phone || info?.number || info?.jid || null, nome_instancia: info?.name || null });
          return resposta(req, 200, { ok: true, estado: await estado(ok) });
        }
        if (r.status === 0) return resposta(req, 200, { ok: false, erro: "Não consegui alcançar a NeoGo nesse endereço: " + ((d as any)?.message || ""), estado: await estado(await marcar(integ, "erro")) });
        // servidor respondeu: endereço certo, mas essa rota pede Global Key. Liga e deixa o envio confirmar.
        const ok = await marcar(integ, "ativa", { teste_parcial: true });
        return resposta(req, 200, { ok: true, parcial: true, aviso: `A NeoGo respondeu (HTTP ${r.status}), mas o token da instância não consulta dados da instância. Integração ligada: o envio de uma mensagem confirma o token.`, estado: await estado(ok) });
      }

      if (!s.token) return resposta(req, 400, { erro: "Falta o token." });
      const alvo = cfg.ad_account_id ? `act_${cfg.ad_account_id}?fields=name,account_status` : "me?fields=id,name";
      const r = await fetch(`${GRAPH}/${alvo}`, { headers: { Authorization: `Bearer ${s.token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return resposta(req, 200, { ok: false, erro: "A Meta recusou: " + erroMeta(d, r.status), estado: await estado(await marcar(integ, "erro")) });
      const ok = await marcar(integ, "ativa", { nome_conta: d.name || null });
      return resposta(req, 200, { ok: true, estado: await estado(ok) });
    }

    // Lista os números de uma conta do WhatsApp. Evita caçar o Phone Number ID no painel da Meta,
    // que muda de lugar a cada reforma. Aceita um WABA ainda não salvo para poder trocar de conta.
    if (b.acao === "numeros" && tipo === "whatsapp_oficial") {
      const integ = await buscar(tipo);
      if (!integ) return resposta(req, 400, { erro: "Salve o token primeiro." });
      const s = await segredos(integ.id);
      if (!s.token) return resposta(req, 400, { erro: "Falta o token." });
      const waba = limpo(b.waba_id) || (integ.config as Record<string, string>).waba_id;
      if (!/^\d{5,25}$/.test(waba || "")) return resposta(req, 400, { erro: "Informe o ID da conta do WhatsApp (WABA)." });

      const r = await fetch(`${GRAPH}/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = erroMeta(d, r.status);
        return resposta(req, 400, {
          erro: String(d?.error?.code) === "200" || String(d?.error?.code) === "10"
            ? `Este token não alcança a conta ${waba}. Adicione essa conta do WhatsApp aos ativos do usuário do sistema e gere o token de novo. (${msg})`
            : "A Meta recusou: " + msg,
        });
      }
      const numeros = (d?.data || []).map((n: any) => ({
        id: n.id, numero: n.display_phone_number, nome: n.verified_name, qualidade: n.quality_rating,
      }));
      return resposta(req, 200, { ok: true, waba_id: waba, numeros });
    }

    // Assina o webhook do app na Meta sem a pessoa procurar telas escondidas.
    // Faz o que "Configuração > Webhook" e "Gerenciar > messages" fazem na mão, mais a
    // inscrição do app na conta. Recusa se o app já aponta para outro sistema.
    if (b.acao === "registrar_webhook" && tipo === "whatsapp_oficial") {
      const integ = await buscar(tipo);
      if (!integ) return resposta(req, 400, { erro: "Salve as credenciais primeiro." });
      const s = await segredos(integ.id);
      const cfg = integ.config as Record<string, string>;
      if (!s.token || !s.app_secret) return resposta(req, 400, { erro: "Preciso do token e do App Secret salvos." });
      if (!cfg.waba_id) return resposta(req, 400, { erro: "Preencha o WhatsApp Business Account ID." });

      const rToken = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(s.token)}&access_token=${encodeURIComponent(s.token)}`);
      const dToken = await rToken.json().catch(() => ({}));
      const appId = dToken?.data?.app_id ? String(dToken.data.app_id) : null;
      if (!appId) return resposta(req, 400, { erro: "Não consegui descobrir o app deste token: " + erroMeta(dToken, rToken.status) });

      const tokenApp = `${appId}|${s.app_secret}`;
      const nosso = `${url}/functions/v1/whatsapp-webhook?i=${integ.id}`;

      // O endereço do webhook é do app inteiro: sobrescrever derruba quem já usa esse app.
      const rAtual = await fetch(`${GRAPH}/${appId}/subscriptions?access_token=${encodeURIComponent(tokenApp)}`);
      const dAtual = await rAtual.json().catch(() => ({}));
      if (!rAtual.ok) return resposta(req, 400, { erro: "A Meta recusou o App Secret: " + erroMeta(dAtual, rAtual.status) });
      const jaTem = (dAtual?.data || []).find((x: any) => x?.object === "whatsapp_business_account");
      if (jaTem?.callback_url && jaTem.callback_url !== nosso) {
        let host = jaTem.callback_url;
        try { host = new URL(jaTem.callback_url).host; } catch { /* mantém texto */ }
        return resposta(req, 409, {
          erro: `Este app já manda os webhooks do WhatsApp para ${host}. Trocar aqui derrubaria esse sistema. Crie um app separado para o CRM.`,
        });
      }

      const corpo = new URLSearchParams({
        object: "whatsapp_business_account", callback_url: nosso,
        verify_token: s.verify_token || "", fields: "messages", access_token: tokenApp,
      });
      const rSub = await fetch(`${GRAPH}/${appId}/subscriptions`, { method: "POST", body: corpo });
      const dSub = await rSub.json().catch(() => ({}));
      if (!rSub.ok) return resposta(req, 400, { erro: "A Meta recusou o webhook: " + erroMeta(dSub, rSub.status) });

      // Inscreve o app nesta conta do WhatsApp (sem isso a conta não manda nada para o app).
      const rApp = await fetch(`${GRAPH}/${cfg.waba_id}/subscribed_apps`, {
        method: "POST", headers: { Authorization: `Bearer ${s.token}` },
      });
      const dApp = await rApp.json().catch(() => ({}));
      if (!rApp.ok) {
        return resposta(req, 400, {
          erro: "Webhook configurado, mas não consegui inscrever o app na conta do WhatsApp: " + erroMeta(dApp, rApp.status),
        });
      }

      const ok = await marcar(integ, integ.status === "erro" ? "pendente" : integ.status,
        { webhook_inscrito: true, webhook_registrado_em: new Date().toISOString() });
      return resposta(req, 200, { ok: true, aviso: "Webhook configurado e app inscrito na conta. Mande uma mensagem para o número e ela cai em Conversas.", estado: await estado(ok) });
    }

    // Registra o webhook do CRM num slot livre da instância. A Global Key é usada só nesta chamada, não é guardada.
    if (b.acao === "registrar_webhook" && tipo === "whatsapp_nao_oficial") {
      const integ = await buscar(tipo);
      if (!integ) return resposta(req, 400, { erro: "Salve a NeoGo primeiro." });
      const globalKey = limpo(b.global_key);
      const slot = Number(b.slot);
      if (!globalKey) return resposta(req, 400, { erro: "Informe a Global API Key." });
      if (![1, 2, 3].includes(slot)) return resposta(req, 400, { erro: "Escolha o slot 1, 2 ou 3." });
      const s = await segredos(integ.id);
      const cfg = integ.config as Record<string, string>;
      const nosso = `${url}/functions/v1/neogo-webhook?i=${integ.id}&t=${s.url_token}`;
      const endereco = `${cfg.base_url}/instance/${encodeURIComponent(cfg.instance_id)}/webhooks/${slot}`;

      const atual = await fetch(endereco, { headers: { apikey: globalKey } });
      const existente = await atual.json().catch(() => null);
      const urlExistente = (existente as any)?.url || (existente as any)?.data?.url || "";
      if (atual.status === 401 || atual.status === 403) return resposta(req, 400, { erro: "A NeoGo recusou a Global API Key." });
      if (atual.ok && urlExistente && urlExistente !== nosso) {
        let host = urlExistente;
        try { host = new URL(urlExistente).host; } catch { /* mantém texto */ }
        return resposta(req, 409, { erro: `O slot ${slot} já está em uso (${host}). Escolha outro slot para não derrubar a integração que já existe.` });
      }

      const r = await fetch(endereco, {
        method: "PUT",
        headers: { apikey: globalKey, "Content-Type": "application/json" },
        body: JSON.stringify({ url: nosso, events: [], enabled: true, secret: s.webhook_secret }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return resposta(req, 400, { erro: `A NeoGo recusou o registro (HTTP ${r.status}): ${(d as any)?.message || (d as any)?.error || ""}` });
      const ok = await marcar(integ, integ.status === "ativa" ? "ativa" : "pendente", { webhook_slot: slot, webhook_registrado_em: new Date().toISOString() });
      return resposta(req, 200, { ok: true, estado: await estado(ok) });
    }

    return resposta(req, 400, { erro: "Ação desconhecida." });
  } catch (e) {
    return resposta(req, 400, { erro: (e as Error).message });
  }
});


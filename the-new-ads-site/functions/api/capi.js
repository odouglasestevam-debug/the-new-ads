// POST /api/capi
// Envia LeadQualificado ou Purchase pra API de conversoes do Meta.
// Chamado pelo painel do funil, autenticado com o token da sessao do usuario:
// e esse token que autoriza a leitura do lead, respeitando a lista de acesso.
//
// Body: { lead_id, evento: "LeadQualificado" | "Purchase", valor?, moeda? }
//
// Credenciais esperadas como variaveis de ambiente do Pages:
//   META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE (opcional)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../_lib/supabase.js";

const VERSAO_GRAPH = "v21.0";

const EVENTOS_ACEITOS = {
  LeadQualificado: "capi_qualificado_enviado_em",
  Purchase: "capi_purchase_enviado_em",
};

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Meta exige os dados pessoais normalizados antes do hash:
// minusculas, sem acento, sem espaco e sem pontuacao.
function normalizar(valor) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function normalizarTelefone(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  // Numero brasileiro digitado sem o codigo do pais.
  if (digitos.length <= 11) return "55" + digitos;
  return digitos;
}

async function hash(valor) {
  if (!valor) return null;
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function montarUserData(lead) {
  const dados = {};
  const em = await hash(normalizar(lead.email));
  const ph = await hash(normalizarTelefone(lead.telefone));
  const fn = await hash(normalizar(lead.primeiro_nome));
  const ln = await hash(normalizar(lead.ultimo_nome));
  const ct = await hash(normalizar(lead.cidade).replace(/\s/g, ""));
  const st = await hash(normalizar(lead.estado).replace(/\s/g, ""));
  const country = await hash(normalizar(lead.pais));
  const zp = await hash(String(lead.cep ?? "").replace(/\D/g, ""));

  if (em) dados.em = [em];
  if (ph) dados.ph = [ph];
  if (fn) dados.fn = [fn];
  if (ln) dados.ln = [ln];
  if (ct) dados.ct = [ct];
  if (st) dados.st = [st];
  if (country) dados.country = [country];
  if (zp) dados.zp = [zp];

  // Nao levam hash.
  if (lead.fbp) dados.fbp = lead.fbp;
  if (lead.fbc) dados.fbc = lead.fbc;
  else if (lead.fbclid) {
    const criado = lead.created_at ? new Date(lead.created_at).getTime() : Date.now();
    dados.fbc = `fb.1.${criado}.${lead.fbclid}`;
  }
  if (lead.ip) dados.client_ip_address = lead.ip;
  if (lead.user_agent) dados.client_user_agent = lead.user_agent;

  return dados;
}

// Le as configuracoes salvas pelo painel, usando a sessao de quem chamou.
async function lerConfig(autorizacao) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/funil_config?select=chave,valor`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao },
    });
    const linhas = await res.json();
    if (!Array.isArray(linhas)) return {};
    return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  } catch {
    return {};
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const autorizacao = request.headers.get("authorization") || "";
    if (!autorizacao.startsWith("Bearer ")) {
      return json({ error: "sem_sessao", message: "Faca login no painel." }, 401);
    }

    const corpo = await request.json();
    const { lead_id: leadId, evento } = corpo;

    if (!leadId || !EVENTOS_ACEITOS[evento]) {
      return json({ error: "parametros_invalidos", message: "Informe lead_id e um evento valido." }, 400);
    }

    // A leitura usa o token do usuario: quem nao esta na lista de acesso nao le nada.
    const resLead = await fetch(
      `${SUPABASE_URL}/rest/v1/funil_leads?id=eq.${encodeURIComponent(leadId)}&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao } },
    );
    const leads = await resLead.json();
    const lead = Array.isArray(leads) ? leads[0] : null;

    if (!lead) {
      return json({ error: "lead_nao_encontrado" }, 404);
    }

    // Variavel de ambiente tem prioridade; se nao houver, usa o que foi
    // cadastrado em Ajustes no proprio painel.
    const config = await lerConfig(autorizacao);
    const pixel = env.META_PIXEL_ID || config.meta_pixel_id;
    const token = env.META_CAPI_TOKEN || config.meta_capi_token;
    const codigoTeste = env.META_TEST_EVENT_CODE || config.meta_test_event_code;

    if (!pixel || !token) {
      return json({
        error: "nao_configurado",
        message: "Cadastre o ID do pixel e o token da API de conversoes em Ajustes.",
      }, 503);
    }

    const eventId = `${evento}.${lead.id}`;
    const evt = {
      event_name: evento,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "system_generated",
      event_source_url: lead.event_source_url || "https://thenewads.com.br/trafego-pago",
      user_data: await montarUserData(lead),
    };

    if (evento === "Purchase") {
      const valor = Number(corpo.valor ?? lead.valor_contrato ?? 0);
      evt.custom_data = { currency: corpo.moeda || "BRL", value: valor };
    } else {
      evt.custom_data = {
        empresa: lead.empresa || "",
        faturamento: lead.faturamento || "",
        verba: lead.verba || "",
      };
    }

    const payload = { data: [evt] };
    if (codigoTeste) payload.test_event_code = codigoTeste;

    const resMeta = await fetch(
      `https://graph.facebook.com/${VERSAO_GRAPH}/${pixel}/events?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const respostaMeta = await resMeta.json().catch(() => ({}));
    const sucesso = resMeta.ok;

    // Auditoria: guarda o que saiu e o que voltou, pra conferir e reenviar.
    // Grava com a sessao de quem disparou, ja que a tabela so aceita
    // escrita autenticada.
    await fetch(`${SUPABASE_URL}/rest/v1/funil_capi_eventos`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: autorizacao,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lead_id: lead.id,
        evento,
        event_id: eventId,
        sucesso,
        http_status: resMeta.status,
        payload,
        resposta: respostaMeta,
      }),
    }).catch(() => {});

    if (sucesso) {
      const campo = EVENTOS_ACEITOS[evento];
      const atualizacao = { [campo]: new Date().toISOString() };
      if (evento === "Purchase") {
        atualizacao.valor_contrato = Number(corpo.valor ?? lead.valor_contrato ?? 0);
        atualizacao.fechado_em = new Date().toISOString();
      }
      await fetch(`${SUPABASE_URL}/rest/v1/funil_leads?id=eq.${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: autorizacao,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(atualizacao),
      });
    }

    return json({ ok: sucesso, status: resMeta.status, resposta: respostaMeta }, sucesso ? 200 : 502);
  } catch (err) {
    return json({ error: "falha_no_envio", message: String(err.message || err) }, 500);
  }
}

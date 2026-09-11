// POST /api/lead
// Grava cada resposta do formulario da landing de trafego pago, qualificada ou nao,
// junto com a origem de trafego capturada na pagina.

import { inserir, notificar, rpc, rpcValor } from "../_lib/supabase.js";

// Defesas contra envio automatizado, em ordem de custo:
// 1) campo isca, invisivel pra gente e irresistivel pra robo
// 2) tempo minimo de preenchimento
// 3) limite de envios do mesmo IP
const TEMPO_MINIMO_MS = 3000;
const LIMITE_POR_IP = 6;
const JANELA_MINUTOS = 10;

async function pareceRobo(env, corpo, ip) {
  if (corpo.empresa_site) return "campo_isca";

  const decorrido = Number(corpo.tempo_ms || 0);
  if (decorrido && decorrido < TEMPO_MINIMO_MS) return "rapido_demais";

  if (ip) {
    try {
      const recentes = await rpcValor(env, "funil_leads_recentes_por_ip", { p_ip: ip, p_minutos: JANELA_MINUTOS });
      if (Number(recentes) >= LIMITE_POR_IP) return "limite_por_ip";
    } catch {
      // Falha na checagem nao pode barrar lead legitimo.
    }
  }

  return null;
}

function cabecalhosCors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json", ...cabecalhosCors() },
  });
}

function texto(valor, limite = 300) {
  if (valor === undefined || valor === null) return null;
  const limpo = String(valor).trim();
  if (!limpo) return null;
  return limpo.slice(0, limite);
}

export async function onRequestOptions() {
  return new Response(null, { headers: cabecalhosCors() });
}

// "Douglas Estevam Silva" -> { primeiro: "Douglas", ultimo: "Silva" }
function quebrarNome(nomeCompleto) {
  const partes = String(nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { primeiro: null, ultimo: null };
  if (partes.length === 1) return { primeiro: partes[0], ultimo: null };
  return { primeiro: partes[0], ultimo: partes[partes.length - 1] };
}

export async function onRequestPost({ request, env }) {
  try {
    const corpo = await request.json();
    const rastreio = corpo.tracking || {};

    // Segundo envio do mesmo preenchimento: completa a linha ja criada
    // em vez de gravar um lead duplicado.
    if (corpo.lead_id) {
      await rpc(env, "funil_lead_completar", {
        p_id: corpo.lead_id,
        p_empresa: texto(corpo.empresa),
        p_faturamento: texto(corpo.faturamento),
        p_verba: texto(corpo.verba),
        p_qualificado: typeof corpo.qualificado === "boolean" ? corpo.qualificado : null,
        p_ja_investe: texto(corpo.ja_investe),
      });

      if (corpo.evento === "formulario_completo") {
        await notificar(
          env,
          "Formulário completo",
          [texto(corpo.nome), texto(corpo.empresa), texto(corpo.faturamento)].filter(Boolean).join(" · "),
          "https://thenewads.com.br/funil/",
        );
      }

      return json({ ok: true, id: corpo.lead_id });
    }

    const nome = texto(corpo.nome);
    const email = texto(corpo.email);
    const telefone = texto(corpo.telefone);

    if (!nome && !email && !telefone) {
      return json({ error: "sem_contato", message: "Envie ao menos nome, email ou telefone." }, 400);
    }

    const ip = texto(request.headers.get("cf-connecting-ip"), 60);

    // Robo recebe a mesma resposta de sucesso, pra nao aprender o que barrou.
    const motivo = await pareceRobo(env, corpo, ip);
    if (motivo) {
      return json({ ok: true, id: crypto.randomUUID() });
    }

    const id = crypto.randomUUID();
    const { primeiro, ultimo } = quebrarNome(nome);

    // A Cloudflare ja resolve a geolocalizacao da requisicao, com precisao
    // melhor que a do navegador e sem depender de cookie.
    const geo = request.cf || {};

    const linha = {
      id,
      nome,
      email,
      telefone,
      primeiro_nome: primeiro,
      ultimo_nome: ultimo,
      cidade: texto(geo.city, 120),
      estado: texto(geo.region, 120),
      pais: texto(geo.country, 4),
      cep: texto(geo.postalCode, 20),
      ip,
      event_id: texto(corpo.event_id, 80),
      event_source_url: texto(rastreio.landing_page, 800),
      empresa: texto(corpo.empresa),
      faturamento: texto(corpo.faturamento),
      verba: texto(corpo.verba),
      qualificado: typeof corpo.qualificado === "boolean" ? corpo.qualificado : null,

      utm_source: texto(rastreio.utm_source),
      utm_medium: texto(rastreio.utm_medium),
      utm_campaign: texto(rastreio.utm_campaign),
      utm_content: texto(rastreio.utm_content),
      utm_term: texto(rastreio.utm_term),
      utm_id: texto(rastreio.utm_id),
      utm_placement: texto(rastreio.utm_placement),
      gclid: texto(rastreio.gclid),
      gbraid: texto(rastreio.gbraid),
      wbraid: texto(rastreio.wbraid),
      fbclid: texto(rastreio.fbclid),
      ttclid: texto(rastreio.ttclid),
      msclkid: texto(rastreio.msclkid),
      fbp: texto(rastreio.fbp),
      fbc: texto(rastreio.fbc),
      referrer: texto(rastreio.referrer, 800),
      landing_page: texto(rastreio.landing_page, 800),
      todos_parametros: rastreio.all_params || null,

      ja_investe: texto(corpo.ja_investe),
      // qual variacao da pagina a pessoa viu, pra comparar nicho por nicho
      nicho: texto(corpo.nicho, 40),

      user_agent: texto(request.headers.get("user-agent"), 500),
    };

    await inserir(env, "funil_leads", linha);

    // Primeiro contato: e aqui que o telefone chega, entao vale avisar na hora.
    // Nome, email e telefone em linhas separadas pra dar pra ligar direto da
    // notificacao, sem precisar abrir o painel.
    if (corpo.evento !== "formulario_completo") {
      const contato = [linha.nome, linha.email, linha.telefone].filter(Boolean).join("\n");
      await notificar(
        env,
        "🚨 ATENÇÃO NOVO LEAD",
        contato || "Novo preenchimento na landing",
        "https://thenewads.com.br/funil/",
      );
    }

    // Notifica so quando o lead terminou o formulario dentro do perfil.
    if (corpo.evento === "formulario_completo") {
      await notificar(
        env,
        "Formulário completo",
        [linha.nome, linha.empresa, linha.faturamento].filter(Boolean).join(" · "),
        "https://thenewads.com.br/funil/",
      );
    }

    return json({ ok: true, id });
  } catch (err) {
    return json({ error: "falha_ao_gravar", message: String(err.message || err) }, 500);
  }
}

// POST /api/evento
// Grava um degrau do funil. Essa e a fonte unica do analytics: o GTM continua
// alimentando Meta e Google, mas quem decide verba le daqui, porque misturar as
// duas fontes no mesmo funil produz taxa de passagem acima de 100%.

import { inserirIgnorandoDuplicata } from "../_lib/supabase.js";

const TIPOS = new Set([
  "form_view",
  "form_start",
  "form_step",
  "lead",
  "form_complete",
  "scheduler_view",
  "slot_selected",
  "schedule",
]);

const NICHOS = new Set(["generico", "vet", "eventos"]);
const LIMITE_LOTE = 20;

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

function uuidOuNulo(valor) {
  const limpo = texto(valor, 40);
  if (!limpo) return null;
  return /^[0-9a-f-]{36}$/i.test(limpo) ? limpo : null;
}

// O dia precisa ser o do fuso de Sao Paulo, nao o do UTC, senao evento da noite
// cai no dia seguinte e a coorte diaria fica torta.
function diaEmSaoPaulo() {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return partes;
}

export async function onRequestOptions() {
  return new Response(null, { headers: cabecalhosCors() });
}

export async function onRequestPost({ request, env }) {
  try {
    const corpo = await request.json().catch(() => ({}));

    const visitorId = texto(corpo.visitor_id, 64);
    if (!visitorId) return json({ ok: false, erro: "visitor_id" }, 400);

    const bruto = Array.isArray(corpo.eventos) ? corpo.eventos : [corpo];
    const dia = diaEmSaoPaulo();
    const ip = request.headers.get("cf-connecting-ip") || null;
    const ua = texto(request.headers.get("user-agent"), 400);

    const linhas = [];
    for (const item of bruto.slice(0, LIMITE_LOTE)) {
      const tipo = texto(item && item.tipo, 30);
      if (!tipo || !TIPOS.has(tipo)) continue;

      let passo = null;
      if (tipo === "form_step") {
        const n = Number(item.passo);
        if (!Number.isInteger(n) || n < 1 || n > 20) continue;
        passo = n;
      }

      const nicho = texto(corpo.nicho, 20);
      linhas.push({
        dia,
        visitor_id: visitorId,
        lead_id: uuidOuNulo(corpo.lead_id),
        tipo,
        passo,
        nicho: nicho && NICHOS.has(nicho) ? nicho : nicho,
        pagina: texto(corpo.pagina, 120),
        utm_source: texto(corpo.utm_source, 120),
        utm_medium: texto(corpo.utm_medium, 200),
        utm_campaign: texto(corpo.utm_campaign, 200),
        utm_content: texto(corpo.utm_content, 200),
        utm_term: texto(corpo.utm_term, 200),
        utm_placement: texto(corpo.utm_placement, 80),
        ad_id: texto(corpo.ad_id, 40),
        user_agent: ua,
        ip,
      });
    }

    if (!linhas.length) return json({ ok: true, gravados: 0 });

    await inserirIgnorandoDuplicata(env, "funil_eventos", linhas, "visitor_id,tipo,passo,dia");
    return json({ ok: true, gravados: linhas.length });
  } catch (erro) {
    // Medicao nunca pode quebrar a pagina: devolve 200 e registra o motivo.
    console.error("evento", erro && erro.message);
    return json({ ok: false, erro: "falha" }, 200);
  }
}

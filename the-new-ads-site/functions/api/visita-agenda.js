// POST /api/visita-agenda
// Avisa no app do funil que alguem abriu a tela de agendamento. O valor aqui e
// o tempo real: da pra chamar a pessoa enquanto ela ainda esta escolhendo horario.

import { inserir, notificar, rpcValor } from "../_lib/supabase.js";

// Recarregar a pagina, voltar do WhatsApp ou trocar de aba nao pode virar uma
// notificacao nova. Uma por IP a cada meia hora ja transmite a informacao.
const JANELA_DEDUPE_MINUTOS = 30;

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

export async function onRequestPost({ request, env }) {
  try {
    const corpo = await request.json().catch(() => ({}));
    const ip = request.headers.get("cf-connecting-ip") || null;
    const geo = request.cf || {};

    let repetida = false;
    if (ip) {
      try {
        const recentes = await rpcValor(env, "funil_visitas_recentes_por_ip", {
          p_ip: ip,
          p_minutos: JANELA_DEDUPE_MINUTOS,
        });
        repetida = Number(recentes) > 0;
      } catch {
        // Sem a checagem, prefiro notificar de novo a perder o aviso.
      }
    }

    const nome = texto(corpo.nome, 120);
    const cidade = texto(geo.city, 120);
    const regiao = texto(geo.region, 120);

    const origem = corpo.origem || {};
    await inserir(env, "funil_visitas_agenda", {
      lead_id: texto(corpo.leadId, 60),
      nome,
      ip,
      cidade,
      regiao,
      utm_source: texto(origem.utm_source, 200),
      utm_medium: texto(origem.utm_medium, 200),
      utm_campaign: texto(origem.utm_campaign, 200),
      utm_content: texto(origem.utm_content, 200),
      nicho: texto(origem.nicho, 40),
      user_agent: texto(request.headers.get("user-agent"), 500),
      referrer: texto(corpo.referrer, 800),
    });

    if (!repetida) {
      const local = [cidade, regiao].filter(Boolean).join("/");
      await notificar(
        env,
        "Abriu a agenda",
        [nome || "Alguem", local].filter(Boolean).join(" · ") + " esta escolhendo horario",
        "https://thenewads.com.br/funil/",
      );
    }

    return json({ ok: true, notificado: !repetida });
  } catch (err) {
    // Um erro aqui nunca pode atrapalhar quem esta tentando agendar.
    return json({ ok: false, erro: String(err.message || err) });
  }
}

// GET /api/month?month=YYYY-MM
// Mostra o mes inteiro (visual de agenda cheia), mas so os proximos N dias
// uteis (proximosDiasUteis, definido em _lib) aparecem como agendaveis --
// o resto do mes so preenche o calendario, nunca e clicavel.

import {
  getAccessToken,
  freeBusy,
  jsonResponse,
  corsHeaders,
  expedienteSlots,
  overlapsBusy,
  proximosDiasUteis,
  isoDate,
} from "../_lib/google-calendar.js";

const DIAS_AGENDAVEIS = 2;
const MESES_A_FRENTE_MAX = 3;

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const now = new Date();
    const monthParam = url.searchParams.get("month");

    let year, month; // month: 0-11
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      [year, month] = monthParam.split("-").map(Number);
      month -= 1;
    } else {
      year = now.getUTCFullYear();
      month = now.getUTCMonth();
    }

    const requested = new Date(Date.UTC(year, month, 1));
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const maxMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + MESES_A_FRENTE_MAX, 1));

    if (requested < currentMonth || requested > maxMonth) {
      return jsonResponse({ error: "mes_fora_do_intervalo" }, 400);
    }

    const expedienteInicio = Number(env.EXPEDIENTE_INICIO || 9);
    const expedienteFim = Number(env.EXPEDIENTE_FIM || 18);
    const duracaoMin = Number(env.DURACAO_MINUTOS || 60);

    const candidatos = proximosDiasUteis(DIAS_AGENDAVEIS, now);

    const accessToken = await getAccessToken(env);
    const busy = await freeBusy(
      env,
      accessToken,
      candidatos[0].toISOString(),
      new Date(candidatos[candidatos.length - 1].getTime() + 24 * 3600 * 1000).toISOString()
    );

    const days = {};
    candidatos.forEach((dia) => {
      const slots = expedienteSlots(dia, expedienteInicio, expedienteFim, duracaoMin);
      const temLivre = slots.some((s) => s.start > now && !overlapsBusy(s.start, s.end, busy));
      if (temLivre && dia.getUTCFullYear() === year && dia.getUTCMonth() === month) {
        days[isoDate(dia)] = true;
      }
    });

    return jsonResponse({
      month: `${year}-${String(month + 1).padStart(2, "0")}`,
      days,
      canGoBack: requested > currentMonth,
      canGoForward: requested < maxMonth,
    });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

// GET /api/slots
// Retorna os 2 primeiros horarios livres de 1h (dentro do expediente) para
// cada um dos proximos 2 dias uteis, cruzando com o Google Calendar real.

import { getAccessToken, freeBusy, jsonResponse, corsHeaders } from "../_lib/google-calendar.js";

// Brasil nao tem mais horario de verao desde 2019: America/Sao_Paulo = UTC-3 fixo.
const TZ_OFFSET_HOURS = -3;

function nextBusinessDays(count) {
  const days = [];
  const now = new Date();
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() + 1); // comeca amanha

  while (days.length < count) {
    const weekday = cursor.getUTCDay(); // 0 = domingo, 6 = sabado
    if (weekday !== 0 && weekday !== 6) {
      days.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function localHourToUtc(dayUtcMidnight, localHour) {
  return new Date(dayUtcMidnight.getTime() + (localHour - TZ_OFFSET_HOURS) * 3600 * 1000);
}

function overlapsBusy(slotStart, slotEnd, busy) {
  return busy.some((b) => {
    const busyStart = new Date(b.start);
    const busyEnd = new Date(b.end);
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet({ env }) {
  try {
    const expedienteInicio = Number(env.EXPEDIENTE_INICIO || 9);
    const expedienteFim = Number(env.EXPEDIENTE_FIM || 18);
    const duracaoMin = Number(env.DURACAO_MINUTOS || 60);

    const days = nextBusinessDays(2);
    const rangeStart = days[0];
    const rangeEnd = localHourToUtc(days[days.length - 1], expedienteFim);

    const accessToken = await getAccessToken(env);
    const busy = await freeBusy(env, accessToken, rangeStart.toISOString(), rangeEnd.toISOString());

    const result = [];
    const now = new Date();

    for (const day of days) {
      const daySlots = [];
      let hour = expedienteInicio;

      while (hour + duracaoMin / 60 <= expedienteFim && daySlots.length < 2) {
        const slotStart = localHourToUtc(day, hour);
        const slotEnd = new Date(slotStart.getTime() + duracaoMin * 60 * 1000);

        if (slotStart > now && !overlapsBusy(slotStart, slotEnd, busy)) {
          daySlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }
        hour += duracaoMin / 60;
      }

      if (daySlots.length > 0) {
        result.push({ date: day.toISOString().slice(0, 10), slots: daySlots });
      }
    }

    return jsonResponse({ timezone: env.TIMEZONE || "America/Sao_Paulo", days: result });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

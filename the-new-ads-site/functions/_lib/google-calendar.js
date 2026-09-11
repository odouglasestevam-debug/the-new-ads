// Helpers compartilhados pelas Pages Functions de agendamento.
// Troca o refresh token por access token e fala com a Google Calendar API v3.

export async function getAccessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_CALENDAR_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao renovar access token (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function freeBusy(env, accessToken, timeMin, timeMax) {
  const calendarId = env.GOOGLE_CALENDAR_ID || "primary";
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: env.TIMEZONE || "America/Sao_Paulo",
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao consultar freeBusy (${res.status}): ${body}`);
  }

  const data = await res.json();
  const calendarId2 = env.GOOGLE_CALENDAR_ID || "primary";
  return (data.calendars && data.calendars[calendarId2] && data.calendars[calendarId2].busy) || [];
}

export async function insertEvent(env, accessToken, event) {
  const calendarId = env.GOOGLE_CALENDAR_ID || "primary";
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all&conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao criar evento (${res.status}): ${body}`);
  }

  return res.json();
}

// Brasil nao tem mais horario de verao desde 2019: America/Sao_Paulo = UTC-3 fixo.
// Lista os eventos reais da agenda num intervalo, ja expandindo recorrencias.
export async function listEvents(env, accessToken, timeMin, timeMax) {
  const calendarId = env.GOOGLE_CALENDAR_ID || "primary";
  const parametros = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${parametros}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(`google calendar ${res.status}: ${await res.text()}`);
  }

  const dados = await res.json();
  return (dados.items || []).filter((e) => e.status !== "cancelled");
}

export const TZ_OFFSET_HOURS = -3;

export function isWeekday(dateUtcMidnight) {
  const day = dateUtcMidnight.getUTCDay(); // 0 = domingo, 6 = sabado
  return day !== 0 && day !== 6;
}

export function localHourToUtc(dayUtcMidnight, localHour) {
  return new Date(dayUtcMidnight.getTime() + (localHour - TZ_OFFSET_HOURS) * 3600 * 1000);
}

// Gera os horarios cheios de 1h dentro do expediente (ex: 9,10,11...17 -> termina 18h).
export function expedienteSlots(dayUtcMidnight, expedienteInicio, expedienteFim, duracaoMin) {
  const slots = [];
  let hour = expedienteInicio;
  while (hour + duracaoMin / 60 <= expedienteFim) {
    const start = localHourToUtc(dayUtcMidnight, hour);
    const end = new Date(start.getTime() + duracaoMin * 60 * 1000);
    slots.push({ start, end });
    hour += duracaoMin / 60;
  }
  return slots;
}

// Regra de negocio: so se agenda pros proximos N dias uteis (a partir de
// amanha, pulando fim de semana). O resto do mes fica visivel no calendario
// (da a sensacao de agenda cheia) mas nunca clicavel -- essa e a fonte unica
// de verdade, checada em /api/month, /api/day e /api/book.
export function proximosDiasUteis(quantidade, aPartirDe = new Date()) {
  const dias = [];
  let cursor = new Date(Date.UTC(aPartirDe.getUTCFullYear(), aPartirDe.getUTCMonth(), aPartirDe.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() + 1); // comeca amanha

  while (dias.length < quantidade) {
    if (isWeekday(cursor)) {
      dias.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

export function isoDate(dateUtcMidnight) {
  return dateUtcMidnight.toISOString().slice(0, 10);
}

export function overlapsBusy(slotStart, slotEnd, busy) {
  return busy.some((b) => {
    const busyStart = new Date(b.start);
    const busyEnd = new Date(b.end);
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

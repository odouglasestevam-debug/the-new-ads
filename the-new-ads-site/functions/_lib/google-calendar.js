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

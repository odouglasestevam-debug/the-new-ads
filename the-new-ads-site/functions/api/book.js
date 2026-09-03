// POST /api/book
// Body: { name, email, phone?, start, end }
// Confere se o horario continua livre (evita corrida de dois leads escolhendo
// o mesmo slot) e cria o evento no Google Calendar com Meet automatico.

import { getAccessToken, freeBusy, insertEvent, jsonResponse, corsHeaders } from "../_lib/google-calendar.js";

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { name, email, phone, start, end } = body || {};

    if (!name || !email || !start || !end) {
      return jsonResponse({ error: "Campos obrigatorios: name, email, start, end" }, 400);
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
      return jsonResponse({ error: "start/end invalidos" }, 400);
    }

    const accessToken = await getAccessToken(env);

    // Reconfere disponibilidade no exato momento da confirmacao.
    const busy = await freeBusy(env, accessToken, startDate.toISOString(), endDate.toISOString());
    const stillFree = !busy.some((b) => {
      const busyStart = new Date(b.start);
      const busyEnd = new Date(b.end);
      return startDate < busyEnd && endDate > busyStart;
    });

    if (!stillFree) {
      return jsonResponse({ error: "slot_indisponivel", message: "Esse horario acabou de ser ocupado. Escolha outro." }, 409);
    }

    const event = {
      summary: `Reuniao com ${name} - The New Ads`,
      description: [
        `Lead agendado via landing page.`,
        `Nome: ${name}`,
        `Email: ${email}`,
        phone ? `Telefone: ${phone}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: startDate.toISOString(), timeZone: env.TIMEZONE || "America/Sao_Paulo" },
      end: { dateTime: endDate.toISOString(), timeZone: env.TIMEZONE || "America/Sao_Paulo" },
      attendees: [{ email }],
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: { useDefault: true },
    };

    const created = await insertEvent(env, accessToken, event);

    return jsonResponse({
      ok: true,
      eventId: created.id,
      meetLink: created.hangoutLink || null,
      htmlLink: created.htmlLink,
    });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

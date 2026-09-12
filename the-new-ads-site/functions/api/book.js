// POST /api/book
// Body: { name, email, phone?, start, end }
// Confere se o horario continua livre (evita corrida de dois leads escolhendo
// o mesmo slot) e cria o evento no Google Calendar com Meet automatico.

import {
  getAccessToken,
  freeBusy,
  insertEvent,
  jsonResponse,
  corsHeaders,
  proximosDiasUteis,
  isoDate,
} from "../_lib/google-calendar.js";
import { inserir, notificar, rpc } from "../_lib/supabase.js";

const DIAS_AGENDAVEIS = 2;

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

    const diasPermitidos = proximosDiasUteis(DIAS_AGENDAVEIS).map(isoDate);
    const dataDoSlot = startDate.toISOString().slice(0, 10);
    if (!diasPermitidos.includes(dataDoSlot)) {
      return jsonResponse({ error: "dia_nao_liberado", message: "Esse dia nao esta mais disponivel pra agendamento." }, 403);
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

    // Registro e notificacao nao podem derrubar um agendamento ja criado
    // no Calendar: falha aqui e registrada, mas a reuniao continua marcada.
    try {
      const origem = body.origem || {};
      await inserir(env, "funil_agendamentos", {
        lead_id: body.leadId || null,
        nome: name,
        email,
        telefone: phone || null,
        // Origem na propria linha da reuniao: se o lead se perder, ou se a
        // pessoa agendar por link direto, ainda da pra dizer qual anuncio pagou.
        utm_source: origem.utm_source || null,
        utm_medium: origem.utm_medium || null,
        utm_campaign: origem.utm_campaign || null,
        utm_content: origem.utm_content || null,
        utm_term: origem.utm_term || null,
        nicho: origem.nicho || null,
        inicio: startDate.toISOString(),
        fim: endDate.toISOString(),
        google_event_id: created.id,
        meet_link: created.hangoutLink || null,
        event_link: created.htmlLink || null,
      });

      if (body.leadId) {
        await rpc(env, "funil_lead_agendou", { p_id: body.leadId });
      }
    } catch (err) {
      console.error("falha ao gravar agendamento:", String(err));
    }

    // Notificacao curta, no padrao "Fulano marcou quarta as 17h": os detalhes
    // completos (empresa, faturamento, origem) ficam no painel, a um toque
    // de distancia, sem lotar a notificacao no aparelho.
    const fuso = env.TIMEZONE || "America/Sao_Paulo";
    const primeiroNome = String(name || "").trim().split(/\s+/)[0] || "Alguém";
    const diaSemana = startDate
      .toLocaleDateString("pt-BR", { timeZone: fuso, weekday: "long" })
      .replace("-feira", "");
    const horaNum = Number(startDate.toLocaleString("pt-BR", { timeZone: fuso, hour: "2-digit", hour12: false }));
    const minNum = Number(startDate.toLocaleString("pt-BR", { timeZone: fuso, minute: "2-digit" }));
    const horaTexto = minNum === 0 ? `${horaNum}h` : `${horaNum}h${String(minNum).padStart(2, "0")}`;

    await notificar(
      env,
      "Novo agendamento",
      `${primeiroNome} marcou ${diaSemana} às ${horaTexto}`,
      "https://thenewads.com.br/funil/",
    );

    return jsonResponse({
      ok: true,
      eventId: created.id,
      meetLink: created.hangoutLink || null,
      htmlLink: created.htmlLink,
      inicio: startDate.toISOString(),
      fim: endDate.toISOString(),
    });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}

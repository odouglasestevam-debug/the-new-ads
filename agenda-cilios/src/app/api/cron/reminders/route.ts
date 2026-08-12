import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendText } from "@/lib/neogo";
import { mensagemConfirmacao24h, mensagemLembrete3h } from "@/lib/messages";
import { calcularLembretesDevidos, type AppointmentParaLembrete } from "@/lib/reminders";

type LinhaAgendamento = {
  id: string;
  start_at: string;
  status: "scheduled" | "confirmed" | "cancelled" | "done";
  reminder_day_before_sent_at: string | null;
  reminder_3h_sent_at: string | null;
  clients: { name: string; phone: string } | { name: string; phone: string }[] | null;
  services: { name: string } | { name: string }[] | null;
};

function primeiro<T>(valor: T | T[] | null): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor;
}

// Chamado pelo Vercel Cron (ver vercel.json) a cada 15 min.
// Protegido por CRON_SECRET pra ninguém disparar mensagens de fora.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const agora = new Date();

  // Só olha agendamentos numa janela de 2 dias pra frente, suficiente pra cobrir
  // tanto a confirmação de 24h quanto o lembrete de 3h antes.
  const limite = new Date(agora.getTime() + 48 * 60 * 60 * 1000);

  const { data: agendamentos, error } = await db
    .from("appointments")
    .select(
      "id, start_at, status, reminder_day_before_sent_at, reminder_3h_sent_at, clients(name, phone), services(name)"
    )
    .in("status", ["scheduled", "confirmed"])
    .gte("start_at", agora.toISOString())
    .lte("start_at", limite.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado: Array<{ id: string; enviado: string }> = [];

  for (const ag of (agendamentos ?? []) as LinhaAgendamento[]) {
    const cliente = primeiro(ag.clients);
    const servico = primeiro(ag.services);
    if (!cliente || !servico) continue;

    const agendamentoParaLembrete: AppointmentParaLembrete = {
      id: ag.id,
      start_at: ag.start_at,
      status: ag.status,
      reminder_day_before_sent_at: ag.reminder_day_before_sent_at,
      reminder_3h_sent_at: ag.reminder_3h_sent_at,
    };

    const devidos = calcularLembretesDevidos(agendamentoParaLembrete, agora);
    const inicio = new Date(ag.start_at);

    if (devidos.confirmacao24h) {
      const texto = mensagemConfirmacao24h(cliente.name, servico.name, inicio);
      await enviarEMarcar(db, ag.id, cliente.phone, texto, "reminder_day_before_sent_at");
      resultado.push({ id: ag.id, enviado: "confirmacao_24h" });
    }

    if (devidos.tresHorasAntes) {
      const texto = mensagemLembrete3h(cliente.name, servico.name, inicio);
      await enviarEMarcar(db, ag.id, cliente.phone, texto, "reminder_3h_sent_at");
      resultado.push({ id: ag.id, enviado: "3h_antes" });
    }
  }

  return NextResponse.json({ ok: true, enviados: resultado });
}

async function enviarEMarcar(
  db: ReturnType<typeof supabaseAdmin>,
  appointmentId: string,
  phone: string,
  texto: string,
  campoTimestamp: "reminder_day_before_sent_at" | "reminder_3h_sent_at"
) {
  try {
    await sendText(phone, texto);
    await db
      .from("appointments")
      .update({ [campoTimestamp]: new Date().toISOString() })
      .eq("id", appointmentId);
    await db.from("message_log").insert({
      appointment_id: appointmentId,
      direction: "out",
      body: texto,
    });
  } catch (err) {
    console.error(`Falha ao enviar lembrete (${campoTimestamp}) pro agendamento ${appointmentId}:`, err);
  }
}

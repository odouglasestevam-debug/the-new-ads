import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { extrairTelefone, normalizarTelefone } from "@/lib/phone";
import { sendText } from "@/lib/neogo";
import {
  mensagemAckCancelado,
  mensagemAckConfirmado,
  mensagemAckNaoEntendido,
  mensagemAckReagendar,
} from "@/lib/messages";

// Recebe eventos do NeoGo (webhook registrado via PUT /instance/{id}/webhooks/{slot}).
// Formato é o mesmo whatsmeow já mapeado no fluxo da Fátima Esportes: evento MESSAGE
// trazendo `data.Info` (Chat/SenderAlt/PushName) e o conteúdo da mensagem em `data.Message`.
// O NeoGo não suporta header de autorização customizado nesse tipo de webhook, então
// a validação é feita pelo token no próprio path (só quem registrou o webhook conhece).
type MessagePayload = {
  Message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    buttonsResponseMessage?: { selectedButtonId?: string };
  };
};

function extrairTextoMensagem(data: MessagePayload): string | null {
  const msg = data?.Message;
  if (!msg) return null;
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.buttonsResponseMessage?.selectedButtonId ??
    null
  );
}

type Resposta = "confirmado" | "cancelado" | "reagendar" | null;

// Resposta fechada por palavra-chave — mesmo padrão já usado em produção no
// fluxo de gatilhos da Fabíola (substring match em pt-BR), não é NLP.
function interpretarResposta(texto: string): Resposta {
  const normalizado = texto.toLowerCase();
  if (/cancel|^n[aã]o$/.test(normalizado)) return "cancelado";
  if (/reagend|remarc/.test(normalizado)) return "reagendar";
  if (/confirm|^sim$|^ok$/.test(normalizado)) return "confirmado";
  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token !== process.env.NEOGO_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  const evento = body.event ?? body.data?.event;
  if (evento && evento !== "MESSAGE" && evento !== "Message") {
    return NextResponse.json({ ok: true, ignorado: evento });
  }

  const info = body.data?.Info ?? body.Info;
  if (!info) return NextResponse.json({ ok: true, ignorado: "sem Info" });

  const telefoneJid = extrairTelefone(info);
  if (!telefoneJid) return NextResponse.json({ ok: true, ignorado: "sem telefone" });

  const telefone = normalizarTelefone(telefoneJid);
  const textoBruto = extrairTextoMensagem(body.data ?? body) ?? JSON.stringify(body).slice(0, 500);
  const waMessageId: string | null = info.ID ?? null;

  const db = supabaseAdmin();

  // NeoGo reentrega o mesmo evento várias vezes em alguns casos — sem essa checagem,
  // a gente processa e responde a mesma mensagem N vezes (spam pro cliente).
  if (waMessageId) {
    const { data: jaProcessado } = await db
      .from("message_log")
      .select("id")
      .eq("wa_message_id", waMessageId)
      .maybeSingle();
    if (jaProcessado) {
      return NextResponse.json({ ok: true, ignorado: "mensagem_duplicada" });
    }
  }

  const { data: cliente } = await db
    .from("clients")
    .select("id, name")
    .eq("phone", telefone)
    .maybeSingle();

  if (!cliente) {
    return NextResponse.json({ ok: true, ignorado: "cliente não cadastrado" });
  }

  // Pega o próximo agendamento em aberto dessa cliente pra associar a resposta.
  const { data: agendamento } = await db
    .from("appointments")
    .select("id, status")
    .eq("client_id", cliente.id)
    .in("status", ["scheduled", "confirmed"])
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  await db.from("message_log").insert({
    appointment_id: agendamento?.id ?? null,
    client_id: cliente.id,
    direction: "in",
    body: textoBruto,
    wa_message_id: waMessageId,
  });

  if (!agendamento) {
    return NextResponse.json({ ok: true, ignorado: "sem agendamento em aberto" });
  }

  const resposta = interpretarResposta(textoBruto);

  if (resposta === "confirmado") {
    await db.from("appointments").update({ status: "confirmed" }).eq("id", agendamento.id);
    await responderCliente(db, cliente.id, telefone, mensagemAckConfirmado(cliente.name));
    return NextResponse.json({ ok: true, resposta: "confirmado" });
  }

  if (resposta === "cancelado" || resposta === "reagendar") {
    const motivo = resposta === "cancelado" ? "cliente_cancelou" : "cliente_quer_reagendar";
    await db
      .from("appointments")
      .update({ status: "cancelled", motivo_cancelamento: motivo })
      .eq("id", agendamento.id);
    await avisarFabiola(db, agendamento.id, cliente, motivo, textoBruto);
    const ack = resposta === "cancelado" ? mensagemAckCancelado(cliente.name) : mensagemAckReagendar(cliente.name);
    await responderCliente(db, cliente.id, telefone, ack);
    return NextResponse.json({ ok: true, resposta });
  }

  // Não bateu com nenhuma palavra-chave — não arrisca mudar o agendamento sozinho,
  // só avisa a Fabíola pra ela ler e decidir.
  await avisarFabiola(db, agendamento.id, cliente, "resposta_nao_reconhecida", textoBruto);
  await responderCliente(db, cliente.id, telefone, mensagemAckNaoEntendido(cliente.name));
  return NextResponse.json({ ok: true, resposta: "nao_reconhecida" });
}

async function responderCliente(
  db: ReturnType<typeof supabaseAdmin>,
  clientId: string,
  telefone: string,
  texto: string
) {
  try {
    await sendText(telefone, texto);
    await db.from("message_log").insert({ client_id: clientId, direction: "out", body: texto });
  } catch (err) {
    console.error("Falha ao responder cliente no NeoGo:", err);
  }
}

async function avisarFabiola(
  db: ReturnType<typeof supabaseAdmin>,
  appointmentId: string,
  cliente: { id: string; name: string },
  motivo: "cliente_cancelou" | "cliente_quer_reagendar" | "resposta_nao_reconhecida",
  mensagemRecebida: string
) {
  await db.from("avisos_cancelamento").insert({
    appointment_id: appointmentId,
    client_id: cliente.id,
    cliente_nome: cliente.name,
    motivo,
    mensagem_recebida: mensagemRecebida,
  });

  const numeroFabiola = process.env.FABIOLA_TELEFONE;
  if (!numeroFabiola) return;

  const textos: Record<typeof motivo, string> = {
    cliente_cancelou: `Atenção: ${cliente.name} cancelou o agendamento pelo WhatsApp. Horário liberado na agenda.`,
    cliente_quer_reagendar: `Atenção: ${cliente.name} pediu pra reagendar pelo WhatsApp. Horário liberado, precisa marcar de novo.`,
    resposta_nao_reconhecida: `${cliente.name} respondeu a confirmação com algo que não entendi: "${mensagemRecebida}". Dá uma olhada.`,
  };

  try {
    await sendText(numeroFabiola, textos[motivo]);
  } catch (err) {
    console.error("Falha ao avisar Fabíola no WhatsApp:", err);
  }
}

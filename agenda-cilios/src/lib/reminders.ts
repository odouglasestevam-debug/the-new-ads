import { addDays, addHours, format, isBefore, isEqual } from "date-fns";

const TIMEZONE = "America/Sao_Paulo";
const HORARIO_COMERCIAL_INICIO = 8;
const HORARIO_COMERCIAL_FIM = 20;
const HORARIO_CONFIRMACAO = 8; // confirmação sempre às 8h do dia anterior ao agendamento

function horaLocal(data: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(data)
  );
}

function dentroDoHorarioComercial(data: Date): boolean {
  const hora = horaLocal(data);
  return hora >= HORARIO_COMERCIAL_INICIO && hora < HORARIO_COMERCIAL_FIM;
}

// Ajusta um horário-alvo pra dentro do horário comercial do mesmo dia local,
// empurrando pra frente até as 8h se o alvo cair de madrugada.
// Retorna null se não tiver como enviar antes do início do agendamento.
function ajustarParaHorarioComercial(alvo: Date, limiteAntesDe: Date): Date | null {
  if (dentroDoHorarioComercial(alvo)) return alvo;

  const hora = horaLocal(alvo);
  if (hora < HORARIO_COMERCIAL_INICIO) {
    // Madrugada: empurra pra 8h do mesmo dia local.
    const ajustado = new Date(alvo);
    const diffHoras = HORARIO_COMERCIAL_INICIO - hora;
    ajustado.setUTCHours(ajustado.getUTCHours() + diffHoras);
    ajustado.setUTCMinutes(0, 0, 0);
    if (isBefore(ajustado, limiteAntesDe)) return ajustado;
    return null;
  }

  // Depois das 20h: não tem mais janela válida antes do agendamento no mesmo dia.
  return null;
}

// Horário-alvo da confirmação: sempre 8h local do dia anterior ao agendamento,
// independente de que horas o agendamento em si é (regra fixa, não "-24h corridas").
function alvoConfirmacao(inicio: Date): Date {
  const diaISO = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(inicio); // yyyy-MM-dd
  const diaAnteriorISO = format(addDays(new Date(`${diaISO}T12:00:00-03:00`), -1), "yyyy-MM-dd");
  return new Date(`${diaAnteriorISO}T${String(HORARIO_CONFIRMACAO).padStart(2, "0")}:00:00-03:00`);
}

export type AppointmentParaLembrete = {
  id: string;
  start_at: string; // ISO
  status: "scheduled" | "confirmed" | "cancelled" | "done";
  reminder_day_before_sent_at: string | null;
  reminder_3h_sent_at: string | null;
};

export type LembretesDevidos = {
  confirmacao24h: boolean;
  tresHorasAntes: boolean;
};

// Decide, pra um agendamento e um "agora", quais lembretes devem ser disparados.
// Chamado pelo cron a cada ~15min; cada lembrete só é considerado devido uma vez
// (controlado pelos timestamps *_sent_at, que o chamador marca depois de enviar).
export function calcularLembretesDevidos(
  agendamento: AppointmentParaLembrete,
  agora: Date
): LembretesDevidos {
  const resultado: LembretesDevidos = { confirmacao24h: false, tresHorasAntes: false };

  if (agendamento.status !== "scheduled" && agendamento.status !== "confirmed") {
    return resultado;
  }

  const inicio = new Date(agendamento.start_at);

  // Confirmação interativa (confirmar/cancelar/reagendar): alvo é sempre 8h do dia
  // anterior ao agendamento, hora fixa. Se o agendamento foi criado depois desse
  // horário (menos de ~24h de antecedência), o alvo já cai no passado e a mensagem
  // sai na primeira passada do cron mesmo assim (não fica sem confirmação).
  if (!agendamento.reminder_day_before_sent_at) {
    const alvo = alvoConfirmacao(inicio);
    if ((isBefore(alvo, agora) || isEqual(alvo, agora)) && isBefore(agora, inicio)) {
      resultado.confirmacao24h = true;
    }
  }

  // Lembrete de ~3h antes: calcula o alvo (início - 3h) e ajusta pra dentro do
  // horário comercial se cair de madrugada. Se não houver janela válida, não envia.
  if (!agendamento.reminder_3h_sent_at) {
    const alvo = addHours(inicio, -3);
    const alvoAjustado = ajustarParaHorarioComercial(alvo, inicio);
    if (
      alvoAjustado &&
      (isBefore(alvoAjustado, agora) || isEqual(alvoAjustado, agora)) &&
      isBefore(agora, inicio)
    ) {
      resultado.tresHorasAntes = true;
    }
  }

  return resultado;
}

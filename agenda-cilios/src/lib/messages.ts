import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function dataHoraFormatada(inicio: Date): string {
  return format(inicio, "EEEE, dd/MM 'às' HH:mm", { locale: ptBR });
}

export function mensagemConfirmacao(nomeCliente: string, servico: string, inicio: Date): string {
  return (
    `Oi, ${nomeCliente}! Seu agendamento de ${servico} foi marcado para ${dataHoraFormatada(inicio)}. ` +
    `Responda CONFIRMAR pra garantir seu horário.`
  );
}

// Disparada ~24h antes — pede uma resposta fechada (confirmar/cancelar/reagendar)
// pra reduzir choque de horário quando a cliente não avisa que não vai poder ir.
export function mensagemConfirmacao24h(nomeCliente: string, servico: string, inicio: Date): string {
  return (
    `Oi, ${nomeCliente}! Passando pra confirmar seu horário de ${servico}, ${dataHoraFormatada(inicio)}. ` +
    `Responda CONFIRMAR, CANCELAR ou REAGENDAR.`
  );
}

export function mensagemLembrete3h(nomeCliente: string, servico: string, inicio: Date): string {
  return (
    `Oi, ${nomeCliente}! Seu horário de ${servico} é hoje às ${format(inicio, "HH:mm")}. Te esperamos!`
  );
}

export function mensagemAckConfirmado(nomeCliente: string): string {
  return `Confirmado, ${nomeCliente}! Te esperamos no horário combinado.`;
}

export function mensagemAckCancelado(nomeCliente: string): string {
  return `Tudo bem, ${nomeCliente}, agendamento cancelado. Se quiser marcar de novo, é só chamar aqui.`;
}

export function mensagemAckReagendar(nomeCliente: string): string {
  return `Sem problemas, ${nomeCliente}! Vamos entrar em contato pra achar um novo horário.`;
}

export function mensagemAckNaoEntendido(nomeCliente: string): string {
  return `Oi, ${nomeCliente}, não entendi sua resposta. Responda CONFIRMAR, CANCELAR ou REAGENDAR, ou aguarde que a gente te chama.`;
}

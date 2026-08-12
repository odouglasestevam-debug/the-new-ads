import { supabaseAdmin } from "@/lib/supabase";

export const ROTULO_STATUS: Record<string, string> = {
  scheduled: "Marcado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  done: "Concluído",
};

export const ESTILO_STATUS: Record<string, string> = {
  scheduled: "bg-amber-soft text-amber",
  confirmed: "bg-sage-soft text-sage",
  cancelled: "bg-line text-ink-soft line-through",
  done: "bg-ink text-cream",
};

export const ROTULO_CATEGORIA_SERVICO: Record<string, string> = {
  cilios: "Cílios",
  sobrancelha: "Sobrancelha",
  outro: "Outro",
};

// Ciclo de vida: aplicação (primeira vez ou troca de técnica) e manutenção
// (retoque periódico). Serviços fora desse ciclo (ex: design isolado) ficam null.
export const ROTULO_TIPO_PROCEDIMENTO: Record<string, string> = {
  aplicacao: "Aplicação",
  manutencao: "Manutenção",
};

// Intervalo esperado entre visitas de cílios (aplicação ou manutenção) — define
// as faixas de dias sem voltar do Kanban de ciclo de vida (CRM).
export const CICLO_DIAS_ATIVA = 21; // até aqui: ativa
export const CICLO_DIAS_ATRASADA = 40; // até aqui: atrasada (senão inativa)
export const CICLO_DIAS_INATIVA = 90; // até aqui: inativa (senão perdida)

export const ROTULO_PAGAMENTO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Crédito",
  debito: "Débito",
  cortesia: "Cortesia",
};

// Taxas da máquina (InfinityPay, plano inicial até 20 mil/mês). Só cartão à
// vista — não trabalhamos com parcelamento. Pix, dinheiro e cortesia não pagam taxa.
export const TAXA_MAQUINA: Record<string, number> = {
  dinheiro: 0,
  pix: 0,
  credito: 0.0315,
  debito: 0.0137,
  cortesia: 0,
};

export const ESTILO_BLOCO_STATUS: Record<string, string> = {
  scheduled: "bg-amber text-cream",
  confirmed: "bg-sage text-cream",
  cancelled: "bg-line text-ink-soft line-through",
  done: "bg-ink text-cream",
};

// Blocos de duas cores da Visão Dia: cabeçalho (horário) mais saturado, corpo mais suave.
export const ESTILO_BLOCO_CABECALHO: Record<string, string> = {
  scheduled: "bg-amber text-cream",
  confirmed: "bg-sage text-cream",
  done: "bg-ink text-cream",
};

export const ESTILO_BLOCO_CORPO: Record<string, string> = {
  scheduled: "bg-amber-soft text-ink",
  confirmed: "bg-sage-soft text-ink",
  done: "bg-ink/85 text-cream",
};

export type AgendamentoLinha = {
  id: string;
  start_at: string;
  duration_min: number;
  status: "scheduled" | "confirmed" | "cancelled" | "done";
  price: number;
  payment_method: string | null;
  cliente: { name: string; phone: string } | null;
  servico: { name: string } | null;
};

function primeiroOuNull<T>(valor: T | T[] | null): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export async function buscarAgendamentosPeriodo(inicio: Date, fim: Date): Promise<AgendamentoLinha[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("appointments")
    .select("id, start_at, duration_min, status, price, payment_method, clients(name, phone), services(name)")
    .gte("start_at", inicio.toISOString())
    .lt("start_at", fim.toISOString())
    .order("start_at", { ascending: true });

  return (data ?? []).map((ag) => ({
    id: ag.id,
    start_at: ag.start_at,
    duration_min: ag.duration_min,
    status: ag.status,
    price: Number(ag.price),
    payment_method: ag.payment_method,
    cliente: primeiroOuNull(ag.clients),
    servico: primeiroOuNull(ag.services),
  }));
}

export type ContadorStatus = { total: number; concluido: number; confirmado: number; agendado: number };

// Contagem de agendamentos por status (cancelado nunca entra no total) — usado
// nos resumos de produtividade da Agenda (dia/semana/mês).
export function contarPorStatus(agendamentos: AgendamentoLinha[]): ContadorStatus {
  const contador: ContadorStatus = { total: 0, concluido: 0, confirmado: 0, agendado: 0 };
  for (const ag of agendamentos) {
    if (ag.status === "done") contador.concluido++;
    else if (ag.status === "confirmed") contador.confirmado++;
    else if (ag.status === "scheduled") contador.agendado++;
    else continue;
    contador.total++;
  }
  return contador;
}

export type ContadorPeriodoDia = { manha: number; tarde: number; noite: number };

function periodoDoDia(iso: string): "manha" | "tarde" | "noite" {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso))
  );
  if (hora < 12) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

// Contagem por período do dia (manhã <12h, tarde 12h–18h, noite ≥18h) — ajuda a
// ver de cara se o dia/semana está mais carregado de manhã ou de noite.
export function contarPorPeriodoDia(agendamentos: AgendamentoLinha[]): ContadorPeriodoDia {
  const contador: ContadorPeriodoDia = { manha: 0, tarde: 0, noite: 0 };
  for (const ag of agendamentos) {
    if (ag.status === "cancelled") continue;
    contador[periodoDoDia(ag.start_at)]++;
  }
  return contador;
}

// Retorna os agendamentos (não cancelados) que colidem com um novo horário proposto.
export function detectarConflitos(
  agendamentosDoDia: AgendamentoLinha[],
  novoInicioISO: string,
  novaDuracaoMin: number,
  ignorarId?: string
): AgendamentoLinha[] {
  const novoInicio = new Date(novoInicioISO).getTime();
  const novoFim = novoInicio + novaDuracaoMin * 60_000;

  return agendamentosDoDia.filter((ag) => {
    if (ag.status === "cancelled") return false;
    if (ag.id === ignorarId) return false;
    const inicio = new Date(ag.start_at).getTime();
    const fim = inicio + ag.duration_min * 60_000;
    return novoInicio < fim && inicio < novoFim;
  });
}

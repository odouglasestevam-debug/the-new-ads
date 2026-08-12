import { eachDayOfInterval, eachMonthOfInterval, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabaseAdmin } from "@/lib/supabase";
import { TAXA_MAQUINA } from "@/lib/agenda";

const TIMEZONE = "America/Sao_Paulo";

// Dia/mês local (não UTC) — importante porque um agendamento às 22h de SP já é
// outro dia em UTC, e faturamento tem que bater com o calendário local.
function diaLocalISO(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(iso));
}

function mesLocalISO(iso: string): string {
  return diaLocalISO(iso).slice(0, 7);
}

export type LinhaAgendamento = {
  start_at: string;
  price: number;
  status: "scheduled" | "confirmed" | "cancelled" | "done";
  payment_method: string | null;
  services: { name: string; category: string } | { name: string; category: string }[] | null;
};

export type ResumoFaturamento = {
  concluido: number;
  confirmado: number;
  agendado: number;
  total: number; // concluido + confirmado + agendado (cancelado nunca entra)
};

async function buscarAgendamentosNoPeriodo(inicio: Date, fim: Date): Promise<LinhaAgendamento[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("appointments")
    .select("start_at, price, status, payment_method, services(name, category)")
    .gte("start_at", inicio.toISOString())
    .lte("start_at", fim.toISOString());
  return data ?? [];
}

export function calcularResumo(linhas: LinhaAgendamento[]): ResumoFaturamento {
  const resumo: ResumoFaturamento = { concluido: 0, confirmado: 0, agendado: 0, total: 0 };
  for (const linha of linhas) {
    const valor = Number(linha.price);
    if (linha.status === "done") resumo.concluido += valor;
    else if (linha.status === "confirmed") resumo.confirmado += valor;
    else if (linha.status === "scheduled") resumo.agendado += valor;
    else continue; // cancelled não conta pro faturamento
    resumo.total += valor;
  }
  return resumo;
}

export async function resumoFaturamentoPeriodo(inicio: Date, fim: Date): Promise<ResumoFaturamento> {
  const linhas = await buscarAgendamentosNoPeriodo(inicio, fim);
  return calcularResumo(linhas);
}

// Variação percentual do faturamento total contra o período imediatamente anterior,
// de mesma duração (ex: mês atual vs mês anterior, últimos 7 dias vs os 7 antes desses).
export async function variacaoPeriodoAnterior(inicio: Date, fim: Date): Promise<number | null> {
  const duracaoMs = fim.getTime() - inicio.getTime();
  const inicioAnterior = new Date(inicio.getTime() - duracaoMs);
  const [atual, anterior] = await Promise.all([
    resumoFaturamentoPeriodo(inicio, fim),
    resumoFaturamentoPeriodo(inicioAnterior, inicio),
  ]);
  if (anterior.total === 0) return null; // sem base de comparação
  return ((atual.total - anterior.total) / anterior.total) * 100;
}

export type ResumoPagamento = { metodo: string; bruto: number; taxa: number; liquido: number };

// Faturamento por forma de pagamento — só considera agendamentos concluídos
// (é quando o pagamento de fato aconteceu). Já desconta a taxa da máquina
// (InfinityPay, débito/crédito à vista) pra mostrar o valor líquido real.
export async function resumoPorFormaPagamento(inicio: Date, fim: Date): Promise<ResumoPagamento[]> {
  const linhas = await buscarAgendamentosNoPeriodo(inicio, fim);
  const porMetodo = new Map<string, number>();
  for (const linha of linhas) {
    if (linha.status !== "done" || !linha.payment_method) continue;
    porMetodo.set(linha.payment_method, (porMetodo.get(linha.payment_method) ?? 0) + Number(linha.price));
  }
  return Array.from(porMetodo.entries()).map(([metodo, bruto]) => {
    const taxa = bruto * (TAXA_MAQUINA[metodo] ?? 0);
    return { metodo, bruto, taxa, liquido: bruto - taxa };
  });
}

export type ResumoServico = { nome: string; quantidade: number; total: number };

export type LinhaServico = ResumoServico & { categoria: string };

// Mesma ideia do resumoPorServico, mas sem cortar top 5 e com a categoria —
// base pra tanto "Top serviços" (financeiro) quanto os insights por categoria.
async function listarServicosNoPeriodo(inicio: Date, fim: Date): Promise<LinhaServico[]> {
  const linhas = await buscarAgendamentosNoPeriodo(inicio, fim);
  const porServico = new Map<string, LinhaServico>();
  for (const linha of linhas) {
    if (linha.status === "cancelled") continue;
    const servico = Array.isArray(linha.services) ? linha.services[0] : linha.services;
    const nome = servico?.name ?? "Serviço removido";
    const categoria = servico?.category ?? "outro";
    const atual = porServico.get(nome) ?? { nome, categoria, quantidade: 0, total: 0 };
    atual.quantidade += 1;
    atual.total += Number(linha.price);
    porServico.set(nome, atual);
  }
  return Array.from(porServico.values()).sort((a, b) => b.total - a.total);
}

// Top 5 serviços por faturamento no período — usado no card "Top serviços" do financeiro.
export async function resumoPorServico(inicio: Date, fim: Date): Promise<ResumoServico[]> {
  const servicos = await listarServicosNoPeriodo(inicio, fim);
  return servicos.slice(0, 5).map(({ nome, quantidade, total }) => ({ nome, quantidade, total }));
}

export type InsightCategoria ={ categoria: string; quantidade: number; total: number; servicos: ResumoServico[] };

// Insights de procedimentos: agrupa por categoria (cílios/sobrancelha/outro) e,
// dentro de cada categoria, mostra a técnica/serviço específico mais prestado.
export async function insightsPorCategoria(inicio: Date, fim: Date): Promise<InsightCategoria[]> {
  const servicos = await listarServicosNoPeriodo(inicio, fim);
  const porCategoria = new Map<string, InsightCategoria>();
  for (const s of servicos) {
    const atual = porCategoria.get(s.categoria) ?? { categoria: s.categoria, quantidade: 0, total: 0, servicos: [] };
    atual.quantidade += s.quantidade;
    atual.total += s.total;
    atual.servicos.push({ nome: s.nome, quantidade: s.quantidade, total: s.total });
    porCategoria.set(s.categoria, atual);
  }
  return Array.from(porCategoria.values()).sort((a, b) => b.total - a.total);
}

export type ClienteRanking = { id: string; nome: string; valor: number };

// Ranking de clientes no período — por receita (soma do price) ou por número
// de atendimentos (contagem), igual ao seletor "Tipo" do Minha Agenda.
export async function rankingClientes(
  inicio: Date,
  fim: Date,
  tipo: "receita" | "atendimentos"
): Promise<ClienteRanking[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("appointments")
    .select("price, status, clients(id, name)")
    .gte("start_at", inicio.toISOString())
    .lt("start_at", fim.toISOString());

  const porCliente = new Map<string, ClienteRanking>();
  for (const ag of data ?? []) {
    if (ag.status === "cancelled") continue;
    const cliente = Array.isArray(ag.clients) ? ag.clients[0] : ag.clients;
    if (!cliente) continue;
    const atual = porCliente.get(cliente.id) ?? { id: cliente.id, nome: cliente.name, valor: 0 };
    atual.valor += tipo === "receita" ? Number(ag.price) : 1;
    porCliente.set(cliente.id, atual);
  }
  return Array.from(porCliente.values()).sort((a, b) => b.valor - a.valor).slice(0, 30);
}

export type ResumoClientes = { totalClientes: number; novosClientes: number };

export async function resumoClientes(inicio: Date, fim: Date): Promise<ResumoClientes> {
  const db = supabaseAdmin();
  const [{ count: totalClientes }, { count: novosClientes }] = await Promise.all([
    db.from("clients").select("id", { count: "exact", head: true }),
    db
      .from("clients")
      .select("id", { count: "exact", head: true })
      .gte("created_at", inicio.toISOString())
      .lt("created_at", fim.toISOString()),
  ]);
  return { totalClientes: totalClientes ?? 0, novosClientes: novosClientes ?? 0 };
}

// Constrói a data UTC correspondente à meia-noite local (São Paulo, -03:00
// fixo, sem horário de verão desde 2019) de um dia "YYYY-MM-DD".
export function inicioDiaLocal(dataYYYYMMDD: string): Date {
  return new Date(`${dataYYYYMMDD}T00:00:00-03:00`);
}

export type PontoSerie = { rotulo: string; total: number };

// Série diária (usada na visão de mês): soma o valor de cada dia dentro do intervalo.
export async function serieDiaria(inicio: Date, fim: Date): Promise<PontoSerie[]> {
  const linhas = await buscarAgendamentosNoPeriodo(inicio, fim);
  const dias = eachDayOfInterval({ start: inicio, end: fim });
  return dias.map((dia) => {
    const chaveDia = format(dia, "yyyy-MM-dd");
    const total = linhas
      .filter((l) => l.status !== "cancelled" && diaLocalISO(l.start_at) === chaveDia)
      .reduce((soma, l) => soma + Number(l.price), 0);
    return { rotulo: format(dia, "dd/MM"), total };
  });
}

// Série mensal (usada na visão de ano): soma o valor de cada mês dentro do intervalo.
export async function serieMensal(inicio: Date, fim: Date): Promise<PontoSerie[]> {
  const linhas = await buscarAgendamentosNoPeriodo(inicio, fim);
  const meses = eachMonthOfInterval({ start: inicio, end: fim });
  return meses.map((mes) => {
    const chaveMes = format(mes, "yyyy-MM");
    const total = linhas
      .filter((l) => l.status !== "cancelled" && mesLocalISO(l.start_at) === chaveMes)
      .reduce((soma, l) => soma + Number(l.price), 0);
    return { rotulo: format(mes, "MMM/yy", { locale: ptBR }), total };
  });
}

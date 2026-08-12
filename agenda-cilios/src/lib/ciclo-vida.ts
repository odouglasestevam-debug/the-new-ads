import { differenceInCalendarDays } from "date-fns";
import { supabaseAdmin } from "@/lib/supabase";
import { inicioDiaLocal } from "@/lib/dashboard";
import { hojeLocalISO } from "@/lib/periodo";
import { CICLO_DIAS_ATIVA, CICLO_DIAS_ATRASADA, CICLO_DIAS_INATIVA } from "@/lib/agenda";

export type StatusCiclo = "ativa" | "atrasada" | "inativa" | "perdida";

export type ClienteCiclo = {
  id: string;
  nome: string;
  telefone: string;
  ultimaVisita: string; // yyyy-MM-dd local
  tipoUltimaVisita: "aplicacao" | "manutencao";
  tecnica: string;
  diasDesde: number;
  status: StatusCiclo;
  totalVisitas: number;
  apenasAplicacao: boolean; // fez aplicação(ões) mas nunca voltou pra manutenção
};

function diaLocalISO(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

function classificar(diasDesde: number): StatusCiclo {
  if (diasDesde <= CICLO_DIAS_ATIVA) return "ativa";
  if (diasDesde <= CICLO_DIAS_ATRASADA) return "atrasada";
  if (diasDesde <= CICLO_DIAS_INATIVA) return "inativa";
  return "perdida";
}

type LinhaBruta = {
  start_at: string;
  clients: { id: string; name: string; phone: string } | { id: string; name: string; phone: string }[] | null;
  services:
    | { name: string; tipo_procedimento: string | null }
    | { name: string; tipo_procedimento: string | null }[]
    | null;
};

function primeiro<T>(valor: T | T[] | null): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor;
}

type VisitaCiclo = { start_at: string; tipo: "aplicacao" | "manutencao"; tecnica: string };

// Ciclo de vida de cílios: histórico de visitas (aplicação/manutenção) de cada
// cliente — quantas vezes veio, se já fez manutenção, e há quanto tempo não volta.
export async function cicloVidaClientes(): Promise<ClienteCiclo[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("appointments")
    .select("start_at, clients(id, name, phone), services(name, tipo_procedimento)")
    .eq("status", "done")
    .order("start_at", { ascending: false });

  const hoje = inicioDiaLocal(hojeLocalISO());
  const clientesInfo = new Map<string, { nome: string; telefone: string }>();
  const visitasPorCliente = new Map<string, VisitaCiclo[]>();

  for (const linha of (data ?? []) as LinhaBruta[]) {
    const servico = primeiro(linha.services);
    const tipo = servico?.tipo_procedimento;
    if (tipo !== "aplicacao" && tipo !== "manutencao") continue;

    const cliente = primeiro(linha.clients);
    if (!cliente) continue;

    clientesInfo.set(cliente.id, { nome: cliente.name, telefone: cliente.phone });
    const visitas = visitasPorCliente.get(cliente.id) ?? [];
    visitas.push({ start_at: linha.start_at, tipo, tecnica: servico?.name ?? "" });
    visitasPorCliente.set(cliente.id, visitas);
  }

  const resultado: ClienteCiclo[] = [];
  for (const [id, visitas] of visitasPorCliente) {
    const info = clientesInfo.get(id);
    if (!info) continue;
    const ultima = visitas[0]; // já vem ordenado desc por start_at
    const diasDesde = differenceInCalendarDays(hoje, inicioDiaLocal(diaLocalISO(ultima.start_at)));
    resultado.push({
      id,
      nome: info.nome,
      telefone: info.telefone,
      ultimaVisita: diaLocalISO(ultima.start_at),
      tipoUltimaVisita: ultima.tipo,
      tecnica: ultima.tecnica,
      diasDesde,
      status: classificar(diasDesde),
      totalVisitas: visitas.length,
      apenasAplicacao: visitas.every((v) => v.tipo === "aplicacao"),
    });
  }

  return resultado.sort((a, b) => b.diasDesde - a.diasDesde);
}

export type ResumoCiclo = { ativas: number; atrasadas: number; inativas: number; perdidas: number };

export function resumirCiclo(clientes: ClienteCiclo[]): ResumoCiclo {
  const resumo: ResumoCiclo = { ativas: 0, atrasadas: 0, inativas: 0, perdidas: 0 };
  for (const c of clientes) {
    if (c.status === "ativa") resumo.ativas++;
    else if (c.status === "atrasada") resumo.atrasadas++;
    else if (c.status === "inativa") resumo.inativas++;
    else resumo.perdidas++;
  }
  return resumo;
}

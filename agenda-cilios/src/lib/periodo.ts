import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { inicioDiaLocal } from "@/lib/dashboard";

export type Periodo =
  | "hoje"
  | "ontem"
  | "semana"
  | "ultimos7"
  | "mes"
  | "mes_passado"
  | "ultimos30"
  | "ano"
  | "personalizado";

export const PRESETS_PERIODO: { periodo: Periodo; rotulo: string }[] = [
  { periodo: "hoje", rotulo: "Hoje" },
  { periodo: "ontem", rotulo: "Ontem" },
  { periodo: "semana", rotulo: "Esta semana" },
  { periodo: "ultimos7", rotulo: "Últimos 7 dias" },
  { periodo: "mes", rotulo: "Este mês" },
  { periodo: "mes_passado", rotulo: "Mês passado" },
  { periodo: "ultimos30", rotulo: "Últimos 30 dias" },
  { periodo: "ano", rotulo: "Este ano" },
  { periodo: "personalizado", rotulo: "Personalizado" },
];

export function hojeLocalISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export type IntervaloResolvido = {
  periodo: Periodo;
  inicio: Date;
  fim: Date; // exclusivo
  inicioInput: string;
  fimInput: string;
  rotulo: string;
};

function chave(data: Date): string {
  return format(data, "yyyy-MM-dd");
}

// Resolve os query params de período (compartilhado entre as abas do Analytics)
// pro intervalo [inicio, fim) correspondente, sempre em horário local de SP.
export function resolverPeriodo(params: { periodo?: string; inicio?: string; fim?: string }): IntervaloResolvido {
  // Sem período na URL (primeira visita) mostra últimos 30 dias por padrão —
  // "hoje" isolado costuma vir vazio e dá a falsa impressão de que não há dados.
  const periodo: Periodo = (params.periodo as Periodo) ?? "ultimos30";
  const hojeStr = hojeLocalISO();
  const hoje = inicioDiaLocal(hojeStr);
  const rotulo = PRESETS_PERIODO.find((p) => p.periodo === periodo)?.rotulo ?? "Personalizado";

  switch (periodo) {
    case "hoje":
      return { periodo, inicio: hoje, fim: addDays(hoje, 1), inicioInput: hojeStr, fimInput: hojeStr, rotulo };
    case "ontem": {
      const inicio = addDays(hoje, -1);
      const dia = chave(inicio);
      return { periodo, inicio, fim: hoje, inicioInput: dia, fimInput: dia, rotulo };
    }
    case "semana": {
      const inicio = inicioDiaLocal(chave(startOfWeek(hoje)));
      const fimDia = inicioDiaLocal(chave(endOfWeek(hoje)));
      return { periodo, inicio, fim: addDays(fimDia, 1), inicioInput: chave(inicio), fimInput: chave(fimDia), rotulo };
    }
    case "ultimos7": {
      const inicio = addDays(hoje, -6);
      return { periodo, inicio, fim: addDays(hoje, 1), inicioInput: chave(inicio), fimInput: hojeStr, rotulo };
    }
    case "mes": {
      const inicio = inicioDiaLocal(chave(startOfMonth(hoje)));
      const fimDia = inicioDiaLocal(chave(endOfMonth(hoje)));
      return { periodo, inicio, fim: addDays(fimDia, 1), inicioInput: chave(inicio), fimInput: chave(fimDia), rotulo };
    }
    case "mes_passado": {
      const mesPassado = subMonths(hoje, 1);
      const inicio = inicioDiaLocal(chave(startOfMonth(mesPassado)));
      const fimDia = inicioDiaLocal(chave(endOfMonth(mesPassado)));
      return { periodo, inicio, fim: addDays(fimDia, 1), inicioInput: chave(inicio), fimInput: chave(fimDia), rotulo };
    }
    case "ultimos30": {
      const inicio = subDays(hoje, 29);
      return { periodo, inicio, fim: addDays(hoje, 1), inicioInput: chave(inicio), fimInput: hojeStr, rotulo };
    }
    case "ano": {
      const inicio = inicioDiaLocal(chave(startOfYear(hoje)));
      const fimDia = inicioDiaLocal(chave(endOfYear(hoje)));
      return { periodo, inicio, fim: addDays(fimDia, 1), inicioInput: chave(inicio), fimInput: chave(fimDia), rotulo };
    }
    case "personalizado":
    default: {
      const inicioInput = params.inicio ?? hojeStr;
      const fimInput = params.fim ?? hojeStr;
      const inicio = inicioDiaLocal(inicioInput);
      const fim = addDays(inicioDiaLocal(fimInput), 1);
      return { periodo: "personalizado", inicio, fim, inicioInput, fimInput, rotulo: "Personalizado" };
    }
  }
}

import { supabaseAdmin } from "@/lib/supabase";

export type Despesa = {
  id: string;
  nome: string;
  tipo: "fixa" | "variavel";
  recorrencia: "mensal" | "unica";
  valor: number;
  dia_vencimento: number | null;
  data: string | null;
  ativo: boolean;
};

export async function listarDespesas(): Promise<Despesa[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("despesas")
    .select("id, nome, tipo, recorrencia, valor, dia_vencimento, data, ativo")
    .eq("ativo", true)
    .order("recorrencia", { ascending: false })
    .order("dia_vencimento");
  return data ?? [];
}

export type ResumoDespesas = {
  totalFixoMensal: number;
  totalVariavelMensal: number;
};

// Soma só as despesas fixas recorrentes (aluguel, contas) e as variáveis
// recorrentes mensais — despesas únicas não entram no "custo fixo do mês".
export function resumirDespesas(despesas: Despesa[]): ResumoDespesas {
  const resumo: ResumoDespesas = { totalFixoMensal: 0, totalVariavelMensal: 0 };
  for (const d of despesas) {
    if (d.recorrencia !== "mensal") continue;
    if (d.tipo === "fixa") resumo.totalFixoMensal += Number(d.valor);
    else resumo.totalVariavelMensal += Number(d.valor);
  }
  return resumo;
}

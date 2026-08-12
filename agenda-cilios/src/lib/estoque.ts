import { supabaseAdmin } from "@/lib/supabase";

export const ROTULO_CATEGORIA_ESTOQUE: Record<string, string> = {
  cilios: "Cílios",
  cola: "Cola",
  fita: "Fita/Tape",
  ferramentas: "Ferramentas",
  outro: "Outro",
};

export type ItemEstoque = {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade_atual: number;
  estoque_minimo: number;
  custo_unitario: number;
  ultima_compra_em: string | null;
  ativo: boolean;
};

export type MovimentoEstoque = {
  id: string;
  item_id: string;
  tipo: "compra" | "consumo" | "ajuste";
  direcao: "entrada" | "saida";
  quantidade: number;
  valor_total: number | null;
  fornecedor: string | null;
  observacao: string | null;
  created_at: string;
};

export async function listarItensEstoque(): Promise<ItemEstoque[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("estoque_itens")
    .select("id, nome, categoria, unidade, quantidade_atual, estoque_minimo, custo_unitario, ultima_compra_em, ativo")
    .eq("ativo", true)
    .order("nome");
  return data ?? [];
}

export async function listarMovimentosDoItem(itemId: string, limite = 10): Promise<MovimentoEstoque[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("estoque_movimentos")
    .select("id, item_id, tipo, direcao, quantidade, valor_total, fornecedor, observacao, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(limite);
  return data ?? [];
}

export function itemComEstoqueBaixo(item: ItemEstoque): boolean {
  return item.quantidade_atual <= item.estoque_minimo;
}

export type ResumoEstoque = {
  totalItens: number;
  itensBaixos: number;
  valorEmEstoque: number;
  ultimaCompraEm: string | null;
};

export function resumirEstoque(itens: ItemEstoque[]): ResumoEstoque {
  let valorEmEstoque = 0;
  let itensBaixos = 0;
  let ultimaCompraEm: string | null = null;

  for (const item of itens) {
    valorEmEstoque += item.quantidade_atual * item.custo_unitario;
    if (itemComEstoqueBaixo(item)) itensBaixos += 1;
    if (item.ultima_compra_em && (!ultimaCompraEm || item.ultima_compra_em > ultimaCompraEm)) {
      ultimaCompraEm = item.ultima_compra_em;
    }
  }

  return { totalItens: itens.length, itensBaixos, valorEmEstoque, ultimaCompraEm };
}

export async function listarItensEstoqueBaixo(): Promise<ItemEstoque[]> {
  const itens = await listarItensEstoque();
  return itens.filter(itemComEstoqueBaixo);
}

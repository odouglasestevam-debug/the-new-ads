"use client";

import { useState } from "react";
import { arquivarItemEstoque, registrarAjusteEstoque, registrarCompraEstoque } from "@/app/actions";
import { ROTULO_CATEGORIA_ESTOQUE, itemComEstoqueBaixo, type ItemEstoque } from "@/lib/estoque";

const campo = "w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-rose";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function ItemEstoqueCard({ item }: { item: ItemEstoque }) {
  const [aberto, setAberto] = useState<"compra" | "ajuste" | null>(null);
  const baixo = itemComEstoqueBaixo(item);

  async function aoSubmeter(action: (formData: FormData) => Promise<void>, formData: FormData) {
    await action(formData);
    setAberto(null);
  }

  return (
    <div className={`sombra-cartao rounded-xl border bg-surface p-4 ${baixo ? "border-amber" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink">{item.nome}</p>
            {baixo && (
              <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">Estoque baixo</span>
            )}
          </div>
          <p className="text-sm text-ink-soft">
            {ROTULO_CATEGORIA_ESTOQUE[item.categoria] ?? item.categoria} ·{" "}
            <span className="tabular">{item.quantidade_atual}</span> {item.unidade}
            {item.estoque_minimo > 0 && <> (mín. {item.estoque_minimo})</>}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {item.ultima_compra_em ? <>Última compra em {formatarData(item.ultima_compra_em)}</> : "Sem compra registrada"}
            {item.custo_unitario > 0 && <> · custo médio {formatarReais(item.custo_unitario)}/{item.unidade}</>}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setAberto(aberto === "compra" ? null : "compra")}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            Registrar compra
          </button>
          <button
            type="button"
            onClick={() => setAberto(aberto === "ajuste" ? null : "ajuste")}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
          >
            Ajustar
          </button>
          <button
            type="button"
            onClick={() => arquivarItemEstoque(item.id)}
            className="text-sm text-ink-soft underline hover:text-vermelho"
          >
            Arquivar
          </button>
        </div>
      </div>

      {aberto === "compra" && (
        <form
          action={(fd) => aoSubmeter(registrarCompraEstoque, fd)}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-cream p-3"
        >
          <input type="hidden" name="item_id" value={item.id} />
          <div className="w-28">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Quantidade</label>
            <input name="quantidade" type="number" min={0.01} step="0.01" required className={campo} />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Valor total (R$)</label>
            <input name="valor_total" type="number" min={0} step="0.01" className={campo} />
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Fornecedor (opcional)</label>
            <input name="fornecedor" className={campo} />
          </div>
          <button type="submit" className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-rose-dark">
            Salvar
          </button>
        </form>
      )}

      {aberto === "ajuste" && (
        <form
          action={(fd) => aoSubmeter(registrarAjusteEstoque, fd)}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-cream p-3"
        >
          <input type="hidden" name="item_id" value={item.id} />
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Direção</label>
            <select name="direcao" defaultValue="saida" className={campo}>
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </select>
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Quantidade</label>
            <input name="quantidade" type="number" min={0.01} step="0.01" required className={campo} />
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Motivo (opcional)</label>
            <input name="observacao" placeholder="Ex: contagem física, quebra, uso" className={campo} />
          </div>
          <button type="submit" className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-rose-dark">
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}

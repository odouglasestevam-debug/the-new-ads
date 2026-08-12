"use client";

import { arquivarDespesa } from "@/app/actions";
import type { Despesa } from "@/lib/despesas";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function DespesaRow({ despesa }: { despesa: Despesa }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink">{despesa.nome}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${despesa.tipo === "fixa" ? "bg-rose-soft text-rose" : "bg-amber-soft text-amber"}`}>
            {despesa.tipo === "fixa" ? "Fixa" : "Variável"}
          </span>
        </div>
        <p className="text-sm text-ink-soft">
          {despesa.recorrencia === "mensal"
            ? despesa.dia_vencimento
              ? `Mensal · todo dia ${despesa.dia_vencimento}`
              : "Mensal"
            : despesa.data
              ? `Única · ${formatarData(despesa.data)}`
              : "Única"}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className="font-medium text-ink">{formatarReais(despesa.valor)}</p>
        <button type="button" onClick={() => arquivarDespesa(despesa.id)} className="text-sm text-ink-soft underline hover:text-vermelho">
          Arquivar
        </button>
      </div>
    </div>
  );
}

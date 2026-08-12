"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ResumoServico } from "@/lib/dashboard";

const CORES = ["#7c3aed", "#16a34a", "#d97706", "#6425c4", "#1f2333"];

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function GraficoServicos({ dados }: { dados: ResumoServico[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-ink-soft">Sem dados nesse período.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={200} className="sm:max-w-[200px]">
        <PieChart>
          <Pie data={dados} dataKey="total" nameKey="nome" innerRadius={40} outerRadius={80} paddingAngle={2}>
            {dados.map((_, i) => (
              <Cell key={i} fill={CORES[i % CORES.length]} stroke="none" />
            ))}
          </Pie>
          <Tooltip formatter={(valor) => formatarReais(Number(valor))} />
        </PieChart>
      </ResponsiveContainer>

      <ul className="w-full space-y-2">
        {dados.map((s, i) => (
          <li key={s.nome} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CORES[i % CORES.length] }} />
            <span className="flex-1 text-ink">
              {s.nome} <span className="text-ink-soft">({s.quantidade})</span>
            </span>
            <span className="font-medium text-ink">{formatarReais(s.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

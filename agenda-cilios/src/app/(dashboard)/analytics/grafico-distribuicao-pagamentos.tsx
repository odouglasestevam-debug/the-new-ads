"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ResumoPagamento } from "@/lib/dashboard";
import { ROTULO_PAGAMENTO } from "@/lib/agenda";

const CORES: Record<string, string> = {
  dinheiro: "#16a34a",
  pix: "#d97706",
  credito: "#7c3aed",
  debito: "#6425c4",
  cortesia: "#6b7280",
};

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Fatia do universo total de pagamentos que cada forma representa — a
// pergunta "de tudo que entrou, quanto veio de cada canal" numa olhada só.
export function GraficoDistribuicaoPagamentos({ pagamentos }: { pagamentos: ResumoPagamento[] }) {
  const dados = pagamentos.filter((p) => p.bruto > 0);
  const total = dados.reduce((s, p) => s + p.bruto, 0);

  if (dados.length === 0 || total === 0) {
    return <p className="text-sm text-ink-soft">Sem dados nesse período.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={200} className="sm:max-w-[200px]">
        <PieChart>
          <Pie data={dados} dataKey="bruto" nameKey="metodo" innerRadius={40} outerRadius={80} paddingAngle={2}>
            {dados.map((p) => (
              <Cell key={p.metodo} fill={CORES[p.metodo] ?? "#1f2333"} stroke="none" />
            ))}
          </Pie>
          <Tooltip formatter={(valor) => formatarReais(Number(valor))} />
        </PieChart>
      </ResponsiveContainer>

      <ul className="w-full space-y-2">
        {dados
          .slice()
          .sort((a, b) => b.bruto - a.bruto)
          .map((p) => (
            <li key={p.metodo} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CORES[p.metodo] ?? "#1f2333" }} />
              <span className="flex-1 text-ink">
                {ROTULO_PAGAMENTO[p.metodo] ?? p.metodo}{" "}
                <span className="text-ink-soft">({((p.bruto / total) * 100).toFixed(0)}%)</span>
              </span>
              <span className="font-medium text-ink">{formatarReais(p.bruto)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

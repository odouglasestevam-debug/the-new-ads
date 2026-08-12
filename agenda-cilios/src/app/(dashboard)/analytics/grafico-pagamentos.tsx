"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type PontoPagamento = { rotulo: string; bruto: number; liquido: number };

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function GraficoPagamentos({ dados }: { dados: PontoPagamento[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(valor: number) => `R$${Math.round(valor).toLocaleString("pt-BR")}`}
          width={70}
        />
        <Tooltip
          formatter={(valor) => formatarReais(Number(valor))}
          labelStyle={{ color: "#1f2333" }}
          contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#6b7280" }} formatter={(v) => (v === "bruto" ? "Bruto" : "Líquido")} />
        <Bar dataKey="bruto" fill="#d97706" radius={[4, 4, 0, 0]} />
        <Bar dataKey="liquido" fill="#16a34a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

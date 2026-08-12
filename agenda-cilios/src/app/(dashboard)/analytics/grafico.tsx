"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PontoSerie } from "@/lib/dashboard";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function GraficoFaturamento({ dados }: { dados: PontoSerie[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(valor: number) => `R$${Math.round(valor / 1).toLocaleString("pt-BR")}`}
          width={70}
        />
        <Tooltip
          formatter={(valor) => formatarReais(Number(valor))}
          labelStyle={{ color: "#1f2333" }}
          contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <Bar dataKey="total" fill="#7c3aed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

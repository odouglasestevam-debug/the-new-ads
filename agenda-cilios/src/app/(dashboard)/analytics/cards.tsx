export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CardResumo({
  rotulo,
  valor,
  destaque,
  cor,
  variacao,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  cor?: string;
  variacao?: number | null;
}) {
  return (
    <div
      className={`sombra-cartao rounded-xl border p-4 ${
        destaque ? "border-ink bg-ink text-cream" : "border-line bg-surface"
      }`}
    >
      <p className={`text-xs font-medium ${destaque ? "text-cream/60" : "text-ink-soft"}`}>{rotulo}</p>
      <p className={`tabular mt-1 font-display text-2xl ${destaque ? "text-cream" : cor ?? "text-ink"}`}>
        {formatarReais(valor)}
      </p>
      {typeof variacao === "number" && (
        <p className={`mt-1 text-xs font-medium ${variacao >= 0 ? "text-sage" : "text-vermelho"} ${destaque ? "brightness-125" : ""}`}>
          {variacao >= 0 ? "↑" : "↓"} {Math.abs(variacao).toFixed(1)}% vs período anterior
        </p>
      )}
    </div>
  );
}

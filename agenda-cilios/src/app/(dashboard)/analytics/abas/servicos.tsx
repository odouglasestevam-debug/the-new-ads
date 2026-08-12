import { insightsPorCategoria } from "@/lib/dashboard";
import { resolverPeriodo } from "@/lib/periodo";
import { ROTULO_CATEGORIA_SERVICO } from "@/lib/agenda";
import { SeletorPeriodo } from "../seletor-periodo";
import { GraficoServicos } from "../grafico-servicos";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function AbaServicos({ params }: { params: { periodo?: string; inicio?: string; fim?: string } }) {
  const { periodo, inicio, fim, inicioInput, fimInput } = resolverPeriodo(params);
  const categorias = await insightsPorCategoria(inicio, fim);

  return (
    <div>
      <SeletorPeriodo aba="servicos" periodo={periodo} inicioInput={inicioInput} fimInput={fimInput} />

      {categorias.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum atendimento nesse período.</p>
      ) : (
        <div className="space-y-4">
          {categorias.map((cat) => (
            <div key={cat.categoria} className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                  {ROTULO_CATEGORIA_SERVICO[cat.categoria] ?? cat.categoria}
                </h2>
                <p className="text-sm text-ink-soft">
                  {cat.quantidade} atendimentos · <span className="font-medium text-ink">{formatarReais(cat.total)}</span>
                </p>
              </div>
              <GraficoServicos dados={cat.servicos} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

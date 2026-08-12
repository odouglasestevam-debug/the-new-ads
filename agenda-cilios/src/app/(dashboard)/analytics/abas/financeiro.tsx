import { addDays } from "date-fns";
import { resumoFaturamentoPeriodo, resumoPorServico, serieDiaria, serieMensal, variacaoPeriodoAnterior } from "@/lib/dashboard";
import { resolverPeriodo } from "@/lib/periodo";
import { SeletorPeriodo } from "../seletor-periodo";
import { GraficoFaturamento } from "../grafico";
import { GraficoServicos } from "../grafico-servicos";
import { CardResumo } from "../cards";

export async function AbaFinanceiro({ params }: { params: { periodo?: string; inicio?: string; fim?: string } }) {
  const { periodo, inicio, fim, inicioInput, fimInput } = resolverPeriodo(params);

  const [resumo, serie, variacao, servicos] = await Promise.all([
    resumoFaturamentoPeriodo(inicio, fim),
    periodo === "ano" ? serieMensal(inicio, addDays(fim, -1)) : serieDiaria(inicio, addDays(fim, -1)),
    variacaoPeriodoAnterior(inicio, fim),
    resumoPorServico(inicio, fim),
  ]);

  return (
    <div>
      <SeletorPeriodo aba="financeiro" periodo={periodo} inicioInput={inicioInput} fimInput={fimInput} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CardResumo rotulo="Total" valor={resumo.total} variacao={variacao} destaque />
        <CardResumo rotulo="Concluído" valor={resumo.concluido} cor="text-ink" />
        <CardResumo rotulo="Confirmado" valor={resumo.confirmado} cor="text-sage" />
        <CardResumo rotulo="Agendado" valor={resumo.agendado} cor="text-amber" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="mb-4 text-sm font-medium text-ink-soft">Evolução do período</p>
          <GraficoFaturamento dados={serie} />
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="mb-4 text-sm font-medium text-ink-soft">Top serviços</p>
          <GraficoServicos dados={servicos} />
        </div>
      </div>
    </div>
  );
}

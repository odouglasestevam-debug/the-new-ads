import { resumoFaturamentoPeriodo, resumoPorFormaPagamento, variacaoPeriodoAnterior, type ResumoPagamento } from "@/lib/dashboard";
import { resolverPeriodo } from "@/lib/periodo";
import { ROTULO_PAGAMENTO, TAXA_MAQUINA } from "@/lib/agenda";
import { SeletorPeriodo } from "../seletor-periodo";
import { CardResumo, formatarReais } from "../cards";
import { GraficoPagamentos } from "../grafico-pagamentos";
import { GraficoDistribuicaoPagamentos } from "../grafico-distribuicao-pagamentos";

const GRUPOS_RAPIDOS: { rotulo: string; metodos: string[] }[] = [
  { rotulo: "Cartão", metodos: ["credito", "debito"] },
  { rotulo: "Dinheiro", metodos: ["dinheiro"] },
  { rotulo: "Pix", metodos: ["pix"] },
];

function somarGrupo(pagamentos: ResumoPagamento[], metodos: string[]) {
  return pagamentos
    .filter((p) => metodos.includes(p.metodo))
    .reduce(
      (acc, p) => ({ bruto: acc.bruto + p.bruto, taxa: acc.taxa + p.taxa, liquido: acc.liquido + p.liquido }),
      { bruto: 0, taxa: 0, liquido: 0 }
    );
}

export async function AbaPagamentos({ params }: { params: { periodo?: string; inicio?: string; fim?: string } }) {
  const { periodo, inicio, fim, inicioInput, fimInput } = resolverPeriodo(params);

  const [resumo, variacao, pagamentos] = await Promise.all([
    resumoFaturamentoPeriodo(inicio, fim),
    variacaoPeriodoAnterior(inicio, fim),
    resumoPorFormaPagamento(inicio, fim),
  ]);

  const totalTaxa = pagamentos.reduce((s, p) => s + p.taxa, 0);
  const totalLiquido = pagamentos.reduce((s, p) => s + p.liquido, 0);
  const cartao = somarGrupo(pagamentos, ["credito", "debito"]);
  const credito = pagamentos.find((p) => p.metodo === "credito");
  const debito = pagamentos.find((p) => p.metodo === "debito");

  const dadosGrafico = GRUPOS_RAPIDOS.map((g) => {
    const { bruto, liquido } = somarGrupo(pagamentos, g.metodos);
    return { rotulo: g.rotulo, bruto, liquido };
  });

  return (
    <div>
      <SeletorPeriodo aba="pagamentos" periodo={periodo} inicioInput={inicioInput} fimInput={fimInput} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CardResumo rotulo="Total" valor={resumo.total} variacao={variacao} destaque />
        <CardResumo rotulo="Concluído" valor={resumo.concluido} cor="text-ink" />
        <CardResumo rotulo="Confirmado" valor={resumo.confirmado} cor="text-sage" />
        <CardResumo rotulo="Agendado" valor={resumo.agendado} cor="text-amber" />
      </div>

      {pagamentos.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum pagamento concluído nesse período.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="sombra-cartao rounded-xl border border-ink bg-ink p-4 text-cream">
              <p className="text-xs font-medium text-cream/60">Total líquido recebido</p>
              <p className="tabular mt-1 font-display text-2xl">{formatarReais(totalLiquido)}</p>
              <p className="mt-1 text-xs font-medium text-vermelho brightness-110">−{formatarReais(totalTaxa)} de taxa</p>
            </div>
            {GRUPOS_RAPIDOS.map((grupo) => {
              const { taxa, liquido } = somarGrupo(pagamentos, grupo.metodos);
              return (
                <div key={grupo.rotulo} className="sombra-cartao rounded-xl border border-line bg-surface p-4">
                  <p className="text-xs font-medium text-ink-soft">Pago no {grupo.rotulo.toLowerCase()}</p>
                  <p className="tabular mt-1 font-display text-2xl text-sage">{formatarReais(liquido)}</p>
                  <p className="mt-1 text-xs font-medium text-ink-soft">
                    {taxa > 0 ? `−${formatarReais(taxa)} de taxa` : "sem taxa"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mb-6 rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink-soft">Detalhe do cartão</p>
              <p className="text-xs text-ink-soft">Taxas InfinityPay, à vista (sem parcelamento)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-soft">
                    <th className="pb-2 font-medium">Bandeira</th>
                    <th className="pb-2 font-medium">Bruto</th>
                    <th className="pb-2 font-medium">Taxa</th>
                    <th className="pb-2 font-medium">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line">
                    <td className="py-2 text-ink">Crédito à vista</td>
                    <td className="py-2 text-ink">{formatarReais(credito?.bruto ?? 0)}</td>
                    <td className="py-2 text-ink-soft">{(TAXA_MAQUINA.credito * 100).toFixed(2)}% · {formatarReais(credito?.taxa ?? 0)}</td>
                    <td className="py-2 font-medium text-sage">{formatarReais(credito?.liquido ?? 0)}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="py-2 text-ink">Débito</td>
                    <td className="py-2 text-ink">{formatarReais(debito?.bruto ?? 0)}</td>
                    <td className="py-2 text-ink-soft">{(TAXA_MAQUINA.debito * 100).toFixed(2)}% · {formatarReais(debito?.taxa ?? 0)}</td>
                    <td className="py-2 font-medium text-sage">{formatarReais(debito?.liquido ?? 0)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-medium">
                    <td className="py-2 text-ink">Subtotal cartão</td>
                    <td className="py-2 text-ink">{formatarReais(cartao.bruto)}</td>
                    <td className="py-2 text-vermelho">−{formatarReais(cartao.taxa)}</td>
                    <td className="py-2 text-sage">{formatarReais(cartao.liquido)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="text-sm font-medium text-ink-soft">Recebido por forma de pagamento</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-soft">
                      <th className="pb-2 font-medium">Forma</th>
                      <th className="pb-2 font-medium">Bruto</th>
                      <th className="pb-2 font-medium">Taxa</th>
                      <th className="pb-2 font-medium">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(ROTULO_PAGAMENTO).map((metodo) => {
                      const item = pagamentos.find((p) => p.metodo === metodo);
                      if (!item) return null;
                      const taxaPct = TAXA_MAQUINA[metodo] ?? 0;
                      return (
                        <tr key={metodo} className="border-t border-line">
                          <td className="py-2 text-ink">{ROTULO_PAGAMENTO[metodo]}</td>
                          <td className="py-2 text-ink">{formatarReais(item.bruto)}</td>
                          <td className="py-2 text-ink-soft">
                            {taxaPct > 0 ? `${(taxaPct * 100).toFixed(2)}% · ${formatarReais(item.taxa)}` : "—"}
                          </td>
                          <td className="py-2 font-medium text-sage">{formatarReais(item.liquido)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line font-medium">
                      <td className="py-2 text-ink">Total</td>
                      <td className="py-2 text-ink">{formatarReais(pagamentos.reduce((s, p) => s + p.bruto, 0))}</td>
                      <td className="py-2 text-vermelho">−{formatarReais(totalTaxa)}</td>
                      <td className="py-2 text-sage">{formatarReais(totalLiquido)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="mb-4 text-sm font-medium text-ink-soft">Bruto x líquido por forma</p>
              <GraficoPagamentos dados={dadosGrafico} />
            </div>

            <div className="rounded-xl border border-line bg-surface p-5 sm:col-span-2">
              <p className="mb-4 text-sm font-medium text-ink-soft">Universo total de pagamentos</p>
              <GraficoDistribuicaoPagamentos pagamentos={pagamentos} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

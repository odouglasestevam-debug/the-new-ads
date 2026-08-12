import Link from "next/link";
import { listarItensEstoque, resumirEstoque } from "@/lib/estoque";
import { listarDespesas, resumirDespesas } from "@/lib/despesas";
import { ItemEstoqueCard } from "./item-card";
import { DespesaRow } from "./despesa-row";
import { ModalNovoItemEstoque } from "./modal-novo-item";
import { ModalNovaDespesa } from "./modal-nova-despesa";

type Aba = "estoque" | "despesas";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const params = await searchParams;
  const aba: Aba = params.aba === "despesas" ? "despesas" : "estoque";

  const [itens, despesas] = await Promise.all([listarItensEstoque(), listarDespesas()]);
  const resumoEstoque = resumirEstoque(itens);
  const resumoDespesas = resumirDespesas(despesas);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Estoque & Custos</h1>
        {aba === "estoque" ? <ModalNovoItemEstoque /> : <ModalNovaDespesa />}
      </div>

      <div className="mb-6 flex gap-6 border-b border-line">
        <Link
          href="/estoque?aba=estoque"
          className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
            aba === "estoque" ? "border-rose text-ink" : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          Estoque
        </Link>
        <Link
          href="/estoque?aba=despesas"
          className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
            aba === "despesas" ? "border-rose text-ink" : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          Despesas fixas e variáveis
        </Link>
      </div>

      {aba === "estoque" && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-soft">Itens cadastrados</p>
              <p className="tabular mt-1 font-display text-2xl text-ink">{resumoEstoque.totalItens}</p>
            </div>
            <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-soft">Estoque baixo</p>
              <p className={`tabular mt-1 font-display text-2xl ${resumoEstoque.itensBaixos > 0 ? "text-amber" : "text-ink"}`}>
                {resumoEstoque.itensBaixos}
              </p>
            </div>
            <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-soft">Valor em estoque</p>
              <p className="tabular mt-1 font-display text-2xl text-ink">{formatarReais(resumoEstoque.valorEmEstoque)}</p>
            </div>
            <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-soft">Última compra</p>
              <p className="mt-1 font-display text-2xl text-ink">
                {resumoEstoque.ultimaCompraEm ? formatarData(resumoEstoque.ultimaCompraEm) : "—"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {itens.map((item) => (
              <ItemEstoqueCard key={item.id} item={item} />
            ))}
            {itens.length === 0 && <p className="text-sm text-ink-soft">Nenhum item de estoque cadastrado ainda.</p>}
          </div>
        </div>
      )}

      {aba === "despesas" && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-soft">Fixas por mês</p>
              <p className="tabular mt-1 font-display text-2xl text-ink">{formatarReais(resumoDespesas.totalFixoMensal)}</p>
            </div>
            <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-medium text-ink-soft">Variáveis por mês</p>
              <p className="tabular mt-1 font-display text-2xl text-ink">{formatarReais(resumoDespesas.totalVariavelMensal)}</p>
            </div>
            <div className="sombra-cartao rounded-xl border border-ink bg-ink p-4 text-cream">
              <p className="text-xs font-medium text-cream/60">Total recorrente por mês</p>
              <p className="tabular mt-1 font-display text-2xl">
                {formatarReais(resumoDespesas.totalFixoMensal + resumoDespesas.totalVariavelMensal)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {despesas.map((despesa) => (
              <DespesaRow key={despesa.id} despesa={despesa} />
            ))}
            {despesas.length === 0 && <p className="text-sm text-ink-soft">Nenhuma despesa cadastrada ainda.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

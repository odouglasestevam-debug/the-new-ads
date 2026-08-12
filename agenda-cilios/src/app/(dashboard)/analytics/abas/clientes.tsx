import { rankingClientes, resumoClientes } from "@/lib/dashboard";
import { resolverPeriodo } from "@/lib/periodo";
import { SeletorPeriodo } from "../seletor-periodo";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function AbaClientes({
  params,
}: {
  params: { periodo?: string; inicio?: string; fim?: string; tipo?: string };
}) {
  const { periodo, inicio, fim, inicioInput, fimInput } = resolverPeriodo(params);
  const tipo = params.tipo === "atendimentos" ? "atendimentos" : "receita";

  const [resumo, ranking] = await Promise.all([resumoClientes(inicio, fim), rankingClientes(inicio, fim, tipo)]);

  return (
    <div>
      <SeletorPeriodo aba="clientes" periodo={periodo} inicioInput={inicioInput} fimInput={fimInput} extraParams={`tipo=${tipo}`} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:w-96">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-soft">Total de clientes</p>
          <p className="mt-1 font-display text-2xl text-ink">{resumo.totalClientes}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-soft">Novos no período</p>
          <p className="mt-1 font-display text-2xl text-rose">{resumo.novosClientes}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <a
          href={`/analytics?aba=clientes&periodo=${periodo}&tipo=receita${periodo === "personalizado" ? `&inicio=${inicioInput}&fim=${fimInput}` : ""}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${tipo === "receita" ? "bg-ink text-cream" : "bg-rose-soft text-ink-soft"}`}
        >
          Por receita
        </a>
        <a
          href={`/analytics?aba=clientes&periodo=${periodo}&tipo=atendimentos${periodo === "personalizado" ? `&inicio=${inicioInput}&fim=${fimInput}` : ""}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${tipo === "atendimentos" ? "bg-ink text-cream" : "bg-rose-soft text-ink-soft"}`}
        >
          Por atendimentos
        </a>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="mb-4 text-sm text-ink-soft">
          Top {Math.min(ranking.length, 30)} melhores clientes por {tipo === "receita" ? "receita" : "número de atendimentos"}
        </p>

        {ranking.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum atendimento nesse período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-soft">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 text-right font-medium">{tipo === "receita" ? "Receita" : "Atendimentos"}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((c, i) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-2 text-ink-soft">{i + 1}º</td>
                  <td className="py-2 font-medium text-ink">{c.nome}</td>
                  <td className="py-2 text-right text-ink">{tipo === "receita" ? formatarReais(c.valor) : c.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

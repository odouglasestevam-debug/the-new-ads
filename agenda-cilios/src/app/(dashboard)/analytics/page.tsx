import { AbaFinanceiro } from "./abas/financeiro";
import { AbaPagamentos } from "./abas/pagamentos";
import { AbaClientes } from "./abas/clientes";
import { AbaServicos } from "./abas/servicos";

type Aba = "financeiro" | "pagamentos" | "clientes" | "servicos";

const ABAS: { aba: Aba; rotulo: string }[] = [
  { aba: "financeiro", rotulo: "Financeiro" },
  { aba: "pagamentos", rotulo: "Pagamentos" },
  { aba: "clientes", rotulo: "Melhores clientes" },
  { aba: "servicos", rotulo: "Serviços" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; periodo?: string; inicio?: string; fim?: string; tipo?: string }>;
}) {
  const params = await searchParams;
  const aba: Aba = (params.aba as Aba) ?? "financeiro";

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight text-ink">Analytics</h1>

      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
        {ABAS.map((item) => (
          <a
            key={item.aba}
            href={`/analytics?aba=${item.aba}`}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors ${
              aba === item.aba ? "border-rose text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {item.rotulo}
          </a>
        ))}
      </div>

      {aba === "financeiro" && <AbaFinanceiro params={params} />}
      {aba === "pagamentos" && <AbaPagamentos params={params} />}
      {aba === "clientes" && <AbaClientes params={params} />}
      {aba === "servicos" && <AbaServicos params={params} />}
    </div>
  );
}

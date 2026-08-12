import { cicloVidaClientes, resumirCiclo } from "@/lib/ciclo-vida";
import { CicloVidaView } from "./ciclo-vida-view";

type Aba = "ciclo" | "pipeline";

const ABAS: { aba: Aba; rotulo: string }[] = [
  { aba: "ciclo", rotulo: "Ciclo de vida" },
  { aba: "pipeline", rotulo: "Pipeline comercial" },
];

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const aba: Aba = (params.aba as Aba) ?? "ciclo";

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight text-ink">CRM</h1>

      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
        {ABAS.map((item) => (
          <a
            key={item.aba}
            href={`/crm?aba=${item.aba}`}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors ${
              aba === item.aba ? "border-rose text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {item.rotulo}
          </a>
        ))}
      </div>

      {aba === "ciclo" && <CicloDeVida />}
      {aba === "pipeline" && <PipelineComercial />}
    </div>
  );
}

async function CicloDeVida() {
  const clientes = await cicloVidaClientes();
  const resumo = resumirCiclo(clientes);

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:max-w-xl sm:grid-cols-4">
        <div className="sombra-cartao flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-xs font-medium text-ink-soft">Ativas</span>
          <span className="tabular font-display text-lg text-sage">{resumo.ativas}</span>
        </div>
        <div className="sombra-cartao flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-xs font-medium text-ink-soft">Atrasadas</span>
          <span className="tabular font-display text-lg text-amber">{resumo.atrasadas}</span>
        </div>
        <div className="sombra-cartao flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-xs font-medium text-ink-soft">Inativas</span>
          <span className="tabular font-display text-lg text-ink-soft">{resumo.inativas}</span>
        </div>
        <div className="sombra-cartao flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-xs font-medium text-ink-soft">Perdidas</span>
          <span className="tabular font-display text-lg text-vermelho">{resumo.perdidas}</span>
        </div>
      </div>

      <CicloVidaView clientes={clientes} />
    </div>
  );
}

function PipelineComercial() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <p className="mb-1 text-sm font-medium text-amber">Em construção</p>
      <p className="text-sm text-ink-soft">
        Aqui vai entrar o funil comercial: lead veio do anúncio → conversando → agendou a 1ª aplicação → convertida
        em cliente. Ainda não implementado.
      </p>
    </div>
  );
}

import Link from "next/link";
import { VisaoLista } from "./visoes/lista";
import { VisaoDia } from "./visoes/dia";
import { VisaoSemana } from "./visoes/semana";
import { VisaoMes } from "./visoes/mes";

type Visao = "lista" | "dia" | "semana" | "mes";

const ABAS: { visao: Visao; rotulo: string }[] = [
  { visao: "dia", rotulo: "Hoje" },
  { visao: "semana", rotulo: "Semana" },
  { visao: "mes", rotulo: "Mês" },
  { visao: "lista", rotulo: "Lista" },
];

function hojeLocalISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    visao?: string;
    modo?: string;
    data?: string;
    mes?: string;
    hora?: string;
  }>;
}) {
  const params = await searchParams;
  const visao: Visao = (params.visao as Visao) ?? "dia";
  const hoje = hojeLocalISO();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Agenda</h1>
      </div>

      <div className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
        {ABAS.map((aba) => (
          <Link
            key={aba.visao}
            href={`/agenda?visao=${aba.visao}`}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors ${
              visao === aba.visao ? "border-rose text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {aba.rotulo}
          </Link>
        ))}
      </div>

      {visao === "lista" && <VisaoLista data={params.data} hora={params.hora} />}
      {visao === "dia" && <VisaoDia data={params.data ?? hoje} />}
      {visao === "semana" && <VisaoSemana data={params.data ?? hoje} />}
      {visao === "mes" && (
        <VisaoMes mes={params.mes} modo={(params.modo as "contador" | "lista" | "calendario") ?? "contador"} />
      )}
    </div>
  );
}

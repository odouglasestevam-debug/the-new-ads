import type { ContadorPeriodoDia, ContadorStatus } from "@/lib/agenda";

export function ResumoStatus({ contador }: { contador: ContadorStatus }) {
  return (
    <div className="mb-4 grid grid-cols-4 gap-2">
      <Cartao rotulo="Total" valor={contador.total} destaque />
      <Cartao rotulo="Concluído" valor={contador.concluido} cor="text-ink" />
      <Cartao rotulo="Confirmado" valor={contador.confirmado} cor="text-sage" />
      <Cartao rotulo="Agendado" valor={contador.agendado} cor="text-amber" />
    </div>
  );
}

export function ResumoPeriodoDia({ contador }: { contador: ContadorPeriodoDia }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      <Cartao rotulo="Manhã" valor={contador.manha} cor="text-ink" pequeno />
      <Cartao rotulo="Tarde" valor={contador.tarde} cor="text-ink" pequeno />
      <Cartao rotulo="Noite" valor={contador.noite} cor="text-ink" pequeno />
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  destaque,
  cor,
  pequeno,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  cor?: string;
  pequeno?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-ink bg-ink text-cream" : "border-line bg-surface"}`}>
      <p className={`text-xs font-medium ${destaque ? "text-cream/60" : "text-ink-soft"}`}>{rotulo}</p>
      <p className={`mt-0.5 font-display ${pequeno ? "text-xl" : "text-2xl"} ${destaque ? "text-cream" : cor ?? "text-ink"}`}>
        {valor}
      </p>
    </div>
  );
}

import Link from "next/link";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { inicioDiaLocal } from "@/lib/dashboard";
import { buscarAgendamentosPeriodo, ESTILO_BLOCO_STATUS, ESTILO_STATUS, ROTULO_STATUS } from "@/lib/agenda";

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diaLocalISO(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export async function VisaoMes({ mes, modo }: { mes?: string; modo: "contador" | "lista" | "calendario" }) {
  const mesReferencia = mes ? inicioDiaLocal(`${mes}-01`) : new Date();
  const inicioMes = startOfMonth(mesReferencia);
  const fimMes = endOfMonth(mesReferencia);
  const inicioGrade = startOfWeek(inicioMes);
  const fimGrade = endOfWeek(fimMes);

  const agendamentos = await buscarAgendamentosPeriodo(
    inicioDiaLocal(format(inicioGrade, "yyyy-MM-dd")),
    addDays(inicioDiaLocal(format(fimGrade, "yyyy-MM-dd")), 1)
  );

  const porDia = new Map<string, typeof agendamentos>();
  for (const ag of agendamentos) {
    const chave = diaLocalISO(ag.start_at);
    if (!porDia.has(chave)) porDia.set(chave, []);
    porDia.get(chave)!.push(ag);
  }

  const mesAnterior = format(subMonths(inicioMes, 1), "yyyy-MM");
  const mesSeguinte = format(addMonths(inicioMes, 1), "yyyy-MM");

  const dias: Date[] = [];
  for (let d = inicioGrade; d <= fimGrade; d = addDays(d, 1)) dias.push(d);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight capitalize text-ink">
          {format(inicioMes, "MMMM yyyy", { locale: ptBR })}
        </h2>
        <div className="flex gap-2">
          <Link
            href={`/agenda?visao=mes&modo=${modo}&mes=${mesAnterior}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-rose hover:text-rose"
          >
            ← Anterior
          </Link>
          <Link
            href={`/agenda?visao=mes&modo=${modo}&mes=${mesSeguinte}`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-rose hover:text-rose"
          >
            Próximo →
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          href={`/agenda?visao=mes&modo=contador${mes ? `&mes=${mes}` : ""}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${modo === "contador" ? "bg-ink text-cream" : "bg-rose-soft text-ink-soft"}`}
        >
          Contador
        </Link>
        <Link
          href={`/agenda?visao=mes&modo=lista${mes ? `&mes=${mes}` : ""}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${modo === "lista" ? "bg-ink text-cream" : "bg-rose-soft text-ink-soft"}`}
        >
          Lista
        </Link>
        <Link
          href={`/agenda?visao=mes&modo=calendario${mes ? `&mes=${mes}` : ""}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${modo === "calendario" ? "bg-ink text-cream" : "bg-rose-soft text-ink-soft"}`}
        >
          Calendário
        </Link>
      </div>

      {modo === "contador" ? (
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="grid min-w-[560px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line text-xs sm:min-w-0">
            {DIAS_DA_SEMANA.map((dia) => (
              <div key={dia} className="bg-rose-soft px-2 py-1.5 text-center font-medium text-rose">
                {dia}
              </div>
            ))}

            {dias.map((dia) => {
              const chave = format(dia, "yyyy-MM-dd");
              const eventosDoDia = (porDia.get(chave) ?? []).filter((a) => a.status !== "cancelled");
              const foraDoMes = !isSameMonth(dia, inicioMes);
              const hoje = isToday(dia);

              return (
                <Link
                  key={chave}
                  href={`/agenda?visao=dia&data=${chave}`}
                  className={`flex min-h-[92px] flex-col items-center gap-1.5 p-2 transition-colors ${
                    foraDoMes ? "bg-cream" : "bg-surface hover:bg-rose-soft/40"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      hoje
                        ? "bg-rose text-cream"
                        : foraDoMes
                          ? "text-ink-soft/40"
                          : "text-ink"
                    }`}
                  >
                    {format(dia, "d")}
                  </span>
                  {eventosDoDia.length > 0 && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-cream">
                      {eventosDoDia.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ) : modo === "calendario" ? (
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line text-xs sm:min-w-0">
            {DIAS_DA_SEMANA.map((dia) => (
              <div key={dia} className="bg-rose-soft px-2 py-1.5 text-center font-medium text-rose">
                {dia}
              </div>
            ))}

            {dias.map((dia) => {
              const chave = format(dia, "yyyy-MM-dd");
              const eventosDoDia = (porDia.get(chave) ?? []).filter((a) => a.status !== "cancelled");
              const foraDoMes = !isSameMonth(dia, inicioMes);
              const hoje = isToday(dia);

              return (
                <Link
                  key={chave}
                  href={`/agenda?visao=dia&data=${chave}`}
                  className={`flex min-h-[100px] flex-col gap-1 p-1.5 transition-colors ${
                    foraDoMes ? "bg-cream" : "bg-surface hover:bg-rose-soft/40"
                  }`}
                >
                  <span className={`self-end ${hoje ? "flex h-6 w-6 items-center justify-center rounded-full bg-rose text-cream" : foraDoMes ? "text-ink-soft/40" : "text-ink-soft"}`}>
                    {format(dia, "d")}
                  </span>
                  <div className="space-y-0.5">
                    {eventosDoDia.slice(0, 3).map((ag) => (
                      <div
                        key={ag.id}
                        className={`truncate rounded px-1 py-0.5 ${ESTILO_BLOCO_STATUS[ag.status] ?? "bg-ink text-cream"}`}
                        title={`${ag.cliente?.name ?? ""} · ${ag.servico?.name ?? ""}`}
                      >
                        {format(new Date(ag.start_at), "HH:mm")} {ag.cliente?.name ?? ""}
                      </div>
                    ))}
                    {eventosDoDia.length > 3 && <p className="text-ink-soft">+{eventosDoDia.length - 3} mais</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <ListaDoMes dias={dias.filter((d) => isSameMonth(d, inicioMes))} porDia={porDia} />
      )}
    </div>
  );
}

function ListaDoMes({
  dias,
  porDia,
}: {
  dias: Date[];
  porDia: Map<string, Awaited<ReturnType<typeof buscarAgendamentosPeriodo>>>;
}) {
  const diasComEventos = dias.filter((d) => (porDia.get(format(d, "yyyy-MM-dd")) ?? []).length > 0);

  if (diasComEventos.length === 0) {
    return <p className="text-sm text-ink-soft">Nenhum agendamento neste mês.</p>;
  }

  return (
    <div className="space-y-5">
      {diasComEventos.map((dia) => {
        const chave = format(dia, "yyyy-MM-dd");
        const eventos = porDia.get(chave) ?? [];
        return (
          <div key={chave}>
            <p className="mb-2 text-sm font-medium capitalize text-ink-soft">
              {format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
            <ul className="space-y-2">
              {eventos.map((ag) => (
                <li key={ag.id} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-3">
                  <div>
                    <p className="font-medium text-ink">{ag.cliente?.name ?? "Cliente removido"}</p>
                    <p className="text-sm text-ink-soft">
                      {ag.servico?.name ?? "Serviço removido"} · {format(new Date(ag.start_at), "HH:mm")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ESTILO_STATUS[ag.status] ?? "bg-line text-ink-soft"}`}>
                    {ROTULO_STATUS[ag.status] ?? ag.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

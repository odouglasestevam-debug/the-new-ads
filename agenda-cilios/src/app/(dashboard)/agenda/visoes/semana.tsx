import Link from "next/link";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { inicioDiaLocal } from "@/lib/dashboard";
import { buscarAgendamentosPeriodo, ESTILO_BLOCO_STATUS } from "@/lib/agenda";

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diaLocalISO(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export async function VisaoSemana({ data }: { data: string }) {
  const referencia = inicioDiaLocal(data);
  const inicioSemana = startOfWeek(referencia);
  const fimSemana = addDays(inicioSemana, 7);

  const agendamentos = await buscarAgendamentosPeriodo(
    inicioDiaLocal(format(inicioSemana, "yyyy-MM-dd")),
    inicioDiaLocal(format(fimSemana, "yyyy-MM-dd"))
  );

  const porDia = new Map<string, typeof agendamentos>();
  for (const ag of agendamentos) {
    const chave = diaLocalISO(ag.start_at);
    if (!porDia.has(chave)) porDia.set(chave, []);
    porDia.get(chave)!.push(ag);
  }

  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i));
  const semanaAnterior = format(subWeeks(inicioSemana, 1), "yyyy-MM-dd");
  const semanaSeguinte = format(addWeeks(inicioSemana, 1), "yyyy-MM-dd");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">
          {format(inicioSemana, "d 'de' MMM", { locale: ptBR })} — {format(addDays(inicioSemana, 6), "d 'de' MMM", { locale: ptBR })}
        </h2>
        <div className="flex gap-2">
          <Link href={`/agenda?visao=semana&data=${semanaAnterior}`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-rose hover:text-rose">
            ← Anterior
          </Link>
          <Link href={`/agenda?visao=semana&data=${semanaSeguinte}`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-rose hover:text-rose">
            Próximo →
          </Link>
        </div>
      </div>

      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="grid min-w-[640px] grid-cols-7 gap-2 sm:min-w-0">
          {dias.map((dia, i) => {
            const chave = format(dia, "yyyy-MM-dd");
            const eventosDoDia = porDia.get(chave) ?? [];
            return (
              <div key={chave} className="rounded-xl border border-line bg-surface p-2">
                <Link
                  href={`/agenda?visao=dia&data=${chave}`}
                  className="mb-2 block rounded-md px-1 py-0.5 text-center text-xs font-medium text-ink-soft hover:text-rose"
                >
                  {DIAS_DA_SEMANA[i]} <span className="text-ink">{format(dia, "d")}</span>
                </Link>
                <div className="space-y-1">
                  {eventosDoDia.map((ag) => (
                    <div
                      key={ag.id}
                      className={`truncate rounded px-1.5 py-1 text-xs ${ESTILO_BLOCO_STATUS[ag.status] ?? "bg-ink text-cream"}`}
                      title={`${ag.cliente?.name ?? ""} · ${ag.servico?.name ?? ""}`}
                    >
                      {format(new Date(ag.start_at), "HH:mm")} {ag.cliente?.name ?? ""}
                    </div>
                  ))}
                  {eventosDoDia.length === 0 && <p className="text-center text-xs text-ink-soft/50">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

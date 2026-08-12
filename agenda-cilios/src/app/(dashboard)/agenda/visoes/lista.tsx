import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { inicioDiaLocal } from "@/lib/dashboard";
import { buscarAgendamentosPeriodo, ESTILO_STATUS, ROTULO_PAGAMENTO, ROTULO_STATUS } from "@/lib/agenda";
import { atualizarStatusAgendamento } from "@/app/actions";

const HORAS = Array.from({ length: 14 }, (_, i) => i + 7); // 07h–20h

export async function VisaoLista({ data, hora }: { data?: string; hora?: string }) {
  // Sem filtro de dia: mostra os próximos 60 dias (janela "produtiva", sem poluir com o histórico todo).
  const inicio = data ? inicioDiaLocal(data) : inicioDiaLocal(format(new Date(), "yyyy-MM-dd"));
  const fim = data
    ? new Date(inicio.getTime() + 24 * 60 * 60 * 1000)
    : new Date(inicio.getTime() + 60 * 24 * 60 * 60 * 1000);

  const todos = await buscarAgendamentosPeriodo(inicio, fim);
  const agendamentos = hora
    ? todos.filter((ag) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(ag.start_at)) === hora.padStart(2, "0"))
    : todos;

  const filtroAtivo = Boolean(data || hora);

  return (
    <div>
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Dia</label>
          <input
            type="date"
            name="data"
            defaultValue={data}
            className="rounded-lg border border-line bg-cream px-3 py-1.5 text-sm text-ink outline-none focus:border-rose"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Horário</label>
          <select
            name="hora"
            defaultValue={hora ?? ""}
            className="rounded-lg border border-line bg-cream px-3 py-1.5 text-sm text-ink outline-none focus:border-rose"
          >
            <option value="">Qualquer</option>
            {HORAS.map((h) => (
              <option key={h} value={String(h).padStart(2, "0")}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="visao" value="lista" />
        <button type="submit" className="rounded-lg bg-rose px-3.5 py-1.5 text-sm font-medium text-cream hover:bg-rose-dark">
          Filtrar
        </button>
        {filtroAtivo && (
          <a href="/agenda?visao=lista" className="text-sm text-ink-soft underline hover:text-rose">
            Limpar filtros
          </a>
        )}
      </form>

      {!filtroAtivo && <p className="mb-3 text-xs text-ink-soft">Mostrando os próximos 60 dias.</p>}

      <ul className="space-y-3">
        {agendamentos.map((ag) => (
          <li key={ag.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-ink">{ag.cliente?.name ?? "Cliente removido"}</p>
                <p className="text-sm text-ink-soft">
                  {ag.servico?.name ?? "Serviço removido"} ·{" "}
                  {format(new Date(ag.start_at), "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })} ·{" "}
                  <span className="font-medium text-ink">
                    {ag.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ESTILO_STATUS[ag.status] ?? "bg-line text-ink-soft"}`}>
                {ROTULO_STATUS[ag.status] ?? ag.status}
              </span>
            </div>

            {ag.status !== "cancelled" && ag.status !== "done" && (
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <form action={atualizarStatusAgendamento.bind(null, ag.id, "confirmed")}>
                  <button className="text-sage hover:underline">Marcar confirmado</button>
                </form>
                <form action={atualizarStatusAgendamento.bind(null, ag.id, "done")} className="flex items-center gap-2">
                  <select
                    name="payment_method"
                    required
                    defaultValue=""
                    className="rounded-md border border-line bg-cream px-2 py-1 text-xs text-ink outline-none focus:border-rose"
                  >
                    <option value="" disabled>
                      Forma de pagamento
                    </option>
                    {Object.entries(ROTULO_PAGAMENTO).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                  <button className="text-ink-soft hover:underline">Concluir</button>
                </form>
                <form action={atualizarStatusAgendamento.bind(null, ag.id, "cancelled")}>
                  <button className="text-vermelho hover:underline">Cancelar</button>
                </form>
              </div>
            )}
            {ag.status === "done" && ag.payment_method && (
              <p className="mt-2 text-xs text-ink-soft">Pago via {ROTULO_PAGAMENTO[ag.payment_method] ?? ag.payment_method}</p>
            )}
          </li>
        ))}
        {agendamentos.length === 0 && <p className="text-sm text-ink-soft">Nenhum agendamento encontrado.</p>}
      </ul>
    </div>
  );
}

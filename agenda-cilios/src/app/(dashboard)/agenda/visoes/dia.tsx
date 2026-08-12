import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { inicioDiaLocal } from "@/lib/dashboard";
import { buscarAgendamentosPeriodo, ESTILO_BLOCO_CABECALHO, ESTILO_BLOCO_CORPO } from "@/lib/agenda";
import { ModalNovoAgendamento } from "../modal-novo-agendamento";

const HORA_INICIO_PADRAO = 0;
const HORA_FIM_PADRAO = 24;
const PX_POR_MIN = 1.7;
const ALTURA_MIN_BLOCO = 64;

function minutosLocaisDoDia(iso: string): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return hora * 60 + minuto;
}

function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function agoraLocal(): { chave: string; minutos: number } {
  const agora = new Date();
  const chave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  return { chave, minutos: minutosLocaisDoDia(agora.toISOString()) };
}

function IconePessoa() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" />
    </svg>
  );
}

function IconeTag() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
      <path d="M2 2h6l6 6-6 6-6-6z" opacity="0.85" />
      <circle cx="5" cy="5" r="1.1" fill="var(--surface)" />
    </svg>
  );
}

export async function VisaoDia({ data }: { data: string }) {
  const inicio = inicioDiaLocal(data);
  const fim = addDays(inicio, 1);
  const agendamentos = (await buscarAgendamentosPeriodo(inicio, fim)).filter((a) => a.status !== "cancelled");

  const diaAnterior = format(addDays(inicio, -1), "yyyy-MM-dd");
  const diaSeguinte = format(addDays(inicio, 1), "yyyy-MM-dd");

  // A grade cobre 7h–21h por padrão, mas se algum agendamento cair fora dessa
  // janela ela se expande — nunca pode "vazar" pra fora do grid (bug de antes).
  const minutosInicioAgendamentos = agendamentos.map((ag) => minutosLocaisDoDia(ag.start_at));
  const minutosFimAgendamentos = agendamentos.map((ag) => minutosLocaisDoDia(ag.start_at) + ag.duration_min);
  const HORA_INICIO = Math.min(HORA_INICIO_PADRAO, ...minutosInicioAgendamentos.map((m) => Math.floor(m / 60)));
  const HORA_FIM = Math.max(HORA_FIM_PADRAO, ...minutosFimAgendamentos.map((m) => Math.ceil(m / 60)));
  const alturaTotal = (HORA_FIM - HORA_INICIO) * 60 * PX_POR_MIN;

  const agora = agoraLocal();
  const ehHoje = agora.chave === data;

  const inicioSemana = startOfWeek(inicio);
  const diasDaSemana = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i));
  const mesesDaSemana = Array.from(new Set(diasDaSemana.map((d) => format(d, "MMMM", { locale: ptBR }))));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium capitalize text-ink-soft">
          {mesesDaSemana.length > 1 ? mesesDaSemana.join(" · ") : format(inicio, "MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <Link href={`/agenda?visao=dia&data=${format(new Date(), "yyyy-MM-dd")}`} className="rounded-full bg-rose-soft px-3 py-1 text-xs font-medium text-rose hover:bg-rose hover:text-cream">
          Hoje
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {diasDaSemana.map((dia) => {
          const chave = format(dia, "yyyy-MM-dd");
          const ativo = chave === data;
          return (
            <Link
              key={chave}
              href={`/agenda?visao=dia&data=${chave}`}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 transition-colors ${
                ativo ? "bg-ink text-cream" : "bg-surface text-ink-soft hover:bg-rose-soft"
              }`}
            >
              <span className="text-[10px] uppercase">{format(dia, "EEEEEE", { locale: ptBR })}</span>
              <span className="text-sm font-medium">{format(dia, "d")}</span>
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium capitalize text-ink">
          {format(inicio, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h2>
        <div className="flex gap-2">
          <Link href={`/agenda?visao=dia&data=${diaAnterior}`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-rose hover:text-rose">
            ←
          </Link>
          <ModalNovoAgendamento
            gatilho="+ Agendar"
            dataInicial={data}
            className="rounded-lg bg-rose px-3 py-1.5 text-sm font-medium text-cream hover:bg-rose-dark"
          />
          <Link href={`/agenda?visao=dia&data=${diaSeguinte}`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-rose hover:text-rose">
            →
          </Link>
        </div>
      </div>

      <div className="sombra-cartao relative flex overflow-hidden rounded-xl border border-line bg-surface">
        <div className="w-14 shrink-0 border-r border-line">
          {Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) => HORA_INICIO + i).map((h) => (
            <div
              key={h}
              style={{ height: 60 * PX_POR_MIN }}
              className="tabular flex items-start justify-end border-b border-line px-2 pt-1 text-xs text-ink-soft"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div className="relative flex-1" style={{ height: alturaTotal }}>
          {Array.from({ length: HORA_FIM - HORA_INICIO }, (_, i) => i).map((i) => (
            <div
              key={i}
              className="absolute inset-x-0 border-b border-line"
              style={{ top: i * 60 * PX_POR_MIN, height: 60 * PX_POR_MIN }}
            />
          ))}

          {agendamentos.map((ag) => {
            const top = (minutosLocaisDoDia(ag.start_at) - HORA_INICIO * 60) * PX_POR_MIN;
            const altura = Math.max(ag.duration_min * PX_POR_MIN, ALTURA_MIN_BLOCO);
            const fimIso = new Date(new Date(ag.start_at).getTime() + ag.duration_min * 60_000).toISOString();
            return (
              <div
                key={ag.id}
                className="sombra-cartao absolute inset-x-2 overflow-hidden rounded-md"
                style={{ top, height: altura }}
              >
                <div className={`px-2 py-0.5 text-[11px] font-medium ${ESTILO_BLOCO_CABECALHO[ag.status] ?? "bg-ink text-cream"}`}>
                  {horaLocal(ag.start_at)} – {horaLocal(fimIso)}
                </div>
                <div className={`flex h-full flex-col gap-0.5 px-2 py-1 text-xs ${ESTILO_BLOCO_CORPO[ag.status] ?? "bg-ink/90 text-cream"}`}>
                  <span className="flex items-center gap-1.5 truncate font-medium">
                    <IconePessoa /> {ag.cliente?.name ?? "Cliente removido"}
                  </span>
                  <span className="flex items-center gap-1.5 truncate opacity-80">
                    <IconeTag /> {ag.servico?.name ?? "Serviço removido"}
                  </span>
                </div>
              </div>
            );
          })}

          {ehHoje && (
            <div
              className="absolute inset-x-0 z-10 flex items-center"
              style={{ top: (agora.minutos - HORA_INICIO * 60) * PX_POR_MIN }}
            >
              <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-rose" />
              <span className="h-px flex-1 bg-rose" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { inicioDiaLocal, resumoFaturamentoPeriodo, variacaoPeriodoAnterior } from "@/lib/dashboard";
import { resolverPeriodo } from "@/lib/periodo";
import { buscarAgendamentosPeriodo, ROTULO_STATUS, ESTILO_STATUS } from "@/lib/agenda";
import { cicloVidaClientes, resumirCiclo } from "@/lib/ciclo-vida";
import { listarPendenciasAbertas } from "@/lib/pendencias";
import { listarAvisosCancelamentoAbertos } from "@/lib/avisos-cancelamento";
import { listarItensEstoqueBaixo } from "@/lib/estoque";
import { CardResumo } from "../analytics/cards";
import { PendenciasBanner } from "./pendencias-banner";
import { AvisosCancelamentoBanner } from "./avisos-cancelamento-banner";
import { EstoqueBaixoBanner } from "./estoque-baixo-banner";

function hojeLocalISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default async function InicioPage() {
  const hoje = hojeLocalISO();
  const inicioHoje = inicioDiaLocal(hoje);
  const fimHoje = addDays(inicioHoje, 1);
  const { inicio: inicioMes, fim: fimMes } = resolverPeriodo({ periodo: "mes" });

  const [agendamentosHoje, resumoMes, variacaoMes, clientesCiclo, pendencias, avisosCancelamento, itensEstoqueBaixo] =
    await Promise.all([
      buscarAgendamentosPeriodo(inicioHoje, fimHoje),
      resumoFaturamentoPeriodo(inicioMes, fimMes),
      variacaoPeriodoAnterior(inicioMes, fimMes),
      cicloVidaClientes(),
      listarPendenciasAbertas(),
      listarAvisosCancelamentoAbertos(),
      listarItensEstoqueBaixo(),
    ]);

  const agendamentosAtivosHoje = agendamentosHoje.filter((a) => a.status !== "cancelled");
  const resumoCiclo = resumirCiclo(clientesCiclo);
  const precisamAtencao = resumoCiclo.atrasadas + resumoCiclo.inativas + resumoCiclo.perdidas;

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-medium text-ink-soft">{format(inicioHoje, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Visão Geral</h1>
      </div>

      <AvisosCancelamentoBanner avisos={avisosCancelamento} />
      <PendenciasBanner pendencias={pendencias} />
      <EstoqueBaixoBanner itens={itensEstoqueBaixo} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CardResumo rotulo="Faturamento do mês" valor={resumoMes.total} variacao={variacaoMes} destaque />

        <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-soft">Hoje</p>
          <p className="tabular mt-1 font-display text-2xl text-ink">{agendamentosAtivosHoje.length}</p>
          <p className="mt-1 text-xs font-medium text-ink-soft">
            {agendamentosAtivosHoje.length === 1 ? "agendamento" : "agendamentos"}
          </p>
        </div>

        <div className="sombra-cartao rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-soft">Clientes ativas</p>
          <p className="tabular mt-1 font-display text-2xl text-sage">{resumoCiclo.ativas}</p>
          <p className="mt-1 text-xs font-medium text-ink-soft">em dia com o ciclo</p>
        </div>

        <Link
          href="/crm"
          className="sombra-cartao sombra-cartao-hover rounded-xl border border-line bg-surface p-4 transition-colors hover:border-amber"
        >
          <p className="text-xs font-medium text-ink-soft">Precisam de atenção</p>
          <p className="tabular mt-1 font-display text-2xl text-amber">{precisamAtencao}</p>
          <p className="mt-1 text-xs font-medium text-ink-soft">atrasadas, inativas ou perdidas</p>
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-ink-soft">Agenda de hoje</p>
          <Link href="/agenda" className="text-sm font-medium text-rose hover:underline">
            Ver agenda completa →
          </Link>
        </div>

        {agendamentosAtivosHoje.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum agendamento hoje.</p>
        ) : (
          <div className="space-y-2">
            {agendamentosAtivosHoje.map((ag) => (
              <div key={ag.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="tabular w-12 shrink-0 text-sm font-medium text-ink">{horaLocal(ag.start_at)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{ag.cliente?.name ?? "Cliente removido"}</p>
                    <p className="truncate text-xs text-ink-soft">{ag.servico?.name ?? "Serviço removido"}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILO_STATUS[ag.status]}`}>
                  {ROTULO_STATUS[ag.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/analytics" className="sombra-cartao sombra-cartao-hover rounded-xl border border-line bg-surface p-5">
          <p className="font-display text-lg font-semibold tracking-tight text-ink">Analytics</p>
          <p className="mt-1 text-sm text-ink-soft">Financeiro, pagamentos, melhores clientes e serviços.</p>
        </Link>
        <Link href="/crm" className="sombra-cartao sombra-cartao-hover rounded-xl border border-line bg-surface p-5">
          <p className="font-display text-lg font-semibold tracking-tight text-ink">CRM</p>
          <p className="mt-1 text-sm text-ink-soft">Ciclo de vida das clientes e pipeline comercial.</p>
        </Link>
      </div>
    </div>
  );
}

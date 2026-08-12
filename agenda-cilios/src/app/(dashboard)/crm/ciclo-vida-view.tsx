"use client";

import { useMemo, useState } from "react";
import type { ClienteCiclo, StatusCiclo } from "@/lib/ciclo-vida";
import { CICLO_DIAS_ATIVA, CICLO_DIAS_ATRASADA, CICLO_DIAS_INATIVA, ROTULO_TIPO_PROCEDIMENTO } from "@/lib/agenda";
import { KanbanCicloVida } from "./kanban-ciclo-vida";
import { TabelaCicloVida } from "./tabela-ciclo-vida";

type FiltroVisitas = "todas" | "1" | "2" | "3+" | "so_aplicacao";
type FiltroStatus = "todas" | StatusCiclo;
type FiltroTipo = "todas" | "aplicacao" | "manutencao";
type Visao = "kanban" | "planilha";

const ROTULO_STATUS: Record<StatusCiclo, string> = {
  ativa: "Ativa",
  atrasada: "Atrasada",
  inativa: "Inativa",
  perdida: "Perdida",
};

const campo = "rounded-lg border border-line bg-cream px-3 py-1.5 text-sm text-ink outline-none focus:border-rose";
const rotulo = "mb-1 block text-xs font-medium text-ink-soft";

export function CicloVidaView({ clientes }: { clientes: ClienteCiclo[] }) {
  const [visao, setVisao] = useState<Visao>("kanban");
  const [filtroVisitas, setFiltroVisitas] = useState<FiltroVisitas>("todas");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todas");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todas");
  const [filtroTecnica, setFiltroTecnica] = useState("todas");
  const [diasMinimo, setDiasMinimo] = useState("");

  const tecnicas = useMemo(() => Array.from(new Set(clientes.map((c) => c.tecnica))).sort(), [clientes]);

  const filtrosAtivos =
    filtroVisitas !== "todas" || filtroStatus !== "todas" || filtroTipo !== "todas" || filtroTecnica !== "todas" || diasMinimo;

  const filtrados = useMemo(() => {
    const minimo = Number(diasMinimo) || 0;
    return clientes.filter((c) => {
      if (filtroVisitas === "1" && c.totalVisitas !== 1) return false;
      if (filtroVisitas === "2" && c.totalVisitas !== 2) return false;
      if (filtroVisitas === "3+" && c.totalVisitas < 3) return false;
      if (filtroVisitas === "so_aplicacao" && !c.apenasAplicacao) return false;
      if (filtroStatus !== "todas" && c.status !== filtroStatus) return false;
      if (filtroTipo !== "todas" && c.tipoUltimaVisita !== filtroTipo) return false;
      if (filtroTecnica !== "todas" && c.tecnica !== filtroTecnica) return false;
      if (minimo > 0 && c.diasDesde < minimo) return false;
      return true;
    });
  }, [clientes, filtroVisitas, filtroStatus, filtroTipo, filtroTecnica, diasMinimo]);

  function limparFiltros() {
    setFiltroVisitas("todas");
    setFiltroStatus("todas");
    setFiltroTipo("todas");
    setFiltroTecnica("todas");
    setDiasMinimo("");
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <label className={rotulo}>Status</label>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)} className={campo}>
              <option value="todas">Todos</option>
              {Object.entries(ROTULO_STATUS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo}>Procedimento</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)} className={campo}>
              <option value="todas">Todos</option>
              {Object.entries(ROTULO_TIPO_PROCEDIMENTO).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo}>Técnica</label>
            <select value={filtroTecnica} onChange={(e) => setFiltroTecnica(e.target.value)} className={campo}>
              <option value="todas">Todas</option>
              {tecnicas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo}>Quantas vezes veio</label>
            <select value={filtroVisitas} onChange={(e) => setFiltroVisitas(e.target.value as FiltroVisitas)} className={campo}>
              <option value="todas">Todas</option>
              <option value="1">1 vez</option>
              <option value="2">2 vezes</option>
              <option value="3+">3 vezes ou mais</option>
              <option value="so_aplicacao">Só aplicação, nunca fez manutenção</option>
            </select>
          </div>

          <div>
            <label className={rotulo}>Mínimo de dias sem voltar</label>
            <input
              type="number"
              min={0}
              value={diasMinimo}
              onChange={(e) => setDiasMinimo(e.target.value)}
              placeholder="Ex: 30"
              className={`w-32 ${campo}`}
            />
          </div>

          {filtrosAtivos && (
            <button type="button" onClick={limparFiltros} className="text-sm text-ink-soft underline hover:text-rose">
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex rounded-lg border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setVisao("kanban")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              visao === "kanban" ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
            }`}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setVisao("planilha")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              visao === "planilha" ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
            }`}
          >
            Planilha
          </button>
        </div>
      </div>

      {clientes.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nenhum atendimento de cílios concluído ainda com aplicação/manutenção marcada. Marque o tipo de
          procedimento em Serviços pra esse painel começar a preencher.
        </p>
      ) : visao === "kanban" ? (
        <KanbanCicloVida clientes={filtrados} />
      ) : (
        <TabelaCicloVida clientes={filtrados} />
      )}

      <p className="mt-6 max-w-2xl text-xs text-ink-soft">
        Considera só atendimentos de cílios marcados como aplicação ou manutenção. Ativa até {CICLO_DIAS_ATIVA} dias
        sem visita, atrasada até {CICLO_DIAS_ATRASADA} dias, inativa até {CICLO_DIAS_INATIVA} dias, perdida depois
        disso.
      </p>
    </div>
  );
}

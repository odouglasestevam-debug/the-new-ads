"use client";

import type { ClienteCiclo, StatusCiclo } from "@/lib/ciclo-vida";
import { ROTULO_TIPO_PROCEDIMENTO } from "@/lib/agenda";

const COLUNAS: { status: StatusCiclo; titulo: string; corTexto: string; corAccent: string }[] = [
  { status: "ativa", titulo: "Ativa", corTexto: "text-sage", corAccent: "border-sage" },
  { status: "atrasada", titulo: "Atrasada", corTexto: "text-amber", corAccent: "border-amber" },
  { status: "inativa", titulo: "Inativa", corTexto: "text-ink-soft", corAccent: "border-ink-soft" },
  { status: "perdida", titulo: "Perdida", corTexto: "text-vermelho", corAccent: "border-vermelho" },
];

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function KanbanCicloVida({ clientes }: { clientes: ClienteCiclo[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {COLUNAS.map((coluna) => {
        const lista = clientes.filter((c) => c.status === coluna.status);
        return (
          <div key={coluna.status} className="w-72 shrink-0">
            <div className={`mb-3 flex items-center justify-between border-b-2 ${coluna.corAccent} pb-2`}>
              <span className={`text-sm font-medium ${coluna.corTexto}`}>{coluna.titulo}</span>
              <span className="tabular text-xs text-ink-soft">{lista.length}</span>
            </div>

            <div className="space-y-3">
              {lista.map((c) => (
                <div
                  key={c.id}
                  className="sombra-cartao sombra-cartao-hover rounded-lg border border-line bg-surface p-4"
                >
                  <p className="font-medium text-ink">{c.nome}</p>
                  <p className="text-sm text-ink-soft">{c.telefone}</p>

                  <div className="mt-3 space-y-1 text-xs text-ink-soft">
                    <p>
                      Última visita: <span className="text-ink">{formatarData(c.ultimaVisita)}</span>
                    </p>
                    <p>
                      {ROTULO_TIPO_PROCEDIMENTO[c.tipoUltimaVisita]} · {c.tecnica}
                    </p>
                    <p>
                      <span className="tabular font-medium text-ink">{c.diasDesde}</span> dias sem voltar
                    </p>
                    <p>
                      <span className="tabular">{c.totalVisitas}</span> {c.totalVisitas === 1 ? "visita" : "visitas"} no
                      total
                    </p>
                  </div>

                  {c.apenasAplicacao && (
                    <p className="mt-3 rounded-lg bg-vermelho-soft px-2.5 py-1.5 text-xs font-medium text-vermelho">
                      Nunca voltou pra manutenção
                    </p>
                  )}
                </div>
              ))}
              {lista.length === 0 && <p className="text-xs text-ink-soft">Nenhuma cliente aqui.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

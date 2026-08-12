"use client";

import { useState } from "react";
import { descartarPendencia, resolverPendencia } from "@/app/actions";
import { ModalNovoAgendamento } from "../agenda/modal-novo-agendamento";
import type { PendenciaAgendamento } from "@/lib/pendencias";

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PendenciasBanner({ pendencias }: { pendencias: PendenciaAgendamento[] }) {
  const [ocultas, setOcultas] = useState<string[]>([]);
  const visiveis = pendencias.filter((p) => !ocultas.includes(p.id));

  if (visiveis.length === 0) return null;

  function aoDescartar(id: string) {
    setOcultas((v) => [...v, id]);
    descartarPendencia(id);
  }

  function aoResolver(id: string) {
    setOcultas((v) => [...v, id]);
    resolverPendencia(id);
  }

  return (
    <div className="mb-6 rounded-xl border border-amber bg-amber-soft p-4">
      <p className="mb-3 text-sm font-medium text-amber">
        {visiveis.length === 1
          ? "1 confirmação no WhatsApp sem agendamento correspondente"
          : `${visiveis.length} confirmações no WhatsApp sem agendamento correspondente`}
      </p>

      <div className="space-y-2">
        {visiveis.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{p.nomeSugerido ?? p.telefone}</p>
              <p className="truncate text-xs text-ink-soft">
                {p.dataSugerida && (
                  <>
                    {formatarData(p.dataSugerida)}
                    {p.horaSugerida && ` · ${p.horaSugerida}`} ·{" "}
                  </>
                )}
                &ldquo;{p.mensagem}&rdquo;
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ModalNovoAgendamento
                gatilho="Revisar e agendar"
                className="rounded-lg bg-rose px-3 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-rose-dark"
                prefill={{
                  modoCliente: p.clientId ? "existente" : "nova",
                  clientId: p.clientId ?? undefined,
                  nome: p.nomeSugerido ?? undefined,
                  telefone: p.telefone,
                  data: p.dataSugerida ?? undefined,
                  hora: p.horaSugerida ?? undefined,
                  preco: p.valorSugerido ?? undefined,
                }}
                aoSalvar={() => aoResolver(p.id)}
              />
              <button
                type="button"
                onClick={() => aoDescartar(p.id)}
                className="text-sm text-ink-soft underline hover:text-rose"
              >
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

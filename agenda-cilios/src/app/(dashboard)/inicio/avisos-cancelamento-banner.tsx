"use client";

import { useState } from "react";
import { resolverAvisoCancelamento } from "@/app/actions";
import type { AvisoCancelamento } from "@/lib/avisos-cancelamento";

const ROTULO_MOTIVO: Record<string, string> = {
  cliente_cancelou: "cancelou o agendamento",
  cliente_quer_reagendar: "pediu pra reagendar",
  resposta_nao_reconhecida: "respondeu algo que não entendemos",
};

export function AvisosCancelamentoBanner({ avisos }: { avisos: AvisoCancelamento[] }) {
  const [ocultos, setOcultos] = useState<string[]>([]);
  const visiveis = avisos.filter((a) => !ocultos.includes(a.id));

  if (visiveis.length === 0) return null;

  function aoResolver(id: string) {
    setOcultos((v) => [...v, id]);
    resolverAvisoCancelamento(id);
  }

  return (
    <div className="mb-6 rounded-xl border border-vermelho bg-vermelho-soft p-4">
      <p className="mb-3 text-sm font-medium text-vermelho">
        {visiveis.length === 1 ? "1 cliente precisa de contato" : `${visiveis.length} clientes precisam de contato`}
      </p>

      <div className="space-y-2">
        {visiveis.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {a.clienteNome} — {ROTULO_MOTIVO[a.motivo] ?? a.motivo}
              </p>
              <p className="truncate text-xs text-ink-soft">&ldquo;{a.mensagemRecebida}&rdquo;</p>
            </div>

            <button
              type="button"
              onClick={() => aoResolver(a.id)}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-rose hover:text-rose"
            >
              Já resolvi
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

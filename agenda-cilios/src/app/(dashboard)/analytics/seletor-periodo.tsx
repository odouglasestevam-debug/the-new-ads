"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PRESETS_PERIODO, type Periodo } from "@/lib/periodo";

function IconeCalendario() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path d="M3 8h14M6.5 2.5v3M13.5 2.5v3" />
    </svg>
  );
}

function IconeChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 opacity-60">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function rotuloIntervalo(inicioInput: string, fimInput: string): string {
  const inicio = new Date(`${inicioInput}T00:00:00`);
  const fim = new Date(`${fimInput}T00:00:00`);
  if (inicioInput === fimInput) return format(inicio, "d 'de' MMM", { locale: ptBR });
  return `${format(inicio, "d MMM", { locale: ptBR })} – ${format(fim, "d MMM", { locale: ptBR })}`;
}

// Seletor de período estilo gerenciador de anúncios: caixinha compacta que,
// ao clicar, abre um painel com os presets mais usados + opção personalizada.
export function SeletorPeriodo({
  aba,
  periodo,
  inicioInput,
  fimInput,
  extraParams,
}: {
  aba: string;
  periodo: Periodo;
  inicioInput: string;
  fimInput: string;
  extraParams?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [deInput, setDeInput] = useState(inicioInput);
  const [ateInput, setAteInput] = useState(fimInput);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  function navegar(query: Record<string, string>) {
    const sufixo = extraParams ? `&${extraParams}` : "";
    const params = new URLSearchParams({ aba, ...query });
    router.push(`/analytics?${params.toString()}${sufixo}`);
    setAberto(false);
  }

  const presetAtual = PRESETS_PERIODO.find((p) => p.periodo === periodo);
  const rotuloBotao = periodo === "personalizado" ? rotuloIntervalo(inicioInput, fimInput) : presetAtual?.rotulo ?? "Período";

  return (
    <div ref={painelRef} className="relative mb-6 inline-block">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-rose"
      >
        <IconeCalendario />
        {rotuloBotao}
        <IconeChevron />
      </button>

      {aberto && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 flex overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <ul className="w-44 border-r border-line py-1.5">
            {PRESETS_PERIODO.filter((p) => p.periodo !== "personalizado").map((item) => (
              <li key={item.periodo}>
                <button
                  type="button"
                  onClick={() => navegar({ periodo: item.periodo })}
                  className={`block w-full px-3.5 py-2 text-left text-sm transition-colors ${
                    periodo === item.periodo ? "bg-rose-soft font-medium text-rose" : "text-ink hover:bg-rose-soft/60"
                  }`}
                >
                  {item.rotulo}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => setAberto(true)}
                className={`block w-full px-3.5 py-2 text-left text-sm transition-colors ${
                  periodo === "personalizado" ? "bg-rose-soft font-medium text-rose" : "text-ink hover:bg-rose-soft/60"
                }`}
              >
                Personalizado
              </button>
            </li>
          </ul>

          <div className="w-64 space-y-3 p-4">
            <p className="text-xs font-medium text-ink-soft">Intervalo personalizado</p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-ink-soft">
                De
                <input
                  type="date"
                  value={deInput}
                  max={ateInput}
                  onChange={(e) => setDeInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-cream px-2.5 py-1.5 text-sm text-ink outline-none focus:border-rose"
                />
              </label>
              <label className="text-xs text-ink-soft">
                Até
                <input
                  type="date"
                  value={ateInput}
                  min={deInput}
                  onChange={(e) => setAteInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-cream px-2.5 py-1.5 text-sm text-ink outline-none focus:border-rose"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => navegar({ periodo: "personalizado", inicio: deInput, fim: ateInput })}
              className="w-full rounded-lg bg-rose px-3 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-rose-dark"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

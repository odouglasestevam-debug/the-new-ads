"use client";

import { useState, useSyncExternalStore } from "react";

// Não muda depois de montado nessa sessão — só precisamos do valor certo
// depois da hidratação (o servidor não conhece navigator/matchMedia/localStorage).
function subscribe() {
  return () => {};
}

function getSnapshot(): boolean {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const jaInstalado = window.matchMedia("(display-mode: standalone)").matches;
  const jaViu = localStorage.getItem("instalar-app-fechado") === "1";
  return iOS && !jaInstalado && !jaViu;
}

function getServerSnapshot(): boolean {
  return false;
}

// iOS/Safari não mostra prompt automático de instalação (só Android/Chrome
// mostram sozinhos) — sem esse aviso, quem usa iPhone nunca descobre que dá
// pra instalar o app na tela de início.
export function InstallPrompt() {
  const mostrar = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [fechado, setFechado] = useState(false);

  function fechar() {
    localStorage.setItem("instalar-app-fechado", "1");
    setFechado(true);
  }

  if (!mostrar || fechado) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(17,24,39,0.03),0_12px_32px_-12px_rgba(17,24,39,0.18)] sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <p className="flex-1 text-sm text-ink">
        Instala esse app no seu iPhone: toque em <span className="font-medium">Compartilhar</span> e depois em{" "}
        <span className="font-medium">Adicionar à Tela de Início</span>.
      </p>
      <button type="button" onClick={fechar} aria-label="Fechar aviso" className="shrink-0 text-ink-soft hover:text-rose">
        ✕
      </button>
    </div>
  );
}

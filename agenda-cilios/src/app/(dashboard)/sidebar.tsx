"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sair } from "@/app/actions";

const LINKS = [
  { href: "/inicio", label: "Visão Geral" },
  { href: "/agenda", label: "Agenda" },
  { href: "/clientes", label: "Clientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/estoque", label: "Estoque" },
  { href: "/analytics", label: "Analytics" },
  { href: "/crm", label: "CRM" },
];

export function Sidebar() {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-rose-soft"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-5 w-5">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
        <span className="font-display text-xl font-semibold tracking-tight text-ink">
          Zelo<span className="text-rose">.</span>
        </span>
      </header>

      <div
        className={`fixed inset-0 z-30 bg-ink/40 transition-opacity ${aberto ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setAberto(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-surface shadow-[8px_0_24px_-16px_rgba(17,24,39,0.25)] transition-transform ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            Zelo <span className="text-rose">agenda</span>
          </span>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-rose-soft hover:text-rose"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {LINKS.map((link) => {
            const ativo = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setAberto(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  ativo ? "bg-rose-soft text-rose" : "text-ink-soft hover:bg-rose-soft/60 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <form action={sair} className="border-t border-line px-3 py-4">
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-rose-soft hover:text-rose">
            Sair
          </button>
        </form>
      </aside>
    </>
  );
}

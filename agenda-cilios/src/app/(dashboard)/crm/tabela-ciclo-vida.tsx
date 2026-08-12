"use client";

import { useMemo, useState } from "react";
import type { ClienteCiclo, StatusCiclo } from "@/lib/ciclo-vida";
import { ROTULO_TIPO_PROCEDIMENTO } from "@/lib/agenda";

const ORDEM_STATUS: Record<StatusCiclo, number> = { ativa: 0, atrasada: 1, inativa: 2, perdida: 3 };

const ROTULO_STATUS: Record<StatusCiclo, string> = {
  ativa: "Ativa",
  atrasada: "Atrasada",
  inativa: "Inativa",
  perdida: "Perdida",
};

const COR_DOT_STATUS: Record<StatusCiclo, string> = {
  ativa: "bg-sage",
  atrasada: "bg-amber",
  inativa: "bg-ink-soft",
  perdida: "bg-vermelho",
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

type Coluna = "nome" | "status" | "diasDesde" | "totalVisitas" | "ultimaVisita" | "procedimento";

const CABECALHOS: { coluna: Coluna; rotulo: string }[] = [
  { coluna: "nome", rotulo: "Cliente" },
  { coluna: "status", rotulo: "Status" },
  { coluna: "diasDesde", rotulo: "Dias sem voltar" },
  { coluna: "totalVisitas", rotulo: "Visitas" },
  { coluna: "ultimaVisita", rotulo: "Última visita" },
  { coluna: "procedimento", rotulo: "Procedimento" },
];

function valorOrdenavel(c: ClienteCiclo, coluna: Coluna): string | number {
  switch (coluna) {
    case "nome":
      return c.nome.toLowerCase();
    case "status":
      return ORDEM_STATUS[c.status];
    case "diasDesde":
      return c.diasDesde;
    case "totalVisitas":
      return c.totalVisitas;
    case "ultimaVisita":
      return c.ultimaVisita;
    case "procedimento":
      return `${c.tipoUltimaVisita} ${c.tecnica}`.toLowerCase();
  }
}

export function TabelaCicloVida({ clientes }: { clientes: ClienteCiclo[] }) {
  const [ordenarPor, setOrdenarPor] = useState<Coluna>("diasDesde");
  const [decrescente, setDecrescente] = useState(true);

  const ordenados = useMemo(() => {
    const copia = [...clientes];
    copia.sort((a, b) => {
      const va = valorOrdenavel(a, ordenarPor);
      const vb = valorOrdenavel(b, ordenarPor);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return decrescente ? -cmp : cmp;
    });
    return copia;
  }, [clientes, ordenarPor, decrescente]);

  function aoClicarCabecalho(coluna: Coluna) {
    if (coluna === ordenarPor) {
      setDecrescente((v) => !v);
    } else {
      setOrdenarPor(coluna);
      setDecrescente(true);
    }
  }

  if (clientes.length === 0) {
    return <p className="text-sm text-ink-soft">Nenhuma cliente encontrada com os filtros atuais.</p>;
  }

  return (
    <div className="sombra-cartao overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-soft">
            {CABECALHOS.map((cab) => (
              <th key={cab.coluna} className="px-4 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => aoClicarCabecalho(cab.coluna)}
                  className="flex items-center gap-1 transition-colors hover:text-rose"
                >
                  {cab.rotulo}
                  {ordenarPor === cab.coluna && <span className="text-rose">{decrescente ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((c) => (
            <tr key={c.id} className="border-b border-line transition-colors last:border-0 hover:bg-cream/60">
              <td className="px-4 py-2.5 font-medium text-ink">{c.nome}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                  <span className={`h-1.5 w-1.5 rounded-full ${COR_DOT_STATUS[c.status]}`} />
                  {ROTULO_STATUS[c.status]}
                </span>
              </td>
              <td className="tabular px-4 py-2.5 text-ink">{c.diasDesde}</td>
              <td className="tabular px-4 py-2.5 text-ink">{c.totalVisitas}</td>
              <td className="tabular px-4 py-2.5 text-ink-soft">{formatarData(c.ultimaVisita)}</td>
              <td className="px-4 py-2.5 text-ink-soft">
                {ROTULO_TIPO_PROCEDIMENTO[c.tipoUltimaVisita]} · {c.tecnica}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

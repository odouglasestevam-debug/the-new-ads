"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarDespesa } from "@/app/actions";

const campo = "w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-rose";
const rotulo = "mb-1 block text-sm font-medium text-ink";

export function ModalNovaDespesa() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-rose-dark"
      >
        Nova despesa
      </button>

      {aberto && <Conteudo onClose={() => setAberto(false)} />}
    </>
  );
}

function Conteudo({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [recorrencia, setRecorrencia] = useState<"mensal" | "unica">("mensal");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoSubmeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await criarDespesa(new FormData(e.currentTarget));
      onClose();
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a despesa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Nova despesa</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-rose">
            ✕
          </button>
        </div>

        <form onSubmit={aoSubmeter} className="space-y-4">
          <div>
            <label className={rotulo}>Nome</label>
            <input name="nome" required placeholder="Ex: Aluguel do espaço" className={campo} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={rotulo}>Tipo</label>
              <select name="tipo" defaultValue="fixa" className={campo}>
                <option value="fixa">Fixa</option>
                <option value="variavel">Variável</option>
              </select>
            </div>
            <div>
              <label className={rotulo}>Valor (R$)</label>
              <input type="number" name="valor" required min={0.01} step="0.01" className={campo} />
            </div>
          </div>

          <div>
            <label className={rotulo}>Recorrência</label>
            <select
              name="recorrencia"
              value={recorrencia}
              onChange={(e) => setRecorrencia(e.target.value as "mensal" | "unica")}
              className={campo}
            >
              <option value="mensal">Mensal (se repete todo mês)</option>
              <option value="unica">Única (compra pontual)</option>
            </select>
          </div>

          {recorrencia === "mensal" ? (
            <div>
              <label className={rotulo}>Dia do vencimento (opcional)</label>
              <input type="number" name="dia_vencimento" min={1} max={31} placeholder="Ex: 5" className={campo} />
            </div>
          ) : (
            <div>
              <label className={rotulo}>Data</label>
              <input type="date" name="data" className={campo} />
            </div>
          )}

          {erro && <p className="text-sm text-vermelho">{erro}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-rose px-3 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-rose-dark disabled:opacity-50"
          >
            {enviando ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}

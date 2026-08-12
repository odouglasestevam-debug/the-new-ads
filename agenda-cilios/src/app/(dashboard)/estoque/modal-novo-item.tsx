"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarItemEstoque } from "@/app/actions";
import { ROTULO_CATEGORIA_ESTOQUE } from "@/lib/estoque";

const campo = "w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-rose";
const rotulo = "mb-1 block text-sm font-medium text-ink";

export function ModalNovoItemEstoque() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-rose-dark"
      >
        Novo item
      </button>

      {aberto && <Conteudo onClose={() => setAberto(false)} />}
    </>
  );
}

function Conteudo({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoSubmeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await criarItemEstoque(new FormData(e.currentTarget));
      onClose();
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o item.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Novo item de estoque</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-rose">
            ✕
          </button>
        </div>

        <form onSubmit={aoSubmeter} className="space-y-4">
          <div>
            <label className={rotulo}>Nome</label>
            <input name="nome" required placeholder="Ex: Cílios fio a fio 0.07 D" className={campo} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={rotulo}>Categoria</label>
              <select name="categoria" defaultValue="cilios" className={campo}>
                {Object.entries(ROTULO_CATEGORIA_ESTOQUE).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo}>Unidade</label>
              <input name="unidade" defaultValue="unidade" placeholder="unidade, caixa, ml..." className={campo} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={rotulo}>Quantidade em estoque hoje</label>
              <input type="number" name="quantidade_inicial" min={0} step="0.01" defaultValue={0} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Estoque mínimo (alerta)</label>
              <input type="number" name="estoque_minimo" min={0} step="0.01" defaultValue={0} className={campo} />
              <p className="mt-1 text-xs text-ink-soft">Avisa quando a quantidade cair até esse nível.</p>
            </div>
          </div>

          <div>
            <label className={rotulo}>Custo unitário (R$, opcional)</label>
            <input type="number" name="custo_unitario" min={0} step="0.01" className={campo} />
            <p className="mt-1 text-xs text-ink-soft">Usado pra estimar o valor total investido em estoque.</p>
          </div>

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

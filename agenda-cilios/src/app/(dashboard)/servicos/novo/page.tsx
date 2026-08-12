import Link from "next/link";
import { criarServico } from "@/app/actions";
import { ROTULO_CATEGORIA_SERVICO, ROTULO_TIPO_PROCEDIMENTO } from "@/lib/agenda";

const campo = "w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-rose";
const rotulo = "mb-1 block text-sm font-medium text-ink";

export default function NovoServicoPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Novo serviço</h1>
        <Link href="/servicos" className="text-sm text-ink-soft hover:text-rose">
          Voltar
        </Link>
      </div>

      <form action={criarServico} className="space-y-4 rounded-xl border border-line bg-surface p-6">
        <div>
          <label className={rotulo}>Nome</label>
          <input
            name="nome"
            required
            placeholder="Ex: Extensão volume russo"
            className={campo}
          />
        </div>

        <div>
          <label className={rotulo}>Categoria</label>
          <select name="categoria" defaultValue="cilios" className={campo}>
            {Object.entries(ROTULO_CATEGORIA_SERVICO).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={rotulo}>Tipo de procedimento</label>
          <select name="tipo_procedimento" defaultValue="" className={campo}>
            <option value="">Fora do ciclo (não entra em aplicação/manutenção)</option>
            {Object.entries(ROTULO_TIPO_PROCEDIMENTO).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-soft">
            Usado no Ciclo de vida (CRM) pra saber quando a cliente aplicou e quando deve voltar pra manutenção.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={rotulo}>Preço (R$)</label>
            <input
              type="number"
              name="preco"
              required
              min={0}
              step="0.01"
              className={campo}
            />
          </div>
          <div>
            <label className={rotulo}>Duração (min)</label>
            <input
              type="number"
              name="duracao"
              defaultValue={60}
              min={15}
              step={15}
              className={campo}
            />
          </div>
        </div>

        <button type="submit" className="w-full rounded-lg bg-rose px-3 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-rose-dark">
          Salvar
        </button>
      </form>
    </div>
  );
}

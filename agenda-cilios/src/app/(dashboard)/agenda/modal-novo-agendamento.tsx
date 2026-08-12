"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarAgendamento, criarClienteEAgendamento } from "@/app/actions";

type Cliente = { id: string; name: string; phone: string };
type Servico = { id: string; name: string; price: number; duration_min: number };
type Ocupacao = { id: string; start_at: string; duration_min: number; cliente: string; servico: string };

export type PrefillAgendamento = {
  modoCliente?: "existente" | "nova";
  clientId?: string;
  nome?: string;
  telefone?: string;
  data?: string;
  hora?: string;
  preco?: number;
};

const campo = "w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-rose";
const rotulo = "mb-1 block text-sm font-medium text-ink";

export function ModalNovoAgendamento({
  gatilho,
  className,
  dataInicial,
  variante = "botao",
  prefill,
  aoSalvar,
}: {
  gatilho?: string;
  className?: string;
  dataInicial?: string;
  variante?: "botao" | "flutuante";
  prefill?: PrefillAgendamento;
  aoSalvar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      {variante === "flutuante" ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Novo agendamento"
          title="Novo agendamento"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-rose text-cream shadow-lg transition-transform hover:scale-105 hover:bg-rose-dark active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-6 w-6">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={className ?? "rounded-lg bg-rose px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-rose-dark"}
        >
          {gatilho}
        </button>
      )}

      {aberto && (
        <ConteudoModal
          dataInicial={dataInicial}
          prefill={prefill}
          onClose={() => setAberto(false)}
          aoSalvar={aoSalvar}
        />
      )}
    </>
  );
}

function ConteudoModal({
  dataInicial,
  prefill,
  onClose,
  aoSalvar,
}: {
  dataInicial?: string;
  prefill?: PrefillAgendamento;
  onClose: () => void;
  aoSalvar?: () => void;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);

  const [modoCliente, setModoCliente] = useState<"existente" | "nova">(prefill?.modoCliente ?? "existente");
  const [nomeNovaCliente, setNomeNovaCliente] = useState(prefill?.nome ?? "");
  const [telefoneNovaCliente, setTelefoneNovaCliente] = useState(prefill?.telefone ?? "");
  const [clientId, setClientId] = useState(prefill?.clientId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [preco, setPreco] = useState(0);
  const [duracao, setDuracao] = useState(60);
  const [data, setData] = useState(prefill?.data ?? dataInicial ?? "");
  const [hora, setHora] = useState(prefill?.hora ?? "");
  const [notas, setNotas] = useState("");
  const [conflitos, setConflitos] = useState<Ocupacao[]>([]);

  useEffect(() => {
    fetch("/api/formulario/agendamento")
      .then((res) => res.json())
      .then((json: { clientes: Cliente[]; servicos: Servico[] }) => {
        setClientes(json.clientes);
        setServicos(json.servicos);
        if (!prefill?.clientId && json.clientes.length === 0) setModoCliente("nova");
        if (!prefill?.clientId && json.clientes[0]) setClientId(json.clientes[0].id);
        if (json.servicos[0]) {
          setServiceId(json.servicos[0].id);
          setPreco(prefill?.preco ?? json.servicos[0].price);
          setDuracao(json.servicos[0].duration_min);
        }
      })
      .finally(() => setCarregando(false));
  }, [prefill]);

  useEffect(() => {
    if (!data || !hora) return;
    const controller = new AbortController();
    fetch(`/api/agenda/dia?data=${data}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: { agendamentos: Ocupacao[] }) => {
        const inicioNovo = new Date(`${data}T${hora}:00-03:00`).getTime();
        const fimNovo = inicioNovo + duracao * 60_000;
        setConflitos(
          (json.agendamentos ?? []).filter((ag) => {
            const inicio = new Date(ag.start_at).getTime();
            const fim = inicio + ag.duration_min * 60_000;
            return inicioNovo < fim && inicio < fimNovo;
          })
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [data, hora, duracao]);

  function aoTrocarServico(id: string) {
    setServiceId(id);
    const selecionado = servicos.find((s) => s.id === id);
    if (selecionado) {
      setPreco(selecionado.price);
      setDuracao(selecionado.duration_min);
    }
  }

  async function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const formData = new FormData();
      formData.set("service_id", serviceId);
      formData.set("preco", String(preco));
      formData.set("duracao", String(duracao));
      formData.set("data", data);
      formData.set("hora", hora);
      formData.set("notas", notas);

      if (modoCliente === "nova") {
        formData.set("nome", nomeNovaCliente);
        formData.set("telefone", telefoneNovaCliente);
        await criarClienteEAgendamento(formData);
      } else {
        formData.set("client_id", clientId);
        await criarAgendamento(formData);
      }
      aoSalvar?.();
      onClose();
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o agendamento.");
    } finally {
      setEnviando(false);
    }
  }

  const faltaCadastro = !carregando && servicos.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Novo agendamento</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-rose">
            ✕
          </button>
        </div>

        {carregando ? (
          <p className="text-sm text-ink-soft">Carregando...</p>
        ) : faltaCadastro ? (
          <p className="text-sm text-ink-soft">
            Nenhum serviço cadastrado.{" "}
            <a href="/servicos/novo" className="text-rose underline">
              Cadastrar serviço
            </a>
          </p>
        ) : (
          <form onSubmit={aoSubmeter} className="space-y-4">
            <div>
              <label className={rotulo}>Cliente</label>
              <div className="flex rounded-lg border border-line bg-cream p-1">
                <button
                  type="button"
                  onClick={() => setModoCliente("existente")}
                  disabled={clientes.length === 0}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                    modoCliente === "existente" ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  Já cadastrada
                </button>
                <button
                  type="button"
                  onClick={() => setModoCliente("nova")}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                    modoCliente === "nova" ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  Cliente nova
                </button>
              </div>
            </div>

            {modoCliente === "existente" ? (
              <div>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} required className={campo}>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={rotulo}>Nome</label>
                  <input
                    value={nomeNovaCliente}
                    onChange={(e) => setNomeNovaCliente(e.target.value)}
                    required
                    placeholder="Nome da cliente"
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo}>Telefone</label>
                  <input
                    value={telefoneNovaCliente}
                    onChange={(e) => setTelefoneNovaCliente(e.target.value)}
                    required
                    placeholder="(48) 99999-9999"
                    className={campo}
                  />
                </div>
              </div>
            )}

            <div>
              <label className={rotulo}>Serviço</label>
              <select value={serviceId} onChange={(e) => aoTrocarServico(e.target.value)} required className={campo}>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={rotulo}>Valor (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={preco}
                  onChange={(e) => setPreco(Number(e.target.value))}
                  required
                  className={campo}
                />
              </div>
              <div>
                <label className={rotulo}>Duração (min)</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={duracao}
                  onChange={(e) => setDuracao(Number(e.target.value))}
                  className={campo}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={rotulo}>Data</label>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={campo} />
              </div>
              <div>
                <label className={rotulo}>Hora</label>
                <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required className={campo} />
              </div>
            </div>

            <div>
              <label className={rotulo}>Notas (opcional)</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={campo} />
            </div>

            {conflitos.length > 0 && (
              <div className="rounded-lg border border-amber bg-amber-soft px-3 py-2.5 text-sm text-ink">
                <p className="font-medium text-amber">Atenção: horário concorrido</p>
                {conflitos.map((c) => (
                  <p key={c.id}>
                    {c.cliente} já tem {c.servico} nesse horário.
                  </p>
                ))}
              </div>
            )}

            {erro && <p className="text-sm text-vermelho">{erro}</p>}

            <p className="text-xs text-ink-soft">A cliente recebe a confirmação automática no WhatsApp.</p>

            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-lg bg-rose px-3 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-rose-dark disabled:opacity-50"
            >
              {enviando ? "Salvando..." : "Salvar e enviar confirmação"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

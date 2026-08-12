import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { ROTULO_CATEGORIA_SERVICO, ROTULO_TIPO_PROCEDIMENTO } from "@/lib/agenda";

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ServicosPage() {
  const db = supabaseAdmin();
  const { data: servicos } = await db
    .from("services")
    .select("id, name, category, price, duration_min, tipo_procedimento")
    .order("name");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Serviços</h1>
        <Link href="/servicos/novo" className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-rose-dark">
          Novo serviço
        </Link>
      </div>

      <ul className="space-y-3">
        {(servicos ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
            <div>
              <p className="font-medium text-ink">{s.name}</p>
              <p className="text-sm text-ink-soft">
                {ROTULO_CATEGORIA_SERVICO[s.category] ?? s.category} · {s.duration_min} min
                {s.tipo_procedimento && (
                  <>
                    {" "}
                    ·{" "}
                    <span className={s.tipo_procedimento === "aplicacao" ? "text-rose" : "text-sage"}>
                      {ROTULO_TIPO_PROCEDIMENTO[s.tipo_procedimento]}
                    </span>
                  </>
                )}
              </p>
            </div>
            <p className="font-medium text-rose">{formatarReais(s.price)}</p>
          </li>
        ))}
        {(servicos ?? []).length === 0 && (
          <p className="text-sm text-ink-soft">Nenhum serviço cadastrado ainda.</p>
        )}
      </ul>
    </div>
  );
}

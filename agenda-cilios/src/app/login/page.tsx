"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }
    router.push("/inicio");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(480px_280px_at_50%_-4%,rgba(124,58,237,0.10),transparent_65%)]" />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-[0_1px_2px_rgba(17,24,39,0.03),0_12px_32px_-12px_rgba(17,24,39,0.14)]"
      >
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-rose">Painel</p>
        <h1 className="mb-1 font-display text-4xl font-semibold tracking-tight text-ink">
          Zelo <span className="text-rose">agenda</span>
        </h1>
        <p className="mb-7 text-sm text-ink-soft">Entre pra ver os agendamentos do dia.</p>

        <label className="mb-1 block text-sm font-medium text-ink">E-mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-rose"
        />

        <label className="mb-1 block text-sm font-medium text-ink">Senha</label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mb-5 w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-rose"
        />

        {erro && <p className="mb-4 text-sm text-vermelho-dark">{erro}</p>}

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-lg bg-ink px-3 py-2.5 text-sm font-medium text-cream transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

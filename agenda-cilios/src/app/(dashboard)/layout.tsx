import { Sidebar } from "./sidebar";
import { ModalNovoAgendamento } from "./agenda/modal-novo-agendamento";
import { InstallPrompt } from "./install-prompt";

// Painel sempre lê o Supabase na hora — não pode virar página estática
// com dados congelados do momento do build.
export const dynamic = "force-dynamic";

function hojeLocalISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <ModalNovoAgendamento variante="flutuante" dataInicial={hojeLocalISO()} />
      <InstallPrompt />
    </div>
  );
}

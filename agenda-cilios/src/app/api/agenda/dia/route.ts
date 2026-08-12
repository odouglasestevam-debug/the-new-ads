import { NextResponse, type NextRequest } from "next/server";
import { inicioDiaLocal } from "@/lib/dashboard";
import { buscarAgendamentosPeriodo } from "@/lib/agenda";

// Usado pelo aviso de conflito de horário no form de novo agendamento.
// Protegido pelo proxy (não está na lista de rotas públicas) — só acessível logado.
export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data");
  if (!data) return NextResponse.json({ error: "parâmetro data é obrigatório" }, { status: 400 });

  const inicio = inicioDiaLocal(data);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const agendamentos = await buscarAgendamentosPeriodo(inicio, fim);

  return NextResponse.json({
    agendamentos: agendamentos
      .filter((a) => a.status !== "cancelled")
      .map((a) => ({
        id: a.id,
        start_at: a.start_at,
        duration_min: a.duration_min,
        cliente: a.cliente?.name ?? "Cliente removido",
        servico: a.servico?.name ?? "Serviço removido",
      })),
  });
}

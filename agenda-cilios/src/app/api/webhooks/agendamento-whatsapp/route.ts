import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizarTelefone } from "@/lib/phone";
import { extrairDataDaMensagem, extrairHoraDaMensagem, extrairValorDaMensagem } from "@/lib/pendencias";

// Chamado por um nó novo no workflow n8n "Trackeamento de Mensagem Fabioli",
// no mesmo momento em que ele dispara o evento Purchase pro Meta (mensagem
// "Agendado na data..."). Não confia no parsing de data/hora pra criar
// agendamento sozinho — só sinaliza quando não acha um agendamento correspondente.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.AGENDA_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { telefone?: string; mensagem?: string; nome?: string };
  const mensagem = String(body.mensagem ?? "").trim();
  const telefone = normalizarTelefone(String(body.telefone ?? ""));

  if (!mensagem || !telefone) {
    return NextResponse.json({ error: "telefone e mensagem são obrigatórios" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: cliente } = await db.from("clients").select("id, name").eq("phone", telefone).maybeSingle();

  if (cliente) {
    const { data: agendamentoExistente } = await db
      .from("appointments")
      .select("id")
      .eq("client_id", cliente.id)
      .neq("status", "cancelled")
      .gte("start_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (agendamentoExistente) {
      // Já tem agendamento futuro pra essa cliente — provavelmente ela já lançou
      // na agenda antes de mandar a confirmação. Nada a fazer.
      return NextResponse.json({ ok: true, criada: false, motivo: "agendamento_ja_existe" });
    }
  }

  const agora = new Date();
  const { error } = await db.from("pendencias_agendamento").insert({
    telefone,
    nome_sugerido: cliente?.name ?? body.nome ?? null,
    client_id: cliente?.id ?? null,
    mensagem,
    data_sugerida: extrairDataDaMensagem(mensagem, agora),
    hora_sugerida: extrairHoraDaMensagem(mensagem),
    valor_sugerido: extrairValorDaMensagem(mensagem),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, criada: true });
}

import { supabaseAdmin } from "@/lib/supabase";

export type MotivoCancelamento = "cliente_cancelou" | "cliente_quer_reagendar" | "resposta_nao_reconhecida";

export type AvisoCancelamento = {
  id: string;
  clienteNome: string;
  motivo: MotivoCancelamento;
  mensagemRecebida: string;
  createdAt: string;
};

export async function listarAvisosCancelamentoAbertos(): Promise<AvisoCancelamento[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("avisos_cancelamento")
    .select("id, cliente_nome, motivo, mensagem_recebida, created_at")
    .eq("status", "pendente")
    .order("created_at", { ascending: false });

  return (data ?? []).map((a) => ({
    id: a.id,
    clienteNome: a.cliente_nome,
    motivo: a.motivo,
    mensagemRecebida: a.mensagem_recebida,
    createdAt: a.created_at,
  }));
}

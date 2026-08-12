import { supabaseAdmin } from "@/lib/supabase";

export type PendenciaAgendamento = {
  id: string;
  telefone: string;
  nomeSugerido: string | null;
  clientId: string | null;
  mensagem: string;
  dataSugerida: string | null; // yyyy-MM-dd
  horaSugerida: string | null; // HH:mm
  valorSugerido: number | null;
  createdAt: string;
};

// Meses escritos por extenso, do jeito que uma pessoa normalmente digita no WhatsApp.
const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// Tenta ler "dia X/Y" ou "dia X de mês" na mensagem. Sem confiança suficiente,
// retorna null — melhor deixar a Fabíola preencher do que arriscar data errada.
export function extrairDataDaMensagem(mensagem: string, agora: Date): string | null {
  const numerica = mensagem.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numerica) {
    const dia = Number(numerica[1]);
    const mes = Number(numerica[2]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      let ano = numerica[3] ? Number(numerica[3]) : agora.getFullYear();
      if (ano < 100) ano += 2000;
      return anoAjustado(dia, mes, ano, agora);
    }
  }

  const extenso = mensagem.match(/\b(\d{1,2})\s+de\s+([a-zç]+)\b/i);
  if (extenso) {
    const dia = Number(extenso[1]);
    const mesTexto = extenso[2].toLowerCase().slice(0, 3);
    const mes = MESES[mesTexto];
    if (mes && dia >= 1 && dia <= 31) {
      return anoAjustado(dia, mes, agora.getFullYear(), agora);
    }
  }

  return null;
}

// Se a data já passou há mais de 1 dia nesse ano, assume que é ano que vem
// (ex: mensagem de dezembro citando "5/1" é o janeiro seguinte).
function anoAjustado(dia: number, mes: number, ano: number, agora: Date): string {
  const candidata = new Date(ano, mes - 1, dia);
  if (candidata.getTime() < agora.getTime() - 86_400_000) {
    candidata.setFullYear(candidata.getFullYear() + 1);
  }
  const yyyy = candidata.getFullYear();
  const mm = String(candidata.getMonth() + 1).padStart(2, "0");
  const dd = String(candidata.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Tenta ler "14h", "14h30", "14:00", "às 2 da tarde" — formatos comuns de digitação humana.
export function extrairHoraDaMensagem(mensagem: string): string | null {
  const comMinutos = mensagem.match(/\b(\d{1,2})[h:](\d{2})\b/i);
  if (comMinutos) {
    const h = Number(comMinutos[1]);
    const m = Number(comMinutos[2]);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const soHora = mensagem.match(/\b(\d{1,2})\s*h(?:s)?\b/i);
  if (soHora) {
    const h = Number(soHora[1]);
    if (h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  return null;
}

// Mesma lógica de extração de valor usada no n8n (regex de "R$ X"), pra manter
// o mesmo comportamento entre as duas automações.
export function extrairValorDaMensagem(mensagem: string): number | null {
  const match = mensagem.match(/R\$\s*([\d.]+,?\d{0,2}|\d+)/i);
  if (!match) return null;
  const normalizado = match[1].replace(/\./g, "").replace(",", ".");
  const valor = parseFloat(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

export async function listarPendenciasAbertas(): Promise<PendenciaAgendamento[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("pendencias_agendamento")
    .select("id, telefone, nome_sugerido, client_id, mensagem, data_sugerida, hora_sugerida, valor_sugerido, created_at")
    .eq("status", "pendente")
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    telefone: p.telefone,
    nomeSugerido: p.nome_sugerido,
    clientId: p.client_id,
    mensagem: p.mensagem,
    dataSugerida: p.data_sugerida,
    horaSugerida: p.hora_sugerida,
    valorSugerido: p.valor_sugerido ? Number(p.valor_sugerido) : null,
    createdAt: p.created_at,
  }));
}

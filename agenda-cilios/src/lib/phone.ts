// Extração robusta de telefone a partir do payload whatsmeow (NeoGo/NeoAI).
// O número "de verdade" pode vir em Info.Chat ou Info.SenderAlt dependendo de como
// o WhatsApp endereçou a mensagem (JID de telefone vs LID de privacidade) — não é fixo,
// então sempre checamos qual dos dois é o JID de telefone real (@s.whatsapp.net).
export function extrairTelefone(info: {
  Chat?: string;
  SenderAlt?: string;
}): string | null {
  const chat = info.Chat ?? "";
  const senderAlt = info.SenderAlt ?? "";
  const jid = chat.includes("@s.whatsapp.net") ? chat : senderAlt;
  if (!jid.includes("@s.whatsapp.net")) return null;
  return jid.split("@")[0];
}

// Normaliza pro formato que o NeoGo espera no "number": só dígitos, com DDI.
export function normalizarTelefone(numero: string): string {
  return numero.replace(/\D/g, "");
}

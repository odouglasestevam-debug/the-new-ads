// Envio pelo número de cobrança: um fluxo do n8n com o node do NeoGo (a API do NeoGo só está
// acessível por esse node). O fluxo responde 2xx só depois que o NeoGo aceitou a mensagem;
// qualquer outra resposta conta como falha e fica registrada, nunca vira sucesso.
export async function enviarWhatsApp(url: string, token: string, numero: string, texto: string) {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-financeiro-token": token },
    body: JSON.stringify({ numero, texto }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resposta.ok) {
    const corpo = (await resposta.text().catch(() => "")).slice(0, 150);
    throw new Error(`WhatsApp (n8n) respondeu ${resposta.status}${corpo ? ": " + corpo : ""}`);
  }
}

// Intervalo entre clientes, pra não parecer disparo em massa.
export const pausa = () => new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

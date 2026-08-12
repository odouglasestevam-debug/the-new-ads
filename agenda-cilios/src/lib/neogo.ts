// Client HTTP pro NeoGo (mesma família da NeoAI: WhatsApp gateway estilo Evolution API).
// Doc mapeada a partir do código-fonte do pacote n8n-nodes-neogo.

function baseUrl() {
  const url = process.env.NEOGO_BASE_URL;
  if (!url) throw new Error("NEOGO_BASE_URL não configurado");
  return url.replace(/\/$/, "");
}

function apiKey() {
  const key = process.env.NEOGO_API_KEY;
  if (!key) throw new Error("NEOGO_API_KEY não configurado");
  return key;
}

async function neogoFetch(path: string, body: unknown) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NeoGo ${path} falhou (${res.status}): ${text}`);
  }
  return res.json().catch(() => ({}));
}

// number: só dígitos com DDI, ex "5548999999999" (sem @s.whatsapp.net, sem +).
export function sendText(number: string, text: string) {
  return neogoFetch("/send/text", { number, text });
}

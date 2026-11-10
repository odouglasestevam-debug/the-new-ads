import webpush from "npm:web-push@3.6.7";

export type Inscricao = { endpoint: string; p256dh: string; auth: string };
export type Carga = { titulo: string; corpo: string; url: string };

// Validação também no envio, além da constraint do banco.
export function endpointPermitido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !url.hash && endpoint.length <= 4096 &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9-]+\.push\.apple\.com)$/.test(url.hostname);
  } catch { return false; }
}

export function configurarVapid(publica: string, privada: string) {
  webpush.setVapidDetails("mailto:odouglasestevam@gmail.com", publica, privada);
}

// urgency high: com "normal" o Android segura a notificação até o app abrir.
// Aparelho que o serviço de push devolve 404/410 não existe mais e é apagado.
export async function enviarPush(inscricoes: Inscricao[], carga: Carga, apagar: (endpoint: string) => Promise<unknown>) {
  let enviados = 0;
  const erros: string[] = [];
  for (const i of inscricoes) {
    if (!endpointPermitido(i.endpoint)) { erros.push("Serviço de notificação não permitido."); continue; }
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify(carga),
        { urgency: "high", TTL: 86400, timeout: 10000 },
      );
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await apagar(i.endpoint);
      else erros.push(`${status || ""} ${(e as Error).message}`.trim());
    }
  }
  return { enviados, erros };
}

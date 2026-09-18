// Validação também no envio: inscrições antigas podem anteceder a constraint do banco.
export function endpointPermitido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !url.hash && endpoint.length <= 4096 &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9-]+\.push\.apple\.com)$/.test(url.hostname);
  } catch { return false; }
}

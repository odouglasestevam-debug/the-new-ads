// Hosts autorizados explicitamente; redirects nunca recebem credenciais.
export function neoGoBase(value: string, allowed = Deno.env.get('NEOGO_ALLOWED_HOSTS') || '') {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('URL da NeoGo inválida.'); }
  const hosts = allowed.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.port && url.port !== '443' || url.pathname !== '/' || !hosts.includes(url.hostname.toLowerCase())) {
    throw new Error('Autorize o domínio HTTPS da NeoGo em NEOGO_ALLOWED_HOSTS antes de conectar. Use apenas a URL base, sem caminho ou credenciais.');
  }
  return url.origin;
}

export function temMfaPendente(user: any, token: string) {
  if (!(user.factors || []).some((f: any) => f.status === 'verified')) return false;
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return claims.aal !== 'aal2';
  } catch { return true; }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Acesso a Admin API da loja Arcan TCG (Shopify) a partir das Pages Functions.
// App "cc-os" com client credentials. Secrets do Pages:
// ARCAN_SHOPIFY_CLIENT_ID, ARCAN_SHOPIFY_CLIENT_SECRET

const LOJA = "ph1huc-mu.myshopify.com";
const API_VERSION = "2026-07";

// O token do client credentials vale 24h. Guarda enquanto a instancia viver.
let tokenCache = null;

async function tokenShopify(env) {
  if (tokenCache && tokenCache.expira > Date.now()) return tokenCache.valor;

  const res = await fetch(`https://${LOJA}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.ARCAN_SHOPIFY_CLIENT_ID,
      client_secret: env.ARCAN_SHOPIFY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token shopify ${res.status}: ${await res.text()}`);

  const dados = await res.json();
  tokenCache = { valor: dados.access_token, expira: Date.now() + (dados.expires_in - 600) * 1000 };
  return tokenCache.valor;
}

export async function gql(env, query, variables = {}) {
  const res = await fetch(`https://${LOJA}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await tokenShopify(env) },
    body: JSON.stringify({ query, variables }),
  });
  const dados = await res.json();
  if (!res.ok || dados.errors) throw new Error(`graphql ${res.status}: ${JSON.stringify(dados.errors || dados)}`);
  return dados.data;
}

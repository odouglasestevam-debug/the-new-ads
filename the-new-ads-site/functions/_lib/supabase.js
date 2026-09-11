// Acesso ao Supabase a partir das Functions do Pages.
// Usa a chave publica: as tabelas do funil so permitem INSERT para o papel anonimo,
// leitura exige sessao autenticada (politicas de RLS no proprio banco).

export const SUPABASE_URL = "https://iklynyncffneuvutvgxa.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbHlueW5jZmZuZXV2dXR2Z3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMzA3NDUsImV4cCI6MjA5NzYwNjc0NX0.-vIteLhTDir-PeOrVzeGt7TdG05cYLMMJXmePauhdy4";

// Chave usada pelas Functions pra escrever. A chave de servico fica so aqui
// no servidor e ignora as regras de acesso do banco, o que permite fechar a
// escrita anonima sem quebrar a gravacao legitima. Sem ela, cai na publica.
function chaveDeEscrita(env) {
  return env?.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
}

// Insere uma linha. Nao pede o registro de volta: o id vem gerado daqui.
export async function inserir(env, tabela, linha) {
  const chave = chaveDeEscrita(env);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: "POST",
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(linha),
  });

  if (!res.ok) {
    throw new Error(`supabase ${res.status}: ${await res.text()}`);
  }
}

// Le uma linha pelo id. Usa a chave de servico, entao ignora o RLS: so as
// Functions chamam isso, nunca o navegador.
export async function buscarPorId(env, tabela, id, colunas = "*") {
  if (!id) return null;
  const chave = chaveDeEscrita(env);
  const url = `${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(colunas)}&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  });

  if (!res.ok) return null;
  const linhas = await res.json();
  return Array.isArray(linhas) && linhas.length ? linhas[0] : null;
}

// Chama uma funcao do banco (RPC) e devolve o resultado.
export async function rpcValor(env, nome, argumentos) {
  const chave = chaveDeEscrita(env);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(argumentos),
  });
  if (!res.ok) throw new Error(`supabase rpc ${nome} ${res.status}`);
  return res.json();
}

// Chama uma funcao do banco (RPC).
export async function rpc(env, nome, argumentos) {
  const chave = chaveDeEscrita(env);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(argumentos),
  });

  if (!res.ok) {
    throw new Error(`supabase rpc ${nome} ${res.status}: ${await res.text()}`);
  }
}

// Dispara notificacao no app do funil. Nunca lanca: falha de push
// nao pode derrubar a operacao que a originou.
// O segredo compartilhado impede que terceiros com a chave publica
// disparem notificacao nos aparelhos do time.
export async function notificar(env, titulo, corpo, url) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notificar-funil`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "x-funil-secret": env?.FUNIL_PUSH_SECRET || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titulo, corpo, url }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

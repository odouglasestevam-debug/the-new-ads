// GET /api/arcan/avaliacoes
// Avaliacoes aprovadas (status Ativo) da loja Arcan TCG, pra prova social no
// checkout da Yampi (seguro.arcantcg.com.br). Aprovou no admin da Shopify,
// aparece no checkout em ate CACHE_SEGUNDOS, sem mexer em nada aqui.
//
// So sai campo publico: nome de exibicao, nota, texto, data, foto e produto.
// O contato (avaliacao_contato) nunca e lido nem devolvido.

import { gql } from "../../_lib/arcan-shopify.js";

const CACHE_SEGUNDOS = 600;
const MAX_AVALIACOES = 20;

const CONSULTA = `query {
  metaobjects(type: "avaliacao", first: 100) {
    nodes {
      capabilities { publishable { status } }
      nome: field(key: "nome_exibicao") { value }
      nota: field(key: "nota") { value }
      texto: field(key: "texto") { value }
      data: field(key: "data") { value }
      produto: field(key: "produto") { reference { ... on Product { title } } }
      fotos: field(key: "fotos") {
        references(first: 1) { nodes { ... on MediaImage { image { url(transform: { maxWidth: 240, maxHeight: 240 }) } } } }
      }
    }
  }
}`;

function resposta(corpo, status, segundosCache) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": segundosCache ? `public, max-age=${segundosCache}` : "no-store",
    },
  });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const chave = new Request(new URL("/api/arcan/avaliacoes", request.url).toString());
  const guardada = await cache.match(chave);
  if (guardada) return guardada;

  try {
    const dados = await gql(env, CONSULTA);

    const avaliacoes = dados.metaobjects.nodes
      .filter((n) => n.capabilities?.publishable?.status === "ACTIVE")
      .map((n) => ({
        nome: n.nome?.value || "Cliente",
        nota: Number(n.nota?.value) || 0,
        texto: (n.texto?.value || "").trim(),
        data: n.data?.value || null,
        produto: n.produto?.reference?.title || null,
        foto: n.fotos?.references?.nodes?.[0]?.image?.url || null,
      }))
      .filter((a) => a.nota >= 1 && a.nota <= 5 && a.texto)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    const total = avaliacoes.length;
    const media = total ? Math.round((avaliacoes.reduce((s, a) => s + a.nota, 0) / total) * 10) / 10 : null;

    const res = resposta({ total, media, avaliacoes: avaliacoes.slice(0, MAX_AVALIACOES) }, 200, CACHE_SEGUNDOS);
    waitUntil(cache.put(chave, res.clone()));
    return res;
  } catch (erro) {
    console.error("avaliacoes arcan", erro);
    // Sem cache no erro: o checkout so deixa de mostrar o bloco.
    return resposta({ total: 0, media: null, avaliacoes: [] }, 502, 0);
  }
}

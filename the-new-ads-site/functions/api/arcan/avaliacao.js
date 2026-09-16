// POST /api/arcan/avaliacao
// Recebe o formulario de avaliacao da loja Arcan TCG (Shopify) e grava a
// avaliacao como metaobject na propria loja. Nada fica guardado aqui: a
// Shopify e o unico sistema, a aprovacao acontece no admin dela.
//
// Regra de publicacao:
// - WhatsApp ou e-mail bate com pedido pago e o texto passa no filtro: entra Ativa (no site)
// - qualquer outro caso: entra como Rascunho, esperando aprovacao no admin
//
// Credenciais (secrets do Pages): ARCAN_SHOPIFY_CLIENT_ID, ARCAN_SHOPIFY_CLIENT_SECRET

const LOJA = "ph1huc-mu.myshopify.com";
const API_VERSION = "2026-07";

const ORIGENS_PERMITIDAS = [
  /^https:\/\/(www\.)?arcantcg\.com\.br$/,
  /^https:\/\/ph1huc-mu\.myshopify\.com$/,
  /^https:\/\/[a-z0-9-]+\.shopifypreview\.com$/,
];

const TEMPO_MINIMO_MS = 4000;
const MAX_FOTOS = 3;
const MAX_BYTES_FOTO = 8 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

// Palavroes e ofensas mais comuns. Nao precisa ser completo: o que passar
// sem match ja vai pra revisao de qualquer jeito.
const PALAVRAS_BLOQUEADAS = [
  "porra", "caralho", "merda", "puta", "puto", "fdp", "foda", "fodase", "foda-se",
  "cu", "buceta", "viado", "arrombado", "otario", "otaria", "idiota", "imbecil",
  "lixo", "golpe", "golpista", "ladrao", "ladroes", "vagabundo", "vagabunda",
  "desgraça", "desgraca", "corno", "babaca", "pqp", "vsf", "vtnc", "krl",
];

// ---------------------------------------------------------------- respostas

function cabecalhosCors(request) {
  const origem = request.headers.get("origin") || "";
  const permitida = ORIGENS_PERMITIDAS.some((re) => re.test(origem));
  return {
    "Access-Control-Allow-Origin": permitida ? origem : "https://arcantcg.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(request, dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json", ...cabecalhosCors(request) },
  });
}

export async function onRequestOptions({ request }) {
  return new Response(null, { headers: cabecalhosCors(request) });
}

// ---------------------------------------------------------------- shopify

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

async function gql(env, query, variables = {}) {
  const res = await fetch(`https://${LOJA}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await tokenShopify(env) },
    body: JSON.stringify({ query, variables }),
  });
  const dados = await res.json();
  if (!res.ok || dados.errors) throw new Error(`graphql ${res.status}: ${JSON.stringify(dados.errors || dados)}`);
  return dados.data;
}

// Erros de validacao da Shopify vem em userErrors com status 200.
function exigirSemErros(resultado, operacao) {
  const erros = resultado?.userErrors || [];
  if (erros.length) throw new Error(`${operacao}: ${JSON.stringify(erros)}`);
  return resultado;
}

// ---------------------------------------------------------------- normalizacao

function texto(valor, limite = 300) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim().slice(0, limite);
}

// Compara por DDD + ultimos 8 digitos: funciona com e sem o nono digito
// e com ou sem o +55 na frente.
function chaveTelefone(valor) {
  let digitos = String(valor || "").replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
  if (digitos.length < 10) return null;
  return digitos.slice(0, 2) + digitos.slice(-8);
}

function chaveEmail(valor) {
  const limpo = String(valor || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) ? limpo : null;
}

// "lucas henrique souza" -> "Lucas S."
function nomeExibicao(nomeCompleto) {
  const partes = nomeCompleto.split(/\s+/).filter(Boolean);
  const capitalizar = (p) => p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
  if (partes.length === 1) return capitalizar(partes[0]);
  return `${capitalizar(partes[0])} ${partes[partes.length - 1].charAt(0).toLocaleUpperCase("pt-BR")}.`;
}

// ---------------------------------------------------------------- regras

function motivoNoTexto(comentario) {
  const minusculo = comentario.toLowerCase();
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|shop|store|xyz)\b)/i.test(minusculo)) return "link no comentário";
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(minusculo)) return "e-mail no comentário";
  if ((minusculo.match(/\d/g) || []).length >= 8 && /\d[\d\s().-]{7,}\d/.test(minusculo)) return "telefone no comentário";

  const palavras = minusculo.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9-]+/);
  const bloqueadas = PALAVRAS_BLOQUEADAS.map((p) => p.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  if (palavras.some((p) => bloqueadas.includes(p))) return "palavra ofensiva no comentário";

  return null;
}

// Procura pedido pago com o mesmo WhatsApp (telefone do endereco, que e onde
// a Yampi grava) ou o mesmo e-mail. A API so enxerga os ultimos 60 dias.
async function buscarCompra(env, telefone, email) {
  let cursor = null;
  for (let pagina = 0; pagina < 4; pagina++) {
    const dados = await gql(
      env,
      `query($cursor: String) {
        orders(first: 250, after: $cursor, reverse: true,
               query: "financial_status:paid OR financial_status:partially_refunded") {
          nodes { name email phone customer { email phone }
                  shippingAddress { phone } billingAddress { phone } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor },
    );

    for (const pedido of dados.orders.nodes) {
      const telefones = [pedido.phone, pedido.customer?.phone, pedido.shippingAddress?.phone, pedido.billingAddress?.phone]
        .map(chaveTelefone)
        .filter(Boolean);
      const emails = [pedido.email, pedido.customer?.email].map(chaveEmail).filter(Boolean);

      if ((telefone && telefones.includes(telefone)) || (email && emails.includes(email))) return pedido.name;
    }

    if (!dados.orders.pageInfo.hasNextPage) return null;
    cursor = dados.orders.pageInfo.endCursor;
  }
  return null;
}

async function produtoValido(env, produtoId) {
  if (!/^\d+$/.test(produtoId)) return null;
  const gid = `gid://shopify/Product/${produtoId}`;
  const dados = await gql(env, `query($id: ID!) { product(id: $id) { id } }`, { id: gid });
  return dados.product?.id || null;
}

// Foto: reserva espaco na Shopify, sobe o arquivo direto pra la e registra em Arquivos.
async function enviarFoto(env, arquivo, alt) {
  const reserva = await gql(
    env,
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [{
        resource: "IMAGE",
        filename: arquivo.name || "foto.jpg",
        mimeType: arquivo.type,
        fileSize: String(arquivo.size),
        httpMethod: "POST",
      }],
    },
  );
  const alvo = exigirSemErros(reserva.stagedUploadsCreate, "stagedUploadsCreate").stagedTargets[0];

  const envio = new FormData();
  for (const { name, value } of alvo.parameters) envio.append(name, value);
  envio.append("file", arquivo, arquivo.name || "foto.jpg");
  const subida = await fetch(alvo.url, { method: "POST", body: envio });
  if (!subida.ok) throw new Error(`upload foto ${subida.status}: ${await subida.text()}`);

  const criado = await gql(
    env,
    `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id } userErrors { field message } }
    }`,
    { files: [{ originalSource: alvo.resourceUrl, contentType: "IMAGE", alt }] },
  );
  return exigirSemErros(criado.fileCreate, "fileCreate").files[0].id;
}

async function criarMetaobject(env, type, campos, status) {
  const dados = await gql(
    env,
    `mutation($m: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $m) { metaobject { id handle } userErrors { field message code } }
    }`,
    {
      m: {
        type,
        // O handle padrao vem do nome e colide entre dois "Lucas S.".
        handle: `${type.replace(/_/g, "-")}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        fields: Object.entries(campos)
          .filter(([, valor]) => valor !== null && valor !== "")
          .map(([key, value]) => ({ key, value })),
        ...(status ? { capabilities: { publishable: { status } } } : {}),
      },
    },
  );
  return exigirSemErros(dados.metaobjectCreate, `metaobjectCreate ${type}`).metaobject;
}

// ---------------------------------------------------------------- handler

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json(request, { ok: false, erro: "formulario_invalido" }, 400);
  }

  // Robo: finge sucesso pra nao ensinar o que foi barrado.
  if (texto(form.get("empresa_site"))) return json(request, { ok: true, publicada: false });
  const decorrido = Number(form.get("tempo_ms") || 0);
  if (!decorrido || decorrido < TEMPO_MINIMO_MS) return json(request, { ok: true, publicada: false });

  const nome = texto(form.get("nome"), 80);
  const whatsapp = texto(form.get("whatsapp"), 30);
  const email = texto(form.get("email"), 120);
  const comentario = texto(form.get("texto"), 2000);
  const nota = Number(form.get("nota"));
  const produtoId = texto(form.get("produto_id"), 30);
  const fotos = form.getAll("fotos").filter((f) => typeof f === "object" && f.size > 0);

  const telefone = chaveTelefone(whatsapp);
  const emailNormalizado = email ? chaveEmail(email) : null;

  if (nome.length < 2) return json(request, { ok: false, erro: "Informe seu nome." }, 400);
  if (!telefone) return json(request, { ok: false, erro: "Informe um WhatsApp válido com DDD." }, 400);
  if (email && !emailNormalizado) return json(request, { ok: false, erro: "E-mail inválido." }, 400);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) return json(request, { ok: false, erro: "Escolha de 1 a 5 estrelas." }, 400);
  if (fotos.length > MAX_FOTOS) return json(request, { ok: false, erro: `Envie no máximo ${MAX_FOTOS} fotos.` }, 400);
  for (const foto of fotos) {
    if (!TIPOS_FOTO.includes(foto.type) || foto.size > MAX_BYTES_FOTO) {
      return json(request, { ok: false, erro: "As fotos precisam ser JPG, PNG ou WEBP de até 8 MB." }, 400);
    }
  }

  try {
    const [pedido, produto] = await Promise.all([
      buscarCompra(env, telefone, emailNormalizado),
      produtoId ? produtoValido(env, produtoId) : null,
    ]);

    const motivoTexto = motivoNoTexto(comentario);
    const motivo = !pedido ? "compra não encontrada" : motivoTexto;
    const publicar = !motivo;
    const exibido = nomeExibicao(nome);

    const fotoIds = [];
    for (const foto of fotos) fotoIds.push(await enviarFoto(env, foto, `Foto da avaliação de ${exibido}`));

    const contato = await criarMetaobject(env, "avaliacao_contato", {
      nome,
      whatsapp,
      email: emailNormalizado || "",
      pedido: pedido || "",
    });

    await criarMetaobject(
      env,
      "avaliacao",
      {
        nome_exibicao: exibido,
        nota: String(nota),
        texto: comentario,
        produto: produto || "",
        fotos: fotoIds.length ? JSON.stringify(fotoIds) : "",
        data: new Date().toISOString(),
        compra_encontrada: pedido ? "true" : "false",
        motivo_revisao: motivo || "",
        contato: contato.id,
      },
      publicar ? "ACTIVE" : "DRAFT",
    );

    return json(request, { ok: true, publicada: publicar });
  } catch (erro) {
    console.error("avaliacao arcan", erro);
    return json(request, { ok: false, erro: "Não foi possível enviar agora. Tente de novo em instantes." }, 500);
  }
}

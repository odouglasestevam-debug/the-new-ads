// Monitor de ofertas da Black Friday 2026 (pedido do Douglas em 23/11/2026).
//
// Produtos e regras de preco (decididas por ele):
//   DualSense ................. avisa abaixo de R$ 330; preco-alvo abaixo de R$ 300
//   Ar 18.000 BTUs inverter ... avisa ate R$ 2.500; preco-alvo ate R$ 2.374
//   Ar 24.000 BTUs inverter ... avisa ate R$ 3.000; preco-alvo abaixo de R$ 2.800
//     Alerta forte: Elgin Eco Inverter III de 24 mil (normal R$ 3.600 a 3.700)
//     avisa ate R$ 3.300 e o push chega 3 vezes em 1 minuto. As outras marcas
//     seguem a regra normal.
//   Depurador de cozinha de 430 m3/h (linha Slim da Suggar): avisa qualquer preco
// Sem preco na mensagem nao avisa (era chamada pra canal ou "mandando opcoes"),
// exceto o depurador com link de loja, que nao tem teto.
//
// Duas entradas. As duas exigem a chave de acesso (ver HASH_CHAVE), no fim do
// caminho (/ofertas/<chave>) ou em ?k=<chave>:
//   POST da NeoGo, instancia "Douglas" (numero pessoal): mensagem de grupo ou
//     canal que fala de um dos produtos. Conversa pessoal e mensagem que nao
//     casa sao descartadas na hora, sem gravar nada e sem log do conteudo.
//   POST ?tarefa=pelando (computador do Douglas a cada 5 min, script
//     tna-alertas/ofertas-pc/pelando.py): ofertas lidas na busca do Pelando.
//     O Pelando devolve a verificacao do Cloudflare (403) pra servidor, entao a
//     leitura sai de conexao residencial; com o PC desligado, so o WhatsApp vale.
//   ?tarefa=saude (pg_cron a cada 10 min): confere se a NeoGo continua mandando
//     mensagem. Se ela parar, ou se o Pelando falhar 3 vezes seguidas, abre
//     alerta normal do TNA Alertas (alerta_abrir).
//   ?tarefa=teste manda um push de oferta de exemplo (&especial=1 pro preco-alvo).
//   ?dry=1 calcula sem gravar e sem notificar.
//
// Aviso: push no TNA Alertas com tipo "oferta" (o sw.js mostra diferente dos
// alertas de cliente e abre a oferta ao tocar). Um aviso por oferta; o mesmo
// produto e preco vindo de outro grupo ou do Pelando em ate 6h nao avisa de novo.
// Tudo que avisou fica na aba "Ofertas" do app (funcao ofertas_avisadas no banco).
// Depois de 30/11 a funcao nao faz mais nada.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// SHA-256 da chave de acesso. A chave em si so existe no endereco do webhook
// configurado na NeoGo e no comando do pg_cron (cron.job).
const HASH_CHAVE = "87ada25aeaa77852d30e9a8b3da34705dfd5a7d44fe4eb3e720a2c2fdf61f4b4";
const FIM = Date.parse("2026-12-01T03:00:00Z"); // fim de 30/11 em Brasilia
const APP_URL = "https://thenewads.com.br/alertas";
// Oferta some rapido: push que ficou mais de 1h na fila nao serve mais.
const ENVIO_OFERTA = { urgency: "high", TTL: 3600 } as const;
const ENVIO_ALERTA = { urgency: "high", TTL: 86400 } as const;

const JANELA_PELANDO_H = 72; // post do Pelando mais velho que isso nao avisa
const JANELA_REPETIDA_H = 6; // mesmo produto e preco ja avisado
const WHATSAPP_MUDO_MIN = 90; // grupos de oferta nunca ficam tanto tempo quietos de dia
const PELANDO_FALHAS = 3; // rodadas seguidas sem conseguir ler antes de alertar

type Produto = "ar_18k" | "ar_24k" | "depurador" | "dualsense";

interface Regra {
  nome: string; // vai no titulo do push
  casa: (t: string) => boolean; // t ja normalizado (minusculo, sem acento)
  palavra: RegExp; // acha a linha com o nome do produto na mensagem do grupo
  piso: number; // preco abaixo disso e acessorio, parcela ou desconto
  avisa: (p: number) => boolean;
  especial: (p: number) => boolean;
  semTeto?: boolean; // sem preco na mensagem ainda avisa (se tiver link de loja)
  // Modelo que ele quer muito: teto proprio e push repetido (ver REPETE_FORTE_S).
  forte?: { nome: string; casa: (t: string) => boolean; ate: number; normal: string };
}

// Elgin Eco Inverter III (as vezes so "Elgin Eco III"); nao pega o Eco II.
const elginEco3 = (t: string) => /\belgin\b/.test(t) && /\beco (inverter )?(iii|3)\b/.test(t);
const REPETE_FORTE_S = [30, 60]; // alerta forte: mais dois pushes, 30 s e 60 s depois do primeiro

// Peca e modelo que nao sao o split hi-wall que ele quer.
const NAO_E_SPLIT = /\b(bi|tri|multi)[ -]?split|piso[ -]?teto|cassete|suporte (para|p\/)|tubulacao|capacitor|controle remoto/;
const ar = (btus: string) => (t: string) =>
  new RegExp(`(^|\\D)${btus}[ .]?000(\\D|$)|(^|\\D)${btus} ?k(\\W|btu|$)|(^|\\D)${btus} mil\\b`).test(t) &&
  /btu/.test(t) && (/inverter/.test(t) || elginEco3(t)) && !NAO_E_SPLIT.test(t);

// A ordem importa: mensagem que cita mais de um produto fica com o primeiro.
const REGRAS: Record<Produto, Regra> = {
  ar_18k: {
    nome: "Ar 18.000 inverter",
    casa: ar("18"),
    palavra: /btu|ar[ -]condicionado|split/,
    piso: 1500,
    avisa: (p) => p <= 2500,
    especial: (p) => p <= 2374,
  },
  ar_24k: {
    nome: "Ar 24.000 inverter",
    casa: ar("24"),
    palavra: /btu|ar[ -]condicionado|split/,
    piso: 2000,
    avisa: (p) => p <= 3000,
    especial: (p) => p < 2800,
    forte: { nome: "ELGIN ECO III 24 mil", casa: elginEco3, ate: 3300, normal: "R$ 3.600 a R$ 3.700" },
  },
  depurador: {
    nome: "Depurador 430 m³/h",
    casa: (t) =>
      /depurador/.test(t) &&
      (/430\s*m/.test(t) || (/suggar/.test(t) && /slim/.test(t)) || /\b(dps1[68]\d|di8081|dth81)/.test(t)),
    palavra: /depurador/,
    piso: 150,
    avisa: () => true,
    especial: () => false,
    semTeto: true,
  },
  dualsense: {
    nome: "DualSense",
    casa: (t) =>
      (/dual ?sense/.test(t) || (/\bcontrole\b/.test(t) && /\bsony\b/.test(t) && /\bps ?5\b/.test(t))) &&
      !/\b(base|carregador|carregamento|dock|doca|capa|case|grip|pelicula|suporte|cabo|estacao|skin|adesivo|protetor|modulo)\b/
        .test(t),
    palavra: /dual ?sense|controle/,
    piso: 200,
    avisa: (p) => p < 330,
    especial: (p) => p < 300,
  },
};

const LOJAS: Array<[RegExp, string]> = [
  [/amzn\.|amazon\./, "Amazon"],
  [/mercadoli|meli\.la|meli\.promo|mercadolibre/, "Mercado Livre"],
  [/magazineluiza|magalu/, "Magalu"],
  [/shopee|shp\.ee/, "Shopee"],
  [/kabum/, "KaBuM!"],
  [/casasbahia/, "Casas Bahia"],
  [/pontofrio|pontodigital|\bponto\.com/, "Ponto"],
  [/aliexpress/, "AliExpress"],
  [/carrefour/, "Carrefour"],
  [/fastshop/, "Fast Shop"],
  [/americanas/, "Americanas"],
  [/leroymerlin/, "Leroy Merlin"],
  [/webcontinental/, "WebContinental"],
  [/friopecas/, "Frio Peças"],
  [/dufrio/, "Dufrio"],
  [/girafa/, "Girafa"],
];

// Palavras em maiusculo que aparecem depois de "cupom" e nao sao codigo.
const NAO_E_CUPOM = new Set(["DESCONTO", "APLICADO", "AUTOMATICO", "ATIVO", "LOJA", "PARA", "VALIDO", "COMPRA", "NO", "OFF"]);

interface Oferta {
  chave: string;
  fonte: "pelando" | "whatsapp";
  produto: Produto;
  titulo: string | null;
  preco: number | null;
  cupom: string | null;
  loja: string | null;
  link: string | null;
  origem: string | null;
  texto: string | null;
  imagem?: string | null;
  motivo?: string | null;
}

// ---------- texto ----------

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function classificar(t: string): Produto | null {
  for (const p of Object.keys(REGRAS) as Produto[]) if (REGRAS[p].casa(t)) return p;
  return null;
}

// Valores em R$ que podem ser o preco: tira parcela, desconto, cashback e frete.
function precos(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/gi)) {
    const i = m.index ?? 0;
    const antes = norm(texto.slice(Math.max(0, i - 25), i));
    const depois = norm(texto.slice(i + m[0].length, i + m[0].length + 20));
    if (/\d\s*x(\s|\b)[^$]{0,18}$/.test(antes)) continue; // 10x de R$ 31,90
    if (/(cupom|desconto|economi\w*|cashback|frete|off|ganhe|volta)\s*(de\s*)?$/.test(antes)) continue;
    if (/^\s*(off|de desconto|de cashback|em cashback|de volta|a menos)/.test(depois)) continue;
    const v = Number(m[1].replace(/\./g, "") + "." + (m[2] ?? "0"));
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

function cupom(texto: string): string | null {
  for (const m of texto.matchAll(/cupo[mn]s?/gi)) {
    const i = (m.index ?? 0) + m[0].length;
    const trecho = texto.slice(i, i + 40);
    for (const c of trecho.matchAll(/\b[A-Z0-9]{4,24}\b/g)) {
      if (/[A-Z]/.test(c[0]) && !NAO_E_CUPOM.has(c[0])) return c[0];
    }
  }
  return null;
}

function limparLinha(l: string) {
  return l.replace(/https?:\/\/\S+/g, "").replace(/[*_~`]/g, "")
    .replace(/[^\p{L}\p{N}\s.,:;!?()/+%$&'-]/gu, "").replace(/\s+/g, " ").trim();
}

function tituloDaMensagem(texto: string, regra: Regra): string | null {
  const linhas = texto.split("\n").map(limparLinha).filter((x) => /\p{L}{3}/u.test(x));
  const l = linhas.find((x) => regra.palavra.test(norm(x))) ?? linhas[0];
  return l ? l.slice(0, 100) : null;
}

function lojaDoLink(link: string | null): string | null {
  if (!link) return null;
  const l = link.toLowerCase();
  for (const [re, nome] of LOJAS) if (re.test(l)) return nome;
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function textoDaMensagem(bruto: any): string | null {
  let m = bruto || {};
  for (let i = 0; i < 4; i++) {
    const e = m.ephemeralMessage || m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension ||
      m.documentWithCaptionMessage || m.editedMessage;
    if (!e?.message) break;
    m = e.message;
  }
  if (typeof m.conversation === "string") return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  for (const k of ["imageMessage", "videoMessage", "documentMessage"]) if (m[k]?.caption) return m[k].caption;
  return null;
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resumo(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function reais(v: number) {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

// ---------- push ----------

async function push(payload: Record<string, unknown>, opcoes: Record<string, unknown>): Promise<number> {
  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  let ok = 0;
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        opcoes,
      );
      ok++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("ofertas push:", err?.statusCode ?? String(err).slice(0, 120));
      }
    }
  }));
  return ok;
}

function payloadOferta(o: Oferta, especial: boolean, id: number | string, forte = false) {
  const regra = REGRAS[o.produto];
  const preco = o.preco != null ? reais(o.preco) : "(preço no link)";
  const onde = [o.loja, o.cupom ? `cupom ${o.cupom}` : null, o.fonte === "pelando" ? "Pelando" : "grupo de WhatsApp"]
    .filter(Boolean).join(" · ");
  return {
    tipo: "oferta",
    especial: especial || forte,
    forte,
    title: forte && regra.forte
      ? `🚨 ${regra.forte.nome} · ${preco}`
      : `${especial ? "🔥 PREÇO-ALVO" : "🛒 Oferta"} · ${regra.nome} ${preco}`,
    body: [o.titulo, onde, forte && regra.forte ? `Preço normal: ${regra.forte.normal}` : null].filter(Boolean).join("\n"),
    url: o.link ?? `${APP_URL}#ofertas`,
    image: o.imagem ?? null,
    tag: `oferta-${id}`,
  };
}

// ---------- registro e decisao de avisar ----------

async function registrar(o: Oferta, dry: boolean) {
  const regra = REGRAS[o.produto];
  let motivo = o.motivo ?? null;
  const forte = !!regra.forte && o.preco != null && o.preco >= regra.piso && o.preco <= regra.forte.ate &&
    regra.forte.casa(norm(`${o.titulo ?? ""}\n${o.texto ?? ""}`));
  if (!motivo && o.preco != null && o.preco < regra.piso) motivo = "abaixo do piso (acessorio ou parcela)";
  if (!motivo && o.preco != null && !regra.avisa(o.preco) && !forte) motivo = "acima do teto";
  if (!motivo && o.preco == null && !(regra.semTeto && o.link)) motivo = "sem preco na mensagem";
  // O alerta forte fica gravado como especial (a aba do app reconhece o modelo pelo titulo).
  const especial = !motivo && o.preco != null && (regra.especial(o.preco) || forte);
  if (dry) return { dry: true, chave: o.chave, produto: o.produto, titulo: o.titulo, preco: o.preco, cupom: o.cupom, loja: o.loja, especial, forte: forte && !motivo, motivo };

  const { data: ins, error } = await supabase.from("ofertas_bf").upsert({
    chave: o.chave, fonte: o.fonte, produto: o.produto, titulo: o.titulo, preco: o.preco, especial, cupom: o.cupom,
    loja: o.loja, link: o.link, origem: o.origem, texto: o.texto, motivo,
  }, { onConflict: "chave", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`grava oferta: ${error.message}`);
  if (!ins?.length) return null; // ja visto
  const id = ins[0].id as number;

  // Mesmo produto e preco que outro grupo (ou o Pelando) ja trouxe: nao repete.
  if (!motivo && o.preco != null) {
    const desde = new Date(Date.now() - JANELA_REPETIDA_H * 3600e3).toISOString();
    const { data: iguais, error: e2 } = await supabase.from("ofertas_bf").select("id")
      .eq("produto", o.produto).eq("preco", o.preco).is("motivo", null).gte("criado_em", desde).lt("id", id).limit(1);
    if (e2) throw new Error(`confere repetida: ${e2.message}`);
    if (iguais?.length) motivo = `repetida (igual a #${iguais[0].id})`;
  }
  if (motivo) {
    await supabase.from("ofertas_bf").update({ motivo }).eq("id", id);
    return { id, produto: o.produto, preco: o.preco, motivo };
  }

  const payload = payloadOferta(o, especial, id, forte);
  const enviados = await push(payload, ENVIO_OFERTA);
  await supabase.from("ofertas_bf").update(
    enviados > 0 ? { notificado: true } : { motivo: "nenhum aparelho recebeu o push" },
  ).eq("id", id);
  if (forte && enviados > 0) repetirForte(payload);
  return { id, produto: o.produto, preco: o.preco, especial, forte, avisou: enviados };
}

// Alerta forte: o iPhone nao deixa trocar o som do push, entao o que chama a
// atencao e repetir. Tag diferente em cada um pra cada push tocar de novo.
// Roda depois da resposta (waitUntil), sem segurar a NeoGo nem o PC.
function repetirForte(payload: Record<string, unknown>) {
  EdgeRuntime.waitUntil((async () => {
    let antes = 0;
    for (const s of REPETE_FORTE_S) {
      await new Promise((r) => setTimeout(r, (s - antes) * 1000));
      antes = s;
      try {
        await push({ ...payload, tag: `${payload.tag}-${s}s` }, ENVIO_OFERTA);
      } catch (e) {
        console.error("ofertas repete forte:", String(e).slice(0, 200));
      }
    }
  })());
}

// ---------- saude das fontes (usa o alerta normal do TNA Alertas) ----------

async function abrirAlerta(chave: string, titulo: string, mensagem: string) {
  const { data, error } = await supabase.rpc("alerta_abrir", {
    p_chave: chave, p_slug: null, p_tipo: "ofertas", p_nivel: "atencao", p_titulo: titulo, p_mensagem: mensagem,
    p_url: null, p_lembrete_horas: null, p_dados: {},
  });
  if (error) throw new Error(`alerta_abrir ${chave}: ${error.message}`);
  if (data) await push({ title: `🟡 ${titulo}`, body: mensagem, url: APP_URL }, ENVIO_ALERTA);
}

async function resolverAlerta(chave: string, corpo: string) {
  const { data, error } = await supabase.rpc("alerta_resolver", { p_chave: chave, p_avisar: true });
  if (error) throw new Error(`alerta_resolver ${chave}: ${error.message}`);
  if (data) await push({ title: `🟢 ${data}`, body: corpo, url: APP_URL }, ENVIO_ALERTA);
}

let whatsappMarcadoEm = 0;
async function marcarWhatsAppVivo() {
  if (Date.now() - whatsappMarcadoEm < 5 * 60e3) return;
  whatsappMarcadoEm = Date.now();
  await supabase.from("ofertas_bf_saude").upsert({ fonte: "whatsapp", ultimo_ok: new Date().toISOString(), atualizado_em: new Date().toISOString() });
}

async function conferirWhatsApp(dry: boolean) {
  const { data } = await supabase.from("ofertas_bf_saude").select("ultimo_ok").eq("fonte", "whatsapp").maybeSingle();
  if (!data?.ultimo_ok) return { whatsapp: "ainda nao chegou nenhuma mensagem" };
  const min = Math.round((Date.now() - Date.parse(data.ultimo_ok)) / 60e3);
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  if (dry) return { whatsapp_minutos_sem_mensagem: min };
  if (min > WHATSAPP_MUDO_MIN && hora >= 8 && hora < 23) {
    await abrirAlerta("ofertas:whatsapp", "Ofertas: WhatsApp parou de chegar",
      `Nenhuma mensagem da NeoGo (instância Douglas) há ${min} min. Confira se o número continua conectado no painel da NeoGo.`);
  } else if (min <= WHATSAPP_MUDO_MIN) {
    await resolverAlerta("ofertas:whatsapp", "As mensagens dos grupos voltaram a chegar.");
  }
  return { whatsapp_minutos_sem_mensagem: min };
}

async function pelandoSaude(erro: string | null, dry: boolean) {
  if (dry) return;
  const { data } = await supabase.from("ofertas_bf_saude").select("falhas_seguidas").eq("fonte", "pelando").maybeSingle();
  const falhas = erro ? (data?.falhas_seguidas ?? 0) + 1 : 0;
  const agora = new Date().toISOString();
  await supabase.from("ofertas_bf_saude").upsert({
    fonte: "pelando", falhas_seguidas: falhas, ultimo_erro: erro, atualizado_em: agora, ...(erro ? {} : { ultimo_ok: agora }),
  });
  if (erro && falhas >= PELANDO_FALHAS) {
    await abrirAlerta("ofertas:pelando", "Ofertas: Pelando não está sendo lido",
      `${falhas} tentativas seguidas falharam (${erro.slice(0, 120)}). Os grupos de WhatsApp continuam funcionando.`);
  } else if (!erro) {
    await resolverAlerta("ofertas:pelando", "A busca no Pelando voltou a funcionar.");
  }
}

// ---------- Pelando (lido no computador do Douglas) ----------

interface LeituraPelando {
  buscas: number;
  erros?: string[];
  // Formato enxuto montado pelo pelando.py a partir da pagina de busca.
  deals: Array<{
    id: string; title: string | null; price: number | null; status: string; kind: string;
    createdAt: string; slug: string; store: string | null; image: string | null;
  }>;
}

async function rodarPelando(corpo: LeituraPelando, dry: boolean) {
  const erros = (corpo.erros ?? []).map(String);
  const buscas = Number(corpo.buscas) || 0;
  await pelandoSaude(buscas > 0 && erros.length >= buscas ? erros[0] : null, dry);

  const deals = new Map(corpo.deals.filter((d) => d?.id).map((d) => [d.id, d]));
  const limite = Date.now() - JANELA_PELANDO_H * 3600e3;
  const casaram = [];
  for (const d of deals.values()) {
    if (d.status !== "active" || d.kind === "discussion") continue;
    if (!(Date.parse(d.createdAt) >= limite)) continue;
    const produto = classificar(norm(String(d.title ?? "")));
    if (!produto) continue;
    const r = await registrar({
      chave: `pelando:${d.id}`, fonte: "pelando", produto, titulo: d.title ?? null,
      preco: typeof d.price === "number" ? d.price : null, cupom: cupom(String(d.title ?? "")),
      loja: d.store ?? null, link: `https://www.pelando.com.br/d/${d.slug}`, origem: d.slug, texto: null,
      imagem: d.image ?? null,
    }, dry);
    if (r) casaram.push(r);
  }
  return { buscas, erros, ofertas_lidas: deals.size, novas: casaram };
}

// ---------- WhatsApp (NeoGo) ----------

async function receberWhatsApp(p: any, dry: boolean) {
  if (p?.body?.event) p = p.body; // quando chega embrulhado por algum repasse
  if (!p || p.event !== "Message") return { ignorado: "evento" };
  if (!dry) await marcarWhatsAppVivo();
  const info = p.data?.Info ?? {};
  const chat = String(info.Chat ?? "");
  const deGrupo = info.IsGroup === true || /@(g\.us|newsletter)$/.test(chat);
  if (!deGrupo || info.IsFromMe === true) return { ignorado: "nao e grupo" };
  const texto = textoDaMensagem(p.data?.Message);
  if (!texto || texto.length < 8) return { ignorado: "sem texto" };
  const t = norm(texto);
  const produto = classificar(t);
  if (!produto) return { ignorado: "sem produto" };

  const regra = REGRAS[produto];
  const todos = precos(texto);
  const validos = todos.filter((v) => v >= regra.piso);
  const preco = validos.length ? Math.min(...validos) : null;
  // Link de canal/grupo do WhatsApp nao e a loja: fica o primeiro que nao for.
  const link = [...texto.matchAll(/https?:\/\/[^\s*_~<>"]+/g)].map((m) => m[0].replace(/[).,;!]+$/, ""))
    .find((l) => !/^https?:\/\/([\w-]+\.)?(whatsapp\.com|wa\.me)\//i.test(l)) ?? null;
  const base = link ? link.replace(/[?#].*$/, "") : await resumo(t.slice(0, 160));
  return await registrar({
    chave: `wa:${produto}:${preco ?? "sem"}:${base}`, fonte: "whatsapp", produto,
    titulo: tituloDaMensagem(texto, regra), preco, cupom: cupom(texto), loja: lojaDoLink(link), link,
    origem: chat, texto: texto.slice(0, 1000),
    motivo: todos.length && !validos.length ? "so preco abaixo do piso (acessorio ou parcela)" : null,
  }, dry);
}

// ---------- entrada ----------

function json(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const chave = url.searchParams.get("k") ?? url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (await sha256(chave) !== HASH_CHAVE) return json(401, { erro: "chave invalida" });
  if (Date.now() > FIM) return json(200, { encerrado: "monitor de ofertas desligado depois de 30/11" });
  const dry = url.searchParams.get("dry") === "1";
  const tarefa = url.searchParams.get("tarefa");
  try {
    if (tarefa === "pelando") {
      const corpo = await req.json().catch(() => null);
      if (!corpo || !Array.isArray(corpo.deals)) return json(400, { erro: "esperava { buscas, erros, deals }" });
      return json(200, await rodarPelando(corpo, dry));
    }
    if (tarefa === "saude") return json(200, await conferirWhatsApp(dry));
    if (tarefa === "teste") {
      const especial = url.searchParams.get("especial") === "1";
      const forte = url.searchParams.get("forte") === "1";
      const exemplo: Oferta = forte
        ? {
          chave: "teste", fonte: "whatsapp", produto: "ar_24k",
          titulo: "Teste: Ar Condicionado Split Elgin Eco Inverter III Wi-Fi 24.000 BTUs Frio 220V", preco: 3199,
          cupom: null, loja: "Amazon", link: "https://www.pelando.com.br/busca/elgin%20eco%20inverter%20iii",
          origem: null, texto: null,
        }
        : {
          chave: "teste", fonte: "pelando", produto: "dualsense", titulo: "Teste: Controle DualSense Branco PS5",
          preco: 289.9, cupom: "TESTE10", loja: "Magalu", link: "https://www.pelando.com.br/busca/dualsense",
          origem: null, texto: null,
        };
      const payload = payloadOferta(exemplo, especial, `teste-${Date.now()}`, forte);
      const enviados = await push(payload, ENVIO_OFERTA);
      if (forte && enviados > 0) repetirForte(payload);
      return json(200, { enviados, repete_em_s: forte ? REPETE_FORTE_S : [] });
    }
    if (req.method === "POST") return json(200, await receberWhatsApp(await req.json().catch(() => null), dry) ?? { ja_visto: true });
    return json(400, { erro: "use POST (NeoGo), ?tarefa=pelando, ?tarefa=saude ou ?tarefa=teste" });
  } catch (e) {
    // So a mensagem do erro; nunca o conteudo da mensagem do WhatsApp.
    console.error("ofertas:", String(e).slice(0, 300));
    return json(500, { erro: String(e).slice(0, 300) });
  }
});

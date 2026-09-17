// Webhook da API oficial do WhatsApp (Cloud API). Um endereço por integração: ?i=<id>.
// GET  verificação do webhook pela Meta (hub.verify_token).
// POST mensagens e status, com assinatura X-Hub-Signature-256 conferida pelo App Secret.
// Mensagem com referral (clique em anúncio) vira origem CTWA com nomes buscados pelo ad_id.
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const ORDEM_STATUS: Record<string, number> = { enviando: 0, enviada: 1, entregue: 2, lida: 3, falhou: 4 };
const STATUS_META: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

const texto = (status: number, corpo = "ok") => new Response(corpo, { status });

async function assinaturaValida(segredo: string, corpo: string, cabecalho: string | null) {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = Array.from(assinatura, (b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice(7);
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

// Conteúdo legível de cada tipo de mensagem.
function conteudo(m: Record<string, any>) {
  const tipo = m.type || "desconhecido";
  const midia = m[tipo] && typeof m[tipo] === "object" ? m[tipo] : null;
  switch (tipo) {
    case "text": return { tipo: "texto", texto: m.text?.body || "", midia: null };
    case "image": case "video": case "document": case "audio": case "sticker":
      return {
        tipo: { image: "imagem", video: "video", document: "documento", audio: "audio", sticker: "figurinha" }[tipo as string],
        texto: midia?.caption || midia?.filename || null,
        midia: { id: midia?.id, mime_type: midia?.mime_type, filename: midia?.filename },
      };
    case "button": return { tipo: "texto", texto: m.button?.text || "", midia: null };
    case "interactive":
      return { tipo: "texto", texto: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "", midia: null };
    case "location":
      return { tipo: "localizacao", texto: m.location?.name || m.location?.address || null, midia: m.location };
    case "reaction": return { tipo: "reacao", texto: m.reaction?.emoji || null, midia: { message_id: m.reaction?.message_id } };
    default: return { tipo: "outro", texto: null, midia: { type: tipo } };
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const integracaoId = url.searchParams.get("i") || "";
  if (!/^[0-9a-f-]{36}$/.test(integracaoId)) return texto(404, "integração não encontrada");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: integ } = await admin.from("integracoes").select("*")
    .eq("id", integracaoId).eq("tipo", "whatsapp_oficial").maybeSingle();
  if (!integ) return texto(404, "integração não encontrada");
  const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
  const s = (seg || {}) as Record<string, string>;
  const cfg = integ.config as Record<string, string>;

  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const desafio = url.searchParams.get("hub.challenge") || "";
    if (modo === "subscribe" && s.verify_token && url.searchParams.get("hub.verify_token") === s.verify_token) {
      return texto(200, desafio);
    }
    return texto(403, "token de verificação inválido");
  }
  if (req.method !== "POST") return texto(405, "método não permitido");

  const corpo = await req.text();
  if (!(await assinaturaValida(s.app_secret, corpo, req.headers.get("X-Hub-Signature-256")))) {
    return texto(401, "assinatura inválida");
  }

  let payload: Record<string, any>;
  try { payload = JSON.parse(corpo); } catch { return texto(400, "json inválido"); }

  // Nomes do anúncio: cache por empresa, senão a API de Marketing com o mesmo token.
  async function nomesDoAnuncio(adId: string) {
    const { data: cache } = await admin.from("meta_anuncios_cache").select("*")
      .eq("empresa_id", integ.empresa_id).eq("ad_id", adId).maybeSingle();
    if (cache?.anuncio_nome) return cache;
    if (!s.token) return null;
    try {
      const r = await fetch(`${GRAPH}/${adId}?fields=name,adset{id,name},campaign{id,name}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const d = await r.json();
      if (!r.ok) { console.error("nomes do anúncio", adId, d?.error?.message); return null; }
      const linha = {
        empresa_id: integ.empresa_id, ad_id: adId, anuncio_nome: d.name || null,
        conjunto_id: d.adset?.id || null, conjunto_nome: d.adset?.name || null,
        campanha_id: d.campaign?.id || null, campanha_nome: d.campaign?.name || null,
        atualizado_em: new Date().toISOString(),
      };
      await admin.from("meta_anuncios_cache").upsert(linha, { onConflict: "empresa_id,ad_id" });
      return linha;
    } catch (e) {
      console.error("nomes do anúncio", adId, String(e));
      return null;
    }
  }

  for (const entrada of payload.entry || []) {
    for (const mudanca of entrada.changes || []) {
      if (mudanca.field !== "messages") continue;
      const v = mudanca.value || {};
      // Número de outra empresa no mesmo app: ignora, nunca grava no lugar errado.
      if (String(v.metadata?.phone_number_id || "") !== String(cfg.phone_number_id || "")) continue;

      const nomes: Record<string, string> = {};
      for (const c of v.contacts || []) nomes[c.wa_id] = c.profile?.name || "";

      for (const m of v.messages || []) {
        const c = conteudo(m);
        let origem: Record<string, unknown> | null = null;
        const ref = m.referral;
        if (ref?.source_id && ref?.source_type === "ad") {
          const n = await nomesDoAnuncio(String(ref.source_id));
          origem = {
            ad_id: String(ref.source_id), ctwa_clid: ref.ctwa_clid || null,
            campanha_id: n?.campanha_id || null, campanha_nome: n?.campanha_nome || null,
            conjunto_id: n?.conjunto_id || null, conjunto_nome: n?.conjunto_nome || null,
            anuncio_nome: n?.anuncio_nome || null,
            dados: { headline: ref.headline || null, source_url: ref.source_url || null, media_type: ref.media_type || null },
          };
        }
        const { error } = await admin.rpc("receber_mensagem_whatsapp", {
          p_empresa: integ.empresa_id, p_canal: "whatsapp_oficial", p_wa_id: String(m.from),
          p_nome: nomes[m.from] || null, p_wa_message_id: m.id, p_tipo: c.tipo, p_texto: c.texto,
          p_midia: c.midia, p_origem: origem,
          p_quando: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
        });
        if (error) console.error("receber_mensagem_whatsapp", m.id, error.message);
      }

      for (const st of v.statuses || []) {
        const novo = STATUS_META[st.status];
        if (!novo) continue;
        const { data: msg } = await admin.from("mensagens").select("id, status").eq("wa_message_id", st.id).maybeSingle();
        if (!msg || (ORDEM_STATUS[novo] ?? 0) <= (ORDEM_STATUS[msg.status] ?? 0)) continue;
        await admin.from("mensagens").update({
          status: novo,
          erro: novo === "falhou" ? (st.errors?.[0]?.error_data?.details || st.errors?.[0]?.title || "falhou") : null,
        }).eq("id", msg.id);
      }
    }
  }

  // Meta reenvia se não receber 200: responde rápido mesmo com erro pontual já registrado no log.
  return texto(200);
});

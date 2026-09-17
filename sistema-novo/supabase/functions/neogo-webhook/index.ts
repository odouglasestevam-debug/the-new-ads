// Webhook da NeoGo (API não oficial, motor whatsmeow). Endereço por integração:
//   /neogo-webhook?i=<integracao_id>&t=<token do endereço>
// O token do endereço é o que autentica (NeoGo só assina com HMAC se o slot tiver secret;
// quando a assinatura vem, ela também é conferida).
// Formato: { event: "Message" | "Receipt" | ..., data: {...whatsmeow}, instanceId, instanceName }
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const ORDEM_STATUS: Record<string, number> = { enviando: 0, enviada: 1, entregue: 2, lida: 3, falhou: 4 };

const texto = (status: number, corpo = "ok") => new Response(corpo, { status });

function iguais(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function hmac(segredo: string, corpo: string) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  return "sha256=" + Array.from(assinatura, (b) => b.toString(16).padStart(2, "0")).join("");
}

// JID -> número. Só aceita contato individual com telefone (LID não expõe o número).
function numeroDoJid(jid?: string) {
  const s = String(jid || "");
  return s.endsWith("@s.whatsapp.net") ? s.split("@")[0].split(":")[0] : null;
}

// Protobuf do whatsmeow em lowerCamelCase; mensagens temporárias e de visualização única vêm embrulhadas.
function conteudo(bruto: Record<string, any>) {
  let m = bruto || {};
  for (let i = 0; i < 3; i++) {
    const embrulho = m.ephemeralMessage || m.viewOnceMessage || m.viewOnceMessageV2 || m.documentWithCaptionMessage;
    if (!embrulho?.message) break;
    m = embrulho.message;
  }
  if (typeof m.conversation === "string") return { tipo: "texto", texto: m.conversation, midia: null };
  if (m.extendedTextMessage) return { tipo: "texto", texto: m.extendedTextMessage.text || "", midia: null };
  const midias: Array<[string, string]> = [["imageMessage", "imagem"], ["videoMessage", "video"], ["audioMessage", "audio"],
    ["documentMessage", "documento"], ["stickerMessage", "figurinha"]];
  for (const [campo, tipo] of midias) {
    if (m[campo]) {
      const x = m[campo];
      return { tipo, texto: x.caption || x.fileName || x.title || null, midia: { mimetype: x.mimetype || null, url: x.URL || x.url || null } };
    }
  }
  if (m.locationMessage) return { tipo: "localizacao", texto: m.locationMessage.name || m.locationMessage.address || null, midia: m.locationMessage };
  if (m.reactionMessage) return { tipo: "reacao", texto: m.reactionMessage.text || null, midia: { message_id: m.reactionMessage.key?.ID || m.reactionMessage.key?.id } };
  if (m.buttonsResponseMessage) return { tipo: "texto", texto: m.buttonsResponseMessage.selectedDisplayText || "", midia: null };
  if (m.listResponseMessage) return { tipo: "texto", texto: m.listResponseMessage.title || "", midia: null };
  if (m.protocolMessage || m.senderKeyDistributionMessage) return null; // controle interno, não é mensagem
  return { tipo: "outro", texto: null, midia: { chaves: Object.keys(m).slice(0, 5) } };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return texto(405, "método não permitido");
  const url = new URL(req.url);
  const integracaoId = url.searchParams.get("i") || "";
  const tokenUrl = url.searchParams.get("t") || "";
  if (!/^[0-9a-f-]{36}$/.test(integracaoId)) return texto(404, "integração não encontrada");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: integ } = await admin.from("integracoes").select("*")
    .eq("id", integracaoId).eq("tipo", "whatsapp_nao_oficial").maybeSingle();
  if (!integ) return texto(404, "integração não encontrada");
  const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
  const s = (seg || {}) as Record<string, string>;
  const cfg = integ.config as Record<string, string>;
  if (!iguais(tokenUrl, s.url_token || "")) return texto(401, "token inválido");

  const corpo = await req.text();
  const assinatura = req.headers.get("X-Hub-Signature-256");
  if (assinatura && s.webhook_secret && !iguais(assinatura, await hmac(s.webhook_secret, corpo))) {
    return texto(401, "assinatura inválida");
  }

  let payload: Record<string, any>;
  try { payload = JSON.parse(corpo); } catch { return texto(400, "json inválido"); }
  // n8n às vezes repassa o envelope dentro de body
  if (payload.body?.event) payload = payload.body;

  if (cfg.instance_id && payload.instanceId && String(payload.instanceId) !== String(cfg.instance_id)) {
    return texto(200, "instância de outra empresa ignorada");
  }
  const d = payload.data || {};

  if (payload.event === "Receipt") {
    const tipo = String(d.Type || "").toLowerCase();
    const novo = tipo === "read" || tipo === "read-self" ? "lida" : tipo === "" || tipo === "delivered" ? "entregue" : null;
    const ids: string[] = Array.isArray(d.MessageIDs) ? d.MessageIDs : [];
    if (novo && ids.length) {
      const { data: msgs } = await admin.from("mensagens").select("id, status")
        .eq("empresa_id", integ.empresa_id).in("wa_message_id", ids.slice(0, 50));
      for (const m of msgs || []) {
        if ((ORDEM_STATUS[novo] ?? 0) > (ORDEM_STATUS[m.status] ?? 0)) {
          await admin.from("mensagens").update({ status: novo }).eq("id", m.id);
        }
      }
    }
    return texto(200);
  }

  if (payload.event !== "Message") return texto(200, "evento ignorado");

  const info = d.Info || {};
  const chat = String(info.Chat || "");
  if (info.IsGroup || chat.endsWith("@g.us") || chat.endsWith("@broadcast") || chat.endsWith("@newsletter")) {
    return texto(200, "grupo ignorado");
  }
  const deMim = info.IsFromMe === true;
  const numero = numeroDoJid(chat) || numeroDoJid(deMim ? info.RecipientAlt : info.SenderAlt);
  if (!numero) {
    console.warn("neogo: contato sem telefone (LID)", info.ID);
    return texto(200, "contato sem telefone");
  }

  const c = conteudo(d.Message);
  if (!c) return texto(200, "mensagem de controle");
  const quando = info.Timestamp ? new Date(info.Timestamp).toISOString() : new Date().toISOString();

  // Eco do que o próprio CRM enviou: amarra o ID em vez de duplicar a mensagem.
  if (deMim && c.texto) {
    const cincoMin = new Date(Date.now() - 5 * 60000).toISOString();
    // mesmo número com e sem o 9 do celular brasileiro
    const variantes = [numero];
    if (/^55\d{2}9\d{8}$/.test(numero)) variantes.push(numero.slice(0, 4) + numero.slice(5));
    if (/^55\d{2}[6-9]\d{7}$/.test(numero)) variantes.push(numero.slice(0, 4) + "9" + numero.slice(4));
    const { data: conversasDoNumero } = await admin.from("conversas").select("id")
      .eq("empresa_id", integ.empresa_id).eq("canal", "whatsapp_nao_oficial").in("wa_id", variantes);
    const idsConversa = (conversasDoNumero || []).map((x) => x.id);
    if (idsConversa.length) {
      const { data: pendente } = await admin.from("mensagens").select("id")
        .in("conversa_id", idsConversa).eq("direcao", "saida").is("wa_message_id", null)
        .eq("texto", c.texto).gte("criado_em", cincoMin).limit(1).maybeSingle();
      if (pendente) {
        await admin.from("mensagens").update({ wa_message_id: info.ID, status: "enviada" }).eq("id", pendente.id);
        return texto(200, "eco do CRM");
      }
    }
  }

  let origem: Record<string, unknown> | null = null;
  const ads = d.meta_ads;
  if (!deMim && ads?.source_id && (ads.source_type === "ad" || ads.ad_type === "CTWA")) {
    const adId = String(ads.source_id);
    let nomes: Record<string, string | null> | null = null;
    const { data: cache } = await admin.from("meta_anuncios_cache").select("*")
      .eq("empresa_id", integ.empresa_id).eq("ad_id", adId).maybeSingle();
    if (cache?.anuncio_nome) nomes = cache;
    else {
      // token da integração Meta da empresa (ads_read), senão o do WhatsApp oficial
      const { data: tokens } = await admin.from("integracoes").select("id, tipo")
        .eq("empresa_id", integ.empresa_id).in("tipo", ["meta", "whatsapp_oficial"]);
      const ordem = (tokens || []).sort((a, b) => (a.tipo === "meta" ? -1 : 1) - (b.tipo === "meta" ? -1 : 1));
      for (const t of ordem) {
        const { data: sg } = await admin.rpc("integracao_ler_segredos", { p_integracao: t.id });
        const token = (sg as Record<string, string>)?.token;
        if (!token) continue;
        try {
          const r = await fetch(`${GRAPH}/${adId}?fields=name,adset{id,name},campaign{id,name}`, { headers: { Authorization: `Bearer ${token}` } });
          const j = await r.json();
          if (!r.ok) { console.error("nomes do anúncio", adId, j?.error?.message); continue; }
          nomes = {
            anuncio_nome: j.name || null, conjunto_id: j.adset?.id || null, conjunto_nome: j.adset?.name || null,
            campanha_id: j.campaign?.id || null, campanha_nome: j.campaign?.name || null,
          };
          await admin.from("meta_anuncios_cache").upsert({ empresa_id: integ.empresa_id, ad_id: adId, ...nomes, atualizado_em: new Date().toISOString() },
            { onConflict: "empresa_id,ad_id" });
          break;
        } catch (e) { console.error("nomes do anúncio", adId, String(e)); }
      }
    }
    origem = {
      ad_id: adId, ctwa_clid: ads.ctwa_clid || null,
      campanha_id: nomes?.campanha_id || null, campanha_nome: nomes?.campanha_nome || null,
      conjunto_id: nomes?.conjunto_id || null, conjunto_nome: nomes?.conjunto_nome || null,
      anuncio_nome: nomes?.anuncio_nome || null,
      dados: { headline: ads.title || null, source_url: ads.source_url || null, source_app: ads.source_app || null,
               media_type: ads.media_type || null, entry_point: ads.entry_point_conversion_source || null },
    };
  }

  const { error } = await admin.rpc("receber_mensagem_whatsapp", {
    p_empresa: integ.empresa_id, p_canal: "whatsapp_nao_oficial", p_wa_id: numero,
    p_nome: deMim ? null : info.PushName || null, p_wa_message_id: info.ID || null,
    p_tipo: c.tipo, p_texto: c.texto, p_midia: c.midia, p_origem: origem, p_quando: quando,
    p_direcao: deMim ? "saida" : "entrada",
  });
  if (error) {
    console.error("receber_mensagem_whatsapp", info.ID, error.message);
    // erro de dado (telefone inválido) não adianta reenviar
    return texto(error.message.includes("telefone_invalido") ? 200 : 500, "erro");
  }
  return texto(200);
});

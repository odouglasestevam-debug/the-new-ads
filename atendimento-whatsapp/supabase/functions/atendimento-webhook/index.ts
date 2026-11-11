// Recebe os eventos da NeoGo (motor whatsmeow) e só grava. Não existe nenhum envio de mensagem aqui.
// Endereço por conta: /atendimento-webhook?c=<slug>&t=<token>  (o token é o que autentica)
// Eventos usados: Message (entrada e saída, inclusive o que a loja manda pelo celular) e
// Receipt do tipo read-self (o celular da loja abriu a mensagem do cliente).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const LIMITE_CORPO = 2 * 1024 * 1024;

const resposta = (status: number, corpo = "ok") =>
  new Response(corpo, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

async function lerCorpo(req: Request): Promise<string> {
  if (Number(req.headers.get("content-length")) > LIMITE_CORPO) throw new Error("grande");
  const leitor = req.body?.getReader();
  if (!leitor) return "";
  const partes: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > LIMITE_CORPO) { await leitor.cancel(); throw new Error("grande"); }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { bytes.set(p, pos); pos += p.length; }
  return new TextDecoder().decode(bytes);
}

const usuario = (jid: string) => jid.split("@")[0].split(":")[0];

// Tira miniaturas em base64 e textos gigantes antes de guardar o bruto
function enxugar(v: unknown, prof = 0): unknown {
  if (prof > 12) return null;
  if (typeof v === "string") return v.length > 3000 ? v.slice(0, 200) + "…[cortado]" : v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => enxugar(x, prof + 1));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (/thumbnail|waveform|streamingSidecar/i.test(k)) continue;
      o[k] = enxugar(x, prof + 1);
    }
    return o;
  }
  return v;
}

type Conteudo = { tipo: string; texto: string | null; midia: Record<string, unknown> | null;
  segundos: number | null; voz: boolean | null; citada: string | null } | null;

// Protobuf do whatsmeow em JSON; mensagem temporária e de visualização única vêm embrulhadas
function conteudo(bruto: Record<string, any>): Conteudo {
  let m = bruto || {};
  for (let i = 0; i < 4; i++) {
    const e = m.ephemeralMessage || m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension ||
      m.documentWithCaptionMessage || m.editedMessage;
    if (!e?.message) break;
    m = e.message;
  }
  const ctx = (x: any) => x?.contextInfo?.stanzaID || x?.contextInfo?.stanzaId || null;
  const base = { midia: null, segundos: null, voz: null };
  if (typeof m.conversation === "string") return { ...base, tipo: "texto", texto: m.conversation, citada: null };
  if (m.extendedTextMessage) return { ...base, tipo: "texto", texto: m.extendedTextMessage.text || "", citada: ctx(m.extendedTextMessage) };
  if (m.audioMessage) {
    const x = m.audioMessage;
    return {
      tipo: "audio", texto: null, citada: ctx(x),
      segundos: Number.isFinite(Number(x.seconds)) ? Number(x.seconds) : null,
      voz: x.PTT ?? x.ptt ?? null,
      midia: {
        url: x.URL || x.url || null, direct_path: x.directPath || x.direct_path || null,
        media_key: x.mediaKey || x.media_key || null, mimetype: x.mimetype || null,
        tamanho: x.fileLength ?? x.file_length ?? null,
      },
    };
  }
  const midias: Array<[string, string]> = [["imageMessage", "imagem"], ["videoMessage", "video"],
    ["documentMessage", "documento"], ["stickerMessage", "figurinha"]];
  for (const [campo, tipo] of midias) {
    if (m[campo]) {
      const x = m[campo];
      return { ...base, tipo, texto: x.caption || x.fileName || x.title || null, citada: ctx(x),
        midia: { mimetype: x.mimetype || null }, segundos: tipo === "video" && x.seconds ? Number(x.seconds) : null };
    }
  }
  if (m.locationMessage || m.liveLocationMessage) {
    const x = m.locationMessage || m.liveLocationMessage;
    return { ...base, tipo: "localizacao", texto: x.name || x.address || null, citada: null };
  }
  if (m.contactMessage || m.contactsArrayMessage) return { ...base, tipo: "contato", texto: m.contactMessage?.displayName || null, citada: null };
  if (m.reactionMessage) return { ...base, tipo: "reacao", texto: m.reactionMessage.text || null, citada: m.reactionMessage.key?.ID || m.reactionMessage.key?.id || null };
  if (m.buttonsResponseMessage) return { ...base, tipo: "texto", texto: m.buttonsResponseMessage.selectedDisplayText || "", citada: null };
  if (m.listResponseMessage) return { ...base, tipo: "texto", texto: m.listResponseMessage.title || "", citada: null };
  if (m.templateButtonReplyMessage) return { ...base, tipo: "texto", texto: m.templateButtonReplyMessage.selectedDisplayText || "", citada: null };
  // edição, apagar, chave de grupo, sincronização: não é mensagem
  if (m.protocolMessage || m.senderKeyDistributionMessage || m.messageContextInfo && Object.keys(m).length === 1) return null;
  return { ...base, tipo: "outro", texto: null, citada: null, midia: { chaves: Object.keys(m).slice(0, 5) } };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, "método não permitido");
  const url = new URL(req.url);
  const slug = url.searchParams.get("c") || "";
  const token = url.searchParams.get("t") || "";
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || !/^[0-9a-f]{48}$/.test(token)) return resposta(401, "não autorizado");

  let corpo: string;
  try { corpo = await lerCorpo(req); } catch { return resposta(413, "corpo acima do limite"); }
  let payload: Record<string, any>;
  try { payload = JSON.parse(corpo); } catch { return resposta(400, "json inválido"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return resposta(400, "evento inválido");
  if (payload.body?.event) payload = payload.body; // quando passa por um repasse que embrulha em body

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const registrar = async (evento: Record<string, unknown>) => {
    // Campo vazio não vai: um null do JSON viraria "tem anúncio" / "tem mídia" no banco
    const p_evento = Object.fromEntries(Object.entries({
      instance_id: payload.instanceId ? String(payload.instanceId) : null,
      instance_nome: payload.instanceName ? String(payload.instanceName) : null,
      tipo_evento: String(payload.event || ""), ...evento,
    }).filter(([, v]) => v !== null && v !== undefined));
    const { data, error } = await admin.rpc("atendimento_registrar", { p_slug: slug, p_token: token, p_evento });
    if (error) { console.error("atendimento_registrar", error.message); return resposta(500, "erro ao gravar"); }
    if (data === "nao_autorizado") return resposta(401, "não autorizado");
    return resposta(200, String(data));
  };

  const d = payload.data || {};
  const evento = String(payload.event || "");

  if (evento === "Receipt") {
    const tipo = String(d.Type || "").toLowerCase();
    const ids = Array.isArray(d.MessageIDs) ? d.MessageIDs.map(String).slice(0, 500) : [];
    if (tipo !== "read-self" || !ids.length) return registrar({ evento: "outro" });
    const quando = d.Timestamp ? new Date(d.Timestamp) : new Date();
    return registrar({ evento: "leitura", ids, em: (Number.isFinite(quando.getTime()) ? quando : new Date()).toISOString() });
  }

  if (evento !== "Message") return registrar({ evento: "outro" });

  const info = d.Info || {};
  if (!info.ID) return resposta(400, "evento sem identificador");
  const chat = String(info.Chat || "");
  if (info.IsGroup || /@(g\.us|broadcast|newsletter)$/.test(chat) || chat.startsWith("status@")) return registrar({ evento: "outro" });

  const deLoja = info.IsFromMe === true;
  const alt = String((deLoja ? info.RecipientAlt : info.SenderAlt) || "");
  let telefone: string | null = null;
  let lid: string | null = null;
  if (chat.endsWith("@s.whatsapp.net")) telefone = usuario(chat);
  else if (chat.endsWith("@lid")) lid = usuario(chat);
  if (!telefone && alt.endsWith("@s.whatsapp.net")) telefone = usuario(alt);
  if (!lid && alt.endsWith("@lid")) lid = usuario(alt);
  if (!telefone && !lid) return registrar({ evento: "outro" });

  const c = conteudo(d.Message);
  if (!c) return registrar({ evento: "outro" });
  const data = info.Timestamp ? new Date(info.Timestamp) : new Date();
  if (!Number.isFinite(data.getTime())) return resposta(400, "data inválida");

  const ads = d.meta_ads;
  const anuncio = !deLoja && ads && (ads.source_id || ads.ctwa_clid || ads.entry_point_conversion_source)
    ? enxugar(ads) : null;

  return registrar({
    evento: "mensagem", wa_id: String(info.ID), chat, telefone, lid, de_loja: deLoja,
    enviada_em: data.toISOString(), tipo: c.tipo, texto: c.texto, audio_segundos: c.segundos, audio_voz: c.voz,
    midia: c.midia, anuncio, nome: deLoja ? null : info.PushName || null, responde_a: c.citada,
    bruto: enxugar(d),
  });
});

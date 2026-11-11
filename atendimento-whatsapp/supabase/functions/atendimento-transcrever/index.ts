// Transcreve os áudios recebidos e enviados pela loja (pg_cron a cada 5 min, header x-cron-secret).
// O áudio do WhatsApp vem cifrado no servidor da Meta: baixa pelo link da mensagem, decifra com a
// mediaKey (HKDF "WhatsApp Audio Keys" + AES-256-CBC, confere o HMAC) e manda para a OpenAI.
// Chave: segredo OPENAI_API_KEY das Edge Functions. Sem a chave, não faz nada e avisa a tela.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MODELO = Deno.env.get("ATENDIMENTO_MODELO_TRANSCRICAO") || "gpt-transcribe";
const POR_RODADA = 6;

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function base64(s: string): Uint8Array {
  const limpo = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(limpo + "=".repeat((4 - (limpo.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function iguais(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

async function baixar(midia: Record<string, any>): Promise<Uint8Array> {
  const links: string[] = [];
  if (typeof midia.url === "string" && midia.url.startsWith("https://")) links.push(midia.url);
  if (typeof midia.direct_path === "string" && midia.direct_path.startsWith("/")) links.push("https://mmg.whatsapp.net" + midia.direct_path);
  let ultimoErro = "sem link do arquivo";
  for (const link of links) {
    const host = new URL(link).hostname;
    if (!/(^|\.)whatsapp\.net$/.test(host)) { ultimoErro = "link fora do WhatsApp"; continue; }
    try {
      const r = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (!r.ok) { ultimoErro = `download ${r.status}`; continue; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length > 25 * 1024 * 1024) throw new Error("arquivo acima de 25 MB");
      return bytes;
    } catch (e) { ultimoErro = String((e as Error).message || e); }
  }
  throw new Error(ultimoErro);
}

async function decifrar(cifrado: Uint8Array, mediaKey: Uint8Array): Promise<Uint8Array> {
  if (mediaKey.length !== 32) throw new Error("mediaKey inválida");
  if (cifrado.length <= 10) throw new Error("arquivo vazio");
  const base = await crypto.subtle.importKey("raw", mediaKey, "HKDF", false, ["deriveBits"]);
  const exp = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("WhatsApp Audio Keys") }, base, 112 * 8));
  const iv = exp.slice(0, 16), chaveCifra = exp.slice(16, 48), chaveMac = exp.slice(48, 80);
  const corpo = cifrado.slice(0, -10), mac = cifrado.slice(-10);
  const kMac = await crypto.subtle.importKey("raw", chaveMac, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const conferido = new Uint8Array(await crypto.subtle.sign("HMAC", kMac, new Uint8Array([...iv, ...corpo]))).slice(0, 10);
  if (!iguais(conferido, mac)) throw new Error("arquivo não confere (HMAC)");
  const kAes = await crypto.subtle.importKey("raw", chaveCifra, { name: "AES-CBC" }, false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, kAes, corpo));
}

function extensao(mimetype: string) {
  const m = (mimetype || "").toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return ["ogg", "audio/ogg"];
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return ["m4a", "audio/mp4"];
  if (m.includes("mpeg") || m.includes("mp3")) return ["mp3", "audio/mpeg"];
  if (m.includes("webm")) return ["webm", "audio/webm"];
  if (m.includes("wav")) return ["wav", "audio/wav"];
  return ["ogg", "audio/ogg"];
}

async function transcrever(chave: string, audio: Uint8Array, mimetype: string): Promise<string> {
  const [ext, tipo] = extensao(mimetype);
  const form = new FormData();
  form.append("file", new File([audio], `audio.${ext}`, { type: tipo }));
  form.append("model", MODELO);
  form.append("response_format", "json");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(60000),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${corpo?.error?.message || "erro"}`);
  return String(corpo.text ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "método não permitido" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: ok } = await admin.rpc("atendimento_cron_ok", { p_segredo: req.headers.get("x-cron-secret") || "" });
  if (ok !== true) return json(401, { erro: "não autorizado" });

  const chave = Deno.env.get("OPENAI_API_KEY") || "";
  if (!chave) {
    await admin.rpc("atendimento_aviso", { p_chave: "transcricao", p_valor: "Sem chave da OpenAI: áudios aguardando." });
    return json(200, { feito: 0, motivo: "sem_chave" });
  }

  const { data: pendentes, error } = await admin.rpc("atendimento_audios_pendentes", { p_limite: POR_RODADA });
  if (error) return json(500, { erro: error.message });

  let feitos = 0, falhas = 0;
  for (const p of pendentes || []) {
    try {
      const midia = p.midia || {};
      if (!midia.media_key) throw new Error("mensagem sem mediaKey");
      const cifrado = await baixar(midia);
      const audio = await decifrar(cifrado, base64(String(midia.media_key)));
      const texto = await transcrever(chave, audio, String(midia.mimetype || ""));
      await admin.rpc("atendimento_salvar_transcricao", { p_id: p.id, p_texto: texto || "(áudio sem fala)", p_erro: null });
      feitos++;
    } catch (e) {
      falhas++;
      await admin.rpc("atendimento_salvar_transcricao", { p_id: p.id, p_texto: null, p_erro: String((e as Error).message || e) });
    }
  }
  await admin.rpc("atendimento_aviso", { p_chave: "transcricao",
    p_valor: falhas ? `Última rodada: ${feitos} transcritos, ${falhas} com falha.` : `Última rodada: ${feitos} transcritos.` });
  return json(200, { feito: feitos, falhas });
});

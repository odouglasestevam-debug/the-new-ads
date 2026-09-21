// Endpoint público dos formulários colados nos sites dos clientes.
// GET  ?k=CHAVE  devolve a configuração pública do formulário.
// POST           recebe o envio, filtra robô, valida e grava pelo receber_lead_site.
// Sem login: a chave só identifica o formulário, quem decide o que grava é o servidor.
import { createClient } from "npm:@supabase/supabase-js@2";
import {jsonLimitado,headersSeguros,redirectSeguro} from '../_shared/security.ts';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const TEMPO_MINIMO_MS = 3000;    // humano não preenche em menos que isso
const CAMPOS_ORIGEM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_placement",
  "ad_id", "fbclid", "gclid", "pagina_url", "referrer"];

function json(status: number, corpo: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, ...headersSeguros(status), "Content-Type": "application/json", ...extra } });
}

// Configuração que o navegador pode ver. Nunca devolve empresa_id nem dados internos.
function configPublica(c: Record<string, unknown>) {
  return {
    titulo: c.titulo || "", subtitulo: c.subtitulo || "", botao: c.botao || "Enviar",
    sucesso: c.sucesso || "Recebemos seus dados. Em breve entraremos em contato.",
    redirect_url: redirectSeguro(c.redirect_url), email: c.email || "opcional",
    campos: Array.isArray(c.campos) ? c.campos : [], visual: c.visual || { modo: "auto" },
  };
}

function normalizarTelefone(bruto: string) {
  const d = String(bruto || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "+55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return "+" + d;
  return null;
}

async function hashIp(ip: string) {
  const chave=await crypto.subtle.importKey('raw',new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',chave,new TextEncoder().encode('crm-form:'+ip)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (req.method === "GET") {
    const chave = new URL(req.url).searchParams.get("k") || "";
    const { data } = await admin.from("formularios").select("config").eq("chave", chave).eq("ativo", true).maybeSingle();
    if (!data) return json(404, { erro: "Formulário não encontrado ou desativado." });
    return json(200, configPublica(data.config), { "Cache-Control": "public, max-age=60" });
  }

  if (req.method !== "POST") return json(405, { erro: "Método não permitido." });

  let b: Record<string, unknown>;
  try {
    b = await jsonLimitado(req);
  } catch (e) {
    return json((e as any).status||400, { erro: "Envio inválido ou acima do limite." });
  }

  const chave = texto(b.k, 64);
  const { data: form } = await admin.from("formularios").select("id, config").eq("chave", chave).eq("ativo", true).maybeSingle();
  if (!form) return json(404, { erro: "Formulário não encontrado ou desativado." });
  const config = configPublica(form.config);
  const sucesso = { ok: true, redirect: config.redirect_url };

  // Robô recebe sucesso falso, para não aprender o que barrou.
  if (texto(b.empresa_site, 200)) return json(200, sucesso);
  if (typeof b.tempo_ms !== "number" || b.tempo_ms < TEMPO_MINIMO_MS) return json(200, sucesso);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipHash = await hashIp(ip || "sem-ip");
  const {data:permitido,error:erroLimite}=await admin.rpc('crm_reservar_formulario',{p_formulario:form.id,p_ip_hash:ipHash});
  if(erroLimite||typeof permitido!=='boolean')return json(503,{erro:'Não foi possível verificar o envio. Tente novamente em instantes.'});
  if(!permitido)return json(429,{erro:'Muitos envios em sequência. Aguarde alguns minutos e tente novamente.'},{'Retry-After':'600'});

  const nome = texto(b.nome, 150);
  const telefone = normalizarTelefone(texto(b.telefone, 40));
  const email = texto(b.email, 200).toLowerCase();

  if (!nome) return json(422, { erro: "Informe seu nome.", campo: "nome" });
  if (!telefone) return json(422, { erro: "Informe um WhatsApp válido com DDD.", campo: "telefone" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(422, { erro: "E-mail inválido.", campo: "email" });
  if (config.email === "obrigatorio" && !email) return json(422, { erro: "Informe seu e-mail.", campo: "email" });

  // Só aceita resposta de campo que existe na configuração.
  const recebidas = (b.respostas && typeof b.respostas === "object") ? b.respostas as Record<string, unknown> : {};
  const respostas: Record<string, unknown> = {};
  for (const campo of config.campos as Array<Record<string, unknown>>) {
    const id = String(campo.id);
    const bruto = recebidas[id];
    let valor: string | string[] = Array.isArray(bruto)
      ? bruto.map((v) => texto(v, 300)).filter(Boolean).slice(0, 30)
      : texto(bruto, 2000);
    const opcoes = Array.isArray(campo.opcoes) ? campo.opcoes.map(String) : [];
    if (campo.tipo !== "texto" && opcoes.length) {
      valor = Array.isArray(valor) ? valor.filter((v) => opcoes.includes(v)) : (opcoes.includes(valor) ? valor : "");
    }
    const vazio = Array.isArray(valor) ? !valor.length : !valor;
    if (campo.obrigatorio && vazio) return json(422, { erro: `Responda: ${campo.rotulo}`, campo: id });
    if (!vazio) respostas[String(campo.rotulo || id)] = valor;
  }

  const origemBruta = (b.origem && typeof b.origem === "object") ? b.origem as Record<string, unknown> : {};
  const origem: Record<string, string> = {};
  for (const c of CAMPOS_ORIGEM) {
    const v = texto(origemBruta[c], 1000);
    if (v) origem[c] = v;
  }

  const { error } = await admin.rpc("receber_lead_site", {
    p_chave: chave, p_nome: nome, p_telefone: telefone, p_email: email || null, p_origem: origem, p_respostas: respostas,
  });
  if (error) {
    console.error("receber_lead_site", error.code);
    return json(500, { erro: "Não conseguimos enviar agora. Tente de novo em instantes." });
  }

  return json(200, sucesso);
});

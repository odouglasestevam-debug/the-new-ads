// Envio de texto pelo WhatsApp da empresa (API oficial ou NeoGo), usado pelo botão Enviar
// (whatsapp-enviar) e pelas mensagens agendadas (crm-agenda). Um código só para os dois: a janela
// de 24h da Meta, o formato do número e a idempotência pelo id valem igual para quem envia agora
// e para quem agendou.
import { neoGoBase } from "./security.ts";

export const GRAPH_ENVIO = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v21.0'}`;
export const JANELA_ENVIO_MS = 24 * 3600 * 1000;
export type Envio = { status: number; corpo: Record<string, unknown> };

// Mesma regra do banco para responder um lead: agência, dono, gestor ou o vendedor responsável.
export async function podeResponderLead(admin: any, userId: string, conversa: any): Promise<boolean> {
  const [{ data: agencia }, { data: membro }] = await Promise.all([
    admin.from("agencia_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("membros").select("papel").eq("empresa_id", conversa.empresa_id).eq("user_id", userId).maybeSingle(),
  ]);
  const responsavel = conversa.leads?.responsavel_id;
  return !!agencia || ["dono", "gestor"].includes(membro?.papel) ||
    (membro?.papel === "vendedor" && responsavel === userId);
}

// NeoGo: sem janela de 24h. Token da instância no cabeçalho apikey, POST /send/text.
async function enviarNeoGo(admin: any, conversa: any, mensagem: string, autorId: string, mensagemId: string, marca: Record<string, unknown> | null): Promise<Envio> {
  const { data: integ } = await admin.from("integracoes").select("*")
    .eq("empresa_id", conversa.empresa_id).eq("tipo", "whatsapp_nao_oficial").maybeSingle();
  if (!integ || integ.status !== "ativa") return { status: 400, corpo: { erro: "WhatsApp (NeoGo) não está ativo nesta empresa." } };
  const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
  const s = (seg || {}) as Record<string, string>;
  if (!s.instance_token) return { status: 400, corpo: { erro: "Falta o token da instância NeoGo." } };
  let base: string;
  try { base = neoGoBase(integ.config.base_url); } catch (e) { return { status: 400, corpo: { erro: (e as Error).message } }; }

  const { data: registro, error: erroInsert } = await admin.from("mensagens").insert({
    id: mensagemId,
    empresa_id: conversa.empresa_id, conversa_id: conversa.id, direcao: "saida", tipo: "texto",
    texto: mensagem, status: "enviando", autor_id: autorId, midia: marca,
  }).select().single();
  if (erroInsert) return erroInsert.code === '23505' ? repetirEnvioTexto(admin, conversa, mensagemId, autorId, mensagem) : { status: 503, corpo: { erro: 'Não foi possível registrar o envio. Tente novamente.' } };

  let r: Response;
  try {
    r = await fetch(`${base}/send/text`, {
      method: "POST",
      signal: AbortSignal.timeout(20000), redirect: 'error',
      headers: { apikey: s.instance_token, "Content-Type": "application/json" },
      body: JSON.stringify({ number: conversa.wa_id, text: mensagem }),
    });
  } catch (e) {
    await admin.from("mensagens").update({ erro: "O provedor ainda não confirmou o envio. Confira o histórico antes de reenviar." }).eq("id", registro.id).eq('status','enviando');
    return { status: 202, corpo: { pendente: true, mensagem: registro } };
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = d?.message || d?.error || `HTTP ${r.status}`;
    await admin.from("mensagens").update({ status: "falhou", erro: String(erro).slice(0, 500) }).eq("id", registro.id);
    return { status: 502, corpo: { erro: "A NeoGo recusou o envio: " + erro } };
  }

  // O ID pode vir em formatos diferentes conforme a versão; sem ele, o eco do webhook amarra depois.
  const waId = d?.id || d?.messageId || d?.message_id || d?.key?.id || d?.data?.id || d?.data?.Info?.ID || d?.data?.ID || null;
  if (!waId) {
    await admin.from('mensagens').update({erro:'A NeoGo respondeu sem identificador. Aguardando confirmação pelo webhook.'}).eq('id',registro.id).eq('status','enviando');
    return { status: 202, corpo: { pendente: true, mensagem: registro } };
  }
  const { data: enviada } = await admin.from("mensagens")
    .update({ status: "enviada", wa_message_id: waId }).eq("id", registro.id).eq('status','enviando').select().maybeSingle();
  await admin.from("conversas").update({ ultima_mensagem_em: registro.criado_em, ultima_previa: mensagem.slice(0, 140) })
    .eq("id", conversa.id).lte('ultima_mensagem_em',registro.criado_em);
  return { status: 200, corpo: { ok: true, mensagem: enviada } };
}

// Envia o texto pelo canal da conversa. Quem chama já conferiu permissão, empresa ativa e limite.
// `marca` vai no campo midia da mensagem (ex.: {agendada: true}) para a tela mostrar de onde veio.
export async function enviarTextoWhatsApp(admin: any, conversa: any, mensagem: string, autorId: string, mensagemId: string,
  responderId: string | null = null, marca: Record<string, unknown> | null = null): Promise<Envio> {
  if (conversa.canal === "whatsapp_nao_oficial") {
    if (responderId) return { status: 422, corpo: { erro: 'Resposta citada ainda não está disponível neste canal.' } };
    return await enviarNeoGo(admin, conversa, mensagem, autorId, mensagemId, marca);
  }
  if (conversa.canal !== "whatsapp_oficial") return { status: 400, corpo: { erro: "Canal ainda não suportado para envio." } };
  if (!conversa.ultima_entrada_em || Date.now() - new Date(conversa.ultima_entrada_em).getTime() > JANELA_ENVIO_MS) {
    return { status: 422, corpo: {
      erro: "Passaram 24h desde a última mensagem do lead. Pela regra da Meta, só dá para retomar com um modelo aprovado.",
      codigo: "fora_da_janela",
    } };
  }

  const { data: integ } = await admin.from("integracoes").select("*")
    .eq("empresa_id", conversa.empresa_id).eq("tipo", "whatsapp_oficial").maybeSingle();
  if (!integ || integ.status !== "ativa") return { status: 400, corpo: { erro: "WhatsApp oficial não está ativo nesta empresa." } };
  const { data: seg } = await admin.rpc("integracao_ler_segredos", { p_integracao: integ.id });
  const s = (seg || {}) as Record<string, string>;
  if (!s.token) return { status: 400, corpo: { erro: "Falta o token da integração." } };

  let referencia: {id:string;wa_message_id:string;texto:string} | null = null;
  if(responderId){
    const {data:original,error}=await admin.from('mensagens').select('id,wa_message_id,texto,tipo')
      .eq('id',responderId).eq('conversa_id',conversa.id).eq('empresa_id',conversa.empresa_id).maybeSingle();
    if(error)return {status:503,corpo:{erro:'Não foi possível consultar a mensagem citada.'}};
    if(!original?.wa_message_id)return {status:422,corpo:{erro:'A mensagem citada não está disponível nesta conversa.'}};
    referencia={id:original.id,wa_message_id:original.wa_message_id,texto:String(original.texto||original.tipo||'Mensagem').slice(0,4096)};
  }

  const { data: registro, error: erroInsert } = await admin.from("mensagens").insert({
    id: mensagemId,
    empresa_id: conversa.empresa_id, conversa_id: conversa.id, direcao: "saida", tipo: "texto",
    texto: mensagem, status: "enviando", autor_id: autorId,
    midia: referencia ? { resposta: referencia, ...(marca || {}) } : marca,
  }).select().single();
  if (erroInsert) return erroInsert.code === '23505' ? repetirEnvioTexto(admin,conversa,mensagemId,autorId,mensagem,responderId) : {status:503,corpo:{erro:'Não foi possível registrar o envio. Tente novamente.'}};

  // Celular brasileiro chega ora com o 9, ora sem. Se a Meta recusar o formato que veio
  // no webhook, tenta o outro antes de desistir e guarda o que funcionou.
  const alternativo = (n: string) =>
    /^55\d{2}9\d{8}$/.test(n) ? n.slice(0, 4) + n.slice(5)
    : /^55\d{2}[6-9]\d{7}$/.test(n) ? n.slice(0, 4) + "9" + n.slice(4)
    : null;
  const formatos = [conversa.wa_id, alternativo(conversa.wa_id)].filter(Boolean) as string[];
  const RECUSA_DE_NUMERO = ["131030", "131026", "131009"];

  let r!: Response, d: any = {}, usado = conversa.wa_id;
  try { for (const numero of formatos) {
    r = await fetch(`${GRAPH_ENVIO}/${(integ.config as Record<string, string>).phone_number_id}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(20000), redirect:'error',
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero, biz_opaque_callback_data:registro.id, ...(referencia?{context:{message_id:referencia.wa_message_id}}:{}), type: "text", text: { body: mensagem, preview_url: true } }),
    });
    d = await r.json().catch(() => ({}));
    usado = numero;
    if (r.ok && d?.messages?.[0]?.id) break;
    if (!RECUSA_DE_NUMERO.includes(String(d?.error?.code ?? ""))) break;
  } } catch {
    await admin.from('mensagens').update({erro:'A Meta ainda não confirmou o envio. Confira o histórico antes de reenviar.'}).eq('id',registro.id).eq('status','enviando');
    return {status:202,corpo:{pendente:true,mensagem:registro}};
  }
  if (r.ok && d?.messages?.[0]?.id && usado !== conversa.wa_id) {
    await admin.from("conversas").update({ wa_id: usado }).eq("id", conversa.id);
  }

  if (!r.ok || !d?.messages?.[0]?.id) {
    const bruto = d?.error?.error_user_msg || d?.error?.message || `HTTP ${r.status}`;
    // Erros que a pessoa consegue resolver sozinha, ditos em português.
    const CLAROS: Record<string, string> = {
      "131030": "Esse número não está na lista de permitidos do número de teste da Meta. Em WhatsApp, Configuração da API, abra o campo Para, clique em Gerenciar lista de números de telefone e cadastre o número. Isso some quando o número de produção entrar.",
      "131047": "Passaram 24h desde a última mensagem do cliente. Só dá para retomar com um modelo aprovado pela Meta.",
      "131026": "Esse número não tem WhatsApp, ou não consegue receber mensagem.",
      "190": "O token da integração expirou. Gere um novo token permanente e salve em Ajustes, Integrações.",
      "10": "Esse token não tem permissão para enviar por este número. Confira se o usuário do sistema tem acesso à conta do WhatsApp.",
    };
    const codigo = String(d?.error?.code ?? "");
    const erro = CLAROS[codigo] || bruto;
    await admin.from("mensagens").update({ status: "falhou", erro }).eq("id", registro.id);
    return { status: 502, corpo: { erro: "A Meta recusou o envio: " + erro } };
  }

  const { data: enviada } = await admin.from("mensagens")
    .update({ status: "enviada", wa_message_id: d.messages[0].id }).eq("id", registro.id).eq('status','enviando').select().maybeSingle();
  await admin.from("conversas").update({ ultima_mensagem_em: registro.criado_em, ultima_previa: mensagem.slice(0, 140) })
    .eq("id", conversa.id).lte('ultima_mensagem_em',registro.criado_em);
  return { status: 200, corpo: { ok: true, mensagem: enviada } };
}

// Mesmo id de novo (clique repetido, rede caiu, relógio tentou outra vez): devolve o que já aconteceu.
export async function repetirEnvioTexto(admin: any, conversa: any, id: string, autor: string, texto: string, responderId: string | null = null): Promise<Envio> {
  const { data: registro } = await admin.from('mensagens').select('*').eq('id',id)
    .eq('empresa_id',conversa.empresa_id).eq('conversa_id',conversa.id).eq('autor_id',autor).maybeSingle();
  if (!registro || registro.texto !== texto || (registro.midia?.resposta?.id || null)!==responderId) return {status:409,corpo:{erro:'Identificador já utilizado por outro envio.'}};
  if (registro.status === 'falhou') return {status:422,corpo:{erro:registro.erro || 'O provedor recusou o envio.',mensagem:registro}};
  return {status:registro.status === 'enviando' ? 202 : 200,corpo:{ok:registro.status !== 'enviando',pendente:registro.status === 'enviando',mensagem:registro}};
}

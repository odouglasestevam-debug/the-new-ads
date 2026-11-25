// Envia as mensagens agendadas (migration 0033). Só o relógio do banco chama, com o x-cron-secret
// do Vault; o relógio só chama quando há mensagem vencida. Publicar com verify_jwt false.
// Cada mensagem passa pelo mesmo envio do botão Enviar e pela mesma conferência de permissão,
// feita de novo agora: quem agendou pode ter perdido o lead desde então.
import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarTextoWhatsApp, repetirEnvioTexto, podeResponderLead } from "../_shared/enviar-texto.ts";

const respostaAgenda = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

type Agendada = { id: string; conversa_id: string; autor_id: string; texto: string };
type Resultado = { ok: boolean; erro?: string; tentar?: boolean };

async function enviarAgendada(admin: any, a: Agendada): Promise<Resultado> {
  const { data: conversa, error } = await admin.from("conversas").select("*, leads(responsavel_id)").eq("id", a.conversa_id).maybeSingle();
  if (error) return { ok: false, erro: "Não foi possível consultar a conversa.", tentar: true };
  if (!conversa) return { ok: false, erro: "A conversa não existe mais." };
  const { data: empresa } = await admin.from("empresas").select("ativo").eq("id", conversa.empresa_id).maybeSingle();
  if (!empresa?.ativo) return { ok: false, erro: "A empresa está inativa." };
  if (!(await podeResponderLead(admin, a.autor_id, conversa))) {
    return { ok: false, erro: "Quem agendou não responde mais este lead. Peça para o responsável atual agendar de novo." };
  }
  // tentativa anterior chegou a registrar a mensagem: devolve o que aconteceu, sem mandar de novo
  const { data: existente } = await admin.from("mensagens").select("id").eq("id", a.id).maybeSingle();
  const envio = existente
    ? await repetirEnvioTexto(admin, conversa, a.id, a.autor_id, a.texto)
    : await enviarTextoWhatsApp(admin, conversa, a.texto, a.autor_id, a.id, null, { agendada: true });
  // 202: o provedor recebeu e ainda não confirmou; a mensagem está no histórico, não se reenvia
  if (envio.status === 200 || envio.status === 202) return { ok: true };
  const erro = String(envio.corpo?.erro || `Erro ${envio.status}`).replace(/^A (Meta|NeoGo) recusou o envio: /, "");
  return { ok: false, erro, tentar: envio.status === 503 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return respostaAgenda(405, { erro: "Método não permitido." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: segredo } = await admin.rpc("crm_ler_segredo", { p_nome: "cron" });
  const recebido = req.headers.get("x-cron-secret") || "";
  if (!segredo || recebido !== segredo) return respostaAgenda(401, { erro: "Segredo inválido." });

  const { data: itens, error } = await admin.rpc("crm_agendadas_reservar", { p_limite: 25 });
  if (error) return respostaAgenda(500, { erro: "Não foi possível ler a fila de mensagens agendadas." });

  let enviadas = 0, falhas = 0;
  for (const a of (itens || []) as Agendada[]) {
    let resultado: Resultado;
    try { resultado = await enviarAgendada(admin, a); }
    catch { resultado = { ok: false, erro: "Falha inesperada no envio.", tentar: true }; }
    await admin.rpc("crm_agendada_concluida", {
      p_id: a.id, p_ok: resultado.ok, p_erro: resultado.erro || null, p_tentar: !!resultado.tentar,
    });
    if (resultado.ok) enviadas++; else falhas++;
  }
  return respostaAgenda(200, { ok: true, enviadas, falhas });
});

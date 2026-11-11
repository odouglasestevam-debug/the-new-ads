// Análise em lote (Batch API da OpenAI, metade do preço, resultado em até 24h).
// A IA responde só fatos sobre o que a LOJA fez em cada atendimento: chamou o cliente pra
// trazer a peça, ficou dia combinado, a conversa é de vaga de emprego. Não dá nota.
//   {"acao":"enviar"}  pg_cron 04:00 de Brasília: monta e envia o lote do que mudou
//   {"acao":"coletar"} pg_cron a cada 30 min enquanto houver lote aberto: busca e grava o resultado
//   {"acao":"previa"}  devolve as 2 primeiras linhas do lote, sem enviar (para conferir)
// Header x-cron-secret obrigatório. Chave: segredo OPENAI_API_KEY das Edge Functions.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MODELO = Deno.env.get("ATENDIMENTO_MODELO_IA") || "gpt-6.1-terra";
const API = "https://api.openai.com/v1";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const INSTRUCOES = `Você lê conversas de WhatsApp entre uma loja de consertos (sapataria, costura, bordado, reforma de bolsas e roupas) e um cliente. Responda apenas fatos sobre o que a LOJA fez. Não avalie a qualidade do atendimento.

chamou_para_loja: true se a LOJA convidou ou orientou o cliente a trazer a peça ou vir até a loja. Exemplos que contam: "pode trazer", "consegue passar aqui?", "traz pra gente avaliar", "a costureira está aqui até 17:30", "te espero amanhã", "a avaliação é gratuita, é só trazer". Não conta: a loja só informar endereço ou horário porque o cliente perguntou, sem convite; o cliente dizer por conta própria que vai passar.
trecho_convite: a frase da loja que mostra o convite, copiada da conversa, com até 200 caracteres. Vazio se chamou_para_loja for false.
marcou_dia: true se ficou combinado um dia ou horário concreto para o cliente ir à loja, proposto pela loja ou pelo cliente e confirmado pela loja. Exemplos: "sábado de manhã então", "amanhã às 15h te espero", cliente diz "vou na quinta" e a loja responde "combinado". Não conta: "quando puder", "qualquer dia", o cliente dizer o dia sem resposta da loja.
trecho_dia: a frase que mostra o dia combinado, copiada da conversa, com até 200 caracteres. Vazio se marcou_dia for false.
recrutamento: true se a conversa é sobre vaga de emprego, currículo ou entrevista, e não sobre serviço ou produto.

Mensagens marcadas como áudio transcrito valem como texto. Quando aparece "sem transcrição", "foto" ou "arquivo", você não sabe o conteúdo: não presuma.`;

const ESQUEMA = {
  type: "object",
  properties: {
    chamou_para_loja: { type: "boolean" },
    trecho_convite: { type: "string" },
    marcou_dia: { type: "boolean" },
    trecho_dia: { type: "string" },
    recrutamento: { type: "boolean" },
  },
  required: ["chamou_para_loja", "trecho_convite", "marcou_dia", "trecho_dia", "recrutamento"],
  additionalProperties: false,
};

function linha(i: number, loja: string, conversa: string) {
  return JSON.stringify({
    custom_id: String(i),
    method: "POST",
    url: "/v1/responses",
    body: {
      model: MODELO,
      reasoning: { effort: "low" },
      max_output_tokens: 3000,
      input: [
        { role: "system", content: INSTRUCOES },
        { role: "user", content: `Loja: ${loja}\n\nConversa:\n${conversa}` },
      ],
      text: { format: { type: "json_schema", name: "atendimento", schema: ESQUEMA, strict: true } },
    },
  });
}

function textoDaResposta(body: any): string | null {
  for (const item of body?.output || []) {
    if (item?.type !== "message") continue;
    for (const parte of item.content || []) if (parte?.type === "output_text" && typeof parte.text === "string") return parte.text;
  }
  return typeof body?.output_text === "string" ? body.output_text : null;
}

async function openai(chave: string, caminho: string, init: RequestInit = {}) {
  const r = await fetch(API + caminho, { ...init, headers: { Authorization: `Bearer ${chave}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(60000) });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    throw new Error(`OpenAI ${r.status} em ${caminho}: ${corpo?.error?.message || "erro"}`);
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "método não permitido" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: ok } = await admin.rpc("atendimento_cron_ok", { p_segredo: req.headers.get("x-cron-secret") || "" });
  if (ok !== true) return json(401, { erro: "não autorizado" });

  let acao = "enviar";
  try { acao = String((await req.json())?.acao || "enviar"); } catch { /* corpo vazio */ }
  const chave = Deno.env.get("OPENAI_API_KEY") || "";

  if (acao === "enviar" || acao === "previa") {
    const { data: itens, error } = await admin.rpc("atendimento_para_classificar", { p_limite: 1500 });
    if (error) return json(500, { erro: error.message });
    if (!itens?.length) {
      if (acao === "enviar") await admin.rpc("atendimento_aviso", { p_chave: "ia", p_valor: "Nada novo para analisar." });
      return json(200, { enviados: 0 });
    }
    const linhas = itens.map((it: any, i: number) => linha(i, it.loja, it.conversa || ""));
    if (acao === "previa") return json(200, { itens: itens.length, modelo: MODELO, exemplo: linhas.slice(0, 2).map((l: string) => JSON.parse(l)) });

    if (!chave) {
      await admin.rpc("atendimento_aviso", { p_chave: "ia", p_valor: `Sem chave da OpenAI: ${itens.length} atendimentos aguardando análise.` });
      return json(200, { enviados: 0, motivo: "sem_chave" });
    }
    try {
      const form = new FormData();
      form.append("purpose", "batch");
      form.append("file", new File([linhas.join("\n") + "\n"], "atendimento.jsonl", { type: "application/jsonl" }));
      const arquivo = await (await openai(chave, "/files", { method: "POST", body: form })).json();
      const lote = await (await openai(chave, "/batches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_file_id: arquivo.id, endpoint: "/v1/responses", completion_window: "24h",
          metadata: { origem: "monitor-atendimento" } }),
      })).json();
      const chaves = itens.map((it: any) => ({ k: it.chave, ate: it.lido_ate }));
      const { error: e2 } = await admin.rpc("atendimento_lote_criado", {
        p_openai_lote: lote.id, p_arquivo: arquivo.id, p_modelo: MODELO, p_chaves: chaves });
      if (e2) throw new Error("lote enviado mas não registrado: " + e2.message);
      await admin.rpc("atendimento_aviso", { p_chave: "ia", p_valor: `Lote com ${itens.length} atendimentos enviado.` });
      return json(200, { enviados: itens.length, lote: lote.id });
    } catch (e) {
      const msg = String((e as Error).message || e);
      await admin.rpc("atendimento_aviso", { p_chave: "ia", p_valor: "Falha ao enviar lote: " + msg });
      return json(502, { erro: msg });
    }
  }

  if (acao === "coletar") {
    if (!chave) return json(200, { coletados: 0, motivo: "sem_chave" });
    const { data: abertos, error } = await admin.rpc("atendimento_lotes_abertos");
    if (error) return json(500, { erro: error.message });
    const resumo: unknown[] = [];
    for (const l of abertos || []) {
      try {
        const lote = await (await openai(chave, `/batches/${encodeURIComponent(l.openai_lote)}`)).json();
        if (["validating", "in_progress", "finalizing", "cancelling"].includes(lote.status)) {
          await admin.rpc("atendimento_lote_atualizar", { p_id: l.id, p_status: "enviado", p_status_openai: lote.status, p_erro: null });
          resumo.push({ lote: l.openai_lote, status: lote.status });
          continue;
        }
        if (lote.status !== "completed" || !lote.output_file_id) {
          const msg = lote.errors?.data?.[0]?.message || `lote terminou como ${lote.status}`;
          await admin.rpc("atendimento_lote_atualizar", { p_id: l.id, p_status: "erro", p_status_openai: lote.status, p_erro: msg });
          resumo.push({ lote: l.openai_lote, status: lote.status, erro: msg });
          continue;
        }
        const texto = await (await openai(chave, `/files/${encodeURIComponent(lote.output_file_id)}/content`)).text();
        const resultados: Record<string, unknown>[] = [];
        let falhas = 0;
        for (const bruto of texto.split("\n")) {
          if (!bruto.trim()) continue;
          try {
            const r = JSON.parse(bruto);
            const body = r?.response?.body;
            if (r?.error || r?.response?.status_code !== 200 || !body) { falhas++; continue; }
            const saida = textoDaResposta(body);
            if (!saida) { falhas++; continue; }
            const v = JSON.parse(saida);
            resultados.push({ i: Number(r.custom_id), chamou_para_loja: !!v.chamou_para_loja, trecho_convite: String(v.trecho_convite || ""),
              marcou_dia: !!v.marcou_dia, trecho_dia: String(v.trecho_dia || ""), recrutamento: !!v.recrutamento });
          } catch { falhas++; }
        }
        const { data: gravados, error: e3 } = await admin.rpc("atendimento_salvar_classificacoes", { p_lote: l.id, p_itens: resultados });
        if (e3) throw new Error("falha ao gravar resultado: " + e3.message);
        const erroLote = falhas ? `${falhas} itens sem resposta válida (voltam no próximo lote)` : null;
        await admin.rpc("atendimento_lote_atualizar", { p_id: l.id, p_status: "concluido", p_status_openai: lote.status, p_erro: erroLote });
        await admin.rpc("atendimento_aviso", { p_chave: "ia", p_valor: `Lote concluído: ${gravados} atendimentos analisados${falhas ? `, ${falhas} falharam` : ""}.` });
        resumo.push({ lote: l.openai_lote, status: "concluido", gravados, falhas });
      } catch (e) {
        const msg = String((e as Error).message || e);
        await admin.rpc("atendimento_aviso", { p_chave: "ia", p_valor: "Falha ao buscar lote: " + msg });
        resumo.push({ lote: l.openai_lote, erro: msg });
      }
    }
    return json(200, { lotes: resumo });
  }

  return json(400, { erro: "ação desconhecida" });
});

// Análise em lote (Batch API da OpenAI, metade do preço, resultado em até 24h).
// A IA não dá nota nem opinião: responde o checklist de cada atendimento (sim ou não, com o trecho
// da conversa que comprova). A nota da unidade é calculada no banco a partir dessas respostas.
// Lê texto, áudio transcrito e foto descrita (atendimento-transcrever faz as duas coisas antes).
//   {"acao":"enviar"}  pg_cron 04:00 de Brasília: monta e envia o lote do que mudou
//   {"acao":"coletar"} pg_cron a cada 30 min enquanto houver lote aberto: busca e grava o resultado
//   {"acao":"previa"}  devolve as 2 primeiras linhas do lote, sem enviar (para conferir)
// Header x-cron-secret obrigatório. Chave: segredo OPENAI_API_KEY das Edge Functions.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MODELO = Deno.env.get("ATENDIMENTO_MODELO_IA") || "gpt-6.1-terra";
const API = "https://api.openai.com/v1";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const INSTRUCOES = `Você lê conversas de WhatsApp entre uma loja de consertos (sapataria, costura, bordado, estamparia, relojoaria, lavanderia, bolsas e malas) e um cliente. Você não dá nota nem opinião: responde só o que aconteceu, com o trecho da conversa que comprova. A nota é calculada depois, a partir das suas respostas.

Como ler a conversa:
- "Loja (mensagem automática)" é saudação automática do WhatsApp: não conta como nada que a loja fez.
- Áudio transcrito vale como texto. Em foto, "o que aparece" é a descrição da imagem. Quando aparece "sem transcrição", "sem descrição" ou "arquivo", você não sabe o conteúdo: não presuma.
- "Diferenciais da loja" e "O que está incluso nos serviços", quando aparecem, foram escritos pela dona. Use pra reconhecer quando a loja falou disso.
- Trechos: copie a frase da LOJA como está na conversa, com até 200 caracteres. Vazio quando a resposta for false.

tipo:
- "oportunidade": o cliente quer um serviço ou produto novo (pergunta se fazem, preço, prazo, manda foto da peça pra avaliar).
- "acompanhamento": serviço que já está com a loja ou já foi feito (se está pronto, retirada, pagamento, reclamação de serviço feito).
- "recrutamento": vaga de emprego, currículo, entrevista.
- "outro": fornecedor, parceiro, engano, propaganda, conversa pessoal.
Se a conversa tem oportunidade e acompanhamento, use "oportunidade".

servico: a peça ou serviço principal: "calcados", "bolsas_malas", "roupas_costura", "bordado_estampa", "relogios", "lavanderia", "produtos" (palmilha, cuidado com couro, itens à venda), "outro" ou "nao_identificado".

Os itens abaixo valem só para "oportunidade". Em outro tipo, responda false, trecho vazio, data vazia e relembrou "nao_se_aplica".

passou_preco: a loja informou valor ou faixa de valor, em texto, áudio ou imagem.
entendeu: a loja procurou entender o caso antes de passar preço ou encerrar: pediu foto, perguntou o problema, o tamanho, o material, a marca ou o uso. Não conta se o cliente explicou tudo sozinho e a loja só respondeu.
incluso: a loja explicou o que está incluído no serviço ou o que vai ser feito, além do preço (ex.: "troca do salto com acabamento e limpeza", "o ajuste inclui a prova", "sai com garantia"). Só preço, ou só prazo, não conta.
diferencial: a loja citou algum diferencial: os da lista da dona ou outro concreto (garantia, experiência, especialista em peças de grife, avaliação sem custo, rapidez, envio pelo correio). Simpatia e "fazemos sim" não contam.
chamou_para_loja: a loja convidou ou orientou o cliente a trazer a peça ou vir até a loja. Exemplos: "pode trazer", "consegue passar aqui?", "traz pra gente avaliar", "te espero amanhã". Não conta: só informar endereço ou horário porque o cliente perguntou; o cliente dizer por conta própria que vai passar.
marcou_dia: compromisso firmado: ficou combinado um dia ou horário concreto pro cliente vir, proposto por um lado e confirmado pelo outro. Exemplos: "sábado de manhã então", cliente diz "vou na quinta" e a loja responde "combinado, te espero". Não conta "quando puder", "qualquer dia", ou o cliente dizer o dia sem resposta da loja.
trecho_dia: a frase que mostra o compromisso (pode ser do cliente, se a loja confirmou).
data_compromisso: a data combinada no formato AAAA-MM-DD, calculada pela data das mensagens (ex.: "amanhã" numa mensagem de 03/11/2026 é 2026-11-04). Vazio se não houve compromisso ou se não dá pra saber a data.
relembrou: só quando houve compromisso.
- "sim": depois de combinar, a loja voltou a falar com o cliente pra lembrar ou confirmar a visita (na véspera, no dia, ou depois, se o cliente não veio).
- "nao": a data combinada já passou (compare com a data de hoje) e a loja não lembrou nem confirmou.
- "aguardando": a data ainda não passou e a loja ainda não lembrou.
- "nao_se_aplica": não houve compromisso.
cobrou_status: só para "acompanhamento": true se o cliente teve que perguntar pelo andamento (se está pronto, quando fica pronto) sem a loja ter avisado antes. Em outro tipo, false.
recrutamento: true se tipo for "recrutamento".`;

const texto = { type: "string" };
const sim = { type: "boolean" };
const ESQUEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["oportunidade", "acompanhamento", "recrutamento", "outro"] },
    servico: { type: "string", enum: ["calcados", "bolsas_malas", "roupas_costura", "bordado_estampa", "relogios", "lavanderia", "produtos", "outro", "nao_identificado"] },
    passou_preco: sim,
    entendeu: sim, trecho_entendeu: texto,
    incluso: sim, trecho_incluso: texto,
    diferencial: sim, trecho_diferencial: texto,
    chamou_para_loja: sim, trecho_convite: texto,
    marcou_dia: sim, trecho_dia: texto, data_compromisso: texto,
    relembrou: { type: "string", enum: ["sim", "nao", "aguardando", "nao_se_aplica"] }, trecho_relembrou: texto,
    cobrou_status: sim,
    recrutamento: sim,
  },
  required: ["tipo", "servico", "passou_preco", "entendeu", "trecho_entendeu", "incluso", "trecho_incluso", "diferencial",
    "trecho_diferencial", "chamou_para_loja", "trecho_convite", "marcou_dia", "trecho_dia", "data_compromisso", "relembrou",
    "trecho_relembrou", "cobrou_status", "recrutamento"],
  additionalProperties: false,
};
const CAMPOS = ESQUEMA.required;

function linha(i: number, loja: string, contexto: string, conversa: string) {
  return JSON.stringify({
    custom_id: String(i),
    method: "POST",
    url: "/v1/responses",
    body: {
      model: MODELO,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      input: [
        { role: "system", content: INSTRUCOES },
        { role: "user", content: `Loja: ${loja}\n\n${contexto}\n\nConversa:\n${conversa}` },
      ],
      text: { format: { type: "json_schema", name: "checklist_atendimento", schema: ESQUEMA, strict: true } },
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
    const linhas = itens.map((it: any, i: number) => linha(i, it.loja, it.contexto || "", it.conversa || ""));
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
        const saidaLote = await (await openai(chave, `/files/${encodeURIComponent(lote.output_file_id)}/content`)).text();
        const resultados: Record<string, unknown>[] = [];
        let falhas = 0;
        for (const bruto of saidaLote.split("\n")) {
          if (!bruto.trim()) continue;
          try {
            const r = JSON.parse(bruto);
            const body = r?.response?.body;
            if (r?.error || r?.response?.status_code !== 200 || !body) { falhas++; continue; }
            const saida = textoDaResposta(body);
            if (!saida) { falhas++; continue; }
            const v = JSON.parse(saida);
            if (!v || typeof v.tipo !== "string") { falhas++; continue; }
            const item: Record<string, unknown> = { i: Number(r.custom_id) };
            for (const k of CAMPOS) item[k] = typeof v[k] === "boolean" ? v[k] : String(v[k] ?? "");
            resultados.push(item);
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

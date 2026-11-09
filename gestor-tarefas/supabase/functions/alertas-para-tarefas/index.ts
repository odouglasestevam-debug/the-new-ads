// Erro de n8n vira tarefa no gestor. Duas fontes:
//  - alertas de tracking abertos no TNA Alertas (lidos com a chave pública, a mesma da página /alertas);
//  - execuções com erro dos fluxos em FLUXOS, lidas direto na API do n8n.
// Chamada pelo pg_cron a cada 10 min, com header x-cron-secret igual ao segredo tarefas_cron do Vault.
// Corpo opcional {"dry":true,"janela_horas":168}: calcula tudo sem gravar, pra testar.
// A regra de criar, comentar e não repetir fica no banco (tarefa_de_alerta, n8n_erro_registrar).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const ALERTAS_URL = "https://iklynyncffneuvutvgxa.supabase.co";
const ALERTAS_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbHlueW5jZmZuZXV2dXR2Z3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMzA3NDUsImV4cCI6MjA5NzYwNjc0NX0.-vIteLhTDir-PeOrVzeGt7TdG05cYLMMJXmePauhdy4";
const N8N_API = "https://flow.neoai.systems/api/v1";
const N8N_FLUXO = "https://flow.neoai.systems/workflow";

const LISTA = {
  fabioli: "2a38b74d-f365-4f3c-b69f-3fd32b63d52a",
  confianca: "53fe5405-8f18-4a4b-8ce3-2fa75935e33b",
  entretec: "2fb047b0-d85e-47e4-82d5-8bd62173eec4",
  fatima: "f113f31c-c1d5-4084-9deb-0d2b7a23845b",
  arcan: "8b25f722-21c0-4b28-9707-1123b19cba81",
  agari: "ac5a7a8f-f9c0-4d11-a58a-4c60269dd6d8",
};
const TRACKING = "Analisar e resolver falha no tracking";

// Alertas de tracking: só cliente com tracking em uso. Sapatarias ficam de fora até serem
// reativadas (tarefa "Reativar o tracking das Sapatarias do Futuro").
const CLIENTES: Record<string, { lista: string; titulo: string }> = {
  "fabioli-ferreira": { lista: LISTA.fabioli, titulo: `${TRACKING} da Fabioli Ferreira` },
  "grupo-confianca": { lista: LISTA.confianca, titulo: `${TRACKING} do Grupo Confiança` },
};

// Fluxos do n8n que geram tarefa. Fluxo fora daqui é ignorado (sem cliente, teste, ex-cliente,
// Sapatarias), decisão do Douglas. Com `titulo`, é fluxo de tracking e divide a tarefa com o alerta.
const FLUXOS: Record<string, { nome: string; lista: string; titulo?: string }> = {
  BLGIpeKrURLUdRM7: { nome: "Trackeamento de Mensagem Fabioli", lista: LISTA.fabioli, titulo: `${TRACKING} da Fabioli Ferreira` },
  fpsrReLEOPnqDxY3: { nome: "Trackeamento de Mensagens Grupo Confiança", lista: LISTA.confianca, titulo: `${TRACKING} do Grupo Confiança` },
  gLdgMjK92ZaD45yt: { nome: "Trackeamento de Mensagem Fátima Esportes", lista: LISTA.fatima, titulo: `${TRACKING} da Fátima Esportes` },
  "8dFPTkkaDRpLn3j2": { nome: "Notificação Grupo Confiança vaga", lista: LISTA.confianca },
  seS4Rd2paW9G39DB: { nome: "Planilhamento Site + Linkbio + Notificação WhatsApp", lista: LISTA.confianca },
  Eifvs5JT0uN0mbNw: { nome: "Envio de Notificação Entretec", lista: LISTA.entretec },
  Lzs6wy0hbP4H6imo: { nome: "Entretec - Sincroniza MeEventos", lista: LISTA.entretec },
  pm6RuL79BNOpxftd: { nome: "Entretec - Leads do Site", lista: LISTA.entretec },
  fx7xf6tOwmZqGnRl: { nome: "Planilhamento de cadastros Arcan", lista: LISTA.arcan },
  "54k9gT2V1GWIyYhx": { nome: "Agari Drinks - Leads LP", lista: LISTA.agari },
};

const JANELA_HORAS = 6;
// Falha de rede passa sozinha na execução seguinte: só vira tarefa se repetir. Bug vira na primeira.
const REDE_RE = /\bDNS\b|EAI_AGAIN|ENOTFOUND|ECONN|ETIMEDOUT|timed out|timeout|connection .*(closed|aborted)|socket hang up|offline/i;
const REDE_MIN_FALHAS = 3;
const MAX_DETALHES = 10;

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function dataHoraBRT(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso)).replace(",", " às");
}

async function n8n(caminho: string) {
  const res = await fetch(N8N_API + caminho, {
    headers: { "X-N8N-API-KEY": Deno.env.get("N8N_API_KEY")! },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`n8n ${caminho.split("?")[0]} respondeu ${res.status}`);
  return res.json();
}

async function alertasDeTracking(admin: SupabaseClient, dry: boolean, erros: string[]) {
  const filtro = `tipo=eq.tracking&resolvido_em=is.null&slug=in.(${Object.keys(CLIENTES).join(",")})`;
  const res = await fetch(`${ALERTAS_URL}/rest/v1/alertas_problemas?select=id,chave,slug,mensagem,aberto_em&${filtro}`, {
    headers: { apikey: ALERTAS_ANON, Authorization: `Bearer ${ALERTAS_ANON}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`TNA Alertas respondeu ${res.status}`);
  const alertas = await res.json() as { id: string; chave: string; slug: string; mensagem: string; aberto_em: string }[];

  const resultado: unknown[] = [];
  for (const a of alertas) {
    if (dry) {
      resultado.push({ chave: a.chave, dry: true });
      continue;
    }
    const { data, error } = await admin.rpc("tarefa_de_alerta", {
      p_alerta_id: a.id,
      p_chave: a.chave,
      p_lista_id: CLIENTES[a.slug].lista,
      p_titulo: CLIENTES[a.slug].titulo,
      p_mensagem: a.mensagem,
      p_aberto_em: a.aberto_em,
    });
    if (error) erros.push(`${a.chave}: ${error.message}`);
    else resultado.push({ chave: a.chave, ...data });
  }
  return resultado;
}

type Execucao = { id: string; workflowId: string; mode: string; retryOf?: string; startedAt: string | null; stoppedAt: string | null; em: string };

async function execucoesComErro(janelaHoras: number) {
  const corte = Date.now() - janelaHoras * 3_600_000;
  const lista: Execucao[] = [];
  let cursor: string | null = null;
  do {
    const j: { data: Execucao[]; nextCursor?: string } = await n8n(`/executions?status=error&limit=100${cursor ? `&cursor=${cursor}` : ""}`);
    let acabou = false;
    for (const e of j.data) {
      // Execução que quebra antes de começar vem com startedAt nulo.
      const em = e.stoppedAt ?? e.startedAt ?? new Date().toISOString();
      if (new Date(em).getTime() < corte) {
        acabou = true;
        break;
      }
      if (e.mode !== "retry" && !e.retryOf) lista.push({ ...e, em });
    }
    cursor = acabou ? null : j.nextCursor ?? null;
  } while (cursor);
  return lista;
}

async function errosDosFluxos(admin: SupabaseClient, dry: boolean, janelaHoras: number, erros: string[]) {
  const { data: marcas, error } = await admin.rpc("n8n_erro_marcas");
  if (error) throw new Error(`n8n_erro_marcas: ${error.message}`);

  const porFluxo = new Map<string, Execucao[]>();
  for (const e of await execucoesComErro(janelaHoras)) {
    if (!FLUXOS[e.workflowId]) continue;
    porFluxo.set(e.workflowId, [...(porFluxo.get(e.workflowId) ?? []), e]);
  }

  const umaHoraAtras = Date.now() - 3_600_000;
  const resultado: unknown[] = [];
  for (const [workflowId, execucoes] of porFluxo) {
    const fluxo = FLUXOS[workflowId];
    const marca = dry ? 0 : Number(marcas?.[workflowId] ?? 0);
    const novas = execucoes.filter((e) => Number(e.id) > marca);
    if (!novas.length) continue;

    try {
      const detalhes = await Promise.all(novas.slice(0, MAX_DETALHES).map(async (e) => {
        const d = await n8n(`/executions/${e.id}?includeData=true`);
        const falha = d?.data?.resultData?.error ?? {};
        return {
          ...e,
          mensagem: String(falha.message ?? falha.description ?? "sem mensagem de erro"),
          no: String(d?.data?.resultData?.lastNodeExecuted ?? "desconhecido"),
        };
      }));
      const bug = detalhes.find((d) => !REDE_RE.test(d.mensagem));
      const naUltimaHora = execucoes.filter((e) => new Date(e.em).getTime() >= umaHoraAtras).length;
      const virarTarefa = !!bug || naUltimaHora >= REDE_MIN_FALHAS;
      const principal = bug ?? detalhes[0];
      const texto = `Fluxo "${fluxo.nome}" falhou no nó "${principal.no}" em ${dataHoraBRT(principal.em)}: ${principal.mensagem.slice(0, 300)}. ` +
        `${novas.length} erro(s) novo(s)${bug ? "" : `, falha de rede repetida (${naUltimaHora} em 1 hora)`}. ` +
        `Execução: ${N8N_FLUXO}/${workflowId}/executions/${principal.id}`;
      const titulo = fluxo.titulo ?? `Analisar e resolver falha no n8n: ${fluxo.nome}`;

      if (dry) {
        resultado.push({ fluxo: fluxo.nome, novas: novas.length, bug: !!bug, na_ultima_hora: naUltimaHora, virar_tarefa: virarTarefa, titulo, texto });
        continue;
      }
      const { data, error: erroRpc } = await admin.rpc("n8n_erro_registrar", {
        p_workflow_id: workflowId,
        p_ultima_exec: Math.max(...novas.map((e) => Number(e.id))),
        p_virar_tarefa: virarTarefa,
        p_lista_id: fluxo.lista,
        p_titulo: titulo,
        p_prefixo: fluxo.titulo ? TRACKING : titulo,
        p_texto: texto,
      });
      if (erroRpc) erros.push(`${fluxo.nome}: ${erroRpc.message}`);
      else resultado.push({ fluxo: fluxo.nome, novas: novas.length, ...data });
    } catch (e) {
      // Não avança a marca: tenta de novo na próxima rodada.
      erros.push(`${fluxo.nome}: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    }
  }
  return resultado;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: segredo } = await admin.rpc("tarefas_ler_segredo", { p_nome: "cron" });
  const cron = req.headers.get("x-cron-secret");
  if (!cron || cron !== segredo) return resposta(401, { erro: "Segredo inválido." });

  const corpo = await req.json().catch(() => ({}));
  const dry = corpo?.dry === true;
  const janelaHoras = Number(corpo?.janela_horas) > 0 ? Number(corpo.janela_horas) : JANELA_HORAS;

  const erros: string[] = [];
  let alertas: unknown[] = [];
  let fluxos: unknown[] = [];
  try {
    alertas = await alertasDeTracking(admin, dry, erros);
  } catch (e) {
    erros.push(`alertas: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
  try {
    fluxos = await errosDosFluxos(admin, dry, janelaHoras, erros);
  } catch (e) {
    erros.push(`fluxos: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
  return resposta(erros.length ? 500 : 200, { ok: !erros.length, dry, alertas, fluxos, erros });
});

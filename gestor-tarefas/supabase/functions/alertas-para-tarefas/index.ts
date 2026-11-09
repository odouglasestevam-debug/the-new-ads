// Erro de n8n apontado pelo TNA Alertas vira tarefa no gestor.
// Chamada pelo pg_cron a cada 10 min, com header x-cron-secret igual ao segredo tarefas_cron do Vault.
// Lê os alertas de tracking abertos no projeto do TNA Alertas com a chave pública (a mesma da página
// /alertas). A regra de criar ou comentar, e de não repetir, fica em public.tarefa_de_alerta.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALERTAS_URL = "https://iklynyncffneuvutvgxa.supabase.co";
const ALERTAS_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbHlueW5jZmZuZXV2dXR2Z3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMzA3NDUsImV4cCI6MjA5NzYwNjc0NX0.-vIteLhTDir-PeOrVzeGt7TdG05cYLMMJXmePauhdy4";

// Só cliente com tracking em uso. Sapatarias ficam de fora até serem reativadas
// (tarefa "Reativar o tracking das Sapatarias do Futuro").
const CLIENTES: Record<string, { lista: string; titulo: string }> = {
  "fabioli-ferreira": {
    lista: "2a38b74d-f365-4f3c-b69f-3fd32b63d52a",
    titulo: "Analisar e resolver falha no tracking da Fabioli Ferreira",
  },
  "grupo-confianca": {
    lista: "53fe5405-8f18-4a4b-8ce3-2fa75935e33b",
    titulo: "Analisar e resolver falha no tracking do Grupo Confiança",
  },
};

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "Método não permitido." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: segredo } = await admin.rpc("tarefas_ler_segredo", { p_nome: "cron" });
  const cron = req.headers.get("x-cron-secret");
  if (!cron || cron !== segredo) return resposta(401, { erro: "Segredo inválido." });

  const filtro = `tipo=eq.tracking&resolvido_em=is.null&slug=in.(${Object.keys(CLIENTES).join(",")})`;
  const res = await fetch(`${ALERTAS_URL}/rest/v1/alertas_problemas?select=id,chave,slug,mensagem,aberto_em&${filtro}`, {
    headers: { apikey: ALERTAS_ANON, Authorization: `Bearer ${ALERTAS_ANON}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return resposta(502, { erro: `TNA Alertas respondeu ${res.status}.` });
  const alertas = await res.json() as { id: string; chave: string; slug: string; mensagem: string; aberto_em: string }[];

  const resultado: unknown[] = [];
  const erros: string[] = [];
  for (const a of alertas) {
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
  return resposta(erros.length ? 500 : 200, { ok: !erros.length, alertas: alertas.length, resultado, erros });
});

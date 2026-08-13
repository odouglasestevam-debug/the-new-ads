---
name: dashboard-cliente
description: >
  Cria (ou audita) o dashboard de tráfego pago de um cliente E/OU o fluxo n8n de tracking (CTWA)
  que grava no Supabase, no padrão vivo publicado em thenewads.com.br (Supabase + Cloudflare Pages
  + n8n). Use quando o usuário pedir "cria o dashboard do cliente X", "monta um dashboard pra
  [cliente]", "quero um dash igual o da Confiança/Fabioli", "confere se o dashboard do [cliente]
  tá certo", "atualiza o fluxo de tracking do [cliente] pro padrão novo", ou "cria o fluxo de
  n8n do [cliente] que grava no Supabase".
---

# Dashboard de cliente — Supabase + Cloudflare Pages

Skill de referência pra criar ou auditar o dashboard de tráfego pago de qualquer cliente, replicando o padrão que já está em produção (Grupo Confiança, Fabioli Ferreira, Fátima Esportes — os 3 são hoje idênticos estruturalmente). Nasceu da correção de bug de métricas em 2026-08-13.

## Antes de tudo: perguntar o que falta saber

Não assumir nada disso — perguntar direto ao Douglas se não estiver claro:

1. **Conta de anúncio da Meta** (`act_XXXXXXXXX`) do cliente.
2. **Já existe fluxo n8n de tracking (CTWA)** rodando pra esse cliente, ou vai ser CSV manual por enquanto?
3. **Tem CSV de vendas/leads pra importar** agora, ou começa vazio e alimenta depois? (ver regra geral em `_contexto/empresa.md`, seção "Padrão de relatórios e dashboards")
4. **Precisa de histórico retroativo** de métricas da Meta? Desde quando?
5. **Tem Instagram ID** pra puxar seguidores diários (opcional, mas se tiver, adiciona ao `clientes_meta_contas`)?

## Passo 1 — Conta no `clientes_meta_contas`

Projeto Supabase: `iklynyncffneuvutvgxa`.

```sql
SELECT * FROM clientes_meta_contas WHERE slug = '<slug-do-cliente>';
```

Se não existir, criar:

```sql
INSERT INTO clientes_meta_contas (slug, nome, conta_anuncio, pagina_facebook, instagram_id, moeda, tabela_destino, ativo, sincronizar_metricas)
VALUES ('<slug>', '<Nome Cliente>', 'act_XXXXXXXXX', NULL, '<instagram_id ou NULL>', 'BRL', '<slug>_meta', true, true);
```

Isso já pluga o cliente no cron da Edge Function `sync-meta-ads`, que sincroniza os **últimos 3 dias** automaticamente daqui pra frente. Não faz nada retroativo sozinho — ver Passo 3.

## Passo 2 — Criar as duas tabelas (schema fixo, não inventar campo novo)

**`<slug>_meta`** (métricas de anúncio, sem coluna `cliente` — é dedicada):

```sql
-- colunas: id_data (PK, text), data (date), source_id (text, = ad_id),
-- campanha, conjunto_anuncio, anuncio (text),
-- impressoes, alcance, cliques_no_link (bigint),
-- investimento, ctr, cpc, cpm, frequencia (numeric),
-- id_conta (text), url_anuncio (text),
-- numero_vis_25/50/75/95_videoview, video_view (bigint),
-- post_engajament, mensagens_iniciadas, lead, resultados (bigint/numeric),
-- reacoes, comentarios, compartilhamentos, salvamentos, compras_capi (bigint),
-- custo_por_resultado (numeric), optimization_goal (text)
```
Ver `information_schema.columns` de `confianca_meta` pra copiar o schema exato (`list_tables` ou SQL direto) em vez de digitar de memória.

**`<slug>_tracking`** (leads/CRM, com `cliente`):

```sql
CREATE TABLE public.<slug>_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente text NOT NULL DEFAULT '<slug>',
  nome text, email text, telefone text NOT NULL,
  origem text, data date, id_data text, data_fechamento date,
  qualificacao text, etapa text,
  campaing_name text, adset_name text, ad_name text,
  posicionamento text, url_criativo text, ctwaclid text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  source_id text,
  UNIQUE (cliente, telefone)
);
```

**Sempre habilitar RLS + policy de leitura pública nas duas tabelas** — isso já causou um bug real (dashboard mudo, sem erro visível, porque `fatima_meta` tinha RLS ligado sem policy):

```sql
ALTER TABLE public.<slug>_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura publica <slug> meta" ON public.<slug>_meta FOR SELECT TO anon USING (true);

ALTER TABLE public.<slug>_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura publica <slug> tracking" ON public.<slug>_tracking FOR SELECT TO anon USING (true);
```

## Passo 3 — Popular dado

**`_meta` retroativo** (se pedido): replicar a lógica da Edge Function `sync-meta-ads` (`get_edge_function` no MCP do Supabase pra ler o código-fonte atual) chamando a Graph API direto:
- `GET https://graph.facebook.com/v21.0/{conta_anuncio}/insights` com `level=ad`, `time_increment=1`, `time_range={"since":...,"until":...}`, campos = `BASE_FIELDS` da function.
- Mapear `actions[]` pros campos canônicos (`lead`, `mensagens_iniciadas` = `onsite_conversion.messaging_conversation_started_7d`, etc — copiar a função `canonicalActions`/`REDUNDANT_PREFIXES` do código fonte, não reinventar).
- `INSERT ... ON CONFLICT (id_data) DO NOTHING` — nunca sobrescrever o que o cron já sincronizou.
- Token: `META_ACCESS_TOKEN` no `.env` da raiz do projeto (cuidado com aspas literais ao ler).
- OK pular `url_anuncio`/`optimization_goal` no backfill histórico (custam 1 chamada extra por anúncio) — só avisar o Douglas que ficou faltando, não é crítico pra métrica.

**`_tracking`**: se vier de CSV, deduplicar por telefone mantendo a ocorrência mais antiga (é o que o fluxo automático faria — só a primeira mensagem vira lead). Gerar `id_data` como `{fonte_unica}_{yyyy-MM-dd}` (usar `ctwaclid` truncado ou telefone como fonte se não tiver `source_id` real).

## Passo 4 — Clonar o dashboard

**Sempre clonar `the-new-ads-site/dashboard-confianca.html`** — é o template de referência (Performance / Funil comercial / Engajamento / Rastreamento). Nunca criar do zero, nunca editar `clientes/*/dashboard.html` — **esse caminho é morto, não vai pro ar** (causou confusão real em 2026-08-13, o Douglas viu "sem mudança" porque eu editava o arquivo errado).

```bash
python3 -c "
c = open('the-new-ads-site/dashboard-confianca.html', encoding='utf-8').read()
c = c.replace('confianca_meta', '<slug>_meta').replace('confianca_tracking', '<slug>_tracking')
c = c.replace(\"'grupo-confianca'\", \"'<slug>'\")
c = c.replace('Grupo Confiança — Proteção Veicular', '<Nome Cliente> — Dashboard de Tráfego')
open('the-new-ads-site/dashboard-<slug>.html', 'w', encoding='utf-8').write(c)
"
```

Depois, checar manualmente (`Grep` por `[Cc]onfiança|confianca` no arquivo novo) que não sobrou nenhuma referência esquecida — nome de segmento específico do Confiança (proteção veicular) pode vazar em texto solto se o clone for de outro cliente que não a Confiança.

**Conferir que o padrão de métrica está certo** (é o motivo de todo esse processo existir):
- KPI "Leads" no topo lê de `<slug>_tracking`, não de `<slug>_meta`.
- KPI "CPL" = investimento (Meta) ÷ leads (tracking).
- KPI "Resultados (Meta Ads)" separado e rotulado, não confundido com "Leads".
- Tabelas de nível "gerenciador de anúncios" (top anúncios por investimento) usam só Meta, sem mistura com tracking.
- Seção "Rastreamento" usa tracking com atribuição (`campaing_name`/`adset_name`/`ad_name`) pra cruzar com a Meta por campanha.

## Passo 3.5 — Fluxo n8n de tracking (CTWA), se o cliente ainda não tem

Nasceu de montar o fluxo do Fátima Esportes em 2026-08-13. Só é necessário se o Passo "Antes de tudo" #2 confirmar que ainda não existe automação — se já existe fluxo n8n rodando, pular pra auditoria (última seção deste passo).

### Achar se já existe (mesmo com nome errado)

Rodar `n8n_list_workflows` e procurar por `Trackeamento de Mensagem <Cliente>`. **Atenção**: pode existir com nome genérico tipo `Template CTWA + Meta CAPI (WhatsApp)` — isso não significa que é um template vazio, pode já estar em produção recebendo webhook de verdade (foi o caso do Fátima: nome genérico, mas `pixel`/`token`/`page_id`/`planilha_id` já preenchidos de verdade, execuções recentes bem-sucedidas). Antes de assumir "não existe, vou criar do zero":
1. Checar `n8n_executions` (`action: list`, filtrar por `workflowId`) do workflow suspeito — se tem execuções recentes com `status: success`, é produção viva.
2. Ler os nós `Extrai Dados e Config Pixel` (mode `filtered`) — se `pixel`/`token`/`page_id` são valores reais (não `COLE_AQUI_...`), é o fluxo do cliente.

Se realmente não existir nenhum candidato, perguntar ao Douglas onde estão as mensagens do WhatsApp desse cliente sendo capturadas hoje (qual instância NeoGo/Evolution) antes de criar um webhook novo do zero.

### Workflow de referência (copiar a lógica, não um workflow específico)

**`Trackeamento de Mensagens Grupo Confiança`** (id `fpsrReLEOPnqDxY3`) é o padrão-ouro: já foi corrigido pra não ter escrita em paralelo (bug real de perda de lead, ver `_contexto` se existir nota sobre isso) e tem `retryOnFail` nos nós de Supabase. Usar `n8n_get_workflow` com `mode: filtered` nos nós `Supabase Tracking - *` pra copiar o `jsonBody` exato — não reescrever de memória.

### Os 5 nós HTTP a inserir (sempre os mesmos 5, sempre em série depois do nó de Sheets equivalente)

| Nó novo | Depois de | Antes de | O que grava |
|---|---|---|---|
| `Supabase Tracking - Lead Direto` | `Grava Lead Direto` | `Hash Telefone (Lead Direto)` | registro completo (nome, telefone, origem, data, campanha/conjunto/anúncio, ctwaclid, id_data, source_id) |
| `Supabase Tracking - Site` | `Grava Lead Origem Site` | (leaf) | nome, telefone, origem=site, data |
| `Supabase Tracking - Link Bio` | `Grava Lead Origem Link Bio` | (leaf) | nome, telefone, origem=link_bio, data |
| `Supabase Tracking - Qualificado` | `Marca Como Qualificado` | `Tem CTWA Clid?` | telefone, qualificacao=Qualificado, etapa=Qualificação |
| `Supabase Tracking - Lead Ganho` | `Marca Como Lead Ganho` | próximo nó existente | telefone, etapa=Lead Ganho, data_fechamento |

Todos: `POST https://iklynyncffneuvutvgxa.supabase.co/rest/v1/<slug>_tracking`, query `on_conflict=cliente,telefone`, headers `apikey`/`Authorization: Bearer` com o JWT `service_role` do projeto (é o mesmo em todos os clientes, é service role do projeto inteiro, não por cliente), header `Prefer: resolution=merge-duplicates,return=representation`. Corpo sempre com `"cliente": "<slug>"` fixo. `onError: continueRegularOutput`, `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 2000`.

**Data do lead, não data de hoje**: se o workflow já tiver um nó `Formata Data ISO (Lead Direto)` (formatDate customFormat `yyyy-MM-dd`) ligado à cadeia de timestamp da mensagem, usar ele no campo `"data"` do node Lead Direto (`$('Formata Data ISO (Lead Direto)').item.json.formattedDate`) em vez de `$now.format(...)` — usar `$now` grava a data de processamento, não a data real do lead (bug identificado e corrigido na Confiança em 2026-08-13). Se esse nó não existir no workflow que você está clonando, considerar adicionar.

Usar `addNode` + `removeConnection`/`addConnection` via `n8n_update_partial_workflow`, sempre `validateOnly: true` primeiro pra pegar erro de expressão antes de aplicar de verdade.

### Depois de aplicar, sempre confirmar 3 coisas

1. `n8n_validate_workflow` — 0 erros.
2. **`n8n_get_workflow` com `mode: 'active'`** (não `full`/`draft`) — confirmar que a mudança está no grafo *publicado*. n8n tem modelo draft/publish; já aconteceu de aplicar a correção só no rascunho e o usuário ver "nada mudou" porque o publicado ficou intocado.
3. Checar se `Extrai Dados e Config Pixel` tem `frase_qualificacao`/`frase_compra` (e a marcação de link da bio, se o workflow clonado tiver essa branch) preenchidos de verdade, não como placeholder tipo `COLE_AQUI_A_FRASE_...`. Sem isso, os nós de Qualificado/Lead Ganho nunca disparam mesmo estando tecnicamente corretos — **avisar o Douglas e perguntar as frases reais**, não adivinhar.

### Bug sistêmico a checar em QUALQUER workflow de tracking existente

Antes de mexer em qualquer fluxo antigo (Fabioli, Nações Shopping, Anália Franco, Tietê), checar a estrutura (`mode: structure`) procurando conexões em paralelo saindo do mesmo nó pra Sheets E Supabase ao mesmo tempo (ex: `"Monta Dados do Lead Direto": [[Grava Lead Direto, Supabase Tracking - Lead Direto]]`). Isso é o mesmo bug de perda de lead corrigido na Confiança — **Fabioli e Nações Shopping ainda tinham esse bug em 2026-08-13**, não fixados ainda. Avisar o Douglas antes de corrigir, não corrigir sem avisar (workflows já em produção recebendo tráfego real).

## Passo 5 — Deploy

**Nunca publicar isolado** — cada deploy do Cloudflare Pages substitui o site inteiro.

```bash
rm -rf /tmp/deploy-tna && mkdir -p /tmp/deploy-tna
cp -r "the-new-ads-site/." /tmp/deploy-tna/ && rm -rf /tmp/deploy-tna/.wrangler
# (o arquivo novo já está dentro de the-new-ads-site/, então já vai junto)
cd "the new ads" && set -a && source .env && set +a && \
  npx wrangler pages deploy /tmp/deploy-tna --project-name="$CLOUDFLARE_PROJECT_NAME" --branch=main --commit-dirty=true
```

URL final: `https://thenewads.com.br/dashboard-<slug>`.

## Checklist final antes de dizer "pronto"

- [ ] Linha em `clientes_meta_contas` existe e `ativo=true`, `sincronizar_metricas=true`
- [ ] `<slug>_meta` e `<slug>_tracking` existem com RLS + policy de leitura pública
- [ ] Dado de tracking populado (CSV ou n8n) e de Meta (cron + backfill se pedido)
- [ ] Se montou/atualizou fluxo n8n: os 5 nós Supabase Tracking em série (não paralelo), `n8n_validate_workflow` sem erro, confirmado no `mode: active` (não só draft), `frase_qualificacao`/`frase_compra`/link-bio preenchidos de verdade (ou avisado ao Douglas que faltam)
- [ ] Dashboard é cópia de `dashboard-confianca.html`, com todas as referências ao cliente errado trocadas
- [ ] KPI "Leads" = tracking, "CPL" = investimento/leads tracking, "Resultados" separado
- [ ] Deploy feito com o site completo, não isolado
- [ ] Testar a URL final abrindo no navegador antes de reportar como pronto

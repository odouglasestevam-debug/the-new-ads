---
name: dashboard-cliente
description: >
  Cria (ou audita) o dashboard de tráfego pago de um cliente, no padrão vivo publicado em
  thenewads.com.br (Supabase + Cloudflare Pages). Use quando o usuário pedir "cria o dashboard
  do cliente X", "monta um dashboard pra [cliente]", "quero um dash igual o da Confiança/Fabioli",
  ou "confere se o dashboard do [cliente] tá certo".
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
- [ ] Dashboard é cópia de `dashboard-confianca.html`, com todas as referências ao cliente errado trocadas
- [ ] KPI "Leads" = tracking, "CPL" = investimento/leads tracking, "Resultados" separado
- [ ] Deploy feito com o site completo, não isolado
- [ ] Testar a URL final abrindo no navegador antes de reportar como pronto

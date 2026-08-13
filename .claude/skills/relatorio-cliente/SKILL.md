---
name: relatorio-cliente
description: Gera relatório de performance de mídia paga (Meta Ads + tracking de leads) pra um cliente, num período específico, como artifact HTML com a identidade visual da The New Ads. Inclui bloco de métricas gerais, leads reais (não os "resultados" brutos da Meta), gap Meta×CRM por campanha, gráficos de evolução diária com marcação de fim de semana, e top criativos com miniatura em alta resolução. Use quando o usuário pedir "relatório", "relatório de performance", "relatório pro cliente X", "monta um relatório de [período]", ou pedir pra mostrar/comparar métricas de campanha num formato visual pra enviar ao cliente.
---

# Relatório de cliente

Skill de referência pra montar relatórios de performance (Meta Ads) em formato de artifact HTML, no padrão visual da The New Ads. Nasceu do relatório da Dédalos Móveis (06/07 a 06/08/2026) — usar esse histórico de conversa como exemplo de execução completa se precisar relembrar detalhes.

## Fontes de dados

**Supabase** (projeto `iklynyncffneuvutvgxa`, mesmo projeto do `agenda-cilios`, cuidado pra não confundir):

- Tabela `{slug}_meta` (uma por cliente, ex: `dedalos_meta`, `fabioli_meta`) — métricas diárias por anúncio: `data`, `campanha`, `conjunto_anuncio`, `anuncio`, `impressoes`, `alcance`, `cliques_no_link`, `investimento`, `ctr`, `cpc`, `cpm`, `frequencia`, `reacoes`, `video_view`, `post_engajament`, `mensagens_iniciadas`, `lead`, `resultados`, `url_anuncio`, `source_id` (= ad_id da Meta), entre outras. Ver schema completo com `list_tables` se precisar.
- Tabela `{slug}_tracking` (uma por cliente, ex: `dedalos_tracking`, `fabioli_tracking`) — leads reais do CRM/traqueamento: `nome`, `telefone`, `origem`, `data`, `qualificacao`, `etapa`, `campaing_name`, `adset_name`, `ad_name`, `ctwaclid`. **Fonte de verdade pra contagem de leads e CPL** (ver "Padrão de métricas" abaixo). Se a tabela não existir pro cliente, é sinal de que ele não tem fluxo de tracking ainda — avisar o Douglas em vez de assumir que não tem lead nenhum.
- `url_anuncio` **já vem em alta resolução** desde que a Edge Function `sync-meta-ads` foi corrigida (2026-08-11): imagem original pra anúncio de imagem, miniatura de maior resolução disponível pra anúncio de vídeo. **Não precisa mais ir na Graph API pra pegar imagem de criativo** — só ler essa coluna direto.
- `instagram_followers_daily` — snapshot diário de seguidores orgânicos por cliente (`cliente`, `data`, `seguidores`), alimentado pela mesma Edge Function. Só tem histórico a partir de quando a automação começou a rodar (pode não cobrir períodos antigos).
- `clientes_meta_contas` — espelho de `contas.yaml`, útil pra resolver slug ↔ conta de anúncio.
- `meta_breakdowns` — breakdowns de idade/gênero/posicionamento, tabela única compartilhada entre clientes.

## Padrão de métricas (o mesmo do `dashboard-cliente`, não inventar outro)

Esse relatório usa exatamente o mesmo padrão de métricas do dashboard vivo (`the-new-ads-site/dashboard-confianca.html` é a referência de implementação) — os dois nasceram do mesmo problema (Meta superconta "resultado", `_meta` e `_tracking` medem coisas diferentes) e não podem divergir, senão o cliente vê números diferentes num lugar e noutro. Ver também `_contexto/empresa.md`, seção "Padrão de relatórios e dashboards".

- **"Leads" no relatório = `COUNT(*)` de `{slug}_tracking`** no período, nunca `lead`/`resultados` de `{slug}_meta` (isso é o resultado que a Meta atribui à campanha — sempre maior, porque conta mensagem iniciada que não virou lead de verdade).
- **CPL = investimento (Meta) ÷ leads (tracking).**
- Métricas de nível "gerenciador de anúncios" (investimento, impressões, CTR, CPC, ranking de anúncio por gasto) continuam só Meta — não misturar com tracking aqui.
- **Se o relatório for mostrar vendas/receita**, tem o mesmo gap que o dashboard já documenta: negócio local sempre perde venda que fecha fora do fluxo automático. Perguntar ao Douglas se tem CSV/base complementar de vendas antes de fechar esse número — não fazer contagem de venda só com `etapa = 'Lead Ganho'` do tracking sem confirmar.
- **Gap Meta × CRM por campanha/conjunto/anúncio** (opcional, incluir se o usuário pedir "por que os números não batem" ou "detalhe por campanha"): cruzar `mensagens_iniciadas` de `{slug}_meta` com `COUNT(*)` de `{slug}_tracking` filtrado por `origem = 'mensagem_direto'`, casando `campanha`/`conjunto_anuncio`/`anuncio` (Meta) com `campaing_name`/`adset_name`/`ad_name` (tracking). A lógica de referência já existe implementada em JS na seção "Rastreamento" do dashboard (`buildMetricasPorChave` em `dashboard-confianca.html`) — portar a mesma lógica pro relatório em vez de reinventar.

**meta-ads-ratos** (`.claude/skills/meta-ads-ratos/`): usar quando precisar de algo que o Supabase não tem (insights ad-hoc fora do período sincronizado, breakdowns não cobertos, ações que não viram coluna no Supabase). Ver `contas.yaml` pra resolver nome do cliente → `conta_anuncio`/`instagram_id`.

**Seguidores por anúncio (follow rate por criativo)**: a Meta **não tem objetivo nativo de otimização por seguidor**, então não existe essa métrica pronta em nenhuma API nem no Supabase. Se o usuário quiser essa quebra por criativo, ele vai trazer de uma ferramenta terceira (print de dashboard, planilha) — usar os números que ele fornecer, não inventar nem tentar aproximar via `resultados`/`post_engajament`.

## Quando usar Graph API mesmo assim

Só é necessário sair do Supabase pra Graph API quando o usuário pedir **link clicável pro criativo original** (permalink do post/reel), porque isso não fica armazenado em nenhuma tabela:

1. Achar `source_id` (ad_id) do anúncio no Supabase, desambiguando por maior `investimento` somado se o nome do anúncio se repetir em várias campanhas/ad sets.
2. `read.py ads --account act_XXX` (ou já ter o creative_id) pra achar o `creative.id`.
3. `read.py creative --id X --fields "object_type,image_url,video_id,effective_object_story_id"`.
4. Se `object_type == VIDEO`: `GET /{video_id}?fields=permalink_url` → prefixar com `https://www.facebook.com` (retorna `/reel/{id}/`).
5. Se for imagem/post: montar `https://www.facebook.com/{page_id}/posts/{post_id}` a partir de `effective_object_story_id` (formato `page_id_post_id`).

## Montando o artifact

1. Carregar as skills `artifact-design` e `dataviz` antes de escrever HTML (guidance de tokens de tema claro/escuro e de forma de gráfico).
2. Seguir `marca/design-guide.md` pra cores/tipografia/tom. Fundo preto `#0A0A0A` / grafite `#171717`, âmbar `#FF6A00` só como sinal pontual (5%), cantos vivos, sem sombra pesada. Logo inline via `marca/logo-SVG/tna-mono-branco.svg` (usar `style="fill:var(--text)"` pra herdar o tema).
3. Estrutura recomendada: header (marca + período) → hero com 1-2 KPIs principais em destaque (**Leads = tracking, não Meta** — ver "Padrão de métricas" acima) → métricas gerais **divididas em subgrupos temáticos pequenos** (ex: visão geral / leads e CPL / cliques e engajamento / perfil), nunca um grid único de 15+ células → gráficos de evolução diária → top criativos → tabela de campanhas (com gap Meta×CRM se fizer sentido pro período) → footer com fonte.
4. **Gráficos de evolução diária**: nunca dual-axis (métricas de escala diferente = gráficos separados). Marcar fins de semana com faixa de fundo sutil (`opacity ~.10`, cor `--muted`) e uma linha tracejada no início de cada semana, pra permitir leitura por dia da semana. Calcular o dia da semana de cada data com Python (`datetime.date(...).weekday()`) antes de montar o array, nunca assumir de cabeça.
5. **Top criativos**: pegar o top 4-5 por métrica de resultado relevante (a que o usuário indicar — segurança maior é usar o que ele já trouxe pronto, tipo print de seguidores por anúncio). Pra cada um:
   - Ler `url_anuncio` da linha com maior `investimento` pro `source_id` daquele nome de anúncio no período.
   - Baixar a imagem (`curl`/`Bash`), redimensionar com PIL pra ~480px de largura (`Image.LANCZOS`, quality ~80-82) — mantém nitidez com poucos KB.
   - **Embutir como base64 data URI** no HTML. Artifacts têm CSP estrita, imagem externa não carrega — nunca deixar `<img src="https://...">` apontando pra CDN da Meta (URL assinada expira de qualquer forma).
   - Se o usuário quiser link clicável pro original, envolver o card num `<a href="{permalink}" target="_blank">` (ver seção acima de como montar o permalink) — card inteiro clicável, com overlay "Ver original ↗" no hover.
6. Publicar com `Artifact` (favicon consistente entre redeploys do mesmo relatório, description curta).

## Coisas que já foram perguntadas e não precisam ser perguntadas de novo

- Regra de tom: nunca travessão em copy, mas números/labels de dashboard não são "copy final", então não se aplica a nomes de métrica.
- Se o usuário disser "ficou bom, aplica como padrão", isso significa consolidar na Edge Function/Supabase quando fizer sentido (como aconteceu com `url_anuncio`), não só no relatório pontual.

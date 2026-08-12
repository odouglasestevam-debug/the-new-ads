# /ads-ratos diagnostico

Gera um diagnóstico completo da conta de anúncios com Health Score,
KPIs, alertas automáticos e recomendações priorizadas.

## REGRA CRÍTICA

**NUNCA usar MCPs (fb-ads-mcp-server, adloop, etc) neste fluxo.**
Toda execução DEVE ser via scripts Python da skill meta-ads-ratos:
```bash
python3 ~/.claude/skills/meta-ads-ratos/scripts/<script>.py <comando>
```

## O que este comando faz

1. Puxa dados reais das APIs (Meta e/ou Google)
2. Calcula KPIs: gasto, leads, CPL, CTR, CPC, CPM, ROAS, frequência
3. Compara com período anterior (delta ↑↓)
4. Classifica cada métrica vs benchmarks BR do nicho
5. Gera Health Score (0-100) com nota (A-F)
6. Dispara alertas automáticos por severidade
7. Lista recomendações priorizadas por economia estimada

## Instruções para execução

### PASSO 0 — Identificar cliente e plataformas

**OBRIGATÓRIO: SEMPRE perguntar antes de rodar. Nunca assumir.**

1. Ler `contas.yaml` da skill ads-ratos para identificar o cliente
2. Se houver mais de um cliente, perguntar qual
3. **SEMPRE perguntar a plataforma**, mesmo que o cliente tenha várias:
   "Qual plataforma? **Meta Ads**, **Google Ads**, **GA4**, ou **todas**?"
   (rodar todas gasta mais tokens e demora mais — avisar isso)
4. Perguntar o período (padrão: últimos 7 dias)

### PASSO 1 — Coletar dados Meta Ads (se disponível)

Usar a skill `meta-ads-ratos` para puxar dados:

```bash
# Insights da conta (7 dias)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --date-preset last_7d

# Insights por campanha
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --date-preset last_7d --level campaign

# Insights do período anterior (7 dias antes)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --time-range '{"since":"DATA_INICIO_ANT","until":"DATA_FIM_ANT"}'

# Campanhas ativas
python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py campaigns \
  --account act_XXX --status ACTIVE
```

### PASSO 2 — Coletar dados Google Ads (se disponível)

Usar a skill `google-ads-ratos` para puxar dados:

```bash
# Insights da conta (últimos 7 dias)
python3 ~/.claude/skills/google-ads-ratos/scripts/insights.py account \
  --customer-id XXX --date-range LAST_7_DAYS

# Insights por campanha
python3 ~/.claude/skills/google-ads-ratos/scripts/insights.py campaign \
  --customer-id XXX --date-range LAST_7_DAYS

# Campanhas ativas
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py campaigns \
  --customer-id XXX

# Quality Scores
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py quality-scores \
  --customer-id XXX

# Search terms (últimos 7 dias)
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py search-terms \
  --customer-id XXX --date-range LAST_7_DAYS
```

### PASSO 2B — Coletar dados GA4 (se disponível)

Usar a skill `ga4-ratos` para complementar com dados pós-clique:

```bash
# Overview (sessões, bounce rate, conversões)
python3 ~/.claude/skills/ga4-ratos/scripts/reports.py overview \
  --property XXX --start-date 7daysAgo --end-date today

# Landing pages (bounce rate por página de destino)
python3 ~/.claude/skills/ga4-ratos/scripts/reports.py landing-pages \
  --property XXX --start-date 7daysAgo --end-date today

# Campanhas UTM (cruzar com dados de ads)
python3 ~/.claude/skills/ga4-ratos/scripts/reports.py campaigns \
  --property XXX --start-date 7daysAgo --end-date today
```

### PASSO 3 — Calcular KPIs

Para cada plataforma, calcular:

```
CPL         = gasto / conversões
CTR         = cliques / impressões × 100
CPC         = gasto / cliques
CPM         = gasto / impressões × 1000
ROAS        = receita / gasto (se disponível)
Taxa Conv   = conversões / cliques × 100
Frequência  = impressões / alcance (Meta)
```

### PASSO 4 — Classificar vs benchmarks

Ler `references/benchmarks-br.md` e classificar cada métrica:

1. Identificar o nicho do cliente (do contas.yaml ou perguntar)
2. Para cada métrica, comparar com a tabela do nicho
3. Atribuir classificação: EXCELENTE / BOM / ATENÇÃO / CRÍTICO
4. Considerar sazonalidade (verificar mês atual vs tabela)

### PASSO 5 — Calcular Health Score

Ler `references/quality-gates.md` seção "Health Score" e calcular:

Checks a executar (Meta Ads):

| # | Check | Severidade | Condição PASS |
|---|---|---|---|
| 1 | Campanhas com gasto | CRÍTICO | >= 1 campanha com gasto > 0 |
| 2 | Conversões existem | CRÍTICO | >= 1 conversão no período |
| 3 | CPL dentro da meta | ALTO | CPL <= 2x benchmark do nicho |
| 4 | CTR saudável | ALTO | CTR >= benchmark "ATENÇÃO" do nicho |
| 5 | Frequência controlada | ALTO | Frequência < 5.0 (prospecção) |
| 6 | CPC razoável | MÉDIO | CPC <= benchmark "ATENÇÃO" |
| 7 | CPM razoável | MÉDIO | CPM <= R$50 |
| 8 | Mais de 1 criativo ativo | MÉDIO | >= 3 criativos ativos por ad set |
| 9 | Orçamento suficiente | BAIXO | Budget diário >= 5x CPL |
| 10 | Gasto distribuído | BAIXO | Nenhuma campanha com > 80% do gasto |

Checks a executar (Google Ads):

| # | Check | Severidade | Condição PASS |
|---|---|---|---|
| 1 | Conversões configuradas | CRÍTICO | >= 1 ação de conversão ativa |
| 2 | Campanhas com gasto | CRÍTICO | >= 1 campanha com gasto > 0 |
| 3 | CPA dentro da meta | ALTO | CPA <= 2x benchmark do nicho |
| 4 | CTR saudável | ALTO | CTR >= 2.0% (Search) |
| 5 | Quality Score médio | ALTO | QS médio >= 5 |
| 6 | Search terms limpos | MÉDIO | < 20% do gasto em termos sem conversão |
| 7 | Impression Share | MÉDIO | >= 20% |
| 8 | Negativas existem | BAIXO | >= 1 lista de negativas |
| 9 | Extensões de anúncio | BAIXO | >= 2 tipos de extensão ativos |
| 10 | Orçamento suficiente | BAIXO | Budget diário >= 10x CPC médio |

### PASSO 6 — Gerar alertas automáticos

Aplicar regras do `quality-gates.md` e gerar alertas:

| Prioridade | Tipos de alerta |
|---|---|
| 🔴 URGENTE | 3x Kill Rule, zero conversões com gasto alto, campanha travada |
| 🟡 ATENÇÃO | CPL acima da meta, CTR abaixo do benchmark, frequência alta |
| 🔵 SUGESTÃO | Oportunidade de escalar, criativo pra testar, público pra expandir |

Cada alerta DEVE ter:
- Descrição específica com números ("CTR de 0.4% está 50% abaixo do benchmark de 0.8%")
- Impacto estimado ("economia potencial de R$X/mês")
- Ação recomendada ("trocar criativo do ad set X")

### PASSO 7 — Output final

Exibir no formato abaixo (texto formatado, não HTML):

```
═══════════════════════════════════════════════════
 DIAGNÓSTICO — {CLIENTE}
 Período: {DATA_INICIO} a {DATA_FIM}
═══════════════════════════════════════════════════

 HEALTH SCORE: {SCORE}/100 (Nota {NOTA})
 ████████░░ {SCORE}%

═══════════════════════════════════════════════════

 {PLATAFORMA} — HOJE ({DATA})
───────────────────────────────────────────────────
 Gasto       : R$ XX,XX
 Conversões  : X
 CPL         : R$ XX,XX  {CLASSIFICAÇÃO}
 CTR         : X,XX%     {CLASSIFICAÇÃO}
 CPC         : R$ XX,XX  {CLASSIFICAÇÃO}

 {PLATAFORMA} — ÚLTIMOS 7 DIAS
───────────────────────────────────────────────────
 Gasto       : R$ XXX,XX  (↑12% vs anterior)
 Conversões  : XX         (↓5% vs anterior)
 CPL         : R$ XX,XX   (↑18% vs anterior)  ⚠️
 CTR         : X,XX%      (↑3% vs anterior)
 CPC         : R$ X,XX
 CPM         : R$ XX,XX
 Frequência  : X.X

 CAMPANHAS ATIVAS ({N})
───────────────────────────────────────────────────
 1. {NOME}  |  R$ XX/dia  |  X conv  |  CPL R$XX  ⭐ MELHOR
 2. {NOME}  |  R$ XX/dia  |  X conv  |  CPL R$XX
 3. {NOME}  |  R$ XX/dia  |  0 conv  |  sem dados  ⚠️

 ALERTAS ({N})
───────────────────────────────────────────────────
 🔴 {ALERTA URGENTE — com números e ação}
 🟡 {ALERTA DE ATENÇÃO — com números e ação}
 🔵 {SUGESTÃO — com números e ação}

 RECOMENDAÇÕES (por economia estimada)
───────────────────────────────────────────────────
 1. {AÇÃO} → economia estimada: R$ XX/mês
 2. {AÇÃO} → economia estimada: R$ XX/mês
 3. {AÇÃO} → ganho estimado: +XX% conversões

═══════════════════════════════════════════════════
```

## Regras importantes

- Cada alerta DEVE ter número específico (não "CTR baixo", mas "CTR de 0.4%")
- Comparar SEMPRE com período anterior
- Se não houver meta do cliente definida, usar benchmark do nicho
- Considerar sazonalidade antes de gerar alerta de CPC/CPM alto
- Recomendações ordenadas por impacto financeiro (maior economia primeiro)
- Se uma plataforma não estiver configurada, informar e seguir com a outra

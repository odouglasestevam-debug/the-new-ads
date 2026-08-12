# /ads-ratos auditoria

Análise profunda da conta de anúncios — revisão mensal completa com Quality Gates,
Health Score ponderado por categoria, kill rules, criativos top/under performers,
desperdício identificado e plano de ação priorizado.

## REGRA CRÍTICA

**NUNCA usar MCPs (fb-ads-mcp-server, adloop, etc) neste fluxo.**
Toda execução DEVE ser via scripts Python da skill meta-ads-ratos:
```bash
python3 ~/.claude/skills/meta-ads-ratos/scripts/<script>.py <comando>
```

## O que este comando faz

1. Puxa dados extensivos das APIs (30 dias + período anterior)
2. Analisa TODAS as campanhas, conjuntos de anúncios e anúncios individuais
3. Executa 10 checks por plataforma, cada um com peso por categoria e severidade
4. Calcula Health Score ponderado (0-100) com nota (A-F)
5. Aplica Kill Rules e Quality Gates do `references/quality-gates.md`
6. Identifica desperdício em R$ (campanhas, criativos e termos sem conversão)
7. Rankeia criativos (top performers vs underperformers com nomes e métricas)
8. Gera plano de ação priorizado com economia estimada em R$ para cada item

## Instruções para execução

### PASSO 0 — Identificar cliente e plataforma

**OBRIGATÓRIO: SEMPRE perguntar antes de rodar. Nunca assumir.**

1. Ler `contas.yaml` da skill ads-ratos para identificar o cliente
2. Se houver mais de um cliente, perguntar qual
3. **SEMPRE perguntar a plataforma**: "Qual plataforma? **Meta Ads**, **Google Ads**, **GA4**, ou **todas**?"
4. Período padrão: últimos 30 dias (com comparativo dos 30 dias anteriores)

### PASSO 1 — Carregar referências obrigatórias

ANTES de qualquer análise, ler:
- `references/benchmarks-br.md` — benchmarks do mercado brasileiro por nicho
- `references/quality-gates.md` — regras de decisão, kill rules, health score

### PASSO 2 — Coletar dados Meta Ads (se disponível)

Usar a skill `meta-ads-ratos` para puxar dados extensivos:

```bash
# 2.1 — Insights da conta (últimos 30 dias)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --date-preset last_30d

# 2.2 — Insights da conta (30 dias anteriores para comparativo)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --time-range '{"since":"DATA_INICIO_ANT","until":"DATA_FIM_ANT"}'

# 2.3 — Todas as campanhas com métricas (30 dias)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --date-preset last_30d --level campaign

# 2.4 — Todos os conjuntos de anúncios com targeting e frequência (30 dias)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --date-preset last_30d --level adset

# 2.5 — Todos os anúncios com métricas individuais (30 dias)
python3 ~/.claude/skills/meta-ads-ratos/scripts/insights.py account \
  --id act_XXX --date-preset last_30d --level ad

# 2.6 — Campanhas ativas (estrutura)
python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py campaigns \
  --account act_XXX --status ACTIVE

# 2.7 — Conjuntos de anúncios ativos (estrutura + targeting)
python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py adsets \
  --account act_XXX --status ACTIVE

# 2.8 — Anúncios ativos (criativos)
python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py ads \
  --account act_XXX --status ACTIVE
```

### PASSO 3 — Coletar dados Google Ads (se disponível)

Usar a skill `google-ads-ratos`:

```bash
# Campanhas com métricas (30 dias)
python3 ~/.claude/skills/google-ads-ratos/scripts/insights.py campaign \
  --customer-id XXX --date-range LAST_30_DAYS

# Keywords com Quality Score
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py quality-scores \
  --customer-id XXX

# Search terms
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py search-terms \
  --customer-id XXX --date-range LAST_30_DAYS

# Extensões
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py extensions \
  --customer-id XXX

# Negativas
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py negative-keywords \
  --customer-id XXX
```

### PASSO 3B — Coletar dados GA4 (se disponível)

Usar a skill `ga4-ratos` para dados pós-clique (landing page, bounce rate):

```bash
# Landing pages com bounce rate e conversões
python3 ~/.claude/skills/ga4-ratos/scripts/reports.py landing-pages \
  --property XXX --start-date 30daysAgo --end-date today

# Conversões por evento
python3 ~/.claude/skills/ga4-ratos/scripts/reports.py conversions \
  --property XXX --start-date 30daysAgo --end-date today
```

### PASSO 4 — Calcular KPIs

Para cada plataforma, calcular:

```
Gasto total     = SUM(spend)
Conversões      = SUM(conversões)
CPL             = gasto / conversões
CTR             = cliques / impressões × 100
CPC             = gasto / cliques
CPM             = gasto / impressões × 1000
ROAS            = receita / gasto (se disponível)
Taxa Conv       = conversões / cliques × 100
Frequência      = impressões / alcance (Meta)
```

Calcular também os deltas vs período anterior:
```
Delta %  = (valor_atual - valor_anterior) / valor_anterior × 100
```

### PASSO 5 — Executar checks por categoria (Meta Ads)

**10 checks organizados em 4 categorias com pesos:**

#### Categoria: Pixel/CAPI (peso 30%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| M1 | EMQ Score | CRÍTICO | EMQ >= 8.0 | EMQ 5.0-7.9 | EMQ < 5.0 |
| M2 | Deduplicação Pixel/CAPI | ALTO | Taxa dedup >= 90% | Taxa dedup 80-89% | Taxa dedup < 80% |
| M3 | Eventos configurados | ALTO | Todos os eventos-chave disparando | Evento secundário faltando | Evento principal faltando |

#### Categoria: Criativos (peso 30%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| M4 | Fadiga de CTR | CRÍTICO | Queda de CTR < 10% em 14 dias | Queda de CTR 10-20% em 14 dias | Queda de CTR > 20% em 14 dias |
| M5 | Diversidade de formatos | MÉDIO | >= 3 formatos diferentes (imagem, vídeo, carrossel) | 2 formatos | 1 formato apenas |
| M6 | Quantidade de criativos por ad set | ALTO | >= 3 criativos ativos por ad set | 2 criativos por ad set | 1 criativo ou menos por ad set |

#### Categoria: Estrutura (peso 20%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| M7 | CBO vs ABO adequado | MÉDIO | CBO com >= 3 ad sets ou ABO com motivo claro | Mistura sem lógica | ABO com 1 ad set (sem sentido) |
| M8 | Learning phase | ALTO | >= 50 conversões/semana por ad set ativo | 25-49 conversões/semana | < 25 conversões/semana (learning limited) |

#### Categoria: Público/Targeting (peso 20%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| M9 | Frequência controlada | CRÍTICO | Prospecção < 3.0 e Retargeting < 8.0 | Prospecção 3.0-5.0 ou Retargeting 8.0-12.0 | Prospecção > 5.0 ou Retargeting > 12.0 |
| M10 | Exclusões entre funis | MÉDIO | Retargeting exclui compradores, Prospecção exclui retargeting | Exclusão parcial | Sem exclusões (sobreposição de público) |

### PASSO 6 — Executar checks por categoria (Google Ads)

**10 checks organizados em 6 categorias com pesos:**

#### Categoria: Conversion Tracking (peso 25%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| G1 | Tag de conversão ativa | CRÍTICO | >= 1 ação de conversão disparando nos últimos 7 dias | Tag existe mas sem disparos recentes | Sem tag de conversão |
| G2 | Enhanced Conversions | ALTO | Enhanced Conversions ativo e com dados | Configurado mas sem dados suficientes | Não configurado |

#### Categoria: Desperdício (peso 20%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| G3 | Search terms sem conversão | CRÍTICO | < 10% do gasto em termos sem conversão | 10-20% do gasto em termos sem conversão | > 20% do gasto em termos sem conversão |
| G4 | Palavras-chave negativas | ALTO | >= 1 lista de negativas com >= 50 termos | Lista existe com < 50 termos | Sem lista de negativas |

#### Categoria: Estrutura (peso 15%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| G5 | Organização de campanhas | MÉDIO | Campanhas segmentadas por objetivo/funil | Alguma mistura | Tudo numa campanha só |
| G6 | RSAs completos | ALTO | >= 2 RSAs por ad group com >= 12 headlines | 1 RSA ou < 12 headlines | Sem RSA (ETA legacy) |

#### Categoria: Keywords (peso 15%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| G7 | Quality Score médio | ALTO | QS médio >= 7 | QS médio 5-6 | QS médio < 5 |
| G8 | Canibalização de keywords | MÉDIO | Sem keywords duplicadas entre ad groups | < 5 keywords duplicadas | >= 5 keywords duplicadas |

#### Categoria: Anúncios (peso 15%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| G9 | RSA Ad Strength | ALTO | >= 50% dos RSAs com "Good" ou "Excellent" | >= 50% "Average" | Maioria "Poor" |

#### Categoria: Configurações (peso 10%)

| # | Check | Severidade | Condição PASS | Condição ATENÇÃO | Condição FAIL |
|---|---|---|---|---|---|
| G10 | Estratégia de bidding adequada | MÉDIO | Bidding compatível com volume de conversões (ver quality-gates.md) | Bidding agressivo para volume atual | Broad Match sem Smart Bidding |

### PASSO 7 — Calcular Health Score

Usar a fórmula do `references/quality-gates.md`:

```
Score = SUM(check_pontuação × peso_severidade × peso_categoria) /
        SUM(total_checks × peso_severidade × peso_categoria) × 100
```

**Pesos de severidade:**
| Nível | Multiplicador |
|---|---|
| CRÍTICO | 5.0 |
| ALTO | 3.0 |
| MÉDIO | 1.5 |
| BAIXO | 0.5 |

**Status de check:**
| Status | Pontuação |
|---|---|
| PASS | 100% dos pontos |
| ATENÇÃO | 50% dos pontos |
| FAIL | 0% dos pontos |

**Notas finais:**
| Faixa | Nota | Significado |
|---|---|---|
| 90-100 | A | Excelente — manter e escalar |
| 75-89 | B | Bom — otimizações pontuais |
| 60-74 | C | Atenção — problemas significativos |
| 40-59 | D | Ruim — ação urgente necessária |
| < 40 | F | Crítico — parar e reestruturar |

**Exemplo de cálculo (Meta Ads):**

```
Check M1 (EMQ): PASS → 1.0 × 5.0 (CRÍTICO) × 0.30 (Pixel/CAPI) = 1.50
Check M4 (Fadiga): ATENÇÃO → 0.5 × 5.0 (CRÍTICO) × 0.30 (Criativos) = 0.75
Check M9 (Frequência): FAIL → 0.0 × 5.0 (CRÍTICO) × 0.20 (Público) = 0.00
...
Score = SUM(pontos obtidos) / SUM(pontos possíveis) × 100
```

### PASSO 8 — Aplicar Kill Rules

Verificar as regras de parar do `references/quality-gates.md`:

| Regra | Condição | Ação |
|---|---|---|
| **3x Kill Rule** | CPA > 3x a meta do cliente | PAUSAR IMEDIATAMENTE — destacar em vermelho |
| **Zero conversões** | Gasto > 2x CPA meta sem nenhuma conversão | PAUSAR E REVISAR |
| **Campanha travada** | 0 impressões por 24h+ com status ativo | INVESTIGAR (orçamento, bid, aprovação) |
| **Frequência tóxica** | Prospecção > 5.0 ou Retargeting > 12.0 | PAUSAR ou renovar criativo |
| **CTR morto** | CTR < 50% do benchmark do nicho por 7+ dias | TROCAR criativo urgente |
| **Orçamento queimando** | > 80% do orçamento diário gasto antes das 15h | REVISAR programação horária |

Se QUALQUER kill rule disparar, ela DEVE aparecer no topo do relatório como alerta urgente.

### PASSO 9 — Classificar criativos (Meta Ads)

#### Top Performers (até 5)
Para cada anúncio ativo, rankear por eficiência (menor CPL ou maior ROAS):
- Nome do anúncio
- Formato (imagem/vídeo/carrossel)
- Gasto total no período
- Conversões
- CPL
- CTR
- CPC
- Classificação vs benchmark do nicho

#### Underperformers (até 5)
Anúncios com maior desperdício (gasto alto + poucas/zero conversões):
- Nome do anúncio
- Gasto total no período
- Conversões (ou zero)
- CPL (ou "sem conversões")
- CTR
- Motivo do baixo desempenho (CTR baixo? frequência alta? público saturado?)
- Ação recomendada (pausar, trocar criativo, ajustar público)

### PASSO 10 — Identificar desperdício

Calcular o desperdício total em R$:

1. **Campanhas sem conversão**: gasto total em campanhas com 0 conversões nos últimos 30 dias
2. **Criativos mortos**: gasto em anúncios com CTR < 50% do benchmark e 0 conversões
3. **Search terms irrelevantes** (Google): gasto em termos sem nenhuma conversão
4. **Frequência tóxica**: gasto estimado desperdiçado por saturação de público (impressões acima do threshold x CPM)
5. **Learning phase limitada**: gasto em ad sets que nunca saíram da learning phase

Somar tudo para o **Desperdício Total Estimado: R$ X.XXX,XX/mês**

### PASSO 11 — Hierarquia de decisão

Aplicar a hierarquia do `references/quality-gates.md` para priorizar recomendações:

```
1. Converte?       → A campanha está gerando conversões?
                     Se NÃO: pausar ou corrigir tracking antes de qualquer outra coisa
2. É lucrativo?    → O CPA/ROAS está dentro da meta?
                     Se NÃO: otimizar CPA antes de escalar
3. É escalável?    → Tem margem pra crescer (impression share, orçamento)?
                     Se NÃO: identificar gargalos de escala
4. É eficiente?    → CTR, Quality Score, desperdício estão bons?
                     Se NÃO: otimizar eficiência
```

**NUNCA recomendar otimização de eficiência (#4) antes de resolver lucratividade (#2).**

### PASSO 12 — Gerar relatório de auditoria

Exibir no formato abaixo (texto formatado, NÃO HTML):

```
═══════════════════════════════════════════════════════════════
 AUDITORIA MENSAL — {CLIENTE}
 Período: {DATA_INICIO} a {DATA_FIM}
 Plataforma(s): {META / GOOGLE / AMBAS}
 Nicho: {NICHO}
═══════════════════════════════════════════════════════════════

 HEALTH SCORE: {SCORE}/100 (Nota {NOTA})
 ████████░░ {SCORE}%

 {NOTA A}: Excelente — manter e escalar
 {NOTA B}: Bom — otimizações pontuais
 {NOTA C}: Atenção — problemas significativos
 {NOTA D}: Ruim — ação urgente necessária
 {NOTA F}: Crítico — parar e reestruturar

═══════════════════════════════════════════════════════════════
 RESUMO EXECUTIVO
═══════════════════════════════════════════════════════════════

 {3 a 5 frases resumindo o estado da conta, principais problemas
  e oportunidades. Usar números específicos, não generalidades.
  Ex: "A conta gastou R$12.450 nos últimos 30 dias e gerou 87
  leads a um CPL de R$143 — 78% acima do benchmark de R$80 para
  o nicho de imóveis. O principal gargalo é a fadiga de criativos:
  o CTR caiu 32% nas últimas 2 semanas. Há R$2.100 de desperdício
  identificado em campanhas sem conversão."}

═══════════════════════════════════════════════════════════════
 KILL RULES — AÇÕES URGENTES
═══════════════════════════════════════════════════════════════

 {Se alguma kill rule disparou, listar aqui com detalhes:}

 🔴 3x KILL RULE: Campanha "{NOME}" com CPA de R$240 — 3.2x
    acima da meta de R$75. Gastou R$1.920 em 8 leads.
    → AÇÃO: Pausar imediatamente. Economia: R$1.920/mês

 🔴 ZERO CONVERSÕES: Campanha "{NOME}" gastou R$890 sem
    nenhuma conversão (2.4x o CPA meta de R$75).
    → AÇÃO: Pausar e revisar tracking/criativo. Economia: R$890/mês

 {Se nenhuma kill rule disparou:}
 ✅ Nenhuma kill rule ativa — conta operando dentro dos limites.

═══════════════════════════════════════════════════════════════
 KPIs — VISÃO GERAL (30 DIAS)
═══════════════════════════════════════════════════════════════

 {PLATAFORMA}
───────────────────────────────────────────────────────────────
 Gasto total   : R$ XX.XXX,XX  (↑XX% vs anterior)
 Conversões    : XXX           (↓XX% vs anterior)
 CPL           : R$ XX,XX      (↑XX% vs anterior)  {CLASSIFICAÇÃO}
 CTR           : X,XX%         (↑XX% vs anterior)  {CLASSIFICAÇÃO}
 CPC           : R$ X,XX       (↓XX% vs anterior)  {CLASSIFICAÇÃO}
 CPM           : R$ XX,XX      (↑XX% vs anterior)  {CLASSIFICAÇÃO}
 ROAS          : X.X           (↓XX% vs anterior)  {CLASSIFICAÇÃO}
 Frequência    : X.X           (↑XX% vs anterior)  {CLASSIFICAÇÃO}
 Taxa Conv     : X,XX%         (↓XX% vs anterior)  {CLASSIFICAÇÃO}

 Benchmark do nicho ({NICHO}):
 CPL: R$XX-XX | CTR: X.X-X.X% | CPC: R$X.XX-X.XX

═══════════════════════════════════════════════════════════════
 CHECKS DETALHADOS — {PLATAFORMA}
═══════════════════════════════════════════════════════════════

 PIXEL/CAPI (peso 30%)                           Score: XX/100
───────────────────────────────────────────────────────────────
 ✅ PASS  M1 — EMQ Score: 8.5 (benchmark: >= 8.0)
 ⚠️ ATENÇÃO M2 — Dedup: 85% (benchmark: >= 90%, faltam 5pp)
 ❌ FAIL  M3 — Evento Purchase não configurado no CAPI

 CRIATIVOS (peso 30%)                            Score: XX/100
───────────────────────────────────────────────────────────────
 ❌ FAIL  M4 — Fadiga: CTR caiu 32% em 14 dias (limite: 20%)
           CTR atual: 0.7% → era 1.03% há 14 dias
 ✅ PASS  M5 — 3 formatos ativos: imagem (12), vídeo (5), carrossel (3)
 ⚠️ ATENÇÃO M6 — Média de 2.1 criativos/ad set (benchmark: >= 3)
           Ad sets com < 3 criativos: "Prospecção SP", "Retargeting 7d"

 ESTRUTURA (peso 20%)                            Score: XX/100
───────────────────────────────────────────────────────────────
 ✅ PASS  M7 — CBO com 4 ad sets na campanha principal
 ❌ FAIL  M8 — 0 de 4 ad sets saíram da learning phase
           Conversões/semana: 8 (necessário: 50)
           Orçamento diário de R$50 insuficiente para CPL de R$143

 PÚBLICO/TARGETING (peso 20%)                    Score: XX/100
───────────────────────────────────────────────────────────────
 ⚠️ ATENÇÃO M9 — Frequência de prospecção: 3.8 (limite ATENÇÃO: 3.0)
           Público "Interesse Imóveis SP" saturando
 ❌ FAIL  M10 — Sem exclusões entre funis. Retargeting e prospecção
           competem pelo mesmo público.

═══════════════════════════════════════════════════════════════
 CRIATIVOS — TOP PERFORMERS
═══════════════════════════════════════════════════════════════

 1. ⭐ "{NOME DO ANÚNCIO}"
    Formato: Vídeo | Gasto: R$1.200 | 18 conv | CPL: R$66,67
    CTR: 2.1% (EXCELENTE) | CPC: R$0.95 (BOM)
    → Recomendação: Duplicar em novo ad set com público similar

 2. "{NOME DO ANÚNCIO}"
    Formato: Carrossel | Gasto: R$890 | 12 conv | CPL: R$74,17
    CTR: 1.5% (BOM) | CPC: R$1.10 (BOM)

 3. "{NOME DO ANÚNCIO}"
    Formato: Imagem | Gasto: R$650 | 8 conv | CPL: R$81,25
    CTR: 1.2% (BOM) | CPC: R$1.30 (BOM)

═══════════════════════════════════════════════════════════════
 CRIATIVOS — UNDERPERFORMERS (DESPERDÍCIO)
═══════════════════════════════════════════════════════════════

 1. 🚨 "{NOME DO ANÚNCIO}"
    Formato: Imagem | Gasto: R$420 | 0 conv | CPL: —
    CTR: 0.3% (CRÍTICO — 62% abaixo do benchmark de 0.8%)
    Motivo: CTR morto, criativo não engaja
    → AÇÃO: Pausar imediatamente. Economia: R$420/mês

 2. 🚨 "{NOME DO ANÚNCIO}"
    Formato: Vídeo | Gasto: R$380 | 1 conv | CPL: R$380
    CTR: 0.5% (ATENÇÃO) | Frequência: 6.2 (CRÍTICO)
    Motivo: Público saturado, frequência tóxica
    → AÇÃO: Pausar e renovar criativo. Economia: R$380/mês

═══════════════════════════════════════════════════════════════
 DESPERDÍCIO IDENTIFICADO
═══════════════════════════════════════════════════════════════

 Campanhas sem conversão        : R$ X.XXX,XX
 Criativos mortos (CTR < 50% BM): R$ XXX,XX
 Search terms irrelevantes      : R$ XXX,XX  (se Google)
 Saturação de público           : R$ XXX,XX
 Learning phase limitada        : R$ XXX,XX
                                  ──────────
 DESPERDÍCIO TOTAL ESTIMADO     : R$ X.XXX,XX/mês

 Isso representa XX% do gasto total da conta.

═══════════════════════════════════════════════════════════════
 QUICK WINS — TOP 5 AÇÕES DE MAIOR IMPACTO
═══════════════════════════════════════════════════════════════

 Ações que podem ser implementadas esta semana:

 1. {AÇÃO ESPECÍFICA}
    Impacto: Economia de R$ XXX/mês | Esforço: 15 min
    Como: {passo a passo curto}

 2. {AÇÃO ESPECÍFICA}
    Impacto: Economia de R$ XXX/mês | Esforço: 30 min
    Como: {passo a passo curto}

 3. {AÇÃO ESPECÍFICA}
    Impacto: +XX% conversões estimadas | Esforço: 1h
    Como: {passo a passo curto}

 4. {AÇÃO ESPECÍFICA}
    Impacto: Economia de R$ XXX/mês | Esforço: 30 min
    Como: {passo a passo curto}

 5. {AÇÃO ESPECÍFICA}
    Impacto: Economia de R$ XXX/mês | Esforço: 2h
    Como: {passo a passo curto}

 Economia total estimada (Quick Wins): R$ X.XXX,XX/mês

═══════════════════════════════════════════════════════════════
 PLANO DE AÇÃO PRIORIZADO
═══════════════════════════════════════════════════════════════

 Hierarquia de decisão aplicada:
 1. Converte? → 2. Lucrativo? → 3. Escalável? → 4. Eficiente?

 🔴 URGENTE (fazer hoje)
───────────────────────────────────────────────────────────────
 1. {AÇÃO} — economia: R$ XXX/mês
    Motivo: {kill rule ou check FAIL crítico}
 2. {AÇÃO} — economia: R$ XXX/mês

 🟡 ALTA PRIORIDADE (fazer esta semana)
───────────────────────────────────────────────────────────────
 3. {AÇÃO} — economia: R$ XXX/mês
    Motivo: {check FAIL alto ou ATENÇÃO crítico}
 4. {AÇÃO} — ganho estimado: +XX% conversões

 🔵 MÉDIA PRIORIDADE (fazer este mês)
───────────────────────────────────────────────────────────────
 5. {AÇÃO} — economia: R$ XXX/mês
 6. {AÇÃO} — ganho estimado: +XX% eficiência

 ⚪ BAIXA PRIORIDADE (backlog)
───────────────────────────────────────────────────────────────
 7. {AÇÃO}
 8. {AÇÃO}

═══════════════════════════════════════════════════════════════
 OPORTUNIDADES DE ESCALAR
═══════════════════════════════════════════════════════════════

 {Se houver campanhas/criativos com CPA dentro da meta por 7+ dias:}

 📈 Campanha "{NOME}" elegível para escala:
    CPA de R$XX (meta: R$XX) por 12 dias consecutivos
    → Aumentar orçamento em 20-30% (de R$XX para R$XX/dia)
    → NÃO aumentar mais de 30% de uma vez (sai da learning phase)

 📈 Criativo "{NOME}" elegível para duplicação:
    CTR de X.X% (2.1x a média da conta)
    → Duplicar em novo ad set com público Advantage+

 {Se não houver oportunidades:}
 ⚠️ Nenhuma campanha elegível para escala.
 Resolver itens urgentes e de alta prioridade primeiro.

═══════════════════════════════════════════════════════════════
 CAMPANHAS — DETALHAMENTO COMPLETO
═══════════════════════════════════════════════════════════════

 {Para cada campanha ativa, listar:}

 📊 {NOME DA CAMPANHA}
 Status: Ativa | Tipo: {CBO/ABO} | Objetivo: {CONVERSÕES/TRÁFEGO/...}
 Orçamento: R$ XX/dia | Gasto 30d: R$ X.XXX,XX
───────────────────────────────────────────────────────────────
 Conversões  : XX        (↑XX% vs anterior)
 CPL         : R$ XX,XX  (↑XX% vs anterior)  {CLASSIFICAÇÃO}
 CTR         : X,XX%     {CLASSIFICAÇÃO}
 CPC         : R$ X,XX   {CLASSIFICAÇÃO}
 Frequência  : X.X       {CLASSIFICAÇÃO}
 % do gasto  : XX% da conta
 Ad sets     : X ativos
 Criativos   : X ativos
 Learning    : {Saiu / Limitada / Em learning}
 Veredicto   : {MANTER / OTIMIZAR / PAUSAR}

═══════════════════════════════════════════════════════════════
 NOTAS FINAIS
═══════════════════════════════════════════════════════════════

 Limites estatísticos aplicados (references/quality-gates.md):
 - Gasto mensal: R$ XX.XXX → Nível: {mudanças por campanha / ad set / granular}
 - Mínimo de 100 cliques antes de julgar um criativo
 - Mínimo de 1x CPA meta de gasto antes de julgar um público

 Sazonalidade ({MÊS ATUAL}):
 - Efeito esperado no CPM/CPC: {+XX% / -XX% / estável}
 - Motivo: {descrição da sazonalidade do mês}
 - Impacto na avaliação: {métricas ajustadas / expectativas calibradas}

 Próxima auditoria recomendada: {DATA} (30 dias)

═══════════════════════════════════════════════════════════════
```

## Regras importantes

1. **NUNCA usar MCPs** — toda execução DEVE ser via scripts Python das skills Ratos
2. **Números específicos em TODOS os checks** — não "CTR baixo", mas "CTR de 0.4% — 50% abaixo do benchmark de 0.8%"
3. **Economia em R$ para cada recomendação** — sem exceção
4. **Comparativo SEMPRE** — 30 dias atuais vs 30 dias anteriores
5. **Hierarquia de decisão** — converte? → lucrativo? → escalável? → eficiente? (nessa ordem)
6. **Benchmarks BR** — usar `references/benchmarks-br.md`, NUNCA benchmarks americanos
7. **Terminologia PT-BR** — spend → gasto, reach → alcance, frequency → frequência (ver tabela no SKILL.md)
8. **Sazonalidade** — verificar mês atual na tabela de sazonalidade antes de alarmar CPC/CPM alto
9. **Limites estatísticos** — não julgar criativo com < 100 cliques ou < 1x CPA meta de gasto
10. **Kill rules primeiro** — se qualquer kill rule disparar, ela aparece ANTES de tudo no relatório
11. **Criativos com nome** — SEMPRE usar o nome real do anúncio, nunca "Anúncio 1" ou "Criativo A"
12. **Recomendações ordenadas por impacto** — maior economia primeiro em cada nível de prioridade
13. **Se plataforma não configurada** — informar e seguir com a outra
14. **Se dados insuficientes para um check** — marcar como "DADOS INSUFICIENTES" com explicação do que falta

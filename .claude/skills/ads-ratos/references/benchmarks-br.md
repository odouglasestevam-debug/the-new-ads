# Benchmarks de Tráfego Pago — Mercado Brasileiro (2025-2026)

Fontes: WordStream/LocaliQ 16K campaigns, MLabs, Reportei, RD Station.
Atualizados em abril/2026.

O Claude DEVE usar estes benchmarks para classificar métricas automaticamente
e gerar alertas quando valores estiverem fora do esperado.

---

## Classificação de performance

| Nível | Cor | Significado |
|---|---|---|
| EXCELENTE | verde | Acima do benchmark superior |
| BOM | azul | Dentro do esperado |
| ATENÇÃO | amarelo | Abaixo do esperado, precisa otimizar |
| CRÍTICO | vermelho | Muito abaixo, ação urgente |

---

## Meta Ads — Benchmarks BR

### Métricas gerais

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---|---|---|---|
| CTR (tráfego) | < 0.5% | 0.5-0.8% | 0.8-1.5% | > 1.5% |
| CTR (leads) | < 1.0% | 1.0-2.0% | 2.0-3.5% | > 3.5% |
| CTR (vendas) | < 0.8% | 0.8-1.5% | 1.5-2.5% | > 2.5% |
| CPC (tráfego) | > R$3.00 | R$1.50-3.00 | R$0.50-1.50 | < R$0.50 |
| CPC (leads) | > R$8.00 | R$4.00-8.00 | R$1.50-4.00 | < R$1.50 |
| CPM | > R$50.00 | R$25.00-50.00 | R$8.00-25.00 | < R$8.00 |
| CPL geral | > R$80.00 | R$40.00-80.00 | R$15.00-40.00 | < R$15.00 |
| Taxa conversão (leads) | < 3% | 3-5% | 5-10% | > 10% |
| ROAS (e-commerce) | < 1.5 | 1.5-2.5 | 2.5-4.0 | > 4.0 |
| ROAS (retargeting) | < 2.0 | 2.0-3.5 | 3.5-5.0 | > 5.0 |
| ROAS (Advantage+) | < 2.5 | 2.5-4.0 | 4.0-6.0 | > 6.0 |

### Frequência (saturação)

| Tipo | ATENÇÃO | CRÍTICO |
|---|---|---|
| Prospecção | > 3.0 | > 5.0 |
| Retargeting | > 8.0 | > 12.0 |

### Creative fatigue (fadiga de criativo)

| Sinal | Threshold |
|---|---|
| Queda de CTR em 14 dias | > 20% = criativo cansado |
| Vida útil média de criativo TOF | 3-4 semanas |
| Exposições antes de queda de 45% | ~4 |

### Event Match Quality (EMQ) — Pixel/CAPI

| Métrica | CRÍTICO | BOM | EXCELENTE |
|---|---|---|---|
| EMQ Score | < 5.0 | 5.0-8.0 | > 8.0 |
| Taxa dedup | < 80% | 80-90% | > 90% |

---

## Google Ads — Benchmarks BR

### Métricas gerais (Search)

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---|---|---|---|
| CTR (Search) | < 2.0% | 2.0-3.5% | 3.5-5.0% | > 5.0% |
| CPC (Search) | > R$10.00 | R$5.00-10.00 | R$1.50-5.00 | < R$1.50 |
| CPA (Search) | > R$150.00 | R$80.00-150.00 | R$30.00-80.00 | < R$30.00 |
| Taxa conversão | < 2% | 2-3.5% | 3.5-5.0% | > 5.0% |
| Quality Score | < 4 | 4-5 | 6-7 | >= 8 |
| Search Impression Share | < 20% | 20-40% | 40-70% | > 70% |

### Quality Score — decomposição

| Componente | BOM | RUIM |
|---|---|---|
| creative_quality (relevância do anúncio) | ABOVE_AVERAGE ou AVERAGE | BELOW_AVERAGE |
| post_click_quality (experiência landing page) | ABOVE_AVERAGE ou AVERAGE | BELOW_AVERAGE |
| search_predicted_ctr (CTR esperado) | ABOVE_AVERAGE ou AVERAGE | BELOW_AVERAGE |

### Benchmarks por tipo de campanha

| Tipo | CTR esperado | CPA esperado | ROAS esperado |
|---|---|---|---|
| Search (marca) | > 8% | < R$15 | > 8.0 |
| Search (genérica) | 3-5% | R$30-80 | 2.0-4.0 |
| Performance Max | 1-3% | varia | 2.0-5.0 |
| Display | 0.3-0.8% | R$50-150 | 0.5-2.0 |
| YouTube (views) | 2-5% VTR | R$0.05-0.15/view | n/a |

---

## GA4 — Benchmarks BR

| Métrica | CRÍTICO | ATENÇÃO | BOM | EXCELENTE |
|---|---|---|---|---|
| Bounce rate (landing page de ads) | > 80% | 60-80% | 40-60% | < 40% |
| Tempo médio na página | < 15s | 15-30s | 30-60s | > 60s |
| Taxa conversão (sessão → lead) | < 1% | 1-3% | 3-5% | > 5% |
| Páginas por sessão | < 1.2 | 1.2-1.5 | 1.5-2.5 | > 2.5 |

---

## Benchmarks por nicho (Meta Ads BR)

| Nicho | CPL médio | CTR médio | CPC médio |
|---|---|---|---|
| E-commerce (moda) | R$8-15 | 1.2-1.8% | R$0.60-1.20 |
| E-commerce (tech) | R$15-30 | 0.8-1.5% | R$1.00-2.50 |
| Infoprodutos | R$5-15 | 1.5-3.0% | R$0.40-1.00 |
| SaaS B2B | R$50-150 | 0.5-1.2% | R$3.00-8.00 |
| Serviços locais | R$15-40 | 1.0-2.0% | R$1.00-3.00 |
| Imóveis | R$30-80 | 0.6-1.2% | R$2.00-5.00 |
| Saúde/estética | R$10-30 | 1.0-2.0% | R$0.80-2.00 |
| Educação | R$8-25 | 1.2-2.5% | R$0.50-1.50 |
| Financeiro | R$40-120 | 0.5-1.0% | R$3.00-10.00 |
| Alimentação/delivery | R$5-15 | 1.5-2.5% | R$0.40-1.00 |

---

## Sazonalidade — padrão brasileiro

| Período | Efeito no CPM/CPC | Motivo |
|---|---|---|
| Janeiro | -20-30% | Início de ano, menor competição |
| Fevereiro (Carnaval) | -15% | Menor investimento |
| Março-Abril | Estável | Retomada |
| Maio (Dia das Mães) | +15-25% | Pico e-commerce |
| Junho (Dia dos Namorados) | +10-20% | Pico e-commerce |
| Julho | Estável | Meio do ano |
| Agosto (Dia dos Pais) | +10-15% | Pico moderado |
| Setembro-Outubro | +5-10% | Pré-Black Friday |
| Novembro (Black Friday) | +30-50% | Maior pico do ano |
| Dezembro (Natal) | +20-35% | Segundo maior pico |

**Regra**: ajustar expectativas de CPC/CPM nos meses de pico. Um CPA "alto"
em novembro pode ser normal pela competição.

---

## Como usar estes benchmarks

1. Ler o nicho do cliente (do contas.yaml ou perguntar)
2. Cruzar métricas reais com a tabela do nicho
3. Classificar cada métrica (EXCELENTE/BOM/ATENÇÃO/CRÍTICO)
4. Gerar alertas para métricas em ATENÇÃO ou CRÍTICO
5. Considerar sazonalidade antes de alarmar

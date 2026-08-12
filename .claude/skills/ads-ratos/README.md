# Ads Ratos

Inteligência de tráfego pago para Claude Code. Diagnóstico, relatório, auditoria e estratégia para Meta Ads e Google Ads com benchmarks do mercado brasileiro.

## Instalação

```bash
git clone https://github.com/duduesh/ads-ratos ~/.claude/skills/ads-ratos
```

## Pré-requisitos

Precisa de pelo menos uma skill de execução instalada:

- **Meta Ads**: `git clone https://github.com/duduesh/meta-ads-ratos ~/.claude/skills/meta-ads-ratos`
- **Google Ads**: em breve
- **GA4**: em breve

## Setup

```
/ads-ratos setup
```

Guia o cadastro de contas e testa conexões.

## Comandos

| Comando | O que faz | Quando usar |
|---|---|---|
| `/ads-ratos setup` | Configura contas e testa conexões | Primeira vez |
| `/ads-ratos diagnostico` | Health Score + KPIs + alertas automáticos | Check diário (5 min) |
| `/ads-ratos relatorio` | Dashboard HTML com benchmarks BR | Entrega pro cliente |
| `/ads-ratos auditoria` | Análise profunda com Quality Gates | Revisão mensal |

## O que está incluso

- **Benchmarks BR**: métricas de referência do mercado brasileiro por nicho
- **Quality Gates**: regras de decisão (3x Kill Rule, limites de escala, bidding)
- **Health Score**: nota 0-100 da conta com classificação A-F
- **Alertas automáticos**: detecção de problemas com números e ações

## Arquitetura

```
ads-ratos (cérebro — estratégia + inteligência)
  ├── referencia → meta-ads-ratos (execução Meta)
  ├── referencia → google-ads-ratos (execução Google)
  └── referencia → ga4-ratos (execução Analytics)
```

## Licença

MIT — [Ratos de IA](https://ratosdeia.com.br)

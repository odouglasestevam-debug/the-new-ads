# Aprendizados — Google Ads Ratos

Regras aprendidas durante o uso. O Claude DEVE ler este arquivo antes de criar qualquer objeto.

---

## API v23 (SDK 30.0.0) — campos obrigatórios para criar campanha

- `contains_eu_political_advertising` é **enum** (não boolean). Usar valor `3` (DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING)
- `maximize_clicks` não funciona como atributo direto. Usar `manual_cpc.enhanced_cpc_enabled = False` como fallback
- Budget name deve ser único. Script agora usa timestamp no nome pra evitar colisão com budgets órfãos
- Descriptions do RSA: máximo 90 caracteres. Headlines: máximo 30 caracteres

## GAQL keyword_view / ad_group_criterion mistura negativas e positivas

**CRÍTICO — incidente real na conta Entretec (2026-08-04):** consultas em `keyword_view` ou `ad_group_criterion` sem filtrar `ad_group_criterion.negative = false` retornam negativas e positivas juntas, sem aviso. Isso causou a interpretação errada de 759 negativas de grupo de anúncios (termos como "poki", "8 ball pool") como "keywords exact duplicadas entre campanhas", resultando na exclusão em massa das negativas de uma campanha ativa (JOGOS_NORMAL), expondo-a a tráfego irrelevante até a restauração.

- SEMPRE incluir `AND ad_group_criterion.negative = false` (ou `= true` se a intenção é negativas) em qualquer GAQL sobre keywords antes de analisar ou agir.
- Antes de deletar em massa (>50 objetos) qualquer criterion, confirmar com uma query focada em 1 objeto (campos `negative`, `type`, `system_serving_status`) e mostrar amostra ao usuário antes de executar.
- Contagem de "keywords" muito alta num único ad group, ou termos semanticamente desconectados do produto, é sinal de alerta de que pode ser lista de negativas — parar e verificar antes de agir.

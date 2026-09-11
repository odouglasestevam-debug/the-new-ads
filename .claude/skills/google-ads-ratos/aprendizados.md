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

## Campanha ativada sem segmentação geográfica roda para o mundo inteiro

**Incidente real na conta Entretec (2026-09-09):** a campanha `SEARCH_AGOSTO_26_CONQUISTA_CONCORRENTES_SP` estava pausada há semanas (grupo e anúncios também pausados). Ao ativar tudo e trocar a estratégia para parcela de impressão desejada, ela passaria a comprar impressão sem nenhum limite geográfico: tinha zero critério de LOCATION e zero de LANGUAGE, enquanto as outras nove campanhas ativas miravam Estado de São Paulo (`geoTargetConstants/20106`). O sufixo `_SP` no nome dava a falsa impressão de que estava segmentada.

- ANTES de ativar qualquer campanha, e SEMPRE ao criar uma nova, contar os critérios de LOCATION por campanha (`FROM campaign_criterion WHERE campaign.status = 'ENABLED'`). Zero critérios significa alcance global, e o Google não emite aviso nenhum.
- Se faltar, herdar a segmentação das demais campanhas ativas quando todas usarem a mesma, aplicar e avisar o usuário. Se divergirem, perguntar em vez de adivinhar.
- Vale o mesmo para LANGUAGE (`languageConstants/1014` = português).
- Nome de campanha não é fonte de verdade sobre segmentação. Conferir sempre no critério.

## Keyword Planner exige developer token com acesso basic ou standard

O token atual da agência está com **explorer access**, que bloqueia `KeywordPlanIdeaService`. Qualquer chamada de `keyword_planner.py` retorna `DEVELOPER_TOKEN_NOT_APPROVED` ("This method is not allowed for use with explorer access"). Leitura e escrita normais (GAQL, mutates de campanha, orçamento, keywords, anúncios) funcionam sem problema.

- Não prometer pesquisa de volume de busca antes de checar. Como alternativa, usar os dados reais da própria conta: `search_term_view` com filtro `LIKE '%termo%'` dá volume, CPC real e conversões do que a conta já captura, que costuma ser mais confiável que a estimativa do Planner.
- Para liberar, é preciso solicitar basic access no API Center do MCC.

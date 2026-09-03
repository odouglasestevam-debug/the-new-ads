# Aprendizados — Meta Ads Ratos

Regras aprendidas durante o uso. O Claude DEVE ler este arquivo antes de criar qualquer objeto.

---

### 2026-04-03 — Sempre incluir CTA no criativo
**Regra:** Ao criar criativos (create.py creative), SEMPRE incluir call_to_action_type. Padrão: LEARN_MORE pra tráfego, SIGN_UP pra leads, SHOP_NOW pra vendas. Nunca criar criativo sem CTA.
**Contexto:** Criou carrossel sem botão de CTA. Usuário teve que corrigir manualmente.

### 2026-04-03 — Carrossel Instagram: multi_share_end_card=false
**Regra:** Em campanhas de visita ao perfil Instagram, SEMPRE usar multi_share_end_card=false e multi_share_optimized=false no criativo.
**Contexto:** Cartão "Ver mais" sem URL quebrou o anúncio em 10 posicionamentos. O end_card exige uma URL de destino que não existe em campanhas de perfil.

### 2026-04-03 — Sempre passar instagram_user_id no criativo
**Regra:** Ao criar criativos pra Instagram, SEMPRE usar --instagram-user-id com o ID da conta Instagram do cliente (do contas.yaml).
**Contexto:** Sem instagram_user_id, o ad não publica no Instagram. Erro: "Seu anúncio deve ser associado a uma conta do Instagram."

### 2026-09-03 — create.py campaign sem --bid-strategy quebra qualquer ad set depois
**Regra:** Ao criar campanha (create.py campaign) sem passar --bid-strategy explicitamente, o script/API assume LOWEST_COST_WITH_BID_CAP sem nenhum valor de lance definido, o que quebra a criação de QUALQUER ad set depois com erro genérico "Invalid parameter" (code 100, subcode 1815857) — sem pista nenhuma de que o problema é bid_strategy. SEMPRE passar `--bid-strategy LOWEST_COST_WITHOUT_CAP` explicitamente ao criar campanha (é o que as campanhas de sucesso da Agari usavam), ou conferir com `read.py campaign --fields bid_strategy` antes de criar o primeiro ad set se o erro "Invalid parameter" aparecer sem explicação.
**Contexto:** Bloqueou a criação de 3 campanhas novas da Agari Drinks até isolar por eliminação (testei geo, targeting, optimization_goal, destination_type — nenhum era o problema; era a campanha em si).

### 2026-04-03 — Desligar format options em carrosséis
**Regra:** Ao criar ads de carrossel, SEMPRE passar --degrees-of-freedom-spec com OPT_OUT pra carousel_to_video, image_touchups e standard_enhancements.
**Contexto:** "Blocos de coleção" e "mídia única" distorcem o carrossel sequencial. Desligar pra manter ordem dos slides.

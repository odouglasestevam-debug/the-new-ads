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

### 2026-09-03 — Instagram no ad set exige vínculo na Conta de Anúncio, não só na Página
**Regra:** `instagram_positions` no targeting só funciona (sem erro genérico "Invalid parameter") se a conta do Instagram estiver atribuída à Conta de Anúncio em Configurações do Negócio > Contas > Instagram — o vínculo Instagram×Página sozinho não é suficiente e não aparece em `page.instagram_business_account`. Checar com `AdAccount.get_instagram_accounts()` antes de assumir que não tem IG vinculado. Depois de vinculado, sempre passar `--instagram-user-id` no create.py creative (já era regra, mas sem o vínculo na conta de anúncio o ID nem aparece pra usar).
**Contexto:** Bloqueou posicionamentos de Instagram nas 3 campanhas novas da Agari até o Douglas atribuir o Instagram à conta de anúncio especificamente.

### 2026-09-03 — instagram_positions "explore" e "story" quebram combinado com outros
**Regra:** No targeting de ad set, `instagram_positions: ["explore"]` sozinho já dá erro (subcode 2490589) — parece placement descontinuado/incompatível com OFFSITE_CONVERSIONS. `"story"` funciona sozinho mas quebra ao combinar com `"reels"` ou `"stream"` nesta conta/versão de API. Combinação estável testada: `["stream","reels"]`. Se precisar de Stories do Instagram, testar isolado antes de assumir que pode somar às outras posições.
**Contexto:** Vários ciclos de tentativa e erro pra montar o targeting das campanhas da Agari — isolar posição por posição economiza tempo da próxima vez.

### 2026-04-03 — Desligar format options em carrosséis
**Regra:** Ao criar ads de carrossel, SEMPRE passar --degrees-of-freedom-spec com OPT_OUT pra carousel_to_video, image_touchups e standard_enhancements.
**Contexto:** "Blocos de coleção" e "mídia única" distorcem o carrossel sequencial. Desligar pra manter ordem dos slides.

### 2026-09-12 — Evento LEAD não existe sob o objetivo Vendas
**Regra:** Se a meta de desempenho for o evento `LEAD` (promoted_object com `custom_event_type: LEAD`), a campanha PRECISA ser `OUTCOME_LEADS`. Com `OUTCOME_SALES` a API recusa o ad set com "Invalid parameter" code 100 subcode 2446814, e a mensagem real só aparece em `error_user_msg`: "Este evento de conversão não está disponível com o objetivo selecionado". Objetivo não é editável depois de criado, então a campanha inteira precisa ser refeita. Conferir a dupla objetivo × evento ANTES de criar a campanha.
**Contexto:** Campanha multinicho da Funil Shark foi criada como OUTCOME_SALES e teve que ser apagada e refeita como OUTCOME_LEADS.

### 2026-09-12 — instagram_actor_id dentro de object_story_spec foi descontinuado
**Regra:** Na v21 a API recusa `instagram_actor_id` dentro do `object_story_spec` com "(#100) Param instagram_actor_id must be a valid Instagram account id", mesmo passando o ID correto vindo de `act_X/instagram_accounts` ou de `page.instagram_business_account`. O campo certo agora é `instagram_user_id` **no nível de cima do adcreative**, com o mesmo ID. Criativo sem Instagram também é aceito, mas aí a entrega no Instagram fica por conta do vínculo da página.
**Contexto:** As 13 criações da campanha multinicho falharam em bloco até isolar o campo testando as duas variantes numa peça descartável.

### 2026-09-12 — Opt-out de "anúncios com vários anunciantes" não está exposto na API
**Regra:** Não existe campo para desativar multi-advertiser ads em adset, ad ou adcreative na v21 (testado por introspecção com `?metadata=1`: nenhum campo com "multi", "contextual" ou "enroll"). É ajuste manual no Gerenciador. Avisar o usuário em vez de prometer via API.
**Contexto:** Douglas pediu para desativar na criação da campanha multinicho da Funil Shark.

### 2026-09-14 — Formato flexível do gerenciador não tem equivalente via API para imagem estática
**Regra:** `asset_feed_spec` com `ad_formats: ["AUTOMATIC_FORMAT"]` cria o criativo, mas o anúncio é tratado como criativo dinâmico e só entra em conjunto com `is_dynamic_creative=true`, que aceita UM anúncio por conjunto ("Anúncios de criativos dinâmicos só podem ser criados em conjuntos de anúncios de criativos dinâmicos"). Com `optimization_type: FORMAT_AUTOMATION` exige pelo menos dois entre COLLECTION, CAROUSEL e SINGLE_VIDEO. Ou seja: agrupar imagens por nicho via API obriga a um conjunto por grupo, o que divide a fase de aprendizado. Para vários anúncios flexíveis num conjunto só, criar na mão pelo gerenciador. Não confundir número de anúncios com pulverização: verba e aprendizado vivem no conjunto.
**Contexto:** Tentativa de três anúncios flexíveis por nicho num conjunto único da campanha de CompleteRegistration da Funil Shark; o Douglas optou por 13 anúncios de imagem num conjunto.

### 2026-09-14 — CompleteRegistration é aceito sob OUTCOME_SALES
**Regra:** Diferente do LEAD, `custom_event_type: COMPLETE_REGISTRATION` funciona como meta de desempenho em campanha de Vendas. Criativos podem ser reaproveitados entre anúncios de campanhas diferentes pelo `creative_id`: as macros das url_tags resolvem por anúncio.
**Contexto:** Campanha de Vendas da Funil Shark montada reaproveitando os 13 criativos da campanha de Lead.

### 2026-09-23 — Campanha nova exige is_adset_budget_sharing_enabled
**Regra:** Criar campanha na v25 sem `is_adset_budget_sharing_enabled` retorna "Invalid parameter" code 100 subcode 4834011, e a mensagem real só aparece em `error_user_title`. Passar `False` para orçamento estrito no conjunto (ABO) ou `True` para deixar os conjuntos dividirem 20%. Além disso, `bid_strategy` no nível da campanha exige orçamento no nível da campanha (subcode 1885737): ou define `daily_budget` na campanha, ou joga orçamento e bid_strategy para o conjunto.
**Contexto:** Criação da campanha de Londrina/Ibiporã do Grupo Confiança travou duas vezes seguidas; o `create.py campaign` não expõe o campo, precisou ir pelo SDK direto.

### 2026-09-23 — Janela de atribuição de 7 dias não é mais aceita em CONVERSATIONS
**Regra:** Ad set com `optimization_goal: CONVERSATIONS` e `destination_type: WHATSAPP` só aceita `attribution_spec` com `window_days: 1` (subcode 1885423 se mandar 7). Conjuntos antigos com 7 dias continuam rodando, então campanha nova e campanha velha do mesmo cliente reportam em janelas diferentes: avisar antes de comparar número de conversa entre elas.
**Contexto:** Conjunto novo do Grupo Confiança recusado ao copiar o `attribution_spec` do conjunto de maio, que tem 7 dias.

### 2026-09-23 — location_types home+recent é sobrescrito com frequently_in
**Regra:** Em ad set de WhatsApp com `advantage_audience: 1`, a API aceita `location_types: ["home","recent"]` mas devolve `["frequently_in","home","recent"]`, tanto na criação quanto num update posterior. Não insistir via API: se o cliente exigir só morador e visitante recente, o ajuste é manual no Gerenciador.
**Contexto:** Conjunto de Londrina/Ibiporã do Grupo Confiança, onde o padrão da conta era home+recent.

### 2026-09-24 — standard_enhancements no degrees_of_freedom_spec foi descontinuado
**Regra:** Passar `standard_enhancements` dentro de `creative_features_spec` ao criar adcreative retorna "Invalid parameter" code 100 subcode 3858504, com o motivo real só em `error_user_title` ("O criativo não deve incluir aprimoramentos padrão"). Declarar os recursos individualmente (`image_touchups`, `image_templates`, `image_animation`, `image_brightness_and_contrast`, `text_optimizations`, `enhance_cta`, `advantage_plus_creative`) e nunca o guarda-chuva `standard_enhancements`. Criativos antigos da conta ainda mostram o campo na leitura, então não serve de template pra criação.
**Contexto:** Os 3 criativos de jaqueta da Fátima Esportes falharam em bloco na primeira tentativa; o campo tinha sido copiado de um criativo existente da própria conta.

### 2026-09-24 — Nome de conjunto não prova targeting, sempre conferir custom_audiences
**Regra:** Antes de recomendar qualquer coisa baseada em "público quente x público frio", ler o targeting real do conjunto e checar `custom_audiences` e `excluded_custom_audiences` explicitamente (`AdSet.api_get(fields=["targeting"])`). Nome de conjunto é rótulo, não configuração.
**Contexto:** Fátima Esportes tinha dois conjuntos, "00_AUTO_ENVOLVIMENTO" e "00_AUTO_ABERTO", com targeting idêntico e nenhum público personalizado em nenhum dos dois. Rodaram 2 meses competindo entre si pelas mesmas pessoas.

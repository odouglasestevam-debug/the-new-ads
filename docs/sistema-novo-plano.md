# Sistema novo (multitenant) - plano

Decidido em 16/09/2026 com o Douglas. Ler inteiro antes de mexer em qualquer coisa.

## O que é

Um sistema para clientes da agência, baseado no `/funil` da The New Ads (duplicado, não estendido). Cada cliente é uma empresa com seus usuários e níveis de acesso. Os leads entram sozinhos (formulário do site, WhatsApp de anúncio CTWA e, depois, formulário nativo da Meta) já com a origem da campanha, conjunto e anúncio, e a equipe responde pelo WhatsApp (API oficial e não oficial) num chat dentro do próprio sistema, sem Chatwoot.

## Restrições absolutas

- **Não mexer no `/funil`**: pasta `the-new-ads-site/funil/`, rotas `the-new-ads-site/functions/api/`, tabelas `funil_*` do projeto Supabase `iklynyncffneuvutvgxa`. É o sistema do Douglas e está funcionando.
- **Não mexer no n8n.** O sistema novo não depende dele nem das tabelas `*_tracking` e `*_meta` do banco antigo. Nem todo cliente vai ter acesso e o sistema ainda não está validado.
- Nunca rodar SQL do sistema novo no banco antigo. O banco novo só é acessado pelo conector `supabase-app`.

## Onde vive

- **Banco:** projeto Supabase `xrvjlhseyqfgyvwwlwwb`, organização "oestevamdouglas@gmail.com's Org", conector MCP `supabase-app` (`.mcp.json`, preso a esse project_ref). Começa zerado.
- **Front e rotas:** projeto Cloudflare Pages novo e pasta nova no repo (a definir), com o código do `/funil` copiado como ponto de partida, tirando o que é só da TNA (nichos, formulário de tráfego pago, agenda do Douglas).
- **Subdomínio:** `crm.thenewads.com.br` (decidido em 16/09/2026).

Motivo do projeto separado: usuários de cliente vão ter login. No mesmo banco dos dashboards e do `/funil`, qualquer erro de RLS numa tabela antiga exporia dado de outro cliente.

## Decisões de produto

**Uma pessoa, um lead.** Identificação por telefone (normalizado E.164), e-mail como plano B. Guarda primeira e última origem. Sem telefone, o lead fica marcado como **cadastro incompleto** (alerta no card), pode ser completado à mão e é mesclado sozinho quando a pessoa aparecer por outro canal com telefone.

**Origem tipo UTM, por canal:**

| canal | origem | fase |
|---|---|---|
| Formulário do site | UTMs da URL + `ad_id` | 2 |
| CTWA | `referral.source_id` (é o ad_id) + `ctwa_clid`; o sistema consulta a API da Meta e grava nome da campanha, conjunto e anúncio, com cache por ad_id | 3 |
| Formulário nativo Meta | webhook `leadgen`; API entrega nomes de campanha/conjunto/anúncio e as respostas. Exige conectar o Facebook e provavelmente revisão de app para páginas de terceiros. **Segundo plano** | depois |

Regra operacional: todo formulário nativo de cliente com telefone obrigatório.

**Credenciais por empresa** (token Meta de usuário do sistema, WhatsApp Phone Number ID, WABA ID, App Secret, verify token, credenciais da API não oficial): cifradas no banco (Supabase Vault), nunca no navegador, campo só de escrita na tela de Integrações. Um número não pode estar na API oficial e na não oficial ao mesmo tempo.

**Papéis (proposta, falta confirmar):** agência (super admin, vê todas as empresas); por empresa: dono, gestor, vendedor (só os leads atribuídos a ele), leitura.

## Fases

0. **Fundação:** schema multitenant (empresas, membros, papéis, RLS por empresa), tabelas de leads com origem e cadastro incompleto, testes provando que uma empresa não enxerga a outra; pasta nova com cópia limpa do `/funil`; projeto Pages novo.
1. **Empresas, usuários e papéis** na interface (convite, troca de empresa, permissões).
2. **Entrada de leads:** endpoint de formulário do site por empresa.
3. **WhatsApp** oficial e não oficial; lead de CTWA nasce da primeira mensagem, com nomes resolvidos pelo source_id.
4. **Chat** nativo.

Tela de Integrações é construída ao longo das fases 2 e 3. Formulário nativo Meta entra depois de validar.

## Andamento

**16/09/2026, banco da Fase 0 aplicado** (`sistema-novo/supabase/migrations/0001` e `0002`):
- Papéis confirmados pelo Douglas: agência, dono, gestor, vendedor (só os leads atribuídos a ele), leitura
- Lead é por empresa: o mesmo telefone em dois clientes vira dois leads, um em cada
- Tabelas: `empresas`, `agencia_admins`, `membros`, `leads`, `lead_origens`, `lead_etapas_log`, `lead_notas`, `integracoes`, `meta_anuncios_cache`
- Funções de permissão no schema `privado` (fora da API). `segredo_id`, origens não manuais, log e cache só o servidor grava
- `sistema-novo/supabase/tests/isolamento.sql`: 31 de 31 testes passando. Rodar de novo depois de qualquer migration

**16/09/2026, tela no ar em https://crm.thenewads.com.br**
- Código em `sistema-novo/site/public/` (cópia adaptada do `/funil`, que não foi alterado). Deploy: `cd sistema-novo/site && npx wrangler deploy` com o `.env` carregado. É um Cloudflare Worker `tna-crm` com assets estáticos (o Cloudflare migrou Pages para Workers); só a pasta `public/` vai para o ar
- Tem: login com 2FA, seletor de empresa, kanban (novo, em contato, qualificado, proposta, cliente, perdido), lista de leads, gaveta do lead (anotações, origens, dados), criar lead manual, completar cadastro, equipe (leitura), permissões espelhando o banco
- Saiu do /funil por ser só da TNA: agenda do Google, analytics, push, CAPI, lembretes, score, nichos
- Migration `0003`: função `membros_da_empresa` para mostrar e-mail da equipe
- Testado com login real via API (dono, vendedor, anônimo) e dados apagados depois

**16/09/2026, origem por canal:** tag verde WhatsApp (CTWA: campanha, conjunto, anúncio), laranja Site (utm_source, medium, campaign, content, term, placement, ad_id, padrão do /funil), azul Formulário Meta. Migration `0004` criou `utm_placement`.

**16/09/2026, Fase 1 (equipe) no ar:**
- Edge Function `equipe` (`sistema-novo/supabase/functions/equipe`): convidar por e-mail com nível (gera link de convite, não manda e-mail) e gerar link de nova senha. Só agência ou dono
- Tela: aba Empresas (agência cria cliente), aba Equipe (convidar, trocar nível, link de acesso, remover), tela de criar senha ao abrir o link, responsável editável na lista de leads por gestor/dono
- Migration `0005`: empresa nunca fica sem dono; `usuario_id_por_email` só para service_role
- Site URL e Redirect URL do Supabase Auth configurados para `https://crm.thenewads.com.br` (16/09/2026). Fluxo completo testado: convite, link abre no CRM, pessoa cria senha, entra e vê só a empresa dela

**16/09/2026, Fase 2 (formulário do site, modo 1) no ar:**
- Decisões do Douglas: formulário gerado pelo CRM que copia o visual do site (modo 1 antes do modo 2 de captura); depois de enviar vai para um redirect configurado no próprio formulário
- Migration `0006`: tabela `formularios` (config jsonb, chave pública), `formulario_envios` (limite por IP com hash), `lead_origens.formulario_id`, função `receber_lead_site` (só service_role) que acha a pessoa por telefone e depois e-mail, completa dados e anexa origem
- Edge Function `form` (pública, verify_jwt false): GET devolve config pública, POST valida, isca `empresa_site`, tempo mínimo 3s, 6 envios por IP em 10 min (robô recebe sucesso falso), só aceita respostas de campos e opções configurados
- Script `https://crm.thenewads.com.br/f.js` com `data-form="CHAVE"`: Shadow DOM, copia fonte, cor/raio do botão mais colorido da página e detecta fundo claro/escuro; máscara de telefone; guarda UTMs (inclui `posicionamento`) por 30 dias no localStorage; dispara `tna_crm_lead` no dataLayer; sem data-form só guarda UTMs
- Tela Formulários (dono e agência): lista com código, editor (textos, redirect, e-mail opcional/obrigatório/oculto, perguntas texto/parágrafo/seleção/única/múltipla, visual automático ou manual), prévia ao vivo em site claro/escuro
- Testado com Playwright em sites falsos claro e escuro (visual copiado certo, redirect, dedup por telefone com 2 origens, respostas na ficha), anti-robô por API, `tests/isolamento.sql` com 37/37
- Sugestão pendente: ligar "Leaked password protection" no Supabase Auth (painel)

**17/09/2026, Fase 3 (WhatsApp API oficial), servidor pronto:**
- Migration `0007`: `conversas` (uma por empresa+canal+wa_id, janela de 24h por `ultima_entrada_em`), `mensagens` (wa_message_id único, status enviando/enviada/entregue/lida/falhou), navegador só lê; `marcar_conversa_lida`; `privado.telefone_de_wa` põe o 9 no celular BR; segredos no Vault por integração (`integracao_salvar_segredos`/`integracao_ler_segredos`, só service_role, campo vazio mantém o anterior, apagar integração apaga o segredo); `receber_mensagem_whatsapp` junta com lead existente (com ou sem o 9), origem CTWA uma por ctwa_clid, sem duplicar reentrega
- Edge Functions: `integracoes` (dono/agência: ver, salvar phone_number_id/waba_id/token/app_secret, gera verify_token, testar na Graph API, desligar), `whatsapp-webhook` (público, `?i=<integracao_id>`, verifica hub.verify_token e assinatura X-Hub-Signature-256, ignora phone_number_id de outra empresa, nomes do anúncio por ad_id via cache `meta_anuncios_cache` ou Graph `/{ad_id}?fields=name,adset{id,name},campaign{id,name}`), `whatsapp-enviar` (mesma permissão de edição de lead, bloqueia fora da janela de 24h, grava falha com o erro da Meta)
- Testado com credenciais falsas e payload assinado: tudo passou; envio real e nomes pela Graph API só validam com token de verdade
- Não feito: API não oficial (Douglas precisa escolher Evolution, NeoGo ou outra), templates fora da janela, download de mídia

**17/09/2026, Fase 4 (chat) e tela de Integrações no ar:**
- Migration `0008`: conversa única por lead e canal (número com e sem o 9 abria duas); `wa_id` fica com o último formato recebido
- Menu Conversas (todos os papéis, RLS filtra): lista com não lidas, chat com balões, status (✓, ✓✓, lida, não enviada com o erro da Meta), aviso da janela de 24h, responder com Enter; só quem pode editar o lead responde
- Ficha do lead abre na aba Conversa quando existe conversa; botão wa.me some nesse caso
- Atualização a cada 10 s (sem Realtime); contador de não lidas na barra
- Ajustes, Integrações (dono/agência): Phone Number ID, WABA ID, token e App Secret só de escrita, Salvar, Testar conexão, Desligar; mostra URL do webhook e token de verificação para colar na Meta
- Conversas fictícias nas empresas Demo (5 no total, uma fora da janela de 24h)
- Testado com Playwright desktop e celular (sem erro de JS, sem rolagem horizontal) e laço infinito de redesenho corrigido
- Melhorar depois: no celular o campo de resposta fica logo acima da barra inferior e exige rolar

**17/09/2026, NeoGo (API não oficial) pronta, piloto Agari Drinks:**
- Decisão do Douglas: API não oficial é a NeoGo; cliente piloto é a Agari Drinks (empresa criada no CRM, slug `agari-drinks`)
- API NeoGo lida do pacote público `n8n-nodes-neogo` (só leitura): `POST {base}/send/text` com `apikey: <token da instância>` e corpo `{number, text}`; webhooks em `PUT {base}/instance/{id}/webhooks/{slot}` (slots 1 a 3, exige Global API Key, corpo `{url, events: [], enabled, secret}`); assinatura `X-Hub-Signature-256` quando o slot tem secret
- Migration `0009`: `receber_mensagem_whatsapp` ganhou `p_direcao` (mensagem do atendente pelo celular entra como saída, sem contar não lida nem abrir janela); índice único de `instance_id` por integração NeoGo
- Edge Function `neogo-webhook` (pública, `?i=<id>&t=<token do endereço>`): ignora grupo, broadcast, LID sem telefone e instância de outra empresa; desembrulha mensagem temporária e visualização única; `meta_ads.source_id` vira origem CTWA com nomes via cache ou token da integração `meta` (fallback token do WhatsApp oficial); `Receipt` atualiza entregue/lida; eco do envio feito pelo CRM amarra o ID em vez de duplicar
- `integracoes` agora trata 3 tipos (`whatsapp_oficial`, `whatsapp_nao_oficial`, `meta`) e registra webhook NeoGo num slot **só se estiver livre** (Global Key usada na hora, não guardada). Motivo: a instância do cliente pode já ter slot apontando para o n8n, que não pode ser mexido
- `whatsapp-enviar` envia pela NeoGo sem janela de 24h
- Tela Integrações com blocos NeoGo, webhook NeoGo, Meta Ads (token ads_read) e WhatsApp oficial; chat mostra por qual canal responde
- Testado com httpbin.org fazendo papel da NeoGo (17 cenários de webhook, envio, eco, slot ocupado) e no navegador; dados de teste apagados

**17/09/2026, Conversas no estilo WhatsApp Web e conversa iniciada pelo CRM:**
- Pedido do Douglas: lista parecida com o WhatsApp Web, filtros minimalistas (inclusive por responsável, a nível de administrador) e poder chamar alguém primeiro, digitando o número
- Lista: avatar com iniciais, busca por nome, número, prévia ou responsável, chips Todas / Não lidas / Sem resposta com contador, e seletor de responsável (Minhas conversas, cada pessoa da equipe, Sem responsável) só para agência, dono e gestor
- "Sem resposta" é calculado sem coluna nova: `ultima_entrada_em >= ultima_mensagem_em` quer dizer que a última mensagem foi do lead
- Vendedor não vê o seletor de responsável e continua vendo só as conversas dos leads dele (regra do banco, não da tela)
- Migration `0010`: `public.abrir_conversa_whatsapp(empresa, telefone, nome)`, security definer, chamável por `authenticated`. Acha ou cria o lead pelo telefone (com e sem o 9), escolhe o canal ativo (NeoGo antes da oficial, porque não tem janela de 24h) e abre a conversa. Erros com nome próprio: `sem_whatsapp`, `lead_de_outro`, `telefone_invalido`, `sem_permissao`
- Lead criado assim já nasce no nome de quem abriu, senão o vendedor não enxergaria o próprio contato
- No WhatsApp oficial, conversa nova avisa que só começa com modelo aprovado pela Meta (ainda não existe no CRM)
- Testado no navegador: 18 verificações (filtros, busca, permissão do vendedor, número repetido não duplica conversa, envio numa conversa iniciada pelo CRM); corrigido erro de JS ao clicar no menu antes da empresa carregar

**17/09/2026, API oficial validada ponta a ponta (número de teste da Meta):**
- Integração salva na Agari Drinks: phone_number_id `1324788970715973`, WABA `2281314125740536`, token e App Secret no Vault
- Mensagem de entrada criou o lead sozinha, assinatura HMAC conferida, resposta pelo CRM saiu e voltou com status `entregue`
- "Testar conexão" do WhatsApp oficial agora **confere o webhook de verdade**: `debug_token` descobre o app do token e `GET /{waba}/subscribed_apps` diz se ele está inscrito. Antes a tela afirmava "as mensagens já chegam" sem base
- Botão **Configurar webhook na Meta**: `POST /{app}/subscriptions` (callback, verify_token, campo `messages`) com app access token `{app_id}|{app_secret}`, mais `POST /{waba}/subscribed_apps`. Substitui as duas telas escondidas da Meta. **Recusa com 409 se o app já aponta o webhook para outro sistema**, porque o callback é do app inteiro e sobrescrever derrubaria quem já usa
- Envio traduz os erros da Meta (131030 lista de permitidos, 131047 janela, 131026 número sem WhatsApp, 190 token expirado, 10 sem permissão)
- Envio tenta o número **com e sem o nono dígito** quando a Meta recusa por número (131030/131026/131009) e grava o formato que funcionou no `wa_id`. Foi exatamente o que travou o primeiro envio real
- Aprendizado do onboarding novo da Meta: o número de teste só envia para até 5 números cadastrados em Configuração da API, campo Para. App precisa ser tipo Negócios. App Secret fica em Configurações, Básico, e só administrador do app enxerga

**17/09/2026, empresa com dois números (Agari vai usar os dois):**
- Decisão do Douglas: a Agari terá um número na API oficial e outro na NeoGo, ao mesmo tempo
- Migration `0011`: `public.canais_whatsapp(empresa)` devolve canal e número de exibição das integrações ativas (vendedor não lê a tabela `integracoes`, que é só de admin), e `abrir_conversa_whatsapp` ganhou `p_canal`
- Cuidado achado no teste: `integracoes.tipo` é enum `tipo_integracao`, comparar com texto dá `operator does not exist`. Sempre `i.tipo::text`
- Tela: seletor "Falar por qual número" quando há dois, filtro "Os dois números" na lista, selo do número em cada conversa e no cabeçalho do chat
- Conversa é única por lead e canal, então a mesma pessoa falando nos dois números vira duas conversas no mesmo lead, cada uma com o seu histórico. É o comportamento desejado
- Testado no navegador com dois números ligados: 10 verificações passaram; dados de teste apagados

**19 e 20/09/2026, feito por outra sessão sem registro aqui (reconstituído na auditoria de 21/09):**
- Migrations `0012` a `0019` aplicadas (no banco aparecem agrupadas como `crm_conversas_seguranca_midias`, `crm_busca_recibos` e `crm_limites_atomicos`): Realtime em conversas e mensagens, `marcar_conversa_lida_ate`, bucket privado `crm-midias`, **sessão exige 2FA (aal2) de quem tem fator cadastrado** (`privado.crm_sessao_ok`), `empresas.ativo` (empresa desativada some para quem é de dentro), conversa única por empresa+lead+canal, `buscar_conversas_crm` (busca também no texto das mensagens, security invoker), recibos fora de ordem (`privado.whatsapp_recibos_pendentes`), limites por minuto (envio 30, conversa 20, equipe 10)
- Edge Functions novas: `whatsapp-modelos`, `whatsapp-midia`, `whatsapp-lida`; código compartilhado em `functions/_shared`
- Site reestruturado em módulos (`public/js/*.js`, `app.css`, `workspace.css`, `_headers` com CSP fechada)
- **NeoGo agora exige o domínio em `NEOGO_ALLOWED_HOSTS`** (secret das Edge Functions) e a URL base **sem caminho**. Proteção contra o CRM ser usado para chamar endereço arbitrário

**21/09/2026, auditoria para liberar testes:**
- `tests/isolamento.sql`: 37/37. Novo `tests/isolamento_conversas.sql` (conversas, mensagens, funções do navegador, mídia, 2FA, empresa desativada): 37/37 depois de corrigir a entrada do próprio teste (número sem 55 é tratado como estrangeiro; a tela sempre manda +55)
- Tela no ar testada como dono e vendedor, computador e celular: todas as telas abrem, sem erro de JS, sem requisição falhando, sem rolagem lateral; vendedor só vê o que é dele e não vê Formulários nem Integrações
- **`0020_distribuicao_leads.sql` e `public/js/distribution.js` estão no disco e NÃO estão no banco nem no ar** (trabalho em andamento de 21/09). Não rodar `wrangler deploy` a partir do disco antes de aplicar a 0020, senão o site no ar passa a chamar funções que não existem
- Pendências de segurança: conta da agência sem 2FA; "Leaked password protection" desligado; Auth é compartilhado com o gestor de tarefas (usuários de lá conseguem logar no CRM e não veem nada; existe `teste@teste.com`)
- Não validado depois da reescrita: envio real pela API oficial e pela NeoGo, modelos e mídia com número real
- Menor: Cloudflare injeta o script de Web Analytics e a CSP bloqueia (só ruído no console)

**24/09/2026, notificação no celular do atendente (pedido da Agari):**
- Migration `0025_push_atendente.sql` (no banco: `crm_push_atendente`). Numerada 0025 porque a outra IA usou 0021 a 0024
- `privado.crm_push` (um registro por aparelho) e `privado.crm_avisos` (fila com tentativas e erro), ambas fora do alcance do navegador
- Gatilho em `leads`: ganhou responsável, entra aviso na fila. Não avisa quem atribuiu o lead a si mesmo. Um empurrão por comando (gatilho de statement), não um por lead
- Edge Function `crm-notificar` (verify_jwt false; autentica por `x-cron-secret` do Vault ou por sessão para o teste). Web Push com `urgency: high`, que é o que faz o Android mostrar na hora. Aparelho que responde 404 ou 410 sai da lista
- `pg_cron` a cada minuto como rede de segurança, e limpeza diária
- Segredos no Vault: `crm_vapid_publica`, `crm_vapid_privada`, `crm_cron`. A chave privada nunca passou pelo chat: o Douglas rodou o arquivo no SQL Editor
- Tela: `manifest.json`, `sw.js`, ícones em `/icones`, `js/push.js` e um bloco em Ajustes, Segurança. CSP precisou de `manifest-src` e `worker-src`, senão o manifesto e o service worker são bloqueados
- Tocar na notificação abre a ficha do lead (`?lead=<id>`), trocando de empresa se for preciso; com o CRM aberto, a aba recebe a ordem por mensagem em vez de recarregar
- Cuidado achado no teste: registrar o service worker não basta, é preciso `navigator.serviceWorker.ready` antes de assinar, senão dá "no active Service Worker". E o registro precisa acontecer no carregamento, não depois do login
- Testado até onde dá sem aparelho real: gatilho, fila, chamada do pg_net (200) e a função concluindo o aviso. **Falta o teste no celular do Douglas**, que é o que prova a entrega
- No iPhone só funciona com o CRM adicionado à tela de início. A tela detecta e ensina o caminho

**24/09/2026, horário de atendimento, prazo de 10 minutos e transferência (migrations 0026 a 0028):**
- Decisões do Douglas: horário por empresa e por dia da semana; "começou o atendimento" é mandar mensagem ao lead; ocupado não recebe lead; prazo de 10 min dentro do horário e, fora dele, começa 30 min depois da próxima abertura
- `privado.crm_atendimento` (fuso, horários por dia em jsonb, minutos) e `privado.crm_prazo_resposta` (um prazo por lead, com contador de repasses)
- Gatilhos: atribuiu lead começa o relógio; saiu mensagem para o lead o relógio para; virou cliente ou perdido também para
- `privado.crm_cobrar_prazos()` no pg_cron a cada minuto: repassa quem não respondeu para o próximo da fila do mesmo canal, só dentro do horário, no máximo 5 repasses por lead. Também solta a fila de espera quando a empresa abre, sem depender de alguém mexer na tela
- `public.crm_transferir_lead(lead, para)`: o próprio atendente transfere o lead dele. O banco continua bloqueando a troca direta de responsável pelo vendedor
- `public.crm_atendentes(empresa)` devolve online, ocupado ou offline por pessoa (os três estados já existiam no banco: presença + disponibilidade)
- **Mudança no comportamento da outra IA:** `crm_distribuir_lead` passou a exigir presença e disponibilidade em **todos** os modos. Antes, no modo fila, entregava para quem estava offline
- Armadilhas achadas nos testes: (1) o canal agora é `comercial` ou `suporte`, `padrao` não existe mais; (2) gatilho `after insert` que lê `new` enxerga o lead **sem** responsável quando a distribuição atribui dentro do próprio gatilho de inserção, e apagava o prazo recém-criado. O gatilho passou a ler o estado atual do lead
- Testado em cenário completo: entrada e distribuição, prazo de 10 min, estouro com repasse e aviso para o próximo, resposta parando o relógio, fora do horário caindo em domingo 08:30, e transferência com e sem permissão. Dados apagados
**25/09/2026, telas do atendimento (`js/atendimento.js`):**
- Aba **Atendimento** em Ajustes (agência e dono): liga a cobrança, define abre e fecha de cada dia da semana, os minutos para começar e os minutos após a abertura. Mostra "aberto agora" ou a próxima abertura, e quantos leads estão aguardando primeira resposta
- Bloco **Transferir atendimento** na aba Dados da ficha do lead, para quem pode editar aquele lead. Lista a equipe com online, ocupado ou offline ao lado do nome
- Estados renomeados na tela da distribuição para **Online, Ocupado e Offline**. Junto, corrigi um texto que ficou mentiroso com a minha mudança: dizia que na fila rotativa a disponibilidade não altera a vez, o que deixou de ser verdade
- Testado no navegador com dono e vendedor: 8 verificações, sem erro de JS. Dados apagados

**25/09/2026, volta atrás na regra de disponibilidade (migration 0029):**
- Sintoma: três leads da Agari (00h41, 02h19 e 07h38) ficaram sem responsável. Causa: em 24/09 eu passei a exigir online **e** disponível em todos os modos, e a equipe da Agari trabalha pelo celular com o CRM fechado. Pior: a função de presença da outra IA gravava "ocupado" na primeira batida, então ninguém ficava online sem clicar no botão
- Decisão do Douglas: **a fila entrega sempre**, mesmo para quem está ocupado ou offline. Quem corrige a ausência é o prazo de resposta
- `crm_distribuir_lead` agora só **prefere** quem está online e disponível: é o primeiro critério de ordenação, não um filtro. Sem ninguém online, a vez segue normalmente
- `crm_presenca` passou a gravar **disponível na primeira batida**: abrir o CRM significa online, e ocupado virou escolha explícita
- Os três leads foram distribuídos na hora (julie, tiffany, operações)
- Textos da tela ajustados de novo: o estado agora dá preferência, não exclusividade. Lição: toda vez que a regra muda, o texto da tela precisa mudar junto, senão o sistema passa a mentir para o atendente
- **Pendente para a Agari:** o horário de atendimento não está configurado, então o prazo de resposta não roda e nada é repassado. Sem isso, "a fila entrega sempre" não tem rede de segurança

**Próximos passos (em ordem):**
1. Agari: URL da NeoGo, ID e token da instância, quais slots de webhook já estão em uso; token Meta com ads_read na conta da Agari
2. Ligar, mandar mensagem real de teste, conferir chegada, resposta e nomes do anúncio
3. Convidar a equipe da Agari
4. Templates para retomar conversa fora das 24h (oficial); download e exibição de mídia
5. Modo 2 do formulário (captura de formulário existente); formulário nativo Meta; analytics por empresa

Fase 0 concluída: Douglas é agência (odouglasestevam@gmail.com); empresas "Demo ..." são dados fictícios, apagar com `delete from empresas where slug like 'demo-%'`. Antigo item: primeiro usuário da agência (Douglas cria em Authentication > Add user no Supabase e o Claude marca em `agencia_admins`) e primeira empresa.

## Pendências (perguntar antes de decidir)
- Cliente piloto (sugestão: Grupo Confiança)
- Subdomínio e nome do sistema
- Custo: projeto está no Free Plan; avisar antes de qualquer coisa que gere cobrança

## Como trabalhar

Antes de aplicar qualquer migration, mostrar o schema proposto ao Douglas e esperar aprovação. Atualizar este arquivo quando uma pendência for decidida.

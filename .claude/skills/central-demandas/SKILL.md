---
name: central-demandas
description: >
  Opera o ClickUp real do Douglas como central de demandas, sem lista nova nem sistema
  paralelo: cada cliente já tem sua lista operacional (Operacional/Gestão de Tráfego), e
  demandas internas caem em Geral > Interno (the new ads) ou Interno TBAds > Demandas
  (Tubarão Ads). O Claude Code lança demanda avulsa direto na lista certa, agrega tudo
  (inclusive tarefas recorrentes já existentes) numa visão só, executa em conversa
  movendo status, e gera relatório de produtividade a partir das tarefas concluídas.
  Resolve "fiz muita coisa com o Claude mas não vejo o trabalho" — visibilidade concreta
  do que foi feito, sem duplicar a estrutura que já existe. Use quando o usuário disser
  "lança essa demanda", "anota essa tarefa", "o que eu preciso fazer hoje/amanhã", "lista
  minhas demandas", "resumo do meu dia", "relatório de produtividade", ou pedir pra marcar
  algo como feito.
---

# Central de demandas

Usa o ClickUp que já existe, do jeito que já existe. Cada cliente tem sua própria lista
operacional com tarefas (inclusive recorrentes, tipo "Revisão Diária de Budget e
Performance") já rodando — não recriar isso, não criar lista nova. Demanda avulsa lançada
pelo Douglas se agrega dentro da lista certa, junto com o que já está lá.

> Nota: existe uma lista "Central de Demandas" (id `901114321741`) criada por engano no
> space PESSOAL numa iteração anterior desta skill — está vazia e não é usada por este
> fluxo. Não há endpoint de delete de lista no MCP; se o Douglas quiser, ele apaga direto
> no ClickUp.

**Spaces fixos**: `the new ads` = `90113792830`, `TUBARAO ADS` = `90113792821`.

**Listas de demanda interna/não-cliente** (fixas):
- The New Ads: `Geral > Interno` = `901110935077`
- Tubarão Ads: `Interno TBAds > Demandas` = `901113669770`

**Statuses** (padrão em toda a workspace): `não feito` → `fazendo` → `aguardando cliente` →
`análise interna` → `feito` → `done` (fechado — é o único que popula `date_closed`, usado
no relatório de produtividade).

## Capturar demanda

1. Identificar se a demanda é de um cliente específico ou interna/geral. Se o Douglas não
   disser a agência (The New Ads vs Tubarão Ads) e o nome do cliente for ambíguo, perguntar
   — não adivinhar, cliente errado gera tarefa no lugar errado.
2. Se for de cliente: achar a lista operacional dele. `clickup_get_folder(folder_name=<cliente>,
   space_name=<agência>)` pra confirmar o folder, depois `clickup_get_workspace_hierarchy`
   com `space_ids=[<id da agência>]` (retorna todos os folders+listas da agência numa
   chamada só) pra achar, dentro do folder do cliente, a lista `Operacional` ou
   `Gestão de Tráfego` (o nome varia por cliente, sempre uma dessas duas).
3. Se for interna/geral: usar a lista fixa da agência certa (acima).
4. Antes de criar, checar rapidamente (`clickup_filter_tasks` na lista alvo, ou
   `clickup_search`) se já não existe uma tarefa recorrente/aberta equivalente — não duplicar
   o que já está rodando.
5. `clickup_create_task` na lista resolvida. `name` claro e acionável, `priority` só se ele
   sinalizar urgência. `assignees` é obrigatório em toda demanda, sem exceção: padrão é
   Douglas (`270704987`), e só usar outra pessoa (Pedro Henrique `212499201`, Igor Mendes
   `176467453`, Danilo Patrício `236528857`) quando ele disser explicitamente pra quem é
   ("lança uma tarefa pro Fulano"). Nunca criar tarefa sem passar `assignees` — mesmo em
   lote/planejamento com várias tarefas de uma vez.
6. `start_date` e `due_date` são obrigatórios em toda demanda criada. Se o Douglas passou o
   vencimento, usar `start_date` = hoje e `due_date` = o que ele falou. Se ele não passou
   nenhuma data, usar `start_date` = hoje e `due_date` = amanhã por padrão — nunca criar
   tarefa sem essas duas datas.

Não pedir confirmação de cada campo — criar direto e mostrar o que foi criado, com link.

## Listar demandas pendentes ("o que eu preciso fazer hoje/essa semana")

`clickup_filter_tasks` com `space_ids: ["90113792830", "90113792821"]`,
`assignees: ["270704987"]` (ou quem for perguntado), excluindo status `done`, ordenado por
`due_date`. Isso agrega automaticamente tudo: tarefas recorrentes já existentes, demandas
antigas e as que o Claude acabou de lançar — não precisa de lista separada pra "ver tudo".

Se o Douglas quiser só demanda avulsa/pessoal (sem misturar operação de cliente), filtrar
adicionalmente pelas duas listas internas fixas (`list_ids`) em vez do space inteiro.

## Executar

Ao começar, mover pra `fazendo` (`clickup_update_task`). Trabalhar a demanda normalmente em
conversa. Ao concluir, mover pra `done` (fecha e marca `date_closed` — é o dado do
relatório). Se travar esperando algo do cliente ou decisão do Douglas, mover pra
`aguardando cliente` ou `análise interna` em vez de deixar em `não feito`.

**Múltiplos chats em paralelo**: o Douglas pode ter várias sessões do Claude Code abertas
ao mesmo tempo (abas/janelas diferentes), todas nesta mesma pasta de projeto, cada uma
puxando e resolvendo tarefas da lista de pendências. Como o ClickUp é o estado
compartilhado entre elas, antes de começar qualquer tarefa reconferir o status dela
(`clickup_get_task` ou reler no resultado do `listar demandas`): se já estiver em `fazendo`,
outro chat já pegou — pular pra próxima da lista em vez de trabalhar em cima. Mover pra
`fazendo` assim que começar funciona como o sinal pros outros chats.

## Relatório de produtividade

Quando pedido ("resumo do meu dia", "o que eu fiz hoje", "relatório de produtividade"):

1. `clickup_filter_tasks` com `space_ids: ["90113792830", "90113792821"]`,
   `include_closed: true`, `date_closed_from`/`date_closed_to` cobrindo o período (sem
   período especificado, assumir hoje), `assignees: ["270704987"]`.
2. Montar a resposta como lista concreta do que foi concluído (nome da tarefa e cliente/lista
   de origem), não estatística vazia — o objetivo é o Douglas *ver* o trabalho, não só contar.

## Fora de escopo

- Não cria/duplica estrutura de cliente (isso é a skill `onboarding-cliente`).
- Não cria lista, folder ou space novo — só opera o que já existe.

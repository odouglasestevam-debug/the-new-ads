---
name: central-demandas
description: >
  Central de demandas pessoais do Douglas dentro do ClickUp já existente (lista "Central de
  Demandas" no space PESSOAL), operada pelo Claude Code: capturar demanda avulsa (ex. o que
  foi pensado fora do horário de trabalho), listar o que está pendente, executar em conversa
  marcando status conforme avança, e gerar relatório de produtividade a partir das tarefas
  concluídas. Resolve o problema de "fiz muita coisa com o Claude mas não vejo o trabalho" —
  dá visibilidade concreta do que foi feito. Use quando o usuário disser "lança essa demanda",
  "anota essa tarefa", "o que eu preciso fazer hoje/amanhã", "lista minhas demandas", "resumo
  do meu dia", "relatório de produtividade", ou pedir pra marcar algo como feito.
---

# Central de demandas

Não é um sistema novo — usa o ClickUp que já existe e já está conectado (MCP `clickup_*`). Nasceu da decisão de não construir um app/banco próprio pra isso: menos manutenção, e o ClickUp já resolve.

**IDs fixos**: lista "Central de Demandas" = `901114321741`, space PESSOAL = `90114022907`.

**Statuses da lista** (herdados do padrão da workspace): `não feito` → `fazendo` → `aguardando cliente` → `análise interna` → `feito` → `done` (fechado, é o único status que popula `date_closed` — usar esse pra fechar tarefa, não "feito", porque o relatório de produtividade depende de `date_closed`).

## Capturar demanda

Quando o Douglas descrever algo que precisa ser feito (mesmo informal, tipo "amanhã preciso revisar a campanha da Entretec e responder o Grupo Confiança"), quebrar em tarefas separadas e criar uma por vez com `clickup_create_task` na lista `901114321741`. Campos: `name` claro e acionável, `due_date` se ele deu prazo (senão deixar em aberto), `priority` só se ele sinalizar urgência.

Não pedir confirmação pra cada campo — criar direto e mostrar o que foi criado. Se a demanda for vaga, criar mesmo assim com o texto como veio; refinar depois se precisar.

## Listar demandas pendentes

`clickup_filter_tasks` com `list_ids: ["901114321741"]`, `statuses` excluindo `done` (ou simplesmente olhar todas as não-`done`). Ordenar por `due_date`. É a resposta padrão pra "o que eu preciso fazer hoje/essa semana".

## Executar

Ao começar uma demanda, mover pra `fazendo` (`clickup_update_task`). Trabalhar normalmente (é uma conversa com o Claude Code, não um app separado). Ao terminar, mover pra `done` — isso fecha a tarefa e marca `date_closed`, que é o dado usado no relatório de produtividade.

Se a demanda depender de algo do cliente ou de decisão do Douglas antes de continuar, mover pra `aguardando cliente` ou `análise interna` em vez de deixar em `não feito`.

## Relatório de produtividade

Quando pedido ("resumo do meu dia", "o que eu fiz hoje", "relatório de produtividade"):

1. `clickup_filter_tasks` com `list_ids: ["901114321741"]`, `include_closed: true`, `date_closed_from`/`date_closed_to` cobrindo o período pedido (hoje = data atual; se não especificar período, assumir hoje).
2. Se o Douglas quiser visão mais ampla (não só demanda avulsa, mas tudo que foi feito em tarefas de cliente também), repetir o filtro nas listas relevantes de `the new ads`/`TUBARAO ADS` usando o mesmo `date_closed_from`/`date_closed_to` — perguntar se é isso que ele quer antes de expandir, não assumir.
3. Montar a resposta como lista concreta do que foi concluído (nome da tarefa, não estatística vazia) — o objetivo é ele *ver* o trabalho feito, não só um número.

## Fora de escopo

- Não duplica a estrutura de cliente (Contrato/Pagamento/Onboarding/Operacional) — isso continua sendo domínio da skill `onboarding-cliente`.
- Não cria dashboard visual separado — o relatório é conversacional, direto na resposta do Claude Code.

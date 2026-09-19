---
name: central-demandas
description: >
  Opera o gestor de tarefas próprio do Douglas (tarefas.thenewads.com.br, que substituiu o
  ClickUp) como central de demandas: cada cliente tem sua pasta com a lista "Gestão de Tráfego"
  (e Contrato, Pagamento, Onboarding), e demandas internas caem na lista "Interno" de cada
  agência (The New Ads ou Tubarão Ads). O Claude Code lança demanda direto na lista certa,
  lista o que está pendente (atrasadas e de hoje primeiro), executa em conversa movendo o
  status e gera relatório de produtividade pelas tarefas concluídas. Use quando o usuário
  disser "lança essa demanda", "anota essa tarefa", "o que eu preciso fazer hoje/amanhã",
  "lista minhas demandas", "resumo do meu dia", "relatório de produtividade", ou pedir pra
  marcar algo como feito.
---

# Central de demandas

O estado compartilhado é o banco do gestor de tarefas (schema `tarefas` no Supabase
`xrvjlhseyqfgyvwwlwwb`). Acesso pelo conector MCP `supabase-app`, com `execute_sql`.
O ClickUp foi abandonado em 19/09/2026: não usar nenhuma ferramenta `clickup_*`.

O `execute_sql` roda como dono do banco e ignora as permissões por membro (RLS). É o
Claude agindo pelo Douglas, que é admin, então pode tudo, mas por isso mesmo:
- nunca mexer em `tarefas.usuarios`, `acesso_espacos`, `bloqueio_*` por esta skill
  (permissões são decididas pelo Douglas em Ajustes > Membros);
- sempre passar `criado_por` = Douglas nas inserções;
- nunca criar tarefa no espaço **Modelos** (é o molde do onboarding, não operação).

Link de uma tarefa pra mostrar ao Douglas:
`https://tarefas.thenewads.com.br/#/lista/<lista_id>?t=<tarefa_id>`

## Referências (consultar, não decorar)

```sql
-- pessoas
select user_id, nome from tarefas.usuarios where ativo order by nome;
-- status: usar pelo TIPO e pela ORDEM, nunca pelo nome (o Douglas renomeia)
select id, nome, tipo, ordem from tarefas.status order by ordem;
-- achar a lista de um cliente (pasta = nome do cliente)
select l.id, p.nome espaco, pa.nome pasta, l.nome lista
from tarefas.listas l join tarefas.projetos p on p.id = l.projeto_id
left join tarefas.pastas pa on pa.id = l.pasta_id
where p.nome <> 'Modelos' and pa.nome ilike '%<cliente>%' order by 2, 3, 4;
-- lista interna de uma agência
select l.id from tarefas.listas l join tarefas.projetos p on p.id = l.projeto_id
where p.nome = '<The New Ads|Tubarão Ads>' and l.pasta_id is null and l.nome = 'Interno';
```

Status atuais (conferir com a consulta acima): 1º aberto = "Não Feito", depois
"Em andamento", "Em revisão", e o de tipo `concluido` = "Concluído". Concluir grava
`concluida_em` sozinho e, se a tarefa for recorrente, o banco já cria a próxima.

## Capturar demanda

1. Identificar se é de um cliente ou interna. Se o Douglas não disser a agência e o nome
   do cliente for ambíguo (existe pasta com o mesmo nome nos dois espaços, ou duas listas
   iguais na mesma pasta), perguntar. Não adivinhar.
2. Cliente: lista "Gestão de Tráfego" da pasta dele (ou a lista que o assunto pedir:
   Contrato, Pagamento, Onboarding). Interna: lista "Interno" da agência.
3. Antes de criar, checar se já existe tarefa aberta equivalente na lista:
   ```sql
   select id, titulo, data_entrega from tarefas.tarefas
   where lista_id = '<lista>' and concluida_em is null and titulo ilike '%<palavra-chave>%';
   ```
4. Criar:
   ```sql
   with nova as (
     insert into tarefas.tarefas (lista_id, titulo, status_id, prioridade, data_inicio, data_entrega, criado_por)
     values ('<lista>', '<Título em sentence case>',
       (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1),
       'normal', '<AAAA-MM-DD>', '<AAAA-MM-DD>',
       (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com'))
     returning id, lista_id)
   insert into tarefas.tarefa_responsaveis (tarefa_id, user_id)
   select id, '<user_id do responsável>' from nova returning tarefa_id;
   ```
   - Título em sentence case: só a primeira letra maiúscula, nomes próprios mantêm.
   - Prioridade: `urgente`, `alta`, `normal` (é a "média") ou `baixa`. Só mudar de `normal`
     se ele sinalizar urgência.
   - Responsável é obrigatório: padrão Douglas; outra pessoa só quando ele disser pra quem é.
     Se a pessoa não estiver em `tarefas.usuarios`, avisar em vez de criar sem responsável.
   - `data_inicio` e `data_entrega` obrigatórias: sem data dita, início = hoje e entrega =
     amanhã.
   - **Nunca agendar pra sábado ou domingo**: se cair em fim de semana, empurrar pra
     segunda seguinte (conferir o dia da semana de verdade, ex. `select extract(isodow from date '<data>')`).
     Se ele pedir explicitamente sábado/domingo, avisar e confirmar antes.
   - Recorrência, se pedida: `recorrencia` = `diaria|semanal|mensal|anual`,
     `recorrencia_intervalo`, e a regra: `recorrencia_dias_semana` (0 = domingo … 6 = sábado,
     ex. seg/qua/sex = `'{1,3,5}'`), ou na mensal `recorrencia_mensal = 'dia_mes'` +
     `recorrencia_dia_mes` (1..31, -1 = último dia), ou `'dia_semana'` + `recorrencia_ordem`
     (1..4, -1 = última) + `recorrencia_dia_semana`.
5. Não pedir confirmação campo a campo: criar e mostrar o que foi criado, com o link.

## Listar pendências ("o que eu preciso fazer hoje/essa semana")

```sql
select v.id, v.lista_id, v.titulo, v.projeto_nome, v.lista_nome, v.status_nome, v.prioridade,
  v.data_entrega, v.situacao, v.dias_atraso
from tarefas.tarefas_visao v
join tarefas.tarefa_responsaveis r on r.tarefa_id = v.id
where r.user_id = (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com')
  and v.situacao <> 'concluida' and v.projeto_nome <> 'Modelos'
order by v.data_entrega nulls last, v.prioridade;
```
Mostrar primeiro só **atrasadas** (com os dias de atraso) e **vencem hoje**. O resto
(a vencer e sem data) vai resumido depois, em contagem ou lista curta. Pra outra pessoa,
trocar o e-mail. Pasta do cliente sai de `caminho`: juntar `projeto_nome` com a pasta se
precisar (consulta de lista acima).

## Executar

1. Antes de começar, reler o status da tarefa. Se já estiver no 2º status aberto
   ("Em andamento"), outro chat pegou: pular pra próxima. O Douglas pode ter várias sessões
   do Claude Code abertas ao mesmo tempo, e mover pra "Em andamento" é o sinal entre elas.
   ```sql
   update tarefas.tarefas set status_id = (select id from tarefas.status where tipo = 'aberto' order by ordem offset 1 limit 1)
   where id = '<tarefa>' and status_id = (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1)
   returning id;  -- sem linha de volta = alguém já pegou
   ```
2. Trabalhar a demanda em conversa.
3. Concluir:
   ```sql
   update tarefas.tarefas set status_id = (select id from tarefas.status where tipo = 'concluido' order by ordem limit 1)
   where id = '<tarefa>' returning proxima_id;  -- proxima_id preenchido = recorrente, próxima criada
   ```
4. Travou esperando cliente ou decisão: mover pro 3º status ("Em revisão") e comentar o motivo:
   ```sql
   insert into tarefas.comentarios (tarefa_id, autor_id, texto)
   values ('<tarefa>', (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com'), '<motivo>');
   ```

## Relatório de produtividade ("resumo do meu dia", "o que eu fiz hoje")

```sql
select v.titulo, v.projeto_nome, v.lista_nome, (v.concluida_em at time zone 'America/Sao_Paulo') as quando, v.dias_atraso
from tarefas.tarefas_visao v
join tarefas.tarefa_responsaveis r on r.tarefa_id = v.id
where r.user_id = (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com')
  and v.concluida_em is not null
  and (v.concluida_em at time zone 'America/Sao_Paulo')::date between '<de>' and '<até>'
order by v.concluida_em;
```
Sem período dito, usar hoje. Responder com a lista concreta do que foi concluído (tarefa e
cliente/lista), não só estatística. Se alguma saiu com atraso, mencionar.

## Fora de escopo

- Criar estrutura de cliente novo (pasta + listas + tarefas do modelo): skill `onboarding-cliente`.
- Criar espaço, pasta ou lista fora do fluxo de onboarding: só se o Douglas pedir.
- Permissões de membros: só pela tela Ajustes > Membros.

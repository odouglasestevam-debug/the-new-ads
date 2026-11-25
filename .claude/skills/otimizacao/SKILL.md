---
name: otimizacao
description: >
  Revisão de otimização de todas as contas de anúncio da The New Ads de uma vez (Meta e Google),
  feita nos dias de otimização (segunda, quarta e sexta). Coleta as contas com gasto, compara os
  últimos 7 dias com os 7 anteriores, confere se as ações da revisão anterior funcionaram, propõe
  ações cliente por cliente, aplica só o que o Douglas aprovar, lança as tarefas no gestor, registra
  tudo no histórico e no fim conclui as tarefas de otimização diária dos clientes. Use quando o Douglas disser "dia de otimização", "vamos otimizar as contas",
  "revisão das contas", "apanhado das contas", "revisão diária", "/otimizacao".
---

# Otimização das contas

Revisão de carteira inteira, não de um cliente só. Para um cliente específico, usar
`meta-ads-ratos` / `google-ads-ratos` direto.

Dias de otimização: **segunda, quarta e sexta**. A revisão roda quando o Douglas chama.

Ao começar, avisar em uma linha o que vai acontecer ("Coletando Meta e Google das contas com
gasto; enquanto isso leio o histórico e as regras em vigor") e seguir sem perguntar nada: as
datas são calculadas sozinhas.

## Arquivos da skill

| Arquivo | Para quê |
|---|---|
| `carteira.json` | Contas dos clientes ativos (Meta e Google). A coleta só chama a API destas. |
| `regras-vigentes.md` | Decisões do Douglas que valem até ele mudar (ex.: sem aumento de verba). Ler sempre. |
| `historico/AAAA-MM-DD.md` | Uma revisão por arquivo: o que foi proposto, aplicado, recusado e o que conferir depois. |
| `scripts/coleta_meta.py` | Todas as contas Meta do token com gasto em 14 dias. Grava `meta.json`. |
| `scripts/coleta_google.py` | Todas as contas da MCC com gasto em 14 dias. Grava `google.json`. |
| `scripts/analise.py` | Junta os dois num texto por cliente (`analise.txt`): um bloco `CLIENTE:` com a conta Meta e a Google. |
| `scripts/tendencia.py` | Janelas de 30/14/7/3 dias, faixa de oscilação do mês, causa da variação e fadiga. |

Os dados vão para `%TEMP%/otimizacao/<último dia do período>/`, fora do repositório (o repo
sincroniza sozinho com o GitHub e o JSON do Meta passa de 1 MB). Os scripts imprimem o caminho.

## Passo a passo

### 0. Conferir a carteira

A coleta só olha as contas de `carteira.json`. Conta de ex-cliente nunca é consultada nem citada
no relatório, mesmo com campanha "ativa" ou pagamento pendente. Antes de coletar, comparar a
lista do Meta com `clientes_meta_contas` (projeto Supabase `iklynyncffneuvutvgxa`, conector
claude_ai_Supabase):

```sql
select slug, conta_anuncio from clientes_meta_contas where ativo order by slug;
```

Se aparecer cliente ativo que não está na carteira, ou o contrário, perguntar ao Douglas antes
de seguir. Cliente que entra ou sai: atualizar `carteira.json` no mesmo dia.

### 1. Coletar (em paralelo, em segundo plano)

```bash
cd ".claude/skills/otimizacao/scripts"
python coleta_meta.py    # 3 a 5 min, espera sozinho se bater limite de chamadas
python coleta_google.py  # cerca de 1 min
```

Período atual = 7 dias completos até ontem; anterior = os 7 dias antes disso. Para refazer uma
data passada: `--fim AAAA-MM-DD` nos três scripts.

### 2. Enquanto coleta, ler o contexto

1. `regras-vigentes.md`.
2. O arquivo mais recente de `historico/`. A seção "Conferir na próxima revisão" vira a
   primeira parte do relatório.
3. As memórias dos clientes que tiverem conta com gasto (o índice MEMORY.md já está carregado;
   abrir as que citam o cliente). Exemplos que mudam a leitura: GRUA da Entretec tem custo por
   lead enganoso, teto mensal da Entretec manda no gasto, rastreio da Fisiolaser cai junto com
   o servidor, Londrina/Ibiporã do Confiança ficam em campanha própria.

### 3. Rodar a análise e ler inteira

```bash
python analise.py
```

O texto tem cerca de 160 KB, já separado por cliente (`CLIENTE: nome`, com Meta e depois
Google). Ler tudo, em partes se precisar. Nada de decidir só pelo total da conta.

### 4. Julgar cliente por cliente

Fechar um cliente inteiro (Meta e Google juntos) antes de passar para o próximo. Para cada conta
do cliente, nesta ordem:

1. **Alguém mexeu?** A seção ALTERAÇÕES mostra quem fez o quê:
   - `Douglas Estevam`: decisão dele no Gerenciador. Não tratar como problema; usar como
     explicação (ex.: anúncio pausado por falta de estoque).
   - `API`: feito pelo Claude em outra conversa (no Meta aparece como "PH Machado"; o script já
     troca o nome). Cruzar com o histórico.
   - `regra automática "..."`: regra programada na conta (ex.: SDF Tietê pausa o conjunto
     SHOPPING_8KM na segunda 00h e reativa na quinta). Queda nesses dias é esperada.
2. **Tendência do custo** (bloco TENDÊNCIA de cada campanha, e de cada conjunto/grupo quando a
   campanha tem mais de um gastando). Mostra o custo por resultado em 30, 14, 7 e 3 dias até
   ontem e compara os últimos 3 dias com todos os blocos de 3 dias do mês (linha
   **oscilação**). O veredito já junta as duas coisas:
   - `TENDÊNCIA DE ALTA`: semana e 3 dias mais de 15% acima do mês e fora da oscilação normal.
     Pede ação nesta revisão.
   - `ALTA RECENTE FORA DO NORMAL`: a semana está boa, mas os 3 dias saíram da faixa do mês.
     Olhar a causa agora; pode ser começo de tendência.
   - `ALTA LEVE`: semana mais cara que o mês, mas os 3 dias dentro do normal. Acompanhar e
     anotar no histórico para conferir na próxima revisão.
   - `OSCILAÇÃO`: só os 3 dias subiram, e dentro do normal do mês. Esperar; vai para "Manter".
   - `SUBIU NA SEMANA, MAS OS ÚLTIMOS 3 DIAS VOLTARAM`: já está se corrigindo.
   - `CAINDO`, `ESTÁVEL`: confirmar e manter.
   - `volume pequeno, conclusão fraca`: menos de 3 resultados nos 3 dias. Um resultado a mais
     ou a menos muda tudo; decidir por 7 e 14 dias.
   - `3 DIAS SEM RESULTADO`: gastou mais que o custo médio de um resultado sem trazer nenhum.
     Olhar rastreio e entrega antes de culpar criativo.
   - `sem base`: tudo o que gastou foi nos últimos 7 dias (campanha nova ou religada); julgar
     só pelo número absoluto.
   - Quando a linha diz `3d = últimos 3 dias com entrega`, os dias de calendário mais recentes
     ficaram sem gasto (programação de segunda a sexta, feriado, pausa). Se não houver
     programação nem pausa que explique, é problema de entrega: investigar.
3. **Por que o custo mudou.** As linhas `7d contra 30d` e `3d contra 30d` separam o custo por
   resultado nos três fatores que o formam e dizem qual mais puxou:
   - **custo por mil** subiu → leilão ou público mais caro (sazonalidade, concorrência,
     público pequeno). Trocar criativo não resolve; ver público e verba.
   - **taxa de cliques** caiu → criativo perdendo força ou público saturado. Separar pelos
     anúncios e pela frequência:
     - anúncios com `FADIGA` (14+ dias no ar e taxa de cliques da semana 20%+ abaixo do mês) →
       fadiga de criativo: pedir criativo novo e tirar verba do cansado;
     - frequência de 7 dias subindo de uma semana para outra, ou acima de ~2,5 (30 dias acima
       de ~3,5), com vários anúncios caindo juntos → público saturado: ampliar público ou
       baixar verba, criativo novo sozinho não resolve.
   - **conversão do clique** caiu → o problema é depois do clique: página, atendimento,
     rastreio ou clique de pior qualidade. Não mexer no anúncio antes de olhar isso.
   - Cliques e gasto normais com resultado zerado → rastreio quebrado, não campanha ruim.
   - Gasto de ontem zerado em campanha ativa → olhar pagamento, saldo, teto da conta ou
     anúncio reprovado antes de mexer em orçamento.
   - No Google, as conversões da tendência contam pela data em que aconteceram (não a do
     clique), então os últimos 3 dias não ficam artificialmente caros. Em anúncio de pesquisa,
     queda de taxa de cliques (`QUEDA`) costuma ser concorrência ou termo novo, não cansaço.
4. **Volume pequeno não decide nada.** Com menos de ~5 resultados no período, dizer que o
   volume é pequeno e esperar, em vez de pausar ou mexer em verba.
5. **Fase de aprendizado** e anúncio com menos de 3 dias: não mexer, salvo erro.
6. **Saldo pré-pago** com menos de 7 dias de duração: avisar no topo.
7. **Google**: termos sem conversão viram *proposta* de negativação com termo, campanha,
   gasto e cliques, campanha por campanha. Nunca negativar sem o Douglas mandar. Se
   precisar olhar palavras-chave, filtrar `ad_group_criterion.negative = FALSE` no GAQL.
8. Não mexer também é uma decisão: o que está estável vai para "Manter", com o número que
   justifica.
9. **Criativos, sempre.** Toda conta também é julgada pelo criativo: fadiga, conjunto com um
   anúncio só, anúncio com 60+ dias, criativo que não comunica a oferta do conjunto (ex.:
   QUARTA_DA_BARRA da SDF Tietê é campanha de barra de calça) e sazonalidade chegando (fim de ano,
   Black, volta às aulas). Dizer o caminho: **produzir aqui** (estático, carrossel, edição de vídeo
   a partir de bruto existente, texto de anúncio de pesquisa) ou **pedir** (gravação na loja, foto,
   definição de oferta), com briefing curto: ângulo, oferta, formato e o que falta para começar.
10. **Sempre trazer solução.** Nunca fechar com "nada até saber onde quebra". Investigar até
   achar: funil por dia e por anúncio (clique → visita na página → conversão), eventos do pixel
   por dia (`/{pixel}/stats?aggregation=event`), mudanças no site (git log da pasta), termos de
   pesquisa, campanhas da mesma conta disputando o mesmo evento. Propor ações para aprovar; o que
   só o Douglas sabe vira pergunta objetiva junto da proposta.

### 5. Relatório no chat, cliente por cliente

Sem arquivo e sem página, direto no chat, em português e sem termo em inglês (gasto, alcance,
taxa de cliques no link, custo por mil impressões).

**Um bloco por cliente, com tudo sobre ele, e só depois o próximo.** Nada de seções que
atravessam a carteira ("Agir hoje", "Manter", tabela de ajustes, lista geral de propostas): o
Douglas lê e decide um cliente de cada vez. Meta e Google do mesmo cliente ficam no mesmo bloco.

1. Uma linha de abertura: quantos clientes, gasto da semana (Meta e Google), períodos comparados
   e "nada foi alterado ainda".
2. Ordem dos clientes: primeiro quem tem problema que custa dinheiro hoje, depois quem pede ajuste
   na semana, por último os estáveis. Numerar os blocos (1, 2, 3…).
3. Cada bloco segue este molde:

   ```markdown
   ## 1. Fátima Criança: agir hoje
   Semana R$ 219,81 (Meta) · saldo pré-pago R$ 210 (~7 dias)

   **Desde a última revisão:** o que foi aplicado ou ficou para conferir, número de antes e de
   agora, e se funcionou. Sem nada pendente, omitir a linha.

   **Como está:** cada campanha com gasto (Meta e Google), custo por resultado em 30/14/7/3 dias,
   veredito (tendência, oscilação, volume pequeno) e o fator que puxou (custo por mil, taxa de
   cliques ou conversão do clique). Fadiga aponta o anúncio pelo nome. Mudança feita pelo Douglas,
   por outra pessoa ou por regra automática entra aqui como explicação.

   **Proposta:**
   - **A.** ação pela API, com o valor de antes e o de depois e o motivo em números.
   (ou "Manter", com o número que justifica)

   **Criativos:** o que produzir aqui ou pedir, com briefing curto (ângulo, oferta, formato,
   o que falta). Sem necessidade, dizer por quê em meia linha.

   **Depende de você:** vídeo para gravar, conversa com o cliente, decisão de verba.
   ```

   - Situação no título: `agir hoje`, `ajustar` ou `manter`.
   - As letras das propostas seguem de um cliente para o outro (A, B no primeiro, C no segundo…),
     para o Douglas responder só com as letras.
   - Linha sem conteúdo some (sem "Depende de você: nada").
4. Cliente estável sem nada a propor: bloco curto (título, semana, uma ou duas linhas de "Como
   está" e "Manter"). Todo cliente da carteira aparece, inclusive os sem gasto.
5. Cliente ativo sem gasto com campanha ligada (ex.: Agari no Google) é problema e vai no bloco
   dele, com o motivo que o Google ou a Meta mostram.
6. Escalar só se `regras-vigentes.md` permitir, e dentro do bloco do cliente.
7. Fechamento: índice de uma linha por letra (`A · Fátima Criança · pausar Criciúma`) e a
   pergunta "Quais aplico?".

### 6. Aplicar só o que foi aprovado

- Meta: `meta-ads-ratos/scripts/update.py` (ler `meta-ads-ratos/aprendizados.md` antes).
  Orçamento vai em centavos (`--daily-budget 2000` = R$ 20).
- Google: `google-ads-ratos/scripts/update.py` (ler `google-ads-ratos/aprendizados.md` antes).
- Depois de cada mudança, ler de volta o objeto e confirmar o valor novo. Anúncio ativado: ler
  `effective_status` e `issues_info` uns 60 s depois.
- Quando o Douglas der uma decisão que vale para as próximas revisões ("sem escala por
  enquanto", "não mexe na Entretec até o dia X"), registrar em `regras-vigentes.md` com a data.

### 7. Tarefas no gestor

Usar a skill `tarefas` (conector `supabase-app`). Para cada ação que depende do Douglas
(criativo, vídeo, avaliar de novo):

- Lista "Gestão de Tráfego" do cliente; entrega no **próximo dia de otimização** (segunda,
  quarta ou sexta), salvo se o Douglas der outra data.
- Os números da revisão vão na descrição.
- Se já houver tarefa aberta parecida, comentar nela em vez de criar outra.

### 8. Registrar no histórico

Criar `historico/AAAA-MM-DD.md` (data de hoje) com este formato:

```markdown
# Revisão AAAA-MM-DD

Períodos: anterior X a Y, atual Z a W. Contas com gasto: N Meta, M Google. Gasto da semana: R$ ...

## Aplicado
| Conta | Mudança | Antes | Depois | Motivo |

## Proposto e não aplicado
| Conta | Proposta | Decisão do Douglas |

## Tarefas lançadas
- Cliente: título (entrega DD/MM)

## Conferir na próxima revisão
- Conta: o que olhar e qual número esperar (ex.: Fabioli, custo por conversa abaixo de R$ 12 com orçamento de R$ 20)
```

Se a revisão parar no meio (o Douglas não respondeu), registrar mesmo assim com o que foi
proposto, marcando "sem resposta".

### 9. Por último: concluir as tarefas de otimização diária

É o fechamento da revisão, depois de aplicar, lançar tarefas e registrar o histórico. Cada
cliente tem na lista "Gestão de Tráfego" uma tarefa recorrente de revisão (ex.: "Revisão diária
de orçamento e performance"). Concluir a de todo cliente revisado, com entrega até hoje:

```sql
select v.id, v.titulo, v.projeto_nome, v.lista_nome, v.data_entrega, v.dias_atraso
from tarefas.tarefas_visao v
where v.situacao <> 'concluida' and v.projeto_nome <> 'Modelos'
  and v.lista_nome = 'Gestão de Tráfego'
  and (v.titulo ilike '%revis%' or v.titulo ilike '%otimiza%')
  and v.data_entrega <= current_date
order by v.projeto_nome, v.data_entrega;
```

- Conferir a lista com o Douglas só se aparecer tarefa que não é a recorrente de revisão (título
  diferente, sem recorrência); a recorrente se conclui direto, com o `update` da skill `tarefas`.
  Concluir gera a próxima sozinho.
- Recorrente atrasada se conclui do mesmo jeito: a próxima nascer atrasada é decisão do Douglas.
- Cliente revisado sem tarefa de revisão: avisar no fim, sem criar.
- Terminar com a lista do que foi concluído (cliente e título) e anotar no histórico, na seção
  "Tarefas lançadas".
- Sem o conector `supabase-app` na conversa, não há outro caminho: avisar o Douglas, anotar
  "tarefas de revisão não concluídas (sem conector)" no histórico e concluir na próxima conversa
  que tiver o conector.

## Cuidados

- Os scripts reaproveitam as credenciais de `meta-ads-ratos` e `google-ads-ratos`. Se uma
  coleta falhar por token, o erro aparece no topo da conta em `analise.txt`; seguir com a outra
  plataforma e avisar.
- Na API v25 do Google não existe `campaign.start_date`.
- O campo `results` da Meta usa o indicador da meta de desempenho de cada conjunto. Campanhas
  diferentes da mesma conta podem contar coisas diferentes (conversa, cadastro, clique no
  WhatsApp). Não somar resultados de tipos diferentes sem dizer.

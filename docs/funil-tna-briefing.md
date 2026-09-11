# Funil de captação da The New Ads: briefing técnico

Documento de contexto para discutir visualizações e análises avançadas. Descreve
o negócio, a estrutura de aquisição, o modelo de dados, o que o dashboard já faz
e quais são as restrições reais que qualquer proposta precisa respeitar.

Data: 11/09/2026.

---

## 1. O negócio e a restrição que domina tudo

The New Ads é uma agência de marketing de performance (Google Ads, Meta Ads,
tracking, landing pages, automações). O funil descrito aqui é o funil de captação
de clientes da própria agência, não o de um cliente.

Modelo de receita: fee mensal de **R$ 1.500**, contrato mínimo de **4 meses**.
Valor de um cliente fechado, portanto, **R$ 6.000**. O dono pretende subir para
R$ 2.000 mensais, mas o número em uso hoje é R$ 1.500.

Investimento em mídia: **R$ 33 por dia**, cerca de R$ 1.000 por mês.

Essa verba é a restrição que governa todo o resto. Em oito semanas ela produz
algo como 540 cliques, 68 leads, 14 leads dentro do perfil, 6 reuniões marcadas,
3 realizadas e 2 contratos. Qualquer análise abaixo do topo do funil opera com
amostras de um dígito.

Consequência metodológica assumida: **decisão de mídia se toma no topo do funil,
semanalmente; decisão de oferta e nicho se toma no fundo, trimestralmente.**
Taxas de conversão do fundo não são lidas semanalmente porque variar de 1 para 2
contratos é 100% de variação e não significa nada.

---

## 2. Estrutura de aquisição

**Plataforma:** Meta Ads apenas, por enquanto. Conta `act_1294794972320882`.

**Estrutura 1-1-X:** uma campanha, um conjunto de público amplo, seis anúncios.
Nicho e formato vivem no nível do anúncio, nunca em conjuntos separados, porque
com verba baixa dividir conjunto trava o aprendizado e fragmenta o sinal de
conversão.

- Campanha: `SITE_SETEMBRO_26_CBO_LEAD_VENDAS_F_MULTINICHO`, objetivo Vendas, CBO
- Conjunto: `00_AUTO_ABERTO_GERAL_25_A_65`, Advantage+, público aberto
- Evento de otimização: **Lead** (dispara no passo 3 do formulário, quando entra o
  telefone). Escolhido em vez de CompletouFormulario porque com essa verba o
  evento mais raro não daria sinal suficiente para sair do aprendizado

**Três nichos**, cada um com dois criativos:

| nicho | anúncios | cor da página |
|---|---|---|
| `vet` (clínicas e hospitais veterinários) | AD01, AD02 | teal |
| `eventos` (buffets, espaços, som, decoração, cerimonial) | AD03, AD04 | roxo |
| `generico` (negócio local em geral) | AD05, AD06 | laranja |

**Uma única página que varia por UTM.** Não existe uma landing por nicho. O
arquivo `formulario.html` carrega um objeto `NICHOS` e monta headline, bullets,
filtro, cores e mensagem de WhatsApp antes do primeiro paint, a partir do
parâmetro `?nicho=`. Nicho inválido ou ausente cai no genérico.

Decisão relevante: **o nicho vai na URL do site, não nos parâmetros de UTM.** O
nome do anúncio serve para relatório, nunca para roteamento, de modo que errar o
nome de um criativo não manda a pessoa para a página errada.

**Padrão fixo de UTM** (campo "Parâmetros de URL" no gerenciador):

```
utm_source=Meta_ads
utm_medium={{adset.name}}
utm_campaign={{campaign.name}}
utm_content={{ad.name}}
posicionamento={{placement}}
ad_id={{ad.id}}
```

---

## 3. O funil, degrau a degrau

```
clique no anúncio            (Meta, tabela tna_meta)
  -> form_view               chegou na página do formulário
  -> form_start              clicou em "quero agendar uma reunião"
  -> form_step 1..6          cada pergunta respondida
  -> lead                    passo 3, entrou o telefone  [evento de otimização]
  -> form_complete           respondeu as seis
  -> (filtro de perfil)      qualificado / desqualificado
  -> scheduler_view          abriu a tela de agenda em /agendar
  -> slot_selected           escolheu um horário
  -> schedule                confirmou a reunião
  -> reunião realizada ou no-show
  -> proposta enviada
  -> contrato
```

**Seis perguntas, nesta ordem:** nome, e-mail, WhatsApp, já investe em tráfego
pago, faturamento mensal, verba mensal de mídia. A pergunta sobre nome da empresa
foi removida para reduzir atrito; o nome da empresa é preenchido à mão no painel.

Faixas de faturamento: até 30k / 30 a 69k / 70 a 199k / 200 a 499k / 500k ou mais.
Faixas de verba: até 1k / 1,1 a 3k / 3,1 a 10k / 10,1 a 30k / acima de 30k.
As faixas não se sobrepõem porque R$ 70 mil é o corte declarado da qualificação.

**Desfecho:** qualificado é redirecionado para `/agendar` (agenda própria
integrada ao Google Calendar). Desqualificado recebe uma mensagem e um botão de
WhatsApp oferecendo apenas serviço de trackeamento.

### Divergência conhecida na regra de qualificação

A página anuncia "exclusivo para empresas que faturam a partir de R$ 70 mil por
mês", mas a regra implementada é um **E**, não um **OU**:

```js
desqualificado = faturamento < 70k  E  verba <= R$ 1 mil
```

Ou seja, quem fatura R$ 40 mil mas declara verba de R$ 3 mil **passa** e vai para
a agenda. O campo `qualificado` no banco é exatamente a negação dessa regra.

Isso importa para qualquer análise: `qualificado = true` significa "não foi
barrado pela regra E", não "fatura 70k ou mais". Quem for propor métricas de
qualidade de lead deve considerar segmentar por faixa de faturamento diretamente,
em vez de confiar no booleano.

---

## 4. Modelo de dados

Banco: **Supabase (Postgres 17)**, projeto `iklynyncffneuvutvgxa`.

### Decisão de arquitetura central

A escada inteira é gravada pelas próprias páginas no Supabase, via endpoint
`/api/evento` (Cloudflare Pages Function). O **GTM continua existindo**, mas só
alimenta Meta e Google.

Motivo: antes, o topo da escada só existia no GA4 e na Meta, e a metade de baixo
só no Supabase. Funil montado com as duas fontes nunca fecha, porque bloqueador,
consentimento e amostragem derrubam apenas uma delas, produzindo taxa de passagem
acima de 100%. **Uma fonte para decidir verba, outra para otimizar plataforma,
nunca as duas no mesmo gráfico.**

O `PageView` do GTM segue disparando em todas as páginas de propósito: restringi-lo
à tela de entrada mataria o público de remarketing do resto do site e tiraria
sinal do Advantage+, que é o que sustenta a entrega com verba baixa.

### Tabelas

**`funil_eventos`** (a escada)

| coluna | nota |
|---|---|
| `visitor_id` | UUID gerado no navegador, guardado em localStorage, **compartilhado entre `/formulario` e `/agendar`**, o que fecha a escada de ponta a ponta |
| `tipo` | form_view, form_start, form_step, lead, form_complete, scheduler_view, slot_selected, schedule |
| `passo` | 1 a 6, só quando tipo = form_step |
| `lead_id` | preenchido a partir do momento em que o lead existe |
| `dia` | data no fuso de São Paulo, não UTC |
| `nicho`, `utm_*`, `utm_placement`, `ad_id`, `ip`, `user_agent` | contexto |

Índice único em `(visitor_id, tipo, passo, dia) nulls not distinct`. Recarregar a
página ou voltar um passo não conta de novo.

**`funil_leads`**

Contato, respostas do formulário (`faturamento`, `verba`, `ja_investe`),
`qualificado`, `etapa` atual, `nicho`, todos os identificadores de clique
(`ad_id`, `utm_*`, `fbp`, `fbc`, `fbclid`, `gclid`), `fee_mensal`,
`meses_previstos`, `valor_contrato`, `fechado_em`, e marcações de envio para a
CAPI da Meta.

**`funil_etapas_log`**

Histórico de mudança de etapa, alimentado por trigger em `funil_leads`
(`lead_id`, `de`, `para`, `em`). Existe porque `etapa_atualizada_em` é
sobrescrito a cada mudança e só guardava o estado atual, impossibilitando medir
tempo em etapa, velocidade e coorte.

**`funil_agendamentos`**

`lead_id`, `inicio`, `fim`, `google_event_id`, `meet_link`, `situacao`
(`agendado`, `realizada`, `no_show`, `cancelada`), `compareceu_em`.

**`tna_meta`** (investimento)

Uma linha por dia e por anúncio: `data`, `source_id`, `campanha`,
`conjunto_anuncio`, `anuncio`, `investimento`, `impressoes`, `cliques_no_link`,
`alcance`, `ctr`, `cpc`, `cpm`, `frequencia`. Preenchida por um sincronizador
genérico que já roda para todos os clientes da agência.

### A chave de junção é o ad_id, nunca o nome

`tna_meta.source_id` é o ID numérico do anúncio, o mesmo que `{{ad.id}}` manda na
URL e que é gravado em `funil_leads.ad_id`.

O nome não serve como chave. Caso real de outra conta: um anúncio chamado
`AD04_C_01_VD_CÂMERA_OSCAR` vira `%C3%82` na URL, o `utm_content` do lead nunca
casa com o `anuncio` da tabela de investimento, e o CAC daquele criativo dá
infinito em silêncio. `utm_content` fica como rótulo legível e plano B.

### Etapas do kanban

`novo` → `agendou` → `qualificado` → `reuniao` → `proposta` → `cliente`, mais as
saídas `no_show`, `perdido` e `desqualificado`.

Mover o card para "Reunião feita" grava `situacao = realizada` no agendamento;
mover para "No-show" grava `no_show`. A coluna do kanban é o registro de presença,
sem botão separado.

---

## 5. Estado atual dos dados

**Não há tráfego real ainda.** A campanha não foi ligada.

O banco contém uma **simulação de 8 semanas** marcada com `simulado = true` em
todas as tabelas, gerada a partir de probabilidades por nicho, com timestamps
coerentes e progressão realista. Serve para validar o dashboard. O dashboard tem
um botão que inclui ou exclui esses dados.

Volumes da simulação:

| degrau | visitantes únicos |
|---|---|
| cliques | 539 |
| form_view | 442 |
| form_start | 134 |
| lead (passo 3) | 68 |
| form_complete | 45 |
| dentro do perfil | 14 |
| scheduler_view | 12 |
| marcou | 6 |
| compareceu | 3 |
| proposta | 2 |
| contrato | 2 |

Investimento total: R$ 1.847,77. CPL R$ 27. CPL qualificado R$ 132. Custo por
reunião realizada R$ 616. CAC R$ 924. LTV/CAC 6,5x. No-show 50%.

Por nicho, o ponto mais interessante: o CPL bruto dos três é praticamente igual
(R$ 26 a R$ 29), mas a taxa de qualificação vai de 41% no vet a 5% em eventos, o
que faz o CPL qualificado ir de R$ 65 a R$ 609.

---

## 6. O que o dashboard faz hoje

Página única em `/funil/analytics`, autenticada, tema escuro, Chart.js 4.

**Filtros:** nicho (todos, vet, eventos, genérico), janela (7, 28, 56 dias, tudo),
e o botão de dados simulados. Tudo recalcula no cliente.

**Coorte:** sempre pela data de criação do lead, nunca pela data da conversão.
Lead de setembro que fecha em novembro é performance de setembro.

### Bloco de leitura automática

Gera quatro parágrafos em português, recalculados a cada mudança de filtro:
situação, vazamento mais caro, decisão da semana, e o que ainda não dá para
decidir. O último bloco existe para impedir ação sobre número que ainda é sorte.

### Matemática implementada

- **Intervalo de Wilson** em toda taxa de conversão. Com 15 pessoas, uma taxa de
  20% tem intervalo de 7% a 45%, e o intervalo normal passaria de 100%
- **Teste z de duas proporções** para comparar nichos. Só afirma diferença quando
  p < 0,05; caso contrário informa **quantos leads por nicho ainda faltam** para
  conseguir afirmar (cálculo de tamanho amostral com poder de 80%)
- **Probabilidade de ser o melhor** por posterior Beta com prior uniforme, por
  Monte Carlo (15.000 sorteios, amostrador Gamma de Marsaglia e Tsang). Reporta
  "vet tem 71% de chance de ser o melhor" em vez de "vet converte 22%"
- **Ranking de vazamento por impacto em reais**, não por porcentagem:
  `(referência - taxa real) x volume que entra no degrau x conversão daquele
  degrau até o contrato x R$ 6.000`. Um degrau com queda de 60% que recebe 4
  pessoas vale menos que um com queda de 15% que recebe 200
- **Carta de controle** no CPL qualificado semanal, média com dois desvios
- **Medianas, nunca médias**, para tempo de etapa, mais a contagem de leads ainda
  abertos além da mediana, para corrigir o viés de sobrevivência

Referências de mercado usadas enquanto não há histórico próprio: clique→visita
85%, visita→início 35%, início→telefone 55%, telefone→completo 75%,
qualificado→agenda 90%, agenda→marcou 65%, marcou→compareceu 75%,
compareceu→proposta 70%, proposta→contrato 30%.

### Visualizações

| gráfico | tipo |
|---|---|
| Funil completo, clique a contrato | SVG, trapézios de largura proporcional |
| Volume e investimento por dia | barras + linha de média móvel 7d + linha de gasto em segundo eixo |
| Leads por nicho | rosca |
| Qualificação por nicho | barras empilhadas |
| CPL qualificado por semana | linha com faixa de controle de dois desvios |
| Leads por semana e nicho | barras empilhadas |
| Vazamento por impacto | barras horizontais em reais |
| Faturamento, verba, já investe | três roscas |
| Chegada do lead | mapa de calor, dia da semana x faixa de 3 horas |
| Posicionamento | barras horizontais |
| Tempo mediano por etapa | barras horizontais |

Mais três tabelas: nichos lado a lado, criativos (CTR, CPC, frequência, CPL
qualificado), e degraus contra a referência com intervalo de confiança.

Oito KPIs no topo, três deles com sparkline: investido, leads, CPL qualificado,
custo por reunião, no-show, CAC, LTV/CAC, receita fechada.

---

## 7. Limitações reais, que qualquer proposta precisa respeitar

1. **Amostra minúscula no fundo do funil.** 2 a 6 observações. Qualquer
   visualização que sugira precisão no fundo (linha de tendência de taxa de
   fechamento, previsão mensal de receita, comparação de CAC entre nichos) vai
   induzir decisão errada. Propostas precisam carregar incerteza explícita.
2. **Sem custo no nível da sessão.** O investimento chega agregado por dia e por
   anúncio. Não existe custo por visitante individual, então qualquer análise que
   exija valor monetário por sessão precisa de rateio, e o rateio precisa ser
   declarado.
3. **Sem histórico próprio.** As referências são de mercado. Não há base para
   sazonalidade, nem para modelo que precise de série longa.
4. **Uma plataforma só.** Sem Google Ads, sem orgânico, sem e-mail. Nada de
   modelo multicanal ou de atribuição comparativa por enquanto.
5. **`visitor_id` é por navegador.** Trocar de aparelho quebra a identidade. A
   ponte entre formulário e agenda funciona porque é a mesma origem e o mesmo
   navegador.
6. **Não existe evento de saída.** Sabemos qual foi o último degrau alcançado,
   mas não temos tempo na página, rolagem, nem foco de campo, então análise de
   abandono dentro de uma pergunta específica hoje é impossível.
7. **O booleano `qualificado` é mais frouxo que o filtro anunciado**, conforme a
   seção 3.

## 8. Perguntas em aberto para discussão

- Que visualizações fazem sentido com n entre 2 e 70, sem sugerir falsa precisão?
- Como representar incerteza de forma legível para alguém que decide rápido, sem
  virar aula de estatística?
- Vale um modelo bayesiano hierárquico entre nichos, tomando emprestada força
  entre eles nos degraus de baixo, em vez de tratar cada nicho como independente?
- Faz sentido alguma forma de análise de sobrevivência para o tempo até o
  fechamento, dado que a maioria dos leads está censurada à direita?
- Como montar uma visão de coorte semanal útil quando cada coorte tem 8 leads?
- Existe uma visualização melhor que a carta de controle para decidir "mexer ou
  não mexer na campanha esta semana" com dado tão escasso?

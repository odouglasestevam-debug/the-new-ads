# Arcan adaptado para Thenewads

Esta é a versão que parte de `arcan.json` e faz inclusões e substituições nele. Ela substitui a proposta anterior da pasta `gtm-arcan-meu`, que partia do arquivo errado para o pedido.

## Arquivos

- `GTM-Arcan-adaptado-Thenewads.json`: cópia completa da Arcan adaptada ao projeto Thenewads.
- `alteracoes.csv`: lista de substituições e inclusões.
- `eventos.csv`: nomes do dataLayer, GA4, API e Meta por etapa.
- `mapa-de-nomes.csv`: nomes originais e padronizados de tags, acionadores e pastas.
- `validacao.json`: resultados da verificação estática.
- `build_arcan.py`: reprodução da adaptação a partir de `arcan.json` e `meu.json` em Downloads.

## Base preservada

Foram mantidos os quatro modelos com seus códigos originais, as variáveis integradas e todos os itens originais da Arcan. As tags existentes preservam seus tipos, acionadores associados e frequência de execução. A padronização posterior alterou apenas nomes de exibição e organização em pastas; nomes de variáveis e nomes dos eventos enviados continuam preservados em relação à adaptação descrita abaixo.

Tags seguem o padrão de `meu.json`: `NN | FB | Evento`, `NN | API | evento` e `NN | GA4 | evento`. Exemplos: `03 | FB | Lead` e `03 | API | generate_lead`. Os nomes de exibição das tags API seguem os do seu arquivo; os nomes efetivamente enviados continuam na tabela abaixo. Acionadores do funil seguem `NN | CE | Evento`; acionadores de página usam `PV`. Os acionadores antigos específicos da Arcan recebem o sufixo `(legado)`, sem alteração de condições.

Todos os itens estão distribuídos em nove pastas: `🆔 Identificacao`, `🟧 GA4`, `🟦 FB`, `🧠 API`, `👤 User`, `🍪 Cookies`, `🔨 Tools`, `🎯 Google Ads` e `⚡ Acionadores`. As pastas correspondentes ao seu arquivo usam os mesmos nomes; as categorias adicionais seguem o mesmo estilo. A organização e a estrutura funcional foram mantidas.

O PageView continua na inicialização, como na Arcan. A tag Google continua enviando o PageView automático; não foi criada uma segunda tag GA4 PageView. O gerador `api-event_id`, os fallbacks `user-consulta-*` e a persistência de UTMs da Arcan foram mantidos. Não foi criado um modelo Meta personalizado, nem aplicada a estrutura do arquivo `meu.json` à base.

## Substituições

- `id-meta ads` e `id-meta ads locação`: ambos agora contêm `1201799435144627`. O nome legado da segunda variável foi mantido para preservar as referências.
- `id-ga4`: `G-TMR9WZ8R66`.
- `api-transport_url`: `https://qwxjecql.sar.stape.io`.
- `Id-Visitor-api`: valor correspondente de `meu.json`; a tag Visitor API continua usando o modelo e o acionador da Arcan.
- Seletores das variáveis de entrada: `nome`, `email` e `telefone`, conforme `meu.json`. A variável de nome completo da Arcan também foi adaptada para `nome`.
- Variáveis de cookies, geolocalização e outras definições correspondentes foram atualizadas com os valores do seu arquivo. As variáveis novas necessárias foram acrescentadas. Nomes equivalentes usam os slots existentes da Arcan, sem duplicar variáveis de Pixel/GA4/servidor/event ID.
- HTMLs de cookies do lead e geolocalização: substituídos pelos do seu arquivo, nos slots originais da Arcan. Todos esses cookies usam `.thenewads.com.br`, incluindo a substituição do placeholder `.111.com.br` do primeiro nome.
- O acionador existente `Lead (lp)` passou a ouvir `Lead`, com maiúscula, como no dataLayer do seu projeto. As tags que o usam continuam associadas ao mesmo acionador.

## Inclusões

Foram acrescentados cinco acionadores e quinze tags por cópia das tags existentes da Arcan: uma tag GA4, uma API e uma Meta por nova etapa.

| dataLayer | GA4 | API enviada ao servidor | Pixel navegador |
| --- | --- | --- | --- |
| Inicialização da Arcan | page_view automático | PageView | PageView |
| Lead | generate_lead | Lead | Lead |
| IniciouFormulario | form_start | ViewContent | ViewContent |
| CompletouFormulario | form_submit | CompleteRegistration | CompleteRegistration |
| scheduler_view | scheduler_view | SchedulerView | SchedulerView |
| scheduler_slot_selected | slot_selected | SlotSelected | SlotSelected |
| Schedule | schedule | Schedule | Schedule |

Os nomes da API seguem o padrão da Arcan, com nomes Meta explícitos. Isso difere dos nomes enviados pelas tags API do `meu.json` original. O container servidor precisa aceitar esses nomes e preservá-los no envio ao Meta. Sem o JSON do servidor não foi possível verificar essa compatibilidade; conferir no Preview do servidor antes da publicação. As tags Meta e API de cada etapa compartilham acionador e `{{api-event_id}}`.

Nas novas tags, as fontes de dados de usuário por etapa foram adaptadas do seu arquivo: campos do formulário nas primeiras etapas e cookies nas etapas de agendamento. O restante da arquitetura das tags foi copiado da Arcan.

## Itens legados mantidos e pausados

Não havia equivalentes em `meu.json` para as tags Google Ads e o webhook da Arcan. Elas foram preservadas e pausadas: `03 | Google Ads | Lead`, `00 | Google Ads | Vinculador de conversoes`, `01 | Google Ads | PageView`, `00 | Google Ads | Configuracao` e `00 | Webhook`.

Os valores antigos dessas integrações e acionadores legados sem uso permanecem no arquivo para conservar a estrutura. Não reative essas tags sem substituir os destinos pelos do seu projeto. A opção padrão foi manter os itens pausados, conforme informado durante a montagem.

## Como revisar

1. Use este JSON como referência em um container WEB vazio sem instalar seu snippet no site, ou revise a importação em um workspace de teste.
2. Para substituições individuais, copie as configurações necessárias para o container que executa no site e pause a versão anterior da mesma tag durante a comparação.
3. Ao importar no seu container existente, revise o resumo: nomes diferentes podem adicionar tags em vez de substituir. Um workspace novo não é um container vazio.
4. Abra uma nova sessão do Preview e confira os eventos personalizados reais, os valores dos inputs, a gravação dos cookies e os disparos.
5. Confira o Preview do servidor para os nomes da coluna API; confira o Pixel no navegador e a origem dos eventos no Meta.

Esta cópia não adiciona código ao site para gerar eventos do dataLayer. Depende dos eventos que o seu site já publica. Também não muda configurações OpenBridge ou integrações dentro do Meta.

## Validação realizada

30 tags (25 ativas e 5 pausadas), 49 variáveis, 17 acionadores, 9 pastas e 4 modelos. Verificados: preservação da estrutura funcional da Arcan, manutenção dos modelos originais, presença de todas as variáveis do seu arquivo por nome ou correspondente, integridade das referências, pares Meta/API com nomes e IDs iguais e JSON parseável. A etapa de organização foi comparada com a adaptação anterior e só mudou nomes de exibição e pastas. Todas as tags, variáveis e acionadores possuem uma pasta válida.

Não houve importação no GTM, publicação, execução no navegador nem envio de eventos. O arquivo é uma adaptação revisável, não uma confirmação de correção do problema de recebimento.

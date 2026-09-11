# Variante com Facebook Pixel by Stape

Arquivo: `GTM-Arcan-adaptado-Thenewads-STAPE.json`.

O container adaptado foi copiado para um arquivo separado e as sete tags FB foram convertidas para o modelo `Facebook Pixel by Stape` que já estava incluído no container. O arquivo sem o sufixo STAPE continua intacto.

## Advanced Matching

Os dados definidos por tag foram transferidos de `advancedMatchingList` para `userDataList`. As variáveis de origem são exatamente as mesmas: nome (`fn`), sobrenome (`ln`), e-mail (`em`), telefone (`ph`), cidade (`ct`), estado (`st`), país e identificador externo (`external_id`), conforme os campos presentes em cada tag. A chave de país `cn` foi adaptada para `country`, que é a chave aceita pela Stape. Nenhum campo ausente foi acrescentado às etapas que não o utilizavam.

O mapa completo por tag está em `stape-advanced-matching.csv`.

- Advanced Matching permanece habilitado.
- Mapeamento automático de dados do dataLayer fica desabilitado, para usar apenas os campos explicitamente definidos.
- Event Enhancement fica desabilitado, evitando introduzir uma nova persistência de dados em localStorage. Os cookies e variáveis existentes foram preservados.
- `Run the init command only once` fica desabilitado. Assim o modelo Stape pode encaminhar dados que se tornam disponíveis depois do PageView, ao preencher o formulário. Isso é uma diferença de execução entre os modelos; não significa adicionar novas fontes de dados.
- Event Name Setup Method fica em `Override`, com os mesmos nomes padrão/personalizados do arquivo de origem.
- Pixel ID, Event ID, consentimento manual e opções de configuração automática/histórico foram mapeados para os campos equivalentes.
- Parameter Builder SDK está habilitado, conforme o padrão do modelo Stape incluído. O modelo anterior também tem integração com Parameter Builder, mas a implementação e o carregamento diferem entre os modelos.

## Preservado

Nomes das tags, pastas, acionadores, variáveis, IDs dos itens, condições, frequência de disparo, tags API/GA4, HTMLs e cookies. Google Ads e webhook continuam pausados. A conversão substitui o tipo das sete tags existentes; não cria uma segunda série de tags FB.

## Uso

Este é um container completo. Revise a importação em um workspace de teste. Se o GTM informar conflitos, confira se as sete tags FB serão substituídas, evitando manter duas versões ativas da mesma ação. Atualizar o tipo da tag não remove integrações já configuradas no próprio Pixel, como OpenBridge.

No Preview, confira o campo `User Data` da tag e os valores das variáveis no evento correspondente. Depois confira o envio real e o recebimento pelo Meta. Preservar os mapeamentos não garante que um input exista ou que um cookie contenha um valor em todas as páginas.

Validação estática realizada: sete tags convertidas, chaves aceitas pelo modelo incluído, variáveis de cada linha de matching preservadas, nomes de evento e ID preservados, demais itens idênticos e JSON parseável. Não houve importação no GTM, publicação ou teste real de eventos.

Reprodução: `python gtm-arcan-adaptado/build_stape.py`, após gerar ou atualizar o JSON de origem.

Verificação adicional: `node gtm-arcan-adaptado/verify_stape.cjs`. O código real do modelo Stape foi executado 14 vezes com APIs do GTM simuladas (duas por tag), confirmando as chamadas de evento, Pixel ID, event ID e dados de usuário, inclusive dados que mudam após a primeira inicialização. A comparação integral confirmou que somente `type` e `parameter` das sete tags FB diferem do container original. Essa simulação não substitui a importação no GTM e o teste no navegador.

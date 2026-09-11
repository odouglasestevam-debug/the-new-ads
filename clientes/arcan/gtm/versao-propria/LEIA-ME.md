# Referência WEB: modelo Arcan com os eventos do Meu

Este pacote usa as 26 tags, 32 variáveis, 10 acionadores e 5 pastas de `meu.json`. As sete tags Meta usam uma cópia local do modelo Meta Pixel 2.0.3 extraído de `arcan.json`. Os arquivos originais não foram modificados.

## Arquivos

- `GTM-WEB-Arcan-com-eventos-Meu.json`: container WEB completo, com nomes padronizados.
- `Meta-Pixel-Arcan-2.0.3.tpl`: somente o modelo para substituir tags individualmente.
- `mapa-de-nomes.csv`: correspondência entre nomes antigos e novos.
- `validacao.json`: resultados das verificações estáticas e hashes dos arquivos.
- `build_template.py`: script que reproduz os arquivos a partir dos dois JSONs originais.

## O que mudou

Tags seguem `[Canal] NN | Nome`, por exemplo `[Meta Ads] 03 | Lead`, `[API] 03 | generate_lead` e `[GA4] 03 | generate_lead`. Acionadores seguem `[Evento] NN | Evento` ou `[Pagina] NN | Condicao`. As cinco pastas existentes receberam nomes sem emojis, com prefixos numéricos; as tags foram agrupadas por canal ou função.

O modelo adicionado se chama `Meta Pixel | Referencia Arcan 2.0.3`. Seu código, campos e permissões são idênticos aos do modelo usado pela Arcan. Apenas a identidade do modelo foi ajustada para mantê-lo separado do modelo compartilhado da galeria. O modelo Meta original continua disponível no JSON, sem alteração. A cópia local não recebe atualizações automáticas da galeria.

## O que foi preservado

Nomes e definições das 32 variáveis; Pixel `1201799435144627`; ID do GA4; URL do servidor; ID da Visitor API; nomes dos eventos enviados; parâmetros de dados; geração do event ID; condições dos acionadores; frequência de disparo; consentimento; scripts HTML e cookies. Nenhum Pixel, webhook, tag Google Ads ou formulário específico da Arcan foi transferido.

As dependências funcionais do seu container foram mantidas. A alteração de comportamento pretendida é exclusivamente usar o código do modelo Meta da Arcan nas tags Meta. Esta versão não é uma reprodução integral do container Arcan: ela conserva a estrutura e os eventos do seu projeto, como solicitado.

## Para substituir uma tag de cada vez

1. No container WEB, crie um workspace de teste baseado na versão que você está usando.
2. Em Modelos > Modelos de tag > Novo, abra o menu do editor e importe `Meta-Pixel-Arcan-2.0.3.tpl`. Salve como `Meta Pixel | Referencia Arcan 2.0.3`.
3. Registre os valores da tag que será testada. Troque seu tipo para esse novo modelo e confira todos os campos; não presuma que o GTM transferiu os campos automaticamente.
4. Para ViewContent, use Pixel `{{0 | FB - Pixel}}`, evento padrão `ViewContent`, Event ID `{{event_id}}` e o acionador existente `IniciouFormulario`. Replique os parâmetros de correspondência avançada e a configuração de consentimento da tag original.
5. Se preferir criar uma segunda tag em vez de editar a existente, pause a tag substituída durante o teste para evitar dois disparos da mesma ação.
6. Abra uma nova sessão de Preview e recarregue a página. Confira o disparo, a requisição de rede e o recebimento no Meta. Para testar desduplicação, reative a tag API correspondente, se ela estiver pausada, e compare nome e ID finais no Meta.
7. Publique apenas a alteração que tiver validado. Nenhuma publicação foi feita por este pacote.

## Para consultar o container completo

Importe `GTM-WEB-Arcan-com-eventos-Meu.json` em um container WEB vazio, sem instalar seu snippet no site. Use-o como referência para copiar as configurações necessárias. Assim você consegue revisar tudo sem somar as 26 tags às tags que já executam no site.

O JSON completo mantém os disparos ativos do arquivo de origem. Não o mescle diretamente no container ativo sem revisar o resumo da importação: nomes novos podem criar tags adicionais. Um novo workspace, sozinho, não é um container vazio; ele também contém as tags existentes.

Documentação de importação: https://support.google.com/tagmanager/answer/6106997?hl=pt-BR

## Pontos preservados para não alterar sua estrutura

- O PageView continua dependendo de `gtm.dom` ou `visitor-api-success` e da condição sobre o estado geográfico.
- `LeadFirstName` continua usando o domínio `.111.com.br` no HTML original. Esse domínio merece correção posterior, mas não foi alterado neste pacote de comparação.
- As tags API continuam enviando `form_start`, `generate_lead`, `form_submit`, `scheduler_view`, `slot_selected` e `schedule`; as tags Meta enviam seus nomes correspondentes originais. O mapeamento final para o Meta depende do container servidor, que não foi fornecido.
- As tags Meta continuam com uma execução por carregamento da página.
- `meu.json` foi exportado em 2026-09-10 21:44:49 UTC e não contém as mudanças posteriores relatadas na conversa. Este pacote parte desse arquivo, não de uma versão publicada que não foi acessada.
- A integração OpenBridge configurada no próprio Pixel não é removida por este arquivo.

## O que a validação confirma

JSON parseável; quantidades e IDs preservados; referências de variáveis e acionadores preservadas; parâmetros e scripts das tags preservados; existência dos modelos usados; código, permissões e campos do modelo local iguais aos da Arcan. A importação real no GTM e o recebimento de eventos não foram testados, pois este trabalho só gera arquivos locais.

## Relação com o container servidor

Um modelo Meta no servidor pode afetar o recebimento via CAPI, o Pixel de destino, nomes, IDs e desduplicação. Na arquitetura deste JSON, o envio direto do Pixel pelo navegador é independente da tag CAPI no servidor. Uma falha nessa tag CAPI não explica, por si só, a ausência da requisição direta do Pixel. Gateways, carregamento de scripts ou configurações de supressão podem criar dependências adicionais que precisam de análise própria.

Referência: https://developers.google.com/tag-platform/tag-manager/server-side/intro

# Arcan TCG · estudo da home

Abra `index.html` diretamente no Chrome ou Edge. Não precisa de instalação, servidor, internet ou comando de build: imagens, fontes, CSS e JavaScript estão locais.

## O que avaliar

- Cores, tipografia, presença da marca e destaque das cartas.
- Busca e categorias, vitrine de produtos e leitura dos preços.
- Espaço para mais vendidos e promoções, além do caminho para iniciantes.
- Visual no computador e celular. Capturas em `preview/`.

## Interações de demonstração

Busca por nome, filtros por formato, detalhes, adicionar/remover da sacola e menu móvel. A sacola fica apenas em memória e é zerada ao recarregar. Links explicitamente identificados como loja real e atendimento abrem o site público em outra aba.

Nenhum checkout, pagamento, login, rastreamento ou envio de dados foi integrado. Nenhuma alteração foi feita na loja publicada.

## Conteúdo e fontes

Produtos, preços e imagens vieram do catálogo público de https://arcantcg.com.br/ e de seu endpoint `/products.json?limit=250`, consultados em 16/09/2026. A origem de cada imagem e o link de cada produto constam em `assets/catalog.json`. Estes dados são uma fotografia da consulta, sem sincronização de estoque.

Logo fornecido pelo material local existente em `../the-new-ads-site/logos/arcan.png`. A exibição usa contraste escuro por CSS; o arquivo original foi preservado. Fontes Barlow Condensed e Manrope obtidas do Google Fonts e armazenadas localmente.

Mais vendidos é uma seleção ilustrativa, ainda sem ranking real. A área de promoções usa preços atuais, sem inventar preços anteriores ou descontos. Prazo de envio, meios de pagamento, parcelamento, políticas, avaliações e garantias não foram presumidos.

## Arquivos

- `index.html`: estrutura da home.
- `styles.css`: identidade e adaptação para celular.
- `app.js`: interações locais.
- `assets/`: imagens, fontes e dados.
- `PRODUCT.md`: escopo e fatos confirmados.
- `DESIGN.md`: documentação visual para próximas páginas.
- `preview/`: capturas e resultado das verificações.
- `tools/`: scripts auxiliares de preparação e verificação; não são necessários para abrir a página.

## Verificação

Chrome em modo headless, abrindo o próprio HTML via `file://`, em 320, 390, 768, 1024 e 1440 px. Conferência de imagens, ausência de overflow, erros JavaScript, busca, estado vazio, filtros, detalhes, sacola, fechamento com Escape e menu móvel. Resultado detalhado em `preview/checks.json`.

## Próximas decisões

Validar estética com o proprietário; confirmar ranking e ofertas, condições de compra e promessas comerciais antes de usar em produção. A aprovação desta proposta não implica promessa de aumento de conversão: o resultado comercial depende de implementação e testes na loja real.

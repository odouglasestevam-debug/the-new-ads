# Arcan TCG · nova home Shopify

Prévia: https://arcantcg.com.br/?preview_theme_id=158466998437

Tema novo: **Arcan | Nova home + banners atuais**, ID `158466998437`, não publicado.
Tema de origem: **Rise | Yampi TNA teste**, ID `158456971429`.

## Entrega

O tema ativo foi duplicado. Somente a cópia recebeu os arquivos de `patch/`. A home conserva as duas imagens originais do slideshow e sua navegação, com proporção adaptada à imagem, sem recorte. Cabeçalho, rodapé e vitrines seguem o visual aprovado. CSS e substituição de cabeçalho/rodapé são limitados à home; categorias, produtos e carrinho continuam com as páginas do tema original.

Produtos, preços e estoque são renderizados pelo Liquid da Shopify. Busca usa a rota nativa; o botão de adicionar usa formulário nativo `/cart/add`, com variante real e retorno ao carrinho existente. Produtos com múltiplas variantes ou planos de compra direcionam à página do produto para escolha. A integração Yampi e a seção de avaliações existentes foram preservadas. Não foram criados pedidos ou alterados produtos.

## Coleções e conteúdo

No momento da implementação, `full-arts`, `produtos-nacionais-e-importados` e `booster-box` não tinham produtos ativos. Nenhum produto foi ativado por este trabalho. A prévia usa `box`, `raras`, `blister-unitario`, `etb` e `lancamentos`, com produtos ativos. A carta em destaque é Vaporeon (022/131) e a imagem para iniciantes vem de Mini BB Evoluções Prismáticas. Assim, a vitrine não depende dos produtos antigos do esboço, atualmente em rascunho.

Os nomes das vitrines não alegam ranking de vendas ou promoções não configuradas. Preços anteriores e selo de oferta só aparecem quando os dados reais do produto contêm desconto. Os anúncios escritos nas imagens do banner original foram preservados, conforme solicitado.

## Editar

No administrador Shopify, vá a Loja virtual > Temas e personalize **Arcan | Nova home + banners atuais**. Na página inicial:

- O slideshow original controla os dois banners.
- **Arcan · Vitrine** controla título, descrição, coleção, quantidade e coleções dos filtros.
- **Arcan · Carta especial** controla texto, produto e coleção do destaque.
- **Arcan - Iniciantes** controla texto e imagem de produto do guia inicial.
- A seção original de avaliações permanece na home.

O menu principal e o menu de rodapé continuam lendo os menus existentes da loja.

## Validação e limites

Capturas e verificações ficam em `preview/`. Testes de leitura em cinco larguras, duas imagens de banner, filtros, menu móvel, busca, links de produto e ausência de erros de JavaScript. Formulários de compra verificados estruturalmente; nenhum pedido, pagamento ou transação de checkout foi realizado. O checkout Yampi precisa de uma compra de homologação antes de publicar.

`baseline/` contém os arquivos de referência baixados antes da adaptação. `source-theme.json`, `draft-theme.json` e `upload-result.json` documentam origem, cópia e envio. Nenhum desses arquivos contém token de autenticação.

`tools/build-shopify-home.py` gera CSS, fontes, layout e template a partir do esboço; os arquivos Liquid autorais em `patch/sections` e `patch/snippets` são mantidos. `tools/deploy-home.cjs` recusa escrever em qualquer tema que não seja a cópia registrada com estado UNPUBLISHED. Não há comando de publicação nesse script.

Esta entrega está pronta para revisão visual na Shopify; **não foi publicada**.

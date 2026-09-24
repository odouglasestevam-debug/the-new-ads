# Regras de Design — Carrossel (Estilo Tweet)

> Simula o visual de um tweet/post do Twitter/X em cada slide.
> Fundo branco, foto de perfil, nome e @handle no topo, texto limpo embaixo.

---

## Conceito

Cada slide parece um tweet independente. O visual é ultra-limpo, familiar, e funciona bem porque as pessoas já sabem ler nesse formato. A atenção vai toda pro texto.

---

## Dimensões

- **Instagram:** 1080x1350px (proporção 4:5)
- **TikTok:** 1080x1920px (proporção 9:16)

---

## Estrutura de cada slide

### Header (fixo em todos os slides)

Posicionado no topo do slide, com padding acima (~40-60px) e à esquerda (~40-50px):

- **Foto de perfil:** círculo de 120-150px (proporção que lê bem no celular dentro do Instagram), com anel claro de 4-6px em volta (#E6E9EC). Se o usuário tiver foto, usar `<img>` com `border-radius: 50%` e `object-fit: cover`. Se não tiver, criar círculo com as iniciais do nome (fundo na cor de destaque, texto branco)
- **Nome:** ao lado da foto, font-size 40-44px, font-weight 700, cor #0F1419
- **Badge verificado** (opcional): usar o SVG em `references/badge-verificado.svg` ao lado do nome. Tamanho 36-40px. Só incluir se o usuário ativou no setup (campo "Badge verificado" no design guide). Nunca ligar por conta própria
- **@handle:** embaixo do nome, font-size 30-34px, font-weight 400, cor #536471

Layout do header: foto à esquerda, nome + handle em coluna à direita da foto, com gap de 16px.

### Corpo do tweet

Abaixo do header, com padding lateral (~80px) e topo (~40px abaixo do header):

- **Font-size:** 36-42px (maior que tweet real pra funcionar no Instagram)
- **Font-weight:** 400 (regular)
- **Line-height:** 1.5-1.6
- **Cor:** #0F1419 (preto suave do Twitter)
- **Palavras em destaque:** font-weight 700 (bold). Usar pra termos-chave, nomes de produto, dados

### Imagens (só quando o usuário fornecer)

Se o usuário quiser incluir uma imagem (print de tela, screenshot, etc), colocar embaixo do texto como se fosse imagem anexada a um tweet:

- Width: 100% (com padding lateral)
- Border-radius: 16px
- Border: 1px solid #EFF3F4
- object-fit: cover
- Sem card de link preview, sem caixinha com titulo/descricao. Só a imagem pura, como no Twitter real

### Sem imagem

A maioria dos slides é só header + texto. O espaço vazio embaixo é intencional (é assim que um tweet se parece). Nunca inventar cards, previews ou formatações que não existem no Twitter. A única exceção é o infográfico anexado (ver "Slide com card de dados"), que existe no Twitter real como imagem anexada ao tweet.

---

## Slide com card de dados (infográfico anexado)

Padrão de contas que publicam levantamentos com números públicos: o slide é um tweet cujo "anexo" é um infográfico limpo. Usar quando o carrossel precisa provar algo com dado (ranking, comparação, soma).

1. **Header** no topo (foto + nome + handle)
2. **Texto do tweet** em 1 ou 2 parágrafos curtos (38-42px, line-height ~1.25, largura máxima de ~75% do slide pra manter medida de leitura curta). Primeiro parágrafo diz a conclusão. Segundo, quando fizer sentido, traz o cuidado metodológico ("o recorte não inclui...")
3. **Card ancorado na base** do slide, ocupando cerca de metade da altura: fundo #F7F9FA, borda 1px #EFF3F4, border-radius 24-30px, padding 30-40px
   - Título do card em caixa alta, 20-22px, bold, cor escura, com o período à direita em cinza (ex: "22/08 a 20/09/2026")
   - Linhas de ranking: nome à esquerda (26-28px), valor à direita (bold, 28-30px), barra fina (10-12px, cantos arredondados) logo abaixo, proporcional ao maior valor, e uma linha de detalhe em cinza (18px) abaixo da barra
   - Barra do maior valor na cor de destaque da marca, as demais em grafite. "Sem registro" em cinza, nunca como zero
   - Máximo de 6 linhas por card
4. **Rodapé de fonte** fora do card, centralizado, 14px, cinza (#8B98A5): "Fonte: [origem] · [período]". Obrigatório em todo slide com dado

**Regras de dado:**
- Usar só número fornecido pelo usuário ou verificável. Somas e médias calculadas por nós devem ser conferidas duas vezes e marcadas como "soma" ou "média" no card
- Citar sempre a origem do dado, inclusive quando o levantamento foi compilado por terceiro
- Deixar explícito o que o recorte NÃO inclui, pra não afirmar mais do que o dado sustenta
- Nunca reproduzir nome, foto ou identidade de outra pessoa como se fosse o autor do post. O header é sempre o do perfil do usuário

---

## Fundo

- **Sempre #FFFFFF** (branco puro)
- Sem gradientes, sem texturas, sem noise
- A limpeza É o design

---

## Tipografia

- **Fonte recomendada:** system fonts que parecem Twitter. Usar `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` OU usar a fonte do design guide do usuário se ele preferir
- **Se o design guide tiver fontes definidas:** usar a fonte de corpo do design guide. O estilo tweet funciona com qualquer fonte limpa
- **Nunca usar:** fontes decorativas, serifadas pesadas, ou condensadas. O visual precisa ser limpo

---

## Variações entre slides

Mesmo sendo "tweet", variar o conteúdo visual pra não ficar 8 slides idênticos:

- **Slide de texto puro:** header + texto. O mais comum (maioria dos slides)
- **Slide com dado em destaque:** um número grande (64-80px, bold, cor de destaque) no meio do texto
- **Slide com lista:** itens com emoji de dedo apontando ou bullet points simples. Espaçamento generoso entre itens
- **Slide com card de dados:** texto curto no topo + infográfico anexado embaixo (ranking, comparação, soma). Ver seção própria acima
- **Slide com link preview:** card de preview embaixo do texto (pra slides que mencionam uma ferramenta, produto ou link)
- **Slide de capa:** pode ter o texto maior (48-56px) e menos texto, mais impacto
- **Slide de CTA:** pode ter o texto com @ do perfil maior, ou um botão estilizado embaixo

---

## Elementos

- **Sem barra de progresso** (tweets não têm)
- **Sem tags, labels ou badges** além do header
- **Sem bordas decorativas** ou blocos de cor
- **Emoji permitido** no corpo do texto (faz parte da linguagem de tweet)
- **Negrito pra destaque** é o único recurso visual no texto (como no Twitter real)

---

## Foto de perfil

No setup, perguntar ao usuário:

> "Pra o estilo tweet, preciso de uma foto de perfil. Joga o arquivo na pasta `marca/` (ex: marca/foto-perfil.jpg). Se não tiver agora, uso as iniciais do teu nome."

- Guardar como `marca/foto-perfil.jpg` ou `.png`
- Referenciar no HTML com caminho relativo
- Se não tiver foto: criar círculo com iniciais (cor de destaque do design guide como fundo)

---

## Cores

- **Fundo:** #FFFFFF
- **Texto principal:** #0F1419
- **Texto secundário (handle, metadata):** #536471
- **Links/destaques:** cor de destaque do design guide do usuário (ou #1D9BF0 azul Twitter como fallback)
- **Card preview fundo:** #F7F9FA
- **Card preview borda:** #EFF3F4

---

## O que ajustar

- **Quer fundo escuro (dark mode Twitter):** mudar fundo pra #15202B, texto pra #E7E9EA, handle pra #8B98A5
- **Fonte diferente:** trocar na seção Tipografia
- **Com barra de progresso:** adicionar se quiser (não é padrão tweet)
- **Quer mais visual:** considerar trocar pro estilo minimalista ou elaborado

Pede pro Claude: "muda a regra X no design do carrossel" e ele edita este arquivo.

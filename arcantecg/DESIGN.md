---
name: Arcan TCG
description: Uma vitrine clara e acolhedora para descobrir a próxima carta.
colors:
  paper: "#fff"
  ink: "#252621"
  muted: "#66675f"
  line: "#e6e6df"
  soft: "#f5f5f0"
  accent: "#b64220"
  accent-hover: "#913217"
  peach: "#f5dbc7"
  lime: "#e4edb9"
  dark: "#252d29"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontWeight: 700
    lineHeight: 0.98
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "29px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  price:
    fontFamily: "Manrope, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    letterSpacing: "-0.03em"
rounded:
  button: "6px"
  field: "8px"
  surface: "12px"
  dialog: "16px"
spacing:
  compact: "8px"
  inline: "16px"
  group: "24px"
  inset: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-light:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.dark}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "12px 22px"
  search-field:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
  product-picture:
    backgroundColor: "{colors.soft}"
    rounded: "{rounded.surface}"
  filter-selected:
    backgroundColor: "{colors.dark}"
    textColor: "{colors.paper}"
    rounded: "5px"
    padding: "8px 18px"
---

# Design System: Arcan TCG

## Overview

**Creative North Star: "Vitrine de coleção acolhedora"**

Uma loja clara, calorosa e centrada em cartas reais. A identidade combina a energia da descoberta com uma apresentação organizada para colecionadores e iniciantes.

O produto fornece a ilustração e a cor mais expressivas. A interface usa superfícies tranquilas, títulos condensados e detalhes laranja para orientar a exploração. Esta documentação descreve a implementação local em `index.html`, `styles.css` e `app.js`.

**Key Characteristics:**

- Produtos reais como protagonistas.
- Base clara, laranja queimado e superfícies pêssego.
- Títulos condensados e leitura funcional em Manrope.
- Cantos suaves, catálogo plano e cartas sobrepostas.

## Colors

A paleta aproxima papel claro, tons vegetais e laranja queimado.

### Primary

- **Laranja queimado** (`accent`): ações principais, foco de teclado, links destacados e acentos no título; `accent-hover` intensifica o estado de interação.
- **Pêssego** (`peach`): campo acolhedor para apresentar cartas.

### Secondary

- **Verde claro** (`lime`): texto e ações sobre o fundo escuro da coleção.

### Neutral

- **Papel** (`paper`) e **papel suave** (`soft`): página, campos e suportes de produto.
- **Tinta** (`ink`) e **tinta secundária** (`muted`): hierarquia de leitura.
- **Linha suave** (`line`): limites de campos, controles e divisórias.
- **Verde profundo** (`dark`): faixa de coleção, anúncio, filtro selecionado e confirmação.

**The Product Color Rule.** Deixe a variedade cromática das cartas aparecer sobre superfícies quietas; use o laranja para orientar ações.

## Typography

**Display Font:** Barlow Condensed, com fallback sans-serif.
**Body Font:** Manrope, com fallback sans-serif.

Os títulos de campanha são condensados e em caixa alta. Títulos de seção, produtos e controles usam Manrope para conservar familiaridade de loja.

- Display: o hero usa `clamp(50px, 5.2vw, 76px)`, com substituições responsivas; o resultado móvel final é 49px. A seção de coleção varia de 55px a 49px e usa peso 600.
- Headline: títulos de seção passam a 25px em telas pequenas.
- Body: a base está no frontmatter; descrições específicas usam tamanhos menores na implementação atual.
- Price: preço em peso alto; adapta-se a 18px no mobile e 16px abaixo de 370px.

Textos secundários de 8–11px presentes no protótipo não integram a escala normativa: sua legibilidade precisa ser revista antes de reutilizá-los em novas telas. O rótulo decorativo “SELEÇÃO ARCAN” também não estabelece um padrão de sobrancelhas editoriais.

## Layout

Contêiner central de até 1240px, com margens laterais de 40px; passa a 24px abaixo de 1050px e 16px abaixo de 760px. O catálogo usa quatro colunas no desktop e duas no mobile, com intervalos de 24px, 17px e 14px conforme a largura.

Hero, coleção e orientação para iniciantes usam duas colunas e empilham abaixo de 760px. A busca passa para uma linha própria; a navegação abre por botão. Cabeçalhos de seção alinham título e ação, e espaços maiores separam grupos de produtos.

**The Product First Rule.** Preserve o espaço visual das imagens e a proximidade entre nome, preço e ação de cada produto.

## Elevation & Depth

O catálogo é plano: o fundo suave delimita a imagem, sem uma caixa elevada envolvendo todo o produto. Cartas de campanha usam rotação, sobreposição e sombra difusa para sugerir objetos físicos. Diálogos e mensagens temporárias compartilham a sombra `--shadow`; os valores completos ficam no sidecar.

**The Physical Card Rule.** Reserve profundidade expressiva para cartas apresentadas como objetos e para superfícies temporárias de interação.

## Shapes

Superfícies amplas e áreas de imagem usam o raio `surface`; botões são mais firmes, com raio `button`. Campos e diálogos usam seus raios próprios. Contadores e botões de fechar são circulares. Órbitas finas e cartas inclinadas compõem a apresentação de coleção.

## Components

### Buttons

Ações diretas e compactas. O botão principal usa laranja com texto branco; a variante clara usa verde claro sobre contextos escuros; a variante de contorno usa papel e borda discreta. Altura mínima de 48px, elevação de 2px no hover e transição de 0,2s. O foco compartilhado é um contorno laranja de 3px com afastamento de 4px. Controles indisponíveis reduzem opacidade.

### Chips

Filtros retangulares com cantos suaves, borda e estado selecionado escuro. `aria-pressed` acompanha a seleção. A altura mínima aumenta de 40px para 44px no mobile.

### Cards / Containers

Imagem sobre base suave, nome abaixo e preço junto à ação de sacola. As imagens de catálogo usam `object-fit: contain`; no hover, sobem discretamente e ampliam. Produtos indisponíveis mantêm a informação visível e desabilitam a inclusão na sacola.

### Inputs / Fields

Busca em superfície suave, borda fina e ação de lupa integrada. O campo tem rótulo acessível e foco visível. A busca atualiza o catálogo, informa a quantidade encontrada e oferece recuperação quando não há resultados.

### Navigation

Links horizontais separados do cabeçalho por uma linha. O hover usa o acento. No mobile, o botão de categorias controla um grupo expansível e comunica seu estado com `aria-expanded`.

### Collection display

Cartas reais em leque, com rotação e órbitas discretas. O leque reage ao hover em 0,45s. A preferência por movimento reduzido desativa transições e animações CSS; os deslocamentos programáticos de rolagem ainda precisam respeitar essa preferência.

## Do's and Don'ts

### Do:

- **Do** usar imagens reais de catálogo e preservar sua identificação.
- **Do** manter foco de teclado visível e estados selecionados explícitos.
- **Do** manter nome, preço e ação próximos dentro de cada produto.

### Don't:

- **Don't** substituir o protagonismo das cartas por decoração genérica.
- **Don't** transformar os textos minúsculos do protótipo em padrão reutilizável.
- **Don't** apresentar esta prévia local como checkout ou estoque sincronizado.

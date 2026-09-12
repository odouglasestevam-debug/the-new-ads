---
name: "The New Ads · Funil Analytics"
description: "Sistema visual local para relacionar aquisição, qualidade e resultado comercial dentro do Funil."
colors:
  ink-black: "#0a0a0a"
  graphite-panel: "#141414"
  graphite-raised: "#1c1c1c"
  graphite-line: "#2a2a2a"
  muted-copy: "#a0a3a8"
  soft-white: "#f4f4f5"
  brand-orange: "#ff6a00"
  signal-orange: "#ff914d"
  success-teal: "#54cbb7"
  error-coral: "#f38a8a"
  niche-lilac: "#b59aee"
  niche-unknown: "#9ba2ac"
  chart-stone: "#80766a"
typography:
  display:
    fontFamily: "Clash Display, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "3px"
  sm: "5px"
  md: "7px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "5px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  panel: "22px"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "{colors.ink-black}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.soft-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  field:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.soft-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 11px"
    height: "40px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted-copy}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.xl}"
    padding: "20px 22px"
---

# Design System: The New Ads · Funil Analytics

## Overview

**Creative North Star: "A Mesa de Controle do Funil"**

Este sistema rege somente o Analytics dentro de `/funil`. Ele estende a superfície operacional já construída no Funil: fundo quase preto, painéis de grafite, tipografia compacta e laranja como sinal de ação. A tela deve parecer parte do mesmo produto, com mais densidade para comparar aquisição, qualidade e resultado comercial sem criar uma identidade paralela.

A atmosfera é técnica, sóbria e verificável. Informação aparece em camadas progressivas: primeiro indicadores, depois gráficos e cadeias de custo, por fim tabelas, metodologia e qualidade dos dados. Uma única conta Meta Ads é a fonte real prevista; enquanto ela ainda não tem dados reais, `simulado=true` deve aparecer explicitamente como dados de teste inseridos no banco.

**Key Characteristics:**

- Superfície escura contínua com hierarquia por tons de grafite e divisórias finas.
- Laranja raro e funcional para ações, seleção, foco e leitura de séries prioritárias.
- Densidade analítica com números tabulares, rótulos curtos e contexto perto do denominador.
- Navegação por tarefa e detalhe progressivo, com o método acessível na própria experiência.
- Estados de fonte explícitos: Conta Meta Ads ou Dados de teste inseridos.

## Colors

A paleta mantém o preto e o âmbar do Funil, abrindo apenas cores semânticas e de série necessárias para leitura de dados.

### Primary

- **Laranja da Marca:** ação primária e vínculo direto com a identidade The New Ads.
- **Laranja de Sinal:** foco, seleção, links de investigação, avisos de teste e série analítica prioritária.

### Secondary

- **Teal de Resultado:** estados positivos e identidade do nicho Veterinária.
- **Lilás de Eventos:** identidade exclusiva do nicho Eventos em legendas, barras e comparações.

### Tertiary

- **Coral de Alerta:** variações negativas e estados que pedem atenção.
- **Pedra de Gráfico:** série comparativa neutra quando o laranja precisa manter a prioridade.

### Neutral

- **Preto de Base:** canvas contínuo da aplicação.
- **Grafite de Painel:** cards, controles e grandes superfícies de conteúdo.
- **Grafite Elevado:** hover e trilhos internos que precisam se separar do painel.
- **Linha de Grafite:** bordas, divisórias, eixos e estrutura de tabelas.
- **Texto Atenuado:** descrições, rótulos, metadados e contexto secundário.
- **Branco Suave:** títulos, valores e conteúdo principal.
- **Cinza de Nicho Desconhecido:** identifica registros sem associação de nicho sem sugerir desempenho.

### Named Rules

**The Orange Signal Rule.** O laranja deve sempre indicar ação, seleção, foco, teste ou a série principal; grandes superfícies permanecem em preto e grafite.

## Typography

**Display Font:** Clash Display (com `system-ui` e `sans-serif` como fallback)

**Body Font:** Switzer (com `system-ui` e `sans-serif` como fallback)

**Character:** Clash Display conecta a marca e os títulos principais ao Funil existente. Switzer sustenta toda a leitura operacional, incluindo valores e tabelas, com numerais tabulares para comparações estáveis.

### Hierarchy

- **Display** (600, 30px, 1.25): títulos de página; reduz para 26px em telas estreitas.
- **Headline** (600, 30px, 1.25): valores de indicadores; pode chegar a 34px em telas largas e cair para 26px em larguras menores.
- **Title** (600, 17px, 1.25): títulos de painéis e seções.
- **Body** (400, 14px, 1.5): interface, explicações e controles; textos analíticos podem usar 1.6–1.7 para sustentar leitura densa.
- **Label** (400–500, 11–13px): rótulos, metadados, cabeçalhos de tabela e legendas.

### Named Rules

**The Stable Number Rule.** Valores, deltas e células numéricas usam algarismos tabulares; a posição dos dígitos não deve saltar entre atualizações.

## Layout

No desktop, a moldura usa uma sidebar fixa de 216px e uma área de trabalho fluida. O conteúdo central tem largura máxima de 1700px, respiro horizontal de 34px e uma grade de 12 colunas com intervalos de 20px. Indicadores formam uma faixa única de quatro colunas; painéis combinam spans de 4 a 12 colunas conforme a comparação.

Até 1200px, a sidebar reduz para 186px e o conteúdo passa a 22px de respiro. Até 900px, a navegação lateral vira uma faixa horizontal acima da página, os indicadores passam para duas colunas e painéis largos reorganizam seus spans. Até 620px, o respiro lateral cai para 16px, painéis ocupam a largura inteira, ações mantêm pelo menos 44px de altura e tabelas continuam roláveis em vez de esmagar colunas.

O ritmo principal alterna intervalos compactos de 8–16px nos controles e blocos de 20–22px em cards. Separações entre seções crescem para 28px, preservando densidade sem misturar assuntos.

## Elevation & Depth

O sistema não usa sombras. Profundidade vem da sequência preto → painel → grafite elevado, de bordas discretas e de fundos de estado mais quentes. Hover altera tom e borda; não desloca nem levanta superfícies.

### Named Rules

**The Flat Evidence Rule.** Painéis ficam planos em repouso; hierarquia nasce de contraste tonal, bordas e agrupamento, sem sombra decorativa.

## Shapes

Painéis e faixas de indicadores usam cantos gentilmente arredondados (12px). Controles e navegação ficam em uma faixa compacta de 7–8px; tags e estados internos usam 5px; barras, trilhos e células de calor usam 2–4px. Bordas são finas e discretas. Círculos aparecem somente em marcadores de status ou pontos de intervalo.

## Components

Os componentes são contidos, densos e explicam seu estado por cor, texto e estrutura.

### Buttons

- **Shape:** retângulo compacto com cantos de 7px e altura de 40px; no mobile, alvos interativos chegam a pelo menos 44px.
- **Primary:** fundo em Laranja da Marca, texto Preto de Base, peso 600 e padding de 8px por 12px.
- **Hover / Focus:** hover clareia para Laranja de Sinal; foco visível usa contorno de 2px na mesma cor, afastado 4px.
- **Secondary / Ghost:** o secundário usa Grafite de Painel com borda; o ghost remove a borda e começa em Texto Atenuado.

### Chips

- **Style:** tags usam borda fina, cantos de 5px, padding de 4px por 8px e texto de 12px.
- **State:** o estado de teste aquece fundo e borda e usa Laranja de Sinal; nichos usam pequenos swatches separados do texto.

### Cards / Containers

- **Corner Style:** cantos de 12px.
- **Background:** Grafite de Painel sobre Preto de Base.
- **Shadow Strategy:** sem sombras; consultar Elevation & Depth.
- **Border:** uma linha contínua em Linha de Grafite.
- **Internal Padding:** corpo de painel em 20px por 22px, reduzido para 18px ou 16px conforme a largura.

### Inputs / Fields

- **Style:** fundo Grafite de Painel, borda um passo acima da divisória, cantos de 7px, altura de 40px e padding de 8px por 11px.
- **Focus:** contorno global de 2px em Laranja de Sinal, afastado 4px.
- **Error / Disabled:** controles desabilitados perdem opacidade; validação mantém a mensagem perto do campo e não depende apenas de cor.

### Navigation

A navegação usa itens de 44px, texto de 13px, cantos de 7px e ícones lineares de 18px. Hover eleva o grafite; o item atual recebe fundo marrom-grafite discreto, texto Laranja de Sinal e peso 600. Em telas abaixo de 900px, ela se torna uma faixa horizontal rolável e omite os ícones para preservar os rótulos.

### Metric Strip

A faixa de indicadores é um único contêiner de 12px com divisórias internas. Cada métrica combina rótulo atenuado, valor de 30px com algarismos tabulares, denominador próximo e delta contextual. No tablet e mobile, a faixa vira uma grade 2 × 2.

### Data Tables

Tabelas preservam alinhamento numérico à direita e a primeira coluna à esquerda. Cabeçalhos usam fundo um pouco mais claro, texto de 11px e peso 500; linhas têm padding vertical de 14px, divisórias finas e hover tonal. Em telas estreitas, a região recebe rolagem horizontal e foco visível.

### Source and Empty States

A fonte ativa aparece na sidebar, no cabeçalho e no rodapé. O estado real nomeia “Conta Meta Ads” e informa que há uma única conta; o estado `simulado=true` nomeia “Dados de teste inseridos” e recebe aviso explícito de que os números vieram do banco para validar o Analytics. Quando a conta ainda não tem dados reais, o estado vazio explica isso e oferece a visualização dos dados de teste.

## Do's and Don'ts

### Do:

- **Do** mantenha o Analytics visualmente contínuo ao Funil: preto, grafites, Clash Display nos títulos e Switzer na interface.
- **Do** mostre numerador, denominador, período, fonte e limitações perto da métrica que dependem deles.
- **Do** identifique sempre “Conta Meta Ads” e “Dados de teste inseridos” em linguagem visível, inclusive em exportações.
- **Do** preserve alvos de 44px, foco visível, redução de movimento e rolagem de tabelas em telas estreitas.

### Don't:

- **Don't** trate `simulado=true` como dado real, simulação abstrata ou performance da agência; ele significa dados de teste inseridos no banco.
- **Don't** transforme teal, lilás ou cores de nicho em acentos globais do site; elas existem para distinguir séries dentro do Analytics.
- **Don't** introduza sombras, gradientes decorativos ou cards flutuantes em uma superfície que constrói profundidade por tom e borda.
- **Don't** use laranja como preenchimento amplo; sua raridade mantém ações, seleção e alertas legíveis.

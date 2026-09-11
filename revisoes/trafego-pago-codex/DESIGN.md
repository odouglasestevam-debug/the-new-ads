---
name: "The New Ads: variante tráfego pago Codex"
description: "Sistema observado exclusivamente na variante isolada /trafego-pago-codex; não aprovado como padrão global."
colors:
  black: "#0a0a0a"
  surface: "#171717"
  white: "#fafafa"
  muted: "#aaa"
  subtle: "#8a8a8a"
  accent: "#ff6a00"
  accent-hover: "#ff8530"
  line: "rgba(255,255,255,.14)"
  field-border: "#626262"
  frame-border: "#484848"
  error-text: "#ffab70"
typography:
  display:
    fontFamily: "'Clash Display','Space Grotesk',system-ui,sans-serif"
    fontSize: "clamp(44px,4.45vw,66px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-.015em"
  headline:
    fontFamily: "'Clash Display','Space Grotesk',system-ui,sans-serif"
    fontSize: "clamp(34px,3.75vw,54px)"
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: "-.015em"
  title:
    fontFamily: "'Clash Display','Space Grotesk',system-ui,sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.015em"
  body:
    fontFamily: "'Switzer','Inter',system-ui,sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  body-compact:
    fontFamily: "'Switzer','Inter',system-ui,sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Switzer','Inter',system-ui,sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  action:
    fontFamily: "'Switzer','Inter',system-ui,sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  control: "2px"
spacing:
  compact: "8px"
  control-gap: "16px"
  regular: "24px"
  wide: "32px"
  column-gap: "100px"
  section-desktop: "112px"
  section-tablet: "88px"
  section-mobile: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.black}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "18px 24px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "12px 0"
  field:
    backgroundColor: "{colors.black}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
    width: "100%"
  journey-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "24px 20px"
  journey-tab-selected:
    textColor: "{colors.white}"
  service-row:
    textColor: "{colors.white}"
    padding: "30px 0"
---

# Design System: The New Ads, variante tráfego pago Codex

## Overview

**Creative North Star: "A operação à vista"**

Esta documentação descreve apenas a variante isolada `/trafego-pago-codex`. O nome resume a direção já implementada: tornar legível o caminho do anúncio à venda, mostrar quem executa e oferecer um próximo passo concreto. Não é uma aprovação do usuário para substituir `/trafego-pago`, nem um sistema global aprovado para o restante da marca.

A presença é escura, precisa e humana. Preto e grafite sustentam texto claro, linhas finas e sinais pontuais de âmbar. O retrato real de Douglas, o wordmark existente e os logos reais de clientes ancoram a página. A composição usa faixas e linhas editoriais com respiro; a jornada de quatro etapas concentra a explicação interativa. Esses padrões pertencem à variante, sem proibir outras composições nas demais superfícies.

**Key Characteristics:**

- Base preta e grafite, texto branco e cinza, âmbar em ação e estado.
- Clash Display em títulos, Switzer na leitura e nos controles.
- Divisores finos, cantos quase retos e profundidade por mudança de superfície.
- Fotografia real, logos reais e ícones SVG com traço uniforme.
- Jornada controlada pelo visitante e formulário com progresso explícito.

**Escopo e evidência para continuidade:** extração do código de [trafego-pago-codex.html](../../the-new-ads-site/trafego-pago-codex.html), [page.css](../../the-new-ads-site/assets/trafego-codex/page.css) e [page.js](../../the-new-ads-site/assets/trafego-codex/page.js). O primeiro comentário do `body` conserva THESIS, OWN-WORLD, STORY, FIRST VIEWPORT e FORM. A ordem construída é hero, clientes, jornada, entregáveis, Douglas, adequação, dúvidas e convite final. Isso é contexto desta página, não uma sequência obrigatória para outras páginas.

O HTML mantém `noindex, nofollow` e canonical apontando para `/trafego-pago`. Os arquivos da variante ficam separados em `assets/trafego-codex/`; a foto e os logos de clientes são reutilizados dos ativos existentes. O hero preserva a copy fornecida e utiliza SVG nos ícones decorativos dos benefícios e da ação. Não há blocos de depoimentos ou métricas ilustrativas de resultados. As afirmações numéricas que já estavam no hero são conteúdo herdado, não prova verificada por esta documentação.

[PRODUCT.md](../../PRODUCT.md) informa o contexto do serviço. Para fontes, o código e [marca/design-guide.md](../../marca/design-guide.md) usam Clash Display e Switzer; Space Grotesk e Inter aparecem apenas como fallback nesta variante. A menção antiga dessas famílias como principais em PRODUCT.md não orienta este registro. Nenhum desses arquivos globais foi alterado.

O sidecar está em [.impeccable/design.json](.impeccable/design.json). Sua leitura visual é uma extensão deste documento local. Esta passagem examinou o código; não executou navegador, detector ou validação real da API. Não interpretar o documento como veredito de QA ou autorização de publicação.

## Colors

A paleta privilegia uma base escura contínua, contraste de leitura e âmbar reservado a pontos de decisão.

### Primary

- **Âmbar Sinal**, `accent`: preenchimento de CTAs, destaque curto de título, foco, ícones e estado selecionado.
- **Âmbar de interação local**, `accent-hover`: resposta dos CTAs ao ponteiro. É o valor construído nesta variante, não uma alteração da cor de hover do guia global.
- **Âmbar claro de erro**, `error-text`: mensagens junto aos campos e falha de envio, sempre acompanhadas de texto explicativo.

### Neutral

- **Preto**, `black`: fundo principal e interior dos campos.
- **Grafite**, `surface`: faixas de jornada, operador e encerramento, além do diálogo.
- **Branco Sinal**, `white`: títulos, texto de maior ênfase e controles.
- **Cinza de leitura**, `muted`: parágrafos e controles ainda não selecionados.
- **Névoa**, `subtle`: informações de apoio e metadados. Não herdar automaticamente os menores tamanhos usados no código.
- **Linha translúcida**, `line`: divisores entre seções, linhas de serviço, abas e FAQ.
- **Borda de campo**, `field-border`: identificação consistente dos inputs e selects sobre preto.
- **Borda de moldura**, `frame-border`: limite do diálogo e progresso pendente.

**The Sinal Pontual Rule.** Aplicar o âmbar em ação, estado e ênfase curta; as grandes superfícies da variante permanecem pretas ou grafite.

A linha translúcida e o hover local diferem do guia global. Registrar a implementação desta página não atualiza os tokens da marca. Os tokens do frontmatter são a referência numérica desta documentação, enquanto o código segue sendo a fonte executável.

## Typography

**Display Font:** Clash Display, com Space Grotesk e a pilha sans-serif como fallback.

**Body Font:** Switzer, com Inter e a pilha sans-serif como fallback.

**Character:** títulos compactos e de grande presença organizam a leitura; corpo neutro e arejado explica a operação. Não há família monoespaçada carregada na variante. Os números das abas usam Switzer com algarismos tabulares.

### Hierarchy

- **Display:** papel do hero, no peso forte. O frontmatter registra a regra base; as variações responsivas estão em Layout.
- **Headline:** títulos de seção semibold e entrelinha próxima. Há ajustes locais para serviços, operador, diálogo e encerramento, que não formam uma escala global adicional.
- **Title:** referência recorrente dos títulos curtos da lista de adequação. Linhas de serviço usam títulos maiores (25px), reduzidos no celular (23px).
- **Body:** leitura principal. O papel compacto aparece em explicações da jornada, serviços e FAQ; os parágrafos mais longos têm larguras observadas entre 42ch e 66ch.
- **Label:** rótulos de campos, em peso médio, acima do controle.
- **Action:** CTA principal, em semibold. Links de ação usam um grau menor (15px), com peso médio e seta SVG.

**The Duas Vozes Rule.** Manter Clash Display na hierarquia de títulos e Switzer nos parágrafos, rótulos e ações; os fallbacks não definem uma nova direção tipográfica.

Não transformar textos auxiliares de 11px em um papel tipográfico recomendado. Eles existem em algumas regras móveis, mas precisam de revisão de legibilidade antes de qualquer expansão desse uso.

## Layout

O contêiner é centralizado, com largura máxima de 1280px e desconto horizontal total de 112px no desktop. As seções recorrentes usam o ritmo vertical do frontmatter. As composições de explicação se organizam em duas colunas, com espaço largo entre contexto e conteúdo. O hero usa proporção 1,45:1; introdução e painéis da jornada usam 1,1:1; serviços e adequação usam 1:1; operador e FAQ usam 1:1,5. São regras de composição da página, não tokens de grade para todo o site.

As adaptações observadas são:

- **Até 1100px:** margem lateral de 32px, menor distância entre colunas e espaçamento vertical de seção no grau tablet.
- **Até 800px:** os principais blocos passam a uma coluna. A navegação por âncoras e o retrato grande do hero ficam ocultos; a ação do cabeçalho e o retrato pequeno de Douglas continuam disponíveis. A introdução de serviços perde a fixação durante a rolagem. Logos passam de nove colunas para cinco.
- **Até 520px:** margem lateral de 20px, seções no grau mobile e CTAs de hero e encerramento ocupando a largura disponível. A jornada passa a duas colunas de abas e os logos formam três colunas. O texto de retorno da jornada usa uma grade de ícone e parágrafo, com o link em uma linha inteira abaixo.
- **A partir de 1500px:** há ajustes locais de escala e respiro do hero.

O título do hero adota regras específicas em cada faixa: desktop amplo (70px), faixa até 1100px (52px), até 800px (`clamp(40px,7.5vw,60px)`) e até 520px (`clamp(38px,9.65vw,49px)`, entrelinha 1,08). Essas exceções descrevem o hero preservado, não uma rampa universal.

O cabeçalho fica fixo durante a rolagem por `sticky`. O documento reserva deslocamento para âncoras (110px, reduzido a 90px no celular). O diálogo limita largura e altura à janela, com rolagem interna quando necessário. As alturas mínimas dos painéis da jornada servem à composição atual e não foram promovidas a tokens reutilizáveis.

## Elevation & Depth

A variante usa planos de cor e bordas, sem sombras de caixa e sem gradientes. O diálogo se separa por sua moldura e pelo fundo preto translúcido sobre a página. O fechamento do diálogo recebe grafite elevado no hover. O movimento é curto e ligado à ação: o CTA sobe discretamente, a seta do link avança e o sublinhado da aba cresce. Durações, curvas e foco ficam no sidecar, pois não cabem no esquema de tokens do frontmatter.

**The Profundidade por Planos Rule.** Separar grupos com superfície e divisor; manter a ausência de sombras como característica desta variante.

A preferência `prefers-reduced-motion: reduce` desativa transições e animações, remove o deslocamento dos CTAs e das setas e troca a rolagem suave por imediata. Não há reprodução automática da jornada nem animação contínua de logos.

## Shapes

Controles e retrato principal têm cantos quase retos, com o raio recorrente `control`. O diálogo possui uma exceção local de canto mínimo (3px), que não foi elevada a um token adicional. Divisores e bordas de controles usam espessura fina (1px). O progresso, o foco e o estado de aba usam uma espessura mais visível (2px).

Os ícones são SVG de contorno, com tamanho padrão de 24px, traço de 1,7 e extremidades arredondadas. Variações de tamanho acompanham a densidade do controle. O quadrado âmbar no retrato é um detalhe decorativo; não representa nem substitui o símbolo oficial. A marca utiliza o ativo existente, sem redesenho tipográfico.

## Components

### Buttons

O CTA é direto, sólido e legível. Usa âmbar com texto preto e seta SVG. Tem altura mínima de 60px na regra base, sobe 2px no hover e retorna no estado ativo. O foco é âmbar com contorno de 2px e afastamento de 6px. Durante envio, o botão fica indisponível, com opacidade reduzida e texto de progresso.

O botão de texto usa fundo transparente, texto branco e ícone âmbar que avança 4px no hover. A ação do cabeçalho é uma variante compacta, com mudança de texto para âmbar. Todos os convites com `data-open-form` abrem o mesmo diálogo. Não adicionar variantes de chip ou botão de contorno que não existem nesta página.

### Inputs / Fields

Campos escuros têm borda legível, rótulo visível, altura mínima de 50px e texto de 16px. O placeholder é complementar. Inputs e selects recebem contorno âmbar com afastamento de 2px ao focar. Erros usam mensagem específica, `aria-invalid` e `aria-describedby`; a cor não é o único sinal.

O diálogo é um `<dialog>` nativo, com nome e descrição acessíveis. O foco entra no campo da etapa atual e retorna ao acionador ao fechar. Há botão de fechar, fechamento nativo por Escape e tratamento de clique externo. Os valores permanecem ao fechar e reabrir na mesma página.

**Contrato de continuidade do formulário:** são três etapas e seis campos visíveis: Contato (`nome`, `email`, `telefone`), Empresa (`empresa`, `faturamento`) e Investimento (`verba`). O campo `empresa_site` é um honeypot técnico e não uma sétima pergunta. Preservar os nomes, valores das opções e payloads compatíveis com `/api/lead`.

O contato é salvo ao concluir a primeira etapa; o identificador retornado é reutilizado no envio final. Após salvo, o contato continua legível e fica somente leitura para não divergir do registro que a API já criou. A etapa intermediária avança sem requisição própria. O envio final informa a qualificação e direciona o sucesso para agenda ou conversa sobre trackeamento no WhatsApp. O critério implementado considera fora do perfil a combinação de uma das duas menores faixas de faturamento com a menor faixa de verba. Não reinterpretar o aviso comercial do hero como substituição dessa regra técnica.

Falhas de salvamento conservam as respostas e mostram uma mensagem para nova tentativa. Durante a requisição, os controles da etapa ficam indisponíveis e o formulário recebe `aria-busy`. O código carrega UTMs e identificadores de campanha, envia eventos ao `dataLayer` e respeita o intervalo mínimo de interação esperado pela integração existente. Estes são contratos observados no frontend, não comprovação de uma chamada real à API nesta passagem.

### Navigation

O cabeçalho combina wordmark existente, três âncoras e uma ação de conversa. Os links usam texto cinza, ficam brancos no hover e respeitam o foco global. Em telas menores, a navegação por âncoras é ocultada sem criar um menu que não existe no código. O link de pular para o conteúdo aparece ao receber foco.

### Journey

A jornada é a assinatura interativa: Anúncio, Conversa, Qualificação e Venda. Cada aba abre um painel com uma explicação, o que é acompanhado e a decisão correspondente. Seleção é indicada por texto claro, número âmbar e sublinhado. O script mantém `aria-selected`, `aria-controls`, painel visível e uma única aba na ordem de Tab. Setas esquerda e direita, Home e End mudam a seleção e movem o foco. O visitante controla o ritmo.

### Editorial Rows

Os serviços se repetem como linhas com título, parágrafo e metadados abaixo, separados por divisores. O primeiro e o último item ajustam o respiro ao bloco; no mobile a primeira linha recebe também um divisor superior. Não há cards de serviço elevados ou componentes de chip. A lista de adequação repete a lógica de linha com um SVG de confirmação.

### FAQ

Perguntas usam `<details>` e `<summary>` nativos. A área da pergunta é inteira clicável, com altura confortável e divisor. O ícone de mais gira ao abrir e recebe âmbar. Respostas aparecem no fluxo, com links sublinhados quando presentes. Nenhum comportamento força a abertura de apenas uma resposta.

### Assets

O wordmark da variante está em `assets/trafego-codex/logo.svg`. O retrato real é `douglas-estevam.jpg`, reutilizado no hero e na identificação de Douglas. Nove logos reais vêm de `logos/`, com nomes acessíveis e carregamento tardio. O tratamento observado dos logos é monocromático, estático e responsivo, com aumento de opacidade no hover. Não importar automaticamente o marquee, o brilho ou a sombra descritos em outras superfícies do guia global.

## Do's and Don'ts

### Do:

- **Do** aplicar este documento apenas à variante `/trafego-pago-codex` e manter sua continuidade dentro dos arquivos isolados.
- **Do** conservar preto, grafite, branco e cinzas como base, usando âmbar para ação, foco, seleção e ênfase curta.
- **Do** usar Clash Display nos títulos e Switzer na leitura e nos controles, com as pilhas de fallback registradas.
- **Do** preservar os ativos reais da marca, de Douglas e dos clientes, seus nomes acessíveis e suas proporções.
- **Do** manter a jornada operável por teclado, os estados explícitos do formulário e a preferência por movimento reduzido.
- **Do** conservar os seis campos, as três etapas e o contrato existente da API ao dar continuidade à interface.
- **Do** escrever em português brasileiro direto, com descrição concreta do serviço e sem travessão.

### Don't:

- **Don't** tratar esta documentação como padrão global aprovado, substituir a landing principal ou alterar PRODUCT.md e o guia de marca por inferência.
- **Don't** promover métricas e afirmações herdadas do hero a provas verificadas, nem inserir depoimentos ou números ilustrativos como fatos.
- **Don't** redesenhar o wordmark, substituir retratos e logos reais por ativos inventados ou usar caracteres como novos ícones de interface.
- **Don't** transformar pequenos tamanhos de apoio, alturas fixadas por composição ou exceções do hero em regras gerais.
- **Don't** adicionar sombras, gradientes, animação automática ou padrões de cards e chips ao extrapolar esta variante sem nova decisão de direção.

**Não canonizado:** o caractere de seta herdado no texto auxiliar do hero, os textos móveis de 11px e as afirmações numéricas preservadas não viram padrão de ícone, tamanho mínimo recomendado ou evidência comercial. A seta permanece por preservação de conteúdo; os tamanhos exigem avaliação de legibilidade; as afirmações exigem comprovação independente. Valores isolados de recorte e altura de painel também ficam fora da camada normativa.

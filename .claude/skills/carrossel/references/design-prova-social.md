# Regras de Design — Carrossel (Prova Social / Editorial)

> Este arquivo controla como os slides do carrossel são criados visualmente.
> Padrão inspirado em contas de referência de alta performance (ex: @brandsdecoded_ / Content Machine).
> Foco: autoridade, prova concreta, fotografia editorial e mecânica de conversão — não só design bonito.
> Tu pode editar qualquer regra aqui e o Claude vai seguir na próxima vez que criar um carrossel.

---

## Filosofia

Esse estilo vende antes de "impressionar". Cada slide existe pra provar um ponto, não só decorar um texto. A estética é grotesk bold + fotografia editorial + prova real (screenshots, dados, cases), nunca gradiente genérico ou ilustração decorativa solta.

**Pensar antes de criar:**
- Esse slide está afirmando algo ou provando algo? Prova > afirmação sempre que possível
- Tem um dado, print, exemplo real ou case pra sustentar o argumento deste slide?
- A headline tem UMA palavra ou frase que merece destaque de cor, ou tá tudo no mesmo peso?

**NUNCA fazer:**
- Texto genérico sem prova quando existe dado disponível
- Cor de destaque aplicada em mais de uma frase/bloco por slide
- Foto de banco de imagem genérica (pose de stock, sorriso forçado). Preferir still editorial com grade de cor forte, ou não usar foto
- Fundo com gradiente decorativo sem função (esse estilo é fundo sólido, não textura)

---

## Dimensões

- **Instagram:** 1080x1350px (proporção 4:5)
- **TikTok:** 1080x1920px (proporção 9:16)
- **Safe area:** 45px nas laterais, 60px em cima, 80px embaixo

---

## Barra de assinatura (todo slide, sem exceção)

Barra fina no topo de todo slide, três colunas:
- **Esquerda:** "Powered by [marca/agência]" — ou nome da marca do cliente
- **Centro:** "@handle" do Instagram
- **Direita:** mês/ano (ex: "Janeiro 2026 ®") ou apenas ano com "//" (ex: "2026 //")

Fonte pequena (11-13px), sans-serif regular, cor branca em fundo escuro/vibrante, cor preta/escura em fundo claro. Nunca decorativa, sempre discreta — é assinatura, não elemento de destaque.

---

## Paleta e alternância de fundo

Rotacionar entre **3 tipos de fundo**, nunca dois slides seguidos iguais:
1. **Claro/off-white** (`#F4F4F4` ou similar) — texto escuro
2. **Escuro/navy quase preto** (`#0A0A14` ou similar) — texto branco, destaque em amarelo-claro ou accent
3. **Cor vibrante sólida** (a cor de destaque da marca, saturada — ex: laranja `#FF4500`) — texto branco/preto conforme contraste

A cor de destaque da marca (`marca/design-guide.md`) aparece em: palavra-chave dentro de headline, sublinhado, ou como fundo sólido de slide inteiro (não as três coisas no mesmo slide).

**Exceção deliberada:** se o tema do carrossel remete a uma cor/paleta específica (ex: carrossel sobre um país, uma estação, uma marca com paleta icônica), 1 slide pode usar um fundo pastel/simbólico ligado ao tema, fora da rotação fixa de 3. É exceção pontual, não vira uma 4ª cor de rotação padrão — só usar quando o conteúdo justificar.

---

## Capa (slide 1)

Duas variações válidas, escolher pelo tom do carrossel:

**Variação A (avatar no topo):**
1. Barra de assinatura no topo
2. **Avatar + @handle + badge verificado**, centralizado, logo abaixo da barra ou sobre a foto — ativa prova social antes do usuário ler qualquer coisa. Avatar circular pequeno (44-56px), pode ter anel gradiente decorativo em volta
3. Foto full-bleed (still editorial, cor forte, alto contraste) OU fundo de cor vibrante sólida
4. Headline em caps, peso black/900, ocupando quase a largura toda do slide. 1-3 palavras (nunca a frase inteira) na cor de destaque
5. Linha de apoio pequena abaixo, começando com seta "→", tom mais baixo (peso regular, menor)

**Variação B (kicker no topo, avatar embaixo):**
1. Barra de assinatura no topo
2. Foto full-bleed ocupando o slide inteiro, com overlay escuro na base pra legibilidade
3. **Kicker:** linha curta de contexto (peso regular, menor, cor secundária) posicionada ACIMA da headline, no terço inferior da foto — dá a moldura antes do impacto
4. Headline em caps, peso black/900, logo abaixo do kicker. 1 palavra-chave na cor de destaque
5. **Avatar + @handle + badge verificado** por último, na base do slide, abaixo da headline — fecha a composição em vez de abrir

Se não tiver foto disponível pra capa, usar fundo de cor vibrante sólida + a variação A (avatar no topo). Funciona igual de bem.

---

## Tipografia

- **Família:** sans-serif grotesk bold (ex: Archivo, General Sans, Inter Black, ou equivalente do design guide). Peso black/900 pra headlines, regular/500 pro corpo
- **Headlines:** 56-96px, caps ou title case conforme o tom, sempre peso extremo (black)
- **Corpo:** 28-36px, peso regular, altura de linha generosa (1.3-1.4)
- **Segundo registro serifado:** fonte serifada editorial (ex: instrument serif, times) pode ser usada como registro alternado ao longo do carrossel, não só numa exceção isolada. Intercalar slides com lead-in serifado e slides com lead-in sans dá ritmo de leitura. Regra prática: quando o slide tem peso de afirmação/tese (algo que soa como conclusão), serifado. Quando o slide tem peso de argumento/explicação direta, sans bold

### Destaque de palavra-chave (escolher UMA técnica por slide, nunca combinar)
- **Cor:** só a palavra/frase-chave na cor de destaque, resto no branco/preto padrão
- **Sublinhado manual:** `border-bottom` fino (2-3px) sob a frase inteira que é o argumento central do slide — não a `text-decoration` padrão
- Nunca usar highlight de fundo colorido atrás do texto nesse estilo (isso é do estilo "elaborado")

---

## Listas e marcadores

Escolher o marcador pelo tipo de conteúdo, nunca bullet genérico (•):
- **Seta "→":** benefícios, consequências, o que vai mudar, o que o leitor vai aprender
- **X vermelho "✕":** mitos, crenças erradas, o que parou de funcionar
- **Números "1. 2. 3.":** passo a passo, framework, ordem de execução
- **"MODELO 01 / MODELO 02":** quando o slide apresenta um framework nomeado e replicável — número em cor de destaque, headline do modelo em peso black logo depois

---

## Prova social embutida (o diferencial desse estilo)

Usar pelo menos 1-2 slides com prova concreta, não só texto puro:
- **Card de perfil do Instagram:** mockup simples de card branco com avatar, @handle, bio e contagem de seguidores — usado como "veja esse case real"
- **Grid de mini-thumbnails:** 6-8 miniaturas de posts/carrosséis anteriores dispostas em grid 2x4, com legenda de estrutura embaixo (ex: "Slide 1: gancho. Slides 2-3: promessa..."). Bom pra slide de "como fazer" ou "anatomia de"
- **Print de dado/gráfico real:** se o usuário tiver ou puder fornecer estatística com fonte, montar como card visual (fundo branco, título do gráfico, fonte citada embaixo pequena)
- **Mockup de post do Instagram:** card com foto, curtidas, comentários, botão "Turbinar post" — pra ilustrar um exemplo dentro de um framework

Esses elementos são fabricados em HTML/CSS (card, mockup, grid), não fotos reais de terceiros — a menos que o usuário forneça screenshots próprios.

---

## Tratamento de imagens

Imagens em `conteudo/carrosseis/[tema]/imagens/`, referência relativa no HTML.

- **Foto de capa/full-bleed:** cobre o slide inteiro ou uma faixa grande (60-70% da altura), sem overlay de gradiente — a foto já vem com grade de cor forte (contraste, saturação). Texto sobreposto direto no terço inferior com fundo escuro natural da foto (não overlay artificial)
- **Foto em box (slides de conteúdo):** retângulo com `border-radius: 4-8px` (quase reto, não arredondado como o estilo elaborado), ocupando a largura do slide, altura fixa (~420-480px), com texto abaixo, nunca sobreposto
- **Grade de cor:** se o usuário não tiver foto com grade de cor pronta, aplicar `filter: contrast(1.1) saturate(1.2)` no CSS pra aproximar do look editorial
- Nem toda foto precisa de pessoa — still de objeto/ambiente também funciona se bem enquadrado e colorido

**Regra de escolha da foto: mood vs prova literal.** Quando o slide é uma afirmação genérica/abstrata (sem citar um exemplo real), a foto casa pelo registro emocional do slide (mood-matching), não precisa ilustrar o texto literalmente. Quando o slide cita um case, marca ou pessoa real e nomeada, a foto vira prova literal daquele case (print de campanha real, produto real, pessoa real) — nesse caso não vale foto genérica "de clima", tem que ser a imagem do case citado.

---

## Design sem foto

Slides 100% tipográficos funcionam bem nesse estilo (metade dos exemplos de referência não usa foto):
- Fundo de cor sólida vibrante ou navy escuro
- Headline black + corpo + lista com seta/X/número
- Linha fina horizontal (`border-top: 1px solid`, opacity baixa) como separador entre blocos de texto dentro do mesmo slide
- Espaço em branco generoso — não precisa preencher o slide inteiro, um bloco de texto no terço superior com muito respiro embaixo é válido

---

## Slide institucional / vitrine (opcional)

Quando o carrossel precisa de um slide de apresentação da marca/conta em algum ponto (geralmente logo após a capa, ou como slide fixo reaproveitado entre carrosséis), usar esse arquétipo de slide único com múltiplas zonas empilhadas:
1. Barra de assinatura no topo
2. **Zona de headline:** metade superior do slide em cor sólida (fundo da marca ou accent), com a frase de posicionamento da conta/negócio em peso black, 1-2 palavras-chave na cor de destaque
3. **Zona de foto:** painel de imagem logo abaixo, com overlay escuro sutil, ocupando boa parte da metade inferior
4. **Parágrafo curto** (2-3 linhas) descrevendo o que a marca/negócio faz, sobreposto ou logo abaixo da foto
5. **CTA em pill** fechando o slide, com uma palavra ou frase na cor de destaque dentro do texto (ex: "link em nossa bio")

Esse slide é mais denso que o padrão de "1 ideia por slide" do resto do carrossel — é intencional, funciona como cartão de visita compacto, não como parte do arco narrativo.

---

## CTA final

Mecânica de comentário pra desbloquear, não link solto:
- Pill/botão com borda arredondada (`border-radius: 999px`), borda fina, fundo branco/transparente
- Texto: "Comenta '[PALAVRA]' e [ação]" — a palavra-chave em bold
- Acima do CTA, um elemento visual de "oferta": mockup de produto, foto de pessoa usando o produto/serviço, ou objeto simbólico (livro, ebook)
- Se o usuário não tiver oferta/lead magnet, adaptar pra CTA direto do negócio (ex: "Comenta 'ORÇAMENTO' e recebe uma proposta")

---

## Logo no slide final

Se `marca/design-guide.md` tiver logo, incluir de forma discreta (junto da barra de assinatura ou perto do CTA): 100-160px.

---

## HTML técnico

- 1080x1350px, inline CSS, Google Fonts via `<link>`
- Sem SVG de noise/textura (esse estilo é limpo, sem grão)
- Cor de destaque com moderação: uma aplicação por slide (palavra, sublinhado, ou fundo sólido — nunca as três)
- Bordas quase retas (`border-radius` baixo, 0-8px) em cards e imagens — o estilo é mais "editorial revista" que "app moderno arredondado"

---

## O que ajustar

- **Muito "corporativo"/sem graça:** aumenta contraste do peso tipográfico (mais black, menos regular), adiciona mais slides de prova social
- **Muito carregado:** reduz pra 1 elemento de prova social por carrossel, mais slides de texto puro com respiro
- **Falta autoridade:** adiciona dado com fonte, ou mockup de case real
- **Quer estilo específico:** descreve aqui

Qualquer mudança aqui vale pro próximo carrossel. Pede pro Claude: "muda a regra X no design do carrossel" e ele edita este arquivo.

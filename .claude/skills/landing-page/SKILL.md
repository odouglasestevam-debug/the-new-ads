---
name: landing-page
description: >
  Cria landing page de captação ou de vendas no padrão premium escuro aprovado pelo Douglas
  (fundo profundo, metálico de destaque, brilhos, texto em gradiente, vidro, pessoa recortada
  com luz, mockups, selos e animações), com identidade própria pra cada cliente, formulário
  com rastreio de UTM e conferência automática em desktop e celular. Use quando o Douglas
  pedir "landing page", "LP", "página de captação", "página de vendas", "página pro cliente X",
  "monta uma página igual à do Silvio", ou mandar uma página de referência pra se basear.
---

# /landing-page

Página única em HTML (CSS e JS embutidos), pronta pro Cloudflare Pages, no padrão visual que o
Douglas aprovou na página do Silvio Pacheco. Exemplo completo e funcionando:
`clientes/silvio-palestrante/paginas/landing-page/index.html` (fica fora do Git, só nesta máquina).

Arquivos da skill:
- `referencias/efeitos.md`: o código de cada efeito (tokens, botão, vidro, recorte com luz, feixe, selo, mockups...)
- `referencias/secoes.md`: catálogo de seções, formulário padrão e fórmulas de título
- `scripts/recorte.py`: tira o fundo do retrato do cliente
- `scripts/midia.py`: folha de contato de vídeo, quadros, compressão, poster e webp
- `scripts/referencia.js`: lê fontes, cores e gradientes de uma página de referência
- `scripts/qa.js`: prints de desktop e celular + relatório (vazamento lateral, erros, travessões, formulário)

## Regra anti-cópia (a mais importante)

Referência serve pra calibrar **nível de acabamento, efeitos e contraste**. Nunca pra copiar.
Caso real: a v2 da página do Silvio usou as cores exatas, as fontes, a ordem das seções, as frases e os
elementos-assinatura da LP do Método CIS (faixa vermelha, fitas diagonais, moeda de garantia, assinatura
sobre o recorte, faixa cinza de números). O Douglas reprovou: "ficou extremamente igual, isso é um problema".

Antes de entregar, conferir item a item. Tudo isso tem que ser **diferente da referência e da última LP feita**:
1. **Paleta**: base, metálico e cores de brilho próprios (tirados das fotos, da marca ou do mundo do cliente). Nenhum hex da referência.
2. **Fontes**: par diferente do da referência (rodar `scripts/referencia.js` pra saber qual é).
3. **Elemento-assinatura**: um efeito que só faz sentido pra esse cliente (Silvio: palco, feixe de luz e equalizador de voz).
4. **Ordem e composição das seções**: não seguir a sequência da referência bloco a bloco.
5. **Títulos e frases**: escritos do zero. Estrutura de frase da referência também não ("O maior X do mundo agora na sua casa").
6. **Formato dos componentes**: botão, card e selo com forma própria (pílula x raio 10, borda viva x borda fixa...).

Os efeitos do `efeitos.md` podem repetir entre clientes. A identidade não.

## Fluxo

### 0. Plano e perguntas de uma vez
Anunciar o plano em poucas linhas e pedir tudo que não dá pra descobrir sozinho, numa mensagem só:
- Cliente, oferta e objetivo da página (lead pelo formulário, WhatsApp direto ou venda)
- Público e as dores principais
- Material: fotos (de preferência retrato em fundo liso + fotos em ação), vídeo, logo, depoimentos, números
- Conteúdo: grade/etapas, formatos, preço (aparece ou não), garantia (existe ou não)
- Referência visual, se houver (link ou print)
- Domínio, destino do lead (webhook/n8n, WhatsApp) e pixel/GTM, se já definidos

Se o material vier gerado por IA ou fraco (ex: lista genérica de paletas), dizer onde discorda.
Faltou conteúdo: seguir com placeholder marcado (`<span class="ph">[00]</span>`) e lorem ipsum
só se o Douglas autorizar. Montar uma lista das perguntas pro cliente, pronta pra colar no WhatsApp.

### 1. Ler a referência (se houver)
`node scripts/referencia.js <url> <pasta-de-prints>` mostra fontes, cores e gradientes e tira prints.
Anotar o que é efeito (pode inspirar) e o que é identidade da referência (proibido repetir).

### 2. Definir a identidade do cliente
- **Conceito**: o mundo do cliente (palco, obra, consultório, cozinha...) e o elemento-assinatura que sai dele.
- **Paleta**: preencher os tokens do `efeitos.md` §1. Olhar as fotos primeiro: a página precisa conversar com a roupa e a luz delas.
- **Fontes** (Google Fonts, geométricas e pesadas nos títulos): Urbanist + Manrope (Silvio), Outfit + DM Sans,
  Lexend + Inter, Plus Jakarta Sans, Sora + Poppins (é a do CIS: evitar quando a referência for o CIS).
- **Logo**: se o cliente não tem, propor um simples (marca gráfica + nome) em SVG, com versão pra fundo escuro e claro,
  em `clientes/<cliente>/assets/logo/`. Avisar que é proposta.

### 3. Preparar a mídia
Originais em `clientes/<cliente>/assets/` (fotos, vídeo). Versões web em `paginas/landing-page/img/`.
```
python scripts/recorte.py <retrato.jpg> img/<nome>-hero.webp --previa <rascunho>/previa.jpg
python scripts/midia.py quadros <video.mp4> <rascunho>/quadros          (escolher cenas na folha de contato)
python scripts/midia.py quadro <video.mp4> img/plateia.webp --em 17.5 --recorte 0,1000,1080,920
python scripts/midia.py comprimir <video.mp4> img/video.mp4 --largura 540 --ate 34
python scripts/midia.py poster <video.mp4> img/video-poster.jpg --em 2
python scripts/midia.py webp <foto.jpg> img/<nome>.webp --max 1100
```
Conferir toda prévia de recorte (halo, fundo grudado, buraco no cabelo). Vídeo pra web: até uns 4 MB.
Nunca cortar a duração do vídeo do cliente sem pedido (cortar só o preto do fim).

### 4. Montar a página
Um `index.html` em `clientes/<cliente>/paginas/landing-page/`, compondo blocos do `secoes.md` com os efeitos do
`efeitos.md`. Antes de escrever, carregar a skill `frontend-design` pro plano visual.
- Mobile primeiro: 16px de respiro lateral, nada vazando, CTA fixo no rodapé do celular.
- Uma única seção clara (normalmente depoimentos) pra dar ritmo.
- Título com `.luz` + palavra-chave em `.ouro` em todas as seções.
- Imagens com `width`/`height` no HTML e `img{height:auto}` no CSS (sem isso o atributo de altura vale e a foto estica).
- Ícones desenhados pro cliente, nunca de biblioteca (Lucide, Feather...) dentro de quadradinho com fundo: o Douglas
  achou com "cara de IA". Padrão: sprite de `<symbol>` 32x32 no topo do `<body>`, duotone (miolo preenchido com o
  gradiente metálico + traço fino na cor clara), objetos do mundo do cliente, sem caixa, só um brilho de chão embaixo.
  Exemplo completo no `index.html` do Silvio (`#icones`). Seta, check, + e cadeado podem continuar de traço simples.
- Cuidado com seletor genérico tipo `.chip span{display:block}`: pega os placeholders e os ícones junto. Prefira classe própria.
- Versão substituída vai pra `paginas/_versoes-anteriores/` antes de sobrescrever.

### 5. Copy
- Português do Brasil, sem travessão (— ou –), sem clichê de IA, específico e concreto.
- Nada de número, depoimento, garantia ou promessa que o cliente não confirmou. Suposição vira placeholder ou
  entra na lista de "confirmar com o cliente" da entrega.
- Botão diz o que acontece. Frases de referência e de LP anterior não entram.

### 6. Conferir
```
node scripts/qa.js clientes/<cliente>/paginas/landing-page/index.html <rascunho>/qa
```
Precisa sair: largura da página igual à da tela nos dois tamanhos, nenhum elemento fora da tela, nenhum erro
no console, zero travessões e o formulário validando, aplicando máscara e enviando.
Depois **olhar os prints** (desktop e celular, seção por seção) e corrigir o que estiver feio, apertado ou
desalinhado. Rodar de novo até passar limpo. Fazer o checklist anti-cópia.

### 7. Entregar
- Mandar o caminho completo do `index.html` pra abrir com um clique.
- Resumir: conceito e assinatura escolhidos, o que é placeholder, as suposições a confirmar e o que falta pra publicar.
- Atualizar `clientes/<cliente>/briefing.md` (identidade visual, material recebido, pendências).
- Publicar só quando o Douglas pedir, com a skill `publicar-site` (link em thenewads.com.br, ou no domínio
  do cliente). Antes de publicar: webhook do lead ligado, pixel/GTM, política de privacidade e nenhum placeholder visível.

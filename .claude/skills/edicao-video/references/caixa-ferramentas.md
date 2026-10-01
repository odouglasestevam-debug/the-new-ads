# Caixa de ferramentas: quando usar cada elemento

Montada a partir das referências que o Douglas mandou em 01/10/2026 (`referencias-douglas.md`). Ele quer esse nível de edição nos vídeos: elementos que mostram edição profissional, usados com contexto. O COMO de cada um está no topo de `scripts/elementos.py`; aqui está o QUANDO.

## O princípio que separa edição profissional de efeito aleatório

O Douglas reprovou em 30/09 flash, glitch, whip, pulse e shake "soltos": pareceram aleatórios. As referências de 01/10 têm muito mais efeito e ele achou incrível. A diferença:

1. **O efeito interage com a cena ou com a fala.** O texto fica atrás da pessoa, deita no chão, a pessoa pisa nele. O sublinhado aparece na hora da palavra. O efeito por cima da imagem sem relação com nada (glitch no meio da frase) é o que parece aleatório.
2. **Cada elemento tem um motivo editorial**: apresentar o tema, provar, enumerar, chamar para a ação, virar de assunto. Se não dá para dizer o motivo em uma frase, não entra.
3. **Um protagonista por vez.** Título grande na cena pede legenda pequena (editorial). Tela cheia de motion esconde a legenda. Nunca dois elementos disputando o mesmo trecho.
4. **Respiro.** Entre dois elementos fortes, pelo menos 2 a 3 s de fala limpa (só corte e zoom). A ref3 alterna efeito e close sem efeito.
5. **Transição só na virada de assunto ou de cena**, não em todo corte. Corte seco com zoom continua sendo o padrão dentro do mesmo assunto.

## Ferramentas, uma a uma

| Ferramenta | Use quando | Não use quando | Gravação precisa |
|---|---|---|---|
| **Título de cena** (`texto`, par pesada + serifada itálica, com brilho) | Abrir o vídeo com o tema em 1 a 3 palavras ("sabe fazer?"); marcar a virada de assunto | Frase longa (mais de 4 palavras vira legenda); em cima do rosto | Nada |
| **Texto atrás da pessoa** (`camada: atras`) | Gancho e títulos de cena: dá profundidade e é o efeito que mais parece "editado de verdade". Melhor quando a pessoa se mexe e passa na frente | Pessoa colada no fundo da mesma cor da roupa; plano muito fechado no rosto (sobra pouco fundo) | Fundo com espaço livre atrás da pessoa (parede, céu) |
| **Texto preso na cena** (`ancora: cena`) | Sempre que o texto está "no cenário" (parede, chão): acompanha os zooms do próprio render | Texto que é informação de tela (número, CTA): esse fica `tela` | Câmera parada, ou `rastrear: true` com câmera na mão |
| **Texto em perspectiva** (`plano`) | Chão, mesa, parede lateral: palavra-tema "pisada" ou "escrita na parede". Ótimo para imobiliária, construção, arquitetura (o espaço é o produto) | Plano coberto pela pessoa quase o tempo todo; superfície muito texturizada (o texto some) | Superfície visível e plana; de preferência câmera parada |
| **Transição por foco** (`foco`) | Virada de assunto ou de cenário; entrada de um bloco novo. É a transição "elegante" das referências | Dentro da mesma frase; em todo corte (perde o efeito) | Nada |
| **Refrão de close** | Frase-gancho que volta 2 ou 3 vezes ("não sabe, né?") entre blocos, em close com título curto | Vídeo curto (menos de 20 s) | Gravar a frase em close, separada |
| **Clone** (`clone`) | Vídeo de bastidor, mostrar "várias funções" ou diálogo consigo mesmo; prova de domínio técnico | Anúncio sério (advocacia, saúde) sem motivo de roteiro | **Tripé travado**, luz igual, cada tomada numa posição; o Douglas grava as tomadas de propósito |
| **Rastro** (`rastro`) | Movimento amplo (caminhar, girar, gesto grande) em momento de energia | Pessoa sentada ou parada (o rastro nem aparece) | Câmera parada e movimento |
| **Moldura** (`moldura`) | Bloco final de oferta ou tutorial: vídeo emoldurado com título fixo ("clique em saiba mais") enquanto mostra exemplos; reforça o CTA sem cortar a fala | Vídeo inteiro (cansa); primeira metade do vídeo | Nada |
| **Print / imagem** (`imagem`) | Prova (resultado, depoimento, print de conversa), mockup, documento citado na fala. Entra no instante em que é citado e sai quando a fala muda | Decoração sem relação com a fala | O arquivo (print, logo, mockup) |
| **B-roll** (`video`) | "É no celular", mostrar o serviço acontecendo, o produto, o espaço | Cobrindo o rosto em momento de emoção ou de promessa | Os trechos de B-roll gravados (o som do B-roll não entra) |
| **Tipografia cinética** (`cinetica`) | Frase-tese do vídeo, curta, com 1 palavra no marca-texto ("A primeira **impressão** acontece **antes**"). Bom para agência, design, serviço intangível | Frase longa; mais de 2 telas seguidas | Nada |
| **Gancho largo com contorno** (`texto` com fonte `larga` e `contorno`) | Primeiros 2 s de anúncio, pergunta-gancho em 3 linhas com a palavra-chave em contorno ou na cor | Fora do gancho | Nada |
| **CTA com cursor** (`cta`) | Últimos 3 a 5 s de anúncio: "fale com a gente no WhatsApp" com o clique acontecendo | Conteúdo orgânico sem chamada | Nada |
| **Quadro branco** (`quadro`) | Explicar processo, funil, método, comparação: a fala vira diagrama. Plano único sem corte (ref2) fica bom com isso, porque a informação prende | Fala sem estrutura (opinião solta); fundo poluído | **Céu ou parede lisa** ocupando o terço de cima; pessoa no terço de baixo; câmera parada |
| **Legenda editorial** | Vídeo com títulos de cena e efeitos: a legenda fica pequena e elegante | Talking head simples sem elementos (aí a `highlight` retém mais) | Nada |
| **Legenda discreta** | Junto de motion ou CTA na tela | Idem | Nada |
| **Música com drop** (`--music-drop T`) | A música "cai" na virada para o bloco forte (entrada da tela de motion, revelação) | Vídeo sem bloco de virada | Música escolhida pelo Douglas |
| **Música que entra depois** (`--music-in T`) | Abrir só com voz e o gancho, e a trilha entra quando o vídeo "engrena" (ref3: entra em 7 s) | | |

## Receitas por objetivo

**Anúncio vitrine / demonstração de serviço (ref3)**: título atrás da pessoa no gancho, texto em perspectiva quando o espaço importa, transição por foco nas viradas, refrão de close, legenda editorial, moldura com CTA fixo no último terço, música entrando depois do gancho.

**Agência, design, serviço intangível (ref1)**: gancho largo com contorno, drop da música na entrada da tipografia cinética, portfólio com `imagem` (nome do cliente com sublinhado + 2 a 3 mockups), volta ao rosto com CTA de cursor, cartão de logo no fim (`imagem` com `fundo`).

**Explicativo, método, funil (ref2)**: plano aberto parado, quadro branco no céu/parede, sublinhado vermelho no instante da palavra, prints de prova entrando e saindo, câmera da lousa andando quando muda o bloco. Sem música.

**Autoridade (advocacia, saúde, contábil)**: o mínimo da caixa. Título de cena atrás da pessoa no gancho, `termo`/`lista` do cards.py, 1 print de prova, transição por foco só na virada, legenda editorial ou highlight. Nada de clone, rastro ou cursor.

**Varejo e oferta**: gancho largo com contorno, B-roll do produto, `imagem` com preço, CTA de cursor. Moldura no bloco da oferta.

## Densidade (teto, não meta)

- Vídeo de 30 s: 1 título de cena no gancho, até 3 elementos de prova ou ilustração, 1 a 2 transições por foco, 1 bloco final (moldura ou CTA).
- Nunca dois elementos de tela ao mesmo tempo, exceto moldura + CTA.
- Texto de cena: no máximo 4 palavras. O que for maior é cartão (cards.py) ou legenda.

## Checklist de gravação para o Douglas ou o cliente

Os efeitos de cena dependem da gravação. Antes de gravar um vídeo que vai usar a caixa:

1. **Tripé** sempre que houver texto atrás, perspectiva, clone ou rastro. Na mão, só `rastrear: true` em texto (e conferir).
2. **Espaço livre atrás e acima da pessoa** (parede lisa, céu) para o título atrás dela ou para o quadro branco.
3. **Clone**: gravar cada tomada numa posição diferente, sem mexer na câmera nem na luz, e anotar a ordem.
4. **Sumir atrás de algo** (ref3, caminhão): é encenação, não efeito. Gravar a pessoa saindo do quadro escondida pelo objeto que passa.
5. **B-roll**: gravar os trechos de "mão na massa" (celular, serviço, produto) logo depois da fala.
6. **Frase de refrão** em close, separada, 2 ou 3 vezes.

## Como conferir

- `python scripts/segment.py VIDEO --teste 3.2,8.0` antes de usar texto atrás ou clone: a folha mostra se o recorte pega a pessoa inteira.
- `python scripts/elementos.py VIDEO --work W --quadro T` dá o quadro com grade de 10% para escolher posição e os 4 cantos do plano.
- `python scripts/elementos.py VIDEO --work W --previa T1,T2` mostra os quadros já com os elementos, sem renderizar tudo (precisa de um render antes, o `--preview` serve).
- Sempre olhar a folha de contato do render: texto cortado na borda, texto em cima do rosto, recorte com buraco.

## Limites honestos

- O recorte é por IA local (MediaPipe). Cabelo solto e braço esticado rápido podem perder pedaço por um ou dois quadros; roupa da cor do fundo confunde. Conferir a folha de máscara.
- Rastreio com câmera na mão funciona em movimento suave; chicote, desfoque forte ou pessoa cobrindo quase todo o fundo fazem o texto escorregar.
- Elemento preso na cena não atravessa corte seco (a cena muda): o script avisa.
- O personagem gerado por IA da ref3 não entra: precisa de gerador de imagem/vídeo, fora do motor local.
- Prévia usa o recorte rápido; o render final usa o fino (mais lento, borda melhor).

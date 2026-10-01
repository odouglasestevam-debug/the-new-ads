# Caixa de ferramentas: quando usar cada elemento

Montada a partir das referências que o Douglas mandou em 01/10/2026 (`referencias-douglas.md`). Ele quer esse nível de edição nos vídeos: elementos que mostram edição profissional, usados com contexto. O COMO de cada um está no topo de `scripts/elementos.py`; aqui está o QUANDO.

## O princípio que separa edição profissional de efeito aleatório

O Douglas reprovou em 30/09 flash, glitch, whip, pulse e shake "soltos": pareceram aleatórios. As referências de 01/10 têm muito mais efeito e ele achou incrível. A diferença:

1. **O efeito interage com a cena ou com a fala.** O texto fica atrás da pessoa, deita no chão, a pessoa pisa nele. O sublinhado aparece na hora da palavra. O efeito por cima da imagem sem relação com nada (glitch no meio da frase) é o que parece aleatório.
2. **Cada elemento tem um motivo editorial**: apresentar o tema, provar, enumerar, chamar para a ação, virar de assunto. Se não dá para dizer o motivo em uma frase, não entra.
3. **Um protagonista por vez.** Título grande na cena pede legenda pequena (editorial). Tela cheia de motion esconde a legenda. Nunca dois elementos disputando o mesmo trecho.
4. **Respiro.** Entre dois elementos, pelo menos 2,5 s de fala limpa (só corte e zoom). A ref3 alterna efeito e close sem efeito. Ver "Dosagem" abaixo.
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

Cada receita lista o que combina com o objetivo. Não é para usar tudo: escolher de 2 a 4 (ver "Dosagem").

**Anúncio vitrine / demonstração de serviço (ref3)**: título atrás da pessoa no gancho, texto em perspectiva quando o espaço importa, transição por foco nas viradas, refrão de close, legenda editorial, moldura com CTA fixo no último terço, música entrando depois do gancho.

**Agência, design, serviço intangível (ref1)**: gancho largo com contorno, drop da música na entrada da tipografia cinética, portfólio com `imagem` (nome do cliente com sublinhado + 2 a 3 mockups), volta ao rosto com CTA de cursor, cartão de logo no fim (`imagem` com `fundo`).

**Explicativo, método, funil (ref2)**: plano aberto parado, quadro branco no céu/parede, sublinhado vermelho no instante da palavra, prints de prova entrando e saindo, câmera da lousa andando quando muda o bloco. Sem música.

**Autoridade (advocacia, saúde, contábil)**: o mínimo da caixa. Título de cena atrás da pessoa no gancho, `termo`/`lista` do cards.py, 1 print de prova, transição por foco só na virada, legenda editorial ou highlight. Nada de clone, rastro ou cursor.

**Varejo e oferta**: gancho largo com contorno, B-roll do produto, `imagem` com preço, CTA de cursor. Moldura no bloco da oferta.

## Dosagem: a caixa é para retenção, não vitrine (Douglas, 01/10/2026)

Depois de ver o vídeo de teste com as 13 ferramentas, o Douglas aprovou o resultado e corrigiu a dose: **nem todo vídeo usa tudo, os elementos não aparecem ao mesmo tempo, e a caixa entra com cautela, como recurso de retenção para o vídeo ficar dinâmico sem sobrecarregar.** O vídeo de teste mostra o que existe; ele não é o modelo de densidade.

1. **Cada elemento ocupa um ponto onde a atenção cai.** Os pontos típicos: o gancho (0 a 3 s), o meio da explicação quando ela fica longa (o trecho de 8 s ou mais só de fala), a virada de assunto e a chamada final. Fora desses pontos, fala limpa com corte e zoom.
2. **Um elemento por vez, sem exceção.** Nada sobreposto: nem moldura com CTA, nem clone com texto atrás. Escolher um. A legenda é a única camada que convive com eles, e some quando o elemento já diz a frase.
3. **Respiro de pelo menos 2,5 s de fala limpa entre dois elementos**, contando os cartões do `cards.py`. Se dois motivos caem colados, fica o mais forte, ou o cartão anda para a palavra exata da fala. A transição por foco é o próprio corte e não conta no respiro, mas fica a 1,5 s ou mais de qualquer elemento.
4. **Teto por vídeo, contando os cartões que já existem:** em 30 a 45 s, de 2 a 4 ferramentas da caixa e no máximo 6 a 7 momentos gráficos no total. Uma ferramenta aparece uma vez por vídeo, salvo a transição por foco (até 2, só em virada de assunto).
5. **Na dúvida, fica de fora.** O plano editorial lista cada elemento com o motivo em uma linha. Sem motivo claro de retenção ou de sentido, sai.
6. **As receitas abaixo são cardápio.** De cada receita, escolher as 2 a 4 ferramentas que o roteiro pede.

Texto de cena: no máximo 4 palavras. O que for maior é cartão (cards.py) ou legenda.

Exemplo de dose (01/10, IPTU da Regularize, 44,5 s, 3 cartões já existentes): entraram só 3 ferramentas. Título atrás da pessoa no gancho, tipografia cinética no meio dos 12 s só de fala e foco na virada para as consequências. O cartão do comentário andou para o instante em que ela começa a ler o comentário, e assim abriu respiro depois do gancho. O CTA com cursor ficou de fora porque a lista termina a 3,6 s do fim e não sobra respiro.

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

# Guia de efeitos sonoros (acervo `assets/sfx/`)

Origem das regras: reel de uma criadora de edição que o Douglas mandou em 30/09/2026 e disse gostar ("precisamos ter no nosso acervo"). **O reel só FALA dos efeitos: o áudio dele é só a voz dela, não toca nenhum efeito.** O que parecia efeito no espectrograma era respiração, estalo de boca e consoante (o "p" de "Para", o "sh" de "Rush"). Foi um erro de leitura meu; não existe som para recortar nele. Conferir isso com o Douglas ouvindo, antes de extrair som de qualquer reel (`scripts/sfx_ref.py`).

Consequência: os sons do acervo precisam ser criados por nós, e o Douglas aprova um por vez. Os sintéticos da primeira rodada foram reprovados nos cliques (o de mouse "nada a ver"). Ordem combinada: "vamos por parte", começando pelo woosh.

## O que o reel ensina

| Fala dela | Categoria do acervo |
|---|---|
| "Use *woosh* sempre que fizer um zoom in ou zoom out" | `rush` |
| "Para cortes rápidos ou algumas transições, procure *camera shutter*" | `shutter` |
| "Quando aparecer texto sendo digitado, use *keyboard* ou *typing*" | `typing` |
| "Cliques ficam perfeitos quando algum botão, elemento ou informação aparece" | `click` |
| "Se tiver animação aparecendo, busque *UI sounds*" | `ui` |
| "Antes de revelar informação importante, coloque um *riser* para gerar expectativa" | `riser` |
| "Logo depois da revelação, coloque um *hit* para dar impacto" | `hit` |

Ela termina com "comente para a parte 2": há mais categorias vindo. Quando o Douglas mandar a parte 2, transcrever com `transcribe.py`, acrescentar a categoria em `sfx_acervo.py` (lista `CATS`, `USO`, `GANHO`, `PADRAO`, geradores em `SONS`), rodar `gerar --forcar` e atualizar a tabela do SKILL.md.

## Sons reais do SaveClip (1).mp3 (01/10/2026): com a criadora falando o bloco

Este áudio (34 s) tem a voz dela anunciando o tipo ("Efeito sonoro de meme", "...de interface e tecnologia", "...de transição", "...cinematográficos") e logo depois os efeitos daquele tipo, sem música. No fim ela chama a parte 2 ("me segue aqui se você quer a parte dois dos efeitos sonoros"). Como o nome do bloco vem dela, a **categoria destes 25 sons é certa**; o que não sei é o que cada som é (não classifiquei nenhum por palpite).

Como foi separado: transcrição com palavra e tempo (faster-whisper) para achar onde a voz fala; cortes pelo silêncio digital entre os sons (nível abaixo de -58 dB por 6 ms ou mais) e, onde os sons estão colados, pelo salto de energia; confirmado que nenhum corte pega a voz. A fala dela acaba por volta de 1,13 s, 9,1 s, 15,3 s e 22,2 s. O que sobrou da voz entre a fala e o primeiro efeito foi descartado (ex.: o final de "transição").

| Bloco (categoria) | Ids | Quantos | Observação |
|---|---|---|---|
| meme (`meme`) | `meme_01` a `meme_08` | 8 | `meme_06` e `meme_08` são os sons 2 e 4 do primeiro arquivo (correlação 0,997), em versão completa; no SaveClip (1) a voz cobre o fim do `meme_08` |
| interface e tecnologia (`interface`) | `interface_01` a `interface_05` | 5 | `interface_01` junta 5 cliques curtos em sequência (0,65 s) e `interface_05` junta uma série de cerca de 11 tiques (1,2 s); se forem sons separados, dividir |
| transição (`transicao`) | `transicao_01` a `transicao_06` | 6 | |
| cinematográficos (`cinematico`) | `cinematico_01` a `cinematico_06` | 6 | `cinematico_06` é uma sequência de 4 pulsos a cada 0,5 s |

As 4 categorias novas não têm som padrão: escolher o som pelo id (`{"t": 5, "tipo": "transicao_03"}`); pedir só a categoria dá erro com a lista de ids. O original e os cortes sem normalizar ficam em `assets/sfx/_origem/saveclip1/`. Áudio de conferência: `saveclip2-efeitos-ouvir.mp3` (a voz diz "Meme 1", "Transição 3"... e o som toca 2 vezes); pasta `saveclip2-efeitos/` com um arquivo por som.

**Ainda sem uso definido:** o contexto de cada categoria é só o nome que a criadora deu (meme, interface e tecnologia, transição, cinematográficos). Falta o Douglas dizer, ouvindo, em qual momento do vídeo cada som cabe.

## Direção de som: quem decide o quê (01/10/2026)

O Douglas definiu que o **nome do bloco é o contexto** e que o Claude decide quando usar cada efeito. Como o Claude não ouve, a decisão usa o que é verificável: a fala (com tempo), os cortes, os cartões e o nome do bloco. O som exato dentro do bloco é escolhido por regra, não por gosto.

| Quem | Decide |
|---|---|
| Claude (lendo `sfx_mapa.py roteiro`) | em que instante entra um efeito de transição, interface ou cinematográfico, e por quê |
| `sfx.py` | qual som do bloco: fora os vetados, cabe no espaço até o próximo evento, rodízio (menos usado, depois o mais antigo; favorito conta metade), empate por semente estável do nome do vídeo; alinha o ponto mais forte do som ao instante |
| Douglas | aprova o mapa antes do render, ouve o vídeo e veta ou favorita sons |

Regras de decisão:
1. **Transição**: virada de assunto, no instante do corte. Entre duas, 6 s no mínimo. O zoom continua com o rush aprovado.
2. **Interface**: a fala cita tela, app, sistema, botão, site, WhatsApp; no instante da palavra. 1,2 s entre duas.
3. **Cinematográfico**: afirmação central do gancho (na palavra-chave) ou revelação principal. No máximo 2. Quando já há cartão `termo`, ele tem riser e hit próprios: não pôr cinematográfico em cima.
4. **Meme**: desligado. Só com `"sfx_meme": true` no perfil do cliente. O Douglas disse que dificilmente usa.
5. **Um som por evento**: o cartão já toca o seu; um pedido manual tira o som automático (rush) que caia a menos de 0,3 s dele. `"forcar": true` no evento ignora os limites.
6. **Densidade**: o padrão da skill é discreto (feedback do v1). Olhar o total do mapa; se estiver carregado, tirar primeiro os de interface, depois os de transição. O nível (`--nivel leve`) corta o rush dos cortes.
7. **Aprendizado**: cada som que o Douglas vetar vai para `assets/sfx/preferencias.json` (`vetar ID`) e nunca mais é escolhido; os favoritos (`favoritar ID`) entram mais vezes.

Caso de teste: vídeo do IPTU da Regularize (44,5 s), mapa com 4 efeitos de direção, 2 deles no lugar de rush: cinematográfico no "dono" do gancho, transição em "Mas isso não é verdade" e em "E isso pode trazer uma série de problemas", interface em "Clique no botão". Nada em cima da matrícula, que já tem riser e hit do cartão.

## Sons reais do SaveClip.mp3 (01/10/2026): sem voz, sem classificação

**ATENÇÃO: o Douglas ouviu e disse que "tudo errado": todos os palpites de categoria e de contexto abaixo foram reprovados.** Os sons ficam no acervo como "sem classificação" até ele dar o nome real de cada um (por número). Exceção: os sons 2 e 4 aparecem idênticos no bloco meme do SaveClip (1) e foram reclassificados como `meme_06` e `meme_08` (o palpite de hit/ui deles também estava errado). As tabelas abaixo registram só o que eu medi e o que errei; não usar como guia. Lição: classificar som de efeito por espectrograma e duração não funciona; a categoria vem de quem ouve.

O Douglas mandou um mp3 de 13,4 s com efeitos de verdade, sem voz. Foram separados por corte/silêncio em 10 sons e importados (mono 48k, pico 0,7, licença "desconhecida: uso interno"). O original e os recortes sem normalizar ficam em `assets/sfx/_origem/saveclip/`. A **categoria é palpite pela medição** (Claude não ouve): conferir de ouvido em `saveclip-sons-conferir.mp3` (a voz diz "Som N" e o som toca 3 vezes) e corrigir.

| Som | Id | Palpite | Medição |
|---|---|---|---|
| 1 | `ref01_rush_vento` | rush | ruído de ar que decai em 1,7 s; começa cortado no original |
| 2 | `meme_06` (era `ref02`) | hit | sub-grave pulsado (cerca de 60 Hz), 0,7 s, termina seco |
| 3 | `ref03_shutter_duplo` | shutter | dois estalos de banda larga com 90 ms entre eles (pode ser clique de mouse) |
| 4 | `meme_08` (era `ref04`) | ui | tom harmônico suave, 1,5 s |
| 5 | `ref05_ui_pop_duplo` | ui | dois toques tonais de cerca de 700 Hz, 0,3 s |
| 6 | `ref06_ui_ding` | ui | ding de cerca de 2,6 kHz, cauda de 1 s |
| 7 | `ref07_click_toque_grave` | click | toque grave de cerca de 420 Hz, 0,45 s |
| 8 | `ref08_click_duplo` | click | dois cliques com ressonância metálica, 0,3 s entre eles |
| 9 | `ref09_ui_brilho_metalico` | ui | brilho metálico com parciais agudos, 1,1 s |
| 10 | `ref10_hit_longo_grave` | hit | impacto grave com cauda de 4,4 s |

**Quando usar cada um** (proposta por categoria e duração, a confirmar de ouvido; fica também no `quando_usar` de cada som no catálogo):

| Id | Contexto |
|---|---|
| `ref01_rush_vento` | zoom out ou saída de cena; o ar nasce forte na emenda e morre em 1,7 s |
| `meme_06` (era `ref02`) | logo depois de revelar algo (preço, número, produto), no mesmo instante; par do riser |
| `ref03_shutter_duplo` | corte seco, foto ou print aparecendo, antes e depois; o segundo estalo encaixa no corte |
| `meme_08` (era `ref04`) | elemento grande entrando (cartão, título, tela abrindo); suave |
| `ref05_ui_pop_duplo` | dois itens aparecendo seguidos (ícones, selos, lista curta) |
| `ref06_ui_ding` | notificação, check, confirmação, venda aprovada; resultado positivo |
| `ref07_click_toque_grave` | toque em botão ou aba, item de lista marcado, riscar; serve em sequência |
| `ref08_click_duplo` | clique de mouse (aperta e solta) em botão na tela; um por vez |
| `ref09_ui_brilho_metalico` | destaque de algo valioso: selo, garantia, "novo", brilho em logo ou número |
| `ref10_hit_longo_grave` | revelação principal ou abertura do gancho; cauda de 4,4 s cobre pausa dramática; no máximo um por vídeo |

Não há typing nem riser neste arquivo. Nenhum dos 10 é padrão de categoria: o padrão só muda quando o Douglas aprovar um som de ouvido (aí `PADRAO` em `sfx_acervo.py` e `padrao` no catálogo).

## Limites

- Claude não ouve: os sons foram conferidos por medição (forma do envelope, banda, pico, sem NaN), não de ouvido. Quem aprova é o Douglas, pelo `acervo-sfx-demo.mp4`.
- Sons sintéticos soam limpos demais perto de gravação real. Se algum não agradar, importar um real (Freesound CC0, Pixabay Sound Effects, Mixkit) com `importar` e `--licenca`.
- O padrão da skill continua discreto (feedback do v1): só `rush` nos cortes e os sons dos cartões entram sozinhos. `shutter`, `hit` e `riser` fora do cartão `termo` só por pedido.

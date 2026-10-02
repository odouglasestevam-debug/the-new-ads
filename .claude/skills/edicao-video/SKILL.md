---
name: edicao-video
description: Edita vídeo de fala (talking head, reels, criativo de anúncio) com a personalidade do cliente. Transcreve local, corta pausas, dá zoom de retenção, faz legenda animada com destaque na palavra falada (highlight, pop, karaokê, bounce), aplica efeitos sonoros, corrige a imagem conforme o ambiente (luz fraca, sol, contraluz, HDR), mixa música e entrega em -14 LUFS. Use quando o Douglas pedir "edita esse vídeo", "legenda animada", "legenda estilo capcut", "corta as pausas", "tira os vazios", "deixa com mais retenção", "reel", "criativo em vídeo", "coloca efeito sonoro", "acervo de sons", "riser", "hit", "zoom" ou "transição". Também tem a caixa de ferramentas de edição profissional: texto atrás da pessoa, texto em perspectiva no chão ou na parede, transição por foco, clone, rastro, moldura com título, print e B-roll, tipografia cinética com marca-texto, CTA com cursor e quadro branco desenhado sincronizado com a fala. Use também quando ele pedir "edição profissional", "efeito de texto atrás", "texto no chão", "clone", "motion", "quadro branco" ou mandar um reel de referência. Tudo roda local, sem serviço pago.
---

# Edição de vídeo da The New Ads

Motor local (ffmpeg + faster-whisper + MediaPipe). Nada do vídeo sai da máquina. Foi montado depois de auditar 4 skills de terceiros (ver `references/auditoria.md`) e herda o que já funcionou nos vídeos da Regularize.

Scripts em `.claude/skills/edicao-video/scripts/`. Saídas em `<pasta do vídeo>/_edicao/<nome do vídeo>/`.

## Regras que valem sempre

1. **Nunca cortar sem pedido.** Corte de pausa só quando o Douglas pediu corte neste pedido. Sem pedido de corte, use `--no-cuts` (legenda, cor, áudio e zoom sem mexer na duração). Duração é decisão dele.
2. **Planejar antes de executar.** Antes de tocar no vídeo, anunciar o plano e perguntar tudo que falta de uma vez só (etapa 1). Nada de perguntar em conta-gotas.
3. **Bruto diferente do pedido: parar e avisar.** Se a transcrição não tem o que ele descreveu (falta o corpo, só conversa, vídeo sem fala), mandar resumo com minutagem e as opções, e esperar. O script já recusa cortar vídeo sem fala.
4. **Regravações: o Douglas escolhe o take.** O plano avisa quando a mesma frase foi dita mais de uma vez. Nunca escolher sozinho.
5. **Conferir por medição, não por miniatura.** Rodar `verify.py` e olhar a folha de contato e o antes/depois. Não dizer "conferi quadro a quadro" sem `--gaze` em vídeo de pessoa. Claude não ouve áudio: reportar os números (LUFS, pico) e dizer que não ouviu.
6. **Sem travessão em nenhuma legenda ou texto.** O script troca por vírgula, mas revise o gancho que você escrever.
7. **Não baixar nem rodar nada de terceiros.** Só `fetch_assets.py` usa rede (fontes OFL e modelo do MediaPipe), uma vez.
8. **Sempre terminar mandando o caminho completo do arquivo final** para abrir com 1 clique.
9. **Não entregar copy de anúncio em arquivo.** Gancho e texto vão no chat; só salvar se ele pedir.

## Primeira vez (uma vez por máquina)

```
pip install -r ".claude/skills/edicao-video/requirements.txt"     # só em máquina nova; nesta já está tudo instalado
python ".claude/skills/edicao-video/scripts/fetch_assets.py"
```
Baixa 13 fontes OFL (Poppins, Anton, Bebas Neue, Archivo Black, DM Serif Display, Instrument Serif e itálico, Krona One, Kalam, Barlow Condensed Light e ExtraBold), o modelo de rosto, os dois modelos de recorte de pessoa (fino para o render final, rápido para a prévia) e as 21 trilhas de fundo do Mixkit (`--only musica`, ~90 MB, fora do Git porque a licença proíbe redistribuir o arquivo; depois rodar `python scripts/musica.py analisar`). Requisitos já instalados: ffmpeg (via imageio-ffmpeg), faster-whisper, mediapipe, PIL, numpy. A fonte da marca TNA (Clash Display) é manual: baixar na Fontshare e colocar em `fonts/ClashDisplay-Bold.ttf`.

## Fluxo

### 0. Entender a empresa (personalidade)
Antes de qualquer escolha visual, montar o perfil do cliente. Ver `references/perfil-cliente.md`.
- Ler `clientes/<cliente>/briefing.md`, `clientes/<cliente>/CLAUDE.md` (se existir) e, se houver, `clientes/<cliente>/docs/perfil-edicao.json`.
- Para vídeo da própria TNA: `marca/design-guide.md` (âmbar `#FF6A00`, sério mas humano, sem hype).
- Extrair: segmento, tom, cor de destaque da marca, fonte, palavras do negócio que merecem destaque (IPTU, matrícula, grátis), CTA, onde vai rodar (Reels, anúncio, YouTube).
- Se não existir perfil, propor um a partir do segmento (`presets.json > segmentos`) e confirmar com o Douglas. Salvar em `clientes/<cliente>/docs/perfil-edicao.json`.

### 1. Plano e perguntas (uma mensagem só)
Olhar o arquivo (`probe`: formato, duração, HDR) e anunciar o que vai fazer. Perguntar de uma vez só o que falta:
- Pode cortar pausas? Qual o alvo (duração, placement)?
- Estilo de legenda (mostrar `references/estilos.md`) e cor de destaque.
- Gancho de texto nos primeiros 2 segundos? Qual?
- Música: **sempre entra** (Douglas, 01/10: "música é indispensável"). A trilha sai sozinha do acervo pelo clima do perfil (etapa 6c). Só perguntar se ele quer uma trilha específica ou outro clima; sem música, só se ele pedir (`--no-music`).
- Formato de saída (9:16, 4:5, 1:1). Vertical para horizontal quase nunca presta.
Responder pelo que dá para descobrir sozinho (formato, segmento, ambiente).

### 2. Transcrever (local)
```
python ".claude/skills/edicao-video/scripts/transcribe.py" "VIDEO" --prompt "nomes e siglas do cliente"
```
`--model medium` é o padrão (português bom). `large-v3` para áudio difícil. O `--prompt` com o vocabulário do cliente corrige nomes e siglas.

### 3. Comparar o bruto com o pedido
Ler a transcrição impressa. Bateu com o que o Douglas descreveu? Se não, regra 3.

### 4. Plano de cortes (mostrar e esperar o OK)
```
python ".claude/skills/edicao-video/scripts/plan_cuts.py" "VIDEO" --gap 0.35 --zoom 1.12
```
Mostra cada corte, quanto tira, pausas longas (podem ser dramáticas), regravações e palavras descartadas.

**Bruto com regravações (o caso comum):** depois que o Douglas escolher os takes (ou delegar), aplicar com `--keep "1.3-4.9,22.8-30.1,..."` (mantém só esses trechos do bruto, em segundos) ou `--drop` (remove trechos). Olhe as palavras com tempo (print do `words.json`) para achar as bordas exatas; a borda nunca invade a palavra vizinha que ficou de fora. O editor segue a ordem do bruto: não reordena frases. Para escolher entre takes, **meça o olhar** de cada candidato (`gaze_events` em `verify.py`) e prefira o que fica menos tempo olhando para baixo.

**Olhar para baixo no fim das frases (`--gaze`):** apara a borda onde o olhar cai e, quando cai dentro da última palavra, faz **L-cut** automático (a imagem troca antes do áudio acabar), só se o trecho de imagem emprestado do próximo clipe estiver em silêncio e sem olhar baixo. O relatório lista o olhar que sobrou. Sobrando, conferir os quadros: até ~0,3 s no fim de frase é aceitável (o `whip` costuma cobrir); no meio da fala, avisar o Douglas.

**Duas partes gravadas separadas:** o editor trabalha com um arquivo de origem. Juntar os brutos sem recodificar (`ffmpeg -f concat -safe 0 -i lista.txt -c copy`), montar o `words.json` somando à segunda parte a duração da primeira, e rodar tudo sobre esse arquivo com `--work` numa pasta própria.

**Transcrição ruim:** se os tempos das palavras ficarem absurdos (palavra de vários segundos, texto alucinado no fim), refazer com `transcribe.py --vad`. Erros recorrentes de grafia (o Whisper escreve "PTU" para "IPTU") vão em `correcoes` no perfil ou em `correcoes.json` na pasta de trabalho. Ajustes: `--gap` maior corta só pausas maiores, `--fillers` (só com pedido) tira "ãh/hum", `--no-cuts` não corta nada, `--interrupt 0` desliga trocas de zoom sem corte. Apresentar o resumo ao Douglas e esperar confirmação antes de seguir. Se houver regravação, perguntar qual take fica.

### 4b. Voz: tratar o áudio de mic distante (quase sempre vale)
```
python ".claude/skills/edicao-video/scripts/voz.py" "VIDEO" --work "PASTA"      # VoiceFixer, ~1,5x a duração, em segundo plano
```
Tira eco e ruído, alinha com o áudio da câmera (o VoiceFixer adianta ou atrasa a voz em alguns ms, e o script mede e corrige; o "lag residual" impresso tem que ser ~0) e o render aplica a EQ compensatória. Os cortes continuam saindo do áudio original. Sem `voz_restaurada.wav` o render usa o áudio da câmera com denoise leve, que soa claramente pior. Conferir: curva de frequências contra uma edição que o Douglas aprovou (3 faixas bastam: 1-2k, 2-4k e 4-8k) e transcrição do áudio final contra o roteiro.

### 5. Legendas e palavras-chave
Claude lê a transcrição e escolhe as palavras-chave (em média 1 a cada 2 frases: o número, o termo do negócio, a promessa, o "não"). Nada de destacar tudo.
```
python ".claude/skills/edicao-video/scripts/captions.py" "VIDEO" --profile "clientes/<c>/docs/perfil-edicao.json" --keywords "IPTU,matrícula,dono" --hook "TEXTO DO\nGANCHO" --hook-pos 0.2
```
Sem perfil: `--segmento imobiliaria_construcao --style highlight --accent "#E0B84A"`. Extrair um quadro do vídeo antes (ver etapa 7) para escolher `--hook-pos` fora de logo e rosto. Números e valores sempre ganham destaque sozinhos.

### 5b. Elementos gráficos que contam a história (o que faz a edição parecer trabalhada)
Legenda e corte sozinhos deixam o vídeo liso demais. A edição que o Douglas aprovou tinha cartões que mostram o que está sendo dito:
- `comentario`: cartão branco com o comentário citado, e um risco vermelho quando ela nega ("verdade");
- `termo`: cartão escuro com o termo-chave em serifa dourada ("O ÚNICO DOCUMENTO QUE PROVA: Matrícula");
- `lista`: título e itens surgindo um a um com X vermelho (ou check), na hora em que ela enumera;
- `tipografia`: tela cheia com o texto da fala aparecendo palavra por palavra (cobre olhar para baixo no meio da fala; a legenda some enquanto está no ar).
```
python ".claude/skills/edicao-video/scripts/cards.py" "VIDEO" --work "PASTA" --tempos     # instante de cada palavra no vídeo final
# escrever PASTA/cards.json (formato no topo de cards.py), depois:
python ".claude/skills/edicao-video/scripts/cards.py" "VIDEO" --work "PASTA" --profile ...
```
Escolher onde entra cada cartão é decisão editorial minha: ler a transcrição e procurar citação ("todo dia alguém comenta..."), termo que define o assunto, enumeração ("dificuldade de venda, de financiamento, ...") e negação. Rodar `captions.py` de novo depois de criar cartão tipográfico (ele tira a legenda do trecho). Pode ficar em cima do logo: é proposital.

### 5c. Caixa de ferramentas de edição profissional (referências de 01/10/2026)
O Douglas mandou 3 reels como o nível de edição que ele quer (`references/referencias-douglas.md`) e pediu que eu saiba fazer e saiba QUANDO usar cada elemento. **Antes de escolher, ler `references/caixa-ferramentas.md`**: princípio (efeito que interage com a cena ou com a fala, nunca solto), ferramenta por ferramenta com quando usar e quando não, receitas por objetivo, teto de densidade e o checklist de gravação. O formato de cada elemento está no topo de `scripts/elementos.py`.

**Cautela de editor (Douglas, 01/10/2026): a caixa é recurso de retenção, não vitrine.** Ele aprovou o vídeo de teste, mas corrigiu a dose. Nem todo vídeo usa tudo e os elementos nunca aparecem ao mesmo tempo. Eles servem para o vídeo ficar dinâmico sem sobrecarregar. Na prática:
1. Um elemento por ponto de queda de atenção: gancho, meio da explicação longa, virada de assunto, chamada final.
2. Um por vez, sem sobreposição, nem moldura com CTA.
3. Pelo menos 2,5 s de fala limpa entre dois, contando os cartões.
4. Em 30 a 45 s, de 2 a 4 ferramentas da caixa e no máximo 6 a 7 momentos gráficos somando os cartões.
5. Na dúvida, fica de fora.

O vídeo de teste com 13 elementos mostra o que existe, não a densidade a usar. Detalhes e o exemplo do IPTU em `references/caixa-ferramentas.md`, seção "Dosagem".

| Ferramenta | Tipo em `elementos.json` |
|---|---|
| Título de cena (pesada + serifada itálica, brilho, contorno, marca-texto) | `texto` |
| Texto atrás da pessoa / preso na cena (acompanha zoom; `rastrear` com câmera na mão) | `texto` com `camada: atras`, `ancora: cena` |
| Texto em perspectiva no chão, mesa ou parede, com oclusão e textura | `texto` com `plano` (4 cantos) |
| Transição por foco (desfoca, clareia, foca) | `foco`, ou `"transicao": ["foco"]` no perfil |
| Clone (outra tomada da mesma pessoa, tripé) e rastro (eco do movimento) | `clone`, `rastro` |
| Moldura com título fixo (bloco de oferta/CTA) | `moldura` |
| Print, mockup, logo, cartão final; B-roll em janela ou tela cheia | `imagem`, `video` |
| Tipografia cinética em tela cheia (palavra entra focando, marca-texto cresce) | `cinetica` |
| CTA falso com cursor que clica | `cta` |
| Quadro branco desenhado à mão, sincronizado com a fala, câmera andando pela lousa | `quadro` (ver `el_quadro.py`) |

```
python ".claude/skills/edicao-video/scripts/segment.py" "VIDEO" --teste 3.2,8.0          # o recorte pega a pessoa inteira?
python ".claude/skills/edicao-video/scripts/render.py" "VIDEO" --profile ... --preview     # gera base.mp4 e geometria.json
python ".claude/skills/edicao-video/scripts/elementos.py" "VIDEO" --work "PASTA" --quadro 4.2   # quadro com grade de 10% (posição, cantos do plano)
# escrever PASTA/elementos.json, conferir sem renderizar tudo:
python ".claude/skills/edicao-video/scripts/elementos.py" "VIDEO" --work "PASTA" --previa 3.1,8.4,12.0
```
- O `render.py` aplica sozinho quando existe `elementos.json`: base (cortes, zoom, cor) -> elementos -> cartões e legenda por cima. A legenda some sozinha nas telas `cinetica` e em qualquer elemento com `"esconde_legenda": true`.
- Com títulos de cena, usar a legenda `editorial` (serifada pequena, palavra-chave em itálico) ou `discreta`; a `highlight` compete com eles.
- Música: `--music-in 7.0` (entra depois do gancho) e `--music-drop 5.7` (acha o drop da música e encaixa na virada para o bloco forte). Conferir de ouvido.
- Elemento preso na cena não atravessa corte seco: o script avisa. Clone, rastro, perspectiva e texto atrás pedem câmera parada; se o bruto não foi gravado assim, dizer ao Douglas antes de prometer o efeito.
- O plano editorial (quais ferramentas, em que instante e por quê) vai junto do plano da etapa 1 ou depois dos cortes, para o Douglas aprovar antes do render.

### 6. Efeitos visuais, efeitos sonoros, render e verificação

**Feedback do Douglas (30/09, vale para todos os clientes): o "zoom" que ele quer é o CORTE que aproxima o personagem da tela e fica assim até o próximo corte, em ritmo de ~2 s. Zoom que vai e volta (`pulse`, `shake`), sons agudos (`pop`, `shimmer`) e efeitos de transição chamativos (`flash`, `whip`, `glitch`) parecem "aleatórios" para ele. Padrão: só corte seco com zoom alternado e whoosh discreto nos cortes.** Os efeitos abaixo existem, mas só usar quando ele pedir. **Isso não vale para a caixa de ferramentas da etapa 5c (01/10):** aqueles elementos interagem com a cena e com a fala, ele quer esse nível, e eu decido onde entram seguindo `references/caixa-ferramentas.md`. A transição `foco` é a exceção elegante para virada de assunto.
```
python ".claude/skills/edicao-video/scripts/plan_fx.py" "VIDEO" --profile ... [--nivel leve|media|alta|off] [--music "arquivo.mp3"]
python ".claude/skills/edicao-video/scripts/sfx.py" "VIDEO" --profile ...
python ".claude/skills/edicao-video/scripts/render.py" "VIDEO" --profile ... --preview     # rápido, para conferir
python ".claude/skills/edicao-video/scripts/render.py" "VIDEO" --profile ... [--music "arquivo.mp3"] [--aspect 9:16] [--grade estudio_neutro]
python ".claude/skills/edicao-video/scripts/verify.py" "VIDEO" --gaze --echo --ref "VIDEO"
```
- `render.py` escolhe a correção de imagem pela exposição (`--grade auto`): luz fraca, sol forte ou natural. Cast de cor só vira aviso. **Ver sempre o `antes_depois.png`.** O preset `natural` foi calibrado em pessoa; em comida e produto esquenta demais, usar `--grade estudio_neutro`.
- HDR (iPhone/câmera) é convertido para SDR sozinho.
- Vídeo de iPhone vem com marca de giro (displaymatrix: o 4K é gravado deitado). O ffmpeg 7.1 copia essa marca para a saída quando o filtro usa a entrada em vários trechos, e quem lê o arquivo gira de novo. O `render.py` apaga a marca (`sidedata=delete`) e o `elementos.py` lê a base com `-noautorotate`. Achado em 01/10: os quadros da prévia saíram em listras.
- **Efeitos no estilo CapCut** (recriados em ffmpeg, sem licença de terceiros): transições `flash`, `whip`, `glitch`, `dip_preto`, `zoom_blur` e corte seco; impacto `pulse` e `shake` nas palavras-chave; looks `grain`, `vinheta`, `vhs`. `plan_fx.py` escolhe onde entram pela sequência do perfil (`transicao`, `impacto`, `gancho_fx`, `look`). Lista: `python scripts/fx.py`. Forçar um efeito: `fx_manual.json` na pasta de trabalho, `[{"t": 12.3, "fx": "shake"}]`. Com `--music`, o impacto encaixa na batida mais próxima. `--no-fx` desliga tudo, `--look grain,vinheta` troca o look.
- **Vídeo horizontal em tela vertical**: `--fit blur` mostra o quadro inteiro sobre um fundo desfocado (como o CapCut), em vez de recortar e ampliar.
- Os efeitos entram antes da legenda, então o texto continua legível durante flash e glitch. Sempre conferir no preview se o efeito não cai em cima de um gesto ou de um logo.
- **Acervo de efeitos sonoros** (`assets/sfx/`, 28 sons originais gerados em código, sem direito autoral, mais 33 sons reais recortados de dois áudios que o Douglas mandou em 01/10/2026 (SaveClip.mp3 e SaveClip (1).mp3; licença desconhecida: uso interno); regras do guia de SFX do reel que o Douglas aprovou em 30/09/2026; os SONS ainda estão em aprovação, um por vez). Cada som é amarrado a algo que aparece na tela:

  | Categoria | Quando usar | Padrão |
  |---|---|---|
  | `rush` | zoom in ou zoom out (o corte que aproxima ou afasta). `rush_in_*` quando aproxima, `rush_out_*` quando afasta | automático nos cortes |
  | `shutter` | cortes rápidos e transições secas | só por pedido |
  | `typing` | texto digitado ou revelado na tela | só com `"sfx_cartoes": "completo"` no perfil (desde 01/10) |
  | `click` | botão, elemento ou informação que aparece; item de lista; riscar | só com `"sfx_cartoes": "completo"` (desde 01/10) |
  | `ui` | animação aparecendo: cartão, ícone, check, notificação | só com `"sfx_cartoes": "completo"` (desde 01/10) |
  | `riser` | ANTES de revelar informação importante; termina na revelação | automático no cartão `termo` |
  | `hit` | DEPOIS da revelação, no mesmo instante; dá o impacto | automático no cartão `termo` |
  | `meme` | momento de humor, reação engraçada (8 sons: `meme_01` a `meme_08`) | só por pedido, escolher o id |
  | `interface` | tela, app, digitação, dado carregando (5 sons: `interface_01` a `05`) | só por pedido, escolher o id |
  | `transicao` | passagem entre cenas ou blocos (6 sons: `transicao_01` a `06`) | só por pedido, escolher o id |
  | `cinematico` | momento dramático, tensão, revelação (6 sons: `cinematico_01` a `06`) | só por pedido, escolher o id |

  `python scripts/sfx_acervo.py listar` mostra todos os sons; `demo` gera um vídeo com o nome de cada som na tela e `audio` gera um mp3 (voz Maria do Windows diz o nome, o som toca 2 vezes) com índice de tempos, para o Douglas ouvir e escolher; `importar ARQ --cat click --id click_x --licenca "CC0 Freesound"` cadastra um som real (a licença é obrigatória; um som importado com o id de um sintético o substitui). Perfil do cliente pode trocar um som por outro (`"sfx_acervo": {"hit_seco": "hit_metal"}`) e desligar o rush direcional (`"sfx_rush_direcional": false`). O reel de referência dele (30/09) NÃO tem efeito tocando, só a voz da criadora: não há o que recortar. Os sons reais vêm de dois áudios (01/10): o `SaveClip (1).mp3` tem a criadora falando o bloco (meme, interface e tecnologia, transição, cinematográficos) e depois os efeitos, então esses 25 sons têm categoria certa (`meme_01`..., `interface_01`..., `transicao_01`..., `cinematico_01`...); as 4 categorias novas não têm som padrão, escolher pelo id em `sfx_manual.json`, ex. `{"t": 5, "tipo": "transicao_03"}`. O `SaveClip.mp3` (sem voz) virou `ref01`, `ref03`, `ref05` a `ref10`: o Douglas reprovou os palpites de categoria que eu dei, então ficam SEM CLASSIFICAÇÃO (não usar até ele dizer o que são); só `ref02` e `ref04` foram identificados, pois aparecem idênticos no bloco meme (viraram `meme_06` e `meme_08`). Antes de usar em anúncio de cliente, avisar que a licença é desconhecida. Os sons são criados por nós e aprovados um por vez (começando pelo woosh); cliques e mouse sintéticos foram reprovados. `scripts/sfx_ref.py` recorta sons de um reel, mas só usar depois de confirmar que o reel realmente tem efeito (ouvir).
  `sfx.py` põe sozinho os sons dos cartões de `cards.json` (não contam no teto de densidade) e o `rush` direcional nos cortes. Fora dos cartões, qualquer som entra por `sfx_manual.json`: `[{"t": 12.3, "tipo": "impact"}, {"t": 20, "tipo": "riser", "dur": 1.5}, {"t": 20, "tipo": "hit"}, {"t": 5, "tipo": "click", "id": "click_mouse"}]`. `tipo` aceita som antigo (whoosh, pop, impact, tick, glitch, shimmer), categoria ou id do acervo. Riser e hit sempre em par, no mesmo instante. Detalhes e pontos em aberto em `references/sfx-guia.md`.
- `verify.py` mede: loudness e pico (alvo -14 LUFS, pico até -1 dBFS), pausas que sobraram, fonte/tempos da legenda, folha de contato nas emendas, antes/depois, olhar para baixo (`--gaze`) e cauda de eco (`--echo`, comparar com o bruto via `--ref`).

### 6b. Direção de som (eu decido onde entra cada efeito; o Douglas aprova o mapa)
Com cortes, cartões e fx prontos, antes do render. O nome do bloco do acervo é o contexto (decisão do Douglas, 01/10/2026):
```
python ".claude/skills/edicao-video/scripts/sfx_mapa.py" roteiro "VIDEO"      # a edição pronta: fala por trecho, cortes, cartões, pistas
# ler, decidir e escrever PASTA/sfx_manual.json  [{"t": 11.32, "tipo": "transicao", "motivo": "...", "frase": "..."}]
python ".claude/skills/edicao-video/scripts/sfx.py" "VIDEO" --profile ...
python ".claude/skills/edicao-video/scripts/sfx_mapa.py" mapa "VIDEO"         # tempo, frase, som, motivo; mostrar ao Douglas
```
| Bloco | Entra quando | Limite |
|---|---|---|
| `transicao` | virada de assunto (do que ela comenta para a verdade, da regra para as consequências); no instante do corte | 6 s entre duas |
| `interface` | a fala cita tela, app, sistema, botão, WhatsApp; no instante da palavra | 1,2 s entre duas |
| `cinematico` | afirmação central do gancho ou revelação principal | 2 por vídeo |
| `meme` | só se o perfil tiver `"sfx_meme": true` (padrão desligado; o Douglas quase não usa) | |

**Cautela de editor (Douglas, 01/10/2026): ter o acervo à mão não é usar todos.** O silêncio é o padrão e cada efeito precisa de um motivo que eu consiga escrever em uma linha; sem motivo, não entra. Na prática: (1) o efeito marca a virada ou a palavra que carrega o vídeo, não cada corte; (2) um momento de som por vez, nada colado em outro (o rush automático cede a pedido manual ou cartão a menos de 2,5 s); (3) meta de até 3 efeitos por 10 s contando os dos cartões, e o `sfx.py` avisa acima disso; (4) a direção própria é pouca: em um vídeo de 45 s, em torno de 4 eventos, e no máximo 1 cinematográfico além do gancho; (5) vídeo carregado perde primeiro os de interface, depois os de transição, depois o rush; (6) com `sfx_manual.json` presente, o rush automático cai para a densidade de `leve`. A v3 do IPTU (22 efeitos, 4,9 por 10 s) foi reprovada por excesso; a v4, com 13 (2,9 por 10 s), também foi: "exagero de efeito sonoro" (01/10, segunda correção).

**Regra atual, que substitui as metas acima (Douglas, 01/10/2026): teto DURO de 1 momento de som a cada 10 s, com música por baixo.**
- O `sfx.py` aplica o teto sozinho. Sons a menos de 0,35 s formam um momento só, como riser e hit.
- Passando do teto, sai primeiro interface, depois meme, cartão, clique, rush, transição sem transição na imagem, transição e por último o cinematográfico, o riser e o hit.
- O que saiu fica em `sfx_ignorados.json`, com o motivo.
- Cartão só toca na revelação, o riser e o hit do `termo`. Entrada de cartão, item de lista, risco e digitação ficam mudos, porque a música já dá o ritmo.
- Perfil pode mudar: `"sfx_momentos_10s"` e `"sfx_cartoes": "completo"`.
- Em 45 s, isso dá uns 4 momentos: o gancho, a revelação e as viradas.
- O IPTU com elementos ficou com 4: cinematográfico no "dono", transição no "mas isso não é verdade", riser e hit na matrícula, e transição com o foco na virada.

### 6c. Música (indispensável)
Todo vídeo sai com trilha de fundo (Douglas, 01/10: "falta música de fundo, a skill precisa fazer isso, música é indispensável").
- **Origem:** acervo em `assets/musica/` com 21 trilhas instrumentais do Mixkit em 6 climas: corporativo, sério, leve, energia, inspirador e elegante.
- **Licença:** permite uso comercial e anúncio online sem crédito. Proíbe TV, rádio, CD/DVD, games e redistribuir o arquivo. Anúncio em TV ou rádio pede outra trilha.
- **Escolha:** sem `--music`, o `render.py` pega a trilha do clima do perfil (`"musica": {"clima": "serio"}` ou `{"id": "mixkit_440"}`), ou do segmento (`CLIMA_SEGMENTO` em `musica.py`). É rodízio por vídeo, favoritas primeiro e vetadas nunca. Faixa com quebra forte (variação acima de 20 dB entre o trecho baixo e o alto) só entra se for favorita, porque fundo de fala pede trilha estável.
- **Início:** começa no início útil, pulando a introdução muda.
- **Volume:** medido, 13 dB abaixo da voz (`"musica": {"rel_db": 10}` deixa mais presente, 16 mais discreta). Medido no IPTU em 01/10: com 16 dB a trilha ficava 21 dB abaixo da fala e quase sumia. O ducking baixa a trilha durante a fala e um corte em 2,5 kHz abre espaço para a voz.
- **Fim:** fade de 1,2 s.
```
python ".claude/skills/edicao-video/scripts/musica.py" listar [--clima serio]
python ".claude/skills/edicao-video/scripts/musica.py" demo        # Downloads/acervo-trilhas.mp3: voz anuncia e toca 15 s de cada, com índice
python ".claude/skills/edicao-video/scripts/musica.py" vetar ID | favoritar ID | aprovar ID
```
- As trilhas estão em aprovação, como os SFX. Quando o Douglas reprovar uma, vetar; quando gostar, favoritar (ela passa a ser a padrão do clima).
- Trilha dele: `--music ARQUIVO` (ou id do acervo). `--music-in`, `--music-drop` e `--music-start` continuam valendo.
- Claude não ouve: reportar trilha, clima, BPM e volume calculado, e dizer que não ouviu.

Só informar a categoria: o `sfx.py` escolhe o som (cabe antes do próximo evento, rodízio, sem os vetados). Um som por evento: cartão já toca o próprio (não duplicar) e o pedido manual tira o rush automático do mesmo corte. Usar o tempo da PALAVRA (`words.json` + `src_to_out`), não o início do trecho. Mostrar o mapa ao Douglas e tirar o que ele cortar. Quando ele ouvir um vídeo e reprovar um som, `python scripts/sfx_acervo.py vetar ID`; se gostar, `favoritar ID`. Regras completas em `references/sfx-guia.md`.

### 7. Olhar o resultado de verdade
Abrir `verify/contato.png` e `verify/antes_depois.png` com a ferramenta de leitura de imagem. Procurar: legenda sobre logo ou rosto, gancho colado em algo, corte no meio de gesto, rosto cortado no zoom, pele alaranjada. Se `--gaze` achar trechos: conferir os quadros e decidir entre cortar logo depois da última sílaba, L-cut, ou cutaway tipográfico com o mesmo texto da fala. Corrigir e renderizar de novo (máximo 3 rodadas; se persistir, avisar o Douglas).

### 8. Entregar
Render final (sem `--preview`), `verify.py` de novo, e mandar: caminho completo do `final.mp4`, o que foi feito (cortes, estilo, cor de destaque, efeitos), os números medidos, e o que NÃO foi conferido (áudio ouvido, por exemplo). Se o trabalho mostrou algo repetível (estilo aprovado para o cliente), salvar no perfil do cliente e perguntar se quer registrar o aprendizado.

## O que entra na retenção (e o que não)

Entra, tudo por código: corte de pausa; punch-in alternado em cada troca; troca de zoom sem corte a cada ~4 s em trecho longo; aproximação lenta no gancho; legenda com destaque na palavra falada e pop; palavra-chave acesa; gancho de texto; barra de progresso (segmentos que pedem); transições e efeitos de impacto estilo CapCut (flash, whip, glitch, dip, zoom blur, pulse, shake) com som próprio; beat sync com música; fundo desfocado para horizontal em vertical; música de fundo sempre (acervo por clima, volume medido abaixo da voz, ducking, entrada tardia e drop encaixado); loudness de plataforma; a caixa de ferramentas da etapa 5c (texto atrás da pessoa, perspectiva, foco, clone, rastro, moldura, print, B-roll, tipografia cinética, CTA com cursor, quadro branco). Cada som e efeito tem teto de densidade e fica amarrado a um corte ou palavra-chave.

Não entra ainda: **speed ramp** (um dos efeitos mais usados, mas mexe na duração e na sincronia da fala; só faz sentido em vídeo sem fala ou B-roll, ainda não implementado), personagem ou objeto gerado por IA (fora do motor local, decisão do Douglas em 01/10), stickers animados prontos do CapCut (dá para usar PNG/vídeo próprio como `imagem`/`video`), emoji na legenda (libass não renderiza emoji colorido), mapeamento de animação por Remotion, tratamento de eco com VoiceFixer (procedimento em memória: `edicao-video-olhar-e-eco`, feito à mão quando o áudio vem de mic distante), reenquadramento inteligente além de rosto central.

## Limites que precisam ser ditos

- Whisper erra timestamps em ~0,2 s, engole palavra repetida e inventa texto em trecho instrumental. Por isso o corte usa a energia do áudio e o plano lista o que descartou. Em emenda suspeita, transcrever o clipe isolado.
- Vertical virar horizontal amplia a imagem ~1,8x e fica mole. O render avisa.
- Claude não ouve o áudio: só mede. Eco, voz fanha e música alta demais exigem o ouvido do Douglas.
- Zoom em torno do rosto depende da detecção; sem rosto (produto), cai no centro. Passe `--focus x,y` se precisar.
- O recorte de pessoa (texto atrás, clone, rastro) é IA local: cabelo solto, braço esticado rápido e roupa da cor do fundo podem falhar por alguns quadros. Conferir a folha do `segment.py` e a prévia. Rastreio de câmera na mão escorrega em chicote e desfoque forte.
- Tempo com elementos (medido em 01/10, 36 s com 13 elementos): prévia ~2,5 min (recorte rápido), render final ~7,5 min (resolução cheia e recorte fino). Para iterar, usar `elementos.py --previa` (segundos) em vez de renderizar tudo. 4K HDR de iPhone (70 s) é bem mais lento: a prévia levou ~20 min com o VoiceFixer rodando junto, por causa da conversão HDR quadro a quadro em 4K.

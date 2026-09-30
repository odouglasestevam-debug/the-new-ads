---
name: edicao-video
description: Edita vídeo de fala (talking head, reels, criativo de anúncio) com a personalidade do cliente. Transcreve local, corta pausas, dá zoom de retenção, faz legenda animada com destaque na palavra falada (highlight, pop, karaokê, bounce), aplica efeitos sonoros, corrige a imagem conforme o ambiente (luz fraca, sol, contraluz, HDR), mixa música e entrega em -14 LUFS. Use quando o Douglas pedir "edita esse vídeo", "legenda animada", "legenda estilo capcut", "corta as pausas", "tira os vazios", "deixa com mais retenção", "reel", "criativo em vídeo", "coloca efeito sonoro", "zoom" ou "transição". Tudo roda local, sem serviço pago.
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
6. **Sem travessão (—) em nenhuma legenda ou texto.** O script troca por vírgula, mas revise o gancho que você escrever.
7. **Não baixar nem rodar nada de terceiros.** Só `fetch_assets.py` usa rede (fontes OFL e modelo do MediaPipe), uma vez.
8. **Sempre terminar mandando o caminho completo do arquivo final** para abrir com 1 clique.
9. **Não entregar copy de anúncio em arquivo.** Gancho e texto vão no chat; só salvar se ele pedir.

## Primeira vez (uma vez por máquina)

```
python ".claude/skills/edicao-video/scripts/fetch_assets.py"
```
Baixa 7 fontes (Poppins, Anton, Bebas Neue, Archivo Black, DM Serif Display) e o modelo de rosto. Requisitos já instalados: ffmpeg (via imageio-ffmpeg), faster-whisper, mediapipe, PIL, numpy. A fonte da marca TNA (Clash Display) é manual: baixar na Fontshare e colocar em `fonts/ClashDisplay-Bold.ttf`.

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
- Música? (a escolha é dele; sem arquivo, segue só com voz e efeitos.)
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
Mostra cada corte, quanto tira, pausas longas (podem ser dramáticas), regravações e palavras descartadas. Ajustes: `--gap` maior corta só pausas maiores, `--fillers` (só com pedido) tira "ãh/hum", `--no-cuts` não corta nada, `--interrupt 0` desliga trocas de zoom sem corte. Apresentar o resumo ao Douglas e esperar confirmação antes de seguir. Se houver regravação, perguntar qual take fica.

### 5. Legendas e palavras-chave
Claude lê a transcrição e escolhe as palavras-chave (em média 1 a cada 2 frases: o número, o termo do negócio, a promessa, o "não"). Nada de destacar tudo.
```
python ".claude/skills/edicao-video/scripts/captions.py" "VIDEO" --profile "clientes/<c>/docs/perfil-edicao.json" --keywords "IPTU,matrícula,dono" --hook "TEXTO DO\nGANCHO" --hook-pos 0.2
```
Sem perfil: `--segmento imobiliaria_construcao --style highlight --accent "#E0B84A"`. Extrair um quadro do vídeo antes (ver etapa 7) para escolher `--hook-pos` fora de logo e rosto. Números e valores sempre ganham destaque sozinhos.

### 6. Efeitos sonoros, render e verificação
```
python ".claude/skills/edicao-video/scripts/sfx.py" "VIDEO" --profile ...
python ".claude/skills/edicao-video/scripts/render.py" "VIDEO" --profile ... --preview     # rápido, para conferir
python ".claude/skills/edicao-video/scripts/render.py" "VIDEO" --profile ... [--music "arquivo.mp3"] [--aspect 9:16] [--grade estudio_neutro]
python ".claude/skills/edicao-video/scripts/verify.py" "VIDEO" --gaze --echo --ref "VIDEO"
```
- `render.py` escolhe a correção de imagem pela exposição (`--grade auto`): luz fraca, sol forte ou natural. Cast de cor só vira aviso. **Ver sempre o `antes_depois.png`.** O preset `natural` foi calibrado em pessoa; em comida e produto esquenta demais, usar `--grade estudio_neutro`.
- HDR (iPhone/câmera) é convertido para SDR sozinho.
- Efeitos: `sfx_manual.json` na pasta de trabalho força um som em um instante (`[{"t": 12.3, "tipo": "impact"}]`). Tipos: whoosh, pop, impact, tick.
- `verify.py` mede: loudness e pico (alvo -14 LUFS, pico até -1 dBFS), pausas que sobraram, fonte/tempos da legenda, folha de contato nas emendas, antes/depois, olhar para baixo (`--gaze`) e cauda de eco (`--echo`, comparar com o bruto via `--ref`).

### 7. Olhar o resultado de verdade
Abrir `verify/contato.png` e `verify/antes_depois.png` com a ferramenta de leitura de imagem. Procurar: legenda sobre logo ou rosto, gancho colado em algo, corte no meio de gesto, rosto cortado no zoom, pele alaranjada. Se `--gaze` achar trechos: conferir os quadros e decidir entre cortar logo depois da última sílaba, L-cut, ou cutaway tipográfico com o mesmo texto da fala. Corrigir e renderizar de novo (máximo 3 rodadas; se persistir, avisar o Douglas).

### 8. Entregar
Render final (sem `--preview`), `verify.py` de novo, e mandar: caminho completo do `final.mp4`, o que foi feito (cortes, estilo, cor de destaque, efeitos), os números medidos, e o que NÃO foi conferido (áudio ouvido, por exemplo). Se o trabalho mostrou algo repetível (estilo aprovado para o cliente), salvar no perfil do cliente e perguntar se quer registrar o aprendizado.

## O que entra na retenção (e o que não)

Entra, tudo por código: corte de pausa; punch-in alternado em cada troca; troca de zoom sem corte a cada ~4 s em trecho longo; aproximação lenta no gancho; legenda com destaque na palavra falada e pop; palavra-chave acesa; gancho de texto; barra de progresso (segmentos que pedem); whoosh nos cortes e pop nas palavras-chave, com teto de densidade; música com ducking sob a voz; loudness de plataforma.

Não entra ainda: emoji na legenda (libass não renderiza emoji colorido), B-roll e cutaway com imagem, mapeamento de animação por Remotion, tratamento de eco com VoiceFixer (procedimento em memória: `edicao-video-olhar-e-eco`, feito à mão quando o áudio vem de mic distante), biblioteca de trilhas (a música vem do Douglas), reenquadramento inteligente além de rosto central.

## Limites que precisam ser ditos

- Whisper erra timestamps em ~0,2 s, engole palavra repetida e inventa texto em trecho instrumental. Por isso o corte usa a energia do áudio e o plano lista o que descartou. Em emenda suspeita, transcrever o clipe isolado.
- Vertical virar horizontal amplia a imagem ~1,8x e fica mole. O render avisa.
- Claude não ouve o áudio: só mede. Eco, voz fanha e música alta demais exigem o ouvido do Douglas.
- Zoom em torno do rosto depende da detecção; sem rosto (produto), cai no centro. Passe `--focus x,y` se precisar.

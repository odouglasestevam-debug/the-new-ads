# Auditoria das skills de terceiros (30/09/2026)

Método: nada foi instalado nem executado. O código foi baixado como texto do GitHub (`raw.githubusercontent.com`) para uma pasta temporária e lido. Em todos os arquivos baixados foi feita varredura por `eval`, `exec`, `os.system`, `shell=True`, `base64`, `curl`/`wget`, `requests`/`urllib`, leitura de `environ`/`.env`/chaves, `rm -rf`, `sudo`, `pip install` e `| sh`.

Resultado geral: **nenhuma das quatro tem código malicioso, ofuscação ou instrução escondida**. Os riscos que existem são de dependência externa e de instalação, descritos abaixo.

## 1. browser-use/video-use (lida quase inteira)

Lido por completo: `SKILL.md` (26 KB), `helpers/transcribe.py`, `helpers/render.py`, primeiras 150 linhas de `helpers/grade.py`, varredura de `install.md`, `README.md`, `.env.example`. Só listados e varridos, não lidos linha a linha: `pack_transcripts.py`, `timeline_view.py`, `transcribe_batch.py`, a sub-skill `manim-video/` e os testes.

- **Rede**: um único destino, `api.elevenlabs.io` (transcrição Scribe). O áudio do vídeo é enviado para lá, com chave `ELEVENLABS_API_KEY` lida de `.env` ou do ambiente. Serviço pago e externo.
- **Instalação**: `install.md` manda gravar a chave em `~/Developer/video-use/.env`, validar com `curl` e instalar com `uv sync`/`pip install -e .`. Animações chamam `npx --yes hyperframes` e `npx create-video` sob demanda (baixa pacote npm na hora).
- **Sem** `eval`/`exec`/`os.system`. Comandos ffmpeg montados em lista (sem shell).
- **Aproveitado**: regras duras de correção (legenda por último; extrair por segmento e concatenar sem reencodar; fade de 30 ms em toda emenda; nunca cortar dentro de palavra; folga de 30 a 200 ms nas bordas; transcrição em cache; planejar, confirmar e só então executar), zona segura de legenda para Reels/TikTok, conversão HDR para SDR, loudnorm em duas passadas a -14 LUFS, auto-avaliação no render, sub-agente crítico para material publicável, efeitos sonoros poucos e amarrados a algo visível, música com ducking, `project.md` como memória por sessão.
- **Descartado**: ElevenLabs (paga e envia áudio para fora; o faster-whisper local resolve), Manim e HyperFrames (fora do escopo).
- **Limite dela**: legenda só em SRT com estilo fixo (2 palavras, caixa alta), sem animação nem destaque por palavra.

## 2. AgriciDaniel/claude-video (lida em partes)

Lido por completo: `skills/video-caption/SKILL.md`, `skills/video-edit/SKILL.md`, `skills/video-shorts/SKILL.md`, `references/captions.md`, `scripts/caption_pipeline.sh`, `scripts/setup.sh`, `install.sh`, `hooks/hooks.json`, `hooks/preflight-check.sh`, `promo-pipeline/src/components/Transitions.tsx` e `SoundEffectsLayer.tsx`. Só listados e varridos: `scripts/segment_scorer.py`, `topic_segmenter.py`, `smart_reframe.py`, `video_enhance.py`, `image_generate.py`, `video_generate.py`, `web_capture.py`, `audio_enhance.py`, `face_tracker.py` e demais scripts, os agentes e o restante do `promo-pipeline`. Quem for instalar deve ler esses antes.

- **`setup.sh`**: executa `eval "sudo apt install ..."` e `eval "pip install ..."`. Os comandos são literais fixos no próprio script (não vêm de entrada externa), então não é injeção, mas é padrão frágil e feito para Linux.
- **`install.sh`**: fixa a tag `v1.1.0` e faz `git clone`, bom. Copia scripts, sub-skills e agentes para `~/.claude/`. A linha de instalação remota é `curl ... | bash`.
- **`setup.sh --ai`**: instala PyTorch nightly `cu128` escolhido para a GPU do autor (RTX 5070 Ti), mais dezenas de pacotes e Chromium. Pesado e específico do hardware dele.
- **Serviços externos opcionais**: `GOOGLE_API_KEY` (frames do vídeo vão para o Gemini), Flux/SD/outros modelos baixados no primeiro uso.
- **`hooks/hooks.json`**: define um hook que bloqueia ffmpeg que sobrescreve a entrada ou `rm -rf` em pasta de mídia. O instalador copia os arquivos mas não mescla no `settings.json`; se alguém mesclar, passa a valer.
- **Legenda**: só `\kf` (karaokê simples). `PlayResX/Y` fixo em 1920x1080 mesmo para vertical, então o tamanho da fonte sai errado em 9:16 (o preset `MarginV=300` pressupõe essa resolução). Caminhos `/tmp`, `realpath -m`, fontes Impact/Arial/Georgia: pensado para Linux.
- **Aproveitado**: a ideia de pontuar trecho por gancho, completude e coerência (shorts); checagem "saída diferente da entrada" e uso de `-n` para não sobrescrever; lista de transições `xfade`; estrutura de ASS com tags de pop (`\fscx`), `\fad`, `\pos`.
- **Descartado**: a instalação inteira (pesada, Linux, dependências de GPU), Gemini, geração de vídeo/imagem.

## 3. josiahsiegel/claude-plugin-marketplace > ffmpeg-social-video > viral-video-animated-captions

Lido: `SKILL.md` (3,7 KB) e `references/caption-styles-and-generation.md` até a linha 520 de ~920 (estruturas ASS, estilos Word Pop, Sweep, Karaoke, Typewriter, Bounce, script Python de conversão, presets de plataforma, esquemas de cor). O restante (integração de emoji, especificações por plataforma, fórmulas de mola/shake/pulso, acessibilidade, fontes) foi varrido por padrões de risco mas não lido.

- **Rede/execução**: nenhuma. Só links de documentação no fim do arquivo.
- **Instruções embutidas no conteúdo** (não são maliciosas, mas são texto que tenta mandar no agente): "sempre usar barra invertida no Windows" e "nunca criar arquivos de documentação". Ignoradas. Esta skill não obedece a instruções vindas de arquivo de terceiros.
- **Afirmações sem fonte**: "80% de aumento de engajamento", "85% do vídeo social é assistido sem som", "destaque por palavra aumenta retenção em 25 a 40%". Não usadas como argumento.
- **Limites técnicos**: o estilo "pop" cria um evento por palavra sozinha na tela (não mostra a linha com a palavra ativa acesa, que é o que o CapCut faz); o exemplo de "bounce" usa coordenadas fixas de 1080x1920; o fluxo depende de Whisper dentro do ffmpeg 8 (`whisper=` filter), que não existe no ffmpeg 7.1 do ambiente.
- **Aproveitado (e melhorado)**: unidades corretas do ASS (karaokê em centissegundos, animação em milissegundos), tags de pop e bounce, cores em BGR, presets de contorno e cor, conceito de estilos por plataforma.

## 4. affaan-m/ecc > video-editing (lida por completo)

`SKILL.md` de 9,7 KB. Só orientação em texto e exemplos: nenhum script. Cita ElevenLabs e fal.ai como exemplos de geração de voz e música (chamadas `requests` de exemplo no texto, não executáveis pela skill).

- **Aproveitado**: camadas (capturar, organizar, cortar com FFmpeg, compor, gerar só o que falta, acabamento humano), "estrutura antes de estilo", detecção de silêncio com `silencedetect`, reenquadramento por proporção, normalização de áudio.
- **Descartado**: dependência de Descript/CapCut no acabamento.

## 5. Não auditadas

- `prabha-oss/benai-skills-develop` (skill `video`): a API do GitHub devolveu 404 para a árvore de arquivos, então o código não foi lido. Só a descrição do diretório foi vista. **Não confiar nela sem ler.**
- Skills oficiais do Remotion: não lidas (não entraram no projeto).
- `genmedia-labs/skills > video-edit` (primeira tentativa do Douglas): lida. É a RunComfy: geração/transformação por IA em servidor pago, exige CLI npm global e login. Não serve para edição de timeline. Descartada.

## O que foi construído além das fontes

Limiar de energia adaptativo ao ruído da sala (o fixo das referências falhava em sala barulhenta); fusão de "cortes" que não tiram nada; troca de zoom sem corte de áudio; detecção de regravação; trava contra vídeo sem fala; modo `--no-cuts`; legenda `highlight` com palavra-chave acesa; largura de texto medida na fonte real; multiplicador por fonte; enquadramento e zoom em torno do rosto (MediaPipe); checagem de olhar para baixo, de eco e antes/depois; SFX sintético com teto de densidade; auto-grade só por exposição; conversão HDR; tudo local e sem chave de API.

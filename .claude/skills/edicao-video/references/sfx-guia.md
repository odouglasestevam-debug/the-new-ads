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

## Sons reais do SaveClip.mp3 (01/10/2026)

O Douglas mandou um mp3 de 13,4 s com efeitos de verdade, sem voz. Foram separados por corte/silêncio em 10 sons e importados (mono 48k, pico 0,7, licença "desconhecida: uso interno"). O original e os recortes sem normalizar ficam em `assets/sfx/_origem/saveclip/`. A **categoria é palpite pela medição** (Claude não ouve): conferir de ouvido em `saveclip-sons-conferir.mp3` (a voz diz "Som N" e o som toca 3 vezes) e corrigir.

| Som | Id | Palpite | Medição |
|---|---|---|---|
| 1 | `ref01_rush_vento` | rush | ruído de ar que decai em 1,7 s; começa cortado no original |
| 2 | `ref02_hit_sub_pulsado` | hit | sub-grave pulsado (cerca de 60 Hz), 0,7 s, termina seco |
| 3 | `ref03_shutter_duplo` | shutter | dois estalos de banda larga com 90 ms entre eles (pode ser clique de mouse) |
| 4 | `ref04_ui_tom_grave` | ui | tom harmônico suave, 1,5 s |
| 5 | `ref05_ui_pop_duplo` | ui | dois toques tonais de cerca de 700 Hz, 0,3 s |
| 6 | `ref06_ui_ding` | ui | ding de cerca de 2,6 kHz, cauda de 1 s |
| 7 | `ref07_click_toque_grave` | click | toque grave de cerca de 420 Hz, 0,45 s |
| 8 | `ref08_click_duplo` | click | dois cliques com ressonância metálica, 0,3 s entre eles |
| 9 | `ref09_ui_brilho_metalico` | ui | brilho metálico com parciais agudos, 1,1 s |
| 10 | `ref10_hit_longo_grave` | hit | impacto grave com cauda de 4,4 s |

Não há typing nem riser neste arquivo. Nenhum dos 10 é padrão de categoria: o padrão só muda quando o Douglas aprovar um som de ouvido (aí `PADRAO` em `sfx_acervo.py` e `padrao` no catálogo).

## Limites

- Claude não ouve: os sons foram conferidos por medição (forma do envelope, banda, pico, sem NaN), não de ouvido. Quem aprova é o Douglas, pelo `acervo-sfx-demo.mp4`.
- Sons sintéticos soam limpos demais perto de gravação real. Se algum não agradar, importar um real (Freesound CC0, Pixabay Sound Effects, Mixkit) com `importar` e `--licenca`.
- O padrão da skill continua discreto (feedback do v1): só `rush` nos cortes e os sons dos cartões entram sozinhos. `shutter`, `hit` e `riser` fora do cartão `termo` só por pedido.

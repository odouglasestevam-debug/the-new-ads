# Guia de efeitos sonoros (acervo `assets/sfx/`)

Origem das regras: reel de uma criadora de edição que o Douglas mandou em 30/09/2026 e disse gostar ("precisamos ter no nosso acervo"). O vídeo cita 7 categorias. Os SONS do acervo são nossos (sintetizados em `scripts/sfx_acervo.py`); não foi copiado áudio do reel, que traz voz e música misturadas e é de terceiro.

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

## Calibragem medida no reel

Medido no áudio do reel (trechos sem fala): os sons de clique e interface ficam com o corpo entre 200 Hz e 1 kHz (centroide 400 a 770 Hz); o que parece "shutter" nas transições é brilhante (centroide 4,5 a 4,9 kHz, energia em 4 a 10 kHz, 0,08 a 0,10 s); há um impacto sub-grave (49 Hz, 0,24 s) e uma passagem larga e longa no final (0,84 s). Daí o acervo: clique e UI com fundamental 250 a 900 Hz e estalo curto por cima (nada fino, que foi a reclamação do v1), shutter brilhante, hit grave.

## Limites

- Claude não ouve: os sons foram conferidos por medição (forma do envelope, banda, pico, sem NaN), não de ouvido. Quem aprova é o Douglas, pelo `acervo-sfx-demo.mp4`.
- Sons sintéticos soam limpos demais perto de gravação real. Se algum não agradar, importar um real (Freesound CC0, Pixabay Sound Effects, Mixkit) com `importar` e `--licenca`.
- O padrão da skill continua discreto (feedback do v1): só `rush` nos cortes e os sons dos cartões entram sozinhos. `shutter`, `hit` e `riser` fora do cartão `termo` só por pedido.

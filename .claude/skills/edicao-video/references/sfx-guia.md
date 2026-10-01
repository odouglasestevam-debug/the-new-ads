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

## Limites

- Claude não ouve: os sons foram conferidos por medição (forma do envelope, banda, pico, sem NaN), não de ouvido. Quem aprova é o Douglas, pelo `acervo-sfx-demo.mp4`.
- Sons sintéticos soam limpos demais perto de gravação real. Se algum não agradar, importar um real (Freesound CC0, Pixabay Sound Effects, Mixkit) com `importar` e `--licenca`.
- O padrão da skill continua discreto (feedback do v1): só `rush` nos cortes e os sons dos cartões entram sozinhos. `shutter`, `hit` e `riser` fora do cartão `termo` só por pedido.

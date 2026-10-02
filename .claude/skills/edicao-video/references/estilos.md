# Estilos de legenda, imagem e som

Tudo em `presets.json`. Mudar lá muda para todos os vídeos; para um cliente só, usar o perfil dele.

## Legenda

| Estilo | O que faz | Bom para |
|---|---|---|
| `highlight` | Linha de 2 a 3 palavras. A palavra falada acende na cor de destaque com um pop curto; palavra-chave fica acesa o tempo todo e pula maior | Padrão. Retém sem cansar. Fala explicativa, consultoria, saúde, jurídico |
| `pop` | A linha entra com pop; só as palavras-chave ficam na cor de destaque | Estilo dos vídeos da Regularize. Ritmo médio |
| `karaoke` | A cor preenche a linha palavra por palavra, suave | Voz em off, frases longas, ritmo cadenciado |
| `bounce` | A linha sobe com quique | Varejo, oferta, energia alta |
| `impacto` | Uma palavra por vez, bem grande | Gancho e trechos curtos. Não usar o vídeo inteiro |
| `editorial` | Pequena, serifada (Instrument Serif), caixa baixa, 3 a 4 palavras, entra com fade; palavra-chave em itálico, sem cor | Vídeo com títulos de cena e efeitos da caixa de ferramentas (ref3). A legenda não disputa com o título |
| `discreta` | Pequena em Poppins SemiBold, caixa baixa; palavra-chave na cor de destaque | Junto de tela de motion, CTA ou moldura (ref1) |

Regras de leitura (já aplicadas no código): 2 a 3 palavras por linha em vertical, máximo de 16 a 24 caracteres, contorno grosso, largura da linha medida na fonte real e reduzida se passar de 88% da tela, posição a 62% da altura em 9:16 (zona segura: a interface do Reels/TikTok cobre o rodapé e o topo).

## Fontes

Poppins Black / ExtraBold / SemiBold (versátil), Anton (condensada, varejo), Bebas Neue (condensada, título), Archivo Black (peso alto, sóbria), DM Serif Display (serifada, só gancho elegante). Da caixa de ferramentas (01/10), com apelido em `el_texto.py`: Instrument Serif e itálico (`serif`, `serif_italic`: legenda editorial e a parte fina do par de título), Krona One (`larga`: gancho extra-largo em caixa alta com contorno), Kalam (`marcador`: quadro branco), Barlow Condensed Light/ExtraBold (`fina`, `fina_pesada`: "clique em / saiba mais"). O par que mais aparece nas referências é pesada (`pesada` = Archivo Black) + `serif_italic` deslocada embaixo. Clash Display é a da TNA e entra quando o arquivo estiver em `fonts/`. Fonte ausente é erro, nunca cai em Arial em silêncio. Cada fonte tem um multiplicador de tamanho (`size`) porque as condensadas parecem menores.

## Imagem por ambiente (`--grade`)

| Preset | Quando |
|---|---|
| `auto` | Mede a exposição e escolhe entre natural, luz_fraca e externo_sol. Padrão |
| `natural` | Pessoa em ambiente normal. Calibrado em talking head. Em comida e produto esquenta demais |
| `estudio_neutro` | Produto, comida, loja. Quase não mexe na cor |
| `luz_fraca` | Ambiente escuro: sobe a sombra, tira ruído |
| `luz_quente` | Lâmpada amarela. Manual, nunca automático |
| `luz_fluorescente` | Loja com luz verde/azulada |
| `contraluz` | Janela atrás, rosto escuro |
| `externo_sol` | Sol forte, céu estourado |
| `cinematografico` | Opt-in, look de filme. Nunca como padrão |
| `none` | Sem correção |

Sempre conferir `verify/antes_depois.png`, principalmente tom de pele. HDR é convertido antes de qualquer preset.

## Som

- Voz: corta graves abaixo de 85 Hz (70 com VoiceFixer), redução de ruído leve (`--denoise off|leve|forte`), equalização medida para a curva-padrão de fala (`voz_eq.py`, desde 01/10: a fixa deixava fanho), compressor, depois loudness medido em duas passadas (-14 LUFS, pico -2 dB de folga para o AAC).
- Efeitos sintéticos (sem banco, sem direito autoral): `whoosh` nos cortes, `pop` nas palavras-chave, `impact` e `tick` só sob pedido em `sfx_manual.json`. Níveis: `off`, `leve` (1 por 10 s), `media` (2), `alta` (3). Cada efeito amarra a algo visível.
- Música: **indispensável, todo vídeo tem** (Douglas, 01/10).
  - **Origem:** sai do acervo `assets/musica/`, 21 trilhas do Mixkit em 6 climas, pelo clima do perfil ou do segmento, ou da trilha que o Douglas mandar (`--music`).
  - **Volume:** medido, 13 dB abaixo da voz. Baixa sozinha quando há fala (sidechain), tem um corte em 2,5 kHz para a voz passar e sai com fade no fim.
  - **Climas:** corporativo (serviço, agência), sério (jurídico, regularização), leve (saúde, estética), energia (varejo), inspirador (institucional), elegante (alto padrão).
  - **Comandos:** `musica.py listar | demo | vetar | favoritar`.
- Efeitos com música por baixo: teto de 1 momento de som a cada 10 s, e cartão só toca na revelação (ver SKILL.md 6b).

## Efeitos e transições (estilo CapCut, recriados em ffmpeg)

Escolhidos entre os mais usados segundo a [página de tendências do próprio CapCut](https://www.capcut.com/help/capcut-transitions): glitch/RGB split, zoom e fade cinematográfico, swipe, slow motion com blur, speed ramp e beat sync. Não são os arquivos do CapCut (que têm licença própria): são equivalentes feitos com filtros do ffmpeg, sem custo e sem restrição de uso em anúncio. Entram por cima, sem mudar a duração, antes da legenda.

| Efeito | Tipo | O que faz | Bom para |
|---|---|---|---|
| `corte_seco` | transição | Corte limpo, só com whoosh | Jurídico, saúde, TNA |
| `flash` | transição ou impacto | Clarão branco rápido, com shimmer | Gancho, revelação |
| `whip` | transição | Borrão horizontal de virada de câmera | Imobiliário, ritmo médio |
| `glitch` | transição ou impacto | Separação RGB com ruído digital | Varejo, energia alta |
| `dip_preto` | transição | Mergulho no preto | Clima sério, cinematográfico |
| `zoom_blur` | transição | Aproximação com desfoque | Dar peso a um corte |
| `pulse` | impacto | Batida de zoom que volta | Palavra-chave, sem exagero |
| `shake` | impacto | Tremida que amortece, com impact | Ênfase forte, varejo |
| `grain`, `vinheta`, `vhs` | look | Acabamento do vídeo inteiro | Sob demanda |
| `foco` | transição | Desfoca e clareia até o corte, o plano novo entra desfocado e foca (ref3). Feito no `elementos.py` | Virada de assunto ou de cenário, em qualquer segmento |

Por segmento (pontos de partida no `presets.json`): advocacia só corte seco; clínica corte seco e dip preto, pulse; imobiliário whip e corte seco alternados, pulse, flash no gancho; varejo flash, glitch e whip, shake, glitch no gancho, grão; TNA corte seco e pulse.

Regras: transição só em corte real (onde saiu pausa); impacto só em palavra-chave, longe de transição, com teto por 10 s; `--nivel off|leve|media|alta` ajusta a densidade. Cada efeito toca seu som: flash com shimmer, glitch com rajada digital, whip e zoom_blur com whoosh, pulse com pop, shake com impact.

Ainda fora: speed ramp (muda duração e sincronia, só serve em vídeo sem fala) e stickers animados prontos. Elementos que interagem com a cena (texto atrás da pessoa, perspectiva, clone, moldura, quadro branco e o resto) estão na caixa de ferramentas: `caixa-ferramentas.md`.

## Receitas

- Consultoria/jurídico/saúde: `highlight`, sem caixa alta, sfx `leve`, zoom 1.08, gap 0.42.
- Imobiliário/construção: `pop` ou `highlight` caixa alta, sfx `media`, zoom 1.15, barra de progresso.
- Varejo/oferta: `bounce`, Anton, sfx `alta`, zoom 1.18, gap 0.28.
- TNA: `highlight`, âmbar `#FF6A00`, sfx `leve`, tom direto e técnico, sem hype.

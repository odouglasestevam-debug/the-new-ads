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

Regras de leitura (já aplicadas no código): 2 a 3 palavras por linha em vertical, máximo de 16 a 24 caracteres, contorno grosso, largura da linha medida na fonte real e reduzida se passar de 88% da tela, posição a 62% da altura em 9:16 (zona segura: a interface do Reels/TikTok cobre o rodapé e o topo).

## Fontes

Poppins Black / ExtraBold / SemiBold (versátil), Anton (condensada, varejo), Bebas Neue (condensada, título), Archivo Black (peso alto, sóbria), DM Serif Display (serifada, só gancho elegante). Clash Display é a da TNA e entra quando o arquivo estiver em `fonts/`. Fonte ausente é erro, nunca cai em Arial em silêncio. Cada fonte tem um multiplicador de tamanho (`size`) porque as condensadas parecem menores.

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

- Voz: corta graves abaixo de 85 Hz, redução de ruído leve (`--denoise off|leve|forte`), presença em 3,5 kHz, compressor, depois loudness medido em duas passadas (-14 LUFS, pico -2 dB de folga para o AAC).
- Efeitos sintéticos (sem banco, sem direito autoral): `whoosh` nos cortes, `pop` nas palavras-chave, `impact` e `tick` só sob pedido em `sfx_manual.json`. Níveis: `off`, `leve` (1 por 10 s), `media` (2), `alta` (3). Cada efeito amarra a algo visível.
- Música: sempre escolha do Douglas. Entra a 16% do volume, baixa sozinha quando há fala (sidechain) e sai com fade no fim.

## Receitas

- Consultoria/jurídico/saúde: `highlight`, sem caixa alta, sfx `leve`, zoom 1.08, gap 0.42.
- Imobiliário/construção: `pop` ou `highlight` caixa alta, sfx `media`, zoom 1.15, barra de progresso.
- Varejo/oferta: `bounce`, Anton, sfx `alta`, zoom 1.18, gap 0.28.
- TNA: `highlight`, âmbar `#FF6A00`, sfx `leve`, tom direto e técnico, sem hype.

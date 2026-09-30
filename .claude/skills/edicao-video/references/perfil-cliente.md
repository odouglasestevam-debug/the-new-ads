# Perfil de edição do cliente (a personalidade do vídeo)

O vídeo tem que parecer da empresa, não do editor. Antes de editar, montar ou ler o perfil.

## Onde fica

`clientes/<cliente>/docs/perfil-edicao.json` (a pasta `clientes/` não vai para o Git). Quando o cliente ainda não tem perfil, criar a partir do segmento e confirmar com o Douglas.

## De onde tirar cada campo

| Campo | Fonte |
|---|---|
| segmento | `clientes/<c>/briefing.md`, `_contexto/empresa.md` |
| tom | briefing (como o dono fala), vídeos anteriores aprovados |
| accent (cor de destaque) | logo e materiais do cliente. Nunca inventar: se não achar, perguntar |
| font | fonte da marca se existir em `fonts/`; senão a do segmento |
| palavras_destaque | vocabulário do negócio que o público reconhece (IPTU, matrícula, consulta grátis) |
| cta | texto do fim do vídeo e botão do anúncio |
| sfx | `off`, `leve`, `media`, `alta`. Advocacia e saúde: leve. Varejo e oferta: alta |
| gap, zoom | ritmo: calmo (gap 0.42, zoom 1.08) a rápido (gap 0.28, zoom 1.18) |

## Modelo

```json
{
  "cliente": "regularize-imoveis",
  "segmento": "imobiliaria_construcao",
  "caption_style": "highlight",
  "font": "Poppins Black",
  "accent": "#E0B84A",
  "uppercase": true,
  "gap": 0.35,
  "zoom": 1.15,
  "sfx": "media",
  "progress_bar": true,
  "grade": "auto",
  "palavras_destaque": ["IPTU", "matrícula", "proprietário", "registro"],
  "cta": "Clique no botão abaixo e fale com a nossa equipe",
  "observacoes": "Apresentadora lê roteiro na mesa: rodar verify --gaze. Logo na parede até ~30% da altura: gancho em --hook-pos 0.36 ou não usar."
}
```

Qualquer campo de `presets.json > segmentos` pode ser sobrescrito. Os scripts aceitam `--profile caminho.json`.

## Segmentos prontos (pontos de partida)

`advocacia`, `clinica_estetica`, `imobiliaria_construcao`, `ecommerce_varejo`, `tna`, `padrao`. As cores desses presets são neutras de exemplo. A cor do cliente sempre vale mais.

## Atualizar o perfil

Quando o Douglas corrigir algo ("esse amarelo está forte", "sem efeito nessa parte", "legenda menor"), salvar no perfil do cliente a decisão, e perguntar antes se vale para todos os clientes (então entra no `presets.json`).

# Guia de Design — The New Ads

> Você pode editar esse arquivo a qualquer momento.
> As skills de carrossel, proposta e slide leem este arquivo antes de criar qualquer visual.
> Baseado no Brand Book oficial (`marca/brand-book.html`) — seguir à risca, não improvisar variações.

---

## Cores

- **Fundo principal:** Preto Absoluto `#0A0A0A`
- **Fundo alternativo / cards:** Grafite `#171717` (superfície) / `#212121` (grafite 2)
- **Cor de destaque / CTA:** Âmbar Sinal `#FF6A00`
- **Glow / hover do destaque:** Âmbar Glow `#FFA24D`
- **Texto principal:** Branco Sinal `#FAFAFA`
- **Texto secundário / muted:** Névoa `#8A8A8A`
- **Linhas / divisores:** `rgba(255,255,255,.09)`
- **Cor proibida:** Âmbar sobre fundo claro em corpo pequeno (contraste insuficiente). Nunca alterar o tom do âmbar ou do preto.

**Proporção de uso (regra 70/25/5):** preto e grafite dominam (70%), branco e névoa dão respiro e texto (25%), âmbar aparece em só 5% — nunca como fundo de área grande, sempre como sinal/pontual (CTA, ícone, destaque).

---

## Tipografia

- **Títulos e destaques (display):** Clash Display — Bold 700 / SemiBold 600. Tracking leve (0 a -1,5%) — a fonte já é condensada por natureza, tracking fechado igual ao usado com Space Grotesk deixa as letras coladas demais. Fonte via Fontshare: `https://api.fontshare.com/v2/css?f[]=clash-display@600,700&display=swap`.
- **Corpo, subtítulos e botões:** Switzer — SemiBold 600 / Medium 500 / Regular 400. Fonte via Fontshare: `https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap`. Mesma fundição da Clash Display, garante consistência técnica entre display e corpo.
- **Mono (dados, código, labels técnicas):** JetBrains Mono.
- **Peso do título:** SemiBold 600 como padrão, Bold 700 pra hero/capa.
- **Fallback do display:** `'Clash Display','Space Grotesk',system-ui,sans-serif` (Space Grotesk como fallback caso a fonte não carregue a tempo).
- **Fallback do corpo:** `'Switzer','Inter',system-ui,sans-serif`.

---

## Estilo geral

Minimalista, dark, tech, sofisticado. Cantos vivos, sem arredondamento (precisão de dado). Zero gradiente pesado, zero sombra, zero efeito 3D (exceção: glow âmbar sutil em botão de CTA, ver "Elementos-chave"). Muito espaço negativo. Estética Swiss/brutalista-clean.

**Régua de personalidade:** sério mas não engomado, simples de ler mesmo sendo sofisticado, moderno e extremamente digital, robusto, e no meio exato entre business e humano (o lado híbrido da marca — a pessoa dá o rosto, o método dá a prova).

---

## Elementos-chave

- **Bordas:** 1px sólida em `rgba(255,255,255,.09)`, sem cor de destaque na borda.
- **Border-radius dos cards:** nenhum ou mínimo (2-4px) — a marca é de cantos vivos.
- **Botões:** fundo âmbar `#FF6A00` com texto preto, ou contorno âmbar sobre fundo escuro. Sem gradiente. Exceção confirmada: CTA principal (`.btn`) pode usar um glow sutil de box-shadow âmbar (`0 8px 30px rgba(255,106,0,.28)`) pra dar profundidade ao botão de ação, decisão intencional do usuário mesmo contrariando a regra geral de sombra abaixo.
- **Sombras:** evitar. Se precisar de profundidade, usar radial-gradient sutil de âmbar (`rgba(255,106,0,.1-.18)`) sobre o preto, nunca box-shadow tradicional, com a única exceção do glow do botão de CTA citada acima.

---

## O que NUNCA fazer

- Distorcer, esticar, comprimir, rotacionar ou inclinar o símbolo ou wordmark.
- Alterar as cores da marca (âmbar é âmbar, preto é preto).
- Trocar a tipografia do wordmark por outra fonte.
- Aplicar sombra, gradiente pesado, contorno ou brilho no logo.
- Alterar a proporção entre símbolo e wordmark.
- Usar âmbar sobre fundo claro sem contraste suficiente.
- Colar outras palavras ou slogans junto ao wordmark.
- Aplicar a marca sobre imagem sem garantir legibilidade.
- Recriar o símbolo à mão — usar sempre os arquivos oficiais em `marca/logo-SVG/` ou `marca/logo-PNG/`.
- Usar linguagem de "guru" ou promessa mágica em qualquer copy — ver tom de voz abaixo.

---

## Tom de voz (pra copy, propostas e conteúdo)

**A marca fala assim:** direto, concreto (número, exemplo, caso), confiante sem arrogância, técnico na medida, brasileiro natural.

**A marca nunca fala assim:** "descubra o segredo que os gurus escondem", "no mundo de hoje, imagine só...", promessa mágica sem processo, jargão vazio, hype ou exclamação gritada.

**Regra absoluta do usuário:** nunca usar travessão (—). Usar vírgula, ponto, dois pontos ou parênteses.

**Taglines:**
- Principal: "O novo padrão de mídia paga."
- Apoio: "Ads que vendem, não que aparecem." / "Do achismo ao previsível." / "Tráfego não é sorte. É sistema."

---

## Logo

- **Arquivo principal (fundo escuro):** `marca/logo-SVG/tna-horizontal-dark.svg` (ou `.png` na pasta `marca/logo-PNG/`)
- **Versão pra fundo claro:** `marca/logo-SVG/tna-horizontal-light.svg`
- **Versão vertical:** `marca/logo-SVG/tna-vertical-dark.svg` / `tna-vertical-light.svg`
- **Símbolo isolado ("O Sinal"):** `marca/logo-SVG/tna-simbolo.svg` — usar quando o wordmark completo não couber (mínimo 16px, ex: favicon)
- **Monocromático:** `marca/logo-SVG/tna-mono-branco.svg` (sobre fundo escuro) / `tna-mono-preto.svg` (sobre fundo claro)
- **Favicon:** `marca/logo-SVG/tna-favicon.svg`
- **Onde usar:** slide final do carrossel (CTA), header de propostas, slides de apresentação
- **Tamanho mínimo:** wordmark completo a partir de 120px de largura digital (35mm impresso). Abaixo disso, usar só o símbolo isolado.
- **Área de proteção:** margem livre ao redor da marca equivalente à altura do símbolo, em todos os lados.

**Conceito do símbolo:** fusão do triângulo de "play" (mídia) com uma seta ascendente (crescimento), lido como um "N" de New. Traço único, espessura uniforme, cantos vivos, âmbar sobre preto.

**Referência completa:** `marca/brand-book.html` (manual de marca oficial, abrir no navegador).

---

## Logos de clientes (prova social / marquee)

Padrão pra exibir logo de cliente em seção de prova social (ex: marquee "negócios que pararam de apostar" na home e landing de tráfego pago):

- **Recolorir todas as logos pra um tom único de cinza claro** (`rgb(233,233,233)`), fundo transparente. Unifica visualmente logos de fontes/qualidades diferentes e evita problema de contraste (ex: elemento escuro do logo "sumir" contra fundo preto do site).
- **Filtro CSS aplicado na tag `<img>`:** `grayscale(1) contrast(1.25) brightness(1.08) drop-shadow(0 1px 2px rgba(0,0,0,.4))`, opacidade base `.62`, sobe pra `1` com filtro mais intenso no `:hover`.
- **Efeito metálico (sweep):** pseudo-elemento com gradiente diagonal (`linear-gradient(75deg,transparent,rgba(255,255,255,.4),transparent)`), `mix-blend-mode:overlay`, animando de `left:-60%` pra `left:140%` em ciclo de ~4.5s, com delay escalonado por item pra não sincronizar.
- **Marquee infinito:** track duplicado (conteúdo real + cópia com `aria-hidden="true"`), `width:max-content`, animação `translateX(0)` → `translateX(-50%)` em loop, sem pausar no hover. Fade nas bordas via `::before`/`::after` com gradiente da cor de fundo da seção pra transparente. Sempre respeitar `prefers-reduced-motion` (desliga a animação).
- **Ajuste de tamanho por proporção do logo:** logos quase quadradas ou com ícone sem wordmark largo precisam de mais altura pra ficarem legíveis (classes `.sq`/`.md` com altura maior que o padrão).

---

## Perfil do autor

> Usado no estilo "tweet" do carrossel.

- **Nome:** Douglas Estevam
- **Handle:** @thenewads *(ajustar se o handle real for outro)*
- **Foto:** *(adicionar em `marca/` quando disponível)*
- **Badge verificado:** não

---

## Observações adicionais

Marca híbrida: serviço de mídia paga sustentado pela autoridade de quem opera. Arquétipo Especialista/Sábio com tempero de Rebelde — autoridade técnica, mas com opinião e ruptura contra o "old ads" (achismo, impulsionar post, métrica de vaidade).

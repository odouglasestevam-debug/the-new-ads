# Biblioteca de efeitos

Código dos efeitos do padrão aprovado. Todos saíram da página do Silvio Pacheco
(`clientes/silvio-palestrante/paginas/landing-page/index.html`, exemplo completo e funcionando).

Regra de uso: os **efeitos** se repetem entre clientes, a **identidade** não. Cor, fonte,
assinatura e ordem das seções mudam a cada página (ver "Regra anti-cópia" no SKILL.md).

## 1. Tokens (sempre o primeiro bloco do CSS)

Troque os valores por cliente. Os nomes ficam iguais, assim o resto do CSS funciona sem mudar.

```css
@property --ang{syntax:'<angle>';inherits:false;initial-value:0deg}
:root{
  --noite:#07091A;      /* fundo base: escuro com um matiz próprio do cliente (nunca #001120, que é do CIS) */
  --noite-2:#0B0E26;    /* fundo alternado entre seções */
  --sup:#0F1333;        /* superfície de card opaca */
  --sup-2:#161B45;
  --violeta:#6D3BFF;    /* cor de brilho 1: tirada do mundo do cliente (luz de palco, cor da marca) */
  --azul:#2F5BFF;       /* cor de brilho 2 */
  --ouro:#F4B740;       /* metálico de destaque: CTA, números, palavras-chave */
  --ouro-claro:#FFE3A3;
  --ouro-txt-claro:#9A5F12; /* o metálico em versão legível sobre fundo claro (contraste 4.5:1) */
  --vinho:#C42A47;      /* cor de alerta/ao vivo */
  --texto:#F4F1EA; --texto-2:#B9BDD6; --texto-3:#8A90B2;
  --creme:#F6F0E6;      /* a única seção clara (depoimentos), pro ritmo claro/escuro */
  --linha:rgba(255,255,255,.09);
  --metal:linear-gradient(180deg,#FFF1C9 0%,#FFD98A 30%,#F4B740 62%,#C8801F 100%);
  --metal-d:linear-gradient(135deg,#FFE9B0,#F4B740 50%,#C8801F);
  --luz:linear-gradient(180deg,#FFFFFF 0%,#ECE9FF 55%,#ABA4DD 100%);
  --btn:linear-gradient(110deg,#FFE3A3 0%,#F4B740 48%,#DB8B26 100%);
  --display:'Urbanist',system-ui,sans-serif;
  --corpo:'Manrope',system-ui,sans-serif;
}
```

Variações de metálico por cliente: ouro/âmbar (padrão), champanhe (`#F3E2C0 → #CDAA6D`),
cobre (`#FFD2B0 → #C8703A`), prata fria (`#FFFFFF → #9AA3B5`), esmeralda (`#B8FFE0 → #1FA971`).
O metálico é sempre a cor do CTA, e o texto do botão é escuro.

## 2. Texto em gradiente (títulos)

```css
.luz{background:var(--luz);-webkit-background-clip:text;background-clip:text;color:transparent}
.ouro{background:var(--metal);-webkit-background-clip:text;background-clip:text;color:transparent}
```
Título padrão: primeira parte em `.luz`, a palavra-chave em `.ouro`.
`<h2 class="h2"><span class="luz">Travar na hora de falar</span> <span class="ouro">tem explicação.</span></h2>`
Sombra em texto com gradiente: usar `filter:drop-shadow(...)`, nunca `text-shadow` (aparece por trás da letra transparente).

## 3. Grão (textura de filme por cima de tudo)

```css
body::after{content:"";position:fixed;inset:0;z-index:90;pointer-events:none;opacity:.05;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
```

## 4. Botão metálico com brilho passando

```css
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:0 32px;border:0;border-radius:999px;background:var(--btn);color:#1B1003;font-weight:800;text-decoration:none;cursor:pointer;overflow:hidden;isolation:isolate;box-shadow:0 12px 34px -10px rgba(244,183,64,.6),inset 0 1px 0 rgba(255,255,255,.7);transition:transform .2s,box-shadow .2s}
.btn::after{content:"";position:absolute;z-index:-1;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.65),transparent);transform:skewX(-20deg);animation:brilho 5s ease-in-out infinite}
@keyframes brilho{0%,62%{left:-60%}100%{left:130%}}
.btn:hover{transform:translateY(-2px)}
```
Formato do botão (pílula, raio 10px, quadrado) é parte da identidade: varie por cliente.
Botão secundário: `.btn-fantasma` (borda fina, fundo 4%, ícone de play num círculo).

## 5. Vidro, borda em gradiente e luz que segue o mouse

```css
.vidro{background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.02));border:1px solid var(--linha);border-radius:22px;backdrop-filter:blur(14px)}
/* borda em gradiente: o fundo de dentro precisa ser opaco */
.plano{border:1px solid transparent;background:linear-gradient(170deg,#141A44,#0D1030 65%) padding-box,linear-gradient(150deg,rgba(255,255,255,.22),rgba(255,255,255,.04) 45%,rgba(244,183,64,.45)) border-box}
.card-luz{position:relative;overflow:hidden}
.card-luz::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(380px circle at var(--mx,50%) var(--my,0%),rgba(244,183,64,.15),transparent 45%);opacity:0;transition:opacity .35s}
.card-luz:hover::before{opacity:1}
.card-luz>*{position:relative;z-index:1}
```
```js
document.querySelectorAll('.card-luz').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
}));
```
Ícone sem caixa: `.ico-box` é só o apoio (brilho de chão embaixo via `::after`), o desenho vem do sprite próprio
do cliente (`<svg class="ig"><use href="#i-mic"/></svg>`). Nada de quadradinho com fundo nem ícone de biblioteca.
```css
.ico-box{position:relative;display:inline-grid;place-items:center;flex:none;color:var(--ouro-claro)}
.ico-box::after{content:"";position:absolute;z-index:-1;left:-6px;right:-6px;bottom:-7px;height:14px;border-radius:50%;
  background:radial-gradient(closest-side,rgba(244,183,64,.42),transparent)}
.ig{display:block;width:40px;height:40px;overflow:visible;filter:drop-shadow(0 6px 14px rgba(244,183,64,.22))}
```

## 6. Recorte da pessoa com luz de contorno

O brilho vai no invólucro e a máscara na imagem (juntos na `<img>`, o brilho é cortado no limite dela e vira um retângulo):
`<span class="recorte"><img src="img/cliente-hero.webp" ...></span>`
```css
.recorte{position:relative;z-index:1;display:block;line-height:0}
.hero-palco .recorte{filter:drop-shadow(-16px 0 40px rgba(109,59,255,.4)) drop-shadow(16px 0 40px rgba(47,91,255,.25))}
.hero-palco img{height:min(80svh,720px);width:auto;max-width:none;
  -webkit-mask-image:linear-gradient(to bottom,#000 82%,transparent);mask-image:linear-gradient(to bottom,#000 82%,transparent)}
.chao{position:absolute;left:50%;bottom:-40px;width:130%;height:170px;transform:translateX(-50%);background:radial-gradient(50% 50% at 50% 50%,rgba(255,214,140,.34),rgba(109,59,255,.14) 45%,transparent 70%)}
```
A máscara no pé do recorte é obrigatória: sem ela o corte na cintura fica duro.
Recorte gerado com `scripts/recorte.py`.

## 7. Feixe de luz com poeira (canhão de palco)

```css
.feixe{position:absolute;top:-14%;width:880px;height:130%;z-index:-1;pointer-events:none;transform-origin:50% 0;
  background:conic-gradient(from 180deg at 50% 0%,transparent 160deg,rgba(255,231,180,.13) 169deg,rgba(255,231,180,.4) 180deg,rgba(255,231,180,.13) 191deg,transparent 200deg);
  filter:blur(16px);mix-blend-mode:screen;animation:balanca 10s ease-in-out infinite alternate}
@keyframes balanca{from{rotate:-2deg}to{rotate:3deg}}
.poeira span{position:absolute;border-radius:50%;background:rgba(255,236,190,.9);box-shadow:0 0 8px rgba(255,214,140,.9);opacity:0;animation:sobe linear infinite}
@keyframes sobe{0%{transform:translateY(0);opacity:0}15%{opacity:.9}85%{opacity:.5}100%{transform:translateY(-240px);opacity:0}}
```
```js
document.querySelectorAll('[data-poeira]').forEach(box => { for (let i = 0; i < +box.dataset.poeira; i++) {
  const s = document.createElement('span'); s.style.left = Math.random()*100+'%'; s.style.top = 30+Math.random()*70+'%';
  s.style.animationDuration = 6+Math.random()*7+'s'; s.style.animationDelay = -Math.random()*12+'s';
  s.style.width = s.style.height = 1.5+Math.random()*2.5+'px'; box.appendChild(s); } });
```
Conceito de palco. Pra outro nicho, o feixe vira a luz do mundo dele (vitrine, sol, luz de clínica).

## 8. Assinatura animada (equalizador de voz)

```css
.equalizador{position:absolute;left:0;right:0;top:50%;height:300px;transform:translateY(-55%);display:flex;align-items:center;justify-content:center;gap:5px;opacity:.75;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.equalizador i{flex:none;width:4px;height:var(--h);border-radius:4px;background:linear-gradient(180deg,var(--ouro-claro),var(--ouro) 35%,var(--violeta));animation:eq var(--t,1.4s) ease-in-out infinite alternate;animation-delay:var(--d,0s)}
@keyframes eq{from{transform:scaleY(.35)}to{transform:scaleY(1)}}
```
```js
const eq = document.getElementById('equalizador'), n = Math.min(170, Math.ceil(innerWidth / 9)); let html = '';
for (let i = 0; i < n; i++) { const x = i/(n-1), env = .35 + .65*Math.abs(Math.sin(x*Math.PI*2.2))*(.55+.45*Math.sin(x*17));
  html += `<i style="--h:${Math.max(14, Math.round(env*(.55+.45*Math.random())*260))}px;--d:${(-Math.random()*1.4).toFixed(2)}s;--t:${(1+Math.random()*.9).toFixed(2)}s"></i>`; }
eq.innerHTML = html;
```
É o elemento-assinatura do Silvio (voz). Cada cliente ganha o seu, do mundo dele: linhas de planta pra
construtora, ondas de batimento pra clínica, gráfico subindo pra financeiro. Não reutilizar o equalizador
em cliente que não seja de voz/fala.

## 9. Letreiro com palavras vazadas

```css
.letreiro{overflow:hidden;padding:30px 0;border-block:1px solid var(--linha);-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.trilho{display:flex;align-items:center;gap:44px;width:max-content;animation:desliza 42s linear infinite}
@keyframes desliza{to{transform:translateX(-50%)}}
.letreiro span{font-family:var(--display);font-weight:900;font-size:clamp(2.4rem,5.6vw,4.6rem);text-transform:uppercase;color:transparent;-webkit-text-stroke:1.4px rgba(244,241,234,.3)}
.letreiro span.cheio{-webkit-text-stroke:0;background:var(--metal);-webkit-background-clip:text;background-clip:text}
```
O conteúdo do trilho vai **duplicado** no HTML (a animação anda 50%). Entre as palavras, um mini
elemento da assinatura (aqui, 4 barrinhas de equalizador).

## 10. Selo giratório (SVG textPath)

```html
<div class="selo" aria-hidden="true"><svg viewBox="0 0 140 140">
  <defs><path id="seloX" d="M70,70 m-53,0 a53,53 0 1,1 106,0 a53,53 0 1,1 -106,0"/></defs>
  <circle cx="70" cy="70" r="68" fill="#0D1030" stroke="#F4B740" stroke-width="2.5"/>
  <circle cx="70" cy="70" r="38" fill="#F4B740"/>
  <g class="giro"><text font-size="11" font-weight="800" fill="#F4B740" letter-spacing="2"><textPath href="#seloX" textLength="328" lengthAdjust="spacing">TEXTO DO SELO • NOME • </textPath></text></g>
  <!-- ícone de 24px centralizado: translate(55 55) scale(1.25) -->
</svg></div>
```
```css
.selo .giro{transform-box:view-box;transform-origin:70px 70px;animation:gira 26s linear infinite}
@keyframes gira{to{transform:rotate(360deg)}}
```
Cada selo precisa de um `id` de path diferente. `textLength="328"` fecha o círculo sem sobrar espaço.

## 11. Mockups (notebook com aula ao vivo, celular com vídeo)

Notebook: `.laptop > .laptop-tela > .laptop-display(16/10) + .laptop-base`. Dentro, a interface
falsa de videochamada (`.call`: barra com "AO VIVO", quadro principal com foto do cliente e borda
metálica, coluna de alunos com iniciais e um quadro "Você", botões redondos). O tamanho de tudo
dentro da chamada é em `em`, com `font-size:clamp(.5rem,1.2vw,.78rem)`, pra escalar junto.
Celular: `.celular` (aspect 9/19, raio 32px, entalhe com `::before`) com `<video muted loop playsinline preload="none">`
e botão de som. O vídeo só toca quando aparece na tela (IntersectionObserver).
Use quando o produto é digital ou acontece pela tela. Pra produto físico, troque por foto do produto em destaque.

## 12. Borda viva (gradiente girando em volta do formulário)

```css
.moldura-viva{position:relative;padding:1.5px;border-radius:28px;background:conic-gradient(from var(--ang),rgba(244,183,64,0) 0deg,rgba(244,183,64,.95) 70deg,rgba(109,59,255,.95) 140deg,rgba(109,59,255,0) 200deg,rgba(244,183,64,0) 360deg);animation:giraBorda 6s linear infinite}
@keyframes giraBorda{to{--ang:360deg}}
.form-card{border-radius:26.5px;background:linear-gradient(170deg,#161C4A,#0D1030 60%,#090B22)}
```
Depende do `@property --ang` declarado no topo. Sem suporte, a borda fica parada (não quebra).

## 13. Linha do tempo que acende com a rolagem

`.trilha` com `.trilha-linha > i` (altura `var(--p)`) e `.etapa` com `.etapa-n` (número). O JS calcula
o progresso da seção em relação a 62% da altura da tela e marca `.ativa` nas etapas que passaram.
Só usar número quando o conteúdo é sequência de verdade (etapas, passo a passo).

## 14. Cartão-convite (ingresso)

`.convite` em duas colunas: parte principal em gradiente metálico com listras finas
(`repeating-linear-gradient(115deg, rgba(255,255,255,.06) 0 2px, transparent 2px 14px)`) e texto escuro,
canhoto escuro separado por borda tracejada. Os "furos" do picote são dois círculos com a cor do fundo
da seção, em `::before` e `::after`. Substitui o selo de garantia quando o cliente não oferece garantia.

## 15. Outros

- **Cards flutuantes** perto do recorte (`.flutua`, vidro + `animation:flutuar 6s`): números de autoridade.
- **Nome gigante vazado** atrás do recorte (`-webkit-text-stroke:1.5px rgba(metálico,.2)`, 19vw).
- **Galeria em esteira** (`.fotos` duplicadas, `animation:desliza 70s`, fotos pares deslocadas 24px, pausa no hover).
- **Navegação de vidro** que ganha fundo depois de 30px de rolagem (`.nav.rolou`).
- **Entrada suave**: `.js .revela` com IntersectionObserver; `html.js` é marcado no `<head>` pra página
  aparecer inteira mesmo sem JS.
- **Movimento reduzido**: o bloco `@media (prefers-reduced-motion:reduce)` desliga todas as animações.

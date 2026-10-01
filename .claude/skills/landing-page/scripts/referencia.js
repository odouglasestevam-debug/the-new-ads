// Lê uma landing page de referência e mostra o "DNA" dela: fontes, cores de texto,
// fundos, gradientes e estilo de card. Serve pra calibrar o nível visual e saber
// o que NÃO repetir (fonte, hex e assinatura da referência são dela, não nossos).
// Uso: node referencia.js <url> [pasta-de-prints]
const fs = require('fs');
const path = require('path');

function carregaPlaywright() {
  try { return require('playwright'); } catch (_) {}
  const base = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, 'node_modules', 'playwright');
    if (fs.existsSync(p)) return require(p);
  }
  console.error('Playwright não encontrado. Rode uma vez: npx playwright install chromium'); process.exit(1);
}

const [, , url, pasta] = process.argv;
if (!url) { console.error('Uso: node referencia.js <url> [pasta-de-prints]'); process.exit(1); }

(async () => {
  const { chromium } = carregaPlaywright();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(5000);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 700) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(120); }
  const r = await p.evaluate(() => {
    const conta = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
    const fontes = {}, textos = {}, fundos = {}, grads = {};
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el), w = el.getBoundingClientRect().width;
      if (el.childElementCount === 0 && el.innerText && el.innerText.trim().length > 1) {
        conta(fontes, `${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontWeight}`);
        conta(textos, cs.color);
      }
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && w > 200) conta(fundos, cs.backgroundColor);
      if (cs.backgroundImage.includes('gradient')) conta(grads, cs.backgroundImage.slice(0, 200));
    });
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v}x  ${k}`);
    const titulos = [...document.querySelectorAll('h1,h2')].slice(0, 12).map(h => h.innerText.replace(/\s+/g, ' ').slice(0, 80));
    return { fontes: top(fontes, 10), textos: top(textos, 10), fundos: top(fundos, 10), gradientes: top(grads, 12), titulos };
  });
  for (const [k, v] of Object.entries(r)) { console.log(`\n== ${k}`); v.forEach(l => console.log('  ' + l)); }
  if (pasta) {
    fs.mkdirSync(pasta, { recursive: true });
    for (let y = 0, i = 1; y < H; y += 1800, i++) {
      await p.screenshot({ path: path.join(pasta, `ref-${String(i).padStart(2, '0')}.png`), fullPage: true, clip: { x: 0, y, width: 1440, height: Math.min(1800, H - y) } });
    }
    console.log(`\nPrints em ${pasta}`);
  }
  await b.close();
})();

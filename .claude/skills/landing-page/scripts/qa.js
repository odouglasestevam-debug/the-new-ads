// Confere uma landing page antes da entrega.
// Uso: node qa.js <caminho-do-index.html> <pasta-de-saida>
// Gera prints de desktop (1440) e celular (390) em fatias, e imprime um relatório:
// largura real da página, elementos vazando pra fora da tela (ignorando o que está
// dentro de área cortada, como carrossel e letreiro), erros no console,
// travessões no texto e o teste do formulário padrão da skill.
const fs = require('fs');
const path = require('path');

function carregaPlaywright() {
  try { return require('playwright'); } catch (_) {}
  const base = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'node_modules', 'playwright');
      if (fs.existsSync(p)) return require(p);
    }
  }
  console.error('Playwright não encontrado. Rode uma vez: npx playwright install chromium');
  process.exit(1);
}

const [, , arquivo, saida] = process.argv;
if (!arquivo || !saida) { console.error('Uso: node qa.js <index.html> <pasta-de-saida>'); process.exit(1); }
fs.mkdirSync(saida, { recursive: true });
const url = require('url').pathToFileURL(path.resolve(arquivo)).href;

(async () => {
  const { chromium } = carregaPlaywright();
  const browser = await chromium.launch();
  const telas = [['desktop', 1440, 900, false, 1800], ['celular', 390, 844, true, 2200]];
  for (const [nome, w, h, mob, fatia] of telas) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob });
    const erros = [];
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    page.on('pageerror', e => erros.push(String(e)));
    await page.goto(url);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(saida, `${nome}-primeira-dobra.png`) });

    // rola a página inteira pra disparar animações de entrada e imagens lazy
    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < altura; y += Math.round(h * .6)) { await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(110); }
    await page.evaluate(() => document.querySelectorAll('.revela').forEach(e => e.classList.add('visivel')));
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(900);

    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    let i = 0;
    for (let y = 0; y < total; y += fatia, i++) {
      await page.screenshot({ path: path.join(saida, `${nome}-${String(i + 1).padStart(2, '0')}.png`), fullPage: true, clip: { x: 0, y, width: w, height: Math.min(fatia, total - y) } });
    }

    const rel = await page.evaluate(() => {
      const vw = innerWidth;
      const cortado = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX)) return true;
        }
        return false;
      };
      const vazando = [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !cortado(el) && getComputedStyle(el).position !== 'fixed';
      }).slice(0, 10).map(el => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ').join('.')} (${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)})`);
      const texto = document.body.innerText;
      return { larguraPagina: document.documentElement.scrollWidth, vw, vazando, travessoes: (texto.match(/[—–]/g) || []).length };
    });

    let formulario = 'sem formulário padrão (#formLead)';
    if (await page.$('#formLead')) {
      await page.evaluate(() => document.getElementById('formLead').scrollIntoView());
      await page.click('#btnEnviar');
      const validou = await page.evaluate(() => !!document.querySelector('.campo.invalido'));
      await page.fill('#nome', 'Teste QA');
      await page.fill('#whatsapp', '48999998888');
      const mascara = await page.inputValue('#whatsapp');
      await page.click('#btnEnviar'); await page.waitForTimeout(400);
      const enviou = await page.evaluate(() => document.getElementById('formCard').classList.contains('enviado'));
      formulario = `validação vazia: ${validou ? 'ok' : 'FALHOU'} | máscara: ${mascara} | envio: ${enviou ? 'ok' : 'FALHOU'}`;
    }

    console.log(`\n[${nome}] ${w}px, altura ${total}px, ${i} fatias`);
    console.log(`  largura da página: ${rel.larguraPagina}px ${rel.larguraPagina > rel.vw ? '<- VAZANDO' : '(ok)'}`);
    console.log(`  elementos fora da tela: ${rel.vazando.length ? rel.vazando.join('; ') : 'nenhum'}`);
    console.log(`  erros no console: ${erros.length ? erros.join(' | ') : 'nenhum'}`);
    console.log(`  travessões no texto: ${rel.travessoes}`);
    console.log(`  formulário: ${formulario}`);
    await page.close();
  }
  await browser.close();
  console.log(`\nPrints em: ${saida}`);
})();

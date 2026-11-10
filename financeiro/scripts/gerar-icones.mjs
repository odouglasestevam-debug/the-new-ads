// Gera os PNGs do app a partir de site/public/icone.svg (Chromium do Playwright).
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const svg = await readFile(new URL('../site/public/icone.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const saidas = [
  ['icone-192.png', 192, 1, false],
  ['icone-512.png', 512, 1, false],
  ['apple-touch-icon.png', 180, 1, true],
  // maskable: o sistema recorta em círculo; o desenho fica na zona segura de 80%
  ['icone-maskable-512.png', 512, 0.78, true],
];
for (const [nome, tam, escala, fundoCheio] of saidas) {
  const page = await browser.newPage({ viewport: { width: tam, height: tam } });
  let interno = svg.replace('width="512" height="512"', `width="${tam * escala}" height="${tam * escala}"`);
  if (fundoCheio) interno = interno.replace('rx="112"', 'rx="0"');
  await page.setContent(`<html><body style="margin:0;width:${tam}px;height:${tam}px;display:flex;align-items:center;justify-content:center;background:${fundoCheio ? '#0A0A0A' : 'transparent'}">${interno}</body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL(`../site/public/icons/${nome}`, import.meta.url)), omitBackground: !fundoCheio });
  await page.close();
}
await browser.close();
console.log('ícones gerados');

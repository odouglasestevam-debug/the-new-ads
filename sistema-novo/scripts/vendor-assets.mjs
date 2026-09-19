import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const publicDir = new URL('../site/public/',import.meta.url);
const cssUrl='https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=switzer@400,500,600&display=swap';
const response=await fetch(cssUrl);
if(!response.ok)throw new Error(`Fonte HTTP ${response.status}`);
let css=await response.text();
const urls=[...new Set([...css.matchAll(/url\(['"]?(https:[^)'"\s]+)['"]?\)/g)].map(m=>m[1]))];
await mkdir(new URL('fonts/',publicDir),{recursive:true});
for(const url of urls){
 const r=await fetch(url);if(!r.ok)throw new Error('Falha ao baixar fonte');
 const bytes=Buffer.from(await r.arrayBuffer());
 const name=createHash('sha256').update(bytes).digest('hex').slice(0,16)+'.'+new URL(url).pathname.split('.').pop();
 await writeFile(new URL('fonts/'+name,publicDir),bytes);css=css.replaceAll(url,'/fonts/'+name);
}
await writeFile(new URL('fonts/fonts.css',publicDir),css);
let html=await readFile(new URL('index.html',publicDir),'utf8');
html=html.replace(/<link href="https:\/\/api.fontshare.com[^\n]+/,'<link rel="stylesheet" href="/fonts/fonts.css">').replace(/<link href="https:\/\/fonts.googleapis.com[^\n]+\n/,'');
await writeFile(new URL('index.html',publicDir),html);
console.log(`Fontes locais: ${urls.length} arquivos. Origem: Fontshare (Clash Display, Switzer).`);

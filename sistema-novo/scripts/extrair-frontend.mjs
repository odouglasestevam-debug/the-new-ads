import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const file = new URL('site/public/index.html', root);
let html = await readFile(file, 'utf8');
if (!html.includes('<style>')) throw new Error('Frontend já extraído');
await mkdir(new URL('baseline/2026-09-19', root), { recursive:true });
await copyFile(file, new URL('baseline/2026-09-19/index.html', root));
const report = {localSha256:createHash('sha256').update(html).digest('hex'), project:'xrvjlhseyqfgyvwwlwwb', domain:'crm.thenewads.com.br'};
await writeFile(new URL('baseline/2026-09-19/frontend.json', root), JSON.stringify(report,null,2));
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1].replace(/\niniciar\(\);\s*$/, '\n');
const markers = [
 ['core','// Chave pública'],['auth','/* ---------------- autenticação'],
 ['data','/* ---------------- dados'],['navigation','/* ---------------- navegação'],
 ['leads','/* ---------------- leads'],['kanban','/* ---------------- kanban'],
 ['conversations','/* ---------------- conversas'],['integrations','/* ---------------- integrações'],
 ['forms','/* ---------------- formulários'],['settings','/* ---------------- ajustes'],
 ['events','/* ---------------- eventos'],['lead-editor','/* ---------------- criar e editar lead'],
 ['lead-detail','/* ---------------- detalhe do lead']
];
await mkdir(new URL('site/public/js/',root),{recursive:true});
await writeFile(new URL('site/public/app.css',root),css);
for(let i=0;i<markers.length;i++){
 const start=script.indexOf(markers[i][1]);
 const end=i+1<markers.length?script.indexOf(markers[i+1][1]):script.length;
 if(start<0||end<start)throw new Error('Marcador ausente');
 await writeFile(new URL(`site/public/js/${markers[i][0]}.js`,root),script.slice(start,end));
}
await writeFile(new URL('site/public/js/boot.js',root),'iniciar().catch(() => { const aviso = document.getElementById("aviso-login"); aviso.className = "aviso erro"; aviso.textContent = "Não foi possível verificar sua sessão. Recarregue a página para tentar novamente."; });\n');
html=html.replace(/<style>[\s\S]*?<\/style>/,'<link rel="stylesheet" href="/app.css">\n<link rel="stylesheet" href="/workspace.css">');
html=html.replace(/<script>[\s\S]*?<\/script>/,markers.map(([n])=>`<script defer src="/js/${n}.js"></script>`).join('\n')+'\n<script defer src="/js/boot.js"></script>');
html=html.replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js','/vendor/supabase.js');
await writeFile(file,html);
console.log('Extraídos CSS e 13 domínios JS; boot executado por último.');

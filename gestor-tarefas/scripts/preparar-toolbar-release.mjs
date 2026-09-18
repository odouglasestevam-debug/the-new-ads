// Pacote independente: preserva cadastro/permissões atualmente publicados.
// Não publica nem aplica migrações. Apenas prepara a fonte que será revisada e testada.
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {aplicarToolbar} from './toolbar-source.mjs';
const publicDir=new URL('../site/public/',import.meta.url);
const release=new URL('../.toolbar-release/',import.meta.url);
await mkdir(new URL('public/',release),{recursive:true});
const base={};
for(const nome of ['app.js','index.html','workspace.css']) {
  const response=await fetch('https://tarefas.thenewads.com.br/'+nome);
  if(!response.ok)throw new Error(`Não foi possível ler ${nome}: ${response.status}`);
  base[nome]=await response.text();
}
if(base['index.html'].includes('membros.js'))throw new Error('Produção já tem gestão de membros: revisar o pacote antes de continuar.');
await cp(publicDir,new URL('public/',release),{recursive:true,filter:source=>!source.endsWith('membros.js')});
await writeFile(new URL('public/app.js',release),aplicarToolbar(base['app.js']));
await writeFile(new URL('public/workspace.css',release),base['workspace.css']);
let html=base['index.html'].replace('</head>','<link rel="stylesheet" href="/toolbar.css?v=12">\n</head>');
html=html.replace(/<script src="\/app\.js[^\"]*"><\/script>/,'<script src="/filtros.js?v=12"></script>\n<script src="/app.js?v=12"></script>');
await writeFile(new URL('public/index.html',release),html);
const config=await readFile(new URL('../site/wrangler.jsonc',import.meta.url),'utf8');
await writeFile(new URL('wrangler.jsonc',release),config);
await writeFile(new URL('base.json',release),JSON.stringify({createdAt:new Date().toISOString(),source:'https://tarefas.thenewads.com.br',sha256:Object.fromEntries(Object.entries(base).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')]))},null,2));
console.log('Pacote preparado em .toolbar-release: somente barra, filtros e Modo eu; permissões publicadas preservadas.');

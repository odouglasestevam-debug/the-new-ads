// Somente leitura; sem login, gravações no banco ou mensagens a destinatários reais.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://crm.thenewads.com.br';
const response=await fetch(origin+'/?release=20260920');assert.equal(response.status,200);
for(const header of ['content-security-policy','x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security'])assert.ok(response.headers.get(header),header);
const html=await response.text();
const paths=[...html.matchAll(/<script[^>]+src="([^"?]+)[^"]*"/g)].map(m=>m[1]).filter(p=>p.startsWith('/'));
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const path of [...paths,'/app.css','/workspace.css','/f.js']){
  const r=await fetch(origin+path);assert.equal(r.status,200,path);
  assert.equal(hash(await r.text()),hash(await readFile(new URL('../site/public'+path,import.meta.url),'utf8')),path+' deve coincidir com a versão testada');
}
const core=await readFile(new URL('../site/public/js/core.js',import.meta.url),'utf8');
const api=core.match(/const SUPABASE_URL = "([^"]+)"/)[1],key=core.match(/const SUPABASE_ANON_KEY = "([^"]+)"/)[1];
for(const table of ['leads','conversas','mensagens']){
 const r=await fetch(`${api}/rest/v1/${table}?select=id&limit=1`,{headers:{apikey:key}});
 assert.ok([401,403].includes(r.status),'Acesso anônimo bloqueado: '+table);
}
for(const name of ['whatsapp-enviar','whatsapp-modelos','whatsapp-midia','whatsapp-lida','integracoes','equipe']){
 const r=await fetch(`${api}/functions/v1/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'});
 assert.ok([401,403].includes(r.status),'Função autenticada: '+name);
}
// Chamadas sem autenticação devem ser recusadas antes de qualquer mutação.
for(const [name,args] of [
 ['crm_reservar_formulario',{p_formulario:'00000000-0000-0000-0000-000000000000',p_ip_hash:'0'.repeat(64)}],
 ['crm_obter_distribuicao',{p_empresa:'00000000-0000-0000-0000-000000000000'}],
 ['crm_salvar_distribuicao',{p_empresa:'00000000-0000-0000-0000-000000000000',p_modo:'manual',p_participantes:[],p_revisao:0}],
 ['crm_presenca',{p_empresa:'00000000-0000-0000-0000-000000000000',p_sessao:'00000000-0000-0000-0000-000000000000'}],
 ['crm_processar_distribuicao',{p_empresa:'00000000-0000-0000-0000-000000000000'}]
]){
 const r=await fetch(`${api}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(args)});
 assert.ok([401,403].includes(r.status),'RPC de distribuição exige autenticação: '+name);
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Users/odoug/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'networkidle'});
 assert(await page.getByRole('button',{name:'Entrar',exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>typeof sb.auth.getSession),'function');
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'tests/artifacts/login-publicado.png'});
}finally{await browser.close();}
const report={validatedAt:new Date().toISOString(),domain:origin,headers:true,assets:paths.length+3,anonymousBlocked:true,login:true,realMessagesSent:0};
await writeFile('tests/artifacts/deploy.json',JSON.stringify(report,null,2));console.log(report);

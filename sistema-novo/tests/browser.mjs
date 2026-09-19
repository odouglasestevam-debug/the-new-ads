import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('site/public');
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+sep))return res.writeHead(403).end();
  const data=await readFile(path);
  for(const line of (await readFile(resolve(root,'_headers'),'utf8')).split('\n').filter(x=>x.startsWith('  '))){const i=line.indexOf(':');res.setHeader(line.slice(0,i).trim(),line.slice(i+1).trim());}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Users/odoug/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
try{
 await mkdir('tests/artifacts',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/vendor/supabase.js',route=>route.fulfill({contentType:'text/javascript',body:`
 window.fixture={tables:{},session:null,requests:[]};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:fixture.session}}),mfa:{getAuthenticatorAssuranceLevel:async()=>fixture.mfa||({data:{currentLevel:'aal1',nextLevel:'aal1'}})}},
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{},
 rpc:async(name,args)=>({data:name==='membros_da_empresa'?fixture.team:name==='canais_whatsapp'?fixture.channels:null,error:null}),
 from:table=>{let filters=[],orders=[],limit=1000,one=false;
 const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},order:(k,o)=>{orders.push([k,o]);return q},limit:n=>{limit=n;return q},or:s=>{const t=s.match(/criado_em.lt.([^,]+)/)[1];filters.push(r=>r.criado_em<t);return q},maybeSingle:()=>{one=true;return q},single:()=>{one=true;return q},then:(ok,no)=>Promise.resolve().then(()=>{fixture.requests.push({table});let rows=(fixture.tables[table]||[]).filter(r=>filters.every(f=>f(r)));for(const[k,o]of orders.reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));rows=rows.slice(0,limit);return {data:one?rows[0]||null:structuredClone(rows),error:null}}).then(ok,no)};return q}
 })};` }));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>typeof iniciar==='function');
 await page.evaluate(async()=>{
  const now=Date.now();
  fixture.session={access_token:'fixture',user:{id:'u1',email:'demo@example.test'}};
  fixture.team=[{user_id:'u1',email:'marina@example.test'},{user_id:'u2',email:'rafael@example.test'}];
  fixture.channels=[{canal:'whatsapp_oficial',numero:'+5511000000000'}];
  fixture.tables={agencia_admins:[{user_id:'u1'}],empresas:[{id:'e1',nome:'Empresa demonstrativa',ativo:true}],membros:[],leads:[
    {id:'l1',empresa_id:'e1',nome:'Ana Oliveira',telefone:'+5511999990001',email:'ana@example.test',etapa:'proposta',responsavel_id:'u1',criado_em:new Date(now).toISOString(),lead_origens:[]},
    {id:'l2',empresa_id:'e1',nome:'Bruno Costa',telefone:'+5511999990002',etapa:'contato',responsavel_id:'u2',criado_em:new Date(now).toISOString(),lead_origens:[]}],
    conversas:[{id:'c1',empresa_id:'e1',lead_id:'l1',canal:'whatsapp_oficial',wa_id:'5511999990001',ultima_mensagem_em:new Date(now).toISOString(),ultima_entrada_em:new Date(now).toISOString(),ultima_previa:'Podemos conversar sobre a proposta?',nao_lidas:2},
    {id:'c2',empresa_id:'e1',lead_id:'l2',canal:'whatsapp_oficial',wa_id:'5511999990002',ultima_mensagem_em:new Date(now-60000).toISOString(),ultima_entrada_em:new Date(now-60000).toISOString(),ultima_previa:'Obrigado! Vou conferir com a equipe.',nao_lidas:0}],mensagens:[]};
  for(let i=0;i<65;i++)fixture.tables.mensagens.push({id:'m'+String(i).padStart(3,'0'),empresa_id:'e1',conversa_id:'c1',direcao:i%2?'saida':'entrada',tipo:'texto',texto:i===64?'Podemos conversar sobre a proposta?':i%2?'Claro! Vou separar as informações e já te retorno.':'Olá! Gostaria de saber mais sobre o atendimento.',status:i%2?'lida':'recebida',criado_em:new Date(now-(65-i)*60000).toISOString()});
  await entrarNoApp(fixture.session);
 });
 await page.locator('[data-vista="conversas"]').click();
 await page.locator('[data-abrir-conversa="c1"]').click();
 await page.getByLabel('Mensagem',{exact:true}).fill('Rascunho preservado');
 await page.evaluate(()=>atualizarConversas());
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).inputValue(),'Rascunho preservado');
 assert.equal(await page.locator('[data-mensagem]').count(),50);
 await page.getByText('Carregar mensagens anteriores',{exact:true}).click();
 assert.equal(await page.locator('[data-mensagem]').count(),65);
 await page.getByRole('button',{name:'Detalhes',exact:true}).click();
 await page.screenshot({path:'tests/artifacts/conversas-desktop.png'});
 await page.locator('[data-abrir-conversa="c2"]').click();
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).inputValue(),'');
 await page.locator('[data-abrir-conversa="c1"]').click();
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).inputValue(),'Rascunho preservado');
 await page.getByRole('button',{name:'Minhas',exact:true}).click();
 assert.equal(await page.locator('[data-abrir-conversa]').count(),1);
 await page.getByRole('button',{name:'Todas',exact:true}).click();
 await page.getByLabel('Buscar conversas').fill('Bruno');
 assert.equal(await page.locator('[data-abrir-conversa]').count(),1);
 await page.getByLabel('Buscar conversas').fill('');
 await page.getByRole('button',{name:'Fechar detalhes'}).click();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'tests/artifacts/conversas-mobile.png'});
 assert(await page.getByLabel('Mensagem',{exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const composer=await page.getByLabel('Mensagem',{exact:true}).boundingBox();
 const nav=await page.locator('aside').boundingBox();
 assert(composer.y+composer.height<nav.y,'Composer precisa ficar visível acima da navegação');
 await page.locator('#voltar-lista').click();
 assert(await page.locator('[data-abrir-conversa="c1"]').isVisible());
 await page.evaluate(()=>{papel='leitura';conversaAberta='c1';render()});
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).count(),0);
 await page.evaluate(async()=>{fixture.mfa={error:{message:'offline'}};let blocked=false;try{await precisaSegundaEtapa()}catch{blocked=true}if(!blocked)throw new Error('MFA falhou aberto')});
 assert.deepEqual(errors,[]);
 console.log('OK: paginação, rascunhos, atualização, busca, filtro Minhas, permissões, MFA, desktop e celular.');
}finally{await browser.close();server.close();}

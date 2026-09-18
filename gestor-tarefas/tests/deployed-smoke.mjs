// Somente leitura: não autentica nem altera dados reais.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin='https://tarefas.thenewads.com.br';
const response=await fetch(origin);
assert.equal(response.status,200);
for(const header of ['content-security-policy','x-content-type-options','x-frame-options','referrer-policy','permissions-policy']) {
  assert.ok(response.headers.get(header), header);
  console.log(header+': presente');
}
const script=await (await fetch(origin+'/app.js?v=9')).text();
const api=script.match(/const SUPABASE_URL = "([^"]+)"/)[1];
const key=script.match(/const SUPABASE_ANON_KEY = "([^"]+)"/)[1];
for(const table of ['tarefas_tarefas','tarefas_usuarios']) {
  const r=await fetch(api+'/rest/v1/'+table+'?select=*&limit=1',{headers:{apikey:key}});
  assert.ok([401,403].includes(r.status),'Anônimo deve ser bloqueado: '+table);
  console.log(table+': acesso anônimo bloqueado ('+r.status+')');
}
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin,{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('button',{name:'Entrar',exact:true}).isVisible(),true);
  assert.equal(await page.evaluate(()=>typeof sb.auth.getSession),'function');
  await page.getByLabel('Tema da tela de acesso').selectOption('escuro');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('data-tema'),'escuro');
  assert.equal(await page.getByLabel('Tema da tela de acesso').inputValue(),'escuro');
  await page.getByLabel('Tema da tela de acesso').selectOption('claro');
  assert.equal(await page.locator('html').getAttribute('data-tema'),'claro');
  console.log('Tema claro/escuro e persistência confirmados no domínio publicado.');
  const bloqueioEsperado = errors.filter(e=>e.includes("Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/") && e.includes('Content Security Policy'));
  assert.deepEqual(errors.filter(e=>!bloqueioEsperado.includes(e)),[]);
  console.log('Domínio publicado: login + SDK local carregam sem erros da aplicação.');
  if(bloqueioEsperado.length)console.log('Analytics Cloudflare bloqueado pela CSP, conforme política restritiva mantida.');
} finally {await browser.close();}

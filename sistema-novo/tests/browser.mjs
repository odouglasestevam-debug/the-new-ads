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
 await page.route('**/functions/v1/whatsapp-lida',route=>route.fulfill({json:{ok:true}}));
 const envios=[];
 const enviosTexto=[];
 await page.route('**/functions/v1/whatsapp-enviar',async route=>{
   const body=route.request().postDataJSON();enviosTexto.push(body);
   await new Promise(r=>setTimeout(r,200));
   await page.evaluate(b=>{fixture.tables.mensagens.push({id:b.mensagem_id,empresa_id:'e1',conversa_id:b.conversa_id,texto:b.texto,tipo:'texto',direcao:'saida',status:'enviada',autor_id:'u1',criado_em:new Date().toISOString()})},body);
   return route.fulfill({json:{mensagem:{id:body.mensagem_id,status:'enviada'}}});
 });
 await page.route('**/functions/v1/whatsapp-modelos',async route=>{
   const b=route.request().postDataJSON();
   if(b.acao==='listar')return route.fulfill({json:{modelos:[{name:'retomar_atendimento',language:'pt_BR',components:[{type:'BODY',text:'Olá {{1}}, podemos continuar seu atendimento?'}]}]}});
   envios.push(b);return route.fulfill({json:{mensagem:{id:b.mensagem_id,status:'enviada'}}});
 });
 await page.route('**/vendor/supabase.js',route=>route.fulfill({contentType:'text/javascript',body:`
 window.fixture={tables:{},session:null,requests:[]};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:fixture.session}}),mfa:{listFactors:async()=>({data:{totp:[]}}),getAuthenticatorAssuranceLevel:async()=>fixture.mfa||({data:{currentLevel:'aal1',nextLevel:'aal1'}})}},
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{},
 rpc:async(name,args)=>{
   if(name==='crm_obter_distribuicao'){
     if(fixture.distributionError)return{error:{message:'offline'}};
     return{data:structuredClone(fixture.distribution)};
   }
   if(name==='crm_salvar_distribuicao'){
     fixture.savedDistribution=structuredClone(args);
     if(fixture.saveDistributionError)return{error:{message:fixture.saveDistributionError}};
     Object.assign(fixture.distribution,{modo:args.p_modo,participantes:args.p_participantes,revisao:args.p_revisao+1});return{data:structuredClone(fixture.distribution)};
   }
   if(name==='crm_presenca'){
     if(fixture.presenceError)return{error:{message:'offline'}};
     if(args.p_sair)return{data:{online:false}};
     if(args.p_disponivel!==null)fixture.available=args.p_disponivel;
     return{data:{online:true,disponivel:!!fixture.available,participa:true,modo:fixture.distribution?.modo||'manual',distribuidos:0}};
   }
   if(name==='buscar_conversas_crm'){
     const all=(fixture.tables.conversas||[]).filter(c=>c.empresa_id===args.p_empresa);
     const rows=all.filter(c=>{const l=fixture.tables.leads.find(l=>l.id===c.lead_id);if(args.p_estado==='minhas'&&l.responsavel_id!=='u1')return false;if(args.p_estado==='nao_lidas'&&!c.nao_lidas)return false;if(args.p_responsavel&&l.responsavel_id!==args.p_responsavel)return false;if(args.p_canal&&c.canal!==args.p_canal)return false;return !args.p_busca||[l.nome,l.telefone,...fixture.tables.mensagens.filter(m=>m.conversa_id===c.id).map(m=>m.texto)].join(' ').toLowerCase().includes(args.p_busca.toLowerCase());});
     return{data:{items:structuredClone(rows.slice(args.p_offset,args.p_offset+args.p_limite).map(c=>({...c,lead:fixture.tables.leads.find(l=>l.id===c.lead_id)}))),total:rows.length,nao_lidas:all.reduce((sum,c)=>sum+c.nao_lidas,0)},error:null};
   }
   return{data:name==='membros_da_empresa'?fixture.team:name==='canais_whatsapp'?fixture.channels:null,error:null};
 },
 from:table=>{let filters=[],orders=[],limit=1000,one=false;
 const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},order:(k,o)=>{orders.push([k,o]);return q},limit:n=>{limit=n;return q},or:s=>{const t=s.match(/criado_em.lt.([^,]+)/)[1];filters.push(r=>r.criado_em<t);return q},maybeSingle:()=>{one=true;return q},single:()=>{one=true;return q},then:(ok,no)=>Promise.resolve().then(()=>{fixture.requests.push({table});let rows=(fixture.tables[table]||[]).filter(r=>filters.every(f=>f(r)));for(const[k,o]of orders.reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));rows=rows.slice(0,limit);return {data:one?rows[0]||null:structuredClone(rows),error:null}}).then(ok,no)};return q}
 })};` }));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>typeof iniciar==='function');
 await page.evaluate(async()=>{
  const now=Date.now();
  fixture.session={access_token:'fixture',user:{id:'u1',email:'demo@example.test'}};
  fixture.team=[{user_id:'u1',email:'marina@example.test',papel:'dono'},{user_id:'u2',email:'rafael@example.test',papel:'vendedor'}];
  fixture.distribution={modo:'manual',revisao:0,participantes:[],pendentes:0,historico:[],equipe:fixture.team.map(m=>({...m,demanda:m.user_id==='u1'?7:2,disponivel:true,online:true}))};
  fixture.channels=[{canal:'whatsapp_oficial',numero:'+5511000000000'}];
  fixture.tables={agencia_admins:[{user_id:'u1'}],empresas:[{id:'e1',nome:'Empresa demonstrativa',ativo:true}],membros:[],leads:[
    {id:'l1',empresa_id:'e1',nome:'Ana Oliveira',telefone:'+5511999990001',email:'ana@example.test',etapa:'proposta',responsavel_id:'u1',criado_em:new Date(now).toISOString(),lead_origens:[]},
    {id:'l2',empresa_id:'e1',nome:'Bruno Costa',telefone:'+5511999990002',etapa:'contato',responsavel_id:'u2',criado_em:new Date(now).toISOString(),lead_origens:[]}],
    conversas:[{id:'c1',empresa_id:'e1',lead_id:'l1',canal:'whatsapp_oficial',wa_id:'5511999990001',ultima_mensagem_em:new Date(now).toISOString(),ultima_entrada_em:new Date(now).toISOString(),ultima_previa:'Podemos conversar sobre a proposta?',nao_lidas:2},
    {id:'c2',empresa_id:'e1',lead_id:'l2',canal:'whatsapp_oficial',wa_id:'5511999990002',ultima_mensagem_em:new Date(now-60000).toISOString(),ultima_entrada_em:new Date(now-60000).toISOString(),ultima_previa:'Obrigado! Vou conferir com a equipe.',nao_lidas:0}],mensagens:[]};
  for(let i=0;i<65;i++)fixture.tables.mensagens.push({id:'m'+String(i).padStart(3,'0'),empresa_id:'e1',conversa_id:'c1',direcao:i%2?'saida':'entrada',tipo:'texto',texto:i===64?'Podemos conversar sobre a proposta?':i%2?'Claro! Vou separar as informações e já te retorno.':'Olá! Gostaria de saber mais sobre o atendimento.',status:i%2?'lida':'recebida',criado_em:new Date(now-(65-i)*60000).toISOString()});
  await entrarNoApp(fixture.session);
  fixture.tables.mensagens.at(-1).wa_message_id='wamid.fixture';
 });
 await page.locator('#nav [data-vista="leads"]').click();
 assert.equal(await page.locator('.linha-lead').count(),2);
 await page.getByRole('button',{name:'Meus leads',exact:true}).click();
 assert.equal(await page.locator('.linha-lead').count(),1);
 await page.getByRole('button',{name:'Todos',exact:true}).click();
 await page.getByLabel('Buscar leads',{exact:true}).fill('Bruno');
 assert.equal(await page.locator('.linha-lead').count(),1);
 await page.locator('#nav [data-vista="kanban"]').click();
 assert.equal(await page.locator('.cartao').count(),1,'Busca acompanha a troca entre lista e quadro');
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
 assert.equal(await page.locator('.cartao').count(),2);
 await page.getByRole('button',{name:'Novo lead',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 const formLast=page.getByRole('dialog').getByRole('button').last();
 await formLast.focus();await page.keyboard.press('Tab');
 assert(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),'Tab deve permanecer no diálogo');
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 assert(await page.getByRole('button',{name:'Novo lead',exact:true}).evaluate(el=>el===document.activeElement));
 await page.evaluate(()=>{
   const nomes=['Camila Rocha','Diego Martins','Fernanda Alves','Gustavo Lima','Helena Santos','Igor Ribeiro','Julia Azevedo','Lucas Mendes'];
   for(let i=0;i<nomes.length;i++)fixture.tables.leads.push({id:'visual-'+i,empresa_id:'e1',nome:nomes[i],telefone:'+55119999901'+String(i).padStart(2,'0'),email:nomes[i].split(' ')[0].toLowerCase()+'@example.test',etapa:ETAPAS[i%ETAPAS.length].id,responsavel_id:i%3?'u1':null,criado_em:new Date(Date.now()-i*86400000).toISOString(),cadastro_incompleto:i===4,lead_origens:[{canal:'site',utm_campaign:'Atendimento · setembro',criado_em:new Date().toISOString()}]});
   leads=structuredClone(fixture.tables.leads);document.getElementById('cont-leads').textContent=leads.length;render();
 });
 await page.screenshot({animations:'disabled',path:'tests/artifacts/kanban-desktop.png'});
 await page.locator('#nav [data-vista="leads"]').click();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/leads-desktop.png'});
 await page.getByText('Mais filtros',{exact:true}).click();
 const filtroBounds=await page.locator('.filtros-popover').boundingBox();
 assert(filtroBounds.x>=0&&filtroBounds.x+filtroBounds.width<=1440,'Menu de filtros deve permanecer no viewport');
 await page.screenshot({animations:'disabled',path:'tests/artifacts/leads-filtros-desktop.png'});
 await page.getByLabel('Cadastro',{exact:true}).selectOption('incompleto');
 assert.equal(await page.locator('.linha-lead').count(),1);
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
 await page.getByRole('button',{name:'Ana Oliveira',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/lead-detalhe-desktop.png'});
 await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/leads-mobile.png'});
 await page.locator('#nav [data-vista="kanban"]').click();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/kanban-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:960});
 await page.locator('#nav [data-vista="conversas"]').click();
 await page.locator('[data-abrir-conversa="c1"]').click();
 await page.getByLabel('Mensagem',{exact:true}).fill('Rascunho preservado');
 const composerHandle=await page.getByLabel('Mensagem',{exact:true}).elementHandle();
 await page.evaluate(()=>{fixture.tables.mensagens.at(-1).status='lida';fixture.tables.mensagens.at(-1).texto='Nova atualização recebida';});
 await page.evaluate(()=>atualizarConversas());
 assert.equal(await composerHandle.evaluate(el=>el.isConnected),true,'Atualização não deve recriar o composer');
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).inputValue(),'Rascunho preservado');
 assert.equal(await page.locator('[data-mensagem]').count(),50);
 await page.getByText('Carregar mensagens anteriores',{exact:true}).click();
 assert.equal(await page.locator('[data-mensagem]').count(),65);
 await page.locator('.chat-msgs').evaluate(el=>{el.scrollTop=120});
 const savedTop=await page.locator('.chat-msgs').evaluate(el=>el.scrollTop);
 await page.locator('[data-abrir-conversa="c2"]').click();
 await page.locator('[data-abrir-conversa="c1"]').click();
 assert.equal(await page.locator('.chat-msgs').evaluate(el=>el.scrollTop),savedTop,'Troca de conversa deve preservar posição');
 await page.getByRole('button',{name:'Detalhes',exact:true}).click();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/conversas-desktop.png'});
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
 await page.waitForFunction(()=>chaveListaConv===chaveFiltroConv()&&!carregandoListaConv);
 await page.getByRole('button',{name:'Fechar detalhes'}).click();
 await page.getByRole('button',{name:'Modelos aprovados',exact:true}).click();
 await page.getByLabel('Mensagem · 1',{exact:true}).fill('Ana');
 assert.equal(await page.locator('.modelo-previa').textContent(),'Olá Ana, podemos continuar seu atendimento?');
 const templateForm=await page.locator('.modelo-form').elementHandle();
 await page.evaluate(()=>atualizarConversas());
 assert.equal(await templateForm.evaluate(el=>el.isConnected),true);
 assert.equal(await page.getByLabel('Mensagem · 1',{exact:true}).inputValue(),'Ana','Atualização deve preservar formulário de modelo');
 await page.getByRole('button',{name:'Enviar modelo',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.modelo-form'));
 assert.equal(envios.length,1);assert.equal(envios[0].valores['BODY:1'],'Ana');
 await page.locator('[data-responder-mensagem="m064"]').click();
 assert.equal(await page.locator('.chat-citacao').count(),1);
 await page.getByLabel('Mensagem',{exact:true}).fill('Mensagem enviada pelo teste');
 await page.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.getByLabel('Mensagem',{exact:true}).press('Enter');
 await page.waitForFunction(()=>!enviosPendentes.has('c1'));
 assert.equal(enviosTexto.length,1,'Duplo envio deve ser bloqueado');
 assert.equal(enviosTexto[0].responder_id,'m064');
 assert.equal(await page.locator('.chat-citacao').count(),0);
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).inputValue(),'','Rascunho limpa apenas depois do aceite');
 assert.equal(await page.getByText('Mensagem enviada pelo teste',{exact:true}).count(),1);
 await page.getByLabel('Mensagem',{exact:true}).focus();
 const focusStyle=await page.getByLabel('Mensagem',{exact:true}).evaluate(el=>({width:getComputedStyle(el).outlineWidth,style:getComputedStyle(el).outlineStyle,color:getComputedStyle(el).outlineColor}));
 assert.equal(focusStyle.width,'2px');assert.equal(focusStyle.style,'solid');
 console.log('Foco visível:',JSON.stringify(focusStyle));
 await page.screenshot({animations:'disabled',path:'tests/artifacts/conversas-foco.png'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({animations:'disabled',path:'tests/artifacts/conversas-mobile.png'});
 assert(await page.getByLabel('Mensagem',{exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const composer=await page.getByLabel('Mensagem',{exact:true}).boundingBox();
 const nav=await page.locator('aside').boundingBox();
 assert(composer.y+composer.height<nav.y,'Composer precisa ficar visível acima da navegação');
 await page.locator('#voltar-lista').click();
 assert(await page.locator('[data-abrir-conversa="c1"]').isVisible());
 await page.evaluate(()=>{papel='leitura';conversaAberta='c1';render()});
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).count(),0);
 await page.evaluate(()=>{papel='agencia';vistaAtual='formularios';formEditando={nome:'Fixture',ativo:true,config:configPadrao()};render()});
 await page.waitForTimeout(250);
 assert.equal(await page.frameLocator('#previa-form').getByText('Fale com a nossa equipe',{exact:true}).count(),1);
 const stress=await page.evaluate(async()=>{
   papel='agencia';vistaAtual='conversas';formEditando=null;conversaAberta='c1';
   const base=fixture.tables.mensagens[0];fixture.tables.mensagens=Array.from({length:5000},(_,i)=>({...base,id:'stress-'+String(i).padStart(5,'0'),criado_em:new Date(Date.now()-(5000-i)*60000).toISOString(),texto:'Histórico demonstrativo '+i}));
   mensagensPorConversa={};historicoCompleto.clear();const start=performance.now();await carregarMensagens('c1');render();
   return{ms:performance.now()-start,rendered:document.querySelectorAll('[data-mensagem]').length};
 });
 assert.equal(stress.rendered,50);assert(stress.ms<2000,'Histórico deve abrir só uma página');
 console.log('Volume simulado:',JSON.stringify(stress),'de 5.000 mensagens');
 await page.setViewportSize({width:360,height:844});
 await page.evaluate(()=>{
   vistaAtual='config';abaAjustes='integracoes';integracaoWhats={whatsapp_oficial:{existe:true,status:'ativa',token_salvo:true,app_secret_salvo:true,consulta_entrada_ok:true,ultima_entrada_em:new Date().toISOString(),webhook_url:'https://fixture.invalid/webhook',config:{numero_exibido:'+5511999990000',token_valido:true,token_expira_em:0,permissoes:['whatsapp_business_messaging','whatsapp_business_management'],webhook_inscrito:true,qualidade:'GREEN',ultimo_teste_em:new Date().toISOString()}}};render();
 });
 await page.getByText('Diagnóstico da conexão',{exact:true}).click();
 assert(await page.getByText('Validado no último teste',{exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/diagnostico-mobile.png',fullPage:true});
 await page.route('**/functions/v1/equipe',route=>route.fulfill({json:{ok:true,enviado:true}}));
 await page.evaluate(()=>{abaAjustes='equipe';render()});
 await page.getByRole('button',{name:'Enviar recuperação',exact:true}).first().click();
 await page.getByText('Recuperação enviada ao e-mail da pessoa.',{exact:false}).waitFor();
 assert.equal(await page.locator('#link-membro').textContent(),'');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:960});
 await page.getByRole('button',{name:'Distribuição',exact:true}).click();
 await page.getByRole('radio',{name:'Fila rotativa',exact:false}).waitFor();
 await page.getByRole('radio',{name:'Fila rotativa',exact:false}).check();
 await page.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
 await page.getByText('Selecione pelo menos um atendente.',{exact:true}).last().waitFor();
 await page.getByRole('checkbox',{name:'marina@example.test',exact:false}).check();
 await page.getByRole('checkbox',{name:'rafael@example.test',exact:false}).check();
 await page.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
 await page.getByText('Distribuição salva.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>fixture.savedDistribution.p_participantes),['u1','u2']);
 assert.equal(await page.evaluate(()=>fixture.savedDistribution.p_modo),'fila');
 await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
 await page.screenshot({animations:'disabled',path:'tests/artifacts/distribuicao-desktop.png',fullPage:true});
 await page.getByRole('radio',{name:'Menor demanda',exact:false}).check();
 await page.evaluate(()=>{fixture.saveDistributionError='configuracao_alterada'});
 await page.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
 await page.getByText('Outro administrador alterou as regras.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('radio',{name:'Menor demanda',exact:false}).isChecked(),true);
 await page.evaluate(()=>{fixture.saveDistributionError=null});
 await page.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
 await page.getByText('Distribuição salva.',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>mostrarAbaAjustes());
 await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/distribuicao-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Disponibilidade',exact:true}).click();
 const presenceButton=page.locator('main [data-alternar-presenca]');
 await presenceButton.click();
 await page.getByText('Você está disponível para receber novos leads.',{exact:true}).waitFor();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/disponibilidade-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>fixture.available),true);
 await presenceButton.click();
 await page.getByText('Você está pausado para novas entregas por menor demanda.',{exact:true}).waitFor();
 await page.evaluate(async()=>{fixture.presenceError=true;await pulsarPresenca()});
 await page.getByRole('button',{name:'Reconectar disponibilidade',exact:true}).last().waitFor();
 await page.evaluate(()=>{fixture.presenceError=false});await presenceButton.click();
 assert.equal(await page.evaluate(()=>fixture.available),false,'Reconectar não deve desfazer pausa');
 await page.evaluate(()=>{papel='vendedor';render()});
 assert.equal(await page.getByRole('button',{name:'Distribuição',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Disponibilidade',exact:true}).count(),1);
 await page.evaluate(()=>{papel='agencia';distribuicaoAtual=null;distribuicaoRascunho=null;fixture.distributionError=true;abaAjustes='distribuicao';render()});
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();
 await page.evaluate(()=>{fixture.distributionError=false});
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
 await page.getByRole('radio',{name:'Menor demanda',exact:false}).waitFor();
 await page.getByRole('radio',{name:'Fila rotativa',exact:false}).check();
 await page.getByRole('button',{name:'Descartar alterações',exact:true}).focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'titulo-distribuicao');
 await page.evaluate(()=>{fixture.distributionError=true});
 await page.getByRole('button',{name:'Atualizar situação',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Os dados exibidos são da consulta anterior'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Atualizar situação',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
 await page.screenshot({animations:'disabled',path:'tests/artifacts/distribuicao-erro-mobile.png',fullPage:true});
 await page.evaluate(()=>{fixture.distributionError=false});
 await page.getByRole('button',{name:'Atualizar situação',exact:true}).click();
 await page.waitForFunction(()=>!distribuicaoCarregando);
 assert.equal(await page.getByRole('alert').count(),0);
 await page.locator('.pular-conteudo').focus();
 assert.equal(await page.locator('.pular-conteudo').evaluate(el=>getComputedStyle(el).clipPath),'none');
 await page.getByRole('button',{name:'Atualizar situação',exact:true}).focus();
 assert.notEqual(await page.locator('.pular-conteudo').evaluate(el=>getComputedStyle(el).clipPath),'none');
 await page.evaluate(async()=>{fixture.mfa={error:{message:'offline'}};let blocked=false;try{await precisaSegundaEtapa()}catch{blocked=true}if(!blocked)throw new Error('MFA falhou aberto')});
 await page.addScriptTag({url:'/f.js'});
 const widget=await page.evaluate(()=>{
   const host=document.createElement('div');document.body.append(host);
   const attack='</style><img src=x onerror="window.widgetCompromised=true"><style>';
   const config={titulo:attack,sucesso:'Enviado',campos:[],visual:{modo:'manual',cor_botao:attack,cor_texto_botao:attack,raio:attack}};
   TNACRMForm.render(host,config,{preview:true});
   const injected=host.shadowRoot.querySelectorAll('img,script,[onerror]').length;
   TNACRMForm.render(host,{...config,visual:{modo:'manual',cor_botao:'#123456',cor_texto_botao:'#ffffff',raio:12}},{preview:true});
   const button=host.shadowRoot.querySelector('button');
   const result={injected,executed:!!window.widgetCompromised,color:getComputedStyle(button).backgroundColor,radius:getComputedStyle(button).borderRadius};
   host.remove();return result;
 });
 assert.deepEqual(widget,{injected:0,executed:false,color:'rgb(18, 52, 86)',radius:'12px'});
 assert.deepEqual(errors,[]);
 console.log('OK: paginação, rascunhos, atualização, busca, filtro Minhas, permissões, MFA, desktop e celular.');
}finally{await browser.close();server.close();}

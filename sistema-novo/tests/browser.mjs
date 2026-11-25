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
     fixture.distribution.participantes={...fixture.distribution.participantes,[args.p_canal||'comercial']:args.p_participantes};
     Object.assign(fixture.distribution,{modo:args.p_modo,revisao:args.p_revisao+1});return{data:structuredClone(fixture.distribution)};
   }
   if(name==='crm_presenca'){
     if(fixture.presenceError)return{error:{message:'offline'}};
     if(args.p_sair)return{data:{online:false}};
     if(args.p_disponivel!==null)fixture.available=args.p_disponivel;
     return{data:{online:true,disponivel:!!fixture.available,participa:true,modo:fixture.distribution?.modo||'manual',distribuidos:0}};
   }
   if(name==='crm_agendar_mensagem'){const c=fixture.tables.conversas.find(x=>x.id===args.p_conversa);const agora=new Date().toISOString();const row={id:crypto.randomUUID(),empresa_id:c.empresa_id,conversa_id:c.id,lead_id:c.lead_id,autor_id:fixture.session.user.id,texto:args.p_texto.trim(),enviar_em:args.p_enviar_em,cancelar_se_responder:args.p_cancelar_se_responder,status:'agendada',erro:null,tentativas:0,criado_em:agora,atualizado_em:agora};(fixture.tables.mensagens_agendadas||=[]).push(row);return{data:structuredClone(row),error:null};}
   if(name==='crm_reagendar_mensagem'){const row=fixture.tables.mensagens_agendadas.find(x=>x.id===args.p_id);Object.assign(row,{texto:args.p_texto,enviar_em:args.p_enviar_em,cancelar_se_responder:args.p_cancelar_se_responder});return{data:structuredClone(row),error:null};}
   if(name==='crm_cancelar_mensagem_agendada'){const row=fixture.tables.mensagens_agendadas.find(x=>x.id===args.p_id);row.status='cancelada';return{data:true,error:null};}
   if(name==='crm_criar_lembrete'){const l=fixture.tables.leads.find(x=>x.id===args.p_lead);const row={id:crypto.randomUUID(),empresa_id:l.empresa_id,lead_id:l.id,user_id:args.p_para||fixture.session.user.id,criado_por:fixture.session.user.id,quando:args.p_quando,nota:args.p_nota,status:'pendente',criado_em:new Date().toISOString()};(fixture.tables.lembretes||=[]).push(row);return{data:structuredClone(row),error:null};}
   if(name==='crm_atualizar_lembrete'){const row=fixture.tables.lembretes.find(x=>x.id===args.p_id);if(args.p_acao==='concluir')row.status='concluido';else if(args.p_acao==='cancelar')row.status='cancelado';else Object.assign(row,{quando:args.p_quando,nota:args.p_nota,status:'pendente'});return{data:structuredClone(row),error:null};}
   if(name==='buscar_conversas_crm'){
     const all=(fixture.tables.conversas||[]).filter(c=>c.empresa_id===args.p_empresa);
     if(args.p_etapa&&!fixture.etapas)return{data:null,error:{message:'function buscar_conversas_crm(p_etapa) does not exist'}};
     const semEtapa=all.filter(c=>{const l=fixture.tables.leads.find(l=>l.id===c.lead_id);if(args.p_estado==='minhas'&&l.responsavel_id!=='u1')return false;if(args.p_estado==='nao_lidas'&&!c.nao_lidas)return false;if(args.p_responsavel&&l.responsavel_id!==args.p_responsavel)return false;if(args.p_canal&&c.canal!==args.p_canal)return false;return !args.p_busca||[l.nome,l.telefone,...fixture.tables.mensagens.filter(m=>m.conversa_id===c.id).map(m=>m.texto)].join(' ').toLowerCase().includes(args.p_busca.toLowerCase());});
     const leadDe=c=>fixture.tables.leads.find(l=>l.id===c.lead_id);const rows=semEtapa.filter(c=>!args.p_etapa||leadDe(c).etapa===args.p_etapa);
     const extra=fixture.etapas?{por_etapa:semEtapa.reduce((m,c)=>(m[leadDe(c).etapa]=(m[leadDe(c).etapa]||0)+1,m),{}),total_etapas:semEtapa.length}:{};
     return{data:{items:structuredClone(rows.slice(args.p_offset,args.p_offset+args.p_limite).map(c=>({...c,lead:leadDe(c)}))),total:rows.length,nao_lidas:all.reduce((sum,c)=>sum+c.nao_lidas,0),...extra},error:null};
   }
   return{data:name==='membros_da_empresa'?fixture.team:name==='canais_whatsapp'?fixture.channels:null,error:null};
 },
 from:table=>{let filters=[],orders=[],limit=1000,one=false,patch=null;
 const q={select:()=>q,update:p=>{patch=p;return q},eq:(k,v)=>{filters.push(r=>r[k]===v);return q},order:(k,o)=>{orders.push([k,o]);return q},limit:n=>{limit=n;return q},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q},gte:(k,v)=>{filters.push(r=>String(r[k])>=v);return q},or:s=>{const t=s.match(/criado_em.lt.([^,]+)/)[1];filters.push(r=>r.criado_em<t);return q},maybeSingle:()=>{one=true;return q},single:()=>{one=true;return q},then:(ok,no)=>Promise.resolve().then(()=>{fixture.requests.push({table});if(fixture.semAgenda&&['lembretes','mensagens_agendadas'].includes(table))return{data:null,error:{code:'PGRST205',message:'Could not find the table'}};let rows=(fixture.tables[table]||[]).filter(r=>filters.every(f=>f(r)));if(patch)for(const r of rows)Object.assign(r,patch);for(const[k,o]of orders.reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o?.ascending===false?-1:1));rows=rows.slice(0,limit);return {data:one?rows[0]||null:structuredClone(rows),error:null}}).then(ok,no)};return q}
 })};` }));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>typeof iniciar==='function');
 await page.evaluate(async()=>{
  const now=Date.now();
  fixture.session={access_token:'fixture',user:{id:'u1',email:'demo@example.test'}};
  fixture.team=[{user_id:'u1',email:'marina@example.test',papel:'dono'},{user_id:'u2',email:'rafael@example.test',papel:'vendedor'}];
  fixture.distribution={modo:'manual',revisao:0,participantes:{},pendentes:0,pendentes_canal:{},historico:[],
    canais:[{id:'comercial',nome:'Comercial',detalhe:'Landing page, formulário, cadastro manual e campanha no número oficial',numero:'+5511000000000'},
      {id:'suporte',nome:'Suporte',detalhe:'Contatos recebidos no número de atendimento',numero:'+5511000000001'}],
    equipe:fixture.team.map(m=>({...m,demanda:m.user_id==='u1'?7:2,disponivel:true,online:true}))};
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
 const ETAPAS_TESTE=await page.evaluate(()=>ETAPAS.map(e=>e.id));
 // Arrasto do kanban com ponteiro real: precisa rolar o quadro, sobreviver à sincronização de 25s e gravar a etapa.
 const cartaoArrastado=page.locator('.cartao[data-arrastavel]').first();
 const idArrastado=await cartaoArrastado.getAttribute('data-id');
 const etapaOrigem=await page.evaluate(id=>leads.find(l=>l.id===id).etapa,idArrastado);
 const destino=ETAPAS_TESTE[ETAPAS_TESTE.length-1];
 assert.notEqual(destino,etapaOrigem,'destino do teste precisa ser outra etapa');
 assert(await page.evaluate(()=>{const k=document.querySelector('.kanban');return k.scrollWidth>k.clientWidth}),'quadro do teste precisa ter coluna fora da tela');
 const caixa=await cartaoArrastado.boundingBox();
 await page.mouse.move(caixa.x+caixa.width/2,caixa.y+30);
 await page.mouse.down();
 await page.mouse.move(caixa.x+caixa.width/2+40,caixa.y+60,{steps:6});
 assert(await page.evaluate(()=>!!document.querySelector('.fantasma-cartao')),'arrasto precisa mostrar o cartão na mão');
 const sobreviveu=await page.evaluate(async id=>{
   // o nó exato precisa continuar no documento: um cartão recriado com o mesmo id já quebrou o arrasto
   const no=document.querySelector(`.cartao[data-id="${id}"]`);
   fixture.tables.leads.push({id:'zz-sync',empresa_id:'e1',nome:'Entrada durante o arrasto',telefone:'+5511999990000',etapa:'novo',responsavel_id:'u1',criado_em:new Date().toISOString(),lead_origens:[]});
   await sincronizarLeadsDistribuidos();
   return no.isConnected;
 },idArrastado);
 assert(sobreviveu,'Cartão em arrasto não pode ser destruído pela sincronização de leads');
 // beirada direita precisa rolar o quadro sozinho até a coluna escondida aparecer
 const larguraJanela=page.viewportSize().width;
 for(let i=0;i<60;i++){
   await page.mouse.move(larguraJanela-30,caixa.y+120);
   if(await page.evaluate(e=>{const c=document.querySelector(`.coluna[data-etapa="${e}"]`);return c.getBoundingClientRect().right<=window.innerWidth},destino))break;
   await page.waitForTimeout(50);
 }
 const alvoBox=await page.locator(`.coluna[data-etapa="${destino}"]`).boundingBox();
 assert(alvoBox.x+alvoBox.width<=larguraJanela,'rolagem automática precisa trazer a coluna de destino para a tela');
 await page.mouse.move(alvoBox.x+alvoBox.width/2,alvoBox.y+60,{steps:4});
 await page.mouse.up();
 await page.locator(`.coluna[data-etapa="${destino}"] .cartao[data-id="${idArrastado}"]`).waitFor();
 assert.equal(await page.evaluate(id=>fixture.tables.leads.find(l=>l.id===id).etapa,idArrastado),destino,'Soltar precisa gravar a nova etapa');
 assert.equal(await page.locator('.fantasma-cartao').count(),0,'cartão na mão precisa sumir ao soltar');
 await page.evaluate(([id,etapa])=>{const l=fixture.tables.leads.find(l=>l.id===id);l.etapa=etapa;fixture.tables.leads=fixture.tables.leads.filter(l=>l.id!=='zz-sync');leads=structuredClone(fixture.tables.leads);document.getElementById('cont-leads').textContent=leads.length;render();},[idArrastado,etapaOrigem]);
 // pegar o cartão pelo nome do lead precisa arrastar, e o clique seguinte não pode abrir a gaveta
 const pegarPeloNome=page.locator(`.cartao[data-id="${idArrastado}"] .nome-lead`);
 const nomeBox=await pegarPeloNome.boundingBox();
 const vizinha=ETAPAS_TESTE.find(e=>e!==etapaOrigem);
 const colunaVizinha=await page.locator(`.coluna[data-etapa="${vizinha}"]`).boundingBox();
 await page.mouse.move(nomeBox.x+nomeBox.width/2,nomeBox.y+nomeBox.height/2);
 await page.mouse.down();
 await page.mouse.move(colunaVizinha.x+colunaVizinha.width/2,colunaVizinha.y+70,{steps:10});
 await page.mouse.up();
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(id=>fixture.tables.leads.find(l=>l.id===id).etapa,idArrastado),vizinha,'arrastar pelo nome do lead precisa mover o cartão');
 assert.equal(await page.locator('.gaveta').count(),0,'arrastar não pode abrir a gaveta do lead');
 // clique sem arrasto continua abrindo a gaveta
 await page.waitForTimeout(200);
 await pegarPeloNome.click();
 await page.locator('.gaveta').waitFor();
 await page.locator('.gaveta .fechar').click();
 assert.equal(await page.locator('.gaveta').count(),0);
 await page.evaluate(([id,etapa])=>{const l=fixture.tables.leads.find(l=>l.id===id);l.etapa=etapa;leads=structuredClone(fixture.tables.leads);render();},[idArrastado,etapaOrigem]);
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
 // abas de etapa: escondidas enquanto o banco não tem a migration 0031, visíveis e filtrando depois dela
 assert.equal(await page.locator('.aba-etapa').count(),0,'sem a migration 0031 as abas de etapa não aparecem');
 await page.evaluate(async()=>{fixture.etapas=true;await buscarListaConversas();});
 assert.equal(await page.locator('.aba-etapa').count(),7);
 await page.getByRole('button',{name:'Proposta enviada 1',exact:true}).click();
 await page.waitForFunction(()=>chaveListaConv===chaveFiltroConv()&&!carregandoListaConv);
 assert.deepEqual(await page.locator('[data-abrir-conversa]').evaluateAll(els=>els.map(e=>e.dataset.abrirConversa)),['c1'],'aba filtra pela etapa do lead');
 assert.equal(await page.getByRole('button',{name:'Proposta enviada 1',exact:true}).getAttribute('aria-pressed'),'true');
 await page.screenshot({animations:'disabled',path:'tests/artifacts/conversas-etapa-desktop.png'});
 await page.getByRole('button',{name:'Todas as etapas 2',exact:true}).click();
 await page.waitForFunction(()=>chaveListaConv===chaveFiltroConv()&&!carregandoListaConv);
 assert.equal(await page.locator('[data-abrir-conversa]').count(),2);
 // mudar a etapa pelo cabeçalho do chat grava no lead e atualiza a contagem das abas
 await page.getByLabel('Etapa de Ana Oliveira',{exact:true}).selectOption('cliente');
 await page.getByRole('button',{name:'Cliente 1',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>fixture.tables.leads.find(l=>l.id==='l1').etapa),'cliente');
 await page.getByLabel('Etapa de Ana Oliveira',{exact:true}).selectOption('proposta');
 await page.getByRole('button',{name:'Proposta enviada 1',exact:true}).waitFor();
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
 assert(await page.locator('.aba-etapa').first().isVisible(),'no celular as abas de etapa ficam no topo da lista');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'abas de etapa rolam dentro da faixa, sem empurrar a página');
 await page.screenshot({animations:'disabled',path:'tests/artifacts/conversas-lista-mobile.png'});
 await page.evaluate(()=>{papel='leitura';conversaAberta='c1';render()});
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).count(),0);
 await page.evaluate(()=>{papel='agencia';vistaAtual='config';abaAjustes='formularios';formEditando={nome:'Fixture',ativo:true,config:configPadrao()};render()});
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
 await page.getByText('Selecione pelo menos um atendente em algum canal.',{exact:true}).last().waitFor();
 await page.getByRole('checkbox',{name:'marina@example.test',exact:false}).check();
 await page.getByRole('checkbox',{name:'rafael@example.test',exact:false}).check();
 await page.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
 await page.getByText('Distribuição salva.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>fixture.savedDistribution.p_participantes),['u1','u2']);
 assert.equal(await page.evaluate(()=>fixture.savedDistribution.p_modo),'fila');
 assert.equal(await page.evaluate(()=>fixture.savedDistribution.p_canal),'comercial','salvar aplica ao canal aberto');
 // cada canal guarda a sua equipe: trocar de aba não arrasta a seleção do canal anterior
 await page.getByRole('tab',{name:/Suporte/}).click();
 assert.equal(await page.getByRole('checkbox',{name:'marina@example.test',exact:false}).isChecked(),false,'canal novo começa sem equipe');
 await page.getByRole('checkbox',{name:'rafael@example.test',exact:false}).check();
 await page.getByRole('button',{name:'Salvar distribuição',exact:true}).click();
 await page.getByText('Distribuição salva.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[fixture.savedDistribution.p_canal,fixture.savedDistribution.p_participantes]),['suporte',['u2']]);
 assert.deepEqual(await page.evaluate(()=>fixture.distribution.participantes),{comercial:['u1','u2'],suporte:['u2']},'fila comercial permanece intacta');
 await page.getByRole('tab',{name:/Comercial/}).click();
 assert.equal(await page.getByRole('checkbox',{name:'marina@example.test',exact:false}).isChecked(),true,'fila comercial volta como estava');
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
 await page.getByText('Você está online e tem preferência para receber novos leads.',{exact:true}).waitFor();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/disponibilidade-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>fixture.available),true);
 await presenceButton.click();
 await page.getByText('Você está ocupado: recebe só quando for a sua vez e ninguém estiver online.',{exact:true}).waitFor();
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
 // ---------- agenda: mensagem agendada e lembrete (24/11/2026) ----------
 await page.setViewportSize({width:1440,height:960});
 // banco sem a migration 0033: nada da agenda aparece, nem o menu
 await page.evaluate(async()=>{fixture.semAgenda=true;await carregarAgenda();vistaAtual='conversas';filtroConv.etapa='';render();await abrirConversa('c1')});
 assert.equal(await page.locator('#nav [data-vista="agenda"]').isVisible(),false,'sem a 0033 o menu Agenda fica escondido');
 assert.equal(await page.locator('[data-agendar]').count(),0);assert.equal(await page.locator('#novo-lembrete').count(),0);
 await page.evaluate(async()=>{fixture.semAgenda=false;await carregarAgenda();render();});
 assert.equal(await page.locator('#nav [data-vista="agenda"]').isVisible(),true);
 // agendar pelo relógio do campo de mensagem leva o texto já digitado
 await page.getByLabel('Mensagem',{exact:true}).fill('Bom dia, Ana! Separei a proposta.');
 await page.getByRole('button',{name:'Agendar envio',exact:true}).click();
 const dialogoAgenda=page.getByRole('dialog');
 await dialogoAgenda.getByRole('heading',{name:'Agendar mensagem'}).waitFor();
 assert.equal(await dialogoAgenda.getByLabel('Mensagem',{exact:true}).inputValue(),'Bom dia, Ana! Separei a proposta.');
 // depois de 24h da última mensagem do lead a Meta recusa texto livre: o formulário avisa e oferece lembrete
 await dialogoAgenda.getByLabel('Dia').fill(await page.evaluate(()=>dataInput(emDias(3,9))));
 await dialogoAgenda.getByText(/A janela de 24 horas desta conversa fecha/).waitFor();
 await dialogoAgenda.getByRole('button',{name:'Daqui a 1 hora'}).click();
 assert.equal(await dialogoAgenda.locator('#ag-janela').isHidden(),true,'dentro da janela não avisa');
 await page.screenshot({animations:'disabled',path:'tests/artifacts/agendar-mensagem-desktop.png'});
 await dialogoAgenda.getByRole('button',{name:'Agendar',exact:true}).click();
 await page.getByText(/^Mensagem agendada para (hoje|amanhã) às/).waitFor();
 assert.equal(await page.getByLabel('Mensagem',{exact:true}).inputValue(),'','campo limpo depois de agendar');
 const balaoAgendado=page.locator('.bolha.agendada');
 await balaoAgendado.waitFor();
 assert.match(await balaoAgendado.textContent(),/Sai (hoje|amanhã) às/);
 assert.equal(await page.evaluate(()=>fixture.tables.mensagens_agendadas.length),1);
 // editar troca o texto; cancelar tira do chat
 await balaoAgendado.getByRole('button',{name:'Editar'}).click();
 await page.getByRole('dialog').getByRole('heading',{name:'Editar mensagem agendada'}).waitFor();
 await page.getByRole('dialog').getByLabel('Mensagem',{exact:true}).fill('Bom dia! Segue a proposta.');
 await page.getByRole('dialog').getByRole('button',{name:'Salvar'}).click();
 await page.locator('.bolha.agendada',{hasText:'Bom dia! Segue a proposta.'}).waitFor();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/mensagem-agendada-chat.png'});
 page.once('dialog',d=>d.accept());
 await page.locator('.bolha.agendada').getByRole('button',{name:'Cancelar envio'}).click();
 await page.locator('.bolha.agendada').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>fixture.tables.mensagens_agendadas[0].status),'cancelada');
 // mensagem que saiu pela agenda leva o relógio no balão
 await page.evaluate(async()=>{fixture.tables.mensagens.push({id:'enviada-pela-agenda',empresa_id:'e1',conversa_id:'c1',direcao:'saida',tipo:'texto',texto:'Saiu no horário marcado',status:'entregue',autor_id:'u1',midia:{agendada:true},criado_em:new Date().toISOString()});await carregarMensagens('c1');render();});
 assert.equal(await page.locator('[data-mensagem="enviada-pela-agenda"] .marca-agendada').count(),1);
 // lembrete pelo sino do topo da conversa
 await page.getByRole('button',{name:'Criar lembrete',exact:true}).click();
 const dialogoLembrete=page.getByRole('dialog');
 await dialogoLembrete.getByRole('heading',{name:'Novo lembrete'}).waitFor();
 await dialogoLembrete.getByLabel('O que fazer').fill('Ligar para apresentar a proposta');
 await dialogoLembrete.getByRole('button',{name:'Amanhã às 09:00'}).click();
 assert.match(await dialogoLembrete.locator('#lb-resumo').textContent(),/amanhã às 09:00/);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/lembrete-desktop.png'});
 await dialogoLembrete.getByRole('button',{name:'Criar lembrete'}).click();
 await page.getByText(/^Lembrete marcado para amanhã às 09:00/).waitFor();
 assert.equal(await page.evaluate(()=>fixture.tables.lembretes[0].nota),'Ligar para apresentar a proposta');
 assert.equal(await page.locator('#novo-lembrete.com-lembrete').count(),1,'sino marca o lead que tem lembrete');
 // lembrete vencido: aparece na lista de conversas e no contador do menu
 await page.evaluate(async()=>{fixture.tables.lembretes.push({id:'lb-vencido',empresa_id:'e1',lead_id:'l1',user_id:'u1',criado_por:'u1',quando:new Date(Date.now()-3600e3).toISOString(),nota:'Retomar orçamento',status:'avisado',criado_em:new Date().toISOString()});await carregarAgenda();conversaAberta=null;render();});
 assert.match(await page.locator('[data-abrir-conversa="c1"] .pino.lembrete').textContent(),/retomar agora/);
 assert.equal(await page.locator('#cont-agenda').textContent(),'1');
 // tela Agenda: passou do horário primeiro, depois os próximos dias
 await page.locator('#nav [data-vista="agenda"]').click();
 await page.getByRole('heading',{name:/Passou do horário/}).waitFor();
 await page.getByRole('heading',{name:/^Amanhã/}).waitFor();
 await page.screenshot({animations:'disabled',path:'tests/artifacts/agenda-desktop.png'});
 await page.locator('.item-agenda',{hasText:'Retomar orçamento'}).getByRole('button',{name:'Concluir'}).click();
 await page.getByText('Lembrete concluído.').waitFor();
 assert.equal(await page.evaluate(()=>fixture.tables.lembretes.find(x=>x.id==='lb-vencido').status),'concluido');
 assert.equal(await page.locator('.item-agenda',{hasText:'Retomar orçamento'}).count(),0);
 await page.locator('.item-agenda',{hasText:'Ligar para apresentar a proposta'}).getByRole('button',{name:'Adiar'}).click();
 await page.getByRole('dialog').getByRole('heading',{name:'Adiar lembrete'}).waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'Daqui a 1 hora'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Salvar'}).click();
 await page.getByText(/^Lembrete marcado para/).waitFor();
 assert.notEqual(await page.evaluate(()=>fixture.tables.lembretes[0].quando),await page.evaluate(()=>emDias(1,9).toISOString()),'adiar grava o horário novo');
 // dono vê a agenda da equipe; a dele mostra só os próprios
 await page.evaluate(async()=>{fixture.tables.lembretes.push({id:'lb-rafael',empresa_id:'e1',lead_id:'l2',user_id:'u2',criado_por:'u1',quando:new Date(Date.now()+2*86400e3).toISOString(),nota:'Mandar catálogo',status:'pendente',criado_em:new Date().toISOString()});await carregarAgenda();render();});
 assert.equal(await page.locator('.item-agenda',{hasText:'Mandar catálogo'}).count(),0,'minha agenda mostra só os meus');
 await page.getByRole('button',{name:'Equipe',exact:true}).click();
 await page.locator('.item-agenda',{hasText:'Mandar catálogo'}).waitFor();
 assert.match(await page.locator('.item-agenda',{hasText:'Mandar catálogo'}).textContent(),/para rafael/);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/agenda-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:960});
 await page.locator('.item-agenda',{hasText:'Mandar catálogo'}).getByRole('button',{name:'Abrir conversa'}).click();
 assert.deepEqual(await page.evaluate(()=>[vistaAtual,conversaAberta]),['conversas','c2']);
 // ficha do lead ganha a aba Agenda; o cartão do kanban mostra o próximo lembrete
 await page.evaluate(()=>{filtroAgenda.escopo='minha';vistaAtual='kanban';conversaAberta=null;render();});
 assert.equal(await page.locator('.cartao[data-id="l1"] .sinal.lembrete').count(),1);
 await page.locator('.cartao[data-id="l1"] .nome-lead').click();
 await page.getByRole('dialog').locator('[data-aba="agenda"]').click();
 await page.getByRole('dialog').locator('.item-agenda',{hasText:'Ligar para apresentar a proposta'}).waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
 // ---------- notificação, instalação e telas de todos os tamanhos (24/11/2026) ----------
 await page.setViewportSize({width:1440,height:960});
 await page.evaluate(()=>{try{localStorage.removeItem('crm:faixa-app-dispensada')}catch{};pushEstado.suporte=true;pushEstado.permissao='default';pushEstado.inscrito=false;vistaAtual='conversas';conversaAberta=null;filtroConv.etapa='';render()});
 const faixa=page.getByRole('region',{name:'Receba notificações de mensagens novas'});
 await faixa.waitFor();
 await page.evaluate(()=>{
   Notification.requestPermission=async()=>'granted';
   PushManager.prototype.subscribe=async()=>({toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{p256dh:'chave',auth:'segredo'}})});
   const rpc=sb.rpc;sb.rpc=async(nome,args)=>{if(nome==='crm_salvar_push')fixture.push=args;return rpc(nome,args)};
 });
 await faixa.getByRole('button',{name:'Ativar notificações'}).click();
 await page.getByText('Pronto. Este aparelho vai avisar a cada mensagem nova.',{exact:true}).waitFor();
 assert.equal(await faixa.count(),0,'faixa some com a notificação ligada');
 assert.equal(await page.evaluate(()=>fixture.push?.p_endpoint),'https://fcm.googleapis.com/fcm/send/fixture','inscrição gravada no banco');
 // Ajustes: instalação e notificação na mesma aba, primeira de "Sua conta"
 await page.locator('#nav [data-vista="config"]').click();
 await page.getByRole('button',{name:'Notificações',exact:true}).click();
 await page.getByRole('heading',{name:/Instalar no celular/}).waitFor();
 await page.getByRole('heading',{name:/Notificações\s*ligadas/}).waitFor();
 assert.equal(await page.locator('.menu-ajustes .aba').first().textContent(),'Notificações');
 // "Agora não" esconde a faixa neste aparelho, mesmo depois de redesenhar
 await page.evaluate(()=>{pushEstado.inscrito=false;vistaAtual='conversas';render()});
 await faixa.getByRole('button',{name:'Agora não'}).click();
 assert.equal(await faixa.count(),0);
 await page.evaluate(()=>render());
 assert.equal(await faixa.count(),0,'continua escondida');
 await page.evaluate(()=>localStorage.removeItem('crm:faixa-app-dispensada'));
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>render());
 await faixa.waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/faixa-notificacoes-mobile.png'});
 // iPhone fora da tela de início: a faixa ensina a instalar, porque sem isso a Apple não entrega notificação
 await page.evaluate(()=>{Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',configurable:true});render()});
 const faixaIphone=page.getByRole('region',{name:'Receba as mensagens no iPhone'});
 await faixaIphone.waitFor();
 await faixaIphone.getByRole('button',{name:'Como instalar'}).click();
 await page.getByText('Adicionar à Tela de Início',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>abaAjustes),'notificacoes');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({animations:'disabled',path:'tests/artifacts/instalar-iphone-mobile.png',fullPage:true});
 await page.evaluate(()=>{delete navigator.userAgent;pushEstado.inscrito=true;render()});
 // o service worker pergunta antes de avisar: conversa aberta na tela não toca, as outras tocam
 const naTela=lead=>page.evaluate(lead=>new Promise(ok=>{const canal=new MessageChannel();canal.port1.onmessage=e=>ok(e.data);
   navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{tipo:'conversa-aberta?',lead},ports:[canal.port2]}));}),lead);
 await page.setViewportSize({width:1440,height:960});
 await page.evaluate(()=>{vistaAtual='conversas';render();return abrirConversa('c1')});
 assert.equal(await naTela('l1'),true,'conversa aberta e na tela: sem aviso');
 assert.equal(await naTela('l2'),false,'mensagem de outra conversa: avisa');
 await page.evaluate(()=>{vistaAtual='kanban';render()});
 assert.equal(await naTela('l1'),false,'fora da tela de conversas: avisa');
 // tocar na notificação abre a conversa, saindo de qualquer tela
 // a conversa da mensagem que acabou de chegar ainda não está na lista carregada: o CRM busca e abre
 await page.evaluate(()=>{const lead='0b0f6c1e-0000-4000-8000-000000000001',conversa='0b0f6c1e-0000-4000-8000-000000000002',agora=new Date().toISOString();
   fixture.tables.leads.push({id:lead,empresa_id:'e1',nome:'Carla Notificação',telefone:'+5511999990077',etapa:'novo',responsavel_id:'u1',criado_em:agora,lead_origens:[]});
   leads.push(structuredClone(fixture.tables.leads.at(-1)));
   fixture.tables.conversas.push({id:conversa,empresa_id:'e1',lead_id:lead,canal:'whatsapp_oficial',wa_id:'5511999990077',ultima_mensagem_em:agora,ultima_entrada_em:agora,ultima_previa:'Chegou agora',nao_lidas:1});
   conversaAberta=null;vistaAtual='kanban';filtroConv.busca='Bruno';render();
   return abrirLeadDaUrl(location.origin+'/?lead='+lead+'&conversa='+conversa)});
 assert.deepEqual(await page.evaluate(()=>[vistaAtual,conversaAberta,filtroConv.busca,location.search]),['conversas','0b0f6c1e-0000-4000-8000-000000000002','','']);
 await page.locator('.chat-cabeca').getByText('Carla Notificação',{exact:true}).waitFor();
 // responsivo: nenhuma tela rola para o lado, do celular pequeno ao monitor grande,
 // e o campo de mensagem fica sempre acima da barra de baixo
 const telas={
   conversas:()=>{vistaAtual='conversas';conversaAberta=null;render()},
   chat:()=>{vistaAtual='conversas';render();return abrirConversa('c1')},
   kanban:()=>{vistaAtual='kanban';conversaAberta=null;render()},
   leads:()=>{vistaAtual='leads';render()},
   ajustes:()=>{vistaAtual='config';abaAjustes='notificacoes';render()},
   agenda:()=>{vistaAtual='agenda';render()},
 };
 for(const largura of [320,360,390,414,768,1024,1280,1920]){
   await page.setViewportSize({width:largura,height:largura<700?740:900});
   for(const [nome,abrir] of Object.entries(telas)){
     await page.evaluate(abrir);
     const sobra=await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
     assert.ok(sobra<=0,`${nome} em ${largura}px rola ${sobra}px para o lado`);
     if(nome==='chat'){
       const campo=await page.locator('.chat-painel textarea').boundingBox();
       const limite=await page.evaluate(()=>{const topo=document.querySelector('aside').getBoundingClientRect().top;return topo>0?topo:innerHeight});
       assert.ok(campo&&campo.y+campo.height<=limite,`campo de mensagem escondido em ${largura}px`);
     }
   }
   if(largura===768){
     await page.evaluate(telas.conversas);
     await page.screenshot({animations:'disabled',path:'tests/artifacts/conversas-tablet.png'});
   }
 }
 await page.setViewportSize({width:390,height:844});
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
 console.log('OK: paginação, rascunhos, atualização, busca, filtro Minhas, permissões, MFA, notificação, instalação, agenda, desktop, tablet e celular.');
}finally{await browser.close();server.close();}

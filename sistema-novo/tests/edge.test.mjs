import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const ROOT=new URL('../supabase/functions/',import.meta.url);
const uid='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222',eid='33333333-3333-4333-8333-333333333333',mid='44444444-4444-4444-8444-444444444444';
function database(){
 const state={user:{id:uid,factors:[]},tables:{conversas:[{id:cid,empresa_id:eid,canal:'whatsapp_oficial',wa_id:'5511999990000',ultima_entrada_em:new Date().toISOString(),leads:{responsavel_id:uid}}],empresas:[{id:eid,ativo:true}],agencia_admins:[],membros:[{empresa_id:eid,user_id:uid,papel:'vendedor'}],integracoes:[{id:'55555555-5555-4555-8555-555555555555',empresa_id:eid,tipo:'whatsapp_oficial',status:'ativa',config:{phone_number_id:'123',waba_id:'456'}}],mensagens:[]},secrets:{token:'fixture',app_secret:'signature-test',url_token:'url-secret',webhook_secret:'signature-test'},rpcError:null};
 state.uploads=[];state.recoveries=[];state.limite=true;state.formLimit=true;state.captures=0;
 const admin={storage:{from:()=>({upload:async(path,bytes)=>{state.uploads.push({path,size:bytes.byteLength||bytes.size});return{error:null}},createSignedUrl:async(path)=>({data:{signedUrl:'https://fixture.invalid/'+path}})})},auth:{getUser:async()=>({data:{user:state.user}}),admin:{getUserById:async id=>({data:{user:{id,email:'titular@example.test'}}}),generateLink:async()=>{throw new Error('Recuperação não pode gerar link para o administrador')}},resetPasswordForEmail:async(email,options)=>{state.recoveries.push({email,options});return{error:null}}},rpc:async name=>name==='integracao_ler_segredos'?{data:state.secrets}:name==='crm_limitar_acao'?{data:state.limite,error:state.limitError}:name==='crm_reservar_formulario'?{data:state.formLimit,error:state.limitError}:name==='receber_lead_site'?(state.captures++,{data:{ok:true},error:state.rpcError}):{error:state.rpcError},from:table=>{
  let filters=[],action='select',payload,one=false,count=false;
  const q={select:(s,o)=>{count=!!o?.count;return q},eq:(k,v)=>{filters.push(r=>r[k]===v);return q},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q},is:(k,v)=>{filters.push(r=>r[k]===v);return q},gte:(k,v)=>{filters.push(r=>r[k]>=v);return q},lte:(k,v)=>{filters.push(r=>r[k]<=v);return q},limit:()=>q,order:()=>q,
   maybeSingle:()=>{one=true;return q},single:()=>{one=true;return q},insert:v=>{action='insert';payload=v;return q},update:v=>{action='update';payload=v;return q},upsert:v=>{action='insert';payload=v;return q},
   then:(ok,no)=>Promise.resolve().then(()=>{const tableRows=state.tables[table]||[];let rows=tableRows.filter(r=>filters.every(f=>f(r)));
    if(action==='insert'){if(tableRows.some(r=>r.id===payload.id))return{error:{code:'23505'}};const row={criado_em:new Date().toISOString(),...payload};tableRows.push(row);state.tables[table]=tableRows;rows=[row];}
    if(action==='update')rows.forEach(r=>Object.assign(r,payload));
    return{data:one?rows[0]||null:structuredClone(rows),error:null,...(count?{count:rows.length}:{})};}).then(ok,no)};return q;
 }};return{state,admin};
}
async function load(name,options={}){
 const db=database();let handler;
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_ANON_KEY:'fixture',NEOGO_ALLOWED_HOSTS:'api.example.test'};
 const ctx=vm.createContext({Request,Response,URL,FormData,File,Headers,Uint8Array,TextEncoder,TextDecoder,crypto,atob,AbortSignal,console,Date,setTimeout,clearTimeout,
   createClient:()=>db.admin,fetch:options.fetch||(()=>{throw new Error('Rede real bloqueada em teste')}),Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn}});
 for(const file of ['_shared/security.ts',...(['whatsapp-modelos','whatsapp-midia','whatsapp-webhook','whatsapp-lida'].includes(name)?['_shared/whatsapp.ts']:[]),...(name==='whatsapp-webhook'?['_shared/incoming-media.ts']:[]),`${name}/index.ts`]){
   let code=await readFile(new URL(file,ROOT),'utf8');code=code.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
   vm.runInContext(stripTypeScriptTypes(code),ctx,{filename:file});
 }
 return{...db,ctx,handler};
}
const request=(body,params='')=>new Request('https://fixture.invalid/'+params,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)});
test('envio de texto autoriza responsável, é idempotente e rejeita leitura',async()=>{
 let calls=0;const x=await load('whatsapp-enviar',{fetch:async()=>{calls++;return Response.json({messages:[{id:'wamid.test'}]})}});
 const b={conversa_id:cid,texto:'Teste fictício',mensagem_id:mid};
 assert.equal((await x.handler(request(b))).status,200);
 assert.equal((await x.handler(request(b))).status,200);
 assert.equal(calls,1);assert.equal(x.state.tables.mensagens.length,1);
 x.state.tables.membros[0].papel='leitura';
 assert.equal((await x.handler(request({...b,mensagem_id:crypto.randomUUID()}))).status,403);assert.equal(calls,1);
});
test('timeout não reenvia mensagem aceita possivelmente pelo provedor',async()=>{
 let calls=0;const x=await load('whatsapp-enviar',{fetch:async()=>{calls++;throw new Error('timeout')}});
 const b={conversa_id:cid,texto:'Não duplicar',mensagem_id:mid};
 assert.equal((await x.handler(request(b))).status,202);assert.equal((await x.handler(request(b))).status,202);
 assert.equal(calls,1);assert.equal(x.state.tables.mensagens[0].status,'enviando');
});
test('resposta citada usa mensagem da mesma conversa e conserva identidade da tentativa',async()=>{
 let calls=0;const reference=crypto.randomUUID();
 const x=await load('whatsapp-enviar',{fetch:async(url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.context.message_id,'wamid.original');assert.equal(payload.biz_opaque_callback_data,mid);return Response.json({messages:[{id:'wamid.reply'}]});}});
 x.state.tables.mensagens.push({id:reference,empresa_id:eid,conversa_id:cid,texto:'Mensagem original',wa_message_id:'wamid.original'});
 const b={conversa_id:cid,texto:'Respondendo',mensagem_id:mid,responder_id:reference};
 assert.equal((await x.handler(request(b))).status,200);
 assert.equal(x.state.tables.mensagens.at(-1).midia.resposta.texto,'Mensagem original');
 assert.equal((await x.handler(request(b))).status,200);assert.equal(calls,1);
 assert.equal((await x.handler(request({...b,responder_id:null}))).status,409);
 x.state.tables.mensagens[0].conversa_id='outra-conversa';
 assert.equal((await x.handler(request({...b,mensagem_id:crypto.randomUUID()}))).status,422);assert.equal(calls,1);
});
test('recibo correlaciona envio pendente sem permitir outra empresa',async()=>{
 const x=await load('whatsapp-webhook');
 x.state.tables.mensagens.push({id:mid,empresa_id:eid,conversa_id:cid,direcao:'saida',status:'enviando',wa_message_id:null});
 const receipt=async()=>{
   const body=JSON.stringify({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},statuses:[{id:'wamid.late',status:'delivered',timestamp:String(Math.floor(Date.now()/1000)),biz_opaque_callback_data:mid}]}}]}]});
   return x.handler(new Request('https://fixture.invalid/?i=55555555-5555-4555-8555-555555555555',{method:'POST',body,headers:{'X-Hub-Signature-256':await signature(body)}}));
 };
 x.state.tables.mensagens[0].empresa_id='outra-empresa';
 assert.equal((await receipt()).status,200);assert.equal(x.state.tables.mensagens[0].wa_message_id,null);
 x.state.tables.mensagens[0].empresa_id=eid;
 assert.equal((await receipt()).status,200);assert.equal(x.state.tables.mensagens[0].wa_message_id,'wamid.late');
});
test('empresa inativa, MFA pendente e lead de outro vendedor bloqueiam envio',async()=>{
 const x=await load('whatsapp-enviar');const b={conversa_id:cid,texto:'Teste',mensagem_id:mid};
 x.state.tables.empresas[0].ativo=false;assert.equal((await x.handler(request(b))).status,403);
 x.state.tables.empresas[0].ativo=true;x.state.user.factors=[{status:'verified'}];assert.equal((await x.handler(request(b))).status,403);
 x.state.user.factors=[];x.state.tables.conversas[0].leads.responsavel_id='outro';assert.equal((await x.handler(request(b))).status,403);
});
test('limite de envio bloqueia chamadas ao provedor e falha fechado',async()=>{
 const x=await load('whatsapp-enviar');const b={conversa_id:cid,texto:'Teste',mensagem_id:mid};
 x.state.limite=false;assert.equal((await x.handler(request(b))).status,429);
 x.state.limitError={message:'offline'};assert.equal((await x.handler(request(b))).status,503);
 assert.equal(x.state.tables.mensagens.length,0);
});
test('recuperação da equipe vai somente ao titular e não revela link de acesso',async()=>{
 const x=await load('equipe');x.state.tables.membros[0].papel='dono';
 const target=crypto.randomUUID();x.state.tables.membros.push({empresa_id:eid,user_id:target,papel:'vendedor'});
 const b={acao:'link_acesso',empresa_id:eid,user_id:target};
 const result=await x.handler(request(b));assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{ok:true,enviado:true});assert.equal(x.state.recoveries.length,1);
 assert.equal(x.state.recoveries[0].email,'titular@example.test');
 assert.equal((await x.handler(request({...b,user_id:crypto.randomUUID()}))).status,404);
 x.state.tables.membros[0].papel='gestor';assert.equal((await x.handler(request(b))).status,403);
 assert.equal(x.state.recoveries.length,1);
});
async function signature(body){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('signature-test'),{name:'HMAC',hash:'SHA-256'},false,['sign']);return 'sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex');}

test('JSON tem limite real, rejeita null/array e encerra leitura lenta',async()=>{
 const x=await load('whatsapp-enviar');
 for(const body of [null,[],42])assert.equal((await x.handler(request(body))).status,400);
 const big=request({texto:'a'.repeat(70000)});assert.equal((await x.handler(big)).status,413);
 const r=await x.ctx.jsonLimitado(request({texto:'ok'}));assert.equal(r.texto,'ok');
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(80));controller.enqueue(new Uint8Array(80));}});
 await assert.rejects(x.ctx.textoLimitado(new Request('https://fixture.invalid',{method:'POST',body:stream,duplex:'half'}),100),e=>e.status===413);
 const slow=new ReadableStream({start(){}});
 await assert.rejects(x.ctx.textoLimitado(new Request('https://fixture.invalid',{method:'POST',body:slow,duplex:'half'}),100,10),e=>e.status===408);
});
test('integrações e recursos WhatsApp têm quota e Retry-After, sem chamar provedor',async()=>{
 for(const name of ['integracoes','whatsapp-modelos','whatsapp-lida','whatsapp-midia']){
  const x=await load(name);x.state.tables.membros[0].papel='dono';x.state.limite=false;
  const res=await x.handler(request({empresa_id:eid,conversa_id:cid,acao:'ver'}));
  assert.equal(res.status,429,name);assert.equal(res.headers.get('Retry-After'),'60');assert.equal(res.headers.get('Cache-Control'),'no-store');
  x.state.limitError={code:'offline'};assert.equal((await x.handler(request({empresa_id:eid,conversa_id:cid,acao:'ver'}))).status,503,name);
 }
});
test('formulário reserva antes de capturar, falha fechado e bloqueia redirect ativo',async()=>{
 const x=await load('form');x.state.tables.formularios=[{id:mid,chave:'fixture',ativo:true,config:{redirect_url:'javascript:alert(1)'}}];
 const b={k:'fixture',nome:'Pessoa fictícia',telefone:'11999990000',tempo_ms:5000};
 x.state.formLimit=false;const limited=await x.handler(request(b));assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'600');assert.equal(x.state.captures,0);
 x.state.limitError={code:'offline'};assert.equal((await x.handler(request(b))).status,503);assert.equal(x.state.captures,0);
 x.state.formLimit=true;x.state.limitError=null;
 const ok=await x.handler(request(b));assert.equal(ok.status,200);assert.equal((await ok.json()).redirect,'');assert.equal(x.state.captures,1);
 assert.equal((await x.handler(request(null))).status,400);assert.equal((await x.handler(request({data:'a'.repeat(70000)}))).status,413);
 assert.equal(x.ctx.redirectSeguro('https://example.test/obrigado'),'https://example.test/obrigado');
 for(const url of ['data:text/html,test','javascript:alert(1)','https://user:pass@example.test'])assert.equal(x.ctx.redirectSeguro(url),'');
});
test('empresa inativa bloqueia equipe e integrações; leitura não envia recibo',async()=>{
 for(const name of ['equipe','integracoes']){const x=await load(name);x.state.tables.empresas[0].ativo=false;x.state.tables.membros[0].papel='dono';assert.equal((await x.handler(request({empresa_id:eid,acao:'ver'}))).status,403);}
 const x=await load('whatsapp-lida');x.state.tables.membros[0].papel='leitura';assert.equal((await x.handler(request({conversa_id:cid,mensagem_id:mid}))).status,403);
});
test('webhook oficial limita payload e recusa evento nulo mesmo com assinatura válida',async()=>{
 const x=await load('whatsapp-webhook');
 assert.equal((await x.handler(new Request('https://fixture.invalid/?i=55555555-5555-4555-8555-555555555555',{method:'POST',body:'x'.repeat(2*1024*1024+1)}))).status,413);
 const body='null';assert.equal((await x.handler(new Request('https://fixture.invalid/?i=55555555-5555-4555-8555-555555555555',{method:'POST',body,headers:{'X-Hub-Signature-256':await signature(body)}}))).status,400);
});
test('webhook oficial retorna 503 em falha persistente e exige assinatura',async()=>{
 const x=await load('whatsapp-webhook');x.state.rpcError={code:'08006',message:'offline'};
 const body=JSON.stringify({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages:[{id:'in1',from:'5511999990000',type:'text',text:{body:'Fixture'}}]}}]}]});
 const req=()=>new Request('https://fixture.invalid/?i=55555555-5555-4555-8555-555555555555',{method:'POST',body});
 assert.equal((await x.handler(req())).status,401);
 const signed=req();signed.headers.set('X-Hub-Signature-256',await signature(body));assert.equal((await x.handler(signed)).status,503);
});
test('NeoGo exige HMAC quando secret está configurado',async()=>{
 const x=await load('neogo-webhook');x.state.tables.integracoes[0].tipo='whatsapp_nao_oficial';
 const body=JSON.stringify({event:'noop'}),url='https://fixture.invalid/?i=55555555-5555-4555-8555-555555555555&t=url-secret';
 assert.equal((await x.handler(new Request(url,{method:'POST',body}))).status,401);
 assert.equal((await x.handler(new Request(url,{method:'POST',body,headers:{'X-Hub-Signature-256':await signature(body)}}))).status,200);
});
test('URL NeoGo permite somente host autorizado e bloqueia credenciais/caminhos',async()=>{
 const x=await load('neogo-webhook');
 assert.equal(vm.runInContext("neoGoBase('https://api.example.test')",x.ctx),'https://api.example.test');
 for(const url of ['https://localhost','https://127.0.0.1','https://evil.test','https://api.example.test@evil.test','http://api.example.test','https://api.example.test/path'])assert.throws(()=>vm.runInContext(`neoGoBase(${JSON.stringify(url)})`,x.ctx));
});
test('diagnóstico oficial detecta permissão ausente e mostra somente metadados do token',async()=>{
 let scopes=['whatsapp_business_management'];
 const x=await load('integracoes',{fetch:async(url,options)=>{
   assert.equal(options.redirect,'error');
   if(String(url).includes('debug_token'))return Response.json({data:{is_valid:true,app_id:'app1',expires_at:0,scopes}});
   if(String(url).includes('subscribed_apps'))return Response.json({data:[{whatsapp_business_api_data:{id:'app1'}}]});
   return Response.json({display_phone_number:'+5511999990000',verified_name:'Fixture',quality_rating:'GREEN'});
 }});
 x.state.tables.membros[0].papel='dono';
 const b={acao:'testar',tipo:'whatsapp_oficial',empresa_id:eid};
 let result=await (await x.handler(request(b))).json();assert.equal(result.ok,false);assert.equal(result.estado.status,'erro');
 assert.equal(result.estado.config.ultimo_erro_codigo,'sem_permissao_envio');assert.equal(result.estado.token,undefined);
 scopes.push('whatsapp_business_messaging');
 result=await (await x.handler(request(b))).json();assert.equal(result.ok,true);assert.equal(result.estado.status,'ativa');
 assert.equal(result.estado.config.webhook_inscrito,true);assert.equal(result.estado.config.token_expira_em,0);
 assert.ok(result.estado.ultima_entrada_em);
});
test('modelos aceitam somente aprovados e validam cada variável',async()=>{
 const x=await load('whatsapp-modelos');
 assert.equal(vm.runInContext("modeloSuportado({status:'PENDING',components:[{type:'BODY',text:'Oi'}]})",x.ctx),false);
 assert.equal(vm.runInContext("modeloSuportado({status:'APPROVED',components:[{type:'BODY',text:'Oi {{1}}'}]})",x.ctx),true);
 assert.throws(()=>vm.runInContext("preencherModelo({components:[{type:'BODY',text:'Oi {{1}}'}]}, {})",x.ctx));
 const result=vm.runInContext("preencherModelo({components:[{type:'BODY',text:'Oi {{nome}}'}]}, {'BODY:nome':'Ana'})",x.ctx);
 assert.equal(result.text,'Oi Ana');assert.equal(result.components[0].parameters[0].parameter_name,'nome');
});
test('mídia recusa formato ativo e excesso de tamanho',async()=>{
 const x=await load('whatsapp-midia');
 assert.throws(()=>vm.runInContext("tipoArquivo('text/html',100)",x.ctx));
 assert.throws(()=>vm.runInContext("tipoArquivo('image/jpeg',6000000)",x.ctx));
 assert.equal(vm.runInContext("tipoArquivo('image/jpeg',1000).tipo",x.ctx),'imagem');
});
test('upload em partes tem limite antes de decodificar o formulário',async()=>{
 const x=await load('whatsapp-midia');let chunks=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){if(chunks++<30)controller.enqueue(new Uint8Array(1024*1024));else controller.close()},cancel(){cancelled=true}});
 const req=new Request('https://fixture.invalid/',{method:'POST',duplex:'half',headers:{authorization:'Bearer fixture','content-type':'multipart/form-data; boundary=fixture'},body:stream});
 assert.equal((await x.handler(req)).status,413);assert.equal(cancelled,true);assert.equal(x.state.uploads.length,0);
});
test('modelo aprovado gera payload e repetição não duplica envio',async()=>{
 let sends=0;
 const x=await load('whatsapp-modelos',{fetch:async(url,options)=>{
   if(options.method==='POST'){sends++;const payload=JSON.parse(options.body);assert.equal(payload.template.components[0].parameters[0].text,'Ana');return Response.json({messages:[{id:'wamid.template'}]});}
   return Response.json({data:[{name:'retomar',language:'pt_BR',status:'APPROVED',components:[{type:'BODY',text:'Olá {{1}}'}]}]});
 }});
 const body={acao:'enviar',conversa_id:cid,mensagem_id:mid,nome:'retomar',idioma:'pt_BR',valores:{'BODY:1':'Ana'}};
 assert.equal((await x.handler(request(body))).status,200);assert.equal((await x.handler(request(body))).status,200);
 assert.equal(sends,1);assert.equal(x.state.tables.mensagens[0].texto,'Olá Ana');
});
test('webhook copia mídia recebida para bucket privado sem devolver credencial',async()=>{
 const x=await load('whatsapp-webhook',{fetch:async url=>String(url).includes('graph.facebook.com')?Response.json({url:'https://lookaside.fbsbx.com/fixture',mime_type:'image/png'}):new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}})});
 x.state.tables.mensagens.push({id:mid,empresa_id:eid,conversa_id:cid,wa_message_id:'incoming-image',tipo:'imagem',midia:{id:'987'}});
 const body=JSON.stringify({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages:[{id:'incoming-image',from:'5511999990000',type:'image',image:{id:'987',mime_type:'image/png'}}]}}]}]});
 const req=new Request('https://fixture.invalid/?i=55555555-5555-4555-8555-555555555555',{method:'POST',body,headers:{'X-Hub-Signature-256':await signature(body)}});
 assert.equal((await x.handler(req)).status,200);
 assert.equal(x.state.uploads.length,1);assert.equal(x.state.uploads[0].path,`${eid}/${cid}/${mid}.png`);
 assert.equal(x.state.tables.mensagens[0].midia.storage_path,`${eid}/${cid}/${mid}.png`);
});

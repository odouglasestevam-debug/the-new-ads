import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('distribuição: rodízio, demanda, presença, retomada e autorização no banco',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema vault;create schema storage;
    create table auth.users(id uuid primary key,email text,aud text,role text);
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid,status text);
    create table vault.secrets(id uuid primary key,secret text);create table vault.decrypted_secrets(id uuid,decrypted_secret text);
    create function vault.create_secret(text,text) returns uuid language sql as $$select gen_random_uuid()$$;
    create function vault.update_secret(uuid,text) returns void language sql as $$select$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create function public.rls_auto_enable() returns void language sql as $$select$$;
    create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema public,auth to authenticated,service_role;
    alter default privileges in schema public grant all on tables to authenticated,service_role;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const company=crypto.randomUUID(),other=crypto.randomUUID(),owner=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID(),reader=crypto.randomUUID(),outsider=crypto.randomUUID();
  const sessionA=crypto.randomUUID(),sessionB=crypto.randomUUID();
  for(const [id,email]of [[owner,'owner'],[a,'ana'],[b,'bruno'],[reader,'reader'],[outsider,'outsider']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email+'@example.test']);
  await db.query(`insert into empresas(id,nome,slug) values($1,'A','a'),($2,'B','b')`,[company,other]);
  for(const [id,role,co]of [[owner,'dono',company],[a,'vendedor',company],[b,'vendedor',company],[reader,'leitura',company],[outsider,'dono',other]])await db.query('insert into membros(empresa_id,user_id,papel) values($1,$2,$3)',[co,id,role]);
  const login=async(id,aal='aal1')=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated',aal})]);await db.exec('set role authenticated');};
  const server=async()=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','',false)`);};
  const config=async()=>{await login(owner);return (await db.query('select crm_obter_distribuicao($1) d',[company])).rows[0].d;};
  const save=async(mode,ids=[a,b])=>{const c=await config();return(await db.query('select crm_salvar_distribuicao($1,$2,$3,$4) d',[company,mode,ids,c.revisao])).rows[0].d;};
  const insert=async({responsavel=null,etapa='novo',co=company,tel=null}={})=>{
   await server();const id=crypto.randomUUID();await db.query('insert into leads(id,empresa_id,responsavel_id,etapa,telefone) values($1,$2,$3,$4,$5)',[id,co,responsavel,etapa,tel]);return id;
  };
  const responsible=async id=>{await server();return(await db.query('select responsavel_id r from leads where id=$1',[id])).rows[0].r;};
  const beat=async(id,session,available=null,quit=false)=>{await login(id);return(await db.query('select crm_presenca($1,$2,$3,$4) d',[company,session,available,quit])).rows[0].d;};
  let historic;
  await t.test('padrão manual, autorização, parâmetros e membros de outra empresa',async()=>{
   historic=await insert();assert.equal(await responsible(historic),null);
   assert.equal((await config()).modo,'manual');
   for(const user of[a,reader,outsider]){await login(user);await assert.rejects(db.query('select crm_obter_distribuicao($1)',[company]),/sem_acesso/);await assert.rejects(db.query('select crm_salvar_distribuicao($1,$2,$3,0)',[company,'fila',[a,b]]),/sem_acesso/);}
   await login(owner);
   for(const ids of[[],[a,a],[a,null]])await assert.rejects(db.query('select crm_salvar_distribuicao($1,$2,$3,0)',[company,'fila',ids]),/configuracao_invalida/);
   for(const ids of[[reader],[outsider]])await assert.rejects(db.query('select crm_salvar_distribuicao($1,$2,$3,0)',[company,'fila',ids]),/participante_invalido/);
   await db.exec('reset role; set role anon');await assert.rejects(db.query('select crm_obter_distribuicao($1)',[company]),/permission denied/);
  });
  await t.test('fila gira A B A B, preserva manual e não importa histórico',async()=>{
   await save('fila');
   for(const expected of[a,b,a,b])assert.equal(await responsible(await insert()),expected);
   assert.equal(await responsible(await insert({responsavel:owner})),owner);
   assert.equal(await responsible(historic),null);
   assert.equal(await responsible(await insert({co:other})),null);
   assert.equal(await responsible(await insert({etapa:'cliente'})),null);
   const c=await save('fila');assert.deepEqual(c.participantes,[a,b]);
   assert.equal(await responsible(await insert()),a);
   const same=await config();await assert.rejects(db.query('select crm_salvar_distribuicao($1,$2,$3,$4)',[company,'fila',[a,b],same.revisao-1]),/configuracao_alterada/);
  });
  await t.test('rollback e conflito de telefone não consomem uma vez na fila',async()=>{
   const lead=await insert({tel:'+5511999988888'});const before=await config();await server();
   await db.query(`insert into leads(empresa_id,telefone) values($1,'+5511999988888') on conflict do nothing`,[company]);
   await db.exec('begin');await db.query('insert into leads(empresa_id) values($1)',[company]);await db.exec('rollback');
   const after=await config();assert.deepEqual(after.participantes,before.participantes);assert.equal(after.historico.length,before.historico.length);assert(await responsible(lead));
  });
  await t.test('formulários e WhatsApp usam o mesmo rodízio e reentregas não trocam responsável',async()=>{
   const c=await config(),next=c.participantes[0];await server();
   await db.query(`insert into formularios(empresa_id,nome,chave) values($1,'Fixture distribuição','fixture-distribution')`,[company]);
   const site=async()=>db.query(`select * from receber_lead_site('fixture-distribution','Fixture site','+5511999977777',null,'{}','{}')`);
   const id=(await site()).rows[0].lead_id;assert.equal(await responsible(id),next);
   const before=await config();await server();await site();assert.deepEqual((await config()).participantes,before.participantes);
   await server();const whats=async()=>db.query(`select * from receber_mensagem_whatsapp($1,'whatsapp_oficial','5511999966666','Fixture Whats','fixture-assignment-message','texto','Olá',null,null,now(),'entrada')`,[company]);
   await whats();const wa=(await db.query(`select id,responsavel_id from leads where empresa_id=$1 and telefone='+5511999966666'`,[company])).rows[0];
   assert.equal(wa.responsavel_id,before.participantes[0]);
   const after=await config();await server();await whats();assert.deepEqual((await config()).participantes,after.participantes);
   assert.equal(await responsible(wa.id),wa.responsavel_id);
  });
  await t.test('inteligente aguarda sem online e entrega quando um participante fica disponível',async()=>{
   await save('inteligente');const waiting=await insert();assert.equal(await responsible(waiting),null);assert.equal((await config()).pendentes,1);
   assert.equal((await beat(a,sessionA)).disponivel,false);assert.equal(await responsible(waiting),null);
   await beat(a,sessionA,true);assert.equal(await responsible(waiting),a);assert.equal((await config()).pendentes,0);
  });
  await t.test('menor carga ignora ganhos/perdidos; pausa, expiração e múltiplas abas',async()=>{
   await server();await db.query(`update leads set etapa='cliente' where empresa_id=$1 and responsavel_id=$2`,[company,b]);
   await insert({responsavel:b,etapa:'perdido'});await beat(b,sessionB,true);
   assert.equal(await responsible(await insert()),b);
   await beat(b,sessionB,false);assert.equal(await responsible(await insert()),a);
   await beat(b,sessionB,true);await server();await db.query(`update privado.crm_presencas set visto_em=clock_timestamp()-interval '91 seconds' where user_id=$1`,[b]);
   assert.equal(await responsible(await insert()),a);
   const extra=crypto.randomUUID();await beat(b,extra);await beat(b,sessionB,null,true);
   assert.equal(await responsible(await insert()),b,'Sair de uma aba não derruba outra sessão');
   await beat(b,extra,false);assert.equal((await beat(b,extra)).disponivel,false,'Heartbeat não deve desfazer pausa');
  });
  await t.test('empate de demanda usa rodízio, nunca o mesmo por ordem alfabética',async()=>{
   await server();await db.query(`update leads set etapa='cliente' where empresa_id=$1`,[company]);
   await beat(a,sessionA,true);await beat(b,sessionB,true);
   const first=await responsible(await insert()),second=await responsible(await insert());assert.notEqual(first,second);
  });
  await t.test('pendente assumido manualmente não é redistribuído; desligar não reimporta pendentes',async()=>{
   await beat(a,sessionA,false);await beat(b,sessionB,false);
   const manual=await insert();await server();await db.query('update leads set responsavel_id=$1 where id=$2',[owner,manual]);
   await beat(a,sessionA,true);assert.equal(await responsible(manual),owner);
   await beat(a,sessionA,false);const released=await insert();await save('manual');await save('fila');
   assert.equal(await responsible(released),null);assert.equal((await config()).pendentes,0);
  });
  await t.test('backlog é processado em lotes, sem depender de atendente online na fila',async()=>{
   await save('inteligente');await beat(a,sessionA,false);await beat(b,sessionB,false);
   await server();await db.query('insert into leads(empresa_id) select $1 from generate_series(1,62)',[company]);
   assert.equal((await config()).pendentes,62);
   assert.equal((await save('fila')).pendentes,12);
   await login(a);await assert.rejects(db.query('select crm_processar_distribuicao($1)',[company]),/sem_acesso/);
   await login(owner);assert.equal((await db.query('select crm_processar_distribuicao($1) n',[company])).rows[0].n,12);
   assert.equal((await config()).pendentes,0);
  });
  await t.test('leitura/rebaixamento, membro removido, tenant e MFA falham fechados',async()=>{
   await server();await db.query(`update membros set papel='leitura' where empresa_id=$1 and user_id=$2`,[company,b]);
   assert.equal(await responsible(await insert()),a);
   await assert.rejects(beat(b,sessionB,true),/sem_acesso/);
   await login(a);await assert.rejects(db.query('select * from privado.crm_presencas'),/permission denied/);
   await assert.rejects(db.query('select crm_presenca($1,$2,true)',[other,sessionA]),/sem_acesso/);
   await server();await db.query(`insert into auth.mfa_factors(user_id,status) values($1,'verified')`,[a]);await assert.rejects(beat(a,sessionA,true),/sem_acesso/);
   await login(a,'aal2');assert.equal((await db.query('select crm_presenca($1,$2,true) d',[company,sessionA])).rows[0].d.online,true);
   await server();await db.query('delete from membros where empresa_id=$1 and user_id=$2',[company,a]);
   assert.equal(await responsible(await insert()),null);assert.equal((await config()).pendentes,1);
   await db.exec('reset role');await db.query('update empresas set ativo=false where id=$1',[company]);
   await login(owner);await assert.rejects(db.query('select crm_obter_distribuicao($1)',[company]),/sem_acesso/);
  });
 }finally{await db.close();}
});

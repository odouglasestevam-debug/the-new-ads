// Aviso no celular a cada mensagem recebida (0032). Banco descartável com todas as migrations.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create schema vault;create schema storage;
   create table auth.users(id uuid primary key,email text,aud text,role text,raw_user_meta_data jsonb default '{}'::jsonb);
   create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid,status text);
   create table vault.secrets(id uuid primary key,secret text);create table vault.decrypted_secrets(id uuid,name text,decrypted_secret text);
   create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
   create schema net;create table net.chamadas(url text);
   create function net.http_post(url text,headers jsonb default null,body jsonb default null,params jsonb default null,timeout_milliseconds integer default null) returns bigint language sql as $$insert into net.chamadas values(url);select 1::bigint$$;
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
 await db.exec(`insert into vault.decrypted_secrets(name,decrypted_secret) values('crm_cron','segredo-de-teste')`);
 return db;
}

test('mensagem recebida vira aviso para quem atende o lead',async()=>{
 const db=await banco();
 try{
  const id=()=>crypto.randomUUID();
  const e=id(),inativa=id(),dono=id(),gestor=id(),vend=id(),leitor=id();
  await db.query(`insert into auth.users(id,email) values($1,'dono@example.test'),($2,'gestor@example.test'),($3,'vend@example.test'),($4,'leitor@example.test')`,[dono,gestor,vend,leitor]);
  await db.query(`insert into empresas(id,nome,slug) values($1,'Empresa','empresa'),($2,'Parada','parada')`,[e,inativa]);
  await db.query(`update empresas set ativo=false where id=$1`,[inativa]);
  await db.query(`insert into membros(empresa_id,user_id,papel) values($1,$2,'dono'),($1,$3,'gestor'),($1,$4,'vendedor'),($1,$5,'leitura'),($6,$2,'dono')`,[e,dono,gestor,vend,leitor,inativa]);

  let seq=0;
  const lead=async(nome,resp,empresa=e)=>{const l=id(),c=id(),tel='+55119999900'+String(++seq).padStart(2,'0');
   await db.query(`insert into leads(id,empresa_id,nome,telefone,responsavel_id) values($1,$2,$3,$4,$5)`,[l,empresa,nome,tel,resp]);
   await db.query(`insert into conversas(id,empresa_id,lead_id,canal,wa_id) values($1,$2,$3,'whatsapp_oficial',$4)`,[c,empresa,l,String(Date.now())+Math.random().toString().slice(2,8)]);
   return {l,c,empresa,tel};};
  const chega=(x,texto,{tipo='texto',direcao='entrada',quando=null}={})=>db.query(
   `insert into mensagens(empresa_id,conversa_id,direcao,tipo,texto,criado_em) values($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()))`,[x.empresa,x.c,direcao,tipo,texto,quando]);
  const avisos=async(where='true',args=[])=>(await db.query(`select * from privado.crm_avisos where ${where} order by id`,args)).rows;
  const pendentes=async()=>(await db.query('select crm_avisos_pendentes() as r')).rows[0].r;

  // lead com responsável: só ele recebe, e mensagens seguidas viram um aviso só
  const ana=await lead('Ana Oliveira',vend);
  await db.exec('delete from privado.crm_avisos;delete from net.chamadas');
  await chega(ana,'Oi,   quero\nfazer um orçamento');
  let lista=await avisos('lead_id=$1',[ana.l]);
  assert.equal(lista.length,1);assert.equal(lista[0].user_id,vend);assert.equal(lista[0].tipo,'mensagem');
  assert.equal(lista[0].titulo,'Ana Oliveira');assert.equal(lista[0].corpo,'Oi, quero fazer um orçamento');
  assert.equal(lista[0].url,`https://crm.thenewads.com.br/?lead=${ana.l}&conversa=${ana.c}`);
  assert.equal((await db.query('select count(*)::int n from net.chamadas')).rows[0].n,1,'um empurrão para o servidor');
  await chega(ana,'para sábado');
  lista=await avisos('lead_id=$1',[ana.l]);
  assert.equal(lista.length,1);assert.equal(lista[0].quantidade,2);assert.equal(lista[0].corpo,'para sábado');

  // não avisa mensagem da equipe nem mensagem antiga (histórico)
  await chega(ana,'Claro!',{direcao:'saida'});
  await chega(ana,'mensagem de ontem',{quando:new Date(Date.now()-2*3600e3).toISOString()});
  assert.equal((await avisos('lead_id=$1',[ana.l])).length,1);

  // o servidor reserva o que leu: a segunda leitura não manda de novo
  let lidos=await pendentes();
  assert.equal(lidos.length,1);assert.equal(lidos[0].tag,`msg-${ana.l}`);assert.equal(lidos[0].quantidade,2);assert.equal(lidos[0].tipo,'mensagem');
  assert.deepEqual(await pendentes(),[],'aviso reservado não sai duas vezes');
  // mensagem depois da leitura vira aviso novo, não some dentro do que já foi
  await db.exec('delete from net.chamadas');
  await chega(ana,'alguém aí?');
  assert.equal((await avisos('lead_id=$1',[ana.l])).length,2);
  assert.equal((await db.query('select count(*)::int n from net.chamadas')).rows[0].n,1);
  // envio que falhou volta para a fila; envio que deu certo sai dela
  await db.query('select crm_aviso_concluido($1,0,$2)',[lidos[0].id,'falhou']);
  lidos=await pendentes();
  assert.equal(lidos.length,2,'o que falhou volta junto com o novo');
  for(const a of lidos)await db.query('select crm_aviso_concluido($1,1)',[a.id]);
  assert.deepEqual(await pendentes(),[]);
  // aviso esgotado (5 tentativas) não faz cada mensagem chamar o servidor à toa
  await db.query(`update privado.crm_avisos set enviado_em=null,tentativas=5`);
  await db.exec('delete from net.chamadas');
  await chega(ana,'Ok',{direcao:'saida'});
  assert.equal((await db.query('select count(*)::int n from net.chamadas')).rows[0].n,0,'sem aviso pendente não chama o servidor');
  await db.exec('delete from privado.crm_avisos');

  // lead sem responsável: avisa dono e gestor, não vendedor nem leitura
  const semDono=await lead('',null);
  await chega(semDono,null,{tipo:'imagem'});
  lista=await avisos('lead_id=$1',[semDono.l]);
  assert.deepEqual(lista.map(a=>a.user_id).sort(),[dono,gestor].sort());
  assert.equal(lista[0].corpo,'Foto');assert.equal(lista[0].titulo,semDono.tel,'sem nome usa o telefone');

  // responsável que saiu da empresa: cai para dono e gestor
  const exVend=id();await db.query(`insert into auth.users(id,email) values($1,'ex@example.test')`,[exVend]);
  await db.query(`insert into membros(empresa_id,user_id,papel) values($1,$2,'vendedor')`,[e,exVend]);
  const orfao=await lead('Bruno',exVend);
  await db.query('delete from membros where user_id=$1',[exVend]);
  assert.equal((await db.query('select responsavel_id from leads where id=$1',[orfao.l])).rows[0].responsavel_id,exVend,'lead continua no nome de quem saiu');
  await db.exec('delete from privado.crm_avisos');
  await chega(orfao,'olá');
  assert.deepEqual((await avisos()).map(a=>a.user_id).sort(),[dono,gestor].sort());

  // lead recém-atribuído: a primeira mensagem entra no aviso de atribuição, sem aviso duplicado
  await db.exec('delete from privado.crm_avisos');
  const novo=await lead('Carla',vend);
  assert.equal((await avisos()).length,1,'aviso de atribuição da 0025');
  await chega(novo,'vi o anúncio');
  lista=await avisos();
  assert.equal(lista.length,1);assert.equal(lista[0].tipo,'lead_atribuido');
  assert.equal(lista[0].corpo,'Carla: vi o anúncio');assert.match(lista[0].url,/&conversa=/);
  assert.equal((await pendentes())[0].tag,`lead-${novo.l}`);

  // empresa desativada não avisa
  await db.exec('delete from privado.crm_avisos');
  const parada=await lead('Dora',dono,inativa);
  await db.exec('delete from privado.crm_avisos');
  await chega(parada,'oi');
  assert.equal((await avisos()).length,0);

  await assert.rejects(db.query(`insert into privado.crm_avisos(user_id,empresa_id,tipo,titulo,corpo) values($1,$2,'outro','t','c')`,[vend,e]),/crm_avisos_tipo_check/);
 }finally{await db.close();}
});

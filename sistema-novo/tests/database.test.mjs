import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
test('migrações, isolamento CRM, integridade da conversa e leitura com limite',async()=>{
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
    alter default privileges in schema public grant all on tables to authenticated,service_role;
  `);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  // Teste legado apenas dentro de banco descartável; nunca executado em produção.
  const base=await db.exec(await readFile(new URL('../supabase/tests/isolamento.sql',import.meta.url),'utf8'));
  const result=base.at(-1).rows[0];assert.equal(result.ok,result.total,result.falhas);assert.equal(result.sobras,0);
  const a=crypto.randomUUID(),b=crypto.randomUUID(),user=crypto.randomUUID(),lead=crypto.randomUUID(),conv=crypto.randomUUID(),first=crypto.randomUUID(),later=crypto.randomUUID();
  await db.query(`insert into auth.users(id,email) values($1,'fixture@example.test')`,[user]);
  const quotas=await Promise.all(Array.from({length:35},()=>db.query(`select crm_limitar_acao($1,'envio') as ok`,[user])));
  assert.equal(quotas.filter(r=>r.rows[0].ok).length,30);
  assert.equal((await db.query(`select crm_limitar_acao($1,'equipe') as ok`,[user])).rows[0].ok,true);
  await assert.rejects(db.query(`select crm_limitar_acao($1,'acao_desconhecida')`,[user]),/limite_invalido/);
  await db.query(`insert into empresas(id,nome,slug) values($1,'A','a'),($2,'B','b')`,[a,b]);
  await db.query(`insert into membros(empresa_id,user_id,papel) values($1,$2,'vendedor')`,[a,user]);
  await db.query(`insert into leads(id,empresa_id,nome,responsavel_id) values($1,$2,'Fixture',$3)`,[lead,a,user]);
  await db.query(`insert into conversas(id,empresa_id,lead_id,canal,wa_id,nao_lidas) values($1,$2,$3,'whatsapp_oficial','5511999990000',2)`,[conv,a,lead]);
  await assert.rejects(db.query(`insert into mensagens(empresa_id,conversa_id,direcao) values($1,$2,'entrada')`,[b,conv]),/mensagens_conversa_empresa_fkey/);
  await db.query(`insert into mensagens(id,empresa_id,conversa_id,direcao,criado_em) values($1,$3,$4,'entrada','2026-01-01'),($2,$3,$4,'entrada','2026-01-02')`,[first,later,a,conv]);
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated'})]);
  await db.exec('set role authenticated');
  await assert.rejects(db.query(`select crm_limitar_acao($1,'envio')`,[user]),/permission denied/);
  assert.equal((await db.query('select count(*)::int n from mensagens')).rows[0].n,2);
  const search=(await db.query(`select buscar_conversas_crm($1) as result`,[a])).rows[0].result;
  assert.equal(search.total,1);assert.equal(search.items[0].id,conv);
  await db.query(`select marcar_conversa_lida_ate($1,$2)`,[conv,first]);
  assert.equal((await db.query('select nao_lidas from conversas')).rows[0].nao_lidas,1);
  await assert.rejects(db.query(`insert into mensagens(empresa_id,conversa_id,direcao) values($1,$2,'saida')`,[a,conv]),/permission denied/);
  await db.exec('reset role');
  for(let i=0;i<20;i++)assert.equal((await db.query(`select privado.consumir_limite_crm($1,'conversa') as ok`,[user])).rows[0].ok,true);
  await assert.rejects(db.query(`insert into conversas(empresa_id,lead_id,canal,wa_id) values($1,$2,'whatsapp_nao_oficial','fixture')`,[a,lead]),/limite_conversas/);
  await db.query(`insert into auth.mfa_factors(user_id,status) values($1,'verified')`,[user]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from mensagens')).rows[0].n,0);
  assert.equal((await db.query(`select buscar_conversas_crm($1) as result`,[a])).rows[0].result.total,0);
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated',aal:'aal2'})]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from mensagens')).rows[0].n,2);
  await db.exec('reset role');
  await db.query(`update membros set empresa_id=$1 where user_id=$2`,[b,user]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from mensagens')).rows[0].n,0);
  await assert.rejects(db.query('select marcar_conversa_lida_ate($1,$2)',[conv,first]),/sem_acesso/);
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims','',false)`);
  const receive=(id,text,date)=>db.query(`select * from receber_mensagem_whatsapp($1,'whatsapp_oficial','5511999990009',null,$2,'texto',$3,null,null,$4,'entrada')`,[a,id,text,date]);
  await receive('fixture-new','Mensagem recente','2026-09-20');
  await receive('fixture-old','Mensagem antiga','2026-09-19');
  await receive('fixture-old','Mensagem antiga','2026-09-19');
  const received=(await db.query(`select ultima_previa,nao_lidas from conversas where lead_id<>$1`,[lead])).rows[0];
  assert.equal(received.ultima_previa,'Mensagem recente');assert.equal(received.nao_lidas,2);
  const outgoing=crypto.randomUUID(),when=new Date().toISOString();
  await db.query(`insert into mensagens(id,empresa_id,conversa_id,direcao,status) values($1,$2,$3,'saida','enviando')`,[outgoing,a,conv]);
  await db.query(`select registrar_recibo_whatsapp($1,'whatsapp_oficial','future-id','lida',$2,null)`,[a,when]);
  await db.query(`update mensagens set wa_message_id='future-id',status='enviada' where id=$1`,[outgoing]);
  assert.equal((await db.query('select status from mensagens where id=$1',[outgoing])).rows[0].status,'lida');
  await db.query(`select registrar_recibo_whatsapp($1,'whatsapp_oficial','future-id','entregue',$2,null)`,[a,when]);
  await db.query(`select registrar_recibo_whatsapp($1,'whatsapp_oficial','future-id','falhou',$2,'{"codigo":123}')`,[a,when]);
  assert.equal((await db.query('select status from mensagens where id=$1',[outgoing])).rows[0].status,'lida');
  await db.query(`select registrar_recibo_whatsapp($1,'whatsapp_oficial','future-id','falhou',$2,null)`,[b,when]);
  assert.equal((await db.query('select status from mensagens where id=$1',[outgoing])).rows[0].status,'lida');
  // Reservas de formulário são decididas e consumidas na mesma transação.
  const form=crypto.randomUUID();await db.query(`insert into formularios(id,empresa_id,nome,chave) values($1,$2,'Fixture segurança','security-fixture')`,[form,a]);
  const reservations=await Promise.all(Array.from({length:12},()=>db.query('select crm_reservar_formulario($1,$2) ok',[form,'a'.repeat(64)])));
  assert.equal(reservations.filter(r=>r.rows[0].ok).length,6);
  for(let i=0;i<114;i++)assert.equal((await db.query('select crm_reservar_formulario($1,$2) ok',[form,i.toString(16).padStart(64,'0')])).rows[0].ok,true);
  assert.equal((await db.query('select crm_reservar_formulario($1,$2) ok',[form,'b'.repeat(64)])).rows[0].ok,false,'limite total independe do IP');
  await db.query('update empresas set ativo=false where id=$1',[a]);
  await assert.rejects(db.query(`select * from receber_lead_site('security-fixture','Fixture','+5511999955555',null,'{}','{}')`),/formulario_invalido/);
  await db.query('update empresas set ativo=true where id=$1',[a]);
  // Satura cotas em duas janelas adjacentes para o teste não oscilar na virada do minuto.
  await db.query(`insert into privado.crm_limites(ator,acao,minuto,quantidade)
    select $1,a,m,case a when 'presenca' then 60 else 120 end from unnest(array['presenca','gravacao','busca']) a
    cross join generate_series(date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '1 minute',interval '1 minute') m
    on conflict(ator,acao,minuto) do update set quantidade=excluded.quantidade`,[user]);
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated',aal:'aal2'})]);await db.exec('set role authenticated');
  await assert.rejects(db.query('select crm_reservar_formulario($1,$2)',[form,'c'.repeat(64)]),/permission denied/);
  for(const [sql,params]of [
    ['select crm_presenca($1,$2)',[b,crypto.randomUUID()]],
    ['select buscar_conversas_crm($1)',[b]],
    ['insert into leads(empresa_id,responsavel_id) values($1,$2)',[b,user]]
  ])await assert.rejects(db.query(sql,params),e=>e.code==='PT429');
  console.log(`Baseline ${result.ok}/${result.total}; isolamento, quotas, reserva atômica e RLS OK.`);
 }finally{await db.close();}
});

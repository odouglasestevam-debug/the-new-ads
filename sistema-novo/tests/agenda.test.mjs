// Mensagem agendada e lembrete (0033). Banco descartável com todas as migrations, dados fictícios.
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
   create schema cron;create table cron.tarefas(nome text,quando text,comando text);
   create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.tarefas values($1,$2,$3);select 1::bigint$$;
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

test('mensagem agendada: permissão, fila, falha avisada e cancelamento pela resposta do lead',async()=>{
 const db=await banco();
 try{
  const id=()=>crypto.randomUUID();
  const e=id(),dono=id(),gestor=id(),vend=id(),outro=id(),leitor=id();
  await db.query(`insert into auth.users(id,email) values($1,'dono@example.test'),($2,'gestor@example.test'),($3,'vend@example.test'),($4,'outro@example.test'),($5,'leitor@example.test')`,[dono,gestor,vend,outro,leitor]);
  await db.query(`insert into empresas(id,nome,slug) values($1,'Empresa','empresa')`,[e]);
  await db.query(`insert into membros(empresa_id,user_id,papel) values($1,$2,'dono'),($1,$3,'gestor'),($1,$4,'vendedor'),($1,$5,'vendedor'),($1,$6,'leitura')`,[e,dono,gestor,vend,outro,leitor]);
  const l=id(),c=id();
  await db.query(`insert into leads(id,empresa_id,nome,telefone,responsavel_id) values($1,$2,'Ana Oliveira','+5511999990001',$3)`,[l,e,vend]);
  await db.query(`insert into conversas(id,empresa_id,lead_id,canal,wa_id) values($1,$2,$3,'whatsapp_nao_oficial','5511999990001')`,[c,e,l]);

  const como=async(user,fn)=>{
   await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated'})]);
   await db.exec('set role authenticated');
   try{return await fn();}finally{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','',false)`);}
  };
  const agendar=(user,texto,{em="now() + interval '1 hour'",cancelar=false}={})=>como(user,async()=>(await db.query(
   `select * from crm_agendar_mensagem($1,$2,${em},$3)`,[c,texto,cancelar])).rows[0]);
  const linha=async ag=>(await db.query('select * from mensagens_agendadas where id=$1',[ag])).rows[0];
  const chamadas=async url=>(await db.query(`select count(*)::int n from net.chamadas where url like $1`,['%'+url])).rows[0].n;

  // quem responde o lead agenda; quem só lê ou não atende o lead, não
  const ag=await agendar(vend,'  Bom dia, Ana! Separei a proposta.  ');
  assert.equal(ag.texto,'Bom dia, Ana! Separei a proposta.');assert.equal(ag.status,'agendada');assert.equal(ag.autor_id,vend);
  await assert.rejects(agendar(leitor,'oi'),/sem_permissao/);
  await assert.rejects(agendar(outro,'oi'),/sem_permissao/);
  await assert.rejects(agendar(vend,'   '),/texto_invalido/);
  await assert.rejects(agendar(vend,'oi',{em:"now() - interval '1 hour'"}),/horario_invalido/);
  await assert.rejects(agendar(vend,'oi',{em:"now() + interval '200 days'"}),/horario_invalido/);
  // gravação direta pela API é bloqueada; leitura segue a visibilidade do lead
  await assert.rejects(como(vend,()=>db.query(`insert into mensagens_agendadas(empresa_id,conversa_id,lead_id,autor_id,texto,enviar_em) values($1,$2,$3,$4,'x',now())`,[e,c,l,vend])),/permission denied/);
  assert.equal(await como(vend,async()=>(await db.query('select count(*)::int n from mensagens_agendadas')).rows[0].n),1);
  assert.equal(await como(leitor,async()=>(await db.query('select count(*)::int n from mensagens_agendadas')).rows[0].n),1);
  assert.equal(await como(outro,async()=>(await db.query('select count(*)::int n from mensagens_agendadas')).rows[0].n),0);

  // editar troca texto e horário e passa a autoria para quem editou
  const editada=await como(gestor,async()=>(await db.query(`select * from crm_reagendar_mensagem($1,'Bom dia! Proposta anexa.',now() + interval '2 hours',true)`,[ag.id])).rows[0]);
  assert.equal(editada.texto,'Bom dia! Proposta anexa.');assert.equal(editada.autor_id,gestor);assert.equal(editada.cancelar_se_responder,true);
  await db.query(`update mensagens_agendadas set autor_id=$2,cancelar_se_responder=false where id=$1`,[ag.id,vend]);

  // relógio: nada vencido, nada chamado
  await db.exec('delete from net.chamadas');
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal(await chamadas('crm-agenda'),0,'sem mensagem vencida não chama o servidor');
  // venceu: chama a função de envio, que reserva e não entrega duas vezes
  await db.query(`update mensagens_agendadas set enviar_em=now()-interval '1 minute' where id=$1`,[ag.id]);
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal(await chamadas('crm-agenda'),1);
  let fila=(await db.query('select crm_agendadas_reservar() r')).rows[0].r;
  assert.equal(fila.length,1);assert.equal(fila[0].id,ag.id);assert.equal(fila[0].conversa_id,c);assert.equal(fila[0].autor_id,vend);
  assert.deepEqual((await db.query('select crm_agendadas_reservar() r')).rows[0].r,[],'reservada não sai duas vezes');
  assert.equal((await linha(ag.id)).status,'enviando');
  // falha passageira volta para a fila; falha de verdade avisa quem agendou
  await db.query(`select crm_agendada_concluida($1,false,'banco ocupado',true)`,[ag.id]);
  assert.equal((await linha(ag.id)).status,'agendada');
  fila=(await db.query('select crm_agendadas_reservar() r')).rows[0].r;assert.equal(fila.length,1);
  await db.exec('delete from privado.crm_avisos');
  await db.query(`select crm_agendada_concluida($1,false,'Passaram 24h desde a última mensagem do lead.')`,[ag.id]);
  assert.equal((await linha(ag.id)).status,'falhou');
  let avisos=(await db.query('select * from privado.crm_avisos')).rows;
  assert.equal(avisos.length,1);assert.equal(avisos[0].tipo,'agendamento');assert.equal(avisos[0].user_id,vend);
  assert.equal(avisos[0].corpo,'Ana Oliveira: Passaram 24h desde a última mensagem do lead.');
  assert.equal(avisos[0].url,`https://crm.thenewads.com.br/?lead=${l}&conversa=${c}`);
  assert.equal((await db.query('select crm_avisos_pendentes() r')).rows[0].r[0].tag,`agendamento-${avisos[0].id}`);
  // concluir de novo não muda nada (só sai de "enviando")
  await db.query(`select crm_agendada_concluida($1,true)`,[ag.id]);assert.equal((await linha(ag.id)).status,'falhou');

  // envio confirmado
  const ok=await agendar(vend,'Confirmado');
  await db.query(`update mensagens_agendadas set enviar_em=now() where id=$1`,[ok.id]);
  await db.query('select crm_agendadas_reservar()');await db.query(`select crm_agendada_concluida($1,true)`,[ok.id]);
  assert.equal((await linha(ok.id)).status,'enviada');assert.equal((await linha(ok.id)).erro,null);

  // atraso de mais de 6 horas não sai, e quem agendou fica sabendo
  await db.exec('delete from privado.crm_avisos');
  const velha=await agendar(vend,'Bom dia!');
  await db.query(`update mensagens_agendadas set enviar_em=now()-interval '7 hours' where id=$1`,[velha.id]);
  assert.deepEqual((await db.query('select crm_agendadas_reservar() r')).rows[0].r,[]);
  assert.equal((await linha(velha.id)).status,'falhou');assert.match((await linha(velha.id)).erro,/6 horas/);
  assert.equal((await db.query(`select count(*)::int n from privado.crm_avisos where tipo='agendamento'`)).rows[0].n,1);
  // presa em "enviando" depois de 3 tentativas: desiste sem reenviar
  const presa=await agendar(vend,'Presa');
  await db.query(`update mensagens_agendadas set status='enviando',tentativas=3,atualizado_em=now()-interval '10 minutes' where id=$1`,[presa.id]);
  await db.query('select crm_agendadas_reservar()');
  assert.equal((await linha(presa.id)).status,'falhou');assert.match((await linha(presa.id)).erro,/não foi confirmado/);
  // presa com tentativa sobrando volta com o mesmo id
  const solta=await agendar(vend,'Solta');
  await db.query(`update mensagens_agendadas set status='enviando',tentativas=1,atualizado_em=now()-interval '10 minutes' where id=$1`,[solta.id]);
  fila=(await db.query('select crm_agendadas_reservar() r')).rows[0].r;
  assert.deepEqual(fila.map(x=>x.id),[solta.id]);assert.equal((await linha(solta.id)).tentativas,2);

  // "não enviar se o lead responder antes"
  const seResponder=await agendar(vend,'Conseguiu ver a proposta?',{cancelar:true});
  const sempre=await agendar(vend,'Lembrete do horário',{cancelar:false});
  await db.query(`insert into mensagens(empresa_id,conversa_id,direcao,tipo,texto) values($1,$2,'saida','texto','resposta da equipe')`,[e,c]);
  assert.equal((await linha(seResponder.id)).status,'agendada','mensagem da equipe não cancela');
  await db.query(`insert into mensagens(empresa_id,conversa_id,direcao,tipo,texto) values($1,$2,'entrada','texto','vi sim!')`,[e,c]);
  assert.equal((await linha(seResponder.id)).status,'cancelada');assert.match((await linha(seResponder.id)).erro,/respondeu/);
  assert.equal((await linha(sempre.id)).status,'agendada');

  // cancelar: quem agendou ou quem responde o lead; quem só lê não
  await assert.rejects(como(leitor,()=>db.query('select crm_cancelar_mensagem_agendada($1)',[sempre.id])),/sem_permissao/);
  assert.equal(await como(vend,async()=>(await db.query('select crm_cancelar_mensagem_agendada($1) r',[sempre.id])).rows[0].r),true);
  assert.equal((await linha(sempre.id)).status,'cancelada');
  assert.equal(await como(vend,async()=>(await db.query('select crm_cancelar_mensagem_agendada($1) r',[sempre.id])).rows[0].r),false,'já cancelada');
  await assert.rejects(como(vend,()=>db.query(`select crm_reagendar_mensagem($1,'x',now()+interval '1 hour')`,[sempre.id])),/nao_agendada/);

  // limite por conversa
  await db.exec(`update mensagens_agendadas set status='cancelada'`);
  for(let i=0;i<20;i++)await agendar(vend,'Mensagem '+i);
  await assert.rejects(agendar(vend,'Uma a mais'),/limite_agendamentos/);

  // o relógio e a limpeza estão agendados
  const tarefas=(await db.query(`select nome from cron.tarefas`)).rows.map(r=>r.nome);
  assert.ok(tarefas.includes('crm-agenda'));assert.ok(tarefas.includes('crm-limpar-agenda'));
 }finally{await db.close();}
});

test('lembrete: quem recebe, notificação na hora, adiar, concluir e troca de responsável',async()=>{
 const db=await banco();
 try{
  const id=()=>crypto.randomUUID();
  const e=id(),inativa=id(),dono=id(),gestor=id(),vend=id(),outro=id(),leitor=id(),saiu=id();
  await db.query(`insert into auth.users(id,email) values($1,'dono@example.test'),($2,'gestor@example.test'),($3,'vend@example.test'),($4,'outro@example.test'),($5,'leitor@example.test'),($6,'saiu@example.test')`,[dono,gestor,vend,outro,leitor,saiu]);
  await db.query(`insert into empresas(id,nome,slug) values($1,'Empresa','empresa'),($2,'Parada','parada')`,[e,inativa]);
  await db.query(`insert into membros(empresa_id,user_id,papel) values($1,$2,'dono'),($1,$3,'gestor'),($1,$4,'vendedor'),($1,$5,'vendedor'),($1,$6,'leitura'),($1,$7,'vendedor'),($8,$2,'dono')`,[e,dono,gestor,vend,outro,leitor,saiu,inativa]);
  const l=id(),c=id(),l2=id();
  await db.query(`insert into leads(id,empresa_id,nome,telefone,responsavel_id) values($1,$2,'Bruno Costa','+5511999990002',$3),($4,$2,'','+5511999990003',$5)`,[l,e,vend,l2,saiu]);
  await db.query(`insert into conversas(id,empresa_id,lead_id,canal,wa_id) values($1,$2,$3,'whatsapp_oficial','5511999990002')`,[c,e,l]);

  const como=async(user,fn)=>{
   await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated'})]);
   await db.exec('set role authenticated');
   try{return await fn();}finally{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','',false)`);}
  };
  const criar=(user,{lead=l,nota='Ligar para apresentar a proposta',em="now() + interval '1 day'",para=null}={})=>como(user,async()=>(await db.query(
   `select * from crm_criar_lembrete($1,${em},$2,$3)`,[lead,nota,para])).rows[0]);
  const atualizar=(user,lembrete,acao,em=null,nota=null)=>como(user,async()=>(await db.query(
   `select * from crm_atualizar_lembrete($1,$2,${em||'null'},$3)`,[lembrete,acao,nota])).rows[0]);
  const linha=async x=>(await db.query('select * from lembretes where id=$1',[x])).rows[0];

  // o vendedor marca para si; quem só lê ou não atende o lead não marca
  const meu=await criar(vend);
  assert.equal(meu.user_id,vend);assert.equal(meu.criado_por,vend);assert.equal(meu.status,'pendente');
  await assert.rejects(criar(leitor),/sem_permissao/);
  await assert.rejects(criar(outro),/sem_permissao/);
  await assert.rejects(criar(vend,{nota:'  '}),/nota_invalida/);
  await assert.rejects(criar(vend,{em:"now() - interval '1 day'"}),/horario_invalido/);
  // vendedor não marca para outra pessoa; gestor marca para quem atende o lead, não para qualquer um
  await assert.rejects(criar(vend,{para:gestor}),/sem_permissao/);
  const doGestor=await criar(gestor,{para:vend,nota:'Retomar depois do orçamento'});
  assert.equal(doGestor.user_id,vend);assert.equal(doGestor.criado_por,gestor);
  await assert.rejects(criar(gestor,{para:outro}),/destino_invalido/);
  const paraDono=await criar(gestor,{para:dono});assert.equal(paraDono.user_id,dono);

  // cada um vê os seus; dono e gestor veem os da equipe
  const quantos=user=>como(user,async()=>(await db.query('select count(*)::int n from lembretes')).rows[0].n);
  assert.equal(await quantos(vend),2);assert.equal(await quantos(gestor),3);assert.equal(await quantos(outro),0);assert.equal(await quantos(leitor),0);
  await assert.rejects(como(vend,()=>db.query(`update lembretes set nota='x' where id=$1`,[meu.id])),/permission denied/);

  // na hora marcada vira notificação, com a conversa no link e etiqueta própria
  await db.exec('delete from privado.crm_avisos;delete from net.chamadas');
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal((await db.query(`select count(*)::int n from privado.crm_avisos`)).rows[0].n,0,'nada vencido');
  assert.equal((await db.query(`select count(*)::int n from net.chamadas`)).rows[0].n,0,'nada vencido não chama nada');
  await db.query(`update lembretes set quando=now()-interval '1 minute' where id=$1`,[meu.id]);
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal((await linha(meu.id)).status,'avisado');
  let avisos=(await db.query(`select * from privado.crm_avisos`)).rows;
  assert.equal(avisos.length,1);assert.equal(avisos[0].tipo,'lembrete');assert.equal(avisos[0].user_id,vend);
  assert.equal(avisos[0].titulo,'Lembrete: Bruno Costa');assert.equal(avisos[0].corpo,'Ligar para apresentar a proposta');
  assert.equal(avisos[0].url,`https://crm.thenewads.com.br/?lead=${l}&conversa=${c}`);
  assert.equal((await db.query(`select count(*)::int n from net.chamadas where url like '%crm-notificar'`)).rows[0].n,1,'notificação sai na hora');
  const pend=(await db.query('select crm_avisos_pendentes() r')).rows[0].r;
  assert.equal(pend[0].tipo,'lembrete');assert.equal(pend[0].tag,`lembrete-${avisos[0].id}`);
  // o relógio seguinte não repete
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal((await db.query(`select count(*)::int n from privado.crm_avisos`)).rows[0].n,1);

  // adiar volta para pendente com novo horário e nota; concluir encerra
  const adiado=await atualizar(vend,meu.id,'adiar',"now() + interval '2 hours'",'Ligar depois do almoço');
  assert.equal(adiado.status,'pendente');assert.equal(adiado.nota,'Ligar depois do almoço');assert.equal(adiado.avisado_em,null);
  assert.equal((await atualizar(vend,meu.id,'concluir')).status,'concluido');
  await assert.rejects(atualizar(vend,meu.id,'cancelar'),/lembrete_encerrado/);
  await assert.rejects(atualizar(outro,doGestor.id,'concluir'),/sem_permissao/);
  await assert.rejects(atualizar(vend,doGestor.id,'sumir'),/acao_invalida/);
  assert.equal((await atualizar(gestor,doGestor.id,'cancelar')).status,'cancelado');

  // lead muda de responsável: os lembretes de quem atendia vão junto
  const retorno=await criar(vend,{nota:'Mandar o contrato'});
  await db.query('update leads set responsavel_id=$2 where id=$1',[l,outro]);
  assert.equal((await linha(retorno.id)).user_id,outro);
  assert.equal((await linha(paraDono.id)).user_id,dono,'lembrete do dono fica com o dono');

  // quem saiu da empresa não recebe; empresa desativada também não
  await db.query(`insert into lembretes(empresa_id,lead_id,user_id,quando,nota) values($1,$2,$3,now()-interval '1 minute','Retomar')`,[e,l2,saiu]);
  await db.query('delete from membros where user_id=$1',[saiu]);
  await db.exec('delete from privado.crm_avisos');
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal((await db.query(`select count(*)::int n from privado.crm_avisos`)).rows[0].n,0);
  const l3=id();await db.query(`insert into leads(id,empresa_id,nome,telefone,responsavel_id) values($1,$2,'Dora','+5511999990004',$3)`,[l3,inativa,dono]);
  await db.query(`insert into lembretes(empresa_id,lead_id,user_id,quando,nota) values($1,$2,$3,now()-interval '1 minute','Retomar')`,[inativa,l3,dono]);
  await db.query('update empresas set ativo=false where id=$1',[inativa]);
  await db.exec('delete from privado.crm_avisos');
  await db.query('select privado.crm_rodar_agenda()');
  assert.equal((await db.query(`select count(*)::int n from privado.crm_avisos`)).rows[0].n,0);
 }finally{await db.close();}
});

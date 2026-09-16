-- Teste de isolamento entre empresas e papéis.
-- Rodar inteiro pelo execute_sql do conector supabase-app. Cria dados fictícios,
-- testa leitura e escrita como cada papel e apaga tudo no final.
-- Resultado esperado: ok = total, falhas = null, sobras = 0.

insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-00000000a001','t-agencia@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a002','t-dono-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a003','t-gestor-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a004','t-vend1-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a005','t-vend2-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000a006','t-leitura-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000b002','t-dono-b@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-00000000c001','t-semempresa@teste.local','authenticated','authenticated');
insert into public.agencia_admins values ('00000000-0000-0000-0000-00000000a001');
insert into public.empresas (id,nome,slug) values ('11111111-0000-0000-0000-00000000000a','Teste A','teste-a'),('11111111-0000-0000-0000-00000000000b','Teste B','teste-b');
insert into public.membros (empresa_id,user_id,papel) values
 ('11111111-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000a002','dono'),
 ('11111111-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000a003','gestor'),
 ('11111111-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000a004','vendedor'),
 ('11111111-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000a005','vendedor'),
 ('11111111-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000a006','leitura'),
 ('11111111-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000b002','dono');
insert into public.leads (id,empresa_id,nome,telefone,responsavel_id) values
 ('22222222-0000-0000-0000-000000000a01','11111111-0000-0000-0000-00000000000a','Lead A1','+5511999990001','00000000-0000-0000-0000-00000000a004'),
 ('22222222-0000-0000-0000-000000000a02','11111111-0000-0000-0000-00000000000a','Lead A2','+5511999990002','00000000-0000-0000-0000-00000000a005'),
 ('22222222-0000-0000-0000-000000000a03','11111111-0000-0000-0000-00000000000a','Lead A3',null,null),
 ('22222222-0000-0000-0000-000000000b01','11111111-0000-0000-0000-00000000000b','Lead B1','+5511999990001',null);
insert into public.lead_origens (empresa_id,lead_id,canal) values ('11111111-0000-0000-0000-00000000000a','22222222-0000-0000-0000-000000000a01','ctwa'),('11111111-0000-0000-0000-00000000000b','22222222-0000-0000-0000-000000000b01','site');
insert into public.integracoes (empresa_id,tipo) values ('11111111-0000-0000-0000-00000000000a','whatsapp_oficial'),('11111111-0000-0000-0000-00000000000b','whatsapp_oficial');

create temp table w (teste text, esperado text, resultado text);
grant all on w to authenticated;
create or replace function pg_temp.tenta(p_user text, p_sql text) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',p_user,'role','authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  get diagnostics n = row_count;
  reset role;
  raise exception 'ROLLBACK:%', n;
exception when others then
  reset role;
  if sqlerrm like 'ROLLBACK:%' then return 'afetou ' || split_part(sqlerrm, ':', 2); end if;
  return 'bloqueado';
end $f$;
create or replace function pg_temp.conta(p_user text, p_sql text) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',p_user,'role','authenticated')::text, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return 'vê ' || n;
exception when others then reset role; return 'bloqueado';
end $f$;
insert into w values
 ('agência vê leads', 'vê 4', pg_temp.conta('00000000-0000-0000-0000-00000000a001','select count(*) from public.leads')),
 ('dono A vê leads', 'vê 3', pg_temp.conta('00000000-0000-0000-0000-00000000a002','select count(*) from public.leads')),
 ('gestor A vê leads', 'vê 3', pg_temp.conta('00000000-0000-0000-0000-00000000a003','select count(*) from public.leads')),
 ('vendedor 1 vê leads', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-00000000a004','select count(*) from public.leads')),
 ('leitura A vê leads', 'vê 3', pg_temp.conta('00000000-0000-0000-0000-00000000a006','select count(*) from public.leads')),
 ('dono B vê leads', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-00000000b002','select count(*) from public.leads')),
 ('sem empresa vê leads', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-00000000c001','select count(*) from public.leads')),
 ('vendedor 2 vê origens', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-00000000a005','select count(*) from public.lead_origens')),
 ('gestor vê integrações', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-00000000a003','select count(*) from public.integracoes')),
 ('usuário chama função privada', 'bloqueado', pg_temp.conta('00000000-0000-0000-0000-00000000a003','select count(*) from public.eh_agencia()')),
 ('leitura altera lead', 'afetou 0', pg_temp.tenta('00000000-0000-0000-0000-00000000a006', $$update public.leads set nome='x'$$)),
 ('vendedor 1 altera lead do vendedor 2', 'afetou 0', pg_temp.tenta('00000000-0000-0000-0000-00000000a004', $$update public.leads set nome='x' where id='22222222-0000-0000-0000-000000000a02'$$)),
 ('vendedor 1 altera lead dele', 'afetou 1', pg_temp.tenta('00000000-0000-0000-0000-00000000a004', $$update public.leads set etapa='contato' where id='22222222-0000-0000-0000-000000000a01'$$)),
 ('vendedor 1 passa lead pro vendedor 2', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a004', $$update public.leads set responsavel_id='00000000-0000-0000-0000-00000000a005' where id='22222222-0000-0000-0000-000000000a01'$$)),
 ('gestor redistribui lead', 'afetou 1', pg_temp.tenta('00000000-0000-0000-0000-00000000a003', $$update public.leads set responsavel_id='00000000-0000-0000-0000-00000000a005' where id='22222222-0000-0000-0000-000000000a01'$$)),
 ('gestor põe responsável de outra empresa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a003', $$update public.leads set responsavel_id='00000000-0000-0000-0000-00000000b002' where id='22222222-0000-0000-0000-000000000a01'$$)),
 ('dono A cria lead na empresa B', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$insert into public.leads (empresa_id,nome) values ('11111111-0000-0000-0000-00000000000b','x')$$)),
 ('dono A altera lead da B', 'afetou 0', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$update public.leads set nome='x' where id='22222222-0000-0000-0000-000000000b01'$$)),
 ('dono A move lead para B', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$update public.leads set empresa_id='11111111-0000-0000-0000-00000000000b' where id='22222222-0000-0000-0000-000000000a03'$$)),
 ('dono A entra como dono da B', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$insert into public.membros values ('11111111-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000a002','dono')$$)),
 ('gestor se promove a dono', 'afetou 0', pg_temp.tenta('00000000-0000-0000-0000-00000000a003', $$update public.membros set papel='dono' where user_id='00000000-0000-0000-0000-00000000a003'$$)),
 ('dono grava segredo_id', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$update public.integracoes set segredo_id=gen_random_uuid()$$)),
 ('dono A altera integração da B', 'afetou 0', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$update public.integracoes set status='ativa' where empresa_id='11111111-0000-0000-0000-00000000000b'$$)),
 ('dono A vira agência', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$insert into public.agencia_admins values ('00000000-0000-0000-0000-00000000a002')$$)),
 ('vendedor forja origem ctwa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a004', $$insert into public.lead_origens (empresa_id,lead_id,canal) values ('11111111-0000-0000-0000-00000000000a','22222222-0000-0000-0000-000000000a01','ctwa')$$)),
 ('dono apaga log de etapas', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$delete from public.lead_etapas_log$$)),
 ('sem empresa cria empresa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000c001', $$insert into public.empresas (nome,slug) values ('x','x')$$)),
 ('leitura cria nota', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a006', $$insert into public.lead_notas (empresa_id,lead_id,texto) values ('11111111-0000-0000-0000-00000000000a','22222222-0000-0000-0000-000000000a01','oi')$$)),
 ('vendedor 2 cria nota no lead dele', 'afetou 1', pg_temp.tenta('00000000-0000-0000-0000-00000000a005', $$insert into public.lead_notas (empresa_id,lead_id,texto) values ('11111111-0000-0000-0000-00000000000a','22222222-0000-0000-0000-000000000a02','oi')$$)),
 ('agência cria empresa', 'afetou 1', pg_temp.tenta('00000000-0000-0000-0000-00000000a001', $$insert into public.empresas (nome,slug) values ('x','x-teste')$$)),
 ('telefone duplicado na mesma empresa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-00000000a002', $$insert into public.leads (empresa_id,telefone) values ('11111111-0000-0000-0000-00000000000a','+5511999990002')$$));

delete from public.empresas where id in ('11111111-0000-0000-0000-00000000000a','11111111-0000-0000-0000-00000000000b');
delete from auth.users where email like 't-%@teste.local';

select count(*) filter (where resultado = esperado) ok, count(*) total,
  string_agg(case when resultado <> esperado then teste||': '||resultado end, ' | ') falhas,
  (select count(*) from public.empresas) + (select count(*) from auth.users) sobras
from w;

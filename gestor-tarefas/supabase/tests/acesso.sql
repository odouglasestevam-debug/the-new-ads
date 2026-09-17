-- Teste do gestor de tarefas: acesso, atraso e recorrência.
-- Rodar inteiro pelo execute_sql do conector supabase-app. Cria dados fictícios e apaga no final.
-- Resultado esperado: ok = total, falhas = null, sobras = 0.

insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-0000000f0001','t-tf-admin@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000f0002','t-tf-membro@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000f0003','t-tf-inativo@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000f0004','t-tf-crm@teste.local','authenticated','authenticated');
insert into tarefas.usuarios (user_id, nome, email, admin, ativo) values
 ('00000000-0000-0000-0000-0000000f0001','Admin','t-tf-admin@teste.local',true,true),
 ('00000000-0000-0000-0000-0000000f0002','Membro','t-tf-membro@teste.local',false,true),
 ('00000000-0000-0000-0000-0000000f0003','Inativo','t-tf-inativo@teste.local',false,false);
insert into tarefas.projetos (id, nome) values ('33333333-0000-0000-0000-00000000000f','Teste TF');
insert into tarefas.pastas (id, projeto_id, nome) values ('33333333-0000-0000-0000-0000000000a1','33333333-0000-0000-0000-00000000000f','Pasta');
insert into tarefas.pastas (id, projeto_id, pasta_pai_id, nome) values ('33333333-0000-0000-0000-0000000000a2','33333333-0000-0000-0000-00000000000f','33333333-0000-0000-0000-0000000000a1','Subpasta');
insert into tarefas.listas (id, projeto_id, pasta_id, nome) values ('33333333-0000-0000-0000-0000000000b1','33333333-0000-0000-0000-00000000000f','33333333-0000-0000-0000-0000000000a2','Lista');
insert into tarefas.tarefas (id, lista_id, titulo, status_id, data_entrega, recorrencia) values
 ('33333333-0000-0000-0000-0000000000c1','33333333-0000-0000-0000-0000000000b1','Atrasada 3 dias',(select id from tarefas.status where nome='A fazer'),privado.tarefas_hoje()-3,'semanal'),
 ('33333333-0000-0000-0000-0000000000c2','33333333-0000-0000-0000-0000000000b1','Vence hoje',(select id from tarefas.status where nome='A fazer'),privado.tarefas_hoje(),null),
 ('33333333-0000-0000-0000-0000000000c3','33333333-0000-0000-0000-0000000000b1','A vencer',(select id from tarefas.status where nome='A fazer'),privado.tarefas_hoje()+5,null);
insert into tarefas.tarefa_responsaveis values ('33333333-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000f0002');

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
  return n::text;
exception when others then
  reset role;
  return 'erro';
end;
$f$;
create or replace function pg_temp.conta(p_user text, p_sql text) returns text language plpgsql as $f$
declare n text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',p_user,'role','authenticated')::text, true);
  set local role authenticated;
  execute 'select count(*)::text from (' || p_sql || ') x' into n;
  reset role;
  return n;
exception when others then
  reset role;
  return 'erro';
end;
$f$;

-- quem enxerga
insert into w select 'membro vê tarefas', '3', pg_temp.conta('00000000-0000-0000-0000-0000000f0002', 'select 1 from tarefas.tarefas_visao where projeto_id=''33333333-0000-0000-0000-00000000000f''');
insert into w select 'usuário do CRM não vê tarefas', '0', pg_temp.conta('00000000-0000-0000-0000-0000000f0004', 'select 1 from tarefas.tarefas_visao');
insert into w select 'usuário do CRM não vê projetos', '0', pg_temp.conta('00000000-0000-0000-0000-0000000f0004', 'select 1 from tarefas.projetos');
insert into w select 'usuário do CRM não vê usuários', '0', pg_temp.conta('00000000-0000-0000-0000-0000000f0004', 'select 1 from tarefas.usuarios');
insert into w select 'inativo não vê tarefas', '0', pg_temp.conta('00000000-0000-0000-0000-0000000f0003', 'select 1 from tarefas.tarefas');
insert into w select 'usuário do CRM não cria projeto', 'erro', pg_temp.tenta('00000000-0000-0000-0000-0000000f0004', 'insert into tarefas.projetos (nome) values (''x'')');
insert into w select 'usuário do CRM não apaga tarefa', '0', pg_temp.tenta('00000000-0000-0000-0000-0000000f0004', 'delete from tarefas.tarefas where lista_id=''33333333-0000-0000-0000-0000000000b1''');
insert into w select 'membro cria tarefa', '1', pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'insert into tarefas.tarefas (lista_id,titulo,status_id) values (''33333333-0000-0000-0000-0000000000b1'',''Nova'',(select id from tarefas.status where nome=''A fazer''))');
insert into w select 'membro não vira admin', '0', pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'update tarefas.usuarios set admin=true where user_id=''00000000-0000-0000-0000-0000000f0002''');
insert into w select 'membro não cria status', 'erro', pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'insert into tarefas.status (nome) values (''Novo st'')');
insert into w select 'membro não muda e-mail de usuário', 'erro', pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'update tarefas.usuarios set email=''x'' where user_id=''00000000-0000-0000-0000-0000000f0002''');
insert into w select 'admin muda nome de usuário', '1', pg_temp.tenta('00000000-0000-0000-0000-0000000f0001', 'update tarefas.usuarios set nome=''Membro 2'' where user_id=''00000000-0000-0000-0000-0000000f0002''');
insert into w select 'ninguém lê lembretes enviados', 'erro', pg_temp.conta('00000000-0000-0000-0000-0000000f0001', 'select 1 from tarefas.lembretes_enviados');
insert into w select 'usuário não lê segredo', 'false', has_function_privilege('authenticated','public.tarefas_ler_segredo(text)','execute')::text;
insert into w select 'membro comenta como ele', '1', pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'insert into tarefas.comentarios (tarefa_id,texto) values (''33333333-0000-0000-0000-0000000000c1'',''oi'')');
insert into w select 'membro não comenta como outro', 'erro', pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'insert into tarefas.comentarios (tarefa_id,texto,autor_id) values (''33333333-0000-0000-0000-0000000000c1'',''oi'',''00000000-0000-0000-0000-0000000f0001'')');

-- atraso e situação
insert into w select 'atrasada tem 3 dias', '3', (select dias_atraso::text from tarefas.tarefas_visao where id='33333333-0000-0000-0000-0000000000c1');
insert into w select 'situação atrasada', 'atrasada', (select situacao from tarefas.tarefas_visao where id='33333333-0000-0000-0000-0000000000c1');
insert into w select 'situação vence hoje', 'vence_hoje', (select situacao from tarefas.tarefas_visao where id='33333333-0000-0000-0000-0000000000c2');
insert into w select 'situação a vencer em 5', 'a_vencer:5', (select situacao||':'||dias_para_vencer from tarefas.tarefas_visao where id='33333333-0000-0000-0000-0000000000c3');
insert into w select 'lista herda projeto da subpasta', '33333333-0000-0000-0000-00000000000f', (select projeto_id::text from tarefas.listas where id='33333333-0000-0000-0000-0000000000b1');
insert into w select 'pasta não entra nela mesma', 'erro', pg_temp.tenta('00000000-0000-0000-0000-0000000f0001', 'update tarefas.pastas set pasta_pai_id=''33333333-0000-0000-0000-0000000000a2'' where id=''33333333-0000-0000-0000-0000000000a1''');

-- concluir a recorrente gera a próxima uma semana depois, com o mesmo responsável
select pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'update tarefas.tarefas set status_id=(select id from tarefas.status where nome=''Concluído'') where id=''33333333-0000-0000-0000-0000000000c1''');
insert into w select 'concluída guarda atraso de 3', 'concluida:3', (select situacao||':'||dias_atraso from tarefas.tarefas_visao where id='33333333-0000-0000-0000-0000000000c1');
insert into w select 'próxima criada +7 dias', (privado.tarefas_hoje()+4)::text, (select n.data_entrega::text from tarefas.tarefas t join tarefas.tarefas n on n.id=t.proxima_id where t.id='33333333-0000-0000-0000-0000000000c1');
insert into w select 'próxima aberta', 'aberto', (select v.status_tipo::text from tarefas.tarefas t join tarefas.tarefas_visao v on v.id=t.proxima_id where t.id='33333333-0000-0000-0000-0000000000c1');
insert into w select 'próxima com responsável', '1', (select count(*)::text from tarefas.tarefas t join tarefas.tarefa_responsaveis r on r.tarefa_id=t.proxima_id where t.id='33333333-0000-0000-0000-0000000000c1');
select pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'update tarefas.tarefas set status_id=(select id from tarefas.status where nome=''A fazer'') where id=''33333333-0000-0000-0000-0000000000c1''');
insert into w select 'reabrir limpa conclusão', 'null', coalesce((select concluida_em::text from tarefas.tarefas where id='33333333-0000-0000-0000-0000000000c1'),'null');
select pg_temp.tenta('00000000-0000-0000-0000-0000000f0002', 'update tarefas.tarefas set status_id=(select id from tarefas.status where nome=''Concluído'') where id=''33333333-0000-0000-0000-0000000000c1''');
insert into w select 'reabrir e concluir não duplica', '5', (select count(*)::text from tarefas.tarefas where lista_id='33333333-0000-0000-0000-0000000000b1');

create temp table res as
select count(*) filter (where esperado = resultado) as ok, count(*) as total,
  string_agg(case when esperado is distinct from resultado then teste || ' (esperado ' || esperado || ', veio ' || coalesce(resultado,'null') || ')' end, '; ') as falhas
from w;

delete from tarefas.projetos where id = '33333333-0000-0000-0000-00000000000f';
delete from auth.users where email like 't-tf-%@teste.local';

select res.*,
  (select count(*) from tarefas.projetos where id = '33333333-0000-0000-0000-00000000000f')
  + (select count(*) from tarefas.usuarios where email like 't-tf-%') as sobras
from res;

-- Teste de isolamento do WhatsApp: conversas, mensagens, funções chamáveis pelo navegador,
-- mídia, sessão com 2FA e empresa desativada. Complementa isolamento.sql (leads, equipe, formulários).
-- Rodar inteiro pelo execute_sql do conector supabase-app. Cria dados fictícios e apaga no final.
-- Resultado esperado: ok = total, falhas = null, sobras = 0. Não mexe nos dados reais.

insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-0000000d0a02','t-c-dono-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000d0a04','t-c-vend1-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000d0a05','t-c-vend2-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000d0a06','t-c-leitura-a@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000d0b02','t-c-dono-b@teste.local','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000d0c01','t-c-semempresa@teste.local','authenticated','authenticated');
insert into public.empresas (id,nome,slug) values
 ('33333333-0000-0000-0000-00000000000a','Teste Conversa A','teste-conv-a'),
 ('33333333-0000-0000-0000-00000000000b','Teste Conversa B','teste-conv-b');
insert into public.membros (empresa_id,user_id,papel) values
 ('33333333-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000d0a02','dono'),
 ('33333333-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000d0a04','vendedor'),
 ('33333333-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000d0a05','vendedor'),
 ('33333333-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000d0a06','leitura'),
 ('33333333-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000d0b02','dono');
insert into public.leads (id,empresa_id,nome,telefone,responsavel_id) values
 ('44444444-0000-0000-0000-000000000a01','33333333-0000-0000-0000-00000000000a','Conv A1','+5511988880101','00000000-0000-0000-0000-0000000d0a04'),
 ('44444444-0000-0000-0000-000000000a02','33333333-0000-0000-0000-00000000000a','Conv A2','+5511988880102','00000000-0000-0000-0000-0000000d0a05'),
 ('44444444-0000-0000-0000-000000000b01','33333333-0000-0000-0000-00000000000b','Conv B1','+5511988880101',null);
insert into public.integracoes (empresa_id,tipo,status,config) values
 ('33333333-0000-0000-0000-00000000000a','whatsapp_nao_oficial','ativa','{"numero_exibido":"+55 11 0000-0001","instance_id":"teste-conv-a"}'),
 ('33333333-0000-0000-0000-00000000000b','whatsapp_oficial','ativa','{"numero_exibido":"+55 11 0000-0002","phone_number_id":"99990000111122"}');
insert into public.conversas (id,empresa_id,lead_id,canal,wa_id,nao_lidas,ultima_entrada_em) values
 ('55555555-0000-0000-0000-000000000a01','33333333-0000-0000-0000-00000000000a','44444444-0000-0000-0000-000000000a01','whatsapp_nao_oficial','5511988880101',1,now()),
 ('55555555-0000-0000-0000-000000000a02','33333333-0000-0000-0000-00000000000a','44444444-0000-0000-0000-000000000a02','whatsapp_nao_oficial','5511988880102',1,now()),
 ('55555555-0000-0000-0000-000000000b01','33333333-0000-0000-0000-00000000000b','44444444-0000-0000-0000-000000000b01','whatsapp_oficial','5511988880101',3,now());
insert into public.mensagens (id,empresa_id,conversa_id,direcao,texto) values
 ('66666666-0000-0000-0000-000000000a01','33333333-0000-0000-0000-00000000000a','55555555-0000-0000-0000-000000000a01','entrada','oi do lead do vendedor um'),
 ('66666666-0000-0000-0000-000000000a02','33333333-0000-0000-0000-00000000000a','55555555-0000-0000-0000-000000000a02','entrada','segredo do lead do vendedor dois'),
 ('66666666-0000-0000-0000-000000000b01','33333333-0000-0000-0000-00000000000b','55555555-0000-0000-0000-000000000b01','entrada','mensagem da empresa B');

create temp table w (teste text, esperado text, resultado text);
grant all on w to authenticated;
create or replace function pg_temp.tenta(p_user text, p_sql text, p_aal text default null) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub',p_user,'role','authenticated')
    || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal',p_aal) end)::text, true);
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
create or replace function pg_temp.conta(p_user text, p_sql text, p_aal text default null) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub',p_user,'role','authenticated')
    || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal',p_aal) end)::text, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return 'vê ' || coalesce(n, 0);
exception when others then reset role; return 'bloqueado';
end $f$;

-- executa de verdade como o usuário, sem desfazer (para conferir o efeito depois)
create or replace function pg_temp.executa(p_user text, p_sql text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',p_user,'role','authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; exception when others then null; end;
  reset role;
end $f$;

insert into w values
 -- quem enxerga o quê
 ('dono A vê conversas', 'vê 2', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select count(*) from public.conversas where empresa_id in (''33333333-0000-0000-0000-00000000000a'',''33333333-0000-0000-0000-00000000000b'')')),
 ('dono B vê conversas', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-0000000d0b02','select count(*) from public.conversas where empresa_id in (''33333333-0000-0000-0000-00000000000a'',''33333333-0000-0000-0000-00000000000b'')')),
 ('vendedor 1 vê conversas', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-0000000d0a04','select count(*) from public.conversas')),
 ('vendedor 1 vê mensagens', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-0000000d0a04','select count(*) from public.mensagens')),
 ('vendedor 1 lê mensagem do vendedor 2', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a04','select count(*) from public.mensagens where id=''66666666-0000-0000-0000-000000000a02''')),
 ('leitura A vê conversas', 'vê 2', pg_temp.conta('00000000-0000-0000-0000-0000000d0a06','select count(*) from public.conversas')),
 ('sem empresa vê mensagens', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0c01','select count(*) from public.mensagens')),
 -- navegador só lê
 ('dono A insere mensagem', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$insert into public.mensagens (empresa_id,conversa_id,direcao,texto) values ('33333333-0000-0000-0000-00000000000a','55555555-0000-0000-0000-000000000a01','saida','forjada')$$)),
 ('dono A altera conversa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$update public.conversas set nao_lidas=0$$)),
 ('dono A apaga mensagem', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$delete from public.mensagens$$)),
 ('dono A cria conversa direto', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$insert into public.conversas (empresa_id,lead_id,canal,wa_id) values ('33333333-0000-0000-0000-00000000000a','44444444-0000-0000-0000-000000000a01','whatsapp_oficial','1')$$)),
 -- funções chamáveis pelo navegador
 ('dono A lista números da B', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select count(*) from public.canais_whatsapp(''33333333-0000-0000-0000-00000000000b'')')),
 ('vendedor 1 lista números da A', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-0000000d0a04','select count(*) from public.canais_whatsapp(''33333333-0000-0000-0000-00000000000a'')')),
 ('dono A abre conversa na B', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000b','5511977770001')$$)),
 ('leitura abre conversa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a06', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000a','5511977770001')$$)),
 ('vendedor 1 abre conversa com lead do vendedor 2', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a04', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000a','5511988880102')$$)),
 ('vendedor 1 abre com lead do vendedor 2 sem o 9', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a04', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000a','551188880102')$$)),
 ('vendedor 1 abre conversa nova', 'afetou 1', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a04', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000a','5511977770001','Novo')$$)),
 ('vendedor 1 abre no canal que a empresa não tem', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a04', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000a','5511977770002',null,'whatsapp_oficial')$$)),
 ('dono A busca conversas da B', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select (public.buscar_conversas_crm(''33333333-0000-0000-0000-00000000000b'')->>''total'')::int')),
 ('vendedor 1 busca conversas da A', 'vê 1', pg_temp.conta('00000000-0000-0000-0000-0000000d0a04','select (public.buscar_conversas_crm(''33333333-0000-0000-0000-00000000000a'')->>''total'')::int')),
 ('vendedor 1 busca texto do vendedor 2', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a04','select (public.buscar_conversas_crm(''33333333-0000-0000-0000-00000000000a'',''segredo'')->>''total'')::int')),
 -- funções só do servidor
 ('dono A lê segredos', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$select public.integracao_ler_segredos(id) from public.integracoes$$)),
 ('dono A forja mensagem recebida', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$select * from public.receber_mensagem_whatsapp('33333333-0000-0000-0000-00000000000a','whatsapp_oficial','5511900000000','x',null,'texto','x',null,null,now(),'entrada')$$)),
 ('dono A forja recibo', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$select public.registrar_recibo_whatsapp('33333333-0000-0000-0000-00000000000a','whatsapp_oficial','x','lida',now(),null)$$)),
 ('dono A mexe no limite', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$select public.crm_limitar_acao('00000000-0000-0000-0000-0000000d0a02','envio')$$)),
 ('dono A lista mídias', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select count(*) from storage.objects where bucket_id=''crm-midias''')),
 ('dono A grava mídia', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$insert into storage.objects (bucket_id,name) values ('crm-midias','x/forjada.jpg')$$));

-- mídia: bucket privado e sem nenhuma regra que libere o navegador (a Edge Function assina o link)
insert into w select 'bucket crm-midias é privado', 'vê 1', 'vê ' || count(*) from storage.buckets where id = 'crm-midias' and not public;
insert into w select 'nenhuma regra do navegador cita crm-midias', 'vê 0', 'vê ' || count(*) from pg_policies
  where schemaname = 'storage' and (coalesce(qual,'') || coalesce(with_check,'')) like '%crm-midias%';

-- marcar lida em conversa alheia, executando de verdade: não pode zerar nada
select pg_temp.executa('00000000-0000-0000-0000-0000000d0a02', $$select public.marcar_conversa_lida('55555555-0000-0000-0000-000000000b01')$$);
select pg_temp.executa('00000000-0000-0000-0000-0000000d0a02', $$select public.marcar_conversa_lida_ate('55555555-0000-0000-0000-000000000b01','66666666-0000-0000-0000-000000000b01')$$);
insert into w select 'conversa da B continua com 3 não lidas', 'vê 3', 'vê ' || nao_lidas from public.conversas where id = '55555555-0000-0000-0000-000000000b01';

-- 2FA: quem cadastrou fator e entrou sem o código não enxerga nada
insert into auth.mfa_factors (id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values (gen_random_uuid(),'00000000-0000-0000-0000-0000000d0a02','teste','totp','verified',now(),now());
insert into w values
 ('dono A com 2FA, sessão sem código, vê conversas', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select count(*) from public.conversas','aal1')),
 ('dono A com 2FA, sessão sem código, vê leads', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select count(*) from public.leads','aal1')),
 ('dono A com 2FA, sessão com código, vê conversas', 'vê 2', pg_temp.conta('00000000-0000-0000-0000-0000000d0a02','select count(*) from public.conversas','aal2')),
 ('dono A com 2FA, sem código, abre conversa', 'bloqueado', pg_temp.tenta('00000000-0000-0000-0000-0000000d0a02', $$select * from public.abrir_conversa_whatsapp('33333333-0000-0000-0000-00000000000a','5511977770003')$$, 'aal1'));

-- empresa desativada some para quem é de dentro
update public.empresas set ativo = false where id = '33333333-0000-0000-0000-00000000000b';
insert into w values
 ('empresa B desativada, dono B vê conversas', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0b02','select count(*) from public.conversas')),
 ('empresa B desativada, dono B vê leads', 'vê 0', pg_temp.conta('00000000-0000-0000-0000-0000000d0b02','select count(*) from public.leads'));

delete from public.empresas where id in ('33333333-0000-0000-0000-00000000000a','33333333-0000-0000-0000-00000000000b');
delete from auth.users where email like 't-c-%@teste.local';

select count(*) filter (where resultado = esperado) ok, count(*) total,
  string_agg(case when resultado <> esperado then teste||': '||resultado end, ' | ') falhas,
  (select count(*) from public.empresas where slug like 'teste-conv-%')
  + (select count(*) from auth.users where email like 't-c-%@teste.local') sobras
from w;

-- Estado do banco antes de aplicar tarefas_0004 e tarefas_0005 (capturado em 18/09/2026, antes da aplicação).
-- Só usar em emergência: volta as regras antigas (todo usuário ativo vê tudo). Não apaga dado de tarefa.
-- As tabelas de permissão da 0005 são removidas, então as restrições configuradas depois se perdem.
begin;

-- 1. Desfaz a 0005
drop policy if exists projetos_ler on tarefas.projetos;
drop policy if exists pastas_ler on tarefas.pastas;
drop policy if exists listas_ler on tarefas.listas;
drop policy if exists projetos_admin on tarefas.projetos;
drop policy if exists pastas_admin on tarefas.pastas;
drop policy if exists listas_admin on tarefas.listas;
drop policy if exists tarefas_acesso on tarefas.tarefas;
drop policy if exists responsaveis_acesso on tarefas.tarefa_responsaveis;
drop policy if exists comentarios_ler on tarefas.comentarios;
drop policy if exists comentarios_criar on tarefas.comentarios;
drop policy if exists comentarios_apagar on tarefas.comentarios;
drop function if exists public.tarefas_cadastrar_membro(uuid,text,text,boolean,boolean,uuid[],uuid[],uuid[]);
drop function if exists public.tarefas_configurar_membro(uuid,text,boolean,boolean,boolean,uuid[],uuid[],uuid[]);
drop function if exists public.tarefas_acessos_membro(uuid);
drop function if exists privado.tarefas_definir_acessos(uuid,boolean,uuid[],uuid[],uuid[]);
drop function if exists privado.tarefas_acessa(text,uuid);
drop function if exists privado.tarefas_pode(uuid,text,uuid);
drop table if exists tarefas.acesso_espacos, tarefas.bloqueio_pastas, tarefas.bloqueio_listas;
drop view if exists public.tarefas_usuarios;
alter table tarefas.usuarios drop column if exists acesso_total;
create view public.tarefas_usuarios with (security_invoker = true) as
  select user_id, nome, email, admin, ativo, criado_em from tarefas.usuarios;
revoke all on public.tarefas_usuarios from anon, public;
grant select on public.tarefas_usuarios to authenticated;
grant update (nome, admin, ativo) on public.tarefas_usuarios to authenticated;

-- 2. Desfaz a 0004
drop trigger if exists trg_push_validar on tarefas.push_inscricoes;
drop trigger if exists trg_tarefas_hierarquia on tarefas.tarefas;
drop trigger if exists trg_tarefas_propagar_lista on tarefas.tarefas;
drop trigger if exists trg_status_proteger_tipo on tarefas.status;
drop function if exists privado.tarefas_validar_push();
drop function if exists privado.tarefas_validar_hierarquia();
drop function if exists privado.tarefas_propagar_lista();
drop function if exists privado.tarefas_proteger_tipo_status();
drop policy if exists push_proprio on tarefas.push_inscricoes;

-- 3. Funções e políticas originais
CREATE OR REPLACE FUNCTION public.tarefas_adicionar_usuario(p_user uuid, p_nome text, p_email text, p_admin boolean)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  insert into tarefas.usuarios (user_id, nome, email, admin, ativo)
  values (p_user, trim(p_nome), lower(trim(p_email)), p_admin, true)
  on conflict (user_id) do update set nome = excluded.nome, admin = excluded.admin, ativo = true;
$function$;

CREATE OR REPLACE FUNCTION privado.tarefas_usuario()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select exists (select 1 from tarefas.usuarios where user_id = (select auth.uid()) and ativo);
$function$;

CREATE OR REPLACE FUNCTION privado.tarefas_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select exists (select 1 from tarefas.usuarios where user_id = (select auth.uid()) and ativo and admin);
$function$;
drop function if exists privado.tarefas_mfa_ok();

CREATE OR REPLACE FUNCTION public.tarefas_lembretes_pendentes()
 RETURNS TABLE(user_id uuid, nome text, atrasadas integer, hoje integer, amanha integer, inscricoes jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  with contagem as (
    select r.user_id,
      count(*) filter (where t.data_entrega < privado.tarefas_hoje())::int as atrasadas,
      count(*) filter (where t.data_entrega = privado.tarefas_hoje())::int as hoje,
      count(*) filter (where t.data_entrega = privado.tarefas_hoje() + 1)::int as amanha
    from tarefas.tarefa_responsaveis r
    join tarefas.tarefas t on t.id = r.tarefa_id
    where t.concluida_em is null and t.data_entrega <= privado.tarefas_hoje() + 1
    group by r.user_id
  )
  select u.user_id, u.nome, c.atrasadas, c.hoje, c.amanha,
    (select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
       from tarefas.push_inscricoes p where p.user_id = u.user_id)
  from tarefas.usuarios u
  join contagem c on c.user_id = u.user_id
  where u.ativo
    and exists (select 1 from tarefas.push_inscricoes p where p.user_id = u.user_id)
    and not exists (select 1 from tarefas.lembretes_enviados e where e.user_id = u.user_id and e.dia = privado.tarefas_hoje());
$function$;

CREATE OR REPLACE FUNCTION public.tarefas_inscricoes_do_usuario(p_user uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]')
  from tarefas.push_inscricoes where user_id = p_user;
$function$;

create policy projetos_tudo on tarefas.projetos for all to authenticated using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy pastas_tudo on tarefas.pastas for all to authenticated using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy listas_tudo on tarefas.listas for all to authenticated using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy tarefas_tudo on tarefas.tarefas for all to authenticated using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy responsaveis_tudo on tarefas.tarefa_responsaveis for all to authenticated using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy comentarios_ler on tarefas.comentarios for select to authenticated using (privado.tarefas_usuario());
create policy comentarios_criar on tarefas.comentarios for insert to authenticated with check (privado.tarefas_usuario() and autor_id = (select auth.uid()));
create policy comentarios_apagar on tarefas.comentarios for delete to authenticated using (privado.tarefas_usuario() and (autor_id = (select auth.uid()) or privado.tarefas_admin()));
create policy push_proprio on tarefas.push_inscricoes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and privado.tarefas_usuario());

notify pgrst, 'reload schema';
commit;

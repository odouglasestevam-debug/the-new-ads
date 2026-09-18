begin;

-- Preserva o acesso dos membros existentes. Novos cadastros começam restritos.
alter table tarefas.usuarios add column acesso_total boolean not null default true;
alter table tarefas.usuarios alter column acesso_total set default false;
create or replace view public.tarefas_usuarios with (security_invoker = true) as select * from tarefas.usuarios;

create table tarefas.acesso_espacos (
  user_id uuid references tarefas.usuarios(user_id) on delete cascade,
  projeto_id uuid references tarefas.projetos(id) on delete cascade,
  primary key(user_id, projeto_id)
);
create table tarefas.bloqueio_pastas (
  user_id uuid references tarefas.usuarios(user_id) on delete cascade,
  pasta_id uuid references tarefas.pastas(id) on delete cascade,
  primary key(user_id, pasta_id)
);
create table tarefas.bloqueio_listas (
  user_id uuid references tarefas.usuarios(user_id) on delete cascade,
  lista_id uuid references tarefas.listas(id) on delete cascade,
  primary key(user_id, lista_id)
);
alter table tarefas.acesso_espacos enable row level security;
alter table tarefas.bloqueio_pastas enable row level security;
alter table tarefas.bloqueio_listas enable row level security;
revoke all on tarefas.acesso_espacos, tarefas.bloqueio_pastas, tarefas.bloqueio_listas from public, anon, authenticated;
grant all on tarefas.acesso_espacos, tarefas.bloqueio_pastas, tarefas.bloqueio_listas to service_role;

-- Avaliador interno: serve também ao cron, sem depender da sessão de quem o executa.
create function privado.tarefas_pode(p_user uuid, p_tipo text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare u tarefas.usuarios; v_projeto uuid; v_pasta uuid; v_lista uuid;
begin
  select * into u from tarefas.usuarios where user_id=p_user and ativo;
  if not found then return false; end if;
  if p_tipo='tarefa' then
    select lista_id into v_lista from tarefas.tarefas where id=p_id;
    return v_lista is not null and privado.tarefas_pode(p_user,'lista',v_lista);
  elsif p_tipo='lista' then
    select projeto_id,pasta_id into v_projeto,v_pasta from tarefas.listas where id=p_id;
    if not found then return false; end if;
    if u.admin then return true; end if;
    if exists(select 1 from tarefas.bloqueio_listas where user_id=p_user and lista_id=p_id) then return false; end if;
    if v_pasta is not null then return privado.tarefas_pode(p_user,'pasta',v_pasta); end if;
  elsif p_tipo='pasta' then
    select projeto_id into v_projeto from tarefas.pastas where id=p_id;
    if not found then return false; end if;
    if u.admin then return true; end if;
    if exists (
      with recursive caminho as (
        select id,pasta_pai_id from tarefas.pastas where id=p_id
        union
        select p.id,p.pasta_pai_id from tarefas.pastas p join caminho c on p.id=c.pasta_pai_id
      ) select 1 from caminho c join tarefas.bloqueio_pastas b on b.pasta_id=c.id where b.user_id=p_user
    ) then return false; end if;
  elsif p_tipo='projeto' then
    select id into v_projeto from tarefas.projetos where id=p_id;
    if not found then return false; end if;
  else return false;
  end if;
  return u.admin or u.acesso_total or exists
    (select 1 from tarefas.acesso_espacos where user_id=p_user and projeto_id=v_projeto);
end;
$$;
revoke all on function privado.tarefas_pode(uuid,text,uuid) from public, anon, authenticated;

create function privado.tarefas_acessa(p_tipo text,p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.tarefas_mfa_ok() and privado.tarefas_pode(auth.uid(),p_tipo,p_id);
$$;
revoke all on function privado.tarefas_acessa(text,uuid) from public, anon;
grant execute on function privado.tarefas_acessa(text,uuid) to authenticated, service_role;

-- Alterações na hierarquia são administrativas: cascatas não podem contornar bloqueios.
drop policy projetos_tudo on tarefas.projetos;
drop policy pastas_tudo on tarefas.pastas;
drop policy listas_tudo on tarefas.listas;
create policy projetos_ler on tarefas.projetos for select to authenticated using(privado.tarefas_acessa('projeto',id));
create policy pastas_ler on tarefas.pastas for select to authenticated using(privado.tarefas_acessa('pasta',id));
create policy listas_ler on tarefas.listas for select to authenticated using(privado.tarefas_acessa('lista',id));
create policy projetos_admin on tarefas.projetos for all to authenticated using(privado.tarefas_admin()) with check(privado.tarefas_admin());
create policy pastas_admin on tarefas.pastas for all to authenticated using(privado.tarefas_admin()) with check(privado.tarefas_admin());
create policy listas_admin on tarefas.listas for all to authenticated using(privado.tarefas_admin()) with check(privado.tarefas_admin());

drop policy tarefas_tudo on tarefas.tarefas;
create policy tarefas_acesso on tarefas.tarefas for all to authenticated
  using(privado.tarefas_acessa('lista',lista_id)) with check(privado.tarefas_acessa('lista',lista_id));
drop policy responsaveis_tudo on tarefas.tarefa_responsaveis;
create policy responsaveis_acesso on tarefas.tarefa_responsaveis for all to authenticated
  using(privado.tarefas_acessa('tarefa',tarefa_id)) with check(privado.tarefas_acessa('tarefa',tarefa_id));
drop policy comentarios_ler on tarefas.comentarios;
drop policy comentarios_criar on tarefas.comentarios;
drop policy comentarios_apagar on tarefas.comentarios;
create policy comentarios_ler on tarefas.comentarios for select to authenticated using(privado.tarefas_acessa('tarefa',tarefa_id));
create policy comentarios_criar on tarefas.comentarios for insert to authenticated
  with check(privado.tarefas_acessa('tarefa',tarefa_id) and autor_id=auth.uid());
create policy comentarios_apagar on tarefas.comentarios for delete to authenticated
  using(privado.tarefas_acessa('tarefa',tarefa_id) and (autor_id=auth.uid() or privado.tarefas_admin()));

create function privado.tarefas_definir_acessos(p_user uuid,p_total boolean,p_espacos uuid[],p_pastas uuid[],p_listas uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_total is null or p_espacos is null or p_pastas is null or p_listas is null then raise exception 'Informe as permissões do membro.'; end if;
  if cardinality(p_espacos)+cardinality(p_pastas)+cardinality(p_listas)>10000 then raise exception 'Permissões demais para uma única alteração.'; end if;
  update tarefas.usuarios set acesso_total=p_total where user_id=p_user;
  if not found then raise exception 'Membro não encontrado.'; end if;
  delete from tarefas.acesso_espacos where user_id=p_user;
  delete from tarefas.bloqueio_pastas where user_id=p_user;
  delete from tarefas.bloqueio_listas where user_id=p_user;
  insert into tarefas.acesso_espacos select p_user,x from (select distinct unnest(p_espacos) x) s;
  insert into tarefas.bloqueio_pastas select p_user,x from (select distinct unnest(p_pastas) x) s;
  insert into tarefas.bloqueio_listas select p_user,x from (select distinct unnest(p_listas) x) s;
end;
$$;
revoke all on function privado.tarefas_definir_acessos(uuid,boolean,uuid[],uuid[],uuid[]) from public,anon,authenticated;

create function public.tarefas_acessos_membro(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u tarefas.usuarios;
begin
  if not privado.tarefas_admin() then raise exception 'Só administrador gerencia os acessos.'; end if;
  select * into u from tarefas.usuarios where user_id=p_user;
  if not found then raise exception 'Membro não encontrado.'; end if;
  return jsonb_build_object('acesso_total',u.acesso_total,
    'espacos',coalesce((select jsonb_agg(projeto_id) from tarefas.acesso_espacos where user_id=p_user),'[]'),
    'pastas',coalesce((select jsonb_agg(pasta_id) from tarefas.bloqueio_pastas where user_id=p_user),'[]'),
    'listas',coalesce((select jsonb_agg(lista_id) from tarefas.bloqueio_listas where user_id=p_user),'[]'));
end;
$$;
revoke all on function public.tarefas_acessos_membro(uuid) from public,anon;
grant execute on function public.tarefas_acessos_membro(uuid) to authenticated;

create function public.tarefas_configurar_membro(p_user uuid,p_nome text,p_admin boolean,p_ativo boolean,p_total boolean,p_espacos uuid[],p_pastas uuid[],p_listas uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.tarefas_admin() then raise exception 'Só administrador gerencia os acessos.'; end if;
  if p_nome is null or length(trim(p_nome)) not between 1 and 80 then raise exception 'Informe um nome de até 80 caracteres.'; end if;
  -- Serializa alterações no mesmo membro. Nenhuma regra fica parcialmente salva.
  perform 1 from tarefas.usuarios where user_id=p_user for update;
  if not found then raise exception 'Membro não encontrado.'; end if;
  update tarefas.usuarios set nome=trim(p_nome),admin=p_admin,ativo=p_ativo where user_id=p_user;
  perform privado.tarefas_definir_acessos(p_user,p_total,p_espacos,p_pastas,p_listas);
end;
$$;
revoke all on function public.tarefas_configurar_membro(uuid,text,boolean,boolean,boolean,uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.tarefas_configurar_membro(uuid,text,boolean,boolean,boolean,uuid[],uuid[],uuid[]) to authenticated;

-- Apenas a Edge Function, depois de validar o administrador, usa este cadastro atômico.
create function public.tarefas_cadastrar_membro(p_user uuid,p_nome text,p_email text,p_admin boolean,p_total boolean,p_espacos uuid[],p_pastas uuid[],p_listas uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from tarefas.usuarios where user_id=p_user) then raise exception 'Membro já cadastrado. Edite as permissões na lista de membros.'; end if;
  insert into tarefas.usuarios(user_id,nome,email,admin,ativo,acesso_total) values(p_user,trim(p_nome),lower(trim(p_email)),p_admin,true,false);
  perform privado.tarefas_definir_acessos(p_user,p_total,p_espacos,p_pastas,p_listas);
end;
$$;
revoke all on function public.tarefas_cadastrar_membro(uuid,text,text,boolean,boolean,uuid[],uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.tarefas_cadastrar_membro(uuid,text,text,boolean,boolean,uuid[],uuid[],uuid[]) to service_role;

-- Clientes antigos não podem cadastrar com permissão ambígua.
create or replace function public.tarefas_adicionar_usuario(p_user uuid,p_nome text,p_email text,p_admin boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin raise exception 'Atualize o aplicativo para cadastrar membros com permissões.'; end;
$$;

-- Uma permissão revogada também remove a tarefa do resumo enviado por push.
create or replace function public.tarefas_lembretes_pendentes()
returns table (user_id uuid,nome text,atrasadas int,hoje int,amanha int,inscricoes jsonb)
language sql stable security definer set search_path = '' as $$
  with contagem as (
    select r.user_id,
      count(*) filter(where t.data_entrega<privado.tarefas_hoje())::int atrasadas,
      count(*) filter(where t.data_entrega=privado.tarefas_hoje())::int hoje,
      count(*) filter(where t.data_entrega=privado.tarefas_hoje()+1)::int amanha
    from tarefas.tarefa_responsaveis r join tarefas.tarefas t on t.id=r.tarefa_id
    where t.concluida_em is null and t.data_entrega<=privado.tarefas_hoje()+1
      and privado.tarefas_pode(r.user_id,'lista',t.lista_id)
    group by r.user_id
  ) select u.user_id,u.nome,c.atrasadas,c.hoje,c.amanha,
    (select jsonb_agg(jsonb_build_object('endpoint',p.endpoint,'p256dh',p.p256dh,'auth',p.auth)) from tarefas.push_inscricoes p where p.user_id=u.user_id)
  from tarefas.usuarios u join contagem c on c.user_id=u.user_id where u.ativo
    and exists(select 1 from tarefas.push_inscricoes p where p.user_id=u.user_id)
    and not exists(select 1 from tarefas.lembretes_enviados e where e.user_id=u.user_id and e.dia=privado.tarefas_hoje());
$$;

notify pgrst,'reload schema';
commit;

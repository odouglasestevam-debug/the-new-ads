-- Aplicar somente no projeto do gestor. Não altera tabelas/policies do CRM.
-- MFA precisa ser validado no banco, não apenas na tela de login.
create or replace function privado.tarefas_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    or not exists (select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified');
$$;
revoke all on function privado.tarefas_mfa_ok() from public, anon;
grant execute on function privado.tarefas_mfa_ok() to authenticated, service_role;

create or replace function privado.tarefas_usuario() returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.tarefas_mfa_ok() and exists
    (select 1 from tarefas.usuarios where user_id = (select auth.uid()) and ativo);
$$;
create or replace function privado.tarefas_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.tarefas_mfa_ok() and exists
    (select 1 from tarefas.usuarios where user_id = (select auth.uid()) and ativo and admin);
$$;

drop policy push_proprio on tarefas.push_inscricoes;
create policy push_proprio on tarefas.push_inscricoes for all to authenticated
  using (user_id = (select auth.uid()) and privado.tarefas_usuario())
  with check (user_id = (select auth.uid()) and privado.tarefas_usuario());

-- Impede que o servidor de push seja usado para fazer requisições a URLs arbitrárias.
create function privado.tarefas_validar_push() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com|[a-zA-Z0-9-]+[.]push[.]apple[.]com)/[^[:space:]]+$'
    or length(new.endpoint) > 4096 then
    raise exception 'Serviço de notificação não permitido.';
  end if;
  if new.p256dh !~ '^[A-Za-z0-9_-]{87}=?$' or new.auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' then
    raise exception 'Chaves de notificação inválidas.';
  end if;
  return new;
end;
$$;
create trigger trg_push_validar before insert or update on tarefas.push_inscricoes
  for each row execute function privado.tarefas_validar_push();

-- A tela só permite um nível de subtarefas: garantir a mesma regra na API.
create function privado.tarefas_validar_hierarquia() returns trigger
language plpgsql set search_path = '' as $$
declare v_pai uuid;
begin
  if new.tarefa_pai_id is not null then
    select tarefa_pai_id into v_pai from tarefas.tarefas where id = new.tarefa_pai_id;
    if new.tarefa_pai_id = new.id or v_pai is not null
      or exists (select 1 from tarefas.tarefas where tarefa_pai_id = new.id) then
      raise exception 'Uma subtarefa não pode conter outras subtarefas.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_tarefas_hierarquia before insert or update of tarefa_pai_id on tarefas.tarefas
  for each row execute function privado.tarefas_validar_hierarquia();

-- Mover tarefa e subtarefas deve ocorrer numa única transação no banco.
create function privado.tarefas_propagar_lista() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.lista_id is distinct from old.lista_id then
    update tarefas.tarefas set lista_id = new.lista_id where tarefa_pai_id = new.id;
  end if;
  return null;
end;
$$;
create trigger trg_tarefas_propagar_lista after update of lista_id on tarefas.tarefas
  for each row execute function privado.tarefas_propagar_lista();

-- Trocar o tipo de um status em uso deixava concluida_em e situação divergentes.
create function privado.tarefas_proteger_tipo_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tipo is distinct from old.tipo and exists
    (select 1 from tarefas.tarefas where status_id = old.id) then
    raise exception 'Mova as tarefas deste status antes de alterar seu tipo.';
  end if;
  return new;
end;
$$;
create trigger trg_status_proteger_tipo before update of tipo on tarefas.status
  for each row execute function privado.tarefas_proteger_tipo_status();

create or replace function public.tarefas_inscricoes_do_usuario(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)), '[]')
  from tarefas.push_inscricoes p join tarefas.usuarios u on u.user_id = p.user_id
  where p.user_id = p_user and u.ativo;
$$;

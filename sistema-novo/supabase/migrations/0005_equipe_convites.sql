-- Empresa nunca fica sem dono pela tela. Agência, servidor (auth.uid nulo) e exclusão
-- em cascata da própria empresa passam.
create function privado.membros_manter_dono() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.papel <> 'dono' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.papel = 'dono' then return new; end if;
  if (select auth.uid()) is null or privado.eh_agencia() then return coalesce(new, old); end if;
  if not exists (select 1 from public.empresas where id = old.empresa_id) then return coalesce(new, old); end if;
  if not exists (
    select 1 from public.membros
    where empresa_id = old.empresa_id and papel = 'dono' and user_id <> old.user_id
  ) then
    raise exception 'A empresa precisa de pelo menos um dono.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_membros_manter_dono before update of papel or delete on public.membros
  for each row execute function privado.membros_manter_dono();

-- Busca de usuário por e-mail: só o servidor (Edge Function com service_role) chama.
create function public.usuario_id_por_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke execute on function public.usuario_id_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_id_por_email(text) to service_role;

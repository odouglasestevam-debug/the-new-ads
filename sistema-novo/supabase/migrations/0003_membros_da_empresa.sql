-- Lista a equipe de uma empresa com e-mail (auth.users não é legível pelo navegador).
create function public.membros_da_empresa(p_empresa uuid)
returns table (user_id uuid, email text, papel public.papel_membro)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.papel
  from public.membros m
  join auth.users u on u.id = m.user_id
  where m.empresa_id = p_empresa and privado.pode_ver_empresa(p_empresa)
  order by m.papel, u.email;
$$;
revoke execute on function public.membros_da_empresa(uuid) from public, anon;
grant execute on function public.membros_da_empresa(uuid) to authenticated;

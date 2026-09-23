-- Nome do membro na lista da equipe, para o CRM mostrar "Denise Ribeiro" no lugar do e-mail
-- e para o filtro por atendente ter rótulo legível. O nome vem do cadastro do usuário.
drop function if exists public.membros_da_empresa(uuid);
create function public.membros_da_empresa(p_empresa uuid)
returns table(user_id uuid, email text, nome text, papel public.papel_membro)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text,
         coalesce(nullif(trim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email::text, '@', 1)) as nome,
         m.papel
  from public.membros m
  join auth.users u on u.id = m.user_id
  where m.empresa_id = p_empresa and privado.pode_ver_empresa(p_empresa)
  order by m.papel, nome;
$$;
revoke all on function public.membros_da_empresa(uuid) from public, anon;
grant execute on function public.membros_da_empresa(uuid) to authenticated;

-- Exige AAL2 apenas de quem já cadastrou um fator; não altera configurações globais de Auth.
create function privado.crm_sessao_ok() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal','aal1')='aal2'
    or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
  );
$$;
revoke all on function privado.crm_sessao_ok() from public,anon;
grant execute on function privado.crm_sessao_ok() to authenticated;

create or replace function privado.eh_agencia() returns boolean
language sql stable security definer set search_path='' as $$
  select privado.crm_sessao_ok() and exists(select 1 from public.agencia_admins where user_id=auth.uid());
$$;
create or replace function privado.papel_na_empresa(p_empresa uuid) returns public.papel_membro
language sql stable security definer set search_path='' as $$
  select papel from public.membros where empresa_id=p_empresa and user_id=auth.uid() and privado.crm_sessao_ok();
$$;
create or replace function privado.pode_ver_lead(p_empresa uuid,p_responsavel uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.empresas where id=p_empresa and ativo) and (
    privado.eh_agencia() or privado.papel_na_empresa(p_empresa) in ('dono','gestor','leitura')
    or (privado.papel_na_empresa(p_empresa)='vendedor' and p_responsavel=auth.uid())
  );
$$;
create or replace function privado.pode_editar_lead(p_empresa uuid,p_responsavel uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.empresas where id=p_empresa and ativo) and (
    privado.eh_agencia() or privado.papel_na_empresa(p_empresa) in ('dono','gestor')
    or (privado.papel_na_empresa(p_empresa)='vendedor' and p_responsavel=auth.uid())
  );
$$;

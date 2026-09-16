-- Funções de permissão e de trigger saem do schema public (exposto na API) para privado.
-- Policies guardam a função por OID, então mover o schema não quebra nenhuma policy.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

alter function public.eh_agencia() set schema privado;
alter function public.papel_na_empresa(uuid) set schema privado;
alter function public.pode_ver_empresa(uuid) set schema privado;
alter function public.pode_administrar_empresa(uuid) set schema privado;
alter function public.pode_ver_lead(uuid, uuid) set schema privado;
alter function public.pode_editar_lead(uuid, uuid) set schema privado;
alter function public.pode_ver_lead_id(uuid) set schema privado;
alter function public.pode_editar_lead_id(uuid) set schema privado;
alter function public.leads_antes_gravar() set schema privado;
alter function public.leads_log_etapa() set schema privado;
alter function public.integracoes_antes_gravar() set schema privado;

-- os corpos citavam public.<função>; recriados apontando para privado
create or replace function privado.pode_ver_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.eh_agencia() or privado.papel_na_empresa(p_empresa) is not null;
$$;
create or replace function privado.pode_administrar_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.eh_agencia() or privado.papel_na_empresa(p_empresa) = 'dono';
$$;
create or replace function privado.pode_ver_lead(p_empresa uuid, p_responsavel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.eh_agencia()
      or privado.papel_na_empresa(p_empresa) in ('dono', 'gestor', 'leitura')
      or (privado.papel_na_empresa(p_empresa) = 'vendedor' and p_responsavel = (select auth.uid()));
$$;
create or replace function privado.pode_editar_lead(p_empresa uuid, p_responsavel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.eh_agencia()
      or privado.papel_na_empresa(p_empresa) in ('dono', 'gestor')
      or (privado.papel_na_empresa(p_empresa) = 'vendedor' and p_responsavel = (select auth.uid()));
$$;
create or replace function privado.pode_ver_lead_id(p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leads l where l.id = p_lead and privado.pode_ver_lead(l.empresa_id, l.responsavel_id));
$$;
create or replace function privado.pode_editar_lead_id(p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leads l where l.id = p_lead and privado.pode_editar_lead(l.empresa_id, l.responsavel_id));
$$;

revoke execute on all functions in schema privado from public, anon, authenticated;
grant execute on function
  privado.eh_agencia(), privado.papel_na_empresa(uuid), privado.pode_ver_empresa(uuid),
  privado.pode_administrar_empresa(uuid), privado.pode_ver_lead(uuid, uuid), privado.pode_editar_lead(uuid, uuid),
  privado.pode_ver_lead_id(uuid), privado.pode_editar_lead_id(uuid)
  to authenticated;
alter default privileges in schema privado revoke execute on functions from public;

-- função criada pelo template do Supabase, usada só por event trigger
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

drop index public.lead_origens_lead_idx;
create index lead_origens_lead_idx on public.lead_origens (lead_id, empresa_id, recebido_em);
drop index public.lead_etapas_log_lead_idx;
create index lead_etapas_log_lead_idx on public.lead_etapas_log (lead_id, empresa_id, criado_em);
drop index public.lead_notas_lead_idx;
create index lead_notas_lead_idx on public.lead_notas (lead_id, empresa_id, criado_em);
create index lead_notas_autor_idx on public.lead_notas (autor_id);

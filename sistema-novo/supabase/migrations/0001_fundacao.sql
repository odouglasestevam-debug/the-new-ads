-- Fase 0: fundação multitenant do sistema novo
-- Projeto Supabase xrvjlhseyqfgyvwwlwwb. Plano em docs/sistema-novo-plano.md

-- =========================================================
-- Tipos
-- =========================================================
create type public.papel_membro as enum ('dono', 'gestor', 'vendedor', 'leitura');
create type public.canal_origem as enum ('site', 'ctwa', 'meta_form', 'manual');
create type public.tipo_integracao as enum ('meta', 'whatsapp_oficial', 'whatsapp_nao_oficial');

-- =========================================================
-- Quem é quem
-- =========================================================
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.agencia_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table public.membros (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel public.papel_membro not null,
  criado_em timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index membros_user_idx on public.membros (user_id);

-- =========================================================
-- Leads
-- =========================================================
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text,
  telefone text check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  etapa text not null default 'novo',
  responsavel_id uuid references auth.users (id) on delete set null,
  valor numeric(12, 2),
  cadastro_incompleto boolean generated always as (telefone is null) stored,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, empresa_id)
);
-- uma pessoa = um lead por empresa
create unique index leads_empresa_telefone_uidx on public.leads (empresa_id, telefone) where telefone is not null;
create index leads_empresa_email_idx on public.leads (empresa_id, email) where email is not null;
create index leads_empresa_etapa_idx on public.leads (empresa_id, etapa);
create index leads_responsavel_idx on public.leads (responsavel_id);

-- cada chegada da pessoa; a mais antiga é a origem de entrada, a mais recente a última
create table public.lead_origens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lead_id uuid not null,
  canal public.canal_origem not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  campanha_id text,
  campanha_nome text,
  conjunto_id text,
  conjunto_nome text,
  ad_id text,
  anuncio_nome text,
  ctwa_clid text,
  fbclid text,
  gclid text,
  pagina_url text,
  dados jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null default now(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index lead_origens_lead_idx on public.lead_origens (lead_id, recebido_em);
create index lead_origens_ad_idx on public.lead_origens (empresa_id, ad_id);

create table public.lead_etapas_log (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  lead_id uuid not null,
  etapa_anterior text,
  etapa_nova text not null,
  user_id uuid,
  criado_em timestamptz not null default now(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index lead_etapas_log_lead_idx on public.lead_etapas_log (lead_id, criado_em);

create table public.lead_notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lead_id uuid not null,
  autor_id uuid default auth.uid() references auth.users (id) on delete set null,
  texto text not null check (length(texto) between 1 and 5000),
  criado_em timestamptz not null default now(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index lead_notas_lead_idx on public.lead_notas (lead_id, criado_em);

-- =========================================================
-- Integrações (segredos ficam no Vault, aqui só a referência)
-- =========================================================
create table public.integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo public.tipo_integracao not null,
  status text not null default 'pendente' check (status in ('pendente', 'ativa', 'erro', 'desativada')),
  config jsonb not null default '{}'::jsonb,
  segredo_id uuid,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, tipo)
);

-- nomes de campanha, conjunto e anúncio por ad_id, para o CTWA não consultar a Meta toda vez
create table public.meta_anuncios_cache (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ad_id text not null,
  anuncio_nome text,
  conjunto_id text,
  conjunto_nome text,
  campanha_id text,
  campanha_nome text,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, ad_id)
);

-- =========================================================
-- Funções de permissão
-- =========================================================
create function public.eh_agencia() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agencia_admins where user_id = (select auth.uid()));
$$;

create function public.papel_na_empresa(p_empresa uuid) returns public.papel_membro
language sql stable security definer set search_path = '' as $$
  select papel from public.membros where empresa_id = p_empresa and user_id = (select auth.uid());
$$;

create function public.pode_ver_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_agencia() or public.papel_na_empresa(p_empresa) is not null;
$$;

create function public.pode_administrar_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_agencia() or public.papel_na_empresa(p_empresa) = 'dono';
$$;

create function public.pode_ver_lead(p_empresa uuid, p_responsavel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_agencia()
      or public.papel_na_empresa(p_empresa) in ('dono', 'gestor', 'leitura')
      or (public.papel_na_empresa(p_empresa) = 'vendedor' and p_responsavel = (select auth.uid()));
$$;

create function public.pode_editar_lead(p_empresa uuid, p_responsavel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_agencia()
      or public.papel_na_empresa(p_empresa) in ('dono', 'gestor')
      or (public.papel_na_empresa(p_empresa) = 'vendedor' and p_responsavel = (select auth.uid()));
$$;

create function public.pode_ver_lead_id(p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leads l where l.id = p_lead and public.pode_ver_lead(l.empresa_id, l.responsavel_id));
$$;

create function public.pode_editar_lead_id(p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leads l where l.id = p_lead and public.pode_editar_lead(l.empresa_id, l.responsavel_id));
$$;

-- =========================================================
-- Triggers
-- =========================================================
create function public.leads_antes_gravar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.atualizado_em := now();
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros m where m.empresa_id = new.empresa_id and m.user_id = new.responsavel_id
  ) then
    raise exception 'responsavel_id não é membro da empresa';
  end if;
  if tg_op = 'UPDATE' and new.empresa_id <> old.empresa_id then
    raise exception 'empresa_id do lead não pode mudar';
  end if;
  return new;
end;
$$;
create trigger trg_leads_antes_gravar before insert or update on public.leads
  for each row execute function public.leads_antes_gravar();

create function public.leads_log_etapa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    insert into public.lead_etapas_log (empresa_id, lead_id, etapa_anterior, etapa_nova, user_id)
    values (new.empresa_id, new.id, case when tg_op = 'UPDATE' then old.etapa end, new.etapa, auth.uid());
  end if;
  return null;
end;
$$;
create trigger trg_leads_log_etapa after insert or update of etapa on public.leads
  for each row execute function public.leads_log_etapa();

create function public.integracoes_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger trg_integracoes_antes_gravar before update on public.integracoes
  for each row execute function public.integracoes_antes_gravar();

-- =========================================================
-- RLS
-- =========================================================
alter table public.empresas enable row level security;
alter table public.agencia_admins enable row level security;
alter table public.membros enable row level security;
alter table public.leads enable row level security;
alter table public.lead_origens enable row level security;
alter table public.lead_etapas_log enable row level security;
alter table public.lead_notas enable row level security;
alter table public.integracoes enable row level security;
alter table public.meta_anuncios_cache enable row level security; -- sem policy: só o servidor

-- empresas
create policy empresas_ver on public.empresas for select to authenticated using (public.pode_ver_empresa(id));
create policy empresas_criar on public.empresas for insert to authenticated with check (public.eh_agencia());
create policy empresas_editar on public.empresas for update to authenticated
  using (public.pode_administrar_empresa(id)) with check (public.pode_administrar_empresa(id));
create policy empresas_apagar on public.empresas for delete to authenticated using (public.eh_agencia());

-- agencia_admins: cada um só vê a própria linha; gravação só pelo servidor
create policy agencia_ver_propria on public.agencia_admins for select to authenticated using (user_id = (select auth.uid()));

-- membros
create policy membros_ver on public.membros for select to authenticated using (public.pode_ver_empresa(empresa_id));
create policy membros_criar on public.membros for insert to authenticated with check (public.pode_administrar_empresa(empresa_id));
create policy membros_editar on public.membros for update to authenticated
  using (public.pode_administrar_empresa(empresa_id)) with check (public.pode_administrar_empresa(empresa_id));
create policy membros_apagar on public.membros for delete to authenticated using (public.pode_administrar_empresa(empresa_id));

-- leads
create policy leads_ver on public.leads for select to authenticated using (public.pode_ver_lead(empresa_id, responsavel_id));
create policy leads_criar on public.leads for insert to authenticated with check (public.pode_editar_lead(empresa_id, responsavel_id));
create policy leads_editar on public.leads for update to authenticated
  using (public.pode_editar_lead(empresa_id, responsavel_id)) with check (public.pode_editar_lead(empresa_id, responsavel_id));
create policy leads_apagar on public.leads for delete to authenticated using (public.pode_administrar_empresa(empresa_id));

-- origens: leitura por quem vê o lead; criação manual por quem edita
create policy lead_origens_ver on public.lead_origens for select to authenticated using (public.pode_ver_lead_id(lead_id));
create policy lead_origens_criar on public.lead_origens for insert to authenticated
  with check (canal = 'manual' and public.pode_editar_lead_id(lead_id));

-- log de etapas: só leitura, quem grava é o trigger
create policy lead_etapas_log_ver on public.lead_etapas_log for select to authenticated using (public.pode_ver_lead_id(lead_id));

-- notas
create policy lead_notas_ver on public.lead_notas for select to authenticated using (public.pode_ver_lead_id(lead_id));
create policy lead_notas_criar on public.lead_notas for insert to authenticated
  with check (autor_id = (select auth.uid()) and public.pode_editar_lead_id(lead_id));
create policy lead_notas_editar on public.lead_notas for update to authenticated
  using (autor_id = (select auth.uid())) with check (autor_id = (select auth.uid()) and public.pode_editar_lead_id(lead_id));
create policy lead_notas_apagar on public.lead_notas for delete to authenticated
  using (autor_id = (select auth.uid()) or public.pode_administrar_empresa(empresa_id));

-- integrações: só agência e dono
create policy integracoes_ver on public.integracoes for select to authenticated using (public.pode_administrar_empresa(empresa_id));
create policy integracoes_criar on public.integracoes for insert to authenticated with check (public.pode_administrar_empresa(empresa_id));
create policy integracoes_editar on public.integracoes for update to authenticated
  using (public.pode_administrar_empresa(empresa_id)) with check (public.pode_administrar_empresa(empresa_id));
create policy integracoes_apagar on public.integracoes for delete to authenticated using (public.pode_administrar_empresa(empresa_id));

-- =========================================================
-- Privilégios: anônimo não toca em nada; colunas sensíveis travadas
-- =========================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function
  public.eh_agencia(), public.papel_na_empresa(uuid), public.pode_ver_empresa(uuid),
  public.pode_administrar_empresa(uuid), public.pode_ver_lead(uuid, uuid), public.pode_editar_lead(uuid, uuid),
  public.pode_ver_lead_id(uuid), public.pode_editar_lead_id(uuid)
  to authenticated;

-- segredo_id só o servidor grava (senão um dono apontaria para o segredo de outra empresa)
revoke insert, update on public.integracoes from authenticated;
grant insert (empresa_id, tipo, status, config) on public.integracoes to authenticated;
grant update (status, config) on public.integracoes to authenticated;

-- origem, log e cache não são editáveis pelo navegador
revoke update, delete on public.lead_origens from authenticated;
revoke insert, update, delete on public.lead_etapas_log from authenticated;
revoke all on public.meta_anuncios_cache from authenticated;
revoke insert, update, delete on public.agencia_admins from authenticated;

-- empresa de um lead e o id nunca mudam pelo navegador
revoke update on public.leads from authenticated;
grant update (nome, telefone, email, etapa, responsavel_id, valor) on public.leads to authenticated;
revoke update on public.membros from authenticated;
grant update (papel) on public.membros to authenticated;

-- tabelas criadas depois também nascem fechadas para anônimo
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Aplicado em 05/11/2026 no projeto iklynyncffneuvutvgxa (via conector, migrations
-- alertas_problemas_e_monitores, alerta_silenciar e alertas_clientes_view).
-- Guardado aqui pra referencia: o banco e a fonte de verdade.

-- Um registro por problema aberto. Quem decide se notifica e alerta_abrir():
-- avisa na abertura, quando piora (atencao -> critico) e no lembrete, se houver.
create table public.alertas_problemas (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  slug text,
  tipo text not null,
  nivel text not null check (nivel in ('critico', 'atencao')),
  titulo text not null,
  mensagem text not null,
  url_acao text,
  dados jsonb not null default '{}'::jsonb,
  lembrete_horas int,
  aberto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultimo_push_em timestamptz,
  pushes int not null default 0,
  silenciado_ate timestamptz,
  resolvido_em timestamptz
);
create unique index alertas_problemas_aberto_uk on public.alertas_problemas (chave) where resolvido_em is null;
create index alertas_problemas_lista_idx on public.alertas_problemas (resolvido_em, aberto_em desc);
alter table public.alertas_problemas enable row level security;
create policy "anon pode ler alertas_problemas" on public.alertas_problemas for select to anon using (true);

create table public.sites_monitorados (
  id uuid primary key default gen_random_uuid(),
  slug text,
  nome text not null,
  url text not null unique,
  origem text not null default 'fixo' check (origem in ('fixo', 'anuncio')),
  marcadores text[] not null default '{}',
  status_ok int[] not null default '{200}',
  ativo boolean not null default true,
  falhas_seguidas int not null default 0,
  ultimo_status int,
  ultimo_erro text,
  ultimo_check timestamptz,
  ultimo_ok timestamptz,
  visto_em_anuncio timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.sites_monitorados enable row level security;
create policy "anon pode ler sites_monitorados" on public.sites_monitorados for select to anon using (true);

-- Foto de hora em hora do acumulado do dia por campanha (gasto e leads),
-- pra saber quanto foi gasto desde o ultimo lead dentro do dia.
create table public.monitor_leads_snap (
  id bigint generated always as identity primary key,
  slug text not null,
  campanha_id text not null,
  campanha text,
  data date not null,
  gasto numeric not null,
  leads numeric not null,
  capturado_em timestamptz not null default now()
);
create index monitor_leads_snap_idx on public.monitor_leads_snap (campanha_id, data, capturado_em);
alter table public.monitor_leads_snap enable row level security;

alter table public.tracking_saude add column if not exists checagem_falhou boolean not null default false;

create or replace function public.alerta_abrir(
  p_chave text, p_slug text, p_tipo text, p_nivel text, p_titulo text, p_mensagem text,
  p_url text default null, p_lembrete_horas int default null, p_dados jsonb default '{}'::jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r public.alertas_problemas;
  v_enviar boolean := false;
begin
  select * into r from public.alertas_problemas where chave = p_chave and resolvido_em is null for update;
  if not found then
    insert into public.alertas_problemas (chave, slug, tipo, nivel, titulo, mensagem, url_acao, dados, lembrete_horas)
    values (p_chave, p_slug, p_tipo, p_nivel, p_titulo, p_mensagem, p_url, coalesce(p_dados, '{}'::jsonb), p_lembrete_horas)
    returning * into r;
    v_enviar := true;
  else
    v_enviar := (r.silenciado_ate is null or r.silenciado_ate < now()) and (
      (r.nivel = 'atencao' and p_nivel = 'critico')
      or (p_lembrete_horas is not null and coalesce(r.ultimo_push_em, r.aberto_em) < now() - make_interval(hours => p_lembrete_horas))
    );
    update public.alertas_problemas
       set nivel = p_nivel, titulo = p_titulo, mensagem = p_mensagem, url_acao = coalesce(p_url, url_acao),
           dados = coalesce(p_dados, dados), lembrete_horas = p_lembrete_horas, atualizado_em = now()
     where id = r.id;
  end if;
  if v_enviar then
    update public.alertas_problemas set ultimo_push_em = now(), pushes = pushes + 1 where id = r.id;
    insert into public.alertas_enviados (slug, tipo, mensagem, nivel)
    values ((select slug from public.clientes_meta_contas where slug = p_slug), p_tipo, p_titulo || ': ' || p_mensagem, p_nivel);
  end if;
  return v_enviar;
end $$;

-- Fecha o problema. Devolve o titulo quando vale avisar que resolveu
-- (so se o problema chegou a notificar), senao null.
create or replace function public.alerta_resolver(p_chave text, p_avisar boolean default true)
returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.alertas_problemas;
begin
  update public.alertas_problemas set resolvido_em = now(), atualizado_em = now()
   where chave = p_chave and resolvido_em is null
  returning * into r;
  if not found then return null; end if;
  if p_avisar and r.pushes > 0 then
    insert into public.alertas_enviados (slug, tipo, mensagem, nivel)
    values ((select slug from public.clientes_meta_contas where slug = r.slug), r.tipo || '_resolvido', r.titulo || ': resolvido', 'ok');
    return r.titulo;
  end if;
  return null;
end $$;

revoke all on function public.alerta_abrir(text, text, text, text, text, text, text, int, jsonb) from public, anon, authenticated;
revoke all on function public.alerta_resolver(text, boolean) from public, anon, authenticated;
grant execute on function public.alerta_abrir(text, text, text, text, text, text, text, int, jsonb) to service_role;
grant execute on function public.alerta_resolver(text, boolean) to service_role;

-- Silenciar pelo app. So quem esta na allowlist do painel (funil_acesso),
-- porque a pagina e publica e a chave anon esta no HTML.
-- p_horas: 24, 168... ; -1 = ate resolver ; 0 = reativar.
create or replace function public.alerta_silenciar(p_id uuid, p_horas int)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v timestamptz;
begin
  if auth.uid() is null or not exists (select 1 from public.funil_acesso where user_id = auth.uid()) then
    raise exception 'sem acesso' using errcode = '42501';
  end if;
  v := case
         when p_horas = -1 then 'infinity'::timestamptz
         when p_horas is null or p_horas <= 0 then null
         else now() + make_interval(hours => least(p_horas, 24 * 30))
       end;
  update public.alertas_problemas set silenciado_ate = v, atualizado_em = now()
   where id = p_id and resolvido_em is null;
  return v;
end $$;
revoke all on function public.alerta_silenciar(uuid, int) from public, anon;
grant execute on function public.alerta_silenciar(uuid, int) to authenticated;

-- So slug e nome, pro app mostrar o nome do cliente sem abrir o resto de
-- clientes_meta_contas (conta de anuncio, instagram) pro anon.
create or replace view public.alertas_clientes as
  select slug, nome, ativo from public.clientes_meta_contas;
revoke all on public.alertas_clientes from public, anon, authenticated;
grant select on public.alertas_clientes to anon, authenticated;

-- Agendamentos (pg_cron), com o mesmo cabecalho de autorizacao do job
-- check-account-health-2h:
--   monitor-sites-10min  */10 * * * *  -> functions/v1/monitor?tarefa=sites
--   monitor-leads-1h     7 * * * *     -> functions/v1/monitor?tarefa=leads

-- Dados aplicados no mesmo dia:
--   clientes_meta_contas: ativo=false para chocolate-da-zeza, dedalos-moveis,
--   grupo-murana, vitor-citadin, volpimob (ex-clientes); agari-drinks cadastrada
--   (act_719222232075091, sincronizar_metricas=false).
--   sites_monitorados: Grupo Confianca, Agari (social e corporativo), Arcan
--   (captura e loja), Entretec (site e jogos para eventos), Dyovana (aceita 406).

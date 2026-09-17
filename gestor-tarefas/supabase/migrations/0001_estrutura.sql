-- Gestor de tarefas interno (substitui o ClickUp)
-- Projeto Supabase xrvjlhseyqfgyvwwlwwb, schema próprio "tarefas", separado das tabelas do CRM.
-- Só quem está em tarefas.usuarios (ativo) enxerga alguma coisa. Usuário de cliente do CRM não entra.

create schema tarefas;
grant usage on schema tarefas to authenticated, service_role;

create type tarefas.prioridade as enum ('urgente', 'alta', 'normal', 'baixa');
create type tarefas.recorrencia as enum ('diaria', 'semanal', 'mensal', 'anual');
create type tarefas.tipo_status as enum ('aberto', 'concluido');

-- =========================================================
-- Usuários e permissão
-- =========================================================
create table tarefas.usuarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  email text not null,
  admin boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create function privado.tarefas_usuario() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from tarefas.usuarios where user_id = (select auth.uid()) and ativo);
$$;
create function privado.tarefas_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from tarefas.usuarios where user_id = (select auth.uid()) and ativo and admin);
$$;
revoke execute on function privado.tarefas_usuario(), privado.tarefas_admin() from public, anon;
grant execute on function privado.tarefas_usuario(), privado.tarefas_admin() to authenticated, service_role;

-- Nunca fica sem nenhum admin ativo.
create function privado.tarefas_manter_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from tarefas.usuarios where admin and ativo) then
    raise exception 'O gestor precisa de pelo menos um admin ativo.';
  end if;
  return null;
end;
$$;
create constraint trigger trg_usuarios_manter_admin after update or delete on tarefas.usuarios
  deferrable initially deferred for each row execute function privado.tarefas_manter_admin();

-- =========================================================
-- Estrutura: projeto > pastas (aninhadas) > listas > tarefas > subtarefas
-- =========================================================
create table tarefas.projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cor text not null default '#FF6A00' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem double precision not null default extract(epoch from now()),
  criado_em timestamptz not null default now()
);

create table tarefas.pastas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references tarefas.projetos (id) on delete cascade,
  pasta_pai_id uuid references tarefas.pastas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem double precision not null default extract(epoch from now()),
  criado_em timestamptz not null default now(),
  check (pasta_pai_id is distinct from id)
);
create index pastas_projeto_idx on tarefas.pastas (projeto_id);
create index pastas_pai_idx on tarefas.pastas (pasta_pai_id);

create table tarefas.listas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references tarefas.projetos (id) on delete cascade,
  pasta_id uuid references tarefas.pastas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem double precision not null default extract(epoch from now()),
  criado_em timestamptz not null default now()
);
create index listas_projeto_idx on tarefas.listas (projeto_id);
create index listas_pasta_idx on tarefas.listas (pasta_id);

-- Pasta filha fica no mesmo projeto da mãe e não pode virar mãe de si mesma.
-- Mover pasta leva as subpastas e as listas junto para o projeto novo.
create function privado.tarefas_validar_pasta() returns trigger
language plpgsql set search_path = '' as $$
declare v_projeto uuid; v_atual uuid;
begin
  if new.pasta_pai_id is not null then
    select projeto_id into v_projeto from tarefas.pastas where id = new.pasta_pai_id;
    new.projeto_id := v_projeto;
    v_atual := new.pasta_pai_id;
    while v_atual is not null loop
      if v_atual = new.id then raise exception 'Uma pasta não pode ficar dentro dela mesma.'; end if;
      select pasta_pai_id into v_atual from tarefas.pastas where id = v_atual;
    end loop;
  end if;
  return new;
end;
$$;
create trigger trg_pastas_validar before insert or update on tarefas.pastas
  for each row execute function privado.tarefas_validar_pasta();

create function privado.tarefas_propagar_projeto_pasta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.projeto_id is distinct from old.projeto_id then
    update tarefas.pastas set projeto_id = new.projeto_id where pasta_pai_id = new.id;
    update tarefas.listas set projeto_id = new.projeto_id where pasta_id = new.id;
  end if;
  return null;
end;
$$;
create trigger trg_pastas_propagar after update of projeto_id on tarefas.pastas
  for each row execute function privado.tarefas_propagar_projeto_pasta();

create function privado.tarefas_validar_lista() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.pasta_id is not null then
    select projeto_id into new.projeto_id from tarefas.pastas where id = new.pasta_id;
  end if;
  return new;
end;
$$;
create trigger trg_listas_validar before insert or update on tarefas.listas
  for each row execute function privado.tarefas_validar_lista();

create table tarefas.status (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) > 0),
  cor text not null default '#8A8A8A' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  tipo tarefas.tipo_status not null default 'aberto',
  ordem int not null default 0
);
insert into tarefas.status (nome, cor, tipo, ordem) values
  ('A fazer', '#8A8A8A', 'aberto', 1),
  ('Em andamento', '#60A5FA', 'aberto', 2),
  ('Em revisão', '#FF6A00', 'aberto', 3),
  ('Concluído', '#4ADE80', 'concluido', 4);

create table tarefas.tarefas (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references tarefas.listas (id) on delete cascade,
  tarefa_pai_id uuid references tarefas.tarefas (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  status_id uuid not null references tarefas.status (id),
  prioridade tarefas.prioridade not null default 'normal',
  data_inicio date,
  data_entrega date,
  concluida_em timestamptz,
  recorrencia tarefas.recorrencia,
  recorrencia_intervalo int not null default 1 check (recorrencia_intervalo between 1 and 365),
  proxima_id uuid references tarefas.tarefas (id) on delete set null,
  ordem double precision not null default extract(epoch from now()),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (data_inicio is null or data_entrega is null or data_inicio <= data_entrega),
  check (tarefa_pai_id is distinct from id)
);
create index tarefas_lista_idx on tarefas.tarefas (lista_id);
create index tarefas_pai_idx on tarefas.tarefas (tarefa_pai_id);
create index tarefas_status_idx on tarefas.tarefas (status_id);
create index tarefas_entrega_aberta_idx on tarefas.tarefas (data_entrega) where concluida_em is null;
create index tarefas_proxima_idx on tarefas.tarefas (proxima_id);
create index tarefas_criado_por_idx on tarefas.tarefas (criado_por);

create table tarefas.tarefa_responsaveis (
  tarefa_id uuid not null references tarefas.tarefas (id) on delete cascade,
  user_id uuid not null references tarefas.usuarios (user_id) on delete cascade,
  primary key (tarefa_id, user_id)
);
create index tarefa_responsaveis_user_idx on tarefas.tarefa_responsaveis (user_id);

create table tarefas.comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas.tarefas (id) on delete cascade,
  autor_id uuid default auth.uid() references auth.users (id) on delete set null,
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now()
);
create index comentarios_tarefa_idx on tarefas.comentarios (tarefa_id);
create index comentarios_autor_idx on tarefas.comentarios (autor_id);

-- =========================================================
-- Regras da tarefa
-- =========================================================
create function privado.tarefas_hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;
grant execute on function privado.tarefas_hoje() to authenticated, service_role;

-- Status concluído marca a data de conclusão (reabrir limpa).
-- Subtarefa sempre fica na lista da mãe.
-- Tarefa recorrente, ao concluir, gera a próxima a partir da data de entrega (agenda fixa).
create function privado.tarefas_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_tipo tarefas.tipo_status;
  v_passo interval;
  v_base date;
  v_status_aberto uuid;
  v_nova uuid;
begin
  new.atualizado_em := now();
  if new.tarefa_pai_id is not null then
    select lista_id into new.lista_id from tarefas.tarefas where id = new.tarefa_pai_id;
  end if;

  select tipo into v_tipo from tarefas.status where id = new.status_id;
  if v_tipo = 'concluido' then
    if tg_op = 'INSERT' or old.concluida_em is null then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;

  if tg_op = 'UPDATE' and old.concluida_em is null and new.concluida_em is not null
     and new.recorrencia is not null and new.proxima_id is null then
    v_passo := case new.recorrencia
      when 'diaria' then make_interval(days => new.recorrencia_intervalo)
      when 'semanal' then make_interval(weeks => new.recorrencia_intervalo)
      when 'mensal' then make_interval(months => new.recorrencia_intervalo)
      else make_interval(years => new.recorrencia_intervalo) end;
    v_base := coalesce(new.data_entrega, privado.tarefas_hoje());
    select id into v_status_aberto from tarefas.status where tipo = 'aberto' order by ordem limit 1;
    v_nova := gen_random_uuid();
    insert into tarefas.tarefas (id, lista_id, tarefa_pai_id, titulo, descricao, status_id, prioridade,
      data_inicio, data_entrega, recorrencia, recorrencia_intervalo, ordem, criado_por)
    values (v_nova, new.lista_id, new.tarefa_pai_id, new.titulo, new.descricao, v_status_aberto, new.prioridade,
      case when new.data_inicio is null then null else (new.data_inicio + v_passo)::date end,
      (v_base + v_passo)::date, new.recorrencia, new.recorrencia_intervalo, new.ordem, new.criado_por);
    insert into tarefas.tarefa_responsaveis (tarefa_id, user_id)
      select v_nova, user_id from tarefas.tarefa_responsaveis where tarefa_id = new.id;
    new.proxima_id := v_nova;
  end if;
  return new;
end;
$$;
create trigger trg_tarefas_antes_gravar before insert or update on tarefas.tarefas
  for each row execute function privado.tarefas_antes_gravar();

-- Visão usada pela tela: atraso e situação calculados pelo banco no fuso de São Paulo.
-- dias_atraso: aberta = hoje menos a entrega; concluída = dia da conclusão menos a entrega.
create view tarefas.tarefas_visao with (security_invoker = true) as
select
  t.*,
  s.nome as status_nome, s.cor as status_cor, s.tipo as status_tipo, s.ordem as status_ordem,
  l.nome as lista_nome, l.pasta_id, l.projeto_id,
  p.nome as projeto_nome, p.cor as projeto_cor,
  coalesce((select array_agg(r.user_id) from tarefas.tarefa_responsaveis r where r.tarefa_id = t.id), '{}') as responsaveis,
  case
    when t.data_entrega is null then 0
    when t.concluida_em is not null then greatest(0, (t.concluida_em at time zone 'America/Sao_Paulo')::date - t.data_entrega)
    else greatest(0, privado.tarefas_hoje() - t.data_entrega)
  end as dias_atraso,
  case when t.data_entrega is null then null else t.data_entrega - privado.tarefas_hoje() end as dias_para_vencer,
  case
    when t.concluida_em is not null then 'concluida'
    when t.data_entrega is null then 'sem_data'
    when t.data_entrega < privado.tarefas_hoje() then 'atrasada'
    when t.data_entrega = privado.tarefas_hoje() then 'vence_hoje'
    else 'a_vencer'
  end as situacao
from tarefas.tarefas t
join tarefas.status s on s.id = t.status_id
join tarefas.listas l on l.id = t.lista_id
join tarefas.projetos p on p.id = l.projeto_id;

-- =========================================================
-- Push (lembrete diário de prazo)
-- =========================================================
create table tarefas.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references tarefas.usuarios (user_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
create index push_inscricoes_user_idx on tarefas.push_inscricoes (user_id);

create table tarefas.lembretes_enviados (
  user_id uuid not null references tarefas.usuarios (user_id) on delete cascade,
  dia date not null,
  resumo jsonb,
  enviado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

-- Aparelho reinscrito troca as chaves no mesmo endpoint.
create function public.tarefas_salvar_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.tarefas_usuario() then raise exception 'Sem acesso ao gestor de tarefas.'; end if;
  insert into tarefas.push_inscricoes (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.tarefas_salvar_push(text, text, text) from public, anon;
grant execute on function public.tarefas_salvar_push(text, text, text) to authenticated;

-- Segredos do gestor (chave VAPID privada, segredo do cron) ficam no Vault; só o servidor lê.
create function public.tarefas_ler_segredo(p_nome text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tarefas_' || p_nome;
$$;
revoke execute on function public.tarefas_ler_segredo(text) from public, anon, authenticated;
grant execute on function public.tarefas_ler_segredo(text) to service_role;

-- =========================================================
-- Acesso
-- =========================================================
alter table tarefas.usuarios enable row level security;
alter table tarefas.projetos enable row level security;
alter table tarefas.pastas enable row level security;
alter table tarefas.listas enable row level security;
alter table tarefas.status enable row level security;
alter table tarefas.tarefas enable row level security;
alter table tarefas.tarefa_responsaveis enable row level security;
alter table tarefas.comentarios enable row level security;
alter table tarefas.push_inscricoes enable row level security;
alter table tarefas.lembretes_enviados enable row level security;

grant select on all tables in schema tarefas to authenticated;
grant insert, update, delete on tarefas.projetos, tarefas.pastas, tarefas.listas, tarefas.status,
  tarefas.tarefas, tarefas.tarefa_responsaveis, tarefas.comentarios, tarefas.push_inscricoes to authenticated;
grant update (nome, admin, ativo) on tarefas.usuarios to authenticated;
revoke all on tarefas.lembretes_enviados from authenticated;
grant all on all tables in schema tarefas to service_role;

create policy usuarios_ler on tarefas.usuarios for select to authenticated using (privado.tarefas_usuario());
create policy usuarios_admin on tarefas.usuarios for update to authenticated
  using (privado.tarefas_admin()) with check (privado.tarefas_admin());

create policy projetos_tudo on tarefas.projetos for all to authenticated
  using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy pastas_tudo on tarefas.pastas for all to authenticated
  using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy listas_tudo on tarefas.listas for all to authenticated
  using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy tarefas_tudo on tarefas.tarefas for all to authenticated
  using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());
create policy responsaveis_tudo on tarefas.tarefa_responsaveis for all to authenticated
  using (privado.tarefas_usuario()) with check (privado.tarefas_usuario());

create policy status_ler on tarefas.status for select to authenticated using (privado.tarefas_usuario());
create policy status_admin_inserir on tarefas.status for insert to authenticated with check (privado.tarefas_admin());
create policy status_admin_alterar on tarefas.status for update to authenticated
  using (privado.tarefas_admin()) with check (privado.tarefas_admin());
create policy status_admin_apagar on tarefas.status for delete to authenticated using (privado.tarefas_admin());

create policy comentarios_ler on tarefas.comentarios for select to authenticated using (privado.tarefas_usuario());
create policy comentarios_criar on tarefas.comentarios for insert to authenticated
  with check (privado.tarefas_usuario() and autor_id = (select auth.uid()));
create policy comentarios_apagar on tarefas.comentarios for delete to authenticated
  using (privado.tarefas_usuario() and (autor_id = (select auth.uid()) or privado.tarefas_admin()));

create policy push_proprio on tarefas.push_inscricoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and privado.tarefas_usuario());

-- Douglas é o primeiro admin.
insert into tarefas.usuarios (user_id, nome, email, admin)
select id, 'Douglas', email, true from auth.users where email = 'odouglasestevam@gmail.com';

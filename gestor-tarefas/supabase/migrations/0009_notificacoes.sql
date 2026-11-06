-- Notificações além do resumo das 8h:
--  1. Tarefa urgente: 1 aviso por dia até concluir, 2 no primeiro dia.
--  2. Tarefa atribuída por outra pessoa: aviso em até 1 minuto dizendo quem criou e quem atribuiu.
-- Aqui fica a regra e o registro do que já saiu. O envio é da Edge Function tarefas-lembrete
-- e os agendamentos estão em 0010_notificacoes_cron.sql.
begin;

-- Quando o aviso de urgente começa. Com data de início, é ela. Sem início, a recorrente espera a
-- entrega: a próxima ocorrência nasce semanas antes de vencer e não pode avisar todo dia até lá.
-- Tarefa avulsa sem início é urgente desde já.
create function privado.tarefas_urgente_em_aviso(p_inicio date, p_entrega date, p_recorrencia tarefas.recorrencia)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_inicio, case when p_recorrencia is not null then p_entrega end, privado.tarefas_hoje())
    <= privado.tarefas_hoje();
$$;

-- Decide se a tarefa ainda deve aviso hoje. O primeiro sai na primeira rodada do dia (8h às 20h).
-- O segundo só existe no primeiro dia: a partir das 14h e com folga do primeiro, para uma tarefa
-- criada à tarde não tocar duas vezes em seguida.
create function privado.tarefas_urgente_devida(p_vezes_hoje int, p_dia_anterior boolean, p_ultimo timestamptz, p_agora timestamptz)
returns boolean language sql immutable set search_path = '' as $$
  select p_vezes_hoje = 0
    or (p_vezes_hoje = 1 and not p_dia_anterior
        and extract(hour from p_agora at time zone 'America/Sao_Paulo') >= 14
        and p_agora - p_ultimo >= interval '2 hours 30 minutes');
$$;

-- Histórico por pessoa e tarefa. É ele que define o "primeiro dia": não ter aviso em dia anterior.
create table tarefas.urgentes_enviados (
  tarefa_id uuid not null references tarefas.tarefas (id) on delete cascade,
  user_id uuid not null references tarefas.usuarios (user_id) on delete cascade,
  dia date not null,
  vez smallint not null,
  enviado_em timestamptz not null default now(),
  primary key (tarefa_id, user_id, dia, vez)
);
create index urgentes_enviados_user_idx on tarefas.urgentes_enviados (user_id);

-- Fila de atribuições. Passar por ela junta várias atribuições num aviso só (seleção em lote,
-- onboarding) e permite tentar de novo se o envio falhar. ator_id não tem FK: criado_por pode ser
-- de um membro já excluído, e isso não pode impedir uma atribuição.
create table tarefas.atribuicoes_fila (
  id bigint generated always as identity primary key,
  tarefa_id uuid not null references tarefas.tarefas (id) on delete cascade,
  user_id uuid not null references tarefas.usuarios (user_id) on delete cascade,
  ator_id uuid,
  criado_em timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em timestamptz
);
create unique index atribuicoes_fila_pendente_idx on tarefas.atribuicoes_fila (tarefa_id, user_id) where enviado_em is null;
create index atribuicoes_fila_user_idx on tarefas.atribuicoes_fila (user_id);

alter table tarefas.urgentes_enviados enable row level security;
alter table tarefas.atribuicoes_fila enable row level security;
revoke all on tarefas.urgentes_enviados, tarefas.atribuicoes_fila from public, anon, authenticated;
grant all on tarefas.urgentes_enviados, tarefas.atribuicoes_fila to service_role;

create function privado.tarefas_enfileirar_atribuicao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tarefa tarefas.tarefas;
  v_ator uuid;
begin
  -- Dentro de outro gatilho é a recorrência copiando responsáveis: a pessoa já era da série.
  if pg_trigger_depth() > 1 then return null; end if;
  select * into v_tarefa from tarefas.tarefas where id = new.tarefa_id;
  if not found or v_tarefa.concluida_em is not null then return null; end if;
  -- Sem sessão (SQL direto, como a skill de tarefas) vale quem criou.
  v_ator := coalesce(auth.uid(), v_tarefa.criado_por);
  if v_ator is not distinct from new.user_id then return null; end if;
  if not exists (select 1 from tarefas.push_inscricoes p where p.user_id = new.user_id)
     or not privado.tarefas_pode(new.user_id, 'lista', v_tarefa.lista_id) then
    return null;
  end if;
  insert into tarefas.atribuicoes_fila (tarefa_id, user_id, ator_id)
  values (new.tarefa_id, new.user_id, v_ator)
  on conflict (tarefa_id, user_id) where enviado_em is null
  do update set ator_id = excluded.ator_id, criado_em = now(), reservado_em = null;
  return null;
end;
$$;

create trigger trg_responsaveis_notificar after insert on tarefas.tarefa_responsaveis
  for each row execute function privado.tarefas_enfileirar_atribuicao();

-- Reserva o que está na fila e devolve um pacote por pessoa. A reserva vence em 5 minutos: se o
-- envio falhar, a próxima rodada tenta de novo, por até 24 horas.
create function public.tarefas_atribuicoes_reservar()
returns table (user_id uuid, itens jsonb, inscricoes jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  -- Sai da fila o que deixou de valer antes de sair: pessoa removida da tarefa, tarefa concluída,
  -- permissão revogada ou aparelho desativado.
  delete from tarefas.atribuicoes_fila f
  where f.enviado_em is null
    and (f.criado_em <= now() - interval '24 hours'
      or not exists (
        select 1 from tarefas.tarefa_responsaveis r
        join tarefas.tarefas t on t.id = r.tarefa_id
        where r.tarefa_id = f.tarefa_id and r.user_id = f.user_id and t.concluida_em is null
          and privado.tarefas_pode(f.user_id, 'lista', t.lista_id)
          and exists (select 1 from tarefas.push_inscricoes p where p.user_id = f.user_id)));

  return query
  with reservadas as (
    update tarefas.atribuicoes_fila f set reservado_em = now()
    where f.enviado_em is null
      and (f.reservado_em is null or f.reservado_em < now() - interval '5 minutes')
    returning f.id, f.tarefa_id, f.user_id, f.ator_id, f.criado_em
  )
  select r.user_id,
    jsonb_agg(jsonb_build_object('fila_id', r.id, 'tarefa_id', t.id, 'lista_id', t.lista_id,
      'titulo', t.titulo, 'ator', a.nome, 'criador', c.nome) order by r.criado_em, r.id),
    (select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
       from tarefas.push_inscricoes p where p.user_id = r.user_id)
  from reservadas r
  join tarefas.tarefas t on t.id = r.tarefa_id
  left join tarefas.usuarios a on a.user_id = r.ator_id
  left join tarefas.usuarios c on c.user_id = t.criado_por
  group by r.user_id;
end;
$$;

create function public.tarefas_atribuicoes_marcar(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  update tarefas.atribuicoes_fila set enviado_em = now() where id = any (p_ids);
$$;

-- Um pacote por pessoa com as urgentes que devem aviso agora. Agrupar é o que segura o volume:
-- quem tem muitas urgentes abertas recebe um aviso, não um por tarefa.
create function public.tarefas_urgentes_pendentes()
returns table (user_id uuid, itens jsonb, inscricoes jsonb)
language sql stable security definer set search_path = '' as $$
  with abertas as (
    select r.user_id, t.id as tarefa_id, t.lista_id, t.titulo, t.data_entrega, hoje.vezes, hoje.ultimo,
      exists (select 1 from tarefas.urgentes_enviados e
        where e.tarefa_id = t.id and e.user_id = r.user_id and e.dia < privado.tarefas_hoje()) as dia_anterior
    from tarefas.tarefa_responsaveis r
    join tarefas.tarefas t on t.id = r.tarefa_id
    cross join lateral (
      select count(*)::int as vezes, max(e.enviado_em) as ultimo from tarefas.urgentes_enviados e
      where e.tarefa_id = t.id and e.user_id = r.user_id and e.dia = privado.tarefas_hoje()
    ) hoje
    where t.prioridade = 'urgente' and t.concluida_em is null
      and privado.tarefas_urgente_em_aviso(t.data_inicio, t.data_entrega, t.recorrencia)
      and privado.tarefas_pode(r.user_id, 'lista', t.lista_id)
  )
  select u.user_id,
    jsonb_agg(jsonb_build_object('tarefa_id', a.tarefa_id, 'lista_id', a.lista_id, 'titulo', a.titulo,
      'dias_para_vencer', a.data_entrega - privado.tarefas_hoje(), 'vez', a.vezes + 1)
      order by a.data_entrega nulls last, a.titulo),
    (select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
       from tarefas.push_inscricoes p where p.user_id = u.user_id)
  from abertas a
  join tarefas.usuarios u on u.user_id = a.user_id
  where u.ativo
    and privado.tarefas_urgente_devida(a.vezes, a.dia_anterior, a.ultimo, now())
    and exists (select 1 from tarefas.push_inscricoes p where p.user_id = u.user_id)
  group by u.user_id;
$$;

create function public.tarefas_urgentes_registrar(p_user uuid, p_tarefas uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into tarefas.urgentes_enviados (tarefa_id, user_id, dia, vez)
  select t.id, p_user, privado.tarefas_hoje(),
    1 + (select count(*) from tarefas.urgentes_enviados e
         where e.tarefa_id = t.id and e.user_id = p_user and e.dia = privado.tarefas_hoje())
  from unnest(p_tarefas) as t (id)
  on conflict do nothing;
$$;

-- A urgente em aviso já tem push próprio com o nome da tarefa. Contar de novo no resumo das 8h
-- faria o "1 por dia" virar 2. Urgente que ainda não entrou em aviso continua no resumo.
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
      and not (t.prioridade='urgente' and privado.tarefas_urgente_em_aviso(t.data_inicio,t.data_entrega,t.recorrencia))
    group by r.user_id
  ) select u.user_id,u.nome,c.atrasadas,c.hoje,c.amanha,
    (select jsonb_agg(jsonb_build_object('endpoint',p.endpoint,'p256dh',p.p256dh,'auth',p.auth)) from tarefas.push_inscricoes p where p.user_id=u.user_id)
  from tarefas.usuarios u join contagem c on c.user_id=u.user_id where u.ativo
    and exists(select 1 from tarefas.push_inscricoes p where p.user_id=u.user_id)
    and not exists(select 1 from tarefas.lembretes_enviados e where e.user_id=u.user_id and e.dia=privado.tarefas_hoje());
$$;

revoke all on function privado.tarefas_urgente_em_aviso(date, date, tarefas.recorrencia),
  privado.tarefas_urgente_devida(int, boolean, timestamptz, timestamptz),
  privado.tarefas_enfileirar_atribuicao() from public, anon, authenticated;
revoke all on function public.tarefas_atribuicoes_reservar(), public.tarefas_atribuicoes_marcar(bigint[]),
  public.tarefas_urgentes_pendentes(), public.tarefas_urgentes_registrar(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.tarefas_atribuicoes_reservar(), public.tarefas_atribuicoes_marcar(bigint[]),
  public.tarefas_urgentes_pendentes(), public.tarefas_urgentes_registrar(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;

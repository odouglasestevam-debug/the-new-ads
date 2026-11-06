-- Espaços que não são operação não notificam: Modelos guarda moldes que nunca são concluídos (uma
-- urgente ali avisaria para sempre) e Churn guarda tarefas de quem já saiu. Coluna em vez de nome
-- porque os espaços podem ser renomeados, e o filtro por nome quebraria sem nenhum aviso.
begin;

alter table tarefas.projetos add column notifica boolean not null default true;
comment on column tarefas.projetos.notifica is 'Falso em espaço que não é operação: as tarefas dele não geram push.';
update tarefas.projetos set notifica = false where nome in ('Modelos', 'Churn');

create function privado.tarefas_lista_notifica(p_lista uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select p.notifica from tarefas.listas l
    join tarefas.projetos p on p.id = l.projeto_id where l.id = p_lista), false);
$$;
revoke all on function privado.tarefas_lista_notifica(uuid) from public, anon, authenticated;

create or replace function privado.tarefas_enfileirar_atribuicao() returns trigger
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
     or not privado.tarefas_lista_notifica(v_tarefa.lista_id)
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

create or replace function public.tarefas_urgentes_pendentes()
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
      and privado.tarefas_lista_notifica(t.lista_id)
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
      and privado.tarefas_lista_notifica(t.lista_id)
      and privado.tarefas_pode(r.user_id,'lista',t.lista_id)
      and not (t.prioridade='urgente' and privado.tarefas_urgente_em_aviso(t.data_inicio,t.data_entrega,t.recorrencia))
    group by r.user_id
  ) select u.user_id,u.nome,c.atrasadas,c.hoje,c.amanha,
    (select jsonb_agg(jsonb_build_object('endpoint',p.endpoint,'p256dh',p.p256dh,'auth',p.auth)) from tarefas.push_inscricoes p where p.user_id=u.user_id)
  from tarefas.usuarios u join contagem c on c.user_id=u.user_id where u.ativo
    and exists(select 1 from tarefas.push_inscricoes p where p.user_id=u.user_id)
    and not exists(select 1 from tarefas.lembretes_enviados e where e.user_id=u.user_id and e.dia=privado.tarefas_hoje());
$$;

notify pgrst, 'reload schema';
commit;

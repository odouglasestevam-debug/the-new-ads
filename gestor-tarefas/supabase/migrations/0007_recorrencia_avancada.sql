-- Recorrência com regra, no estilo do ClickUp:
--   semanal: dias da semana escolhidos (0 = domingo ... 6 = sábado), a cada N semanas
--   mensal:  todo dia X (ou o último dia), ou toda 1ª/2ª/3ª/4ª/última <dia da semana>, a cada N meses
-- Sem regra, continua como antes (soma o intervalo à data de entrega). Tarefas existentes não mudam.

alter table tarefas.tarefas
  add column recorrencia_dias_semana smallint[],
  add column recorrencia_mensal text,
  add column recorrencia_dia_mes smallint,
  add column recorrencia_ordem smallint,
  add column recorrencia_dia_semana smallint,
  add constraint tarefas_rec_dias_semana_check check (
    recorrencia_dias_semana is null or (cardinality(recorrencia_dias_semana) between 1 and 7
      and recorrencia_dias_semana <@ array[0,1,2,3,4,5,6]::smallint[])),
  add constraint tarefas_rec_mensal_check check (
    recorrencia_mensal is null
    or (recorrencia_mensal = 'dia_mes' and (recorrencia_dia_mes between 1 and 31 or recorrencia_dia_mes = -1))
    or (recorrencia_mensal = 'dia_semana' and (recorrencia_ordem between 1 and 4 or recorrencia_ordem = -1)
        and recorrencia_dia_semana between 0 and 6));

-- Próxima data a partir da entrega atual (base). Semana começa no domingo, como no calendário da tela.
create function privado.tarefas_proxima_data(
  p_base date, p_rec tarefas.recorrencia, p_intervalo int, p_dias smallint[],
  p_mensal text, p_dia_mes int, p_ordem int, p_dia_semana int
) returns date
language plpgsql immutable set search_path = '' as $$
declare
  v_dia date; v_mes date; v_ultimo date; v_cand date;
  v_semana_base date := p_base - extract(dow from p_base)::int;
begin
  if p_rec = 'diaria' then return p_base + p_intervalo; end if;
  if p_rec = 'anual' then return (p_base + make_interval(years => p_intervalo))::date; end if;

  if p_rec = 'semanal' then
    if p_dias is null or cardinality(p_dias) = 0 then return p_base + 7 * p_intervalo; end if;
    for i in 1 .. 7 * p_intervalo + 7 loop
      v_dia := p_base + i;
      if extract(dow from v_dia)::smallint = any (p_dias)
         and ((v_dia - extract(dow from v_dia)::int) - v_semana_base) / 7 % p_intervalo = 0 then
        return v_dia;
      end if;
    end loop;
    return p_base + 7 * p_intervalo;
  end if;

  -- mensal
  if p_mensal is null then return (p_base + make_interval(months => p_intervalo))::date; end if;
  for k in 0 .. 36 loop
    v_mes := (date_trunc('month', p_base) + make_interval(months => k * p_intervalo))::date;
    v_ultimo := (v_mes + interval '1 month' - interval '1 day')::date;
    if p_mensal = 'dia_mes' then
      v_cand := case when p_dia_mes = -1 or p_dia_mes > extract(day from v_ultimo) then v_ultimo
                     else v_mes + (p_dia_mes - 1) end;
    elsif p_ordem = -1 then
      v_cand := v_ultimo - ((extract(dow from v_ultimo)::int - p_dia_semana + 7) % 7);
    else
      v_cand := v_mes + ((p_dia_semana - extract(dow from v_mes)::int + 7) % 7) + 7 * (p_ordem - 1);
    end if;
    if v_cand > p_base then return v_cand; end if;
  end loop;
  return (p_base + make_interval(months => p_intervalo))::date;
end;
$$;
grant execute on function privado.tarefas_proxima_data(date, tarefas.recorrencia, int, smallint[], text, int, int, int)
  to authenticated, service_role;

-- Gatilho: mesma lógica de antes, agora com a regra. O início anda o mesmo tanto de dias que a entrega.
create or replace function privado.tarefas_antes_gravar() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_tipo tarefas.tipo_status;
  v_base date;
  v_proxima date;
  v_status_aberto uuid;
  v_nova uuid;
begin
  new.atualizado_em := now();
  if new.tarefa_pai_id is not null then
    select lista_id into new.lista_id from tarefas.tarefas where id = new.tarefa_pai_id;
  end if;

  -- Regra que não combina com o tipo de recorrência é descartada, para não sobrar lixo ao trocar de tipo.
  if new.recorrencia is distinct from 'semanal' then new.recorrencia_dias_semana := null; end if;
  if new.recorrencia is distinct from 'mensal' then
    new.recorrencia_mensal := null; new.recorrencia_dia_mes := null;
    new.recorrencia_ordem := null; new.recorrencia_dia_semana := null;
  end if;

  select tipo into v_tipo from tarefas.status where id = new.status_id;
  if v_tipo = 'concluido' then
    if tg_op = 'INSERT' or old.concluida_em is null then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;

  if tg_op = 'UPDATE' and old.concluida_em is null and new.concluida_em is not null
     and new.recorrencia is not null and new.proxima_id is null then
    v_base := coalesce(new.data_entrega, privado.tarefas_hoje());
    v_proxima := privado.tarefas_proxima_data(v_base, new.recorrencia, new.recorrencia_intervalo,
      new.recorrencia_dias_semana, new.recorrencia_mensal, new.recorrencia_dia_mes,
      new.recorrencia_ordem, new.recorrencia_dia_semana);
    select id into v_status_aberto from tarefas.status where tipo = 'aberto' order by ordem limit 1;
    v_nova := gen_random_uuid();
    insert into tarefas.tarefas (id, lista_id, tarefa_pai_id, titulo, descricao, status_id, prioridade,
      data_inicio, data_entrega, recorrencia, recorrencia_intervalo, recorrencia_dias_semana,
      recorrencia_mensal, recorrencia_dia_mes, recorrencia_ordem, recorrencia_dia_semana, ordem, criado_por)
    values (v_nova, new.lista_id, new.tarefa_pai_id, new.titulo, new.descricao, v_status_aberto, new.prioridade,
      case when new.data_inicio is null then null else new.data_inicio + (v_proxima - v_base) end,
      v_proxima, new.recorrencia, new.recorrencia_intervalo, new.recorrencia_dias_semana,
      new.recorrencia_mensal, new.recorrencia_dia_mes, new.recorrencia_ordem, new.recorrencia_dia_semana,
      new.ordem, new.criado_por);
    insert into tarefas.tarefa_responsaveis (tarefa_id, user_id)
      select v_nova, user_id from tarefas.tarefa_responsaveis where tarefa_id = new.id;
    new.proxima_id := v_nova;
  end if;
  return new;
end;
$$;

-- As views guardam a lista de colunas de quando foram criadas: incluir as novas no fim.
create or replace view tarefas.tarefas_visao with (security_invoker = true) as
select
  t.id, t.lista_id, t.tarefa_pai_id, t.titulo, t.descricao, t.status_id, t.prioridade,
  t.data_inicio, t.data_entrega, t.concluida_em, t.recorrencia, t.recorrencia_intervalo, t.proxima_id,
  t.ordem, t.criado_por, t.criado_em, t.atualizado_em,
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
  end as situacao,
  t.recorrencia_dias_semana, t.recorrencia_mensal, t.recorrencia_dia_mes, t.recorrencia_ordem, t.recorrencia_dia_semana
from tarefas.tarefas t
join tarefas.status s on s.id = t.status_id
join tarefas.listas l on l.id = t.lista_id
join tarefas.projetos p on p.id = l.projeto_id;

create or replace view public.tarefas_tarefas with (security_invoker = true) as select * from tarefas.tarefas;
create or replace view public.tarefas_visao with (security_invoker = true) as select * from tarefas.tarefas_visao;

notify pgrst, 'reload schema';

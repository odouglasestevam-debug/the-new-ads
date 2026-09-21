-- Remarcar uma ocorrência não pode deslocar a série.
-- Exemplo: tarefa de segunda/quarta/sexta. A de segunda é empurrada para terça (deixa de contar
-- atraso na segunda e vence na terça), mas quarta e sexta continuam saindo no dia certo.
-- Para isso a série passa a ter âncora própria (recorrencia_base = a data que a regra previu para
-- esta ocorrência), separada de data_entrega, que é onde o usuário de fato colocou a tarefa.

alter table tarefas.tarefas add column recorrencia_base date;
comment on column tarefas.tarefas.recorrencia_base is
  'Data prevista pela regra para esta ocorrência. A próxima nasce daqui, não da entrega remarcada.';

-- Tarefas recorrentes que já existem começam ancoradas na entrega atual: nada muda para elas.
update tarefas.tarefas set recorrencia_base = data_entrega
  where recorrencia is not null and data_entrega is not null;

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

  -- Âncora da série. Só se mexe quando a recorrência nasce ou quando a regra muda: mudar a data de
  -- entrega de uma ocorrência é remarcar aquele dia, não reprogramar o que vem depois.
  if new.recorrencia is null then
    new.recorrencia_base := null;
  elsif tg_op = 'INSERT' then
    new.recorrencia_base := coalesce(new.recorrencia_base, new.data_entrega);
  elsif (new.recorrencia, new.recorrencia_intervalo, new.recorrencia_dias_semana, new.recorrencia_mensal,
         new.recorrencia_dia_mes, new.recorrencia_ordem, new.recorrencia_dia_semana)
        is distinct from
        (old.recorrencia, old.recorrencia_intervalo, old.recorrencia_dias_semana, old.recorrencia_mensal,
         old.recorrencia_dia_mes, old.recorrencia_ordem, old.recorrencia_dia_semana) then
    new.recorrencia_base := new.data_entrega;
  else
    new.recorrencia_base := coalesce(old.recorrencia_base, new.data_entrega);
  end if;

  select tipo into v_tipo from tarefas.status where id = new.status_id;
  if v_tipo = 'concluido' then
    if tg_op = 'INSERT' or old.concluida_em is null then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;

  if tg_op = 'UPDATE' and old.concluida_em is null and new.concluida_em is not null
     and new.recorrencia is not null and new.proxima_id is null then
    v_base := coalesce(new.recorrencia_base, new.data_entrega, privado.tarefas_hoje());
    v_proxima := privado.tarefas_proxima_data(v_base, new.recorrencia, new.recorrencia_intervalo,
      new.recorrencia_dias_semana, new.recorrencia_mensal, new.recorrencia_dia_mes,
      new.recorrencia_ordem, new.recorrencia_dia_semana);
    -- Se a ocorrência foi empurrada para depois da próxima data da série, essa data já passou:
    -- pula para a seguinte em vez de criar uma tarefa nascendo atrasada.
    for i in 1 .. 60 loop
      exit when new.data_entrega is null or v_proxima > new.data_entrega;
      v_proxima := privado.tarefas_proxima_data(v_proxima, new.recorrencia, new.recorrencia_intervalo,
        new.recorrencia_dias_semana, new.recorrencia_mensal, new.recorrencia_dia_mes,
        new.recorrencia_ordem, new.recorrencia_dia_semana);
    end loop;
    select id into v_status_aberto from tarefas.status where tipo = 'aberto' order by ordem limit 1;
    v_nova := gen_random_uuid();
    insert into tarefas.tarefas (id, lista_id, tarefa_pai_id, titulo, descricao, status_id, prioridade,
      data_inicio, data_entrega, recorrencia, recorrencia_intervalo, recorrencia_dias_semana,
      recorrencia_mensal, recorrencia_dia_mes, recorrencia_ordem, recorrencia_dia_semana,
      recorrencia_base, ordem, criado_por)
    values (v_nova, new.lista_id, new.tarefa_pai_id, new.titulo, new.descricao, v_status_aberto, new.prioridade,
      case when new.data_inicio is null then null else new.data_inicio + (v_proxima - v_base) end,
      v_proxima, new.recorrencia, new.recorrencia_intervalo, new.recorrencia_dias_semana,
      new.recorrencia_mensal, new.recorrencia_dia_mes, new.recorrencia_ordem, new.recorrencia_dia_semana,
      v_proxima, new.ordem, new.criado_por);
    insert into tarefas.tarefa_responsaveis (tarefa_id, user_id)
      select v_nova, user_id from tarefas.tarefa_responsaveis where tarefa_id = new.id;
    new.proxima_id := v_nova;
  end if;
  return new;
end;
$$;

-- A view guarda a lista de colunas de quando foi criada: a nova entra no fim.
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
  t.recorrencia_dias_semana, t.recorrencia_mensal, t.recorrencia_dia_mes, t.recorrencia_ordem, t.recorrencia_dia_semana,
  t.recorrencia_base
from tarefas.tarefas t
join tarefas.status s on s.id = t.status_id
join tarefas.listas l on l.id = t.lista_id
join tarefas.projetos p on p.id = l.projeto_id;

create or replace view public.tarefas_tarefas with (security_invoker = true) as select * from tarefas.tarefas;
create or replace view public.tarefas_visao with (security_invoker = true) as select * from tarefas.tarefas_visao;

notify pgrst, 'reload schema';

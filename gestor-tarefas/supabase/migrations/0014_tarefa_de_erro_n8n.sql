-- Erro de qualquer fluxo do n8n em uso vira tarefa (amplia a 0012, que só via o monitor de tracking).
-- A Edge Function alertas-para-tarefas lê as execuções com erro e decide o que vira tarefa. Aqui fica a
-- memória por fluxo (até qual execução já foi vista) e a regra de criar ou comentar.

create table tarefas.n8n_erro_estado (
  workflow_id text primary key,
  ultima_exec bigint not null default 0,
  tarefa_id uuid references tarefas.tarefas(id) on delete set null,
  ultimo_comentario date,
  atualizado_em timestamptz not null default now()
);
alter table tarefas.n8n_erro_estado enable row level security;

-- Início no dia atual e entrega 2 dias úteis depois, nunca em sábado ou domingo. Responsável: Douglas.
create or replace function tarefas.criar_tarefa_de_erro(p_lista_id uuid, p_titulo text, p_descricao text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_douglas uuid;
  v_tarefa uuid;
  v_inicio date := (now() at time zone 'America/Sao_Paulo')::date;
  v_entrega date;
  v_uteis int := 0;
begin
  select user_id into strict v_douglas from tarefas.usuarios where email = 'odouglasestevam@gmail.com';

  while extract(isodow from v_inicio) > 5 loop
    v_inicio := v_inicio + 1;
  end loop;
  v_entrega := v_inicio;
  while v_uteis < 2 loop
    v_entrega := v_entrega + 1;
    if extract(isodow from v_entrega) <= 5 then
      v_uteis := v_uteis + 1;
    end if;
  end loop;

  insert into tarefas.tarefas (lista_id, titulo, descricao, status_id, prioridade, data_inicio, data_entrega, criado_por)
  values (p_lista_id, p_titulo, p_descricao,
    (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1),
    'normal', v_inicio, v_entrega, v_douglas)
  returning id into v_tarefa;

  insert into tarefas.tarefa_responsaveis (tarefa_id, user_id) values (v_tarefa, v_douglas);
  return v_tarefa;
end $$;
revoke all on function tarefas.criar_tarefa_de_erro(uuid, text, text) from public, anon, authenticated;

create or replace function public.tarefa_de_alerta(
  p_alerta_id uuid, p_chave text, p_lista_id uuid, p_titulo text, p_mensagem text, p_aberto_em timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quando text := to_char(p_aberto_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  v_tarefa uuid;
begin
  if exists (select 1 from tarefas.alerta_tarefa where alerta_id = p_alerta_id) then
    return jsonb_build_object('acao', 'ja_tratado');
  end if;

  select id into v_tarefa from tarefas.tarefas
   where lista_id = p_lista_id and concluida_em is null and starts_with(titulo, 'Analisar e resolver falha no tracking')
   order by criado_em limit 1;

  if v_tarefa is not null then
    insert into tarefas.comentarios (tarefa_id, autor_id, texto)
    values (v_tarefa, (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com'),
      'Novo alerta em ' || v_quando || ': ' || p_mensagem);
    insert into tarefas.alerta_tarefa (alerta_id, chave, tarefa_id, acao) values (p_alerta_id, p_chave, v_tarefa, 'comentada');
    return jsonb_build_object('acao', 'comentada', 'tarefa_id', v_tarefa);
  end if;

  v_tarefa := tarefas.criar_tarefa_de_erro(p_lista_id, p_titulo,
    'Alerta do TNA Alertas em ' || v_quando || ': ' || p_mensagem || E'\n\nConferir o fluxo no n8n e reenviar os eventos perdidos.');
  insert into tarefas.alerta_tarefa (alerta_id, chave, tarefa_id, acao) values (p_alerta_id, p_chave, v_tarefa, 'criada');
  return jsonb_build_object('acao', 'criada', 'tarefa_id', v_tarefa);
end $$;

create or replace function public.n8n_erro_marcas()
returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(workflow_id, ultima_exec), '{}'::jsonb) from tarefas.n8n_erro_estado;
$$;

-- Avança a marca do fluxo e, se p_virar_tarefa, cria a tarefa. Com tarefa aberta do mesmo assunto,
-- comenta no máximo uma vez por dia, para fluxo que falha em sequência não encher a tarefa.
create or replace function public.n8n_erro_registrar(
  p_workflow_id text, p_ultima_exec bigint, p_virar_tarefa boolean,
  p_lista_id uuid, p_titulo text, p_prefixo text, p_texto text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_estado tarefas.n8n_erro_estado;
  v_tarefa uuid;
begin
  insert into tarefas.n8n_erro_estado (workflow_id, ultima_exec) values (p_workflow_id, p_ultima_exec)
  on conflict (workflow_id) do update
    set ultima_exec = greatest(tarefas.n8n_erro_estado.ultima_exec, excluded.ultima_exec), atualizado_em = now()
  returning * into v_estado;

  if not p_virar_tarefa then
    return jsonb_build_object('acao', 'ignorado');
  end if;

  select id into v_tarefa from tarefas.tarefas
   where lista_id = p_lista_id and concluida_em is null and starts_with(titulo, p_prefixo)
   order by criado_em limit 1;

  if v_tarefa is null then
    v_tarefa := tarefas.criar_tarefa_de_erro(p_lista_id, p_titulo,
      p_texto || E'\n\nConferir o fluxo no n8n e reprocessar o que tiver falhado.');
    update tarefas.n8n_erro_estado set tarefa_id = v_tarefa, ultimo_comentario = v_hoje where workflow_id = p_workflow_id;
    return jsonb_build_object('acao', 'criada', 'tarefa_id', v_tarefa);
  end if;

  if v_estado.ultimo_comentario is not distinct from v_hoje then
    return jsonb_build_object('acao', 'ja_comentada_hoje', 'tarefa_id', v_tarefa);
  end if;

  insert into tarefas.comentarios (tarefa_id, autor_id, texto)
  values (v_tarefa, (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com'), p_texto);
  update tarefas.n8n_erro_estado set tarefa_id = v_tarefa, ultimo_comentario = v_hoje where workflow_id = p_workflow_id;
  return jsonb_build_object('acao', 'comentada', 'tarefa_id', v_tarefa);
end $$;

revoke all on function public.n8n_erro_marcas() from public, anon, authenticated;
revoke all on function public.n8n_erro_registrar(text, bigint, boolean, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.n8n_erro_marcas() to service_role;
grant execute on function public.n8n_erro_registrar(text, bigint, boolean, uuid, text, text, text) to service_role;

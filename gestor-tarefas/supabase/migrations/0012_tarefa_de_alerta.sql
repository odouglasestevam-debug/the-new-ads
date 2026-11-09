-- Erro de n8n apontado pelo TNA Alertas vira tarefa no gestor (Edge Function alertas-para-tarefas).
-- Cada ocorrência do alerta é tratada uma vez só, registrada em alerta_tarefa: concluir a tarefa com
-- o alerta ainda aberto não cria outra. Se o cliente já tem tarefa aberta desse tipo, o erro novo
-- entra como comentário nela.

create table tarefas.alerta_tarefa (
  alerta_id uuid primary key,
  chave text not null,
  tarefa_id uuid references tarefas.tarefas(id) on delete set null,
  acao text not null check (acao in ('criada', 'comentada')),
  criado_em timestamptz not null default now()
);
alter table tarefas.alerta_tarefa enable row level security;

create or replace function public.tarefa_de_alerta(
  p_alerta_id uuid, p_chave text, p_lista_id uuid, p_titulo text, p_mensagem text, p_aberto_em timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quando text := to_char(p_aberto_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  v_douglas uuid;
  v_tarefa uuid;
  v_inicio date := (now() at time zone 'America/Sao_Paulo')::date;
  v_entrega date;
  v_uteis int := 0;
begin
  if exists (select 1 from tarefas.alerta_tarefa where alerta_id = p_alerta_id) then
    return jsonb_build_object('acao', 'ja_tratado');
  end if;

  select user_id into strict v_douglas from tarefas.usuarios where email = 'odouglasestevam@gmail.com';

  select id into v_tarefa from tarefas.tarefas
   where lista_id = p_lista_id and concluida_em is null and titulo ilike 'Analisar e resolver falha no tracking%'
   order by criado_em limit 1;

  if v_tarefa is not null then
    insert into tarefas.comentarios (tarefa_id, autor_id, texto)
    values (v_tarefa, v_douglas, 'Novo alerta em ' || v_quando || ': ' || p_mensagem);
    insert into tarefas.alerta_tarefa (alerta_id, chave, tarefa_id, acao) values (p_alerta_id, p_chave, v_tarefa, 'comentada');
    return jsonb_build_object('acao', 'comentada', 'tarefa_id', v_tarefa);
  end if;

  -- Início no dia atual e entrega 2 dias úteis depois. Nunca agenda em sábado ou domingo.
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
  values (p_lista_id, p_titulo,
    'Alerta do TNA Alertas em ' || v_quando || ': ' || p_mensagem || E'\n\nConferir o fluxo no n8n e reenviar os eventos perdidos.',
    (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1),
    'normal', v_inicio, v_entrega, v_douglas)
  returning id into v_tarefa;

  insert into tarefas.tarefa_responsaveis (tarefa_id, user_id) values (v_tarefa, v_douglas);
  insert into tarefas.alerta_tarefa (alerta_id, chave, tarefa_id, acao) values (p_alerta_id, p_chave, v_tarefa, 'criada');
  return jsonb_build_object('acao', 'criada', 'tarefa_id', v_tarefa, 'inicio', v_inicio, 'entrega', v_entrega);
end $$;

revoke all on function public.tarefa_de_alerta(uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.tarefa_de_alerta(uuid, text, uuid, text, text, timestamptz) to service_role;

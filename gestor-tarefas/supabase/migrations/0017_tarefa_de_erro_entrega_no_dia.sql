-- Tarefa criada por alerta (TNA Alertas) ou por erro de fluxo do n8n passa a vencer no mesmo dia.
-- Pedido do Douglas em 10/11/2026: com entrega em 2 dias úteis ela não aparecia na Central, que por
-- padrão mostra só atrasadas e as que vencem hoje. Em sábado ou domingo vai para a segunda-feira.
-- Vale para os dois caminhos, porque tarefa_de_alerta e n8n_erro_registrar criam por esta função.
create or replace function tarefas.criar_tarefa_de_erro(p_lista_id uuid, p_titulo text, p_descricao text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_douglas uuid;
  v_tarefa uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select user_id into strict v_douglas from tarefas.usuarios where email = 'odouglasestevam@gmail.com';

  while extract(isodow from v_dia) > 5 loop
    v_dia := v_dia + 1;
  end loop;

  insert into tarefas.tarefas (lista_id, titulo, descricao, status_id, prioridade, data_inicio, data_entrega, criado_por)
  values (p_lista_id, p_titulo, p_descricao,
    (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1),
    'normal', v_dia, v_dia, v_douglas)
  returning id into v_tarefa;

  insert into tarefas.tarefa_responsaveis (tarefa_id, user_id) values (v_tarefa, v_douglas);
  return v_tarefa;
end $$;
revoke all on function tarefas.criar_tarefa_de_erro(uuid, text, text) from public, anon, authenticated;

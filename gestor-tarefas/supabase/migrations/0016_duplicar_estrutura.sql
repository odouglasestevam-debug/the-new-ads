-- Duplicar espaço, pasta ou lista pelo menu ⋯ (pedido do Douglas para abrir cliente novo pela tela).
-- Tudo numa função só para a cópia ser atômica: ou sai inteira, ou nada fica pela metade.
-- Roda com a permissão de quem chama (security invoker): o RLS das tabelas continua valendo, e a
-- própria função recusa quem não é admin, porque mexer na estrutura é coisa de admin.
--
-- Padrão (p_manter_estado = false) é o mesmo da skill onboarding-cliente: tarefa volta para o primeiro
-- status aberto e fica sem data; recorrente nasce com a próxima data da regra. Com p_manter_estado,
-- status e datas são copiados como estão. Concluídas só entram com p_concluidas. Subtarefa só entra
-- junto com a mãe. Comentários não são copiados. Responsável inativo não é copiado.
--
-- Aviso de atribuição: cada responsável copiado entra na fila normal (gatilho da 0009/0011), que agrupa
-- num push por pessoa e não avisa em espaço com notifica = false (Modelos, Churn) nem autoatribuição.

create function public.tarefas_duplicar(
  p_tipo text, p_id uuid, p_nome text,
  p_projeto uuid default null, p_pasta uuid default null,
  p_tarefas boolean default true, p_responsaveis boolean default true,
  p_manter_estado boolean default false, p_concluidas boolean default false
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_nome text := nullif(btrim(p_nome), '');
  v_aberto uuid := (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1);
  v_hoje date := privado.tarefas_hoje();
  v_raiz uuid;
  v_projeto uuid;
  v_origem uuid[] := '{}';
  v_pastas jsonb := '{}';
  v_listas jsonb := '{}';
  v_tarefas jsonb := '{}';
  v_novo uuid;
  v_n int := 0;
  r record;
begin
  if not privado.tarefas_admin() then raise exception 'Só admin pode duplicar espaço, pasta ou lista.'; end if;
  if v_nome is null then raise exception 'Dê um nome para a cópia.'; end if;
  if p_tipo not in ('projeto', 'pasta', 'lista') then raise exception 'Tipo inválido para duplicar.'; end if;

  -- Destino de pasta e lista: raiz de um espaço ou dentro de uma pasta desse espaço.
  if p_tipo in ('pasta', 'lista') then
    if p_projeto is null or not exists (select 1 from tarefas.projetos where id = p_projeto) then
      raise exception 'Escolha para onde vai a cópia.';
    end if;
    if p_pasta is not null and not exists (select 1 from tarefas.pastas where id = p_pasta and projeto_id = p_projeto) then
      raise exception 'A pasta de destino não está nesse espaço.';
    end if;
    v_projeto := p_projeto;
  end if;

  if p_tipo = 'projeto' then
    if not exists (select 1 from tarefas.projetos where id = p_id) then raise exception 'Origem não encontrada.'; end if;
    if exists (select 1 from tarefas.projetos where lower(btrim(nome)) = lower(v_nome)) then
      raise exception 'Já existe um espaço chamado "%".', v_nome;
    end if;
    insert into tarefas.projetos (nome, cor, notifica)
      select v_nome, cor, notifica from tarefas.projetos where id = p_id
      returning id into v_raiz;
    v_projeto := v_raiz;
    for r in
      with recursive arvore as (
        select id, pasta_pai_id, nome, ordem, 1 as nivel from tarefas.pastas where projeto_id = p_id and pasta_pai_id is null
        union all
        select p.id, p.pasta_pai_id, p.nome, p.ordem, a.nivel + 1 from tarefas.pastas p join arvore a on p.pasta_pai_id = a.id
      ) select * from arvore order by nivel, ordem
    loop
      insert into tarefas.pastas (projeto_id, pasta_pai_id, nome, ordem)
        values (v_projeto, (v_pastas ->> r.pasta_pai_id::text)::uuid, r.nome, r.ordem) returning id into v_novo;
      v_pastas := v_pastas || jsonb_build_object(r.id::text, v_novo);
    end loop;
    for r in select * from tarefas.listas where projeto_id = p_id order by ordem loop
      insert into tarefas.listas (projeto_id, pasta_id, nome, ordem)
        values (v_projeto, (v_pastas ->> r.pasta_id::text)::uuid, r.nome, r.ordem) returning id into v_novo;
      v_listas := v_listas || jsonb_build_object(r.id::text, v_novo);
    end loop;

  elsif p_tipo = 'pasta' then
    if not exists (select 1 from tarefas.pastas where id = p_id) then raise exception 'Origem não encontrada.'; end if;
    v_origem := array(
      with recursive arvore as (
        select id from tarefas.pastas where id = p_id
        union all
        select p.id from tarefas.pastas p join arvore a on p.pasta_pai_id = a.id
      ) select id from arvore);
    if p_pasta = any(v_origem) then raise exception 'Uma pasta não pode ser copiada para dentro dela mesma.'; end if;
    if exists (select 1 from tarefas.pastas where projeto_id = v_projeto and pasta_pai_id is not distinct from p_pasta
               and lower(btrim(nome)) = lower(v_nome)) then
      raise exception 'Já existe uma pasta chamada "%" nesse lugar.', v_nome;
    end if;
    insert into tarefas.pastas (projeto_id, pasta_pai_id, nome) values (v_projeto, p_pasta, v_nome) returning id into v_raiz;
    v_pastas := jsonb_build_object(p_id::text, v_raiz);
    for r in
      with recursive arvore as (
        select id, pasta_pai_id, nome, ordem, 1 as nivel from tarefas.pastas where pasta_pai_id = p_id
        union all
        select p.id, p.pasta_pai_id, p.nome, p.ordem, a.nivel + 1 from tarefas.pastas p join arvore a on p.pasta_pai_id = a.id
      ) select * from arvore order by nivel, ordem
    loop
      insert into tarefas.pastas (projeto_id, pasta_pai_id, nome, ordem)
        values (v_projeto, (v_pastas ->> r.pasta_pai_id::text)::uuid, r.nome, r.ordem) returning id into v_novo;
      v_pastas := v_pastas || jsonb_build_object(r.id::text, v_novo);
    end loop;
    for r in select * from tarefas.listas where pasta_id = any(v_origem) order by ordem loop
      insert into tarefas.listas (projeto_id, pasta_id, nome, ordem)
        values (v_projeto, (v_pastas ->> r.pasta_id::text)::uuid, r.nome, r.ordem) returning id into v_novo;
      v_listas := v_listas || jsonb_build_object(r.id::text, v_novo);
    end loop;

  else
    if not exists (select 1 from tarefas.listas where id = p_id) then raise exception 'Origem não encontrada.'; end if;
    if exists (select 1 from tarefas.listas where projeto_id = v_projeto and pasta_id is not distinct from p_pasta
               and lower(btrim(nome)) = lower(v_nome)) then
      raise exception 'Já existe uma lista chamada "%" nesse lugar.', v_nome;
    end if;
    insert into tarefas.listas (projeto_id, pasta_id, nome) values (v_projeto, p_pasta, v_nome) returning id into v_raiz;
    v_listas := jsonb_build_object(p_id::text, v_raiz);
  end if;

  if p_tarefas then
    -- Mães antes das subtarefas, para a subtarefa já achar a mãe copiada.
    for r in
      select t.* from tarefas.tarefas t
      where t.lista_id::text in (select jsonb_object_keys(v_listas))
        and (p_concluidas or t.concluida_em is null)
      order by (t.tarefa_pai_id is not null), t.ordem, t.criado_em
    loop
      if r.tarefa_pai_id is not null and not (v_tarefas ? r.tarefa_pai_id::text) then continue; end if;
      insert into tarefas.tarefas (lista_id, tarefa_pai_id, titulo, descricao, status_id, prioridade,
        data_inicio, data_entrega, recorrencia, recorrencia_intervalo, recorrencia_dias_semana, recorrencia_mensal,
        recorrencia_dia_mes, recorrencia_ordem, recorrencia_dia_semana, recorrencia_base, ordem)
      values ((v_listas ->> r.lista_id::text)::uuid, (v_tarefas ->> r.tarefa_pai_id::text)::uuid, r.titulo, r.descricao,
        case when p_manter_estado then r.status_id else v_aberto end, r.prioridade,
        case when p_manter_estado then r.data_inicio end,
        case when p_manter_estado then r.data_entrega
             when r.recorrencia is not null then privado.tarefas_proxima_data(v_hoje - 1, r.recorrencia, r.recorrencia_intervalo,
               r.recorrencia_dias_semana, r.recorrencia_mensal, r.recorrencia_dia_mes, r.recorrencia_ordem, r.recorrencia_dia_semana)
        end,
        r.recorrencia, r.recorrencia_intervalo, r.recorrencia_dias_semana, r.recorrencia_mensal,
        r.recorrencia_dia_mes, r.recorrencia_ordem, r.recorrencia_dia_semana,
        case when p_manter_estado then r.recorrencia_base end, r.ordem)
      returning id into v_novo;
      v_tarefas := v_tarefas || jsonb_build_object(r.id::text, v_novo);
      v_n := v_n + 1;
      if p_responsaveis then
        insert into tarefas.tarefa_responsaveis (tarefa_id, user_id)
          select v_novo, x.user_id from tarefas.tarefa_responsaveis x
          join tarefas.usuarios u on u.user_id = x.user_id and u.ativo
          where x.tarefa_id = r.id;
      end if;
    end loop;
  end if;

  return jsonb_build_object('id', v_raiz, 'tipo', p_tipo,
    'pastas', (select count(*) from jsonb_object_keys(v_pastas)),
    'listas', (select count(*) from jsonb_object_keys(v_listas)),
    'tarefas', v_n);
end;
$$;

revoke all on function public.tarefas_duplicar(text, uuid, text, uuid, uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.tarefas_duplicar(text, uuid, text, uuid, uuid, boolean, boolean, boolean, boolean) to authenticated;

-- Mover espaço. Ele vira uma pasta com o mesmo nome no destino (raiz de outro espaço ou uma pasta dele)
-- e leva junto todas as pastas, subpastas, listas e tarefas. Depois o espaço vazio é apagado.
-- Pasta e lista já movem pelo próprio update: tarefas_validar_pasta/lista acertam o espaço e
-- tarefas_propagar_projeto_pasta leva o conteúdo junto.
-- Acesso: liberação de membro no espaço de origem deixa de valer (vale a do destino); bloqueios de
-- pasta e lista continuam, porque são por id.
create function public.tarefas_mover_espaco(p_espaco uuid, p_destino_projeto uuid, p_destino_pasta uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_projeto uuid := p_destino_projeto;
  v_nova uuid;
begin
  if not privado.tarefas_admin() then raise exception 'Só administrador move espaços.'; end if;
  select nome into v_nome from tarefas.projetos where id = p_espaco for update;
  if not found then raise exception 'Espaço não encontrado.'; end if;
  if p_destino_pasta is not null then
    select projeto_id into v_projeto from tarefas.pastas where id = p_destino_pasta;
    if not found then raise exception 'Pasta de destino não encontrada.'; end if;
  end if;
  if v_projeto is null or not exists (select 1 from tarefas.projetos where id = v_projeto) then
    raise exception 'Espaço de destino não encontrado.';
  end if;
  if v_projeto = p_espaco then raise exception 'Um espaço não pode ficar dentro dele mesmo.'; end if;

  insert into tarefas.pastas (projeto_id, pasta_pai_id, nome) values (v_projeto, p_destino_pasta, v_nome)
    returning id into v_nova;
  -- projeto_id vai no SET para disparar a propagação (gatilho "after update of projeto_id").
  update tarefas.pastas set pasta_pai_id = v_nova, projeto_id = v_projeto
    where projeto_id = p_espaco and pasta_pai_id is null;
  update tarefas.listas set pasta_id = v_nova, projeto_id = v_projeto
    where projeto_id = p_espaco and pasta_id is null;
  if exists (select 1 from tarefas.pastas where projeto_id = p_espaco)
     or exists (select 1 from tarefas.listas where projeto_id = p_espaco) then
    raise exception 'Sobrou conteúdo no espaço de origem. Nada foi movido.';
  end if;
  delete from tarefas.projetos where id = p_espaco;
  return v_nova;
end;
$$;
revoke all on function public.tarefas_mover_espaco(uuid, uuid, uuid) from public, anon;
grant execute on function public.tarefas_mover_espaco(uuid, uuid, uuid) to authenticated;

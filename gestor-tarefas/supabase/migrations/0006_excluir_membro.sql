-- Excluir membro do gestor. Remove o cadastro, as permissões, os aparelhos de push e as atribuições
-- (cascata de tarefas.usuarios). Comentários e tarefas criadas continuam, com o autor preservado no Auth.
-- A conta de login não é apagada: pode ser a mesma usada no CRM.
create function public.tarefas_excluir_membro(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.tarefas_admin() then raise exception 'Só administrador exclui membros.'; end if;
  if p_user = auth.uid() then raise exception 'Você não pode excluir a si mesmo.'; end if;
  delete from tarefas.usuarios where user_id = p_user;
  if not found then raise exception 'Membro não encontrado.'; end if;
  -- O trigger adiado trg_usuarios_manter_admin recusa a exclusão do último admin ativo.
end;
$$;
revoke all on function public.tarefas_excluir_membro(uuid) from public, anon;
grant execute on function public.tarefas_excluir_membro(uuid) to authenticated;

-- Apenas tabelas CRM; não altera Auth nem tabelas do gestor de tarefas.
alter table public.conversas add constraint conversas_id_empresa_unique unique (id, empresa_id);
alter table public.mensagens add constraint mensagens_conversa_empresa_fkey
  foreign key (conversa_id, empresa_id) references public.conversas(id, empresa_id) on delete cascade;
create index mensagens_empresa_idx on public.mensagens(empresa_id);
create index mensagens_paginacao_idx on public.mensagens(conversa_id, criado_em desc, id desc);
create index mensagens_autor_recentes_idx on public.mensagens(autor_id, criado_em desc) where autor_id is not null;

create function public.marcar_conversa_lida_ate(p_conversa uuid, p_mensagem uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_quando timestamptz;
begin
  if not exists(select 1 from public.conversas where id=p_conversa and privado.pode_ver_lead_id(lead_id)) then
    raise exception 'sem_acesso' using errcode='42501';
  end if;
  select criado_em into v_quando from public.mensagens where id=p_mensagem and conversa_id=p_conversa;
  if v_quando is null then raise exception 'mensagem_invalida'; end if;
  -- Bloqueia a conversa antes de contar; recebimento também atualiza a mesma linha.
  perform 1 from public.conversas where id=p_conversa for update;
  update public.conversas set nao_lidas=(select count(*) from public.mensagens
    where conversa_id=p_conversa and direcao='entrada' and criado_em>v_quando) where id=p_conversa;
end;
$$;
revoke all on function public.marcar_conversa_lida_ate(uuid,uuid) from public, anon;
grant execute on function public.marcar_conversa_lida_ate(uuid,uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversas') then
      alter publication supabase_realtime add table public.conversas;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mensagens') then
      alter publication supabase_realtime add table public.mensagens;
    end if;
  end if;
end $$;

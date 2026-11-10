-- Filtros salvos: cada pessoa guarda as combinações de filtro que usa sempre (ex.: "Urgentes do Pedro").
-- Ficam no banco, e não no navegador, para aparecer igual no computador e no app do celular.
-- São pessoais: ninguém vê nem altera o filtro salvo de outra pessoa, nem o admin.
-- O conteúdo é o mesmo objeto de filtro da tela (status, responsável, prioridade, prazo, local, datas,
-- combinação E/OU e concluídas). A tela descarta o que não existir mais ao aplicar.

create table tarefas.filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references tarefas.usuarios (user_id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  filtro jsonb not null check (jsonb_typeof(filtro) = 'object' and pg_column_size(filtro) <= 8192),
  criado_em timestamptz not null default now()
);
create unique index filtros_salvos_nome_idx on tarefas.filtros_salvos (user_id, lower(trim(nome)));

alter table tarefas.filtros_salvos enable row level security;
revoke all on tarefas.filtros_salvos from anon, public;
grant select, insert, update, delete on tarefas.filtros_salvos to authenticated;
grant all on tarefas.filtros_salvos to service_role;

create policy filtros_salvos_proprio on tarefas.filtros_salvos for all to authenticated
  using (user_id = (select auth.uid()) and privado.tarefas_usuario())
  with check (user_id = (select auth.uid()) and privado.tarefas_usuario());

-- Mesmo padrão da 0003: a API só enxerga public, o RLS da tabela continua valendo.
create view public.tarefas_filtros_salvos with (security_invoker = true) as select * from tarefas.filtros_salvos;
revoke all on public.tarefas_filtros_salvos from anon, public;
grant select, insert, update, delete on public.tarefas_filtros_salvos to authenticated;

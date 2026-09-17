-- A API do Supabase só expõe o schema public. Em vez de depender da configuração do painel,
-- o gestor acessa as tabelas de tarefas.* por views em public com security_invoker:
-- quem consulta continua sujeito ao RLS e aos grants das tabelas originais.

create view public.tarefas_usuarios with (security_invoker = true) as select * from tarefas.usuarios;
create view public.tarefas_projetos with (security_invoker = true) as select * from tarefas.projetos;
create view public.tarefas_pastas with (security_invoker = true) as select * from tarefas.pastas;
create view public.tarefas_listas with (security_invoker = true) as select * from tarefas.listas;
create view public.tarefas_status with (security_invoker = true) as select * from tarefas.status;
create view public.tarefas_tarefas with (security_invoker = true) as select * from tarefas.tarefas;
create view public.tarefas_responsaveis with (security_invoker = true) as select * from tarefas.tarefa_responsaveis;
create view public.tarefas_comentarios with (security_invoker = true) as select * from tarefas.comentarios;
create view public.tarefas_push_inscricoes with (security_invoker = true) as select * from tarefas.push_inscricoes;
create view public.tarefas_visao with (security_invoker = true) as select * from tarefas.tarefas_visao;

revoke all on public.tarefas_usuarios, public.tarefas_projetos, public.tarefas_pastas, public.tarefas_listas,
  public.tarefas_status, public.tarefas_tarefas, public.tarefas_responsaveis, public.tarefas_comentarios,
  public.tarefas_push_inscricoes, public.tarefas_visao from anon, public;

grant select on public.tarefas_usuarios, public.tarefas_projetos, public.tarefas_pastas, public.tarefas_listas,
  public.tarefas_status, public.tarefas_tarefas, public.tarefas_responsaveis, public.tarefas_comentarios,
  public.tarefas_push_inscricoes, public.tarefas_visao to authenticated;
grant insert, update, delete on public.tarefas_projetos, public.tarefas_pastas, public.tarefas_listas,
  public.tarefas_status, public.tarefas_tarefas, public.tarefas_responsaveis, public.tarefas_comentarios,
  public.tarefas_push_inscricoes to authenticated;
grant update (nome, admin, ativo) on public.tarefas_usuarios to authenticated;

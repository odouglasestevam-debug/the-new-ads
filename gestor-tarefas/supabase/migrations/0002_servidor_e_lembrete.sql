-- Funções que as Edge Functions do gestor usam (só service_role) e o agendamento do lembrete diário.

-- Quem é admin do gestor (a Edge Function confere antes de criar usuário).
create function public.tarefas_eh_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from tarefas.usuarios where user_id = p_user and ativo and admin);
$$;

create function public.tarefas_adicionar_usuario(p_user uuid, p_nome text, p_email text, p_admin boolean) returns void
language sql security definer set search_path = '' as $$
  insert into tarefas.usuarios (user_id, nome, email, admin, ativo)
  values (p_user, trim(p_nome), lower(trim(p_email)), p_admin, true)
  on conflict (user_id) do update set nome = excluded.nome, admin = excluded.admin, ativo = true;
$$;

-- Um resumo por usuário ativo com aparelho inscrito e alguma tarefa atrasada, de hoje ou de amanhã,
-- que ainda não recebeu lembrete hoje.
create function public.tarefas_lembretes_pendentes()
returns table (user_id uuid, nome text, atrasadas int, hoje int, amanha int, inscricoes jsonb)
language sql stable security definer set search_path = '' as $$
  with contagem as (
    select r.user_id,
      count(*) filter (where t.data_entrega < privado.tarefas_hoje())::int as atrasadas,
      count(*) filter (where t.data_entrega = privado.tarefas_hoje())::int as hoje,
      count(*) filter (where t.data_entrega = privado.tarefas_hoje() + 1)::int as amanha
    from tarefas.tarefa_responsaveis r
    join tarefas.tarefas t on t.id = r.tarefa_id
    where t.concluida_em is null and t.data_entrega <= privado.tarefas_hoje() + 1
    group by r.user_id
  )
  select u.user_id, u.nome, c.atrasadas, c.hoje, c.amanha,
    (select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
       from tarefas.push_inscricoes p where p.user_id = u.user_id)
  from tarefas.usuarios u
  join contagem c on c.user_id = u.user_id
  where u.ativo
    and exists (select 1 from tarefas.push_inscricoes p where p.user_id = u.user_id)
    and not exists (select 1 from tarefas.lembretes_enviados e where e.user_id = u.user_id and e.dia = privado.tarefas_hoje());
$$;

create function public.tarefas_registrar_lembrete(p_user uuid, p_resumo jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into tarefas.lembretes_enviados (user_id, dia, resumo)
  values (p_user, privado.tarefas_hoje(), p_resumo)
  on conflict (user_id, dia) do nothing;
$$;

-- Aparelho que o serviço de push devolveu 404/410 não existe mais.
create function public.tarefas_apagar_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from tarefas.push_inscricoes where endpoint = p_endpoint;
$$;

create function public.tarefas_inscricoes_do_usuario(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]')
  from tarefas.push_inscricoes where user_id = p_user;
$$;

revoke execute on function public.tarefas_eh_admin(uuid), public.tarefas_adicionar_usuario(uuid, text, text, boolean),
  public.tarefas_lembretes_pendentes(), public.tarefas_registrar_lembrete(uuid, jsonb),
  public.tarefas_apagar_push(text), public.tarefas_inscricoes_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.tarefas_eh_admin(uuid), public.tarefas_adicionar_usuario(uuid, text, text, boolean),
  public.tarefas_lembretes_pendentes(), public.tarefas_registrar_lembrete(uuid, jsonb),
  public.tarefas_apagar_push(text), public.tarefas_inscricoes_do_usuario(uuid) to service_role;

-- Lembrete todo dia às 8h de São Paulo (11h UTC). O segredo sai do Vault na hora de rodar.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('tarefas-lembrete-diario', '0 11 * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/tarefas-lembrete',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tarefas_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

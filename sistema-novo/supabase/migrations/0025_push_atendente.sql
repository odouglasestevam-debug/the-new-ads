-- Notificação no celular do atendente quando um lead é atribuído a ele.
-- Mesmo padrão que já funciona no gestor de tarefas: inscrição por aparelho, segredos no Vault,
-- fila de avisos e envio pela Edge Function (Web Push com VAPID).
-- Não depende da distribuição automática: vale para atribuição manual, por fila ou por transferência.

-- =========================================================
-- Aparelhos inscritos
-- =========================================================
create table privado.crm_push (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  falhas integer not null default 0
);
create index crm_push_user_idx on privado.crm_push(user_id);
alter table privado.crm_push enable row level security;
revoke all on privado.crm_push from public, anon, authenticated;

-- A tela só grava e apaga a inscrição do próprio aparelho, nunca lê a de ninguém.
create function public.crm_salvar_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(privado.crm_sessao_ok(), false) then raise exception 'sem_acesso'; end if;
  if not exists (select 1 from public.membros where user_id = auth.uid())
     and not privado.eh_agencia() then raise exception 'sem_acesso'; end if;
  if p_endpoint is null or length(p_endpoint) > 1000 or p_endpoint !~ '^https://'
     or p_p256dh is null or length(p_p256dh) > 200
     or p_auth is null or length(p_auth) > 200 then raise exception 'inscricao_invalida'; end if;
  insert into privado.crm_push (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        visto_em = now(), falhas = 0;
end;
$$;
revoke execute on function public.crm_salvar_push(text, text, text) from public, anon;
grant execute on function public.crm_salvar_push(text, text, text) to authenticated;

create function public.crm_apagar_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from privado.crm_push where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke execute on function public.crm_apagar_push(text) from public, anon;
grant execute on function public.crm_apagar_push(text) to authenticated;

-- =========================================================
-- Fila de avisos
-- =========================================================
create table privado.crm_avisos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  lead_id uuid,
  tipo text not null check (tipo in ('lead_atribuido')),
  titulo text not null,
  corpo text not null,
  url text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);
create index crm_avisos_pendentes_idx on privado.crm_avisos (criado_em, id) where enviado_em is null;
alter table privado.crm_avisos enable row level security;
revoke all on privado.crm_avisos from public, anon, authenticated;

-- Lead ganhou responsável (manual, fila ou transferência): avisa quem recebeu.
-- Quem pega o lead para si não recebe aviso do próprio ato.
create function privado.crm_avisar_responsavel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_quem uuid := auth.uid(); v_nome text; v_empresa text;
begin
  if new.responsavel_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then return null; end if;
  if new.responsavel_id = v_quem then return null; end if;
  if new.etapa in ('cliente', 'perdido') then return null; end if;

  select nome into v_empresa from public.empresas where id = new.empresa_id and ativo;
  if v_empresa is null then return null; end if;
  v_nome := coalesce(nullif(trim(new.nome), ''), new.telefone, 'Sem nome');

  insert into privado.crm_avisos (user_id, empresa_id, lead_id, tipo, titulo, corpo, url)
  values (new.responsavel_id, new.empresa_id, new.id, 'lead_atribuido',
    'Novo lead atribuído a você', v_nome || ' · ' || v_empresa,
    'https://crm.thenewads.com.br/?lead=' || new.id::text);
  return null;
end;
$$;
revoke all on function privado.crm_avisar_responsavel() from public, anon, authenticated;
create trigger trg_crm_avisar_responsavel after insert or update of responsavel_id on public.leads
  for each row execute function privado.crm_avisar_responsavel();

-- Um empurrão por comando, não por lead: distribuir 50 leads dispara uma chamada, não 50.
create function privado.crm_empurrar_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_segredo text;
begin
  if not exists (select 1 from privado.crm_avisos where enviado_em is null limit 1) then return null; end if;
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'crm_cron';
  if v_segredo is null then return null; end if;
  perform net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/crm-notificar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;
revoke all on function privado.crm_empurrar_avisos() from public, anon, authenticated;
create trigger trg_crm_empurrar_avisos after insert or update of responsavel_id on public.leads
  for each statement execute function privado.crm_empurrar_avisos();

-- =========================================================
-- Leitura pelo servidor
-- =========================================================
create function public.crm_avisos_pendentes() returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'titulo', a.titulo, 'corpo', a.corpo, 'url', a.url,
    'aparelhos', (select coalesce(jsonb_agg(jsonb_build_object(
        'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)), '[]'::jsonb)
      from privado.crm_push p where p.user_id = a.user_id)
  ) order by a.criado_em, a.id), '[]'::jsonb)
  from (
    select * from privado.crm_avisos
    where enviado_em is null and tentativas < 5 and criado_em > now() - interval '1 day'
    order by criado_em, id limit 200
  ) a;
$$;
revoke execute on function public.crm_avisos_pendentes() from public, anon, authenticated;
grant execute on function public.crm_avisos_pendentes() to service_role;

create function public.crm_aviso_concluido(p_id bigint, p_enviados integer, p_erro text default null) returns void
language sql security definer set search_path = '' as $$
  update privado.crm_avisos
  set enviado_em = case when p_enviados > 0 then now() end,
      tentativas = tentativas + 1,
      erro = left(p_erro, 300)
  where id = p_id;
$$;
revoke execute on function public.crm_aviso_concluido(bigint, integer, text) from public, anon, authenticated;
grant execute on function public.crm_aviso_concluido(bigint, integer, text) to service_role;

-- Aparelho que o navegador descartou (404/410) sai da lista; não adianta insistir.
create function public.crm_push_falhou(p_endpoint text, p_remover boolean) returns void
language sql security definer set search_path = '' as $$
  with apagado as (
    delete from privado.crm_push where endpoint = p_endpoint and p_remover returning 1
  )
  update privado.crm_push set falhas = falhas + 1 where endpoint = p_endpoint and not p_remover;
$$;
revoke execute on function public.crm_push_falhou(text, boolean) from public, anon, authenticated;
grant execute on function public.crm_push_falhou(text, boolean) to service_role;

-- Aparelhos de uma pessoa, para a notificação de teste que ela mesma dispara.
create function public.crm_push_do_usuario(p_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
  from privado.crm_push where user_id = p_user;
$$;
revoke execute on function public.crm_push_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.crm_push_do_usuario(uuid) to service_role;

create function public.crm_ler_segredo(p_nome text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'crm_' || p_nome;
$$;
revoke execute on function public.crm_ler_segredo(text) from public, anon, authenticated;
grant execute on function public.crm_ler_segredo(text) to service_role;

-- =========================================================
-- Relógio: rede de segurança se o empurrão falhar, e limpeza
-- =========================================================
select cron.schedule('crm-notificar-pendentes', '* * * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/crm-notificar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (select 1 from privado.crm_avisos where enviado_em is null and tentativas < 5);
$cron$);

select cron.schedule('crm-limpar-avisos', '20 4 * * *', $cron$
  delete from privado.crm_avisos where criado_em < now() - interval '30 days';
$cron$);

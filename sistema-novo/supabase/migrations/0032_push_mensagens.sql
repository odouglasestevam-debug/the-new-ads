-- Notificação a cada mensagem recebida (pedido do Douglas em 24/11/2026).
-- Usa a mesma fila, os mesmos aparelhos e a mesma Edge Function do aviso de lead atribuído (0025).
--
-- Quem recebe: o responsável pelo lead. Lead sem responsável avisa dono e gestor da empresa,
-- para a mensagem não ficar sem ninguém olhando.
-- Não avisa: mensagem enviada pela equipe, histórico importado ou reentrega muito atrasada (mais de 1 hora).
--
-- Duas mudanças no que a 0025 já fazia:
--  1. A fila passa a ser reservada ao ser lida. Antes, o empurrão do gatilho e o relógio de cada
--     minuto podiam ler o mesmo aviso ao mesmo tempo e o celular tocava duas vezes. Com uma
--     notificação por mensagem isso deixaria de ser raro.
--  2. O empurrão e o relógio de cada minuto só chamam o servidor quando há aviso que ainda vai ser
--     mandado. Antes chamavam também com aviso esgotado ou vencido, e o empurrão agora roda
--     a cada mensagem.

-- Trava: só segue se o banco estiver como a 0025 deixou. Se alguém mudou essas funções depois,
-- para aqui em vez de sobrescrever o que não conhece.
do $$
declare v_def text;
begin
  if to_regclass('privado.crm_avisos') is null then raise exception 'falta_0025: privado.crm_avisos'; end if;
  v_def := pg_get_functiondef('public.crm_avisos_pendentes()'::regprocedure);
  if position('tentativas < 5' in v_def) = 0 or position('crm_push p where p.user_id = a.user_id' in v_def) = 0 then
    raise exception 'corpo_inesperado: crm_avisos_pendentes';
  end if;
  v_def := pg_get_functiondef('public.crm_aviso_concluido(bigint, integer, text)'::regprocedure);
  if position('tentativas = tentativas + 1' in v_def) = 0 then raise exception 'corpo_inesperado: crm_aviso_concluido'; end if;
  v_def := pg_get_functiondef('privado.crm_empurrar_avisos()'::regprocedure);
  if position('crm-notificar' in v_def) = 0 or position('crm_cron' in v_def) = 0 then
    raise exception 'corpo_inesperado: crm_empurrar_avisos';
  end if;
end $$;

-- =========================================================
-- Fila: novo tipo, contagem de mensagens juntadas e reserva
-- =========================================================
do $$
declare v_nome text;
begin
  for v_nome in
    select conname from pg_constraint
    where conrelid = 'privado.crm_avisos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%lead_atribuido%'
  loop
    execute format('alter table privado.crm_avisos drop constraint %I', v_nome);
  end loop;
end $$;
alter table privado.crm_avisos
  add constraint crm_avisos_tipo_check check (tipo in ('lead_atribuido', 'mensagem')),
  add column quantidade integer not null default 1,
  add column reservado_em timestamptz;

-- Procura de aviso ainda não lido pelo servidor, para juntar mensagens seguidas do mesmo lead.
create index crm_avisos_abertos_idx on privado.crm_avisos (user_id, lead_id, tipo)
  where enviado_em is null and reservado_em is null;

-- =========================================================
-- Mensagem recebida vira aviso
-- =========================================================
create function privado.crm_avisar_mensagem() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_lead_id uuid; v_nome_lead text; v_telefone text; v_responsavel uuid;
  v_empresa text; v_nome text; v_previa text; v_url text;
  v_destinos uuid[]; v_quem uuid;
begin
  if new.direcao <> 'entrada' then return null; end if;
  if new.criado_em < now() - interval '1 hour' then return null; end if;

  select l.id, l.nome, l.telefone, l.responsavel_id
    into v_lead_id, v_nome_lead, v_telefone, v_responsavel
    from public.conversas c join public.leads l on l.id = c.lead_id
   where c.id = new.conversa_id;
  if v_lead_id is null then return null; end if;
  select nome into v_empresa from public.empresas where id = new.empresa_id and ativo;
  if v_empresa is null then return null; end if;

  v_nome := coalesce(nullif(trim(v_nome_lead), ''), v_telefone, 'Sem nome');
  v_previa := coalesce(
    left(nullif(regexp_replace(trim(coalesce(new.texto, '')), '\s+', ' ', 'g'), ''), 140),
    case new.tipo
      when 'imagem' then 'Foto' when 'video' then 'Vídeo' when 'audio' then 'Áudio'
      when 'documento' then 'Documento' when 'figurinha' then 'Figurinha'
      when 'localizacao' then 'Localização' when 'reacao' then 'Reagiu a uma mensagem'
      else 'Mensagem nova' end);
  v_url := 'https://crm.thenewads.com.br/?lead=' || v_lead_id::text || '&conversa=' || new.conversa_id::text;

  -- responsável que ainda é da empresa; sem ele, quem distribui
  select array_agg(m.user_id) into v_destinos from public.membros m
   where m.empresa_id = new.empresa_id and m.user_id = v_responsavel;
  if v_destinos is null then
    select array_agg(m.user_id) into v_destinos from public.membros m
     where m.empresa_id = new.empresa_id and m.papel in ('dono', 'gestor');
  end if;

  foreach v_quem in array coalesce(v_destinos, '{}'::uuid[]) loop
    -- Lead que acabou de ser atribuído: a primeira mensagem entra no mesmo aviso.
    update privado.crm_avisos set corpo = v_nome || ': ' || v_previa, url = v_url
     where user_id = v_quem and lead_id = v_lead_id and tipo = 'lead_atribuido'
       and enviado_em is null and reservado_em is null;
    if found then continue; end if;
    -- Mensagens seguidas antes de o servidor ler a fila viram um aviso só.
    update privado.crm_avisos set corpo = v_previa, quantidade = quantidade + 1
     where user_id = v_quem and lead_id = v_lead_id and tipo = 'mensagem'
       and enviado_em is null and reservado_em is null;
    if found then continue; end if;
    insert into privado.crm_avisos (user_id, empresa_id, lead_id, tipo, titulo, corpo, url)
    values (v_quem, new.empresa_id, v_lead_id, 'mensagem', v_nome, v_previa, v_url);
  end loop;
  return null;
end;
$$;
revoke all on function privado.crm_avisar_mensagem() from public, anon, authenticated;
create trigger trg_crm_avisar_mensagem after insert on public.mensagens
  for each row execute function privado.crm_avisar_mensagem();

-- Só chama o servidor quando há aviso que ainda vai ser mandado.
create or replace function privado.crm_empurrar_avisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_segredo text;
begin
  if not exists (
    select 1 from privado.crm_avisos
    where enviado_em is null and reservado_em is null and tentativas < 5
      and criado_em > now() - interval '1 day'
    limit 1
  ) then return null; end if;
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
create trigger trg_crm_empurrar_avisos_mensagem after insert on public.mensagens
  for each statement execute function privado.crm_empurrar_avisos();

-- =========================================================
-- Leitura pelo servidor: reserva o que leu
-- =========================================================
-- Aviso reservado e não concluído (servidor caiu no meio) volta para a fila depois de 2 minutos.
create or replace function public.crm_avisos_pendentes() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_saida jsonb;
begin
  with escolhidos as (
    select id from privado.crm_avisos
    where enviado_em is null and tentativas < 5 and criado_em > now() - interval '1 day'
      and (reservado_em is null or reservado_em < now() - interval '2 minutes')
    order by criado_em, id
    limit 200
    for update skip locked
  ), reservados as (
    update privado.crm_avisos a set reservado_em = now()
    from escolhidos e where a.id = e.id
    returning a.id, a.user_id, a.lead_id, a.tipo, a.titulo, a.corpo, a.url, a.quantidade, a.criado_em
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'tipo', r.tipo, 'titulo', r.titulo, 'corpo', r.corpo, 'url', r.url,
    'quantidade', r.quantidade,
    -- mesma etiqueta substitui a notificação anterior do mesmo lead em vez de empilhar;
    -- lembrete e aviso da agenda (0033) têm etiqueta própria, para um não apagar o outro
    'tag', case r.tipo
      when 'mensagem' then 'msg-' || coalesce(r.lead_id::text, r.id::text)
      when 'lead_atribuido' then 'lead-' || coalesce(r.lead_id::text, r.id::text)
      else r.tipo || '-' || r.id::text end,
    'aparelhos', (select coalesce(jsonb_agg(jsonb_build_object(
        'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)), '[]'::jsonb)
      from privado.crm_push p where p.user_id = r.user_id)
  ) order by r.criado_em, r.id), '[]'::jsonb)
  into v_saida
  from reservados r;
  return v_saida;
end;
$$;
revoke execute on function public.crm_avisos_pendentes() from public, anon, authenticated;
grant execute on function public.crm_avisos_pendentes() to service_role;

create or replace function public.crm_aviso_concluido(p_id bigint, p_enviados integer, p_erro text default null) returns void
language sql security definer set search_path = '' as $$
  update privado.crm_avisos
  set enviado_em = case when p_enviados > 0 then now() end,
      tentativas = tentativas + 1,
      reservado_em = null,
      erro = left(p_erro, 300)
  where id = p_id;
$$;
revoke execute on function public.crm_aviso_concluido(bigint, integer, text) from public, anon, authenticated;
grant execute on function public.crm_aviso_concluido(bigint, integer, text) to service_role;

-- =========================================================
-- Relógio de cada minuto (rede de segurança da 0025) com a mesma regra da fila
-- =========================================================
-- Antes ele chamava o servidor enquanto existisse aviso não enviado, inclusive aviso com mais de
-- um dia, que o servidor já não manda: se a função ficasse fora do ar por um dia, seriam chamadas
-- a cada minuto até a limpeza de 30 dias. Mesmo nome de tarefa: o pg_cron substitui a anterior.
select cron.schedule('crm-notificar-pendentes', '* * * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/crm-notificar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (
    select 1 from privado.crm_avisos
    where enviado_em is null and tentativas < 5 and criado_em > now() - interval '1 day'
      and (reservado_em is null or reservado_em < now() - interval '2 minutes')
  );
$cron$);

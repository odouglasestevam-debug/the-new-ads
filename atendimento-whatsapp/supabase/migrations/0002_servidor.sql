-- Funções usadas pelas Edge Functions (só service_role).

-- Recebe um evento já normalizado pela Edge Function atendimento-webhook.
-- p_evento.evento: 'mensagem' | 'leitura' | 'outro'
create or replace function public.atendimento_registrar(p_slug text, p_token text, p_evento jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c atendimento.contas;
  v_tel text; v_lid text; v_contato text; v_id bigint; v_tipo text;
begin
  select * into c from atendimento.contas where slug = p_slug and ativo;
  if not found or c.url_token <> coalesce(p_token, '') then return 'nao_autorizado'; end if;

  if nullif(p_evento->>'instance_id', '') is not null then
    if c.instance_id is null then
      update atendimento.contas set instance_id = p_evento->>'instance_id', instance_nome = p_evento->>'instance_nome'
      where id = c.id;
    elsif c.instance_id <> p_evento->>'instance_id' then
      return 'outra_instancia';
    end if;
  end if;
  update atendimento.contas set ultimo_evento_em = now(), ultimo_evento_tipo = left(p_evento->>'tipo_evento', 60)
  where id = c.id;

  if p_evento->>'evento' = 'leitura' then
    update atendimento.mensagens m set lida_em = (p_evento->>'em')::timestamptz
    where m.conta_id = c.id and not m.de_loja and m.lida_em is null
      and m.wa_id in (select jsonb_array_elements_text(p_evento->'ids'));
    insert into atendimento.leituras_pendentes (conta_id, wa_id, lida_em)
    select c.id, x, (p_evento->>'em')::timestamptz
    from jsonb_array_elements_text(p_evento->'ids') x
    where not exists (select 1 from atendimento.mensagens m where m.conta_id = c.id and m.wa_id = x)
    on conflict do nothing;
    return 'ok';
  end if;

  if p_evento->>'evento' is distinct from 'mensagem' then return 'ok'; end if;

  v_tel := nullif(p_evento->>'telefone', '');
  v_lid := nullif(p_evento->>'lid', '');
  if v_tel is not null and v_lid is not null then
    insert into atendimento.contatos_lid (conta_id, lid, telefone) values (c.id, v_lid, v_tel)
    on conflict (conta_id, lid) do update set telefone = excluded.telefone;
    -- o que chegou antes só com o código passa a ficar junto do telefone
    update atendimento.mensagens set contato = v_tel where conta_id = c.id and contato = 'lid:' || v_lid;
  end if;
  if v_tel is null and v_lid is not null then
    select telefone into v_tel from atendimento.contatos_lid where conta_id = c.id and lid = v_lid;
  end if;
  v_contato := coalesce(v_tel, 'lid:' || v_lid);
  if v_contato is null then return 'sem_contato'; end if;

  v_tipo := p_evento->>'tipo';
  insert into atendimento.mensagens (conta_id, wa_id, contato, chat_jid, de_loja, enviada_em, tipo, texto,
    audio_segundos, audio_voz, midia, anuncio, nome_contato, responde_a, transcricao_status, bruto, lida_em)
  values (c.id, p_evento->>'wa_id', v_contato, p_evento->>'chat', (p_evento->>'de_loja')::boolean,
    (p_evento->>'enviada_em')::timestamptz, v_tipo, left(p_evento->>'texto', 8000),
    (p_evento->>'audio_segundos')::integer, (p_evento->>'audio_voz')::boolean,
    p_evento->'midia', p_evento->'anuncio', left(p_evento->>'nome', 120), p_evento->>'responde_a',
    case when v_tipo = 'audio' then
      case when coalesce(p_evento->'midia'->>'media_key', '') <> '' then 'pendente' else 'sem_midia' end end,
    p_evento->'bruto',
    (select lida_em from atendimento.leituras_pendentes where conta_id = c.id and wa_id = p_evento->>'wa_id'))
  on conflict (conta_id, wa_id) do nothing
  returning id into v_id;
  delete from atendimento.leituras_pendentes where conta_id = c.id and wa_id = p_evento->>'wa_id';
  return case when v_id is null then 'duplicada' else 'ok' end;
end $$;

-- Confere o header x-cron-secret sem nunca devolver o segredo
create or replace function public.atendimento_cron_ok(p_segredo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_segredo, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'atendimento_cron' and decrypted_secret = p_segredo);
$$;

-- Avisos das Edge Functions para a tela (ex.: chave da OpenAI ainda não cadastrada)
create table if not exists atendimento.avisos (
  chave text primary key,
  valor text,
  em timestamptz not null default now()
);
alter table atendimento.avisos enable row level security;

create or replace function public.atendimento_aviso(p_chave text, p_valor text)
returns void language sql security definer set search_path = '' as $$
  insert into atendimento.avisos (chave, valor, em) values (left(p_chave, 60), left(p_valor, 500), now())
  on conflict (chave) do update set valor = excluded.valor, em = excluded.em;
$$;

-- Áudios esperando transcrição
create or replace function public.atendimento_audios_pendentes(p_limite integer default 5)
returns table (id bigint, midia jsonb, audio_segundos integer)
language sql security definer set search_path = '' as $$
  select m.id, m.midia, m.audio_segundos from atendimento.mensagens m
  where m.transcricao_status = 'pendente'
  order by m.recebida_em
  limit least(greatest(p_limite, 1), 20);
$$;

create or replace function public.atendimento_salvar_transcricao(p_id bigint, p_texto text, p_erro text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_texto is not null then
    update atendimento.mensagens set transcricao = left(p_texto, 8000), transcricao_status = 'ok', transcricao_erro = null,
      transcricao_tentativas = transcricao_tentativas + 1
    where id = p_id;
  else
    -- três falhas seguidas: desiste (link do WhatsApp expirado, arquivo corrompido)
    update atendimento.mensagens set transcricao_tentativas = transcricao_tentativas + 1, transcricao_erro = left(p_erro, 500),
      transcricao_status = case when transcricao_tentativas + 1 >= 3 then 'erro' else 'pendente' end
    where id = p_id;
  end if;
end $$;

revoke all on function public.atendimento_registrar(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.atendimento_cron_ok(text) from public, anon, authenticated;
revoke all on function public.atendimento_aviso(text, text) from public, anon, authenticated;
revoke all on function public.atendimento_audios_pendentes(integer) from public, anon, authenticated;
revoke all on function public.atendimento_salvar_transcricao(bigint, text, text) from public, anon, authenticated;
grant execute on function public.atendimento_registrar(text, text, jsonb) to service_role;
grant execute on function public.atendimento_cron_ok(text) to service_role;
grant execute on function public.atendimento_aviso(text, text) to service_role;
grant execute on function public.atendimento_audios_pendentes(integer) to service_role;
grant execute on function public.atendimento_salvar_transcricao(bigint, text, text) to service_role;

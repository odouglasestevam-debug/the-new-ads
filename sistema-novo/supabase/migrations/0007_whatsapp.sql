-- Fase 3: WhatsApp (API oficial primeiro). Conversas, mensagens, credenciais no Vault
-- e recebimento de mensagem que cria ou junta o lead, com origem de anúncio (CTWA).

-- Um número de WhatsApp oficial pertence a uma empresa só: o webhook roteia por ele.
create unique index integracoes_phone_number_uidx on public.integracoes ((config->>'phone_number_id'))
  where tipo = 'whatsapp_oficial' and config->>'phone_number_id' is not null;

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lead_id uuid not null,
  canal text not null check (canal in ('whatsapp_oficial', 'whatsapp_nao_oficial')),
  wa_id text not null,                      -- número como o WhatsApp manda (pode vir sem o 9)
  ultima_mensagem_em timestamptz not null default now(),
  ultima_entrada_em timestamptz,            -- abre a janela de 24h da API oficial
  ultima_previa text,
  nao_lidas int not null default 0,
  criado_em timestamptz not null default now(),
  unique (empresa_id, canal, wa_id),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index conversas_lead_idx on public.conversas (lead_id, empresa_id);
create index conversas_empresa_recentes_idx on public.conversas (empresa_id, ultima_mensagem_em desc);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  direcao text not null check (direcao in ('entrada', 'saida')),
  tipo text not null default 'texto',
  texto text,
  midia jsonb,
  wa_message_id text unique,
  status text not null default 'recebida'
    check (status in ('recebida', 'enviando', 'enviada', 'entregue', 'lida', 'falhou')),
  erro text,
  autor_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index mensagens_conversa_idx on public.mensagens (conversa_id, criado_em);
create index mensagens_autor_idx on public.mensagens (autor_id);

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

create policy conversas_ver on public.conversas for select to authenticated
  using (privado.pode_ver_lead_id(lead_id));
create policy mensagens_ver on public.mensagens for select to authenticated
  using (exists (select 1 from public.conversas c where c.id = conversa_id and privado.pode_ver_lead_id(c.lead_id)));

-- Navegador só lê. Enviar passa pelo servidor (precisa do token), zerar não lidas por função.
revoke all on public.conversas, public.mensagens from anon;
revoke insert, update, delete on public.conversas, public.mensagens from authenticated;

create function public.marcar_conversa_lida(p_conversa uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversas set nao_lidas = 0
  where id = p_conversa and privado.pode_ver_lead_id(lead_id);
$$;
revoke execute on function public.marcar_conversa_lida(uuid) from public, anon;
grant execute on function public.marcar_conversa_lida(uuid) to authenticated;

-- Telefone do WhatsApp para o formato do lead. Celular brasileiro às vezes chega sem o 9.
create function privado.telefone_de_wa(p_wa text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^55\d{2}[6-9]\d{7}$' then '+' || substr(d, 1, 4) || '9' || substr(d, 5)
    when d ~ '^\d{10,15}$' then '+' || d
    else null end
  from (select regexp_replace(coalesce(p_wa, ''), '\D', '', 'g') as d) x;
$$;

-- Credenciais: um segredo do Vault por integração, com os campos sensíveis em JSON.
create function public.integracao_salvar_segredos(p_integracao uuid, p_segredos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_atual uuid;
  v_json jsonb;
begin
  select segredo_id into v_atual from public.integracoes where id = p_integracao;
  if not found then raise exception 'integracao_inexistente'; end if;
  if v_atual is null then
    v_json := jsonb_strip_nulls(p_segredos);
    update public.integracoes
      set segredo_id = vault.create_secret(v_json::text, 'integracao_' || p_integracao::text)
      where id = p_integracao;
  else
    -- campo vazio mantém o valor anterior (tela nunca mostra o segredo salvo)
    select coalesce(decrypted_secret::jsonb, '{}'::jsonb) || jsonb_strip_nulls(p_segredos)
      into v_json from vault.decrypted_secrets where id = v_atual;
    perform vault.update_secret(v_atual, v_json::text);
  end if;
end;
$$;

create function public.integracao_ler_segredos(p_integracao uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(s.decrypted_secret::jsonb, '{}'::jsonb)
  from public.integracoes i left join vault.decrypted_secrets s on s.id = i.segredo_id
  where i.id = p_integracao;
$$;

revoke execute on function public.integracao_salvar_segredos(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.integracao_ler_segredos(uuid) from public, anon, authenticated;
grant execute on function public.integracao_salvar_segredos(uuid, jsonb) to service_role;
grant execute on function public.integracao_ler_segredos(uuid) to service_role;

-- Apagar a integração apaga o segredo junto.
create function privado.integracoes_apagar_segredo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.segredo_id is not null then delete from vault.secrets where id = old.segredo_id; end if;
  return old;
end;
$$;
create trigger trg_integracoes_apagar_segredo after delete on public.integracoes
  for each row execute function privado.integracoes_apagar_segredo();

-- Mensagem recebida: acha ou cria o lead pelo telefone, registra origem de anúncio,
-- abre ou atualiza a conversa e grava a mensagem (sem duplicar reentrega do webhook).
create function public.receber_mensagem_whatsapp(
  p_empresa uuid, p_canal text, p_wa_id text, p_nome text,
  p_wa_message_id text, p_tipo text, p_texto text, p_midia jsonb,
  p_origem jsonb, p_quando timestamptz
) returns table (lead_id uuid, conversa_id uuid, novo_lead boolean, duplicada boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := privado.telefone_de_wa(p_wa_id);
  v_sem9 text;
  v_lead uuid;
  v_conversa uuid;
  v_novo boolean := false;
  v_quando timestamptz := coalesce(p_quando, now());
begin
  if v_tel is null then raise exception 'telefone_invalido'; end if;

  if p_wa_message_id is not null and exists (select 1 from public.mensagens where wa_message_id = p_wa_message_id) then
    return query select null::uuid, null::uuid, false, true;
    return;
  end if;

  -- lead pode ter sido gravado sem o 9 (ou com) por outro canal
  v_sem9 := case when v_tel ~ '^\+55\d{2}9\d{8}$' then substr(v_tel, 1, 5) || substr(v_tel, 7) end;

  for tentativa in 1..2 loop
    select id into v_lead from public.leads
      where empresa_id = p_empresa and (telefone = v_tel or telefone = v_sem9)
      order by criado_em limit 1;
    begin
      if v_lead is null then
        insert into public.leads (empresa_id, nome, telefone)
        values (p_empresa, nullif(trim(p_nome), ''), v_tel) returning id into v_lead;
        v_novo := true;
      else
        update public.leads set nome = coalesce(nome, nullif(trim(p_nome), '')) where id = v_lead;
      end if;
      exit;
    exception when unique_violation then
      if tentativa = 2 then raise; end if;
    end;
  end loop;

  -- origem de anúncio: uma por clique (ctwa_clid), mesmo se a pessoa mandar várias mensagens
  if p_origem is not null and p_origem ? 'ad_id' and not exists (
    select 1 from public.lead_origens o
    where o.lead_id = v_lead and o.canal = 'ctwa'
      and coalesce(o.ctwa_clid, '') = coalesce(p_origem->>'ctwa_clid', '')
      and coalesce(o.ad_id, '') = coalesce(p_origem->>'ad_id', '')
  ) then
    insert into public.lead_origens (empresa_id, lead_id, canal, ad_id, ctwa_clid,
      campanha_id, campanha_nome, conjunto_id, conjunto_nome, anuncio_nome, dados, recebido_em)
    values (p_empresa, v_lead, 'ctwa', left(p_origem->>'ad_id', 64), left(p_origem->>'ctwa_clid', 500),
      p_origem->>'campanha_id', p_origem->>'campanha_nome', p_origem->>'conjunto_id', p_origem->>'conjunto_nome',
      p_origem->>'anuncio_nome', coalesce(p_origem->'dados', '{}'::jsonb), v_quando);
  end if;

  insert into public.conversas as c (empresa_id, lead_id, canal, wa_id, ultima_mensagem_em, ultima_entrada_em, ultima_previa, nao_lidas)
  values (p_empresa, v_lead, p_canal, regexp_replace(p_wa_id, '\D', '', 'g'), v_quando, v_quando, left(coalesce(p_texto, '[' || p_tipo || ']'), 140), 1)
  on conflict (empresa_id, canal, wa_id) do update set
    ultima_mensagem_em = greatest(c.ultima_mensagem_em, excluded.ultima_mensagem_em),
    ultima_entrada_em = greatest(coalesce(c.ultima_entrada_em, excluded.ultima_entrada_em), excluded.ultima_entrada_em),
    ultima_previa = excluded.ultima_previa,
    nao_lidas = c.nao_lidas + 1
  returning id into v_conversa;

  insert into public.mensagens (empresa_id, conversa_id, direcao, tipo, texto, midia, wa_message_id, status, criado_em)
  values (p_empresa, v_conversa, 'entrada', coalesce(p_tipo, 'texto'), p_texto, p_midia, p_wa_message_id, 'recebida', v_quando)
  on conflict (wa_message_id) do nothing;

  return query select v_lead, v_conversa, v_novo, false;
end;
$$;
revoke execute on function public.receber_mensagem_whatsapp(uuid, text, text, text, text, text, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.receber_mensagem_whatsapp(uuid, text, text, text, text, text, text, jsonb, jsonb, timestamptz) to service_role;

-- API não oficial (NeoGo). Uma instância pertence a uma empresa só, e a mensagem pode vir
-- do lead ou do próprio atendente respondendo pelo celular (IsFromMe).

create unique index integracoes_neogo_instancia_uidx on public.integracoes ((config->>'instance_id'))
  where tipo = 'whatsapp_nao_oficial' and config->>'instance_id' is not null;

drop function public.receber_mensagem_whatsapp(uuid, text, text, text, text, text, text, jsonb, jsonb, timestamptz);

create function public.receber_mensagem_whatsapp(
  p_empresa uuid, p_canal text, p_wa_id text, p_nome text,
  p_wa_message_id text, p_tipo text, p_texto text, p_midia jsonb,
  p_origem jsonb, p_quando timestamptz, p_direcao text default 'entrada'
) returns table (lead_id uuid, conversa_id uuid, novo_lead boolean, duplicada boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := privado.telefone_de_wa(p_wa_id);
  v_sem9 text;
  v_lead uuid;
  v_conversa uuid;
  v_novo boolean := false;
  v_quando timestamptz := coalesce(p_quando, now());
  v_entrada boolean := coalesce(p_direcao, 'entrada') = 'entrada';
  v_previa text := left(coalesce(p_texto, '[' || coalesce(p_tipo, 'mensagem') || ']'), 140);
begin
  if v_tel is null then raise exception 'telefone_invalido'; end if;
  if p_direcao not in ('entrada', 'saida') then raise exception 'direcao_invalida'; end if;

  if p_wa_message_id is not null and exists (select 1 from public.mensagens where wa_message_id = p_wa_message_id) then
    return query select null::uuid, null::uuid, false, true;
    return;
  end if;

  v_sem9 := case when v_tel ~ '^\+55\d{2}9\d{8}$' then substr(v_tel, 1, 5) || substr(v_tel, 7) end;

  for tentativa in 1..2 loop
    select id into v_lead from public.leads
      where empresa_id = p_empresa and (telefone = v_tel or telefone = v_sem9)
      order by criado_em limit 1;
    begin
      if v_lead is null then
        -- nome do perfil só vale quando quem escreveu foi o lead
        insert into public.leads (empresa_id, nome, telefone)
        values (p_empresa, case when v_entrada then nullif(trim(p_nome), '') end, v_tel) returning id into v_lead;
        v_novo := true;
      elsif v_entrada then
        update public.leads set nome = coalesce(nome, nullif(trim(p_nome), '')) where id = v_lead;
      end if;
      exit;
    exception when unique_violation then
      if tentativa = 2 then raise; end if;
    end;
  end loop;

  if v_entrada and p_origem is not null and p_origem ? 'ad_id' and not exists (
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

  select c.id into v_conversa from public.conversas c
    where c.empresa_id = p_empresa and c.canal = p_canal and c.lead_id = v_lead
    order by c.ultima_mensagem_em desc limit 1;
  if v_conversa is not null then
    update public.conversas c set
      ultima_mensagem_em = greatest(c.ultima_mensagem_em, v_quando),
      ultima_entrada_em = case when v_entrada then greatest(coalesce(c.ultima_entrada_em, v_quando), v_quando) else c.ultima_entrada_em end,
      ultima_previa = v_previa,
      nao_lidas = c.nao_lidas + case when v_entrada then 1 else 0 end,
      wa_id = case when not v_entrada or exists (select 1 from public.conversas o where o.empresa_id = p_empresa and o.canal = p_canal
                                     and o.wa_id = regexp_replace(p_wa_id, '\D', '', 'g') and o.id <> c.id)
                   then c.wa_id else regexp_replace(p_wa_id, '\D', '', 'g') end
    where c.id = v_conversa;
  else
    insert into public.conversas as c (empresa_id, lead_id, canal, wa_id, ultima_mensagem_em, ultima_entrada_em, ultima_previa, nao_lidas)
    values (p_empresa, v_lead, p_canal, regexp_replace(p_wa_id, '\D', '', 'g'), v_quando,
            case when v_entrada then v_quando end, v_previa, case when v_entrada then 1 else 0 end)
    on conflict (empresa_id, canal, wa_id) do update set
      ultima_mensagem_em = greatest(c.ultima_mensagem_em, excluded.ultima_mensagem_em),
      ultima_entrada_em = coalesce(greatest(c.ultima_entrada_em, excluded.ultima_entrada_em), c.ultima_entrada_em, excluded.ultima_entrada_em),
      ultima_previa = excluded.ultima_previa,
      nao_lidas = c.nao_lidas + excluded.nao_lidas
    returning id into v_conversa;
  end if;

  insert into public.mensagens (empresa_id, conversa_id, direcao, tipo, texto, midia, wa_message_id, status, criado_em)
  values (p_empresa, v_conversa, p_direcao, coalesce(p_tipo, 'texto'), p_texto, p_midia, p_wa_message_id,
          case when v_entrada then 'recebida' else 'enviada' end, v_quando)
  on conflict (wa_message_id) do nothing;

  return query select v_lead, v_conversa, v_novo, false;
end;
$$;
revoke execute on function public.receber_mensagem_whatsapp(uuid, text, text, text, text, text, text, jsonb, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.receber_mensagem_whatsapp(uuid, text, text, text, text, text, text, jsonb, jsonb, timestamptz, text) to service_role;

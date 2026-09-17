-- Nova conversa começando pelo CRM: a pessoa digita o número e o atendente puxa o assunto.
-- Acha ou cria o lead pelo telefone e abre a conversa no canal de WhatsApp ativo da empresa.
create function public.abrir_conversa_whatsapp(p_empresa uuid, p_telefone text, p_nome text default null)
returns table (lead_id uuid, conversa_id uuid, canal text, novo_lead boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_papel public.papel_membro := public.papel_na_empresa(p_empresa);
  v_agencia boolean := public.eh_agencia();
  v_tel text := privado.telefone_de_wa(p_telefone);
  v_sem9 text;
  v_canal text;
  v_lead uuid;
  v_responsavel uuid;
  v_conversa uuid;
  v_novo boolean := false;
begin
  if not v_agencia and v_papel is null then raise exception 'sem_acesso'; end if;
  if not v_agencia and v_papel = 'leitura' then raise exception 'sem_permissao'; end if;
  if v_tel is null then raise exception 'telefone_invalido'; end if;

  -- canal: a NeoGo não tem janela de 24h, então ela vem primeiro quando as duas estão ligadas
  select i.tipo into v_canal from public.integracoes i
  where i.empresa_id = p_empresa and i.status = 'ativa'
    and i.tipo in ('whatsapp_nao_oficial', 'whatsapp_oficial')
  order by (i.tipo = 'whatsapp_nao_oficial') desc limit 1;
  if v_canal is null then raise exception 'sem_whatsapp'; end if;

  v_sem9 := case when v_tel ~ '^\+55\d{2}9\d{8}$' then substr(v_tel, 1, 5) || substr(v_tel, 7) end;

  for tentativa in 1..2 loop
    select l.id, l.responsavel_id into v_lead, v_responsavel from public.leads l
      where l.empresa_id = p_empresa and (l.telefone = v_tel or l.telefone = v_sem9)
      order by l.criado_em limit 1;
    begin
      if v_lead is null then
        -- vendedor só enxerga o que é dele, então o lead já nasce no nome de quem abriu
        insert into public.leads (empresa_id, nome, telefone, responsavel_id)
        values (p_empresa, nullif(trim(p_nome), ''), v_tel,
          case when v_papel is not null then (select auth.uid()) end)
        returning id into v_lead;
        v_novo := true;
      else
        if not public.pode_editar_lead(p_empresa, v_responsavel) then raise exception 'lead_de_outro'; end if;
        update public.leads set nome = coalesce(nome, nullif(trim(p_nome), '')) where id = v_lead;
      end if;
      exit;
    exception when unique_violation then
      if tentativa = 2 then raise; end if;
    end;
  end loop;

  select c.id into v_conversa from public.conversas c
    where c.empresa_id = p_empresa and c.lead_id = v_lead and c.canal = v_canal limit 1;
  if v_conversa is null then
    insert into public.conversas (empresa_id, lead_id, canal, wa_id, ultima_mensagem_em, nao_lidas)
    values (p_empresa, v_lead, v_canal, regexp_replace(v_tel, '\D', '', 'g'), now(), 0)
    returning id into v_conversa;
  end if;

  return query select v_lead, v_conversa, v_canal, v_novo;
end;
$$;
revoke execute on function public.abrir_conversa_whatsapp(uuid, text, text) from public, anon;
grant execute on function public.abrir_conversa_whatsapp(uuid, text, text) to authenticated;

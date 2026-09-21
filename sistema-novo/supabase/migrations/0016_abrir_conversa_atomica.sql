alter table public.conversas add constraint conversas_empresa_lead_canal_unique unique(empresa_id,lead_id,canal);

CREATE OR REPLACE FUNCTION public.abrir_conversa_whatsapp(p_empresa uuid, p_telefone text, p_nome text DEFAULT NULL::text, p_canal text DEFAULT NULL::text)
 RETURNS TABLE(lead_id uuid, conversa_id uuid, canal text, novo_lead boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_papel public.papel_membro := privado.papel_na_empresa(p_empresa);
  v_agencia boolean := privado.eh_agencia();
  v_tel text := privado.telefone_de_wa(p_telefone);
  v_sem9 text;
  v_canal text;
  v_lead uuid;
  v_responsavel uuid;
  v_conversa uuid;
  v_novo boolean := false;
begin
  if not exists(select 1 from public.empresas where id=p_empresa and ativo) then raise exception 'empresa_inativa'; end if;
  if not v_agencia and v_papel is null then raise exception 'sem_acesso'; end if;
  if not v_agencia and v_papel = 'leitura' then raise exception 'sem_permissao'; end if;
  if v_tel is null then raise exception 'telefone_invalido'; end if;

  select i.tipo::text into v_canal from public.integracoes i
  where i.empresa_id = p_empresa and i.status = 'ativa'
    and i.tipo::text in ('whatsapp_nao_oficial', 'whatsapp_oficial')
    and (p_canal is null or i.tipo::text = p_canal)
  order by (i.tipo::text = 'whatsapp_nao_oficial') desc limit 1;
  if v_canal is null then raise exception 'sem_whatsapp'; end if;

  v_sem9 := case when v_tel ~ '^\+55\d{2}9\d{8}$' then substr(v_tel, 1, 5) || substr(v_tel, 7) end;

  for tentativa in 1..2 loop
    select l.id, l.responsavel_id into v_lead, v_responsavel from public.leads l
      where l.empresa_id = p_empresa and (l.telefone = v_tel or l.telefone = v_sem9)
      order by l.criado_em limit 1;
    begin
      if v_lead is null then
        insert into public.leads (empresa_id, nome, telefone, responsavel_id)
        values (p_empresa, nullif(trim(p_nome), ''), v_tel,
          case when v_papel is not null then (select auth.uid()) end)
        returning id into v_lead;
        v_novo := true;
      else
        if not privado.pode_editar_lead(p_empresa, v_responsavel) then raise exception 'lead_de_outro'; end if;
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
    insert into public.conversas as existente (empresa_id, lead_id, canal, wa_id, ultima_mensagem_em, nao_lidas)
    values (p_empresa, v_lead, v_canal, regexp_replace(v_tel, '\D', '', 'g'), now(), 0)
    on conflict on constraint conversas_empresa_lead_canal_unique do update set wa_id=existente.wa_id
    returning id into v_conversa;
  end if;

  return query select v_lead, v_conversa, v_canal, v_novo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.canais_whatsapp(p_empresa uuid)
 RETURNS TABLE(canal text, numero text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select i.tipo::text, i.config->>'numero_exibido'
  from public.integracoes i
  where i.empresa_id = p_empresa and i.status = 'ativa'
    and i.tipo::text in ('whatsapp_oficial', 'whatsapp_nao_oficial')
    and privado.pode_ver_empresa(p_empresa)
  order by i.tipo::text;
$function$;


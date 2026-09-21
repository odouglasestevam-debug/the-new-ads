-- Limites do CRM, sem alterar Auth global ou o schema do gestor de tarefas.
create or replace function privado.consumir_limite_crm(p_ator uuid,p_acao text) returns boolean
language plpgsql security definer set search_path='' as $$
declare teto integer; aceito boolean;
begin
  teto:=case p_acao when 'envio' then 30 when 'conversa' then 20 when 'equipe' then 10
    when 'integracoes' then 20 when 'recurso_whatsapp' then 120 when 'gravacao' then 120
    when 'distribuicao_leitura' then 60 when 'distribuicao_config' then 20
    when 'presenca' then 60 when 'distribuicao_lote' then 20 when 'busca' then 120 end;
  if p_ator is null or teto is null then raise exception 'limite_invalido';end if;
  insert into privado.crm_limites as atual values(p_ator,p_acao,date_trunc('minute',clock_timestamp()),1)
  on conflict(ator,acao,minuto) do update set quantidade=atual.quantidade+1 where atual.quantidade<teto;
  aceito:=found;
  delete from privado.crm_limites where minuto<now()-interval '1 day';
  return aceito;
end;
$$;

create function privado.exigir_limite_crm(p_acao text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(privado.crm_sessao_ok(),false) then raise exception 'sem_acesso'; end if;
  if not privado.consumir_limite_crm(auth.uid(),p_acao) then
    raise sqlstate 'PT429' using message='Muitas solicitações. Aguarde um minuto e tente novamente.';
  end if;
end;
$$;
revoke all on function privado.exigir_limite_crm(text) from public,anon;
grant execute on function privado.exigir_limite_crm(text) to authenticated;

-- Mantém corpos e ACLs já revisados, acrescentando limites antes de operações custosas.
do $$
declare item record; definicao text;
begin
  for item in select * from (values
    ('public.crm_obter_distribuicao(uuid)','distribuicao_leitura'),
    ('public.crm_salvar_distribuicao(uuid,text,uuid[],bigint)','distribuicao_config'),
    ('public.crm_presenca(uuid,uuid,boolean,boolean)','presenca'),
    ('public.crm_processar_distribuicao(uuid)','distribuicao_lote')
  ) v(assinatura,acao) loop
    definicao:=replace(pg_get_functiondef(item.assinatura::regprocedure),E'\r','');
    if position(E'begin\n' in definicao)=0 then raise exception 'corpo_inesperado: %',item.assinatura; end if;
    definicao:=replace(definicao,E'begin\n',E'begin\n  perform privado.exigir_limite_crm('||quote_literal(item.acao)||E');\n');
    execute definicao;
  end loop;
end;
$$;

-- Busca mantém SECURITY INVOKER e portanto a RLS original do usuário.
do $$
declare corpo text;
begin
  select prosrc into corpo from pg_proc where oid='public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer)'::regprocedure;
  execute 'create or replace function public.buscar_conversas_crm(p_empresa uuid,p_busca text default '''',p_estado text default ''todas'',p_responsavel text default '''',p_canal text default '''',p_offset integer default 0,p_limite integer default 50) returns jsonb language plpgsql volatile security invoker set search_path='''' as '||
    quote_literal(E'begin\nif privado.crm_sessao_ok() then perform privado.exigir_limite_crm(''busca''); end if;\nreturn ('||regexp_replace(corpo,';[[:space:]]*$','')||E');\nend;');
end;
$$;

create function privado.crm_limitar_gravacao() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then perform privado.exigir_limite_crm('gravacao'); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function privado.crm_limitar_gravacao() from public,anon,authenticated;
create trigger crm_limite_leads before insert or update or delete on public.leads for each row execute function privado.crm_limitar_gravacao();
create trigger crm_limite_notas before insert or update or delete on public.lead_notas for each row execute function privado.crm_limitar_gravacao();
create trigger crm_limite_origens before insert or update or delete on public.lead_origens for each row execute function privado.crm_limitar_gravacao();
create trigger crm_limite_formularios before insert or update or delete on public.formularios for each row execute function privado.crm_limitar_gravacao();

-- Reserva atômica antes da captura: 6 tentativas/IP/formulário e 120/formulário por 10 min.
-- O limite total independe da autenticidade do IP encaminhado pelo gateway.
create index formulario_envios_janela_idx on public.formulario_envios(formulario_id,criado_em,ip_hash);
create function public.crm_reservar_formulario(p_formulario uuid,p_ip_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare desde timestamptz:=clock_timestamp()-interval '10 minutes'; total integer; por_ip integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'hash_invalido'; end if;
  perform 1 from public.formularios f join public.empresas e on e.id=f.empresa_id
    where f.id=p_formulario and f.ativo and e.ativo for update of f;
  if not found then return false; end if;
  select count(*),count(*) filter(where ip_hash=p_ip_hash) into total,por_ip
    from public.formulario_envios where formulario_id=p_formulario and criado_em>=desde;
  if total>=120 or por_ip>=6 then return false; end if;
  insert into public.formulario_envios(formulario_id,ip_hash) values(p_formulario,p_ip_hash);
  delete from public.formulario_envios where criado_em<clock_timestamp()-interval '1 day';
  return true;
end;
$$;
revoke all on function public.crm_reservar_formulario(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_reservar_formulario(uuid,text) to service_role;

-- Defesa adicional para chamadas do receptor pelo servidor: empresa inativa não recebe lead.
do $$
declare definicao text;
begin
  definicao:=pg_get_functiondef('public.receber_lead_site(text,text,text,text,jsonb,jsonb)'::regprocedure);
  if position('where chave = p_chave and ativo;' in definicao)=0 then raise exception 'corpo_inesperado: receber_lead_site'; end if;
  definicao:=replace(definicao,'where chave = p_chave and ativo;',
    'where chave = p_chave and ativo and exists(select 1 from public.empresas e where e.id=formularios.empresa_id and e.ativo);');
  execute definicao;
end;
$$;

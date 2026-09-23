-- Fila de distribuição por canal: cada número de WhatsApp tem a sua equipe fixa, e o que
-- não vem de WhatsApp (site, formulário, cadastro manual) usa a fila 'padrao'.
-- Sem reserva entre canais: sem atendente no canal, o lead aguarda em vez de vazar para outra equipe.

alter table privado.crm_distribuidores add column canal text not null default 'padrao';
alter table privado.crm_distribuidores drop constraint crm_distribuidores_pkey;
alter table privado.crm_distribuidores add constraint crm_distribuidores_pkey primary key (empresa_id,canal,user_id);
alter table privado.crm_distribuidores add constraint crm_distribuidores_canal_ok
  check (canal in ('padrao','whatsapp_oficial','whatsapp_nao_oficial'));
alter table privado.crm_distribuicao_pendentes add column canal text not null default 'padrao';
alter table privado.crm_distribuicao_log add column canal text not null default 'padrao';

-- O canal do lead chega por ajuste local da transação, gravado por quem sabe de onde veio.
create function privado.crm_canal_atual() returns text
language sql stable set search_path='' as $$
  select case when coalesce(nullif(current_setting('crm.canal', true),''),'padrao')
    in ('padrao','whatsapp_oficial','whatsapp_nao_oficial')
    then coalesce(nullif(current_setting('crm.canal', true),''),'padrao') else 'padrao' end;
$$;

-- a versão sem canal sai de cena para não sobrar função órfã resolvendo chamada antiga
drop function if exists privado.crm_distribuir_lead(uuid,uuid);
create function privado.crm_distribuir_lead(p_empresa uuid,p_lead uuid,p_canal text default 'padrao') returns boolean
language plpgsql security definer set search_path='' as $$
declare v_modo text; v_user uuid; v_turno bigint; v_lead public.leads;
begin
  select modo into v_modo from privado.crm_distribuicao where empresa_id=p_empresa for update;
  if v_modo is null or v_modo='manual' or not exists(select 1 from public.empresas where id=p_empresa and ativo) then return false; end if;
  select * into v_lead from public.leads where id=p_lead and empresa_id=p_empresa for update skip locked;
  if not found then return false; end if;
  if v_lead.responsavel_id is not null or v_lead.etapa in ('cliente','perdido') then
    delete from privado.crm_distribuicao_pendentes where lead_id=p_lead;
    return false;
  end if;
  select d.user_id into v_user from privado.crm_distribuidores d
    join public.membros m on (m.empresa_id,m.user_id)=(d.empresa_id,d.user_id)
    where d.empresa_id=p_empresa and d.canal=p_canal and m.papel in ('dono','gestor','vendedor')
      and (v_modo='fila' or (
        exists(select 1 from privado.crm_disponibilidade a where a.empresa_id=p_empresa and a.user_id=d.user_id and a.disponivel)
        and exists(select 1 from privado.crm_presencas s where s.empresa_id=p_empresa and s.user_id=d.user_id and s.visto_em>clock_timestamp()-interval '90 seconds')
      ))
    order by case when v_modo='inteligente' then (select count(*) from public.leads l
      where l.empresa_id=p_empresa and l.responsavel_id=d.user_id and l.etapa not in ('cliente','perdido')) else 0 end,
      d.ultimo_turno,d.ordem,d.user_id limit 1;
  if v_user is null then return false; end if;
  update public.leads set responsavel_id=v_user where id=p_lead;
  update privado.crm_distribuicao set turno=turno+1 where empresa_id=p_empresa returning turno into v_turno;
  update privado.crm_distribuidores set ultimo_turno=v_turno where empresa_id=p_empresa and canal=p_canal and user_id=v_user;
  insert into privado.crm_distribuicao_log(empresa_id,lead_id,responsavel_id,modo,canal) values(p_empresa,p_lead,v_user,v_modo,p_canal);
  delete from privado.crm_distribuicao_pendentes where lead_id=p_lead;
  return true;
end;
$$;

create or replace function privado.crm_distribuir_pendentes(p_empresa uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_canal text; v_total integer:=0;
begin
  perform 1 from privado.crm_distribuicao where empresa_id=p_empresa and modo<>'manual' for update;
  if not found then return 0; end if;
  for v_id,v_canal in select p.lead_id,p.canal from privado.crm_distribuicao_pendentes p
    join public.leads l on l.id=p.lead_id where p.empresa_id=p_empresa
    order by p.criado_em,p.lead_id limit 50 for update of l skip locked loop
    if privado.crm_distribuir_lead(p_empresa,v_id,v_canal) then v_total:=v_total+1; end if;
  end loop;
  return v_total;
end;
$$;

create or replace function privado.crm_lead_entrou() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_canal text := privado.crm_canal_atual();
begin
  if new.responsavel_id is not null or new.etapa in ('cliente','perdido') then return null; end if;
  perform 1 from privado.crm_distribuicao where empresa_id=new.empresa_id and modo<>'manual' for update;
  if not found then return null; end if;
  insert into privado.crm_distribuicao_pendentes(empresa_id,lead_id,canal) values(new.empresa_id,new.id,v_canal);
  perform privado.crm_distribuir_pendentes(new.empresa_id);
  return null;
end;
$$;

-- Quem recebe a mensagem sabe o número que atendeu: grava o canal para o gatilho do lead usar.
do $$
declare definicao text; alvo text := E'\nbegin\n'; pos integer;
begin
  definicao := pg_get_functiondef('public.receber_mensagem_whatsapp(uuid,text,text,text,text,text,text,jsonb,jsonb,timestamptz,text)'::regprocedure);
  pos := position(alvo in definicao);
  if pos = 0 then raise exception 'corpo_inesperado: receber_mensagem_whatsapp'; end if;
  if position('crm.canal' in definicao) > 0 then raise exception 'ja_ajustado: receber_mensagem_whatsapp'; end if;
  definicao := left(definicao, pos + length(alvo) - 1)
    || E'  perform set_config(''crm.canal'', coalesce(p_canal, ''padrao''), true);\n'
    || substr(definicao, pos + length(alvo));
  execute definicao;
end;
$$;

do $$
declare definicao text; alvo text := 'if v_canal is null then raise exception ''sem_whatsapp''; end if;';
begin
  definicao := pg_get_functiondef('public.abrir_conversa_whatsapp(uuid,text,text,text)'::regprocedure);
  if position(alvo in definicao) = 0 then raise exception 'corpo_inesperado: abrir_conversa_whatsapp'; end if;
  definicao := replace(definicao, alvo, alvo || E'\n  perform set_config(''crm.canal'', v_canal, true);');
  execute definicao;
end;
$$;

revoke all on function privado.crm_distribuir_lead(uuid,uuid,text),privado.crm_canal_atual() from public,anon,authenticated;

-- Canais que a empresa tem hoje: a fila padrão sempre existe; os números aparecem quando ligados.
create function public.crm_canais_distribuicao(p_empresa uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_array(jsonb_build_object('id','padrao','nome','Site e cadastro manual','numero',null)) ||
    coalesce((select jsonb_agg(jsonb_build_object('id',i.tipo::text,
        'nome',case i.tipo::text when 'whatsapp_oficial' then 'WhatsApp oficial' else 'WhatsApp NeoGo' end,
        'numero',i.config->>'numero_exibido') order by i.tipo::text)
      from public.integracoes i where i.empresa_id=p_empresa and i.status='ativa'
        and i.tipo::text in ('whatsapp_oficial','whatsapp_nao_oficial')),'[]'::jsonb);
$$;

create or replace function public.crm_obter_distribuicao(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_result jsonb;
begin
  perform privado.exigir_limite_crm('distribuicao_leitura');
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  select jsonb_build_object('modo',coalesce(c.modo,'manual'),'revisao',coalesce(c.revisao,0),
    'canais',public.crm_canais_distribuicao(p_empresa),
    -- participantes por canal, cada um na ordem real do rodízio daquele canal
    'participantes',coalesce((select jsonb_object_agg(t.canal,t.ids) from (
        select d.canal,jsonb_agg(d.user_id order by d.ultimo_turno,d.ordem,d.user_id) ids
        from privado.crm_distribuidores d join public.membros m on (m.empresa_id,m.user_id)=(d.empresa_id,d.user_id)
        where d.empresa_id=p_empresa and m.papel in ('dono','gestor','vendedor') group by d.canal) t),'{}'::jsonb),
    'equipe',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,
      'nome',coalesce(nullif(trim(u.raw_user_meta_data->>'nome'),''),split_part(u.email::text,'@',1)),'papel',m.papel,
      'demanda',(select count(*) from public.leads l where l.empresa_id=p_empresa and l.responsavel_id=m.user_id and l.etapa not in ('cliente','perdido')),
      'disponivel',coalesce(a.disponivel,false),
      'online',exists(select 1 from privado.crm_presencas s where s.empresa_id=p_empresa and s.user_id=m.user_id and s.visto_em>clock_timestamp()-interval '90 seconds')) order by u.email,m.user_id)
      from public.membros m join auth.users u on u.id=m.user_id
      left join privado.crm_disponibilidade a on (a.empresa_id,a.user_id)=(m.empresa_id,m.user_id)
      where m.empresa_id=p_empresa and m.papel in ('dono','gestor','vendedor')),'[]'::jsonb),
    'pendentes',(select count(*) from privado.crm_distribuicao_pendentes p join public.leads l on l.id=p.lead_id
      where p.empresa_id=p_empresa and l.responsavel_id is null and l.etapa not in ('cliente','perdido')),
    'pendentes_canal',coalesce((select jsonb_object_agg(x.canal,x.qtd) from (
        select p.canal,count(*) qtd from privado.crm_distribuicao_pendentes p join public.leads l on l.id=p.lead_id
        where p.empresa_id=p_empresa and l.responsavel_id is null and l.etapa not in ('cliente','perdido')
        group by p.canal) x),'{}'::jsonb),
    'historico',coalesce((select jsonb_agg(h order by h.criado_em desc) from (
      select g.id,g.lead_id,l.nome,l.telefone,g.modo,g.canal,u.email,
        coalesce(nullif(trim(u.raw_user_meta_data->>'nome'),''),split_part(u.email::text,'@',1)) as nome_responsavel,
        g.criado_em from privado.crm_distribuicao_log g
      join public.leads l on l.id=g.lead_id left join auth.users u on u.id=g.responsavel_id
      where g.empresa_id=p_empresa order by g.criado_em desc,g.id desc limit 15) h),'[]'::jsonb)) into v_result
    from (select 1) x left join privado.crm_distribuicao c on c.empresa_id=p_empresa;
  return v_result;
end;
$function$;

-- Salva um canal por vez: o modo é da empresa, a equipe é do canal.
create or replace function public.crm_salvar_distribuicao(p_empresa uuid,p_modo text,p_participantes uuid[],p_revisao bigint,p_canal text default 'padrao') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revisao bigint; v_turno bigint;
begin
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  if p_canal is null or p_canal not in ('padrao','whatsapp_oficial','whatsapp_nao_oficial') then raise exception 'canal_invalido'; end if;
  if p_modo is null or p_modo not in ('manual','fila','inteligente') or p_participantes is null
    or cardinality(p_participantes)>200
    or cardinality(p_participantes)<>(select count(distinct x) from unnest(p_participantes) x) then raise exception 'configuracao_invalida'; end if;
  insert into privado.crm_distribuicao(empresa_id) values(p_empresa) on conflict do nothing;
  select revisao,turno into v_revisao,v_turno from privado.crm_distribuicao where empresa_id=p_empresa for update;
  if p_revisao is distinct from v_revisao then raise exception 'configuracao_alterada'; end if;
  -- Mantém os membros válidos até o commit e impede concorrência com remoção/rebaixamento.
  perform 1 from public.membros where empresa_id=p_empresa and user_id=any(p_participantes) for share;
  if exists(select 1 from unnest(p_participantes) x where not exists(select 1 from public.membros m
    where m.empresa_id=p_empresa and m.user_id=x and m.papel in ('dono','gestor','vendedor'))) then raise exception 'participante_invalido'; end if;
  -- fila ligada sem ninguém em canal nenhum não entrega nada: exige equipe em pelo menos um canal
  if p_modo<>'manual' and cardinality(p_participantes)=0
    and not exists(select 1 from privado.crm_distribuidores where empresa_id=p_empresa and canal<>p_canal) then raise exception 'configuracao_invalida'; end if;
  delete from privado.crm_distribuidores where empresa_id=p_empresa and canal=p_canal and not(user_id=any(p_participantes));
  insert into privado.crm_distribuidores(empresa_id,canal,user_id,ordem,ultimo_turno)
    select p_empresa,p_canal,x,i::integer,v_turno from unnest(p_participantes) with ordinality t(x,i)
    on conflict(empresa_id,canal,user_id) do update set ordem=excluded.ordem;
  update privado.crm_distribuicao set modo=p_modo,revisao=revisao+1 where empresa_id=p_empresa;
  -- Desativar libera os pendentes para gestão manual. Reativar não importa histórico.
  if p_modo='manual' then delete from privado.crm_distribuicao_pendentes where empresa_id=p_empresa;
  else perform privado.crm_distribuir_pendentes(p_empresa); end if;
  return public.crm_obter_distribuicao(p_empresa);
end;
$$;

drop function if exists public.crm_salvar_distribuicao(uuid,text,uuid[],bigint);
revoke all on function public.crm_canais_distribuicao(uuid),public.crm_salvar_distribuicao(uuid,text,uuid[],bigint,text) from public,anon;
grant execute on function public.crm_canais_distribuicao(uuid),public.crm_salvar_distribuicao(uuid,text,uuid[],bigint,text) to authenticated;

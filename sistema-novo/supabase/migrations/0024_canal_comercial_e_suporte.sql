-- Dois canais de verdade, que não se misturam:
--   comercial = landing page, formulário, cadastro manual e campanha no número da API oficial
--   suporte   = número de atendimento na API não oficial
-- Contato de suporte continua existindo como contato (toda conversa exige um), mas fica fora
-- do funil: não aparece no kanban, não conta como lead e tem fila e equipe próprias.

-- 1. canais viram comercial/suporte
alter table privado.crm_distribuidores drop constraint crm_distribuidores_canal_ok;
update privado.crm_distribuidores set canal='suporte' where canal='whatsapp_nao_oficial';
-- site e número oficial passam a dividir a mesma fila; se alguém estava nas duas, fica uma vez só
delete from privado.crm_distribuidores d where d.canal='whatsapp_oficial'
  and exists(select 1 from privado.crm_distribuidores o where o.empresa_id=d.empresa_id and o.user_id=d.user_id and o.canal='padrao');
update privado.crm_distribuidores set canal='comercial' where canal in ('padrao','whatsapp_oficial');
alter table privado.crm_distribuidores add constraint crm_distribuidores_canal_ok check (canal in ('comercial','suporte'));
update privado.crm_distribuicao_pendentes set canal=case when canal='whatsapp_nao_oficial' then 'suporte' else 'comercial' end;
update privado.crm_distribuicao_log set canal=case when canal='whatsapp_nao_oficial' then 'suporte' else 'comercial' end;
alter table privado.crm_distribuicao_pendentes alter column canal set default 'comercial';
alter table privado.crm_distribuicao_log alter column canal set default 'comercial';
alter table privado.crm_distribuidores alter column canal set default 'comercial';

create or replace function privado.crm_canal_atual() returns text
language sql stable set search_path='' as $$
  select case coalesce(nullif(current_setting('crm.canal', true),''),'comercial')
    when 'whatsapp_nao_oficial' then 'suporte' when 'suporte' then 'suporte' else 'comercial' end;
$$;

-- 2. contato de suporte fora do funil
alter table public.leads add column tipo text not null default 'comercial' check (tipo in ('comercial','suporte'));
create index leads_empresa_tipo_idx on public.leads (empresa_id, tipo);
grant update (tipo) on public.leads to authenticated;

-- quem chega pelo número de suporte nasce como contato de suporte
create function privado.crm_tipo_do_lead() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if privado.crm_canal_atual()='suporte' then new.tipo:='suporte'; end if;
  return new;
end;
$$;
create trigger trg_crm_tipo_do_lead before insert on public.leads
  for each row execute function privado.crm_tipo_do_lead();

-- contato de suporte que preenche formulário ou vem de anúncio vira lead comercial sozinho
create function privado.crm_promover_por_origem() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.canal in ('site','meta_form','ctwa') then
    update public.leads set tipo='comercial' where id=new.lead_id and tipo='suporte';
  end if;
  return null;
end;
$$;
create trigger trg_crm_promover_por_origem after insert on public.lead_origens
  for each row execute function privado.crm_promover_por_origem();

revoke all on function privado.crm_tipo_do_lead(),privado.crm_promover_por_origem() from public,anon,authenticated;

-- 3. configuração da distribuição passa a falar em comercial/suporte
create or replace function public.crm_canais_distribuicao(p_empresa uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_array(
    jsonb_build_object('id','comercial','nome','Comercial','detalhe','Landing page, formulário, cadastro manual e campanha no número oficial',
      'numero',(select i.config->>'numero_exibido' from public.integracoes i
        where i.empresa_id=p_empresa and i.status='ativa' and i.tipo='whatsapp_oficial')),
    jsonb_build_object('id','suporte','nome','Suporte','detalhe','Contatos recebidos no número de atendimento',
      'numero',(select i.config->>'numero_exibido' from public.integracoes i
        where i.empresa_id=p_empresa and i.status='ativa' and i.tipo='whatsapp_nao_oficial')));
$$;

create or replace function public.crm_salvar_distribuicao(p_empresa uuid,p_modo text,p_participantes uuid[],p_revisao bigint,p_canal text default 'comercial') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revisao bigint; v_turno bigint;
begin
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  if p_canal is null or p_canal not in ('comercial','suporte') then raise exception 'canal_invalido'; end if;
  if p_modo is null or p_modo not in ('manual','fila','inteligente') or p_participantes is null
    or cardinality(p_participantes)>200
    or cardinality(p_participantes)<>(select count(distinct x) from unnest(p_participantes) x) then raise exception 'configuracao_invalida'; end if;
  insert into privado.crm_distribuicao(empresa_id) values(p_empresa) on conflict do nothing;
  select revisao,turno into v_revisao,v_turno from privado.crm_distribuicao where empresa_id=p_empresa for update;
  if p_revisao is distinct from v_revisao then raise exception 'configuracao_alterada'; end if;
  perform 1 from public.membros where empresa_id=p_empresa and user_id=any(p_participantes) for share;
  if exists(select 1 from unnest(p_participantes) x where not exists(select 1 from public.membros m
    where m.empresa_id=p_empresa and m.user_id=x and m.papel in ('dono','gestor','vendedor'))) then raise exception 'participante_invalido'; end if;
  if p_modo<>'manual' and cardinality(p_participantes)=0
    and not exists(select 1 from privado.crm_distribuidores where empresa_id=p_empresa and canal<>p_canal) then raise exception 'configuracao_invalida'; end if;
  delete from privado.crm_distribuidores where empresa_id=p_empresa and canal=p_canal and not(user_id=any(p_participantes));
  insert into privado.crm_distribuidores(empresa_id,canal,user_id,ordem,ultimo_turno)
    select p_empresa,p_canal,x,i::integer,v_turno from unnest(p_participantes) with ordinality t(x,i)
    on conflict(empresa_id,canal,user_id) do update set ordem=excluded.ordem;
  update privado.crm_distribuicao set modo=p_modo,revisao=revisao+1 where empresa_id=p_empresa;
  if p_modo='manual' then delete from privado.crm_distribuicao_pendentes where empresa_id=p_empresa;
  else perform privado.crm_distribuir_pendentes(p_empresa); end if;
  return public.crm_obter_distribuicao(p_empresa);
end;
$$;

-- Distribuição opt-in por empresa. Nenhum lead histórico entra na fila.
create table privado.crm_distribuicao (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  modo text not null default 'manual' check (modo in ('manual','fila','inteligente')),
  turno bigint not null default 0,
  revisao bigint not null default 0
);
create table privado.crm_distribuidores (
  empresa_id uuid not null,
  user_id uuid not null,
  ordem integer not null,
  ultimo_turno bigint not null default 0,
  primary key(empresa_id,user_id),
  foreign key(empresa_id,user_id) references public.membros(empresa_id,user_id) on delete cascade on update cascade
);
create table privado.crm_disponibilidade (
  empresa_id uuid not null,
  user_id uuid not null,
  disponivel boolean not null default false,
  primary key(empresa_id,user_id),
  foreign key(empresa_id,user_id) references public.membros(empresa_id,user_id) on delete cascade on update cascade
);
create table privado.crm_presencas (
  empresa_id uuid not null,
  user_id uuid not null,
  sessao uuid not null,
  visto_em timestamptz not null default clock_timestamp(),
  primary key(empresa_id,user_id,sessao),
  foreign key(empresa_id,user_id) references public.membros(empresa_id,user_id) on delete cascade on update cascade
);
create table privado.crm_distribuicao_pendentes (
  empresa_id uuid not null,
  lead_id uuid primary key,
  criado_em timestamptz not null default clock_timestamp(),
  foreign key(lead_id,empresa_id) references public.leads(id,empresa_id) on delete cascade
);
create index crm_pendentes_empresa_idx on privado.crm_distribuicao_pendentes(empresa_id,criado_em,lead_id);
create table privado.crm_distribuicao_log (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  lead_id uuid not null,
  responsavel_id uuid references auth.users(id) on delete set null,
  modo text not null,
  criado_em timestamptz not null default clock_timestamp(),
  foreign key(lead_id,empresa_id) references public.leads(id,empresa_id) on delete cascade
);
create index crm_distribuicao_log_empresa_idx on privado.crm_distribuicao_log(empresa_id,criado_em desc);
create index leads_demanda_idx on public.leads(empresa_id,responsavel_id) where etapa not in ('cliente','perdido');
alter table privado.crm_distribuicao enable row level security;
alter table privado.crm_distribuidores enable row level security;
alter table privado.crm_disponibilidade enable row level security;
alter table privado.crm_presencas enable row level security;
alter table privado.crm_distribuicao_pendentes enable row level security;
alter table privado.crm_distribuicao_log enable row level security;
revoke all on privado.crm_distribuicao,privado.crm_distribuidores,privado.crm_disponibilidade,
  privado.crm_presencas,privado.crm_distribuicao_pendentes,privado.crm_distribuicao_log from public,anon,authenticated;

-- O lock da configuração serializa as decisões de todos os produtores da empresa.
-- Chamadores internos já seguram o lock; reentrância é segura na mesma transação.
create function privado.crm_distribuir_lead(p_empresa uuid,p_lead uuid) returns boolean
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
    where d.empresa_id=p_empresa and m.papel in ('dono','gestor','vendedor')
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
  update privado.crm_distribuidores set ultimo_turno=v_turno where empresa_id=p_empresa and user_id=v_user;
  insert into privado.crm_distribuicao_log(empresa_id,lead_id,responsavel_id,modo) values(p_empresa,p_lead,v_user,v_modo);
  delete from privado.crm_distribuicao_pendentes where lead_id=p_lead;
  return true;
end;
$$;

create function privado.crm_distribuir_pendentes(p_empresa uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_total integer:=0;
begin
  perform 1 from privado.crm_distribuicao where empresa_id=p_empresa and modo<>'manual' for update;
  if not found then return 0; end if;
  for v_id in select p.lead_id from privado.crm_distribuicao_pendentes p
    join public.leads l on l.id=p.lead_id where p.empresa_id=p_empresa
    order by p.criado_em,p.lead_id limit 50 for update of l skip locked loop
    if privado.crm_distribuir_lead(p_empresa,v_id) then v_total:=v_total+1; end if;
  end loop;
  return v_total;
end;
$$;

-- AFTER INSERT evita consumir rodízio para INSERT ... ON CONFLICT que não cria lead.
create function privado.crm_lead_entrou() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.responsavel_id is not null or new.etapa in ('cliente','perdido') then return null; end if;
  perform 1 from privado.crm_distribuicao where empresa_id=new.empresa_id and modo<>'manual' for update;
  if not found then return null; end if;
  insert into privado.crm_distribuicao_pendentes(empresa_id,lead_id) values(new.empresa_id,new.id);
  perform privado.crm_distribuir_pendentes(new.empresa_id);
  return null;
end;
$$;
create trigger trg_crm_lead_entrou after insert on public.leads for each row execute function privado.crm_lead_entrou();

create function privado.crm_validar_admin_distribuicao(p_empresa uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(privado.crm_sessao_ok() and privado.pode_administrar_empresa(p_empresa),false)
    or not exists(select 1 from public.empresas where id=p_empresa and ativo) then raise exception 'sem_acesso'; end if;
end;
$$;

create function public.crm_obter_distribuicao(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  select jsonb_build_object('modo',coalesce(c.modo,'manual'),'revisao',coalesce(c.revisao,0),
    'participantes',coalesce((select jsonb_agg(d.user_id order by d.ultimo_turno,d.ordem,d.user_id)
      from privado.crm_distribuidores d where d.empresa_id=p_empresa),'[]'::jsonb),
    'equipe',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'papel',m.papel,
      'demanda',(select count(*) from public.leads l where l.empresa_id=p_empresa and l.responsavel_id=m.user_id and l.etapa not in ('cliente','perdido')),
      'disponivel',coalesce(a.disponivel,false),
      'online',exists(select 1 from privado.crm_presencas s where s.empresa_id=p_empresa and s.user_id=m.user_id and s.visto_em>clock_timestamp()-interval '90 seconds')) order by u.email,m.user_id)
      from public.membros m join auth.users u on u.id=m.user_id
      left join privado.crm_disponibilidade a on (a.empresa_id,a.user_id)=(m.empresa_id,m.user_id)
      where m.empresa_id=p_empresa and m.papel in ('dono','gestor','vendedor')),'[]'::jsonb),
    'pendentes',(select count(*) from privado.crm_distribuicao_pendentes p join public.leads l on l.id=p.lead_id
      where p.empresa_id=p_empresa and l.responsavel_id is null and l.etapa not in ('cliente','perdido')),
    'historico',coalesce((select jsonb_agg(h order by h.criado_em desc) from (
      select g.id,g.lead_id,l.nome,l.telefone,g.modo,u.email,g.criado_em from privado.crm_distribuicao_log g
      join public.leads l on l.id=g.lead_id left join auth.users u on u.id=g.responsavel_id
      where g.empresa_id=p_empresa order by g.criado_em desc,g.id desc limit 15) h),'[]'::jsonb)) into v_result
    from (select 1) x left join privado.crm_distribuicao c on c.empresa_id=p_empresa;
  return v_result;
end;
$$;

create function public.crm_salvar_distribuicao(p_empresa uuid,p_modo text,p_participantes uuid[],p_revisao bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revisao bigint; v_turno bigint;
begin
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  if p_modo is null or p_modo not in ('manual','fila','inteligente') or p_participantes is null
    or cardinality(p_participantes)>200 or (p_modo<>'manual' and cardinality(p_participantes)=0)
    or cardinality(p_participantes)<>(select count(distinct x) from unnest(p_participantes) x) then raise exception 'configuracao_invalida'; end if;
  insert into privado.crm_distribuicao(empresa_id) values(p_empresa) on conflict do nothing;
  select revisao,turno into v_revisao,v_turno from privado.crm_distribuicao where empresa_id=p_empresa for update;
  if p_revisao is distinct from v_revisao then raise exception 'configuracao_alterada'; end if;
  -- Mantém os membros válidos até o commit e impede concorrência com remoção/rebaixamento.
  perform 1 from public.membros where empresa_id=p_empresa and user_id=any(p_participantes) for share;
  if exists(select 1 from unnest(p_participantes) x where not exists(select 1 from public.membros m
    where m.empresa_id=p_empresa and m.user_id=x and m.papel in ('dono','gestor','vendedor'))) then raise exception 'participante_invalido'; end if;
  delete from privado.crm_distribuidores where empresa_id=p_empresa and not(user_id=any(p_participantes));
  insert into privado.crm_distribuidores(empresa_id,user_id,ordem,ultimo_turno)
    select p_empresa,x,i::integer,v_turno from unnest(p_participantes) with ordinality t(x,i)
    on conflict(empresa_id,user_id) do update set ordem=excluded.ordem;
  update privado.crm_distribuicao set modo=p_modo,revisao=revisao+1 where empresa_id=p_empresa;
  -- Desativar libera os pendentes para gestão manual. Reativar não importa histórico.
  if p_modo='manual' then delete from privado.crm_distribuicao_pendentes where empresa_id=p_empresa;
  else perform privado.crm_distribuir_pendentes(p_empresa); end if;
  return public.crm_obter_distribuicao(p_empresa);
end;
$$;

create function public.crm_presenca(p_empresa uuid,p_sessao uuid,p_disponivel boolean default null,p_sair boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_disponivel boolean; v_modo text; v_participa boolean; v_total integer:=0;
begin
  if p_sessao is null or not coalesce(privado.crm_sessao_ok(),false)
    or not exists(select 1 from public.empresas where id=p_empresa and ativo)
    or not exists(select 1 from public.membros where empresa_id=p_empresa and user_id=v_user and papel in ('dono','gestor','vendedor')) then raise exception 'sem_acesso'; end if;
  -- Ordem de locks constante: empresa antes de presença/disponibilidade/leads.
  perform 1 from privado.crm_distribuicao where empresa_id=p_empresa for update;
  if coalesce(p_sair,false) then
    delete from privado.crm_presencas where empresa_id=p_empresa and user_id=v_user and sessao=p_sessao;
    return jsonb_build_object('online',false);
  end if;
  insert into privado.crm_disponibilidade(empresa_id,user_id,disponivel) values(p_empresa,v_user,coalesce(p_disponivel,false))
    on conflict(empresa_id,user_id) do update set disponivel=coalesce(p_disponivel,crm_disponibilidade.disponivel)
    returning disponivel into v_disponivel;
  delete from privado.crm_presencas where empresa_id=p_empresa and visto_em<clock_timestamp()-interval '90 seconds';
  insert into privado.crm_presencas(empresa_id,user_id,sessao) values(p_empresa,v_user,p_sessao)
    on conflict(empresa_id,user_id,sessao) do update set visto_em=clock_timestamp();
  select modo into v_modo from privado.crm_distribuicao where empresa_id=p_empresa;
  select exists(select 1 from privado.crm_distribuidores where empresa_id=p_empresa and user_id=v_user) into v_participa;
  if v_participa then v_total:=privado.crm_distribuir_pendentes(p_empresa); end if;
  return jsonb_build_object('disponivel',v_disponivel,'online',true,'participa',v_participa,'modo',coalesce(v_modo,'manual'),'distribuidos',v_total);
end;
$$;

revoke all on function privado.crm_distribuir_lead(uuid,uuid),privado.crm_distribuir_pendentes(uuid),
  privado.crm_lead_entrou(),privado.crm_validar_admin_distribuicao(uuid) from public,anon,authenticated;
revoke all on function public.crm_obter_distribuicao(uuid),public.crm_salvar_distribuicao(uuid,text,uuid[],bigint),
  public.crm_presenca(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.crm_obter_distribuicao(uuid),public.crm_salvar_distribuicao(uuid,text,uuid[],bigint),
  public.crm_presenca(uuid,uuid,boolean,boolean) to authenticated;

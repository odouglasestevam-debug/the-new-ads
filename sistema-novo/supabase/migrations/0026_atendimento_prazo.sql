-- Horário de atendimento, prazo de resposta e transferência pelo próprio atendente.
-- Regras decididas com o Douglas em 24/09/2026:
--   * horário por empresa, por dia da semana, definido pelo gestor
--   * dentro do horário, quem recebe tem 10 minutos para MANDAR MENSAGEM ao lead
--   * fora do horário, o prazo começa 30 minutos depois da próxima abertura
--   * estourou o prazo sem mensagem, o lead vai para o próximo da fila daquele canal
--   * ocupado e offline não recebem lead novo, em nenhum modo
-- Encosta na distribuição criada pela outra IA (0020 a 0024) e reaproveita a fila dela.

-- =========================================================
-- Horário de atendimento
-- =========================================================
create table privado.crm_atendimento (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  fuso text not null default 'America/Sao_Paulo',
  -- {"0": null, "1": ["08:00","20:00"], ...}; chave = dia da semana, 0 = domingo. Sem par = fechado.
  horarios jsonb not null default '{}'::jsonb,
  minutos_resposta integer not null default 10 check (minutos_resposta between 1 and 240),
  minutos_apos_abertura integer not null default 30 check (minutos_apos_abertura between 0 and 240),
  ativo boolean not null default false,
  revisao bigint not null default 0
);
alter table privado.crm_atendimento enable row level security;
revoke all on privado.crm_atendimento from public, anon, authenticated;

create function privado.crm_hora_local(p_empresa uuid, p_momento timestamptz)
returns timestamp language sql stable security definer set search_path = '' as $$
  select p_momento at time zone coalesce((select fuso from privado.crm_atendimento where empresa_id = p_empresa), 'America/Sao_Paulo');
$$;

create function privado.crm_dentro_do_horario(p_empresa uuid, p_momento timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_cfg privado.crm_atendimento; v_local timestamp; v_par jsonb;
begin
  select * into v_cfg from privado.crm_atendimento where empresa_id = p_empresa;
  if not found or not v_cfg.ativo then return false; end if;
  v_local := p_momento at time zone v_cfg.fuso;
  v_par := v_cfg.horarios -> to_char(extract(dow from v_local)::int, 'FM0');
  if v_par is null or jsonb_typeof(v_par) <> 'array' or jsonb_array_length(v_par) <> 2 then return false; end if;
  return v_local::time >= (v_par->>0)::time and v_local::time < (v_par->>1)::time;
end;
$$;

-- Próxima abertura a partir de um momento; procura até 8 dias à frente.
create function privado.crm_proxima_abertura(p_empresa uuid, p_momento timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare v_cfg privado.crm_atendimento; v_local timestamp; v_dia date; v_par jsonb; v_abre time; i int;
begin
  select * into v_cfg from privado.crm_atendimento where empresa_id = p_empresa;
  if not found or not v_cfg.ativo then return null; end if;
  v_local := p_momento at time zone v_cfg.fuso;
  for i in 0..8 loop
    v_dia := (v_local + make_interval(days => i))::date;
    v_par := v_cfg.horarios -> to_char(extract(dow from v_dia)::int, 'FM0');
    if v_par is not null and jsonb_typeof(v_par) = 'array' and jsonb_array_length(v_par) = 2 then
      v_abre := (v_par->>0)::time;
      if i > 0 or v_local::time < v_abre then
        return (v_dia + v_abre) at time zone v_cfg.fuso;
      end if;
    end if;
  end loop;
  return null;
end;
$$;

-- Quando o prazo de quem recebeu agora termina.
create function privado.crm_prazo_de(p_empresa uuid, p_momento timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare v_cfg privado.crm_atendimento; v_abertura timestamptz;
begin
  select * into v_cfg from privado.crm_atendimento where empresa_id = p_empresa;
  if not found or not v_cfg.ativo then return null; end if;
  if privado.crm_dentro_do_horario(p_empresa, p_momento) then
    return p_momento + make_interval(mins => v_cfg.minutos_resposta);
  end if;
  v_abertura := privado.crm_proxima_abertura(p_empresa, p_momento);
  if v_abertura is null then return null; end if;
  return v_abertura + make_interval(mins => v_cfg.minutos_apos_abertura);
end;
$$;

revoke all on function privado.crm_hora_local(uuid, timestamptz), privado.crm_dentro_do_horario(uuid, timestamptz),
  privado.crm_proxima_abertura(uuid, timestamptz), privado.crm_prazo_de(uuid, timestamptz) from public, anon, authenticated;

-- =========================================================
-- Prazo de resposta por lead
-- =========================================================
create table privado.crm_prazo_resposta (
  lead_id uuid primary key,
  empresa_id uuid not null,
  canal text not null default 'padrao',
  responsavel_id uuid not null references auth.users (id) on delete cascade,
  atribuido_em timestamptz not null default now(),
  vence_em timestamptz not null,
  repasses integer not null default 0,
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index crm_prazo_vencimento_idx on privado.crm_prazo_resposta (vence_em);
alter table privado.crm_prazo_resposta enable row level security;
revoke all on privado.crm_prazo_resposta from public, anon, authenticated;

-- Lead ganhou (ou trocou de) responsável: começa a contar. Perdeu responsável: para de contar.
create function privado.crm_prazo_ao_atribuir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_vence timestamptz; v_canal text;
begin
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id
     and new.etapa is not distinct from old.etapa then return null; end if;

  if new.responsavel_id is null or new.etapa in ('cliente', 'perdido') then
    delete from privado.crm_prazo_resposta where lead_id = new.id;
    return null;
  end if;

  v_vence := privado.crm_prazo_de(new.empresa_id, now());
  if v_vence is null then
    delete from privado.crm_prazo_resposta where lead_id = new.id;
    return null;
  end if;

  select coalesce(max(canal), 'padrao') into v_canal from privado.crm_distribuicao_pendentes where lead_id = new.id;
  insert into privado.crm_prazo_resposta (lead_id, empresa_id, canal, responsavel_id, atribuido_em, vence_em)
  values (new.id, new.empresa_id, coalesce(v_canal, 'padrao'), new.responsavel_id, now(), v_vence)
  on conflict (lead_id) do update
    set responsavel_id = excluded.responsavel_id, atribuido_em = excluded.atribuido_em,
        vence_em = excluded.vence_em, repasses = crm_prazo_resposta.repasses;
  return null;
end;
$$;
revoke all on function privado.crm_prazo_ao_atribuir() from public, anon, authenticated;
create trigger trg_crm_prazo_ao_atribuir after insert or update of responsavel_id, etapa on public.leads
  for each row execute function privado.crm_prazo_ao_atribuir();

-- Atendimento começou quando sai mensagem para o lead. É o que o cliente sente.
create function privado.crm_prazo_ao_responder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.direcao <> 'saida' then return null; end if;
  delete from privado.crm_prazo_resposta p
  using public.conversas c
  where c.id = new.conversa_id and p.lead_id = c.lead_id
    and (new.autor_id is null or new.autor_id = p.responsavel_id);
  return null;
end;
$$;
revoke all on function privado.crm_prazo_ao_responder() from public, anon, authenticated;
create trigger trg_crm_prazo_ao_responder after insert on public.mensagens
  for each row execute function privado.crm_prazo_ao_responder();

-- =========================================================
-- Repasse de quem não respondeu
-- =========================================================
create function privado.crm_cobrar_prazos() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_p record; v_repassados integer := 0; v_achou boolean;
begin
  -- Empresa aberta agora e com lead esperando: solta a fila mesmo sem ninguém mexer na tela.
  for v_p in select distinct d.empresa_id from privado.crm_distribuicao_pendentes d
    where privado.crm_dentro_do_horario(d.empresa_id, now()) loop
    perform privado.crm_distribuir_pendentes(v_p.empresa_id);
  end loop;

  for v_p in
    select * from privado.crm_prazo_resposta
    where vence_em <= now() and repasses < 5
    order by vence_em limit 100 for update skip locked
  loop
    -- só repassa dentro do horário: ninguém é cobrado de madrugada
    if not privado.crm_dentro_do_horario(v_p.empresa_id, now()) then
      update privado.crm_prazo_resposta set vence_em = privado.crm_prazo_de(v_p.empresa_id, now())
      where lead_id = v_p.lead_id;
      continue;
    end if;
    -- confere de novo: pode ter respondido entre o gatilho e agora
    if exists (select 1 from public.mensagens m join public.conversas c on c.id = m.conversa_id
               where c.lead_id = v_p.lead_id and m.direcao = 'saida' and m.criado_em >= v_p.atribuido_em) then
      delete from privado.crm_prazo_resposta where lead_id = v_p.lead_id;
      continue;
    end if;
    if not exists (select 1 from public.leads l where l.id = v_p.lead_id
                   and l.responsavel_id = v_p.responsavel_id and l.etapa not in ('cliente','perdido')) then
      delete from privado.crm_prazo_resposta where lead_id = v_p.lead_id;
      continue;
    end if;

    update public.leads set responsavel_id = null where id = v_p.lead_id;
    v_achou := privado.crm_distribuir_lead(v_p.empresa_id, v_p.lead_id, v_p.canal);
    if v_achou then
      v_repassados := v_repassados + 1;
      -- o gatilho recriou a linha com repasses zerado; a contagem tem que sobreviver ao repasse
      update privado.crm_prazo_resposta set repasses = v_p.repasses + 1 where lead_id = v_p.lead_id;
    else
      -- ninguém disponível: volta para a fila de espera e para de cobrar
      insert into privado.crm_distribuicao_pendentes (empresa_id, lead_id, canal)
      values (v_p.empresa_id, v_p.lead_id, v_p.canal) on conflict (lead_id) do nothing;
      delete from privado.crm_prazo_resposta where lead_id = v_p.lead_id;
    end if;
  end loop;
  return v_repassados;
end;
$$;
revoke all on function privado.crm_cobrar_prazos() from public, anon, authenticated;

select cron.schedule('crm-cobrar-prazos', '* * * * *', $cron$ select privado.crm_cobrar_prazos(); $cron$);

-- =========================================================
-- Ocupado e offline não recebem, em nenhum modo
-- =========================================================
-- Mudança de comportamento combinada com o Douglas em 24/09/2026: antes, no modo fila,
-- a disponibilidade era ignorada e o rodízio entregava para quem estivesse offline.
create or replace function privado.crm_distribuir_lead(p_empresa uuid, p_lead uuid, p_canal text default 'padrao')
returns boolean language plpgsql security definer set search_path = '' as $$
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
      and exists(select 1 from privado.crm_disponibilidade a where a.empresa_id=p_empresa and a.user_id=d.user_id and a.disponivel)
      and exists(select 1 from privado.crm_presencas s where s.empresa_id=p_empresa and s.user_id=d.user_id and s.visto_em>clock_timestamp()-interval '90 seconds')
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

-- =========================================================
-- Telas
-- =========================================================
create function public.crm_obter_atendimento(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  select jsonb_build_object('ativo', coalesce(a.ativo, false), 'fuso', coalesce(a.fuso, 'America/Sao_Paulo'),
    'horarios', coalesce(a.horarios, '{}'::jsonb), 'minutos_resposta', coalesce(a.minutos_resposta, 10),
    'minutos_apos_abertura', coalesce(a.minutos_apos_abertura, 30), 'revisao', coalesce(a.revisao, 0),
    'aberto_agora', privado.crm_dentro_do_horario(p_empresa, now()),
    'proxima_abertura', privado.crm_proxima_abertura(p_empresa, now()),
    'aguardando', (select count(*) from privado.crm_prazo_resposta p where p.empresa_id = p_empresa))
  into v from (select 1) x left join privado.crm_atendimento a on a.empresa_id = p_empresa;
  return v;
end;
$$;

create function public.crm_salvar_atendimento(p_empresa uuid, p_ativo boolean, p_horarios jsonb,
  p_minutos_resposta integer, p_minutos_apos_abertura integer, p_revisao bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_revisao bigint; v_dia text; v_par jsonb;
begin
  perform privado.crm_validar_admin_distribuicao(p_empresa);
  if p_horarios is null or jsonb_typeof(p_horarios) <> 'object' then raise exception 'horario_invalido'; end if;
  for v_dia, v_par in select * from jsonb_each(p_horarios) loop
    if v_dia !~ '^[0-6]$' then raise exception 'horario_invalido'; end if;
    if jsonb_typeof(v_par) <> 'null' then
      if jsonb_typeof(v_par) <> 'array' or jsonb_array_length(v_par) <> 2
        or (v_par->>0) !~ '^\d{2}:\d{2}$' or (v_par->>1) !~ '^\d{2}:\d{2}$'
        or (v_par->>0)::time >= (v_par->>1)::time then raise exception 'horario_invalido'; end if;
    end if;
  end loop;
  if p_minutos_resposta not between 1 and 240 or p_minutos_apos_abertura not between 0 and 240 then
    raise exception 'prazo_invalido'; end if;

  insert into privado.crm_atendimento (empresa_id) values (p_empresa) on conflict do nothing;
  select revisao into v_revisao from privado.crm_atendimento where empresa_id = p_empresa for update;
  if p_revisao is distinct from v_revisao then raise exception 'configuracao_alterada'; end if;

  update privado.crm_atendimento set ativo = coalesce(p_ativo, false), horarios = p_horarios,
    minutos_resposta = p_minutos_resposta, minutos_apos_abertura = p_minutos_apos_abertura,
    revisao = revisao + 1 where empresa_id = p_empresa;
  -- desligar o horário encerra as cobranças em aberto
  if not coalesce(p_ativo, false) then delete from privado.crm_prazo_resposta where empresa_id = p_empresa; end if;
  return public.crm_obter_atendimento(p_empresa);
end;
$$;

-- Quem pode atender nesta empresa e como está agora. Serve para escolher para quem transferir.
create function public.crm_atendentes(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email,
    'papel', m.papel, 'estado', case
      when not exists (select 1 from privado.crm_presencas s where s.empresa_id = m.empresa_id
        and s.user_id = m.user_id and s.visto_em > clock_timestamp() - interval '90 seconds') then 'offline'
      when coalesce((select a.disponivel from privado.crm_disponibilidade a
        where a.empresa_id = m.empresa_id and a.user_id = m.user_id), false) then 'online'
      else 'ocupado' end) order by u.email), '[]'::jsonb)
  from public.membros m join auth.users u on u.id = m.user_id
  where m.empresa_id = p_empresa and m.papel in ('dono','gestor','vendedor')
    and privado.pode_ver_empresa(p_empresa);
$$;

-- Transferência feita pelo próprio atendente, sem passar pelo gestor.
create function public.crm_transferir_lead(p_lead uuid, p_para uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lead public.leads;
begin
  if not coalesce(privado.crm_sessao_ok(), false) then raise exception 'sem_acesso'; end if;
  select * into v_lead from public.leads where id = p_lead for update;
  if not found then raise exception 'lead_inexistente'; end if;
  if not privado.pode_editar_lead(v_lead.empresa_id, v_lead.responsavel_id) then raise exception 'sem_permissao'; end if;
  if p_para is null or p_para = v_lead.responsavel_id then raise exception 'destino_invalido'; end if;
  if not exists (select 1 from public.membros m where m.empresa_id = v_lead.empresa_id
    and m.user_id = p_para and m.papel in ('dono','gestor','vendedor')) then raise exception 'destino_invalido'; end if;

  update public.leads set responsavel_id = p_para where id = p_lead;
  insert into privado.crm_distribuicao_log (empresa_id, lead_id, responsavel_id, modo, canal)
  values (v_lead.empresa_id, p_lead, p_para, 'transferencia',
    coalesce((select canal from privado.crm_prazo_resposta where lead_id = p_lead), 'padrao'));
  return jsonb_build_object('ok', true, 'responsavel_id', p_para);
end;
$$;

revoke execute on function public.crm_obter_atendimento(uuid),
  public.crm_salvar_atendimento(uuid, boolean, jsonb, integer, integer, bigint),
  public.crm_atendentes(uuid), public.crm_transferir_lead(uuid, uuid) from public, anon;
grant execute on function public.crm_obter_atendimento(uuid),
  public.crm_salvar_atendimento(uuid, boolean, jsonb, integer, integer, bigint),
  public.crm_atendentes(uuid), public.crm_transferir_lead(uuid, uuid) to authenticated;

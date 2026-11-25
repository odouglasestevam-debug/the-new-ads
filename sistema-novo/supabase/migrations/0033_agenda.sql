-- Agenda do atendimento (pedido do Douglas em 24/11/2026):
--  1. Mensagem agendada: a pessoa escreve agora e a mensagem sai pelo WhatsApp da empresa no dia e
--     hora marcados, com o nome de quem agendou.
--  2. Lembrete: o vendedor marca dia e hora para retomar um lead e recebe a notificação no celular.
--
-- O relógio de cada minuto (crm-agenda) faz duas coisas:
--  - lembrete vencido vira aviso na mesma fila de notificação da 0025/0032;
--  - havendo mensagem para sair, chama a Edge Function crm-agenda, que envia pelo mesmo código
--    do botão Enviar (mesma janela de 24h da API oficial, mesma conferência de permissão).
-- Quando não há nada para fazer, nada é chamado: o relógio só lê duas tabelas pequenas.
--
-- Regras que não estão escritas em outro lugar:
--  - Permissão para agendar mensagem é a mesma de responder o lead. Na hora de sair, a Edge Function
--    confere de novo: se quem agendou não pode mais responder (lead mudou de dono), a mensagem não sai
--    e quem agendou recebe aviso.
--  - Mensagem atrasada mais de 6 horas (sistema fora do ar) não sai: um "bom dia" às 22h é pior que nada.
--  - Lead que muda de responsável leva junto os lembretes que eram do responsável anterior.
--  - Opção "não enviar se o lead responder antes": a resposta do lead cancela a mensagem agendada.

-- Trava: depende da fila com reserva da 0032.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'privado' and table_name = 'crm_avisos' and column_name = 'reservado_em') then
    raise exception 'falta_0032: privado.crm_avisos.reservado_em';
  end if;
end $$;

-- Dois tipos novos na fila de avisos: lembrete e mensagem agendada que não saiu.
do $$
declare v_nome text;
begin
  for v_nome in
    select conname from pg_constraint
    where conrelid = 'privado.crm_avisos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%lead_atribuido%'
  loop
    execute format('alter table privado.crm_avisos drop constraint %I', v_nome);
  end loop;
end $$;
alter table privado.crm_avisos add constraint crm_avisos_tipo_check
  check (tipo in ('lead_atribuido', 'mensagem', 'lembrete', 'agendamento'));

-- =========================================================
-- Tabelas
-- =========================================================
create table public.mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),   -- vira o id da mensagem enviada: repetir não duplica
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  lead_id uuid not null,
  autor_id uuid not null references auth.users (id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 4096),
  enviar_em timestamptz not null,
  cancelar_se_responder boolean not null default false,
  status text not null default 'agendada'
    check (status in ('agendada', 'enviando', 'enviada', 'falhou', 'cancelada')),
  erro text,
  tentativas integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index mensagens_agendadas_fila_idx on public.mensagens_agendadas (enviar_em) where status in ('agendada', 'enviando');
create index mensagens_agendadas_conversa_idx on public.mensagens_agendadas (conversa_id, enviar_em);
create index mensagens_agendadas_empresa_idx on public.mensagens_agendadas (empresa_id, status);
create index mensagens_agendadas_autor_idx on public.mensagens_agendadas (autor_id) where status = 'agendada';

create table public.lembretes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  lead_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,   -- quem é lembrado
  criado_por uuid references auth.users (id) on delete set null,
  quando timestamptz not null,
  nota text not null check (length(btrim(nota)) between 1 and 500),
  status text not null default 'pendente' check (status in ('pendente', 'avisado', 'concluido', 'cancelado')),
  avisado_em timestamptz,
  encerrado_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (lead_id, empresa_id) references public.leads (id, empresa_id) on delete cascade
);
create index lembretes_fila_idx on public.lembretes (quando) where status = 'pendente';
create index lembretes_empresa_idx on public.lembretes (empresa_id, status, quando);
create index lembretes_lead_idx on public.lembretes (lead_id);
create index lembretes_user_idx on public.lembretes (user_id) where status in ('pendente', 'avisado');

-- Quem vê o lead vê as mensagens agendadas da conversa dele (como vê o histórico).
-- Lembrete é pessoal: cada um vê os seus; dono, gestor e agência veem os da equipe.
alter table public.mensagens_agendadas enable row level security;
alter table public.lembretes enable row level security;
create policy mensagens_agendadas_ver on public.mensagens_agendadas for select to authenticated
  using (privado.pode_ver_lead_id(lead_id));
create policy lembretes_ver on public.lembretes for select to authenticated
  using (privado.pode_ver_lead_id(lead_id) and (
    user_id = (select auth.uid()) or privado.eh_agencia()
    or privado.papel_na_empresa(empresa_id) in ('dono', 'gestor')));
-- Navegador só lê. Gravar passa pelas funções abaixo, que conferem permissão e limites.
revoke all on public.mensagens_agendadas, public.lembretes from anon;
revoke insert, update, delete on public.mensagens_agendadas, public.lembretes from authenticated;

-- =========================================================
-- Mensagem agendada: o que a tela chama
-- =========================================================
create function privado.crm_texto_agendado(p_texto text) returns text
language plpgsql immutable set search_path = '' as $$
declare v_texto text := btrim(coalesce(p_texto, ''));
begin
  if v_texto = '' or length(v_texto) > 4096 then raise exception 'texto_invalido'; end if;
  return v_texto;
end;
$$;
revoke all on function privado.crm_texto_agendado(text) from public, anon, authenticated;

create function public.crm_agendar_mensagem(p_conversa uuid, p_texto text, p_enviar_em timestamptz,
  p_cancelar_se_responder boolean default false)
returns public.mensagens_agendadas
language plpgsql security definer set search_path = '' as $$
declare v_conversa public.conversas; v_lead public.leads; v_texto text; v_nova public.mensagens_agendadas;
begin
  perform privado.exigir_limite_crm('gravacao');
  select * into v_conversa from public.conversas where id = p_conversa;
  if v_conversa.id is null then raise exception 'nao_encontrado'; end if;
  select * into v_lead from public.leads where id = v_conversa.lead_id;
  if not coalesce(privado.pode_editar_lead(v_lead.empresa_id, v_lead.responsavel_id), false) then
    raise exception 'sem_permissao';
  end if;
  v_texto := privado.crm_texto_agendado(p_texto);
  -- até 2 min no passado vale como "agora" (relógio do aparelho adiantado ou atrasado)
  if p_enviar_em is null or p_enviar_em < now() - interval '2 minutes' or p_enviar_em > now() + interval '180 days' then
    raise exception 'horario_invalido';
  end if;
  if (select count(*) from public.mensagens_agendadas where conversa_id = p_conversa and status = 'agendada') >= 20
     or (select count(*) from public.mensagens_agendadas where autor_id = auth.uid() and status = 'agendada') >= 300 then
    raise exception 'limite_agendamentos';
  end if;
  insert into public.mensagens_agendadas (empresa_id, conversa_id, lead_id, autor_id, texto, enviar_em, cancelar_se_responder)
  values (v_conversa.empresa_id, v_conversa.id, v_lead.id, auth.uid(), v_texto, p_enviar_em, coalesce(p_cancelar_se_responder, false))
  returning * into v_nova;
  return v_nova;
end;
$$;

-- Editar texto, horário ou a opção de cancelar. Quem edita passa a ser o autor (a mensagem sai no nome dele).
create function public.crm_reagendar_mensagem(p_id uuid, p_texto text, p_enviar_em timestamptz,
  p_cancelar_se_responder boolean default false)
returns public.mensagens_agendadas
language plpgsql security definer set search_path = '' as $$
declare v_atual public.mensagens_agendadas; v_lead public.leads; v_texto text; v_saida public.mensagens_agendadas;
begin
  perform privado.exigir_limite_crm('gravacao');
  select * into v_atual from public.mensagens_agendadas where id = p_id for update;
  if v_atual.id is null then raise exception 'nao_encontrado'; end if;
  select * into v_lead from public.leads where id = v_atual.lead_id;
  if not coalesce(privado.pode_editar_lead(v_lead.empresa_id, v_lead.responsavel_id), false) then
    raise exception 'sem_permissao';
  end if;
  if v_atual.status <> 'agendada' then raise exception 'nao_agendada'; end if;
  v_texto := privado.crm_texto_agendado(p_texto);
  if p_enviar_em is null or p_enviar_em < now() - interval '2 minutes' or p_enviar_em > now() + interval '180 days' then
    raise exception 'horario_invalido';
  end if;
  update public.mensagens_agendadas
     set texto = v_texto, enviar_em = p_enviar_em, cancelar_se_responder = coalesce(p_cancelar_se_responder, false),
         autor_id = auth.uid(), erro = null, atualizado_em = now()
   where id = p_id
  returning * into v_saida;
  return v_saida;
end;
$$;

create function public.crm_cancelar_mensagem_agendada(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_atual public.mensagens_agendadas; v_lead public.leads;
begin
  perform privado.exigir_limite_crm('gravacao');
  select * into v_atual from public.mensagens_agendadas where id = p_id for update;
  if v_atual.id is null then raise exception 'nao_encontrado'; end if;
  select * into v_lead from public.leads where id = v_atual.lead_id;
  -- quem agendou sempre pode desistir; os outros, se puderem responder o lead
  if v_atual.autor_id is distinct from auth.uid()
     and not coalesce(privado.pode_editar_lead(v_lead.empresa_id, v_lead.responsavel_id), false) then
    raise exception 'sem_permissao';
  end if;
  update public.mensagens_agendadas set status = 'cancelada', atualizado_em = now()
   where id = p_id and status = 'agendada';
  return found;
end;
$$;

-- =========================================================
-- Lembrete: o que a tela chama
-- =========================================================
create function public.crm_criar_lembrete(p_lead uuid, p_quando timestamptz, p_nota text, p_para uuid default null)
returns public.lembretes
language plpgsql security definer set search_path = '' as $$
declare v_lead public.leads; v_para uuid := coalesce(p_para, auth.uid()); v_nota text := btrim(coalesce(p_nota, ''));
  v_novo public.lembretes;
begin
  perform privado.exigir_limite_crm('gravacao');
  select * into v_lead from public.leads where id = p_lead;
  if v_lead.id is null then raise exception 'nao_encontrado'; end if;
  if not coalesce(privado.pode_editar_lead(v_lead.empresa_id, v_lead.responsavel_id), false) then
    raise exception 'sem_permissao';
  end if;
  -- Para outra pessoa, só quem cuida da equipe marca, e só para quem atende o lead ou para dono e gestor.
  if v_para <> auth.uid() then
    if not (privado.eh_agencia() or privado.papel_na_empresa(v_lead.empresa_id) in ('dono', 'gestor')) then
      raise exception 'sem_permissao';
    end if;
    if not exists (select 1 from public.membros m where m.empresa_id = v_lead.empresa_id and m.user_id = v_para
                     and (m.user_id = v_lead.responsavel_id or m.papel in ('dono', 'gestor'))) then
      raise exception 'destino_invalido';
    end if;
  end if;
  if v_nota = '' or length(v_nota) > 500 then raise exception 'nota_invalida'; end if;
  if p_quando is null or p_quando < now() - interval '2 minutes' or p_quando > now() + interval '400 days' then
    raise exception 'horario_invalido';
  end if;
  if (select count(*) from public.lembretes where user_id = v_para and status = 'pendente') >= 2000 then
    raise exception 'limite_lembretes';
  end if;
  insert into public.lembretes (empresa_id, lead_id, user_id, criado_por, quando, nota)
  values (v_lead.empresa_id, v_lead.id, v_para, auth.uid(), p_quando, v_nota)
  returning * into v_novo;
  return v_novo;
end;
$$;

-- concluir, cancelar ou adiar (adiar aceita nota nova). Quem vê o lembrete pode mexer nele.
create function public.crm_atualizar_lembrete(p_id uuid, p_acao text, p_quando timestamptz default null,
  p_nota text default null)
returns public.lembretes
language plpgsql security definer set search_path = '' as $$
declare v_atual public.lembretes; v_saida public.lembretes; v_nota text;
begin
  perform privado.exigir_limite_crm('gravacao');
  select * into v_atual from public.lembretes where id = p_id for update;
  if v_atual.id is null then raise exception 'nao_encontrado'; end if;
  if not (coalesce(privado.pode_ver_lead_id(v_atual.lead_id), false) and (
      v_atual.user_id = auth.uid() or privado.eh_agencia()
      or privado.papel_na_empresa(v_atual.empresa_id) in ('dono', 'gestor'))) then
    raise exception 'sem_permissao';
  end if;
  if v_atual.status not in ('pendente', 'avisado') then raise exception 'lembrete_encerrado'; end if;
  if p_acao = 'concluir' then
    update public.lembretes set status = 'concluido', encerrado_em = now() where id = p_id returning * into v_saida;
  elsif p_acao = 'cancelar' then
    update public.lembretes set status = 'cancelado', encerrado_em = now() where id = p_id returning * into v_saida;
  elsif p_acao = 'adiar' then
    if p_quando is null or p_quando < now() - interval '2 minutes' or p_quando > now() + interval '400 days' then
      raise exception 'horario_invalido';
    end if;
    v_nota := btrim(coalesce(p_nota, v_atual.nota));
    if v_nota = '' or length(v_nota) > 500 then raise exception 'nota_invalida'; end if;
    update public.lembretes set quando = p_quando, nota = v_nota, status = 'pendente', avisado_em = null
     where id = p_id returning * into v_saida;
  else
    raise exception 'acao_invalida';
  end if;
  return v_saida;
end;
$$;

revoke execute on function
  public.crm_agendar_mensagem(uuid, text, timestamptz, boolean),
  public.crm_reagendar_mensagem(uuid, text, timestamptz, boolean),
  public.crm_cancelar_mensagem_agendada(uuid),
  public.crm_criar_lembrete(uuid, timestamptz, text, uuid),
  public.crm_atualizar_lembrete(uuid, text, timestamptz, text)
  from public, anon;
grant execute on function
  public.crm_agendar_mensagem(uuid, text, timestamptz, boolean),
  public.crm_reagendar_mensagem(uuid, text, timestamptz, boolean),
  public.crm_cancelar_mensagem_agendada(uuid),
  public.crm_criar_lembrete(uuid, timestamptz, text, uuid),
  public.crm_atualizar_lembrete(uuid, text, timestamptz, text)
  to authenticated;

-- =========================================================
-- Gatilhos
-- =========================================================
-- "Não enviar se o lead responder antes": a resposta cancela o que estava esperando.
create function privado.crm_agenda_lead_respondeu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.direcao <> 'entrada' then return null; end if;
  update public.mensagens_agendadas
     set status = 'cancelada', erro = 'O lead respondeu antes do horário.', atualizado_em = now()
   where conversa_id = new.conversa_id and status = 'agendada' and cancelar_se_responder
     and criado_em < new.criado_em;
  return null;
end;
$$;
revoke all on function privado.crm_agenda_lead_respondeu() from public, anon, authenticated;
create trigger trg_crm_agenda_lead_respondeu after insert on public.mensagens
  for each row execute function privado.crm_agenda_lead_respondeu();

-- O retorno combinado vai junto com o lead: quem assume recebe os lembretes de quem atendia.
create function privado.crm_agenda_transferir_lembretes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.responsavel_id is null or new.responsavel_id is null
     or new.responsavel_id is not distinct from old.responsavel_id then return null; end if;
  update public.lembretes set user_id = new.responsavel_id
   where lead_id = new.id and user_id = old.responsavel_id and status in ('pendente', 'avisado');
  return null;
end;
$$;
revoke all on function privado.crm_agenda_transferir_lembretes() from public, anon, authenticated;
create trigger trg_crm_agenda_transferir_lembretes after update of responsavel_id on public.leads
  for each row execute function privado.crm_agenda_transferir_lembretes();

-- =========================================================
-- Servidor: fila de envio e aviso de falha
-- =========================================================
create function privado.crm_avisar_agendamento(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into privado.crm_avisos (user_id, empresa_id, lead_id, tipo, titulo, corpo, url)
  select a.autor_id, a.empresa_id, a.lead_id, 'agendamento', 'Mensagem agendada não saiu',
         coalesce(nullif(trim(l.nome), ''), l.telefone, 'Lead sem nome') || ': ' || left(coalesce(a.erro, 'erro desconhecido'), 160),
         'https://crm.thenewads.com.br/?lead=' || a.lead_id::text || '&conversa=' || a.conversa_id::text
    from public.mensagens_agendadas a
    join public.leads l on l.id = a.lead_id
    join public.empresas e on e.id = a.empresa_id and e.ativo
   where a.id = p_id;
$$;
revoke all on function privado.crm_avisar_agendamento(uuid) from public, anon, authenticated;

-- Reserva o que vai sair agora. Envio que ficou preso em "enviando" (servidor caiu no meio) volta
-- depois de 5 minutos com o mesmo id, e o envio não duplica. Três tentativas e desiste avisando.
create function public.crm_agendadas_reservar(p_limite integer default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_saida jsonb;
begin
  for v_id in
    update public.mensagens_agendadas
       set status = 'falhou', atualizado_em = now(),
           erro = 'O envio não foi confirmado. Confira a conversa antes de mandar de novo.'
     where status = 'enviando' and atualizado_em < now() - interval '5 minutes' and tentativas >= 3
    returning id
  loop perform privado.crm_avisar_agendamento(v_id); end loop;

  for v_id in
    update public.mensagens_agendadas
       set status = 'falhou', atualizado_em = now(),
           erro = 'Não saiu no horário marcado e o atraso passou de 6 horas. Agende de novo se ainda fizer sentido.'
     where status = 'agendada' and enviar_em < now() - interval '6 hours'
    returning id
  loop perform privado.crm_avisar_agendamento(v_id); end loop;

  with escolhidas as (
    select id from public.mensagens_agendadas
     where (status = 'agendada' and enviar_em <= now())
        or (status = 'enviando' and atualizado_em < now() - interval '5 minutes' and tentativas < 3)
     order by enviar_em, id
     limit greatest(1, least(coalesce(p_limite, 25), 100))
     for update skip locked
  ), reservadas as (
    update public.mensagens_agendadas a
       set status = 'enviando', tentativas = a.tentativas + 1, atualizado_em = now()
      from escolhidas e where a.id = e.id
    returning a.id, a.empresa_id, a.conversa_id, a.lead_id, a.autor_id, a.texto, a.enviar_em
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.enviar_em, r.id), '[]'::jsonb) into v_saida from reservadas r;
  return v_saida;
end;
$$;

-- p_tentar: falha passageira (banco ocupado, rede); volta para a fila enquanto houver tentativa.
create function public.crm_agendada_concluida(p_id uuid, p_ok boolean, p_erro text default null,
  p_tentar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  update public.mensagens_agendadas
     set status = case when p_ok then 'enviada' when p_tentar and tentativas < 3 then 'agendada' else 'falhou' end,
         erro = case when p_ok then null else left(coalesce(p_erro, 'O provedor recusou o envio.'), 500) end,
         atualizado_em = now()
   where id = p_id and status = 'enviando'
  returning status into v_status;
  if v_status = 'falhou' then perform privado.crm_avisar_agendamento(p_id); end if;
end;
$$;
revoke execute on function public.crm_agendadas_reservar(integer), public.crm_agendada_concluida(uuid, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.crm_agendadas_reservar(integer), public.crm_agendada_concluida(uuid, boolean, text, boolean)
  to service_role;

-- =========================================================
-- Relógio de cada minuto
-- =========================================================
create function privado.crm_rodar_agenda() returns void
language plpgsql security definer set search_path = '' as $$
declare v_avisos integer; v_segredo text;
begin
  -- lembrete vencido vira notificação para quem ainda está na empresa
  with devidos as (
    update public.lembretes set status = 'avisado', avisado_em = now()
     where status = 'pendente' and quando <= now()
    returning id, empresa_id, lead_id, user_id, nota
  ), novos as (
    insert into privado.crm_avisos (user_id, empresa_id, lead_id, tipo, titulo, corpo, url)
    select d.user_id, d.empresa_id, d.lead_id, 'lembrete',
           'Lembrete: ' || coalesce(nullif(trim(l.nome), ''), l.telefone, 'lead sem nome'),
           d.nota,
           'https://crm.thenewads.com.br/?lead=' || d.lead_id::text || coalesce('&conversa=' || (
             select c.id::text from public.conversas c where c.lead_id = d.lead_id
              order by c.ultima_mensagem_em desc limit 1), '')
      from devidos d
      join public.leads l on l.id = d.lead_id
      join public.empresas e on e.id = d.empresa_id and e.ativo
     where exists (select 1 from public.membros m where m.empresa_id = d.empresa_id and m.user_id = d.user_id)
        or exists (select 1 from public.agencia_admins a where a.user_id = d.user_id)
    returning 1
  )
  select count(*) into v_avisos from novos;

  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'crm_cron';
  if v_segredo is null then return; end if;

  if exists (select 1 from public.mensagens_agendadas
              where (status = 'agendada' and enviar_em <= now())
                 or (status = 'enviando' and atualizado_em < now() - interval '5 minutes')) then
    perform net.http_post(
      url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/crm-agenda',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  end if;
  -- lembrete não espera a volta do relógio de notificação
  if v_avisos > 0 then
    perform net.http_post(
      url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/crm-notificar',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;
revoke all on function privado.crm_rodar_agenda() from public, anon, authenticated;

select cron.schedule('crm-agenda', '* * * * *', $cron$ select privado.crm_rodar_agenda(); $cron$);

-- Histórico encerrado não serve para nada depois de alguns meses.
select cron.schedule('crm-limpar-agenda', '35 4 * * *', $cron$
  delete from public.mensagens_agendadas
   where status in ('enviada', 'cancelada', 'falhou') and atualizado_em < now() - interval '90 days';
  delete from public.lembretes
   where status in ('concluido', 'cancelado') and encerrado_em < now() - interval '180 days';
$cron$);

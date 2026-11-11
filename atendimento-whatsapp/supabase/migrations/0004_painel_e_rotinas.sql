-- Funções do painel (navegador, só quem passa em privado.atendimento_pode()),
-- funções da análise por IA (service_role), fechamento semanal e agendamentos.

create or replace function privado.atendimento_exigir() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.atendimento_pode() then raise exception 'sem_acesso' using errcode = '42501'; end if;
end $$;
revoke all on function privado.atendimento_exigir() from public, anon, authenticated;

-- ===================== Painel =====================

create or replace function public.atendimento_contas() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  return jsonb_build_object(
    'openai_configurada', exists (select 1 from vault.secrets where name = 'atendimento_openai'),
    'contas', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nome', c.nome, 'fuso', c.fuso, 'horario', c.horario, 'metas', c.metas,
      'instance_id', c.instance_id, 'instance_nome', c.instance_nome,
      'ultimo_evento_em', c.ultimo_evento_em, 'ultimo_evento_tipo', c.ultimo_evento_tipo,
      'webhook', 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/atendimento-webhook?c=' || c.slug || '&t=' || c.url_token,
      'mensagens', (select count(*) from atendimento.mensagens m where m.conta_id = c.id),
      'primeira_mensagem_em', (select min(m.enviada_em) from atendimento.mensagens m where m.conta_id = c.id),
      'ultima_mensagem_em', (select max(m.recebida_em) from atendimento.mensagens m where m.conta_id = c.id),
      'audios_pendentes', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.transcricao_status = 'pendente'),
      'audios_erro', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.transcricao_status = 'erro'),
      'ultimo_lote', (select jsonb_build_object('status', l.status, 'status_openai', l.status_openai, 'itens', l.itens,
          'criado_em', l.criado_em, 'concluido_em', l.concluido_em, 'erro', l.erro)
        from atendimento.lotes l order by l.criado_em desc limit 1)
    ) order by c.nome) from atendimento.contas c where c.ativo), '[]'));
end $$;

create or replace function public.atendimento_painel(p_conta uuid, p_de date, p_ate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  return atendimento.calcular(p_conta, p_de, p_ate);
end $$;

-- Atendimentos de um período com filtro, para conferir de onde sai cada número
create or replace function public.atendimento_lista(p_conta uuid, p_de date, p_ate date, p_filtro text default 'atendimentos')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c atendimento.contas; v_ini timestamptz; v_fim timestamptz; v_meta numeric; r jsonb;
begin
  perform privado.atendimento_exigir();
  select * into c from atendimento.contas where id = p_conta;
  if not found or p_ate < p_de or p_ate - p_de > 400 then raise exception 'periodo_invalido' using errcode = '22023'; end if;
  v_ini := p_de::timestamp at time zone c.fuso;
  v_fim := (p_ate + 1)::timestamp at time zone c.fuso;
  v_meta := coalesce((c.metas->>'primeira_resposta_min')::numeric, 15);

  with vaga as (select distinct v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta),
  a as (
    select a.*, a.contato in (select contato from vaga) eh_vaga
    from atendimento.v_atend a where a.conta_id = p_conta and a.inicio >= v_ini and a.inicio < v_fim
  ),
  pr as (
    select p.contato, p.atend_n, p.inicio, p.resposta_em, p.lida_em,
      case when p.resposta_em is not null then atendimento.minutos_uteis(c.horario, c.fuso, p.inicio, p.resposta_em) end util,
      case when p.resposta_em is not null then extract(epoch from p.resposta_em - p.inicio) / 60 end corrido
    from atendimento.v_pend p join a on a.contato = p.contato and a.atend_n = p.atend_n
    where p.conta_id = p_conta and p.primeira
  ),
  lei as (
    select p.contato, p.atend_n, bool_or(p.lida_em is not null and not p.encerramento
      and atendimento.minutos_uteis(c.horario, c.fuso, p.lida_em, coalesce(p.resposta_em, now())) > 30) viu_sem_responder
    from atendimento.v_pend p join a on a.contato = p.contato and a.atend_n = p.atend_n
    where p.conta_id = p_conta group by 1, 2
  ),
  orc as (
    select o.contato, o.atend_n,
      bool_or(s.sumiu) sumiu, bool_or(s.sumiu and o.prox_de_loja) retorno,
      bool_or(s.sumiu and o.prox_de_loja is not true) sem_retorno,
      min(extract(epoch from o.prox_inicio - o.fim) / 86400) filter (where s.sumiu and o.prox_de_loja) retorno_dias
    from atendimento.v_orcamentos o
    join a on a.contato = o.contato and a.atend_n = o.atend_n
    cross join lateral (select (o.prox_de_loja is true
        or (o.prox_de_loja = false and o.prox_inicio - o.fim > interval '24 hours')
        or (o.prox_inicio is null and now() - o.fim > interval '24 hours')) sumiu) s
    where o.conta_id = p_conta group by 1, 2
  ),
  linhas as (
    select a.*, pr.resposta_em, pr.util, pr.corrido, pr.lida_em primeira_lida_em, lei.viu_sem_responder,
      orc.sumiu, orc.retorno, orc.sem_retorno, orc.retorno_dias,
      cl.chamou_loja, cl.trecho_convite, cl.marcou_dia, cl.trecho_dia, cl.lido_ate
    from a
    left join pr on pr.contato = a.contato and pr.atend_n = a.atend_n
    left join lei on lei.contato = a.contato and lei.atend_n = a.atend_n
    left join orc on orc.contato = a.contato and orc.atend_n = a.atend_n
    left join atendimento.classificacoes cl on cl.conta_id = p_conta and cl.contato = a.contato and cl.inicio = a.inicio
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'contato', l.contato, 'nome', l.nome, 'inicio', l.inicio, 'fim', l.fim,
      'iniciado_pela_loja', l.iniciado_pela_loja, 'de_anuncio', l.de_anuncio, 'recrutamento', l.eh_vaga,
      'msgs_cliente', l.msgs_cliente, 'msgs_loja', l.msgs_loja, 'audios_loja', l.audios_loja, 'preco', l.preco,
      'resposta_em', l.resposta_em, 'util_min', round(l.util, 1), 'corrido_min', round(l.corrido, 1),
      'viu_sem_responder', l.viu_sem_responder,
      'orcamento_sumiu', l.sumiu, 'retorno', l.retorno, 'retorno_dias', round(l.retorno_dias, 1),
      'chamou_loja', l.chamou_loja, 'trecho_convite', l.trecho_convite, 'marcou_dia', l.marcou_dia, 'trecho_dia', l.trecho_dia,
      'ia_atualizada', l.lido_ate is not null and l.lido_ate >= l.fim
    ) order by l.inicio desc), '[]')
  into r
  from (select * from linhas l
  where case p_filtro
    when 'todos' then true
    when 'recrutamento' then l.eh_vaga
    when 'iniciados_pela_loja' then l.iniciado_pela_loja and not l.eh_vaga
    else not l.eh_vaga and case p_filtro
      when 'atendimentos' then not l.iniciado_pela_loja
      when 'anuncio' then not l.iniciado_pela_loja and l.de_anuncio
      when 'respondidos' then not l.iniciado_pela_loja and l.resposta_em is not null
      when 'sem_resposta' then not l.iniciado_pela_loja and l.resposta_em is null
      when 'ate_meta' then not l.iniciado_pela_loja and l.util <= v_meta
      when 'acima_meta' then not l.iniciado_pela_loja and (l.util > v_meta or l.resposta_em is null)
      when 'acima_24h' then not l.iniciado_pela_loja and (l.corrido > 1440 or (l.resposta_em is null and now() - l.inicio > interval '24 hours'))
      when 'viu_sem_responder' then l.viu_sem_responder
      when 'so_audio' then l.msgs_loja > 0 and l.audios_loja = l.msgs_loja
      when 'com_audio' then l.audios_loja > 0
      when 'com_preco' then l.preco
      when 'orcamento_sumiu' then l.sumiu
      when 'orcamento_com_retorno' then l.retorno
      when 'orcamento_sem_retorno' then l.sem_retorno
      when 'chamou' then l.chamou_loja
      when 'nao_chamou' then l.chamou_loja = false
      when 'marcou_dia' then l.marcou_dia
      when 'preco_sem_convite' then l.preco and l.chamou_loja = false
      when 'aguardando_ia' then not l.iniciado_pela_loja and l.msgs_loja > 0 and (l.lido_ate is null or l.lido_ate < l.fim)
      else false end
  end
  order by l.inicio desc limit 500) l;
  return r;
end $$;

create or replace function public.atendimento_conversa(p_conta uuid, p_contato text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'de_loja', m.de_loja, 'enviada_em', m.enviada_em, 'tipo', m.tipo, 'texto', m.texto,
      'transcricao', m.transcricao, 'transcricao_status', m.transcricao_status, 'audio_segundos', m.audio_segundos,
      'lida_em', m.lida_em, 'nome', m.nome_contato,
      'anuncio', case when m.anuncio is not null then jsonb_build_object('titulo', m.anuncio->>'title', 'url', m.anuncio->>'source_url') end
    ) order by m.enviada_em, m.id)
    from (select * from atendimento.mensagens x where x.conta_id = p_conta and x.contato = p_contato
          order by x.enviada_em desc, x.id desc limit 400) m), '[]');
end $$;

-- O que precisa de ação agora
create or replace function public.atendimento_filas(p_conta uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c atendimento.contas; j_esp jsonb; j_ret jsonb; j_conv jsonb;
begin
  perform privado.atendimento_exigir();
  select * into c from atendimento.contas where id = p_conta;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'contato', p.contato, 'nome', (select max(m.nome_contato) from atendimento.mensagens m where m.conta_id = p_conta and m.contato = p.contato),
      'desde', p.inicio, 'espera_corrida_min', round(extract(epoch from now() - p.inicio) / 60),
      'espera_util_min', round(atendimento.minutos_uteis(c.horario, c.fuso, p.inicio, now())),
      'lida_em', p.lida_em, 'de_anuncio', p.de_anuncio, 'primeira', p.primeira,
      'ultimo_texto', (select left(coalesce(m.texto, m.transcricao, '(' || m.tipo || ')'), 160) from atendimento.mensagens m
        where m.conta_id = p_conta and m.contato = p.contato and not m.de_loja and m.tipo <> 'reacao' order by m.enviada_em desc limit 1)
    ) order by p.inicio), '[]')
  into j_esp
  from atendimento.v_pend p
  where p.conta_id = p_conta and p.resposta_em is null and not p.encerramento and p.inicio > now() - interval '7 days'
    and p.contato not in (select v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta);

  -- Retorno de orçamento: D+1, D+3 e D+7 contados do último preço sem resposta do cliente
  with ult as (
    select s.contato, max(s.enviada_em) filter (where not s.de_loja) ult_cliente
    from atendimento.v_seq s where s.conta_id = p_conta group by s.contato
  ), orc as (
    select t.contato, max(t.fim) orc_em
    from atendimento.v_turnos t join ult on ult.contato = t.contato
    where t.conta_id = p_conta and t.de_loja and t.preco and t.fim > coalesce(ult.ult_cliente, '-infinity'::timestamptz)
    group by t.contato
  ), f as (
    select o.*, (select count(*) from atendimento.v_turnos t2
                 where t2.conta_id = p_conta and t2.contato = o.contato and t2.de_loja and t2.inicio > o.orc_em) retornos
    from orc o
  ), g as (
    select f.*, case f.retornos when 0 then 1 when 1 then 3 else 7 end previsto from f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'contato', g.contato, 'nome', (select max(m.nome_contato) from atendimento.mensagens m where m.conta_id = p_conta and m.contato = g.contato),
      'orcamento_em', g.orc_em, 'dias', round(extract(epoch from now() - g.orc_em) / 86400, 1),
      'retornos_feitos', g.retornos, 'etapa', 'D+' || g.previsto,
      'preco', (select left(coalesce(m.texto, m.transcricao), 160) from atendimento.mensagens m
        where m.conta_id = p_conta and m.contato = g.contato and m.de_loja and m.enviada_em <= g.orc_em
          and atendimento.tem_preco(coalesce(m.texto, '') || ' ' || coalesce(m.transcricao, ''))
        order by m.enviada_em desc limit 1)
    ) order by g.orc_em), '[]')
  into j_ret
  from g
  where g.retornos < 3 and now() - g.orc_em >= make_interval(days => g.previsto) and now() - g.orc_em < interval '12 days'
    and g.contato not in (select v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta);

  select coalesce(jsonb_agg(jsonb_build_object(
      'contato', a.contato, 'nome', a.nome, 'inicio', a.inicio, 'fim', a.fim, 'de_anuncio', a.de_anuncio,
      'preco', (select left(coalesce(m.texto, m.transcricao), 160) from atendimento.mensagens m
        where m.conta_id = p_conta and m.contato = a.contato and m.de_loja and m.enviada_em between a.inicio and a.fim
          and atendimento.tem_preco(coalesce(m.texto, '') || ' ' || coalesce(m.transcricao, ''))
        order by m.enviada_em desc limit 1)
    ) order by a.fim desc), '[]')
  into j_conv
  from atendimento.v_atend a
  join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio
  where a.conta_id = p_conta and a.preco and cl.chamou_loja = false and a.fim > now() - interval '14 days'
    and a.contato not in (select v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta);

  return jsonb_build_object('esperando', j_esp, 'retornos', j_ret, 'sem_convite', j_conv);
end $$;

create or replace function public.atendimento_semanas(p_conta uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  return coalesce((select jsonb_agg(jsonb_build_object('semana', s.semana, 'metricas', s.metricas, 'fechada_em', s.fechada_em)
    order by s.semana desc) from (select * from atendimento.semanas where conta_id = p_conta order by semana desc limit 52) s), '[]');
end $$;

create or replace function public.atendimento_salvar_config(p_conta uuid, p_horario jsonb, p_metas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d int; v jsonb; k text;
begin
  perform privado.atendimento_exigir();
  if jsonb_typeof(p_horario) <> 'object' or jsonb_typeof(p_metas) <> 'object' then raise exception 'config_invalida'; end if;
  for d in 0..6 loop
    v := p_horario -> d::text;
    if v is not null and jsonb_typeof(v) <> 'null' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 2
         or (v->>0) !~ '^([01]\d|2[0-3]):[0-5]\d$' or (v->>1) !~ '^([01]\d|2[0-3]):[0-5]\d$' or (v->>0) >= (v->>1) then
        raise exception 'horario_invalido' using errcode = '22023';
      end if;
    end if;
  end loop;
  for k in select jsonb_object_keys(p_metas) loop
    if k not in ('primeira_resposta_min', 'resposta_24h_pct', 'retorno_pct', 'convite_pct', 'dia_marcado_pct', 'audio_max_pct')
       or jsonb_typeof(p_metas->k) <> 'number' or (p_metas->>k)::numeric < 0 or (p_metas->>k)::numeric > 1440 then
      raise exception 'meta_invalida' using errcode = '22023';
    end if;
  end loop;
  update atendimento.contas set
    horario = (select jsonb_object_agg(d2::text, coalesce(p_horario -> d2::text, 'null'::jsonb)) from generate_series(0, 6) d2),
    metas = metas || p_metas
  where id = p_conta;
end $$;

create or replace function public.atendimento_salvar_chave_openai(p_chave text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform privado.atendimento_exigir();
  if p_chave is null or p_chave !~ '^sk-[A-Za-z0-9_\-]{20,300}$' then
    raise exception 'chave_invalida' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'atendimento_openai';
  if v_id is null then
    perform vault.create_secret(p_chave, 'atendimento_openai', 'Chave da OpenAI do monitor de atendimento');
  else
    perform vault.update_secret(v_id, p_chave);
  end if;
end $$;

revoke all on function public.atendimento_contas() from public, anon;
revoke all on function public.atendimento_painel(uuid, date, date) from public, anon;
revoke all on function public.atendimento_lista(uuid, date, date, text) from public, anon;
revoke all on function public.atendimento_conversa(uuid, text) from public, anon;
revoke all on function public.atendimento_filas(uuid) from public, anon;
revoke all on function public.atendimento_semanas(uuid) from public, anon;
revoke all on function public.atendimento_salvar_config(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.atendimento_salvar_chave_openai(text) from public, anon;
grant execute on function public.atendimento_contas() to authenticated;
grant execute on function public.atendimento_painel(uuid, date, date) to authenticated;
grant execute on function public.atendimento_lista(uuid, date, date, text) to authenticated;
grant execute on function public.atendimento_conversa(uuid, text) to authenticated;
grant execute on function public.atendimento_filas(uuid) to authenticated;
grant execute on function public.atendimento_semanas(uuid) to authenticated;
grant execute on function public.atendimento_salvar_config(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.atendimento_salvar_chave_openai(text) to authenticated;

-- ===================== Análise por IA (service_role) =====================

-- Atendimentos com mensagem nova desde a última leitura da IA
create or replace function public.atendimento_para_classificar(p_limite integer default 300)
returns table (chave text, lido_ate timestamptz, loja text, conversa text)
language sql security definer set search_path = '' as $$
  select a.conta_id || '|' || a.contato || '|' || a.inicio::text, a.fim, c.nome,
    (select string_agg('[' || to_char(m.enviada_em at time zone c.fuso, 'DD/MM HH24:MI') || '] '
        || case when m.de_loja then 'Loja' else 'Cliente' end
        || case m.tipo
             when 'texto' then ': ' || left(coalesce(m.texto, ''), 1000)
             when 'audio' then case when m.transcricao is not null
               then ' (áudio transcrito, ' || coalesce(m.audio_segundos, 0) || 's): ' || left(m.transcricao, 1500)
               else ' (áudio de ' || coalesce(m.audio_segundos, 0) || 's, sem transcrição)' end
             when 'imagem' then ' (foto)' || coalesce(': ' || left(m.texto, 500), '')
             when 'video' then ' (vídeo)' || coalesce(': ' || left(m.texto, 500), '')
             when 'documento' then ' (arquivo)' || coalesce(': ' || left(m.texto, 200), '')
             when 'figurinha' then ' (figurinha)'
             when 'localizacao' then ' (localização)' || coalesce(': ' || left(m.texto, 200), '')
             else ' (' || m.tipo || ')' end,
        E'\n' order by m.enviada_em, m.id)
     from (select * from atendimento.mensagens x
           where x.conta_id = a.conta_id and x.contato = a.contato and x.tipo <> 'reacao'
             and x.enviada_em between a.inicio and a.fim
           order by x.enviada_em desc, x.id desc limit 150) m)
  from atendimento.v_atend a
  join atendimento.contas c on c.id = a.conta_id and c.ativo
  left join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio
  where a.msgs_loja > 0
    and a.fim > now() - interval '30 days'
    and (cl.contato is null or cl.lido_ate < a.fim)
    and not exists (select 1 from atendimento.v_contato_vaga v where v.conta_id = a.conta_id and v.contato = a.contato)
    -- espera a transcrição dos áudios recentes
    and not exists (select 1 from atendimento.mensagens x where x.conta_id = a.conta_id and x.contato = a.contato
      and x.transcricao_status = 'pendente' and x.recebida_em > now() - interval '6 hours')
    and not exists (select 1 from atendimento.lotes l where l.status = 'enviado'
      and l.chaves @> jsonb_build_array(jsonb_build_object('k', a.conta_id || '|' || a.contato || '|' || a.inicio::text)))
  order by a.fim
  limit least(greatest(p_limite, 1), 2000);
$$;

create or replace function public.atendimento_lote_criado(p_openai_lote text, p_arquivo text, p_modelo text, p_chaves jsonb)
returns uuid language sql security definer set search_path = '' as $$
  insert into atendimento.lotes (openai_lote, openai_arquivo, modelo, status, status_openai, itens, chaves)
  values (p_openai_lote, p_arquivo, p_modelo, 'enviado', 'validating', jsonb_array_length(p_chaves), p_chaves)
  returning id;
$$;

create or replace function public.atendimento_lotes_abertos()
returns table (id uuid, openai_lote text, modelo text)
language sql security definer set search_path = '' as $$
  select l.id, l.openai_lote, l.modelo from atendimento.lotes l where l.status = 'enviado' order by l.criado_em;
$$;

create or replace function public.atendimento_lote_atualizar(p_id uuid, p_status text, p_status_openai text, p_erro text)
returns void language sql security definer set search_path = '' as $$
  update atendimento.lotes set status = p_status, status_openai = p_status_openai, erro = left(p_erro, 1000),
    atualizado_em = now(), concluido_em = case when p_status <> 'enviado' then now() end
  where id = p_id;
$$;

-- p_itens: [{i, chamou_para_loja, trecho_convite, marcou_dia, trecho_dia, recrutamento}], i = posição em lotes.chaves
create or replace function public.atendimento_salvar_classificacoes(p_lote uuid, p_itens jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into atendimento.classificacoes as cl (conta_id, contato, inicio, lido_ate, chamou_loja, trecho_convite,
    marcou_dia, trecho_dia, recrutamento, modelo, lote_id, analisado_em)
  select split_part(y.k, '|', 1)::uuid, split_part(y.k, '|', 2), split_part(y.k, '|', 3)::timestamptz, y.ate,
    coalesce((it->>'chamou_para_loja')::boolean, false), nullif(left(it->>'trecho_convite', 300), ''),
    coalesce((it->>'marcou_dia')::boolean, false), nullif(left(it->>'trecho_dia', 300), ''),
    coalesce((it->>'recrutamento')::boolean, false), l.modelo, l.id, now()
  from jsonb_array_elements(p_itens) it
  join atendimento.lotes l on l.id = p_lote
  cross join lateral (select l.chaves -> ((it->>'i')::int) ch) x
  cross join lateral (select x.ch->>'k' k, (x.ch->>'ate')::timestamptz ate) y
  where y.k is not null
  on conflict (conta_id, contato, inicio) do update set
    lido_ate = excluded.lido_ate, chamou_loja = excluded.chamou_loja, trecho_convite = excluded.trecho_convite,
    marcou_dia = excluded.marcou_dia, trecho_dia = excluded.trecho_dia, recrutamento = excluded.recrutamento,
    modelo = excluded.modelo, lote_id = excluded.lote_id, analisado_em = excluded.analisado_em
  where cl.lido_ate <= excluded.lido_ate;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.atendimento_para_classificar(integer) from public, anon, authenticated;
revoke all on function public.atendimento_lote_criado(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.atendimento_lotes_abertos() from public, anon, authenticated;
revoke all on function public.atendimento_lote_atualizar(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.atendimento_salvar_classificacoes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.atendimento_para_classificar(integer) to service_role;
grant execute on function public.atendimento_lote_criado(text, text, text, jsonb) to service_role;
grant execute on function public.atendimento_lotes_abertos() to service_role;
grant execute on function public.atendimento_lote_atualizar(uuid, text, text, text) to service_role;
grant execute on function public.atendimento_salvar_classificacoes(uuid, jsonb) to service_role;

-- ===================== Histórico semanal =====================

-- Fecha a semana anterior (segunda a domingo) e guarda congelada. Roda na terça às 8h,
-- depois que o lote da IA de domingo teve as 24h dele.
create or replace function atendimento.fechar_semanas() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_seg date; v_desde timestamptz; n integer := 0;
begin
  for r in select id, fuso from atendimento.contas where ativo loop
    v_seg := date_trunc('week', now() at time zone r.fuso)::date - 7;
    select min(enviada_em) into v_desde from atendimento.mensagens where conta_id = r.id;
    continue when v_desde is null or v_desde >= (v_seg + 7)::timestamp at time zone r.fuso;
    insert into atendimento.semanas (conta_id, semana, metricas)
    values (r.id, v_seg, atendimento.calcular(r.id, v_seg, v_seg + 6)
      || jsonb_build_object('coleta_desde', v_desde, 'semana_parcial', v_desde > v_seg::timestamp at time zone r.fuso))
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function atendimento.fechar_semanas() from public, anon, authenticated;

-- ===================== Agendamentos =====================

select cron.schedule('atendimento-transcrever', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/atendimento-transcrever',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'atendimento_cron')),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
  where exists (select 1 from atendimento.mensagens where transcricao_status = 'pendente');
$cron$);

-- 04:00 de Brasília: manda o lote do dia anterior
select cron.schedule('atendimento-ia-enviar', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/atendimento-ia',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'atendimento_cron')),
    body := '{"acao":"enviar"}'::jsonb, timeout_milliseconds := 120000);
$cron$);

select cron.schedule('atendimento-ia-coletar', '*/30 * * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/atendimento-ia',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'atendimento_cron')),
    body := '{"acao":"coletar"}'::jsonb, timeout_milliseconds := 120000)
  where exists (select 1 from atendimento.lotes where status = 'enviado');
$cron$);

-- Terça 08:00 de Brasília
select cron.schedule('atendimento-fechar-semana', '0 11 * * 2', $cron$ select atendimento.fechar_semanas(); $cron$);

select cron.schedule('atendimento-limpeza', '40 6 * * *', $cron$
  update atendimento.mensagens set bruto = null where bruto is not null and recebida_em < now() - interval '30 days';
  delete from atendimento.leituras_pendentes where criado_em < now() - interval '7 days';
$cron$);

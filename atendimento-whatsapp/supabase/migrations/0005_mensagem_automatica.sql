-- Mensagem automática (saudação do anúncio da Meta "Oi! Como podemos ajudar?", mensagem de ausência):
-- fica guardada e aparece na conversa, mas não conta como resposta da loja nem entra nas contas.
-- Também: lista de textos automáticos editável na tela, IA lendo até 60 dias (pra cobrir o histórico importado).

alter table atendimento.contas add column if not exists textos_automaticos jsonb not null default '[]';
alter table atendimento.mensagens add column if not exists automatica boolean not null default false;

update atendimento.contas set textos_automaticos = '["Oi! Como podemos ajudar?"]'
where slug = 'sapataria-nacoes' and textos_automaticos = '[]'::jsonb;

create or replace function atendimento.eh_texto_automatico(p_conta uuid, p_texto text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_texto, '') <> '' and exists (
    select 1 from atendimento.contas c cross join lateral jsonb_array_elements_text(c.textos_automaticos) t(x)
    where c.id = p_conta and lower(btrim(t.x)) = lower(btrim(p_texto)));
$$;

create or replace function atendimento.marcar_automatica() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.automatica := new.de_loja and new.tipo = 'texto' and atendimento.eh_texto_automatico(new.conta_id, new.texto);
  return new;
end $$;
drop trigger if exists mensagens_automatica on atendimento.mensagens;
create trigger mensagens_automatica before insert on atendimento.mensagens
  for each row execute function atendimento.marcar_automatica();

update atendimento.mensagens m set automatica = true
where m.de_loja and m.tipo = 'texto' and not m.automatica and atendimento.eh_texto_automatico(m.conta_id, m.texto);

-- Sequência: sem reação e sem mensagem automática (as outras visões derivam desta)
create or replace view atendimento.v_seq with (security_invoker = true) as
with base as (
  select m.id, m.conta_id, m.contato, m.de_loja, m.enviada_em, m.tipo, m.texto, m.transcricao, m.transcricao_status,
    m.audio_segundos, m.anuncio, m.nome_contato, m.lida_em,
    lag(m.de_loja) over w ant_de_loja, lag(m.enviada_em) over w ant_em
  from atendimento.mensagens m
  where m.tipo <> 'reacao' and not m.automatica
  window w as (partition by m.conta_id, m.contato order by m.enviada_em, m.id)
), marcado as (
  select b.*,
    (b.ant_em is null or b.enviada_em - b.ant_em > interval '8 days')::int novo_atend,
    (b.ant_em is null or b.ant_de_loja is distinct from b.de_loja or b.enviada_em - b.ant_em > interval '12 hours')::int novo_turno,
    (not b.de_loja and (b.ant_de_loja is null or b.ant_de_loja or b.enviada_em - b.ant_em > interval '8 days'))::int nova_pend
  from base b
)
select x.*,
  sum(x.novo_atend) over w2 atend_n,
  sum(x.novo_turno) over w2 turno_n,
  sum(x.nova_pend) over w2 pend_n
from marcado x
window w2 as (partition by x.conta_id, x.contato order by x.enviada_em, x.id);

-- Cálculo: contagem de mensagens e formato também sem a automática
create or replace function atendimento.calcular(p_conta uuid, p_de date, p_ate date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c atendimento.contas;
  v_ini timestamptz; v_fim timestamptz; v_meta numeric;
  j_volume jsonb; j_resposta jsonb; j_durante jsonb; j_leitura jsonb; j_formato jsonb; j_retorno jsonb; j_loja jsonb; j_calor jsonb;
begin
  select * into c from atendimento.contas where id = p_conta;
  if not found then return null; end if;
  v_ini := p_de::timestamp at time zone c.fuso;
  v_fim := (p_ate + 1)::timestamp at time zone c.fuso;
  v_meta := coalesce((c.metas->>'primeira_resposta_min')::numeric, 15);

  create temporary table if not exists pg_temp._vaga (contato text primary key) on commit drop;
  truncate pg_temp._vaga;
  insert into pg_temp._vaga select distinct v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta;

  select jsonb_build_object(
    'atendimentos', count(*) filter (where not a.iniciado_pela_loja and v.contato is null),
    'de_anuncio', count(*) filter (where not a.iniciado_pela_loja and v.contato is null and a.de_anuncio),
    'iniciados_pela_loja', count(*) filter (where a.iniciado_pela_loja and v.contato is null),
    'recrutamento', count(*) filter (where v.contato is not null),
    'contatos', count(distinct a.contato) filter (where v.contato is null))
  into j_volume
  from atendimento.v_atend a left join pg_temp._vaga v on v.contato = a.contato
  where a.conta_id = p_conta and a.inicio >= v_ini and a.inicio < v_fim;

  select j_volume || jsonb_build_object(
    'mensagens_cliente', count(*) filter (where not m.de_loja),
    'mensagens_loja', count(*) filter (where m.de_loja))
  into j_volume
  from atendimento.mensagens m left join pg_temp._vaga v on v.contato = m.contato
  where m.conta_id = p_conta and m.tipo <> 'reacao' and not m.automatica and v.contato is null
    and m.enviada_em >= v_ini and m.enviada_em < v_fim;

  create temporary table if not exists pg_temp._pend on commit drop as select * from atendimento.v_pend limit 0;
  alter table pg_temp._pend add column if not exists iniciado_pela_loja boolean,
    add column if not exists util numeric, add column if not exists corrido numeric,
    add column if not exists ver_resp_util numeric, add column if not exists em_horario boolean;
  truncate pg_temp._pend;
  insert into pg_temp._pend
  select p.*, a.iniciado_pela_loja,
    case when p.resposta_em is not null then atendimento.minutos_uteis(c.horario, c.fuso, p.inicio, p.resposta_em) end,
    case when p.resposta_em is not null then extract(epoch from p.resposta_em - p.inicio) / 60 end,
    case when p.lida_em is not null then atendimento.minutos_uteis(c.horario, c.fuso, p.lida_em, coalesce(p.resposta_em, now())) end,
    atendimento.minutos_uteis(c.horario, c.fuso, p.inicio, p.inicio + interval '1 minute') > 0
  from atendimento.v_pend p
  join atendimento.v_atend a on a.conta_id = p.conta_id and a.contato = p.contato and a.atend_n = p.atend_n
  left join pg_temp._vaga v on v.contato = p.contato
  where p.conta_id = p_conta and v.contato is null and p.inicio >= v_ini and p.inicio < v_fim;

  select jsonb_build_object(
    'atendimentos', count(*),
    'respondidos', count(resposta_em),
    'sem_resposta', count(*) - count(resposta_em),
    'respondidos_24h', count(*) filter (where corrido <= 1440),
    'acima_24h', count(*) filter (where corrido > 1440 or (resposta_em is null and now() - inicio > interval '24 hours')),
    'ate_meta', count(*) filter (where util <= v_meta),
    'mediana_util_min', round(percentile_cont(0.5) within group (order by util)::numeric, 1),
    'mediana_corrida_min', round(percentile_cont(0.5) within group (order by corrido)::numeric, 1),
    'p90_util_min', round(percentile_cont(0.9) within group (order by util)::numeric, 1),
    'anuncio', jsonb_build_object(
      'atendimentos', count(*) filter (where de_anuncio),
      'respondidos', count(resposta_em) filter (where de_anuncio),
      'ate_meta', count(*) filter (where de_anuncio and util <= v_meta),
      'mediana_util_min', round((percentile_cont(0.5) within group (order by util) filter (where de_anuncio))::numeric, 1)))
  into j_resposta
  from pg_temp._pend where primeira and not iniciado_pela_loja;

  select jsonb_build_object(
    'pendencias', count(*),
    'sem_resposta', count(*) filter (where resposta_em is null and now() - inicio > interval '1 hour'),
    'mediana_util_min', round(percentile_cont(0.5) within group (order by util)::numeric, 1),
    'mediana_corrida_min', round(percentile_cont(0.5) within group (order by corrido)::numeric, 1))
  into j_durante
  from pg_temp._pend where not (primeira and not iniciado_pela_loja) and not encerramento;

  select jsonb_build_object(
    'pendencias', count(*),
    'com_leitura', count(lida_em),
    'mediana_ver_responder_util_min', round((percentile_cont(0.5) within group (order by ver_resp_util) filter (where resposta_em is not null))::numeric, 1),
    'viu_sem_responder', count(*) filter (where lida_em is not null and ver_resp_util > 30))
  into j_leitura
  from pg_temp._pend where not encerramento or (primeira and not iniciado_pela_loja);

  select jsonb_build_object(
    'mensagens', count(*),
    'texto', count(*) filter (where m.tipo = 'texto'),
    'audio', count(*) filter (where m.tipo = 'audio'),
    'imagem', count(*) filter (where m.tipo in ('imagem', 'video')),
    'outros', count(*) filter (where m.tipo not in ('texto', 'audio', 'imagem', 'video')),
    'audio_media_seg', round(avg(m.audio_segundos) filter (where m.tipo = 'audio'), 0),
    'audio_total_min', round(coalesce(sum(m.audio_segundos) filter (where m.tipo = 'audio'), 0) / 60.0, 1))
  into j_formato
  from atendimento.mensagens m left join pg_temp._vaga v on v.contato = m.contato
  where m.conta_id = p_conta and m.de_loja and m.tipo <> 'reacao' and not m.automatica and v.contato is null
    and m.enviada_em >= v_ini and m.enviada_em < v_fim;

  select j_formato || jsonb_build_object(
    'atendimentos_com_loja', count(*) filter (where a.msgs_loja > 0),
    'atendimentos_so_audio', count(*) filter (where a.msgs_loja > 0 and a.audios_loja = a.msgs_loja))
  into j_formato
  from atendimento.v_atend a left join pg_temp._vaga v on v.contato = a.contato
  where a.conta_id = p_conta and v.contato is null and a.inicio >= v_ini and a.inicio < v_fim;

  select jsonb_build_object(
    'orcamentos', count(*),
    'aguardando_24h', count(*) filter (where o.prox_inicio is null and now() - o.fim <= interval '24 hours'),
    'cliente_respondeu', count(*) filter (where o.prox_de_loja = false and o.prox_inicio - o.fim <= interval '24 hours'),
    'cliente_sumiu', count(*) filter (where s.sumiu),
    'com_retorno', count(*) filter (where s.sumiu and o.prox_de_loja),
    'retorno_ate_d1', count(*) filter (where s.sumiu and o.prox_de_loja and o.prox_inicio - o.fim <= interval '36 hours'),
    'retorno_ate_d3', count(*) filter (where s.sumiu and o.prox_de_loja and o.prox_inicio - o.fim <= interval '84 hours'),
    'retorno_ate_d7', count(*) filter (where s.sumiu and o.prox_de_loja and o.prox_inicio - o.fim <= interval '180 hours'),
    'sem_retorno', count(*) filter (where s.sumiu and o.prox_de_loja is not true))
  into j_retorno
  from atendimento.v_orcamentos o
  left join pg_temp._vaga v on v.contato = o.contato
  cross join lateral (select (o.prox_de_loja is true
      or (o.prox_de_loja = false and o.prox_inicio - o.fim > interval '24 hours')
      or (o.prox_inicio is null and now() - o.fim > interval '24 hours')) sumiu) s
  where o.conta_id = p_conta and v.contato is null and o.fim >= v_ini and o.fim < v_fim;

  select jsonb_build_object(
    'atendimentos', count(*),
    'analisados', count(cl.contato),
    'aguardando_ia', count(*) filter (where cl.contato is null or cl.lido_ate < a.fim),
    'chamou', count(*) filter (where cl.chamou_loja),
    'marcou_dia', count(*) filter (where cl.marcou_dia),
    'com_preco', count(*) filter (where a.preco),
    'com_preco_analisados', count(cl.contato) filter (where a.preco),
    'com_preco_chamou', count(*) filter (where a.preco and cl.chamou_loja),
    'com_preco_marcou_dia', count(*) filter (where a.preco and cl.marcou_dia),
    'com_preco_sem_convite', count(*) filter (where a.preco and cl.chamou_loja = false))
  into j_loja
  from atendimento.v_atend a
  left join pg_temp._vaga v on v.contato = a.contato
  left join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio
  where a.conta_id = p_conta and v.contato is null and not a.iniciado_pela_loja and a.msgs_loja > 0
    and a.inicio >= v_ini and a.inicio < v_fim;

  select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'hora', x.hora, 'n', x.n, 'sem_resposta', x.sem, 'mediana_util_min', x.med)
    order by x.dia, x.hora), '[]')
  into j_calor
  from (
    select extract(dow from inicio at time zone c.fuso)::int dia, extract(hour from inicio at time zone c.fuso)::int hora,
      count(*) n, count(*) - count(resposta_em) sem,
      round(percentile_cont(0.5) within group (order by util)::numeric, 1) med
    from pg_temp._pend where em_horario and not encerramento
    group by 1, 2
  ) x;

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'calculado_em', now(),
    'metas', c.metas,
    'volume', j_volume, 'resposta', j_resposta, 'durante', j_durante, 'leitura', j_leitura,
    'formato', j_formato, 'retorno', j_retorno, 'loja', j_loja, 'calor', j_calor);
end $$;
revoke all on function atendimento.calcular(uuid, date, date) from public, anon, authenticated;

-- Tela: contas devolve os textos automáticos; conversa marca a automática
create or replace function public.atendimento_contas() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  return jsonb_build_object(
    'avisos', coalesce((select jsonb_object_agg(a.chave, jsonb_build_object('valor', a.valor, 'em', a.em)) from atendimento.avisos a), '{}'),
    'contas', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nome', c.nome, 'fuso', c.fuso, 'horario', c.horario, 'metas', c.metas,
      'textos_automaticos', c.textos_automaticos,
      'instance_id', c.instance_id, 'instance_nome', c.instance_nome,
      'ultimo_evento_em', c.ultimo_evento_em, 'ultimo_evento_tipo', c.ultimo_evento_tipo,
      'webhook', 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/atendimento-webhook?c=' || c.slug || '&t=' || c.url_token,
      'mensagens', (select count(*) from atendimento.mensagens m where m.conta_id = c.id),
      'importadas', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.bruto->>'origem' = 'whatsapp_web'),
      'primeira_mensagem_em', (select min(m.enviada_em) from atendimento.mensagens m where m.conta_id = c.id),
      'ultima_mensagem_em', (select max(m.recebida_em) from atendimento.mensagens m where m.conta_id = c.id
        and coalesce(m.bruto->>'origem', '') <> 'whatsapp_web'),
      'audios_pendentes', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.transcricao_status = 'pendente'),
      'audios_erro', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.transcricao_status = 'erro'),
      'ultimo_lote', (select jsonb_build_object('status', l.status, 'status_openai', l.status_openai, 'itens', l.itens,
          'criado_em', l.criado_em, 'concluido_em', l.concluido_em, 'erro', l.erro)
        from atendimento.lotes l order by l.criado_em desc limit 1)
    ) order by c.nome) from atendimento.contas c where c.ativo), '[]'));
end $$;

create or replace function public.atendimento_conversa(p_conta uuid, p_contato text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'de_loja', m.de_loja, 'enviada_em', m.enviada_em, 'tipo', m.tipo, 'texto', m.texto,
      'transcricao', m.transcricao, 'transcricao_status', m.transcricao_status, 'audio_segundos', m.audio_segundos,
      'lida_em', m.lida_em, 'nome', m.nome_contato, 'automatica', m.automatica,
      'importada', m.bruto->>'origem' = 'whatsapp_web', 'parcial', (m.bruto->>'parcial')::boolean,
      'anuncio', case when m.anuncio is not null then jsonb_build_object('titulo', m.anuncio->>'title', 'url', m.anuncio->>'source_url') end
    ) order by m.enviada_em, m.id)
    from (select * from atendimento.mensagens x where x.conta_id = p_conta and x.contato = p_contato
          order by x.enviada_em desc, x.id desc limit 400) m), '[]');
end $$;

-- Configuração: horário, metas e textos automáticos (remarca as mensagens já guardadas)
drop function if exists public.atendimento_salvar_config(uuid, jsonb, jsonb);
create or replace function public.atendimento_salvar_config(p_conta uuid, p_horario jsonb, p_metas jsonb, p_textos jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
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
  if p_textos is not null and (jsonb_typeof(p_textos) <> 'array' or jsonb_array_length(p_textos) > 20
     or exists (select 1 from jsonb_array_elements(p_textos) e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 300)) then
    raise exception 'textos_invalidos' using errcode = '22023';
  end if;
  update atendimento.contas set
    horario = (select jsonb_object_agg(d2::text, coalesce(p_horario -> d2::text, 'null'::jsonb)) from generate_series(0, 6) d2),
    metas = metas || p_metas,
    textos_automaticos = coalesce(p_textos, textos_automaticos)
  where id = p_conta;
  if p_textos is not null then
    update atendimento.mensagens m set automatica = (m.de_loja and m.tipo = 'texto' and atendimento.eh_texto_automatico(m.conta_id, m.texto))
    where m.conta_id = p_conta and m.de_loja;
  end if;
end $$;
revoke all on function public.atendimento_salvar_config(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.atendimento_salvar_config(uuid, jsonb, jsonb, jsonb) to authenticated;

-- IA: marca a automática no texto e lê até 60 dias (cobre o histórico importado do WhatsApp Web)
create or replace function public.atendimento_para_classificar(p_limite integer default 300)
returns table (chave text, lido_ate timestamptz, loja text, conversa text)
language sql security definer set search_path = '' as $$
  select a.conta_id || '|' || a.contato || '|' || a.inicio::text, a.fim, c.nome,
    (select string_agg('[' || to_char(m.enviada_em at time zone c.fuso, 'DD/MM HH24:MI') || '] '
        || case when m.de_loja then case when m.automatica then 'Loja (mensagem automática)' else 'Loja' end else 'Cliente' end
        || case m.tipo
             when 'texto' then ': ' || left(coalesce(m.texto, ''), 1000)
             when 'audio' then case when m.transcricao is not null
               then ' (áudio transcrito, ' || coalesce(m.audio_segundos, 0) || 's): ' || left(m.transcricao, 1500)
               else ' (áudio de ' || coalesce(m.audio_segundos::text || 's', 'duração desconhecida') || ', sem transcrição)' end
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
    and a.fim > now() - interval '60 days'
    and (cl.contato is null or cl.lido_ate < a.fim)
    and not exists (select 1 from atendimento.v_contato_vaga v where v.conta_id = a.conta_id and v.contato = a.contato)
    and not exists (select 1 from atendimento.mensagens x where x.conta_id = a.conta_id and x.contato = a.contato
      and x.transcricao_status = 'pendente' and x.recebida_em > now() - interval '6 hours')
    and not exists (select 1 from atendimento.lotes l where l.status = 'enviado'
      and l.chaves @> jsonb_build_array(jsonb_build_object('k', a.conta_id || '|' || a.contato || '|' || a.inicio::text)))
  order by a.fim
  limit least(greatest(p_limite, 1), 2000);
$$;

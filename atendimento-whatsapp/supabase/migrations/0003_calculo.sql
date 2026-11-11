-- Regras de cálculo. As definições estão explicadas no README e na tela ("Como contamos").
--  - Atendimento: começa quando a conversa fica 8 dias sem mensagem (cobre o ciclo orçamento, retorno D+7, visita).
--  - Pendência: mensagens do cliente esperando a loja; termina na primeira mensagem da loja.
--  - Turno: mensagens seguidas do mesmo lado; mensagem da loja 12h depois da anterior, sem o cliente no meio, é retorno.
--  - Reação (emoji em cima da mensagem) não conta como mensagem nem como resposta.

create or replace function atendimento.tem_preco(t text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(t, '') ~* '(r\$\s*\d|\m\d{1,3}(\.\d{3})*,\d{2}\M|\m\d{2,5}\s*reais\M)';
$$;

create or replace function atendimento.parece_vaga(t text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(t, '') ~* '(\mvagas?\M|curr[ií]culo|\memprego\M|\mentrevista\M|sal[aá]rio|trabalhar (a[ií]|com voc|na loja|nessa loja))';
$$;

-- Mensagem curta que só encerra ("ok", "obrigada", figurinha): não exige resposta da loja
create or replace function atendimento.eh_encerramento(p_tipo text, t text) returns boolean
language sql immutable set search_path = '' as $$
  select p_tipo = 'figurinha' or (p_tipo = 'texto' and length(coalesce(t, '')) <= 40 and coalesce(t, '') ~*
    '^[\s[:punct:]]*(ok+|okay|blz|beleza|obrigad[oa]s?|obg|vlw|valeu|show|top|perfeito|combinado|t[aá] ?bom|[^[:alnum:]]+)([\s[:punct:]]+(obrigad[oa]s?|obg|vlw|valeu|show|top|perfeito|combinado))*[\s[:punct:]]*$');
$$;

-- Minutos dentro do horário de funcionamento entre dois instantes
create or replace function atendimento.minutos_uteis(p_horario jsonb, p_fuso text, p_ini timestamptz, p_fim timestamptz)
returns numeric language sql stable set search_path = '' as $$
  select case when p_ini is null or p_fim is null or p_fim <= p_ini then 0 else
    coalesce(sum(greatest(0, extract(epoch from (least(p_fim, j.fecha) - greatest(p_ini, j.abre))))) / 60, 0) end
  from (
    select ((d.dia + (h.v->>0)::time) at time zone p_fuso) abre, ((d.dia + (h.v->>1)::time) at time zone p_fuso) fecha
    from generate_series((p_ini at time zone p_fuso)::date::timestamp, (p_fim at time zone p_fuso)::date::timestamp, interval '1 day') d(dia)
    cross join lateral (select p_horario -> extract(dow from d.dia)::int::text v) h
    where jsonb_typeof(h.v) = 'array'
  ) j;
$$;

-- Mensagens em sequência por contato, com os números de atendimento, turno e pendência
create or replace view atendimento.v_seq with (security_invoker = true) as
with base as (
  select m.id, m.conta_id, m.contato, m.de_loja, m.enviada_em, m.tipo, m.texto, m.transcricao, m.transcricao_status,
    m.audio_segundos, m.anuncio, m.nome_contato, m.lida_em,
    lag(m.de_loja) over w ant_de_loja, lag(m.enviada_em) over w ant_em
  from atendimento.mensagens m
  where m.tipo <> 'reacao'
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

create or replace view atendimento.v_atend with (security_invoker = true) as
select s.conta_id, s.contato, s.atend_n,
  min(s.enviada_em) inicio, max(s.enviada_em) fim,
  (array_agg(s.de_loja order by s.enviada_em, s.id))[1] iniciado_pela_loja,
  coalesce(bool_or(not s.de_loja and s.anuncio is not null), false) de_anuncio,
  count(*) filter (where not s.de_loja) msgs_cliente,
  count(*) filter (where s.de_loja) msgs_loja,
  count(*) filter (where s.de_loja and s.tipo = 'audio') audios_loja,
  coalesce(bool_or(s.de_loja and atendimento.tem_preco(coalesce(s.texto, '') || ' ' || coalesce(s.transcricao, ''))), false) preco,
  max(s.nome_contato) nome
from atendimento.v_seq s
group by s.conta_id, s.contato, s.atend_n;

create or replace view atendimento.v_pend with (security_invoker = true) as
select s.conta_id, s.contato, s.pend_n,
  min(s.atend_n) filter (where not s.de_loja) atend_n,
  min(s.enviada_em) filter (where not s.de_loja) inicio,
  min(s.enviada_em) filter (where s.de_loja) resposta_em,
  min(s.lida_em) filter (where not s.de_loja) lida_em,
  coalesce(bool_or(not s.de_loja and s.anuncio is not null), false) de_anuncio,
  coalesce(bool_and(atendimento.eh_encerramento(s.tipo, s.texto)) filter (where not s.de_loja), false) encerramento,
  row_number() over (partition by s.conta_id, s.contato, min(s.atend_n) filter (where not s.de_loja) order by s.pend_n) = 1 primeira
from atendimento.v_seq s
where s.pend_n > 0
group by s.conta_id, s.contato, s.pend_n;

create or replace view atendimento.v_turnos with (security_invoker = true) as
select s.conta_id, s.contato, s.turno_n, bool_and(s.de_loja) de_loja,
  min(s.enviada_em) inicio, max(s.enviada_em) fim, min(s.atend_n) atend_n,
  coalesce(bool_or(s.de_loja and atendimento.tem_preco(coalesce(s.texto, '') || ' ' || coalesce(s.transcricao, ''))), false) preco
from atendimento.v_seq s
group by s.conta_id, s.contato, s.turno_n;

-- Turnos da loja com preço e o que veio depois deles
create or replace view atendimento.v_orcamentos with (security_invoker = true) as
select x.* from (
  select t.*, lead(t.de_loja) over w prox_de_loja, lead(t.inicio) over w prox_inicio
  from atendimento.v_turnos t
  window w as (partition by t.conta_id, t.contato order by t.turno_n)
) x where x.de_loja and x.preco;

create or replace view atendimento.v_contato_vaga with (security_invoker = true) as
select distinct m.conta_id, m.contato from atendimento.mensagens m
where not m.de_loja and atendimento.parece_vaga(coalesce(m.texto, '') || ' ' || coalesce(m.transcricao, ''))
union
select c.conta_id, c.contato from atendimento.classificacoes c where c.recrutamento;

-- Todas as métricas de um período (datas no fuso da conta, inclusive)
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

  -- Volume
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
  where m.conta_id = p_conta and m.tipo <> 'reacao' and v.contato is null and m.enviada_em >= v_ini and m.enviada_em < v_fim;

  -- Pendências do período, já com os tempos
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

  -- Primeira resposta: primeira pendência de atendimento que o cliente começou
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

  -- Durante a conversa: demais pendências (sem contar "ok", "obrigada")
  select jsonb_build_object(
    'pendencias', count(*),
    'sem_resposta', count(*) filter (where resposta_em is null and now() - inicio > interval '1 hour'),
    'mediana_util_min', round(percentile_cont(0.5) within group (order by util)::numeric, 1),
    'mediana_corrida_min', round(percentile_cont(0.5) within group (order by corrido)::numeric, 1))
  into j_durante
  from pg_temp._pend where not (primeira and not iniciado_pela_loja) and not encerramento;

  -- Viu e não respondeu (depende do recibo de leitura da NeoGo)
  select jsonb_build_object(
    'pendencias', count(*),
    'com_leitura', count(lida_em),
    'mediana_ver_responder_util_min', round((percentile_cont(0.5) within group (order by ver_resp_util) filter (where resposta_em is not null))::numeric, 1),
    'viu_sem_responder', count(*) filter (where lida_em is not null and ver_resp_util > 30))
  into j_leitura
  from pg_temp._pend where not encerramento or (primeira and not iniciado_pela_loja);

  -- Formato das mensagens da loja
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
  where m.conta_id = p_conta and m.de_loja and m.tipo <> 'reacao' and v.contato is null
    and m.enviada_em >= v_ini and m.enviada_em < v_fim;

  select j_formato || jsonb_build_object(
    'atendimentos_com_loja', count(*) filter (where a.msgs_loja > 0),
    'atendimentos_so_audio', count(*) filter (where a.msgs_loja > 0 and a.audios_loja = a.msgs_loja))
  into j_formato
  from atendimento.v_atend a left join pg_temp._vaga v on v.contato = a.contato
  where a.conta_id = p_conta and v.contato is null and a.inicio >= v_ini and a.inicio < v_fim;

  -- Retorno (follow-up) de orçamento: loja passou preço e o cliente não respondeu em 24h
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

  -- Chamou o cliente pra loja (resposta da IA por atendimento)
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

  -- Mapa de calor: quando o cliente escreve com a loja aberta, quanto espera
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

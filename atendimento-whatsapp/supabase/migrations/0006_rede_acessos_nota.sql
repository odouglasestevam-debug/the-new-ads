-- 0006: três unidades numa rede, acesso por usuário, checklist de qualidade da IA (lendo texto,
-- áudio transcrito e foto descrita) e nota de 0 a 100 por unidade.
-- Pedido do Douglas com a Renita (dona das 3 unidades da Sapataria do Futuro) em 12/11/2026.
--
-- A IA não dá opinião: responde sim ou não com o trecho da conversa. A nota é conta feita aqui,
-- a partir dessas respostas e das métricas de tempo. Toda perda de ponto tem conversa por trás.

-- ===================== Rede e unidades =====================

create table if not exists atendimento.redes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  nome text not null,
  logo text,
  metas jsonb not null default '{}',
  pesos jsonb not null default '{}',
  diferenciais text not null default '' check (length(diferenciais) <= 3000),
  incluso text not null default '' check (length(incluso) <= 3000),
  criado_em timestamptz not null default now()
);
alter table atendimento.redes enable row level security;

create or replace function atendimento.metas_padrao() returns jsonb language sql immutable set search_path = '' as $$
  select '{"primeira_resposta_min":15,"resposta_24h_pct":95,"entendeu_pct":80,"incluso_pct":70,"diferencial_pct":60,
    "convite_pct":80,"compromisso_pct":50,"relembrou_pct":90,"retorno_pct":80,"audio_max_pct":30}'::jsonb;
$$;
create or replace function atendimento.pesos_padrao() returns jsonb language sql immutable set search_path = '' as $$
  select '{"agilidade":25,"conducao":30,"compromisso":25,"retorno":15,"formato":5}'::jsonb;
$$;

insert into atendimento.redes (slug, nome, logo, metas, pesos, diferenciais)
values ('sapataria-do-futuro', 'Sapataria do Futuro', '/logos/sapataria-do-futuro.png',
  atendimento.metas_padrao(), atendimento.pesos_padrao(),
  E'- Rede com mais de 30 anos, especializada em peças de grife\n- Avaliação da peça na loja, sem compromisso\n- Ajustes simples no expresso (ex.: barra de calça)\n- Loja dentro do shopping\n- Atende outras cidades e estados pelo correio')
on conflict (slug) do nothing;

alter table atendimento.contas add column if not exists rede_id uuid references atendimento.redes(id);
alter table atendimento.contas add column if not exists unidade text;

update atendimento.contas set rede_id = (select id from atendimento.redes where slug = 'sapataria-do-futuro'), unidade = 'Nações'
where slug = 'sapataria-nacoes' and rede_id is null;

-- Tietê e Anália Franco: mesmo horário de shopping e mesma saudação automática da Nações (ajustáveis na tela)
insert into atendimento.contas (slug, nome, unidade, rede_id, horario, metas, textos_automaticos)
select v.slug, v.nome, v.unidade, r.id, n.horario, '{}', n.textos_automaticos
from (values ('sapataria-tiete', 'Sapataria do Futuro Tietê', 'Tietê'),
             ('sapataria-analia-franco', 'Sapataria do Futuro Anália Franco', 'Anália Franco')) v(slug, nome, unidade)
cross join atendimento.redes r
cross join (select horario, textos_automaticos from atendimento.contas where slug = 'sapataria-nacoes') n
where r.slug = 'sapataria-do-futuro'
on conflict (slug) do nothing;

update atendimento.contas set unidade = nome where unidade is null;
alter table atendimento.contas alter column rede_id set not null;
alter table atendimento.contas alter column unidade set not null;

-- ===================== Quem acessa =====================
-- admin: The New Ads, vê tudo e configura conexão e usuários
-- rede: dono da rede (Renita), vê todas as unidades da rede e ajusta metas, pesos, horário
-- unidade: equipe de uma unidade, vê só os números dela

alter table atendimento.usuarios
  add column if not exists papel text not null default 'admin',
  add column if not exists nome text,
  add column if not exists email text,
  add column if not exists rede_id uuid references atendimento.redes(id) on delete cascade,
  add column if not exists contas uuid[] not null default '{}';
alter table atendimento.usuarios alter column papel set default 'unidade';
update atendimento.usuarios u set email = a.email, nome = coalesce(u.nome, 'Douglas')
from auth.users a where a.id = u.user_id and u.email is null;
alter table atendimento.usuarios drop constraint if exists usuarios_papel_ok;
alter table atendimento.usuarios add constraint usuarios_papel_ok check (
  papel = 'admin' or (papel = 'rede' and rede_id is not null) or (papel = 'unidade' and cardinality(contas) between 1 and 50));

create or replace function privado.atendimento_ve_conta(p_conta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.atendimento_pode() and exists (
    select 1 from atendimento.usuarios u join atendimento.contas c on c.id = p_conta
    where u.user_id = auth.uid()
      and (u.papel = 'admin' or (u.papel = 'rede' and c.rede_id = u.rede_id) or (u.papel = 'unidade' and c.id = any(u.contas))));
$$;

create or replace function privado.atendimento_gere_rede(p_rede uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.atendimento_pode() and exists (
    select 1 from atendimento.usuarios u where u.user_id = auth.uid()
      and (u.papel = 'admin' or (u.papel = 'rede' and u.rede_id = p_rede)));
$$;

create or replace function privado.atendimento_eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.atendimento_pode() and exists (select 1 from atendimento.usuarios u where u.user_id = auth.uid() and u.papel = 'admin');
$$;

create or replace function privado.atendimento_exigir_conta(p_conta uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.atendimento_pode() then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if not privado.atendimento_ve_conta(p_conta) then raise exception 'sem_permissao' using errcode = '42501'; end if;
end $$;

revoke all on function privado.atendimento_ve_conta(uuid) from public, anon, authenticated;
revoke all on function privado.atendimento_gere_rede(uuid) from public, anon, authenticated;
revoke all on function privado.atendimento_eh_admin() from public, anon, authenticated;
revoke all on function privado.atendimento_exigir_conta(uuid) from public, anon, authenticated;

-- ===================== Checklist da IA =====================

alter table atendimento.classificacoes
  add column if not exists versao smallint not null default 1,
  add column if not exists tipo text check (tipo in ('oportunidade', 'acompanhamento', 'recrutamento', 'outro')),
  add column if not exists servico text,
  add column if not exists passou_preco boolean,
  add column if not exists entendeu boolean,
  add column if not exists trecho_entendeu text,
  add column if not exists incluso boolean,
  add column if not exists trecho_incluso text,
  add column if not exists diferencial boolean,
  add column if not exists trecho_diferencial text,
  add column if not exists data_compromisso date,
  add column if not exists relembrou text check (relembrou in ('sim', 'nao', 'aguardando', 'nao_se_aplica')),
  add column if not exists trecho_relembrou text,
  add column if not exists cobrou_status boolean;

create or replace function atendimento.data_ou_nulo(t text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return t::date;
exception when others then return null;
end $$;

-- ===================== Fotos: descritas pela IA como os áudios são transcritos =====================
-- transcricao / transcricao_status passam a valer para áudio (transcrição) e foto (descrição).

create or replace function public.atendimento_registrar(p_slug text, p_token text, p_evento jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  c atendimento.contas;
  v_tel text; v_lid text; v_contato text; v_id bigint; v_tipo text;
begin
  select * into c from atendimento.contas where slug = p_slug and ativo;
  if not found or c.url_token <> coalesce(p_token, '') then return 'nao_autorizado'; end if;

  if nullif(p_evento->>'instance_id', '') is not null then
    if c.instance_id is null then
      update atendimento.contas set instance_id = p_evento->>'instance_id', instance_nome = p_evento->>'instance_nome'
      where id = c.id;
    elsif c.instance_id <> p_evento->>'instance_id' then
      return 'outra_instancia';
    end if;
  end if;
  update atendimento.contas set ultimo_evento_em = now(), ultimo_evento_tipo = left(p_evento->>'tipo_evento', 60)
  where id = c.id;

  if p_evento->>'evento' = 'leitura' then
    update atendimento.mensagens m set lida_em = (p_evento->>'em')::timestamptz
    where m.conta_id = c.id and not m.de_loja and m.lida_em is null
      and m.wa_id in (select jsonb_array_elements_text(p_evento->'ids'));
    insert into atendimento.leituras_pendentes (conta_id, wa_id, lida_em)
    select c.id, x, (p_evento->>'em')::timestamptz
    from jsonb_array_elements_text(p_evento->'ids') x
    where not exists (select 1 from atendimento.mensagens m where m.conta_id = c.id and m.wa_id = x)
    on conflict do nothing;
    return 'ok';
  end if;

  if p_evento->>'evento' is distinct from 'mensagem' then return 'ok'; end if;

  v_tel := nullif(p_evento->>'telefone', '');
  v_lid := nullif(p_evento->>'lid', '');
  if v_tel is not null and v_lid is not null then
    insert into atendimento.contatos_lid (conta_id, lid, telefone) values (c.id, v_lid, v_tel)
    on conflict (conta_id, lid) do update set telefone = excluded.telefone;
    update atendimento.mensagens set contato = v_tel where conta_id = c.id and contato = 'lid:' || v_lid;
  end if;
  if v_tel is null and v_lid is not null then
    select telefone into v_tel from atendimento.contatos_lid where conta_id = c.id and lid = v_lid;
  end if;
  v_contato := coalesce(v_tel, 'lid:' || v_lid);
  if v_contato is null then return 'sem_contato'; end if;

  v_tipo := p_evento->>'tipo';
  insert into atendimento.mensagens (conta_id, wa_id, contato, chat_jid, de_loja, enviada_em, tipo, texto,
    audio_segundos, audio_voz, midia, anuncio, nome_contato, responde_a, transcricao_status, bruto, lida_em)
  values (c.id, p_evento->>'wa_id', v_contato, p_evento->>'chat', (p_evento->>'de_loja')::boolean,
    (p_evento->>'enviada_em')::timestamptz, v_tipo, left(p_evento->>'texto', 8000),
    (p_evento->>'audio_segundos')::integer, (p_evento->>'audio_voz')::boolean,
    p_evento->'midia', p_evento->'anuncio', left(p_evento->>'nome', 120), p_evento->>'responde_a',
    case when v_tipo in ('audio', 'imagem') then
      case when coalesce(p_evento->'midia'->>'media_key', '') <> '' then 'pendente' else 'sem_midia' end end,
    p_evento->'bruto',
    (select lida_em from atendimento.leituras_pendentes where conta_id = c.id and wa_id = p_evento->>'wa_id'))
  on conflict (conta_id, wa_id) do nothing
  returning id into v_id;
  delete from atendimento.leituras_pendentes where conta_id = c.id and wa_id = p_evento->>'wa_id';
  return case when v_id is null then 'duplicada' else 'ok' end;
end $$;

drop function if exists public.atendimento_audios_pendentes(integer);
create function public.atendimento_audios_pendentes(p_limite integer default 5)
returns table (id bigint, tipo text, midia jsonb, audio_segundos integer)
language sql security definer set search_path = '' as $$
  select m.id, m.tipo, m.midia, m.audio_segundos from atendimento.mensagens m
  where m.transcricao_status = 'pendente'
  order by m.recebida_em
  limit least(greatest(p_limite, 1), 20);
$$;

-- ===================== Cálculo =====================

-- Atendimento agora também guarda quando saiu o primeiro preço
create or replace view atendimento.v_atend with (security_invoker = true) as
select s.conta_id, s.contato, s.atend_n,
  min(s.enviada_em) inicio, max(s.enviada_em) fim,
  (array_agg(s.de_loja order by s.enviada_em, s.id))[1] iniciado_pela_loja,
  coalesce(bool_or(not s.de_loja and s.anuncio is not null), false) de_anuncio,
  count(*) filter (where not s.de_loja) msgs_cliente,
  count(*) filter (where s.de_loja) msgs_loja,
  count(*) filter (where s.de_loja and s.tipo = 'audio') audios_loja,
  coalesce(bool_or(s.de_loja and atendimento.tem_preco(coalesce(s.texto, '') || ' ' || coalesce(s.transcricao, ''))), false) preco,
  max(s.nome_contato) nome,
  min(s.enviada_em) filter (where s.de_loja and atendimento.tem_preco(coalesce(s.texto, '') || ' ' || coalesce(s.transcricao, ''))) preco_em
from atendimento.v_seq s
group by s.conta_id, s.contato, s.atend_n;

-- Pontos de um indicador: 100 na meta (ou melhor), 0 no piso, proporcional no meio.
-- Serve pros dois sentidos: quando menor é melhor, a meta fica abaixo do piso.
create or replace function atendimento.pontos(v numeric, meta numeric, piso numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when v is null or meta is null or piso is null or meta = piso then null
    else round(greatest(0, least(1, (v - piso) / (meta - piso))) * 100, 1) end;
$$;

-- Percentual só com amostra mínima (com 1 ou 2 casos o número não diz nada)
create or replace function atendimento.razao(a numeric, b numeric, minimo integer default 3) returns numeric
language sql immutable set search_path = '' as $$
  select case when coalesce(b, 0) >= minimo then 100 * coalesce(a, 0) / b end;
$$;

create or replace function atendimento.kpi(v numeric, meta numeric, piso numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('valor', round(v, 1), 'meta', meta, 'piso', piso, 'pontos', atendimento.pontos(v, meta, piso));
$$;

-- Nota de 0 a 100: média ponderada das partes; cada parte é a média dos pontos dos seus indicadores.
-- Parte sem dado (ex.: IA ainda não leu) fica fora e os pesos das outras são redistribuídos.
create or replace function atendimento.nota(p jsonb, m jsonb, w jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  R jsonb := coalesce(p->'resposta', '{}'); Q jsonb := coalesce(p->'qualidade', '{}');
  T jsonb := coalesce(p->'retorno', '{}'); F jsonb := coalesce(p->'formato', '{}');
  base24 numeric := coalesce((R->>'atendimentos')::numeric, 0) - coalesce((R->>'aguardando')::numeric, 0);
  m_prim numeric := (m->>'primeira_resposta_min')::numeric;
  m_24 numeric := (m->>'resposta_24h_pct')::numeric;
  m_aud numeric := (m->>'audio_max_pct')::numeric;
  defs jsonb; pilares jsonb := '{}'; pil text; media numeric; peso numeric; soma numeric := 0; total numeric := 0;
begin
  defs := jsonb_build_object(
    'agilidade', jsonb_build_object(
      'primeira_resposta', atendimento.kpi(case when coalesce((R->>'respondidos')::numeric, 0) >= 3 then (R->>'mediana_util_min')::numeric end,
        m_prim, greatest(120, m_prim * 4)),
      'respondidas_24h', atendimento.kpi(atendimento.razao((R->>'respondidos_24h')::numeric, base24), m_24, greatest(0, least(60, m_24 - 20)))),
    'conducao', jsonb_build_object(
      'entendeu', atendimento.kpi(atendimento.razao((Q->>'entendeu')::numeric, (Q->>'oportunidades')::numeric), (m->>'entendeu_pct')::numeric, 0),
      'incluso', atendimento.kpi(atendimento.razao((Q->>'incluso')::numeric, (Q->>'passou_preco')::numeric), (m->>'incluso_pct')::numeric, 0),
      'diferencial', atendimento.kpi(atendimento.razao((Q->>'diferencial')::numeric, (Q->>'oportunidades')::numeric), (m->>'diferencial_pct')::numeric, 0),
      'convite', atendimento.kpi(atendimento.razao((Q->>'convite')::numeric, (Q->>'oportunidades')::numeric), (m->>'convite_pct')::numeric, 0)),
    'compromisso', jsonb_build_object(
      'compromisso', atendimento.kpi(atendimento.razao((Q->>'compromisso')::numeric, (Q->>'oportunidades')::numeric), (m->>'compromisso_pct')::numeric, 0),
      'relembrou', atendimento.kpi(atendimento.razao((Q->>'relembrou')::numeric, (Q->>'relembrou_aplicavel')::numeric), (m->>'relembrou_pct')::numeric, 0)),
    'retorno', jsonb_build_object(
      'retorno', atendimento.kpi(atendimento.razao((T->>'com_retorno')::numeric, (T->>'cliente_sumiu')::numeric), (m->>'retorno_pct')::numeric, 0)),
    'formato', jsonb_build_object(
      'audio', atendimento.kpi(atendimento.razao((F->>'audio')::numeric, (F->>'mensagens')::numeric, 10), m_aud, least(100, greatest(70, m_aud + 30)))));
  for pil in select jsonb_object_keys(defs) loop
    select avg((e.v->>'pontos')::numeric) into media from jsonb_each(defs->pil) e(k, v) where e.v->>'pontos' is not null;
    peso := coalesce((w->>pil)::numeric, 0);
    pilares := pilares || jsonb_build_object(pil, jsonb_build_object('pontos', round(media, 1), 'peso', peso, 'kpis', defs->pil));
    if media is not null and peso > 0 then soma := soma + media * peso; total := total + peso; end if;
  end loop;
  return jsonb_build_object(
    'valor', case when total > 0 then round(soma / total, 1) end,
    'completa', not exists (select 1 from jsonb_each(pilares) e(k, v) where (e.v->>'peso')::numeric > 0 and e.v->>'pontos' is null),
    'amostra_pequena', coalesce((R->>'atendimentos')::numeric, 0) < 10,
    'pilares', pilares);
end $$;

create or replace function atendimento.calcular(p_conta uuid, p_de date, p_ate date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c atendimento.contas;
  v_metas jsonb; v_pesos jsonb;
  v_ini timestamptz; v_fim timestamptz; v_meta numeric;
  j_volume jsonb; j_resposta jsonb; j_durante jsonb; j_leitura jsonb; j_formato jsonb; j_retorno jsonb; j_loja jsonb;
  j_qual jsonb; j_serv jsonb; j_calor jsonb; r jsonb;
begin
  select * into c from atendimento.contas where id = p_conta;
  if not found then return null; end if;
  select atendimento.metas_padrao() || coalesce(x.metas, '{}'), atendimento.pesos_padrao() || coalesce(x.pesos, '{}')
  into v_metas, v_pesos from atendimento.redes x where x.id = c.rede_id;
  v_metas := coalesce(v_metas, atendimento.metas_padrao());
  v_pesos := coalesce(v_pesos, atendimento.pesos_padrao());
  v_ini := p_de::timestamp at time zone c.fuso;
  v_fim := (p_ate + 1)::timestamp at time zone c.fuso;
  v_meta := (v_metas->>'primeira_resposta_min')::numeric;

  create temporary table if not exists pg_temp._vaga (contato text primary key) on commit drop;
  truncate pg_temp._vaga;
  insert into pg_temp._vaga select distinct v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta;

  select jsonb_build_object(
    'atendimentos', count(*) filter (where not a.iniciado_pela_loja and v.contato is null),
    'de_anuncio', count(*) filter (where not a.iniciado_pela_loja and v.contato is null and a.de_anuncio),
    'recorrentes', count(*) filter (where not a.iniciado_pela_loja and v.contato is null and a.atend_n > 1),
    'iniciados_pela_loja', count(*) filter (where a.iniciado_pela_loja and v.contato is null),
    'recrutamento', count(*) filter (where v.contato is not null),
    'contatos', count(distinct a.contato) filter (where v.contato is null),
    'msgs_por_atendimento', round(avg(a.msgs_cliente + a.msgs_loja) filter (where not a.iniciado_pela_loja and v.contato is null), 1))
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
    'aguardando', count(*) filter (where resposta_em is null and now() - inicio <= interval '24 hours'),
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
      'mediana_util_min', round((percentile_cont(0.5) within group (order by util) filter (where de_anuncio))::numeric, 1)),
    -- chegou com a loja fechada: quanto tempo depois de abrir a loja respondeu
    'fora_horario', jsonb_build_object(
      'atendimentos', count(*) filter (where not em_horario),
      'respondidos', count(resposta_em) filter (where not em_horario),
      'mediana_util_min', round((percentile_cont(0.5) within group (order by util) filter (where not em_horario))::numeric, 1)))
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

  -- Bloco antigo (só convite e dia), mantido pra comparar com semanas fechadas antes do checklist
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

  -- Checklist de qualidade (IA): só oportunidades de serviço, atendimentos que o cliente começou e a loja respondeu
  select jsonb_build_object(
    'atendimentos', count(*),
    'analisados', count(*) filter (where x.v2),
    'aguardando_ia', count(*) filter (where not x.v2 or x.lido_ate < x.fim),
    'oportunidades', count(*) filter (where x.op),
    'acompanhamento', count(*) filter (where x.v2 and x.tipo = 'acompanhamento'),
    'outros', count(*) filter (where x.v2 and x.tipo = 'outro'),
    'cobrou_status', count(*) filter (where x.v2 and x.tipo = 'acompanhamento' and x.cobrou_status),
    'entendeu', count(*) filter (where x.op and x.entendeu),
    'passou_preco', count(*) filter (where x.op and x.passou_preco),
    'incluso', count(*) filter (where x.op and x.passou_preco and x.incluso),
    'diferencial', count(*) filter (where x.op and x.diferencial),
    'convite', count(*) filter (where x.op and x.chamou_loja),
    'compromisso', count(*) filter (where x.op and x.marcou_dia),
    'relembrou_aplicavel', count(*) filter (where x.op and x.marcou_dia and x.relembrou in ('sim', 'nao')),
    'relembrou', count(*) filter (where x.op and x.marcou_dia and x.relembrou = 'sim'),
    'relembrou_aguardando', count(*) filter (where x.op and x.marcou_dia and x.relembrou = 'aguardando'),
    'balcao', count(*) filter (where x.op and not x.chamou_loja and not x.marcou_dia),
    'tempo_ate_preco_mediana_min', round((percentile_cont(0.5) within group (order by x.ate_preco) filter (where x.op and x.ate_preco is not null))::numeric, 1))
  into j_qual
  from (
    select a.fim, cl.lido_ate, cl.tipo, cl.cobrou_status, cl.entendeu, cl.passou_preco, cl.incluso, cl.diferencial,
      cl.chamou_loja, cl.marcou_dia, cl.relembrou,
      coalesce(cl.versao >= 2, false) v2,
      coalesce(cl.versao >= 2 and cl.tipo = 'oportunidade', false) op,
      case when a.preco_em is not null then atendimento.minutos_uteis(c.horario, c.fuso, a.inicio, a.preco_em) end ate_preco
    from atendimento.v_atend a
    left join pg_temp._vaga v on v.contato = a.contato
    left join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio
    where a.conta_id = p_conta and v.contato is null and not a.iniciado_pela_loja and a.msgs_loja > 0
      and a.inicio >= v_ini and a.inicio < v_fim
  ) x;

  select coalesce(jsonb_object_agg(s.servico, s.n), '{}') into j_serv
  from (
    select coalesce(cl.servico, 'nao_identificado') servico, count(*) n
    from atendimento.v_atend a
    left join pg_temp._vaga v on v.contato = a.contato
    join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio and cl.versao >= 2
    where a.conta_id = p_conta and v.contato is null and not a.iniciado_pela_loja
      and a.inicio >= v_ini and a.inicio < v_fim and cl.tipo in ('oportunidade', 'acompanhamento')
    group by 1
  ) s;
  j_qual := j_qual || jsonb_build_object('servicos', j_serv);

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

  r := jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'calculado_em', now(),
    'metas', v_metas, 'pesos', v_pesos,
    'volume', j_volume, 'resposta', j_resposta, 'durante', j_durante, 'leitura', j_leitura,
    'formato', j_formato, 'retorno', j_retorno, 'loja', j_loja, 'qualidade', j_qual, 'calor', j_calor);
  return r || jsonb_build_object('nota', atendimento.nota(r, v_metas, v_pesos));
end $$;
revoke all on function atendimento.calcular(uuid, date, date) from public, anon, authenticated;

-- Fecha de uma vez as semanas passadas (histórico importado). p_refazer recalcula as já fechadas,
-- útil depois que a IA ler o histórico.
create or replace function atendimento.fechar_semanas_desde(p_desde date, p_refazer boolean default false) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_seg date; v_ult date; v_desde timestamptz; n integer := 0;
begin
  for r in select id, fuso from atendimento.contas where ativo loop
    select min(enviada_em) into v_desde from atendimento.mensagens where conta_id = r.id;
    continue when v_desde is null;
    v_ult := date_trunc('week', now() at time zone r.fuso)::date - 7;
    v_seg := greatest(date_trunc('week', p_desde)::date, date_trunc('week', v_desde at time zone r.fuso)::date);
    while v_seg <= v_ult loop
      insert into atendimento.semanas (conta_id, semana, metricas)
      values (r.id, v_seg, atendimento.calcular(r.id, v_seg, v_seg + 6)
        || jsonb_build_object('coleta_desde', v_desde, 'semana_parcial', v_desde > v_seg::timestamp at time zone r.fuso))
      on conflict (conta_id, semana) do update set metricas = excluded.metricas, fechada_em = now() where p_refazer;
      if found then n := n + 1; end if;
      v_seg := v_seg + 7;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function atendimento.fechar_semanas_desde(date, boolean) from public, anon, authenticated;

-- ===================== Painel =====================

create or replace function public.atendimento_contas() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u atendimento.usuarios; v_admin boolean;
begin
  perform privado.atendimento_exigir();
  select * into u from atendimento.usuarios where user_id = auth.uid();
  v_admin := u.papel = 'admin';
  return jsonb_build_object(
    'perfil', jsonb_build_object('papel', u.papel, 'nome', u.nome, 'email', u.email, 'admin', v_admin),
    'avisos', case when v_admin then coalesce((select jsonb_object_agg(a.chave, jsonb_build_object('valor', a.valor, 'em', a.em))
      from atendimento.avisos a), '{}') else '{}' end,
    'ultimo_lote', case when v_admin then (select jsonb_build_object('status', l.status, 'status_openai', l.status_openai, 'itens', l.itens,
        'criado_em', l.criado_em, 'concluido_em', l.concluido_em, 'erro', l.erro)
      from atendimento.lotes l order by l.criado_em desc limit 1) end,
    'redes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nome', r.nome, 'logo', r.logo,
        'metas', atendimento.metas_padrao() || r.metas, 'pesos', atendimento.pesos_padrao() || r.pesos,
        'gere', privado.atendimento_gere_rede(r.id),
        'diferenciais', case when privado.atendimento_gere_rede(r.id) then r.diferenciais end,
        'incluso', case when privado.atendimento_gere_rede(r.id) then r.incluso end) order by r.nome)
      from atendimento.redes r
      where exists (select 1 from atendimento.contas c where c.rede_id = r.id and c.ativo and privado.atendimento_ve_conta(c.id))), '[]'),
    'contas', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nome', c.nome, 'unidade', c.unidade, 'rede_id', c.rede_id, 'fuso', c.fuso, 'horario', c.horario,
      'textos_automaticos', c.textos_automaticos,
      'instance_id', case when v_admin then c.instance_id end, 'instance_nome', case when v_admin then c.instance_nome end,
      'ultimo_evento_em', c.ultimo_evento_em, 'ultimo_evento_tipo', c.ultimo_evento_tipo,
      'webhook', case when v_admin then 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/atendimento-webhook?c=' || c.slug || '&t=' || c.url_token end,
      'mensagens', (select count(*) from atendimento.mensagens m where m.conta_id = c.id),
      'importadas', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.bruto->>'origem' = 'whatsapp_web'),
      'primeira_mensagem_em', (select min(m.enviada_em) from atendimento.mensagens m where m.conta_id = c.id),
      'ultima_mensagem_em', (select max(m.recebida_em) from atendimento.mensagens m where m.conta_id = c.id
        and coalesce(m.bruto->>'origem', '') <> 'whatsapp_web'),
      'midias_pendentes', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.transcricao_status = 'pendente'),
      'midias_erro', (select count(*) from atendimento.mensagens m where m.conta_id = c.id and m.transcricao_status = 'erro')
    ) order by c.unidade) from atendimento.contas c where c.ativo and privado.atendimento_ve_conta(c.id)), '[]'));
end $$;

create or replace function public.atendimento_painel(p_conta uuid, p_de date, p_ate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir_conta(p_conta);
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  return atendimento.calcular(p_conta, p_de, p_ate);
end $$;

-- Todas as unidades da rede que o usuário enxerga, lado a lado
create or replace function public.atendimento_rede(p_rede uuid, p_de date, p_ate date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('conta_id', c.id, 'unidade', c.unidade, 'nome', c.nome,
      'calc', atendimento.calcular(c.id, p_de, p_ate)) order by c.unidade)
    from atendimento.contas c where c.rede_id = p_rede and c.ativo and privado.atendimento_ve_conta(c.id)), '[]');
end $$;

create or replace function public.atendimento_rede_semanas(p_rede uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  return coalesce((select jsonb_agg(jsonb_build_object('conta_id', s.conta_id, 'semana', s.semana,
      'nota', s.metricas->'nota', 'atendimentos', s.metricas->'volume'->'atendimentos', 'parcial', s.metricas->'semana_parcial')
      order by s.semana desc, c.unidade)
    from atendimento.semanas s join atendimento.contas c on c.id = s.conta_id
    where c.rede_id = p_rede and c.ativo and privado.atendimento_ve_conta(c.id) and s.semana > current_date - 7 * 26), '[]');
end $$;

create or replace function public.atendimento_lista(p_conta uuid, p_de date, p_ate date, p_filtro text default 'atendimentos')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c atendimento.contas; v_ini timestamptz; v_fim timestamptz; v_meta numeric; r jsonb;
begin
  perform privado.atendimento_exigir_conta(p_conta);
  select * into c from atendimento.contas where id = p_conta;
  if not found or p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  v_ini := p_de::timestamp at time zone c.fuso;
  v_fim := (p_ate + 1)::timestamp at time zone c.fuso;
  select ((atendimento.metas_padrao() || x.metas)->>'primeira_resposta_min')::numeric into v_meta
  from atendimento.redes x where x.id = c.rede_id;
  v_meta := coalesce(v_meta, 15);

  with vaga as (select distinct v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta),
  a as (
    select a.*, a.contato in (select contato from vaga) eh_vaga
    from atendimento.v_atend a where a.conta_id = p_conta and a.inicio >= v_ini and a.inicio < v_fim
  ),
  pr as (
    select p.contato, p.atend_n, p.inicio, p.resposta_em, p.lida_em,
      case when p.resposta_em is not null then atendimento.minutos_uteis(c.horario, c.fuso, p.inicio, p.resposta_em) end util,
      case when p.resposta_em is not null then extract(epoch from p.resposta_em - p.inicio) / 60 end corrido,
      atendimento.minutos_uteis(c.horario, c.fuso, p.inicio, p.inicio + interval '1 minute') = 0 fora
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
    select a.*, pr.resposta_em, pr.util, pr.corrido, pr.fora, lei.viu_sem_responder,
      orc.sumiu, orc.retorno, orc.sem_retorno, orc.retorno_dias,
      cl.chamou_loja, cl.trecho_convite, cl.marcou_dia, cl.trecho_dia, cl.lido_ate,
      cl.tipo, cl.servico, cl.passou_preco, cl.entendeu, cl.trecho_entendeu, cl.incluso, cl.trecho_incluso,
      cl.diferencial, cl.trecho_diferencial, cl.data_compromisso, cl.relembrou, cl.trecho_relembrou, cl.cobrou_status,
      coalesce(cl.versao >= 2, false) v2,
      coalesce(cl.versao >= 2 and cl.tipo = 'oportunidade', false) op
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
      'resposta_em', l.resposta_em, 'util_min', round(l.util, 1), 'corrido_min', round(l.corrido, 1), 'fora_horario', l.fora,
      'viu_sem_responder', l.viu_sem_responder,
      'orcamento_sumiu', l.sumiu, 'retorno', l.retorno, 'retorno_dias', round(l.retorno_dias, 1),
      'chamou_loja', l.chamou_loja, 'trecho_convite', l.trecho_convite, 'marcou_dia', l.marcou_dia, 'trecho_dia', l.trecho_dia,
      'ia_atualizada', l.v2 and l.lido_ate >= l.fim
    ) || jsonb_build_object(
      'tipo', case when l.v2 then l.tipo end, 'servico', case when l.v2 then l.servico end,
      'passou_preco', l.passou_preco, 'entendeu', l.entendeu, 'trecho_entendeu', l.trecho_entendeu,
      'incluso', l.incluso, 'trecho_incluso', l.trecho_incluso,
      'diferencial', l.diferencial, 'trecho_diferencial', l.trecho_diferencial,
      'data_compromisso', l.data_compromisso, 'relembrou', l.relembrou, 'trecho_relembrou', l.trecho_relembrou,
      'cobrou_status', l.cobrou_status
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
      when 'fora_horario' then not l.iniciado_pela_loja and l.fora
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
      when 'aguardando_ia' then not l.iniciado_pela_loja and l.msgs_loja > 0 and (not l.v2 or l.lido_ate < l.fim)
      when 'oportunidades' then l.op and not l.iniciado_pela_loja
      when 'acompanhamento' then l.v2 and l.tipo = 'acompanhamento' and not l.iniciado_pela_loja
      when 'outros' then l.v2 and l.tipo = 'outro' and not l.iniciado_pela_loja
      when 'cobrou_status' then l.v2 and l.tipo = 'acompanhamento' and l.cobrou_status and not l.iniciado_pela_loja
      when 'entendeu' then l.op and not l.iniciado_pela_loja and l.entendeu
      when 'sem_entendeu' then l.op and not l.iniciado_pela_loja and l.entendeu = false
      when 'passou_preco' then l.op and not l.iniciado_pela_loja and l.passou_preco
      when 'incluso' then l.op and not l.iniciado_pela_loja and l.passou_preco and l.incluso
      when 'sem_incluso' then l.op and not l.iniciado_pela_loja and l.passou_preco and l.incluso = false
      when 'diferencial' then l.op and not l.iniciado_pela_loja and l.diferencial
      when 'sem_diferencial' then l.op and not l.iniciado_pela_loja and l.diferencial = false
      when 'convite' then l.op and not l.iniciado_pela_loja and l.chamou_loja
      when 'sem_convite' then l.op and not l.iniciado_pela_loja and l.chamou_loja = false
      when 'compromisso' then l.op and not l.iniciado_pela_loja and l.marcou_dia
      when 'sem_compromisso' then l.op and not l.iniciado_pela_loja and l.marcou_dia = false
      when 'relembrou' then l.op and not l.iniciado_pela_loja and l.marcou_dia and l.relembrou = 'sim'
      when 'nao_relembrou' then l.op and not l.iniciado_pela_loja and l.marcou_dia and l.relembrou = 'nao'
      when 'balcao' then l.op and not l.iniciado_pela_loja and l.chamou_loja = false and l.marcou_dia = false
      else false end
  end
  order by l.inicio desc limit 500) l;
  return r;
end $$;

create or replace function public.atendimento_conversa(p_conta uuid, p_contato text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir_conta(p_conta);
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

-- O que precisa de ação agora
create or replace function public.atendimento_filas(p_conta uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c atendimento.contas; v_hoje date; j_esp jsonb; j_ret jsonb; j_conv jsonb; j_comp jsonb;
begin
  perform privado.atendimento_exigir_conta(p_conta);
  select * into c from atendimento.contas where id = p_conta;
  v_hoje := (now() at time zone c.fuso)::date;

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

  -- Oportunidade sem convite pra loja (antes do checklist: quem recebeu preço e não foi chamado)
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
  where a.conta_id = p_conta and cl.chamou_loja = false and a.fim > now() - interval '14 days'
    and ((cl.versao >= 2 and cl.tipo = 'oportunidade') or (cl.versao < 2 and a.preco))
    and a.contato not in (select v.contato from atendimento.v_contato_vaga v where v.conta_id = p_conta);

  -- Compromissos de ontem (confirmar se veio), hoje e amanhã (lembrar o cliente)
  select coalesce(jsonb_agg(jsonb_build_object(
      'contato', x.contato, 'nome', x.nome, 'data', x.data_compromisso, 'trecho', x.trecho_dia, 'relembrou', x.relembrou,
      'ultima_loja', (select max(m.enviada_em) from atendimento.mensagens m
        where m.conta_id = p_conta and m.contato = x.contato and m.de_loja and not m.automatica)
    ) order by x.data_compromisso, x.contato), '[]')
  into j_comp
  from (
    select distinct on (a.contato) a.contato, a.nome, cl.data_compromisso, cl.trecho_dia, cl.relembrou
    from atendimento.v_atend a
    join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio
    where a.conta_id = p_conta and cl.versao >= 2 and cl.marcou_dia and cl.data_compromisso between v_hoje - 1 and v_hoje + 1
    order by a.contato, a.inicio desc
  ) x;

  return jsonb_build_object('esperando', j_esp, 'retornos', j_ret, 'sem_convite', j_conv, 'compromissos', j_comp, 'hoje', v_hoje);
end $$;

create or replace function public.atendimento_semanas(p_conta uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir_conta(p_conta);
  return coalesce((select jsonb_agg(jsonb_build_object('semana', s.semana, 'metricas', s.metricas, 'fechada_em', s.fechada_em)
    order by s.semana desc) from (select * from atendimento.semanas where conta_id = p_conta order by semana desc limit 52) s), '[]');
end $$;

-- ===================== Configuração =====================

drop function if exists public.atendimento_salvar_config(uuid, jsonb, jsonb, jsonb);
drop function if exists public.atendimento_salvar_config(uuid, jsonb, jsonb);

-- Horário e mensagens automáticas de uma unidade (admin ou dono da rede)
create or replace function public.atendimento_salvar_unidade(p_conta uuid, p_horario jsonb, p_textos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c atendimento.contas; d int; v jsonb;
begin
  perform privado.atendimento_exigir();
  select * into c from atendimento.contas where id = p_conta;
  if not found or not privado.atendimento_gere_rede(c.rede_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if jsonb_typeof(p_horario) is distinct from 'object' then raise exception 'horario_invalido' using errcode = '22023'; end if;
  for d in 0..6 loop
    v := p_horario -> d::text;
    if v is not null and jsonb_typeof(v) <> 'null' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 2
         or (v->>0) !~ '^([01]\d|2[0-3]):[0-5]\d$' or (v->>1) !~ '^([01]\d|2[0-3]):[0-5]\d$' or (v->>0) >= (v->>1) then
        raise exception 'horario_invalido' using errcode = '22023';
      end if;
    end if;
  end loop;
  if jsonb_typeof(p_textos) is distinct from 'array' or jsonb_array_length(p_textos) > 20
     or exists (select 1 from jsonb_array_elements(p_textos) e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 300) then
    raise exception 'textos_invalidos' using errcode = '22023';
  end if;
  update atendimento.contas set
    horario = (select jsonb_object_agg(d2::text, coalesce(p_horario -> d2::text, 'null'::jsonb)) from generate_series(0, 6) d2),
    textos_automaticos = p_textos
  where id = p_conta;
  update atendimento.mensagens m set automatica = (m.tipo = 'texto' and atendimento.eh_texto_automatico(m.conta_id, m.texto))
  where m.conta_id = p_conta and m.de_loja
    and m.automatica is distinct from (m.tipo = 'texto' and atendimento.eh_texto_automatico(m.conta_id, m.texto));
end $$;

-- Metas, pesos da nota e o que a IA precisa saber da loja (vale pras unidades da rede)
create or replace function public.atendimento_salvar_rede(p_rede uuid, p_metas jsonb, p_pesos jsonb, p_diferenciais text, p_incluso text)
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v_soma numeric;
begin
  perform privado.atendimento_exigir();
  if not privado.atendimento_gere_rede(p_rede) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if jsonb_typeof(p_metas) is distinct from 'object' or jsonb_typeof(p_pesos) is distinct from 'object' then
    raise exception 'config_invalida' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_metas) loop
    if not (atendimento.metas_padrao() ? k) or jsonb_typeof(p_metas->k) <> 'number' or (p_metas->>k)::numeric < 0
       or (p_metas->>k)::numeric > (case when k like '%\_pct' then 100 else 1440 end) then
      raise exception 'meta_invalida' using errcode = '22023';
    end if;
  end loop;
  for k in select jsonb_object_keys(p_pesos) loop
    if not (atendimento.pesos_padrao() ? k) or jsonb_typeof(p_pesos->k) <> 'number' or (p_pesos->>k)::numeric not between 0 and 100 then
      raise exception 'peso_invalido' using errcode = '22023';
    end if;
  end loop;
  select sum(e.v::numeric) into v_soma
  from jsonb_each_text(atendimento.pesos_padrao() || (select r.pesos from atendimento.redes r where r.id = p_rede) || p_pesos) e(k, v);
  if v_soma <> 100 then raise exception 'pesos_soma' using errcode = '22023'; end if;
  if length(coalesce(p_diferenciais, '')) > 3000 or length(coalesce(p_incluso, '')) > 3000 then
    raise exception 'texto_longo' using errcode = '22023';
  end if;
  update atendimento.redes set metas = metas || p_metas, pesos = pesos || p_pesos,
    diferenciais = coalesce(p_diferenciais, diferenciais), incluso = coalesce(p_incluso, incluso)
  where id = p_rede;
end $$;

-- ===================== Usuários (só admin) =====================

create or replace function public.atendimento_usuarios() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  if not privado.atendimento_eh_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'nome', u.nome, 'email', coalesce(u.email, a.email),
      'papel', u.papel, 'rede_id', u.rede_id, 'contas', to_jsonb(u.contas), 'eu', u.user_id = auth.uid(),
      'ultimo_acesso', a.last_sign_in_at) order by u.papel, u.nome)
    from atendimento.usuarios u left join auth.users a on a.id = u.user_id), '[]');
end $$;

-- Tira o acesso ao monitor (a conta de login continua, pode ser usada em outro sistema)
create or replace function public.atendimento_usuario_remover(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.atendimento_exigir();
  if not privado.atendimento_eh_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'nao_remove_a_si' using errcode = '22023'; end if;
  delete from atendimento.usuarios where user_id = p_user;
end $$;

-- Usadas pela Edge Function atendimento-usuarios (service_role)
create or replace function public.atendimento_eh_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from atendimento.usuarios where user_id = p_user and papel = 'admin');
$$;

create or replace function public.atendimento_cadastrar_usuario(p_user uuid, p_nome text, p_email text, p_papel text, p_rede uuid, p_contas uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_papel is null or p_papel not in ('admin', 'rede', 'unidade') then raise exception 'papel_invalido' using errcode = '22023'; end if;
  if p_papel = 'rede' and not exists (select 1 from atendimento.redes where id = p_rede) then
    raise exception 'rede_invalida' using errcode = '22023';
  end if;
  if p_papel = 'unidade' and (coalesce(cardinality(p_contas), 0) = 0
     or exists (select 1 from unnest(p_contas) x where not exists (select 1 from atendimento.contas c where c.id = x))) then
    raise exception 'contas_invalidas' using errcode = '22023';
  end if;
  insert into atendimento.usuarios (user_id, nome, email, papel, rede_id, contas)
  values (p_user, left(btrim(p_nome), 200), lower(btrim(p_email)), p_papel,
    case when p_papel = 'rede' then p_rede end, case when p_papel = 'unidade' then p_contas else '{}'::uuid[] end)
  on conflict (user_id) do update set nome = excluded.nome, email = excluded.email, papel = excluded.papel,
    rede_id = excluded.rede_id, contas = excluded.contas;
end $$;

-- ===================== Análise por IA =====================

-- Lê de novo: atendimento com mensagem nova, lido pelo checklist antigo, ou com compromisso cuja
-- data passou desde a última leitura (pra saber se a loja relembrou).
drop function if exists public.atendimento_para_classificar(integer);
create function public.atendimento_para_classificar(p_limite integer default 300)
returns table (chave text, lido_ate timestamptz, loja text, contexto text, conversa text)
language sql security definer set search_path = '' as $$
  select a.conta_id || '|' || a.contato || '|' || a.inicio::text, a.fim, c.nome,
    concat_ws(E'\n\n',
      'Data de hoje: ' || to_char(now() at time zone c.fuso, 'DD/MM/YYYY'),
      case when btrim(r.diferenciais) <> '' then E'Diferenciais da loja (escrito pela dona):\n' || r.diferenciais end,
      case when btrim(r.incluso) <> '' then E'O que está incluso nos serviços (escrito pela dona):\n' || r.incluso end),
    (select string_agg('[' || to_char(m.enviada_em at time zone c.fuso, 'DD/MM/YYYY HH24:MI') || '] '
        || case when m.de_loja then case when m.automatica then 'Loja (mensagem automática)' else 'Loja' end else 'Cliente' end
        || case m.tipo
             when 'texto' then ': ' || left(coalesce(m.texto, ''), 1000)
             when 'audio' then case when m.transcricao is not null
               then ' (áudio transcrito, ' || coalesce(m.audio_segundos::text || 's', 'duração desconhecida') || '): ' || left(m.transcricao, 1500)
               else ' (áudio de ' || coalesce(m.audio_segundos::text || 's', 'duração desconhecida') || ', sem transcrição)' end
             when 'imagem' then ' (foto' || case when m.transcricao is not null then ', o que aparece: ' || left(m.transcricao, 600) else ', sem descrição' end
               || ')' || coalesce(': ' || left(m.texto, 500), '')
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
  join atendimento.redes r on r.id = c.rede_id
  left join atendimento.classificacoes cl on cl.conta_id = a.conta_id and cl.contato = a.contato and cl.inicio = a.inicio
  where a.msgs_loja > 0
    and a.fim > now() - interval '60 days'
    and (cl.contato is null or cl.lido_ate < a.fim or cl.versao < 2
      or (cl.relembrou = 'aguardando' and cl.data_compromisso < (now() at time zone c.fuso)::date
          and cl.analisado_em < (cl.data_compromisso + 1)::timestamp at time zone c.fuso))
    and not exists (select 1 from atendimento.v_contato_vaga v where v.conta_id = a.conta_id and v.contato = a.contato)
    -- espera a transcrição dos áudios e a descrição das fotos recentes
    and not exists (select 1 from atendimento.mensagens x where x.conta_id = a.conta_id and x.contato = a.contato
      and x.transcricao_status = 'pendente' and x.recebida_em > now() - interval '6 hours')
    and not exists (select 1 from atendimento.lotes l where l.status = 'enviado'
      and l.chaves @> jsonb_build_array(jsonb_build_object('k', a.conta_id || '|' || a.contato || '|' || a.inicio::text)))
  order by a.fim
  limit least(greatest(p_limite, 1), 2000);
$$;

-- p_itens: [{i, tipo, servico, passou_preco, entendeu, trecho_entendeu, incluso, trecho_incluso, diferencial,
--   trecho_diferencial, chamou_para_loja, trecho_convite, marcou_dia, trecho_dia, data_compromisso, relembrou,
--   trecho_relembrou, cobrou_status, recrutamento}], i = posição em lotes.chaves. Item sem "tipo" é do checklist antigo.
create or replace function public.atendimento_salvar_classificacoes(p_lote uuid, p_itens jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into atendimento.classificacoes as cl (conta_id, contato, inicio, lido_ate, chamou_loja, trecho_convite,
    marcou_dia, trecho_dia, recrutamento, modelo, lote_id, analisado_em,
    versao, tipo, servico, passou_preco, entendeu, trecho_entendeu, incluso, trecho_incluso, diferencial, trecho_diferencial,
    data_compromisso, relembrou, trecho_relembrou, cobrou_status)
  select split_part(y.k, '|', 1)::uuid, split_part(y.k, '|', 2), split_part(y.k, '|', 3)::timestamptz, y.ate,
    coalesce((it->>'chamou_para_loja')::boolean, false), nullif(left(it->>'trecho_convite', 300), ''),
    coalesce((it->>'marcou_dia')::boolean, false), nullif(left(it->>'trecho_dia', 300), ''),
    coalesce((it->>'recrutamento')::boolean, false) or coalesce(it->>'tipo' = 'recrutamento', false), l.modelo, l.id, now(),
    case when it ? 'tipo' then 2 else 1 end,
    case when it->>'tipo' in ('oportunidade', 'acompanhamento', 'recrutamento', 'outro') then it->>'tipo' end,
    nullif(left(it->>'servico', 40), ''),
    (it->>'passou_preco')::boolean, (it->>'entendeu')::boolean, nullif(left(it->>'trecho_entendeu', 300), ''),
    (it->>'incluso')::boolean, nullif(left(it->>'trecho_incluso', 300), ''),
    (it->>'diferencial')::boolean, nullif(left(it->>'trecho_diferencial', 300), ''),
    atendimento.data_ou_nulo(it->>'data_compromisso'),
    case when it->>'relembrou' in ('sim', 'nao', 'aguardando', 'nao_se_aplica') then it->>'relembrou' end,
    nullif(left(it->>'trecho_relembrou', 300), ''),
    (it->>'cobrou_status')::boolean
  from jsonb_array_elements(p_itens) it
  join atendimento.lotes l on l.id = p_lote
  cross join lateral (select l.chaves -> ((it->>'i')::int) ch) x
  cross join lateral (select x.ch->>'k' k, (x.ch->>'ate')::timestamptz ate) y
  where y.k is not null
  on conflict (conta_id, contato, inicio) do update set
    lido_ate = excluded.lido_ate, chamou_loja = excluded.chamou_loja, trecho_convite = excluded.trecho_convite,
    marcou_dia = excluded.marcou_dia, trecho_dia = excluded.trecho_dia, recrutamento = excluded.recrutamento,
    modelo = excluded.modelo, lote_id = excluded.lote_id, analisado_em = excluded.analisado_em,
    versao = excluded.versao, tipo = excluded.tipo, servico = excluded.servico, passou_preco = excluded.passou_preco,
    entendeu = excluded.entendeu, trecho_entendeu = excluded.trecho_entendeu, incluso = excluded.incluso,
    trecho_incluso = excluded.trecho_incluso, diferencial = excluded.diferencial, trecho_diferencial = excluded.trecho_diferencial,
    data_compromisso = excluded.data_compromisso, relembrou = excluded.relembrou, trecho_relembrou = excluded.trecho_relembrou,
    cobrou_status = excluded.cobrou_status
  where cl.lido_ate <= excluded.lido_ate;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===================== Permissões =====================

revoke all on function public.atendimento_contas() from public, anon;
revoke all on function public.atendimento_painel(uuid, date, date) from public, anon;
revoke all on function public.atendimento_rede(uuid, date, date) from public, anon;
revoke all on function public.atendimento_rede_semanas(uuid) from public, anon;
revoke all on function public.atendimento_lista(uuid, date, date, text) from public, anon;
revoke all on function public.atendimento_conversa(uuid, text) from public, anon;
revoke all on function public.atendimento_filas(uuid) from public, anon;
revoke all on function public.atendimento_semanas(uuid) from public, anon;
revoke all on function public.atendimento_salvar_unidade(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.atendimento_salvar_rede(uuid, jsonb, jsonb, text, text) from public, anon;
revoke all on function public.atendimento_usuarios() from public, anon;
revoke all on function public.atendimento_usuario_remover(uuid) from public, anon;
grant execute on function public.atendimento_contas() to authenticated;
grant execute on function public.atendimento_painel(uuid, date, date) to authenticated;
grant execute on function public.atendimento_rede(uuid, date, date) to authenticated;
grant execute on function public.atendimento_rede_semanas(uuid) to authenticated;
grant execute on function public.atendimento_lista(uuid, date, date, text) to authenticated;
grant execute on function public.atendimento_conversa(uuid, text) to authenticated;
grant execute on function public.atendimento_filas(uuid) to authenticated;
grant execute on function public.atendimento_semanas(uuid) to authenticated;
grant execute on function public.atendimento_salvar_unidade(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.atendimento_salvar_rede(uuid, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.atendimento_usuarios() to authenticated;
grant execute on function public.atendimento_usuario_remover(uuid) to authenticated;

revoke all on function public.atendimento_registrar(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.atendimento_audios_pendentes(integer) from public, anon, authenticated;
revoke all on function public.atendimento_para_classificar(integer) from public, anon, authenticated;
revoke all on function public.atendimento_salvar_classificacoes(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.atendimento_eh_admin(uuid) from public, anon, authenticated;
revoke all on function public.atendimento_cadastrar_usuario(uuid, text, text, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.atendimento_registrar(text, text, jsonb) to service_role;
grant execute on function public.atendimento_audios_pendentes(integer) to service_role;
grant execute on function public.atendimento_para_classificar(integer) to service_role;
grant execute on function public.atendimento_salvar_classificacoes(uuid, jsonb) to service_role;
grant execute on function public.atendimento_eh_admin(uuid) to service_role;
grant execute on function public.atendimento_cadastrar_usuario(uuid, text, text, text, uuid, uuid[]) to service_role;

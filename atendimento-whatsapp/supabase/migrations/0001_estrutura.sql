-- Monitor de atendimento por WhatsApp (só escuta, nunca envia).
-- Projeto Supabase do CRM/gestor (xrvjlhseyqfgyvwwlwwb), schema próprio "atendimento".
-- O navegador não lê tabela nenhuma: tudo passa por funções em public que conferem
-- privado.atendimento_pode(). As Edge Functions usam funções liberadas só ao service_role.

create schema if not exists atendimento;
revoke all on schema atendimento from public, anon, authenticated;
grant usage on schema atendimento to service_role;

-- Quem pode abrir o painel (hoje só o Douglas)
create table atendimento.usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- Um WhatsApp monitorado por linha
create table atendimento.contas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  nome text not null,
  fuso text not null default 'America/Sao_Paulo',
  -- chave = dia da semana (0 domingo ... 6 sábado), valor = ["HH:MM","HH:MM"] ou null (fechado)
  horario jsonb not null,
  metas jsonb not null,
  url_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  -- a primeira instância da NeoGo que mandar evento fica travada nesta conta
  instance_id text,
  instance_nome text,
  ativo boolean not null default true,
  ultimo_evento_em timestamptz,
  ultimo_evento_tipo text,
  criado_em timestamptz not null default now()
);

create table atendimento.mensagens (
  id bigint generated always as identity primary key,
  conta_id uuid not null references atendimento.contas(id) on delete cascade,
  wa_id text not null,                 -- Info.ID do WhatsApp
  contato text not null,               -- telefone (5548...) ou 'lid:<id>' quando o WhatsApp esconde o número
  chat_jid text not null,
  de_loja boolean not null,            -- Info.IsFromMe
  enviada_em timestamptz not null,     -- Info.Timestamp
  recebida_em timestamptz not null default now(),
  tipo text not null check (tipo in ('texto','audio','imagem','video','documento','figurinha','localizacao','contato','reacao','outro')),
  texto text,
  audio_segundos integer,
  audio_voz boolean,                   -- PTT: áudio gravado na hora (não arquivo encaminhado)
  midia jsonb,                         -- dados para baixar o áudio (url, direct_path, media_key, mimetype)
  anuncio jsonb,                       -- meta_ads da NeoGo (clique em anúncio)
  nome_contato text,                   -- PushName (só em mensagem do cliente)
  responde_a text,                     -- mensagem citada
  lida_em timestamptz,                 -- quando o celular da loja abriu (recibo read-self)
  transcricao text,
  transcricao_status text check (transcricao_status in ('pendente','ok','erro','sem_midia')),
  transcricao_tentativas smallint not null default 0,
  transcricao_erro text,
  bruto jsonb,                         -- payload sem miniaturas, apagado depois de 30 dias
  unique (conta_id, wa_id)
);
create index mensagens_contato_idx on atendimento.mensagens (conta_id, contato, enviada_em, id);
create index mensagens_periodo_idx on atendimento.mensagens (conta_id, enviada_em);
create index mensagens_transcrever_idx on atendimento.mensagens (recebida_em) where transcricao_status = 'pendente';

-- Recibo de leitura que chegou antes da própria mensagem (raro, mas acontece)
create table atendimento.leituras_pendentes (
  conta_id uuid not null references atendimento.contas(id) on delete cascade,
  wa_id text not null,
  lida_em timestamptz not null,
  criado_em timestamptz not null default now(),
  primary key (conta_id, wa_id)
);

-- O WhatsApp às vezes identifica o mesmo contato por um código (LID) em vez do telefone
create table atendimento.contatos_lid (
  conta_id uuid not null references atendimento.contas(id) on delete cascade,
  lid text not null,
  telefone text not null,
  primary key (conta_id, lid)
);

-- Lotes enviados à OpenAI
create table atendimento.lotes (
  id uuid primary key default gen_random_uuid(),
  openai_lote text unique,
  openai_arquivo text,
  modelo text not null,
  status text not null,               -- enviado | concluido | erro
  status_openai text,
  itens integer not null,
  chaves jsonb not null default '[]', -- "conta|contato|inicio" de cada atendimento do lote
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz,
  erro text
);

-- Resposta da IA por atendimento: só fatos (chamou pra loja, marcou dia, é vaga)
create table atendimento.classificacoes (
  conta_id uuid not null references atendimento.contas(id) on delete cascade,
  contato text not null,
  inicio timestamptz not null,        -- início do atendimento
  lido_ate timestamptz not null,      -- última mensagem que a IA viu
  chamou_loja boolean not null,
  trecho_convite text,
  marcou_dia boolean not null,
  trecho_dia text,
  recrutamento boolean not null,
  modelo text not null,
  lote_id uuid references atendimento.lotes(id) on delete set null,
  analisado_em timestamptz not null default now(),
  primary key (conta_id, contato, inicio)
);

-- Fechamento semanal congelado (histórico para mostrar evolução)
create table atendimento.semanas (
  conta_id uuid not null references atendimento.contas(id) on delete cascade,
  semana date not null,               -- segunda-feira
  metricas jsonb not null,
  fechada_em timestamptz not null default now(),
  primary key (conta_id, semana)
);

alter table atendimento.usuarios enable row level security;
alter table atendimento.contas enable row level security;
alter table atendimento.mensagens enable row level security;
alter table atendimento.leituras_pendentes enable row level security;
alter table atendimento.contatos_lid enable row level security;
alter table atendimento.lotes enable row level security;
alter table atendimento.classificacoes enable row level security;
alter table atendimento.semanas enable row level security;

-- Acesso ao painel: estar na lista e, se tiver 2FA cadastrado, sessão com 2FA
create or replace function privado.atendimento_pode() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from atendimento.usuarios u where u.user_id = auth.uid())
    and (coalesce(auth.jwt()->>'aal', '') = 'aal2'
         or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'));
$$;
revoke all on function privado.atendimento_pode() from public, anon, authenticated;

-- Segredo do cron (pg_cron -> Edge Functions)
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'atendimento_cron',
  'Header x-cron-secret das Edge Functions do monitor de atendimento');

-- Douglas é o único usuário
insert into atendimento.usuarios (user_id)
select id from auth.users where email = 'odouglasestevam@gmail.com';

-- Primeira conta: Sapataria do Futuro Nações Shopping.
-- Horário padrão de shopping (seg a sáb 10h às 22h, dom 14h às 20h): ajustável no painel.
-- Metas pelas boas práticas, também ajustáveis no painel.
insert into atendimento.contas (slug, nome, horario, metas) values (
  'sapataria-nacoes', 'Sapataria do Futuro Nações Shopping',
  '{"0":["14:00","20:00"],"1":["10:00","22:00"],"2":["10:00","22:00"],"3":["10:00","22:00"],"4":["10:00","22:00"],"5":["10:00","22:00"],"6":["10:00","22:00"]}',
  '{"primeira_resposta_min":15,"resposta_24h_pct":95,"retorno_pct":80,"convite_pct":80,"dia_marcado_pct":50,"audio_max_pct":30}'
);

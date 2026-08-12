-- Schema do app de agenda. Rodar no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique, -- somente dígitos com DDI, ex: 5548999999999
  notes text,
  created_at timestamptz not null default now()
);

create type service_category as enum ('cilios', 'sobrancelha', 'outro');
create type procedimento_tipo as enum ('aplicacao', 'manutencao');

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category service_category not null default 'cilios',
  price numeric(10,2) not null default 0,
  duration_min integer not null default 60,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- null = fora do ciclo de aplicação/manutenção (ex: design de sobrancelha isolado)
  tipo_procedimento procedimento_tipo
);

create type appointment_status as enum ('scheduled', 'confirmed', 'cancelled', 'done');
create type payment_method as enum ('dinheiro', 'pix', 'credito', 'debito', 'cortesia');
create type motivo_cancelamento as enum ('cliente_cancelou', 'cliente_quer_reagendar', 'resposta_nao_reconhecida');

create table appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  service_id uuid not null references services(id),
  price numeric(10,2) not null default 0, -- valor cobrado (snapshot do preço do serviço na hora do agendamento)
  start_at timestamptz not null,
  duration_min integer not null default 60,
  status appointment_status not null default 'scheduled',
  payment_method payment_method, -- preenchido só quando marcado como concluído
  notes text,
  confirmation_sent_at timestamptz,
  reminder_day_before_sent_at timestamptz, -- na prática: confirmação interativa de ~24h antes
  reminder_3h_sent_at timestamptz,
  created_at timestamptz not null default now(),
  motivo_cancelamento motivo_cancelamento -- preenchido quando a cliente cancela/pede reagendar por WhatsApp
);

create index appointments_start_at_idx on appointments(start_at);

create type message_direction as enum ('out', 'in');

create table message_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  direction message_direction not null,
  body text not null,
  created_at timestamptz not null default now()
);

create type pendencia_status as enum ('pendente', 'resolvida', 'descartada');

-- Confirmação de agendamento detectada no WhatsApp (via n8n, gatilho "Agendado
-- na data") sem um agendamento correspondente na agenda — alerta de reconciliação,
-- nunca cria agendamento sozinho.
create table pendencias_agendamento (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  nome_sugerido text,
  client_id uuid references clients(id) on delete set null,
  mensagem text not null,
  data_sugerida date,
  hora_sugerida text, -- HH:mm, guardado como texto pra não brigar com timezone antes de confirmar
  valor_sugerido numeric(10,2),
  status pendencia_status not null default 'pendente',
  created_at timestamptz not null default now()
);

create type aviso_status as enum ('pendente', 'resolvido');

-- Cliente respondeu a confirmação de 24h cancelando ou pedindo pra reagendar
-- (ou mandou algo que não bateu com nenhuma palavra-chave reconhecida) — a Fabíola
-- precisa entrar em contato pra resolver. O agendamento já sai da agenda sozinho
-- (status cancelled); isso aqui é só o aviso de "precisa agir".
create table avisos_cancelamento (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  cliente_nome text not null,
  motivo motivo_cancelamento not null,
  mensagem_recebida text not null,
  status aviso_status not null default 'pendente',
  created_at timestamptz not null default now()
);

create table estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'cilios',
  unidade text not null default 'unidade',
  quantidade_atual numeric(10,2) not null default 0,
  estoque_minimo numeric(10,2) not null default 0,
  custo_unitario numeric(10,2) not null default 0, -- do último movimento de compra, pra estimar valor em estoque
  ultima_compra_em timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create type estoque_movimento_tipo as enum ('compra', 'consumo', 'ajuste');
create type estoque_movimento_direcao as enum ('entrada', 'saida');

create table estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references estoque_itens(id) on delete cascade,
  tipo estoque_movimento_tipo not null,
  direcao estoque_movimento_direcao not null,
  quantidade numeric(10,2) not null,
  valor_total numeric(10,2), -- só em compras
  fornecedor text,
  observacao text,
  created_at timestamptz not null default now()
);

create index estoque_movimentos_item_id_idx on estoque_movimentos(item_id);

create type despesa_tipo as enum ('fixa', 'variavel');
create type despesa_recorrencia as enum ('mensal', 'unica');

-- Custos que não são item físico de estoque (aluguel, contas, etc) — visão
-- completa do negócio junto com o estoque, numa aba separada da mesma tela.
create table despesas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo despesa_tipo not null default 'fixa',
  recorrencia despesa_recorrencia not null default 'mensal',
  valor numeric(10,2) not null default 0,
  dia_vencimento integer, -- só quando recorrencia = mensal
  data date, -- só quando recorrencia = unica
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clients enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table message_log enable row level security;
alter table pendencias_agendamento enable row level security;
alter table avisos_cancelamento enable row level security;
alter table estoque_itens enable row level security;
alter table estoque_movimentos enable row level security;
alter table despesas enable row level security;

-- App é single-tenant (só a esposa usa) e acessa via service role no servidor,
-- então não expomos essas tabelas pro cliente anônimo/authenticated do Supabase.
create policy "service role only" on clients for all using (false);
create policy "service role only" on services for all using (false);
create policy "service role only" on appointments for all using (false);
create policy "service role only" on message_log for all using (false);
create policy "service role only" on pendencias_agendamento for all using (false);
create policy "service role only" on avisos_cancelamento for all using (false);
create policy "service role only" on estoque_itens for all using (false);
create policy "service role only" on estoque_movimentos for all using (false);
create policy "service role only" on despesas for all using (false);

-- Financeiro da The New Ads (financeiro.thenewads.com.br)
-- Projeto Supabase xrvjlhseyqfgyvwwlwwb, schema próprio "financeiro", separado do CRM e do gestor de tarefas.
-- Só quem está em financeiro.usuarios enxerga alguma coisa (hoje, só o Douglas).
-- O Asaas é a fonte da verdade do dinheiro: cobrancas, clientes e assinaturas são cópia de leitura.
-- O que é só do app: pausar cobrança, nome de contato, observação, mensagens enviadas, avisos e configuração.

create schema financeiro;
grant usage on schema financeiro to authenticated, service_role;

-- =========================================================
-- Acesso
-- =========================================================
create table financeiro.usuarios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  criado_em timestamptz not null default now()
);

-- Mesmo critério do gestor: com autenticador cadastrado, a sessão precisa estar em aal2.
create function privado.financeiro_acesso() returns boolean
language sql stable security definer set search_path = '' as $$
  select (coalesce((select auth.jwt()->>'aal') = 'aal2', false)
      or not exists (select 1 from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified'))
    and exists (select 1 from financeiro.usuarios where user_id = (select auth.uid()));
$$;

-- Servidor (Edge Functions com service_role) ou o dono logado.
create function privado.financeiro_pode() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'role') = 'service_role', false) or privado.financeiro_acesso();
$$;

create function privado.financeiro_hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

revoke all on function privado.financeiro_acesso(), privado.financeiro_pode() from public, anon;
grant execute on function privado.financeiro_acesso(), privado.financeiro_pode(), privado.financeiro_hoje()
  to authenticated, service_role;

-- =========================================================
-- Cópia do Asaas
-- =========================================================
create table financeiro.clientes (
  asaas_id text primary key,
  nome text,
  cpf_cnpj text,
  email text,
  celular text,                                       -- só dígitos, como veio do Asaas
  excluido boolean not null default false,
  -- do app (o sincronismo nunca sobrescreve)
  contato text,                                       -- como chamar na mensagem; vazio usa o nome do Asaas
  cobranca_pausada boolean not null default false,
  observacao text,
  atualizado_em timestamptz not null default now()
);

create table financeiro.assinaturas (
  asaas_id text primary key,
  cliente_id text not null references financeiro.clientes (asaas_id),
  valor numeric(12, 2) not null,
  ciclo text,
  forma text,
  proximo_vencimento date,
  status text not null,
  descricao text,
  excluida boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create index assinaturas_cliente_idx on financeiro.assinaturas (cliente_id);

create table financeiro.cobrancas (
  asaas_id text primary key,
  cliente_id text not null references financeiro.clientes (asaas_id),
  assinatura_id text,
  valor numeric(12, 2) not null,
  valor_liquido numeric(12, 2),
  forma text,
  status text not null,
  vencimento date not null,
  vencimento_original date,
  pago_em date,
  criada_em date,
  descricao text,
  link_fatura text,
  numero_fatura text,
  excluida boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create index cobrancas_vencimento_idx on financeiro.cobrancas (vencimento);
create index cobrancas_cliente_idx on financeiro.cobrancas (cliente_id);
create index cobrancas_pago_em_idx on financeiro.cobrancas (pago_em);

-- Status do Asaas traduzido para o que importa no app.
create function privado.financeiro_situacao(p_status text, p_excluida boolean, p_vencimento date, p_hoje date)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_excluida then 'excluida'
    when p_status in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED') then 'paga'
    when p_status in ('REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED',
                      'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL') then 'estornada'
    when p_vencimento < p_hoje then 'atrasada'
    when p_vencimento = p_hoje then 'vence_hoje'
    else 'a_vencer'
  end;
$$;
grant execute on function privado.financeiro_situacao(text, boolean, date, date) to authenticated, service_role;

create function privado.financeiro_brl(p numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(coalesce(p, 0), 'FM999,999,990.00'), ',.', '.,');
$$;

create function privado.financeiro_forma(p text) returns text
language sql immutable set search_path = '' as $$
  select case p when 'PIX' then 'Pix' when 'BOLETO' then 'boleto' when 'CREDIT_CARD' then 'cartão'
    when 'DEBIT_CARD' then 'débito' when 'TRANSFER' then 'transferência' when 'DEPOSIT' then 'depósito' end;
$$;

create view financeiro.cobrancas_visao with (security_invoker = true) as
select c.*,
  cl.nome as cliente_nome,
  coalesce(nullif(trim(cl.contato), ''), cl.nome) as cliente_contato,
  cl.celular as cliente_celular,
  cl.cobranca_pausada,
  cl.excluido as cliente_excluido,
  s.situacao,
  case when s.situacao = 'atrasada' then h.hoje - c.vencimento else 0 end as dias_atraso,
  c.vencimento - h.hoje as dias_para_vencer,
  case when c.pago_em is not null then greatest(c.pago_em - c.vencimento, 0) end as dias_atraso_pagamento
from financeiro.cobrancas c
join financeiro.clientes cl on cl.asaas_id = c.cliente_id
cross join lateral (select privado.financeiro_hoje() as hoje) h
cross join lateral (select privado.financeiro_situacao(c.status, c.excluida, c.vencimento, h.hoje) as situacao) s;

-- =========================================================
-- Do app: configuração, mensagens, avisos, aparelhos, registros
-- =========================================================
create table financeiro.config (
  id boolean primary key default true check (id),
  cobranca_ativa boolean not null default false,      -- desligada = modo teste: registra o que mandaria, não manda
  ativada_em date,
  dias_antes int not null default 10 check (dias_antes between 1 and 30),
  avisar_no_dia boolean not null default true,
  cobrar_atraso_diario boolean not null default true,
  avisar_atraso_dias int not null default 10 check (avisar_atraso_dias between 1 and 90),
  enviar_pix boolean not null default true,
  texto_antes text not null check (length(trim(texto_antes)) > 0),
  texto_no_dia text not null check (length(trim(texto_no_dia)) > 0),
  texto_atraso text not null check (length(trim(texto_atraso)) > 0),
  atualizado_em timestamptz not null default now()
);

insert into financeiro.config (texto_antes, texto_no_dia, texto_atraso) values (
  E'Olá, {contato}! Tudo bem?\n\nSegue a fatura da The New Ads.\n\nValor: {valor}\nVencimento: {vencimento}\nReferente a: {descricao}\n\nPara pagar por Pix, boleto ou cartão: {link}',
  E'Olá, {contato}! Passando para lembrar que a fatura da The New Ads de {valor} vence hoje.\n\nPara pagar: {link}',
  E'Olá, {contato}. A fatura da The New Ads de {valor}, com vencimento em {vencimento}, ainda consta em aberto.\n\nPara pagar: {link}\n\nSe já pagou, pode desconsiderar esta mensagem.'
);

-- Ligar a cobrança marca o dia. O "10 dias antes" só vale para o que ainda não estava nessa janela,
-- porque o Asaas já avisou essas (evita o cliente receber a mesma cobrança duas vezes na virada).
create function privado.financeiro_config_alterada() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cobranca_ativa and not old.cobranca_ativa then new.ativada_em := privado.financeiro_hoje(); end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger trg_config_alterada before update on financeiro.config
  for each row execute function privado.financeiro_config_alterada();

create table financeiro.mensagens (
  id uuid primary key default gen_random_uuid(),
  cobranca_id text not null references financeiro.cobrancas (asaas_id) on delete cascade,
  etapa text not null check (etapa in ('antes', 'no_dia', 'atraso')),
  dia date not null,
  telefone text,
  texto text not null,
  situacao text not null check (situacao in ('enviada', 'falhou', 'simulada')),
  tentativas int not null default 1,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cobranca_id, etapa, dia)
);
create index mensagens_dia_idx on financeiro.mensagens (dia);

-- Fila e histórico das notificações no celular do Douglas. Uma chave por fato, nunca repete.
create table financeiro.avisos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  tipo text not null check (tipo in ('pagamento', 'mes', 'atraso', 'falha', 'sistema')),
  titulo text not null,
  corpo text not null,
  url text not null default '/#/mes',
  cobranca_id text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  reservado_em timestamptz,
  tentativas int not null default 0,
  erro text
);
create index avisos_pendentes_idx on financeiro.avisos (criado_em) where enviado_em is null;

create table financeiro.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references financeiro.usuarios (user_id) on delete cascade,
  endpoint text not null unique check (
    endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9-]+\.push\.apple\.com)/'
    and length(endpoint) <= 4096),
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

-- Cada webhook do Asaas fica guardado. Só conta como repetido depois de processado:
-- se o processamento falhar, a nova tentativa do Asaas passa de novo.
create table financeiro.eventos (
  id text primary key,
  evento text not null,
  cobranca_id text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  payload jsonb not null
);
create index eventos_recebido_idx on financeiro.eventos (recebido_em);

create table financeiro.sincronizacoes (
  id bigint generated always as identity primary key,
  origem text not null check (origem in ('agendada', 'manual', 'inicial')),
  inicio timestamptz not null default now(),
  fim timestamptz,
  ok boolean,
  resumo jsonb,
  erro text
);

-- =========================================================
-- Gravação vinda do Asaas (só o servidor chama)
-- =========================================================
create function public.financeiro_salvar_cliente(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_celular text := nullif(regexp_replace(coalesce(nullif(p->>'mobilePhone', ''), p->>'phone', ''), '\D', '', 'g'), '');
begin
  if coalesce(p->>'id', '') = '' then raise exception 'Cliente sem id.'; end if;
  insert into financeiro.clientes (asaas_id, nome, cpf_cnpj, email, celular, excluido)
  values (p->>'id', nullif(trim(p->>'name'), ''), nullif(p->>'cpfCnpj', ''), nullif(p->>'email', ''), v_celular,
          coalesce((p->>'deleted')::boolean, false))
  on conflict (asaas_id) do update set
    nome = excluded.nome, cpf_cnpj = excluded.cpf_cnpj, email = excluded.email,
    celular = excluded.celular, excluido = excluded.excluido, atualizado_em = now();
end;
$$;

create function public.financeiro_salvar_assinatura(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p->>'id', '') = '' or coalesce(p->>'customer', '') = '' then raise exception 'Assinatura sem id ou cliente.'; end if;
  insert into financeiro.clientes (asaas_id) values (p->>'customer') on conflict do nothing;
  insert into financeiro.assinaturas (asaas_id, cliente_id, valor, ciclo, forma, proximo_vencimento, status, descricao, excluida)
  values (p->>'id', p->>'customer', (p->>'value')::numeric, p->>'cycle', p->>'billingType',
          nullif(p->>'nextDueDate', '')::date, coalesce(p->>'status', 'ACTIVE'), nullif(trim(p->>'description'), ''),
          coalesce((p->>'deleted')::boolean, false))
  on conflict (asaas_id) do update set
    cliente_id = excluded.cliente_id, valor = excluded.valor, ciclo = excluded.ciclo, forma = excluded.forma,
    proximo_vencimento = excluded.proximo_vencimento, status = excluded.status, descricao = excluded.descricao,
    excluida = excluded.excluida, atualizado_em = now();
end;
$$;

-- Devolve a situação nova. Com p_avisar, a passagem para "paga" vira aviso no celular,
-- uma vez por cobrança (o cartão manda CONFIRMED e depois RECEIVED) e só se o pagamento é recente
-- (a carga inicial de 12 meses não pode disparar centenas de avisos).
create function public.financeiro_salvar_cobranca(p jsonb, p_avisar boolean default true) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := privado.financeiro_hoje();
  v_id text := p->>'id';
  v_cliente text := p->>'customer';
  v_excluida boolean := coalesce((p->>'deleted')::boolean, false);
  v_venc date := (p->>'dueDate')::date;
  v_pago date := coalesce(nullif(p->>'clientPaymentDate', '')::date, nullif(p->>'paymentDate', '')::date,
                          nullif(p->>'confirmedDate', '')::date);
  v_antes text;
  v_depois text;
  v_nome text;
  v_forma text;
  v_corpo text;
begin
  if coalesce(v_id, '') = '' or coalesce(v_cliente, '') = '' or v_venc is null then
    raise exception 'Cobrança sem id, cliente ou vencimento.';
  end if;
  insert into financeiro.clientes (asaas_id) values (v_cliente) on conflict do nothing;

  select privado.financeiro_situacao(status, excluida, vencimento, v_hoje) into v_antes
  from financeiro.cobrancas where asaas_id = v_id;

  insert into financeiro.cobrancas (asaas_id, cliente_id, assinatura_id, valor, valor_liquido, forma, status,
    vencimento, vencimento_original, pago_em, criada_em, descricao, link_fatura, numero_fatura, excluida)
  values (v_id, v_cliente, nullif(p->>'subscription', ''), (p->>'value')::numeric, nullif(p->>'netValue', '')::numeric,
    p->>'billingType', coalesce(p->>'status', 'PENDING'), v_venc, nullif(p->>'originalDueDate', '')::date, v_pago,
    nullif(p->>'dateCreated', '')::date, nullif(trim(p->>'description'), ''), nullif(p->>'invoiceUrl', ''),
    nullif(p->>'invoiceNumber', ''), v_excluida)
  on conflict (asaas_id) do update set
    cliente_id = excluded.cliente_id, assinatura_id = excluded.assinatura_id, valor = excluded.valor,
    valor_liquido = excluded.valor_liquido, forma = excluded.forma, status = excluded.status,
    vencimento = excluded.vencimento, vencimento_original = excluded.vencimento_original, pago_em = excluded.pago_em,
    criada_em = excluded.criada_em, descricao = excluded.descricao, link_fatura = excluded.link_fatura,
    numero_fatura = excluded.numero_fatura, excluida = excluded.excluida, atualizado_em = now();

  v_depois := privado.financeiro_situacao(coalesce(p->>'status', 'PENDING'), v_excluida, v_venc, v_hoje);

  if p_avisar and v_depois = 'paga' and v_antes is distinct from 'paga' and coalesce(v_pago, v_hoje) >= v_hoje - 3 then
    select coalesce(nome, 'Cliente') into v_nome from financeiro.clientes where asaas_id = v_cliente;
    v_forma := privado.financeiro_forma(p->>'billingType');
    v_corpo := privado.financeiro_brl((p->>'value')::numeric) || coalesce(' via ' || v_forma, '') || '. ' ||
      case when coalesce(v_pago, v_hoje) > v_venc
        then (coalesce(v_pago, v_hoje) - v_venc) || case when coalesce(v_pago, v_hoje) - v_venc = 1 then ' dia' else ' dias' end
             || ' depois do vencimento (' || to_char(v_venc, 'DD/MM') || ').'
        else 'Vencimento ' || to_char(v_venc, 'DD/MM') || '.' end;
    insert into financeiro.avisos (chave, tipo, titulo, corpo, url, cobranca_id)
    values ('pagamento:' || v_id, 'pagamento', v_nome || ' pagou', v_corpo, '/#/cliente/' || v_cliente, v_id)
    on conflict (chave) do nothing;
  end if;
  return v_depois;
end;
$$;

-- A carga do Asaas chega em páginas de 100: uma chamada por página em vez de uma por item.
create function public.financeiro_salvar_lote(p_tipo text, p_itens jsonb, p_avisar boolean default true) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  n int := 0;
begin
  if p_tipo not in ('clientes', 'assinaturas', 'cobrancas') then raise exception 'Tipo desconhecido: %', p_tipo; end if;
  for v in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if p_tipo = 'clientes' then perform public.financeiro_salvar_cliente(v);
    elsif p_tipo = 'assinaturas' then perform public.financeiro_salvar_assinatura(v);
    else perform public.financeiro_salvar_cobranca(v, p_avisar);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Sumiu da listagem do Asaas (excluída sem o webhook chegar). Sem isso o app cobraria o cliente
-- por uma fatura que não existe mais.
create function public.financeiro_marcar_sumido(p_tipo text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_tipo = 'cobranca' then
    update financeiro.cobrancas set excluida = true, atualizado_em = now() where asaas_id = p_id;
  elsif p_tipo = 'assinatura' then
    update financeiro.assinaturas set excluida = true, atualizado_em = now() where asaas_id = p_id;
  elsif p_tipo = 'cliente' then
    update financeiro.clientes set excluido = true, atualizado_em = now() where asaas_id = p_id;
  else
    raise exception 'Tipo desconhecido: %', p_tipo;
  end if;
end;
$$;

-- true = evento já processado antes (o webhook responde 200 e não faz nada).
create function public.financeiro_registrar_evento(p_id text, p_evento text, p_cobranca text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_processado timestamptz;
begin
  insert into financeiro.eventos (id, evento, cobranca_id, payload) values (p_id, p_evento, p_cobranca, p_payload)
  on conflict (id) do nothing;
  select processado_em into v_processado from financeiro.eventos where id = p_id;
  return v_processado is not null;
end;
$$;

create function public.financeiro_evento_processado(p_id text) returns void
language sql security definer set search_path = '' as $$
  update financeiro.eventos set processado_em = now() where id = p_id;
$$;

create function public.financeiro_iniciar_sync(p_origem text) returns bigint
language sql security definer set search_path = '' as $$
  insert into financeiro.sincronizacoes (origem) values (p_origem) returning id;
$$;

-- Falha vira aviso, um por dia.
create function public.financeiro_concluir_sync(p_id bigint, p_ok boolean, p_resumo jsonb, p_erro text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update financeiro.sincronizacoes set fim = now(), ok = p_ok, resumo = p_resumo, erro = p_erro where id = p_id;
  if not p_ok then
    insert into financeiro.avisos (chave, tipo, titulo, corpo, url)
    values ('sync:' || privado.financeiro_hoje(), 'sistema', 'Falha ao ler o Asaas',
            coalesce(left(p_erro, 180), 'Erro desconhecido') || '. Os dados do app podem estar desatualizados.', '/#/ajustes')
    on conflict (chave) do nothing;
  end if;
end;
$$;

-- =========================================================
-- Cobrança automática
-- =========================================================
-- O que cada cobrança em aberto deve receber hoje. Usada pelo servidor (envio) e pela tela (prévia).
-- "Já feito" = enviada; no modo teste, simulada também conta, senão o registro repetiria o dia inteiro.
create function public.financeiro_envios_de_hoje()
returns table (cobranca_id text, cliente_id text, cliente_nome text, contato text, celular text, etapa text,
  valor numeric, vencimento date, descricao text, link_fatura text, forma text, dias_atraso int,
  tentativas_hoje int, situacao_hoje text)
language sql stable security definer set search_path = '' as $$
  with cfg as (select * from financeiro.config where id),
  base as (
    select v.*, case
      when v.situacao = 'a_vencer' and v.dias_para_vencer <= cfg.dias_antes
        and (not cfg.cobranca_ativa or cfg.ativada_em is null
             or v.vencimento - cfg.dias_antes >= cfg.ativada_em or v.criada_em >= cfg.ativada_em)
        then 'antes'
      when v.situacao = 'vence_hoje' and cfg.avisar_no_dia then 'no_dia'
      when v.situacao = 'atrasada' and cfg.cobrar_atraso_diario then 'atraso'
    end as etapa
    from financeiro.cobrancas_visao v cross join cfg
    where v.situacao in ('a_vencer', 'vence_hoje', 'atrasada') and not v.cobranca_pausada and not v.cliente_excluido
  )
  select b.asaas_id, b.cliente_id, b.cliente_nome, b.cliente_contato, b.cliente_celular, b.etapa,
    b.valor, b.vencimento, b.descricao, b.link_fatura, b.forma, b.dias_atraso,
    coalesce(m.tentativas, 0), m.situacao
  from base b
  cross join cfg
  left join financeiro.mensagens m
    on m.cobranca_id = b.asaas_id and m.etapa = b.etapa and m.dia = privado.financeiro_hoje()
  where b.etapa is not null
    and privado.financeiro_pode()
    and (m.id is null
         or (m.situacao = 'falhou' and m.tentativas < 3)
         or (m.situacao = 'simulada' and cfg.cobranca_ativa))
    and not exists (
      select 1 from financeiro.mensagens e
      where e.cobranca_id = b.asaas_id and e.etapa = b.etapa and e.etapa <> 'atraso'
        and (e.situacao = 'enviada' or (e.situacao = 'simulada' and not cfg.cobranca_ativa)))
  order by b.vencimento, b.cliente_nome;
$$;

-- Registro de cada mensagem (uma por cobrança, etapa e dia). Enviada nunca volta a falhou.
-- Sem celular não adianta tentar de novo no mesmo dia.
create function public.financeiro_registrar_mensagem(p_cobranca text, p_etapa text, p_telefone text, p_texto text,
  p_situacao text, p_erro text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := privado.financeiro_hoje();
  v_tentativas int;
  v_nome text;
begin
  insert into financeiro.mensagens (cobranca_id, etapa, dia, telefone, texto, situacao, erro, tentativas)
  values (p_cobranca, p_etapa, v_hoje, p_telefone, p_texto, p_situacao, p_erro,
          case when p_situacao = 'falhou' and p_telefone is null then 3 else 1 end)
  on conflict (cobranca_id, etapa, dia) do update set
    telefone = excluded.telefone,
    texto = case when financeiro.mensagens.situacao = 'enviada' then financeiro.mensagens.texto else excluded.texto end,
    situacao = case when financeiro.mensagens.situacao = 'enviada' then 'enviada' else excluded.situacao end,
    erro = case when financeiro.mensagens.situacao = 'enviada' then financeiro.mensagens.erro else excluded.erro end,
    tentativas = case
      when financeiro.mensagens.situacao = 'enviada' then financeiro.mensagens.tentativas
      when excluded.situacao = 'falhou' and excluded.telefone is null then 3
      when excluded.situacao = 'falhou' and financeiro.mensagens.situacao = 'falhou' then financeiro.mensagens.tentativas + 1
      else 1 end,
    atualizado_em = now()
  returning tentativas into v_tentativas;

  if p_situacao = 'falhou' and v_tentativas >= 3 then
    select coalesce(cl.nome, 'Cliente') into v_nome
    from financeiro.cobrancas c join financeiro.clientes cl on cl.asaas_id = c.cliente_id where c.asaas_id = p_cobranca;
    insert into financeiro.avisos (chave, tipo, titulo, corpo, url, cobranca_id)
    values ('falha:' || p_cobranca || ':' || v_hoje, 'falha', 'Cobrança não enviada',
            v_nome || ': ' || coalesce(p_erro, 'erro no envio') || '.', '/#/cobrancas', p_cobranca)
    on conflict (chave) do nothing;
  end if;
end;
$$;

-- Cliente que acabou de cruzar o limite de atraso. A janela de 3 dias evita avisar de cobrança
-- antiga, perdida há meses, no dia em que o app entra no ar.
create function public.financeiro_gerar_avisos_atraso() returns int
language plpgsql security definer set search_path = '' as $$
declare v_qtd int;
begin
  insert into financeiro.avisos (chave, tipo, titulo, corpo, url, cobranca_id)
  select 'atraso:' || v.asaas_id, 'atraso',
    coalesce(v.cliente_nome, 'Cliente') || ': ' || v.dias_atraso || ' dias de atraso',
    privado.financeiro_brl(v.valor) || ' venceu em ' || to_char(v.vencimento, 'DD/MM') || ' e continua em aberto. ' ||
      case when cfg.cobranca_ativa and cfg.cobrar_atraso_diario and not v.cobranca_pausada
        then 'A cobrança automática segue todo dia.' else 'A cobrança automática não está enviando para ele.' end,
    '/#/cliente/' || v.cliente_id, v.asaas_id
  from financeiro.cobrancas_visao v cross join financeiro.config cfg
  where v.situacao = 'atrasada' and not v.cliente_excluido
    and v.dias_atraso between cfg.avisar_atraso_dias and cfg.avisar_atraso_dias + 2
  on conflict (chave) do nothing;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- Dia 1: o previsto do mês, mais o que ficou em aberto de meses anteriores.
create function public.financeiro_gerar_aviso_mes() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := privado.financeiro_hoje();
  v_ini date := date_trunc('month', v_hoje)::date;
  v_fim date := (date_trunc('month', v_hoje) + interval '1 month')::date;
  v_meses text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  v_total numeric; v_qtd int; v_aberto numeric; v_corpo text; v_n int;
begin
  select coalesce(sum(valor), 0), count(*) into v_total, v_qtd
  from financeiro.cobrancas_visao
  where vencimento >= v_ini and vencimento < v_fim and situacao not in ('excluida', 'estornada');
  select coalesce(sum(valor), 0) into v_aberto
  from financeiro.cobrancas_visao where situacao = 'atrasada' and vencimento < v_ini;
  v_corpo := privado.financeiro_brl(v_total) || ' em ' || v_qtd || case when v_qtd = 1 then ' cobrança.' else ' cobranças.' end ||
    case when v_aberto > 0 then ' Mais ' || privado.financeiro_brl(v_aberto) || ' de meses anteriores em aberto.' else '' end;
  insert into financeiro.avisos (chave, tipo, titulo, corpo, url)
  values ('mes:' || to_char(v_ini, 'YYYY-MM'), 'mes', 'Previsto para ' || v_meses[extract(month from v_ini)::int], v_corpo, '/#/mes')
  on conflict (chave) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- =========================================================
-- Notificações no celular (só o servidor lê e marca)
-- =========================================================
-- Reserva antes de mandar: o webhook e a repescagem do cron podem rodar juntos e o mesmo push
-- não pode sair duas vezes. Reserva vencida (função que caiu no meio) volta para a fila em 2 minutos.
create function public.financeiro_reservar_avisos()
returns table (id uuid, titulo text, corpo text, url text, inscricoes jsonb)
language sql security definer set search_path = '' as $$
  with livres as (
    select a.id from financeiro.avisos a
    where a.enviado_em is null and a.tentativas < 5 and a.criado_em > now() - interval '1 day'
      and (a.reservado_em is null or a.reservado_em < now() - interval '2 minutes')
      and exists (select 1 from financeiro.push_inscricoes)
    order by a.criado_em
    for update skip locked
  )
  update financeiro.avisos a set reservado_em = now()
  from livres where a.id = livres.id
  returning a.id, a.titulo, a.corpo, a.url,
    (select coalesce(jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)), '[]')
       from financeiro.push_inscricoes p);
$$;

create function public.financeiro_marcar_aviso(p_id uuid, p_ok boolean, p_erro text) returns void
language sql security definer set search_path = '' as $$
  update financeiro.avisos
  set enviado_em = case when p_ok then now() end, reservado_em = null, tentativas = tentativas + 1,
      erro = case when p_ok then null else p_erro end
  where id = p_id;
$$;

create function public.financeiro_apagar_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from financeiro.push_inscricoes where endpoint = p_endpoint;
$$;

create function public.financeiro_ler_segredo(p_nome text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'financeiro_' || p_nome;
$$;

-- Do dono logado
create function public.financeiro_salvar_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.financeiro_acesso() then raise exception 'Sem acesso ao financeiro.'; end if;
  insert into financeiro.push_inscricoes (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- A chave pública VAPID não é segredo, mas fica no Vault junto com a privada para nunca descasar.
create function public.financeiro_vapid_publica() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.financeiro_acesso() then raise exception 'Sem acesso ao financeiro.'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'financeiro_vapid_publica');
end;
$$;

revoke execute on function
  public.financeiro_salvar_cliente(jsonb), public.financeiro_salvar_assinatura(jsonb),
  public.financeiro_salvar_cobranca(jsonb, boolean), public.financeiro_registrar_evento(text, text, text, jsonb),
  public.financeiro_evento_processado(text), public.financeiro_iniciar_sync(text),
  public.financeiro_concluir_sync(bigint, boolean, jsonb, text), public.financeiro_envios_de_hoje(),
  public.financeiro_registrar_mensagem(text, text, text, text, text, text), public.financeiro_gerar_avisos_atraso(),
  public.financeiro_gerar_aviso_mes(), public.financeiro_reservar_avisos(), public.financeiro_marcar_aviso(uuid, boolean, text),
  public.financeiro_salvar_lote(text, jsonb, boolean), public.financeiro_marcar_sumido(text, text),
  public.financeiro_apagar_push(text), public.financeiro_ler_segredo(text), public.financeiro_salvar_push(text, text, text),
  public.financeiro_vapid_publica()
from public, anon, authenticated;

grant execute on function
  public.financeiro_salvar_cliente(jsonb), public.financeiro_salvar_assinatura(jsonb),
  public.financeiro_salvar_cobranca(jsonb, boolean), public.financeiro_registrar_evento(text, text, text, jsonb),
  public.financeiro_evento_processado(text), public.financeiro_iniciar_sync(text),
  public.financeiro_concluir_sync(bigint, boolean, jsonb, text), public.financeiro_envios_de_hoje(),
  public.financeiro_registrar_mensagem(text, text, text, text, text, text), public.financeiro_gerar_avisos_atraso(),
  public.financeiro_gerar_aviso_mes(), public.financeiro_reservar_avisos(), public.financeiro_marcar_aviso(uuid, boolean, text),
  public.financeiro_salvar_lote(text, jsonb, boolean), public.financeiro_marcar_sumido(text, text),
  public.financeiro_apagar_push(text), public.financeiro_ler_segredo(text)
to service_role;

grant execute on function public.financeiro_envios_de_hoje(), public.financeiro_salvar_push(text, text, text),
  public.financeiro_vapid_publica() to authenticated;

-- =========================================================
-- Permissões das tabelas
-- =========================================================
alter table financeiro.usuarios enable row level security;
alter table financeiro.clientes enable row level security;
alter table financeiro.assinaturas enable row level security;
alter table financeiro.cobrancas enable row level security;
alter table financeiro.config enable row level security;
alter table financeiro.mensagens enable row level security;
alter table financeiro.avisos enable row level security;
alter table financeiro.push_inscricoes enable row level security;
alter table financeiro.eventos enable row level security;
alter table financeiro.sincronizacoes enable row level security;

create policy acesso on financeiro.usuarios for select to authenticated using (privado.financeiro_acesso());
create policy acesso on financeiro.clientes for all to authenticated using (privado.financeiro_acesso()) with check (privado.financeiro_acesso());
create policy acesso on financeiro.assinaturas for select to authenticated using (privado.financeiro_acesso());
create policy acesso on financeiro.cobrancas for select to authenticated using (privado.financeiro_acesso());
create policy acesso on financeiro.config for all to authenticated using (privado.financeiro_acesso()) with check (privado.financeiro_acesso());
create policy acesso on financeiro.mensagens for select to authenticated using (privado.financeiro_acesso());
create policy acesso on financeiro.avisos for select to authenticated using (privado.financeiro_acesso());
create policy acesso on financeiro.push_inscricoes for all to authenticated
  using (user_id = (select auth.uid()) and privado.financeiro_acesso())
  with check (user_id = (select auth.uid()) and privado.financeiro_acesso());
create policy acesso on financeiro.eventos for select to authenticated using (privado.financeiro_acesso());
create policy acesso on financeiro.sincronizacoes for select to authenticated using (privado.financeiro_acesso());

grant select on all tables in schema financeiro to authenticated;
grant update (contato, cobranca_pausada, observacao) on financeiro.clientes to authenticated;
grant update (cobranca_ativa, dias_antes, avisar_no_dia, cobrar_atraso_diario, avisar_atraso_dias, enviar_pix,
  texto_antes, texto_no_dia, texto_atraso) on financeiro.config to authenticated;
grant delete on financeiro.push_inscricoes to authenticated;
grant all on all tables in schema financeiro to service_role;

-- A API só expõe public: views com security_invoker, sujeitas ao RLS e aos grants acima.
-- O Supabase dá ALL por padrão em objeto novo de public; por isso o revoke de authenticated antes dos grants.
create view public.financeiro_usuarios with (security_invoker = true) as select * from financeiro.usuarios;
create view public.financeiro_clientes with (security_invoker = true) as select * from financeiro.clientes;
create view public.financeiro_assinaturas with (security_invoker = true) as select * from financeiro.assinaturas;
create view public.financeiro_cobrancas with (security_invoker = true) as select * from financeiro.cobrancas_visao;
create view public.financeiro_config with (security_invoker = true) as select * from financeiro.config;
create view public.financeiro_mensagens with (security_invoker = true) as select * from financeiro.mensagens;
create view public.financeiro_avisos with (security_invoker = true) as select * from financeiro.avisos;
create view public.financeiro_push_inscricoes with (security_invoker = true) as select * from financeiro.push_inscricoes;
create view public.financeiro_sincronizacoes with (security_invoker = true) as select * from financeiro.sincronizacoes;
create view public.financeiro_eventos with (security_invoker = true)
  as select id, evento, cobranca_id, recebido_em, processado_em from financeiro.eventos;

revoke all on public.financeiro_usuarios, public.financeiro_clientes, public.financeiro_assinaturas,
  public.financeiro_cobrancas, public.financeiro_config, public.financeiro_mensagens, public.financeiro_avisos,
  public.financeiro_push_inscricoes, public.financeiro_sincronizacoes, public.financeiro_eventos from anon, public, authenticated;
grant select on public.financeiro_usuarios, public.financeiro_clientes, public.financeiro_assinaturas,
  public.financeiro_cobrancas, public.financeiro_config, public.financeiro_mensagens, public.financeiro_avisos,
  public.financeiro_push_inscricoes, public.financeiro_sincronizacoes, public.financeiro_eventos to authenticated;
grant update (contato, cobranca_pausada, observacao) on public.financeiro_clientes to authenticated;
grant update (cobranca_ativa, dias_antes, avisar_no_dia, cobrar_atraso_diario, avisar_atraso_dias, enviar_pix,
  texto_antes, texto_no_dia, texto_atraso) on public.financeiro_config to authenticated;
grant delete on public.financeiro_push_inscricoes to authenticated;

-- Único usuário: o Douglas, pela conta que ele já usa no gestor de tarefas.
insert into financeiro.usuarios (user_id, nome)
select id, 'Douglas' from auth.users where lower(email) = 'odouglasestevam@gmail.com'
on conflict do nothing;

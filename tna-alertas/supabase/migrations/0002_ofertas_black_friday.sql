-- Monitor de ofertas da Black Friday 2026 (pedido do Douglas em 23/11/2026).
-- Produtos: controle DualSense, ar-condicionado 18.000 BTUs inverter e
-- depurador de cozinha de 430 m3/h. Fontes: busca do Pelando (pg_cron a cada
-- 5 min) e grupos/canais de oferta do WhatsApp pessoal (webhook da NeoGo,
-- instancia "Douglas"). Aviso: push no TNA Alertas com tipo "oferta".
--
-- So entra aqui mensagem que ja casou com um dos produtos. Conversa pessoal e
-- mensagem de grupo que nao fala dos produtos sao descartadas na funcao,
-- sem gravar.
--
-- Desliga sozinho: a funcao para de agir depois de 30/11 e o job
-- ofertas-bf-desligar tira o agendamento em 01/12.

create table if not exists public.ofertas_bf (
  id bigserial primary key,
  chave text not null unique,              -- pelando:<id> ou wa:<produto>:<preco>:<link>
  fonte text not null check (fonte in ('pelando', 'whatsapp')),
  produto text not null check (produto in ('dualsense', 'ar_18k', 'depurador')),
  titulo text,
  preco numeric(10, 2),
  especial boolean not null default false, -- bateu o preco-alvo
  cupom text,
  loja text,
  link text,
  origem text,                             -- slug do Pelando ou chat do grupo/canal
  texto text,                              -- mensagem do grupo (so a que casou), ate 1000 caracteres
  notificado boolean not null default false,
  motivo text,                             -- por que nao avisou (repetida, acima do teto...)
  criado_em timestamptz not null default now()
);

create index if not exists ofertas_bf_produto_preco on public.ofertas_bf (produto, preco, criado_em desc);

-- Saude das duas fontes: ultima mensagem da NeoGo e falhas seguidas do Pelando.
-- Se uma parar, a funcao abre alerta normal (ofertas:whatsapp / ofertas:pelando).
create table if not exists public.ofertas_bf_saude (
  fonte text primary key check (fonte in ('pelando', 'whatsapp')),
  ultimo_ok timestamptz,
  falhas_seguidas int not null default 0,
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);

-- So a funcao (service role) le e escreve.
alter table public.ofertas_bf enable row level security;
alter table public.ofertas_bf_saude enable row level security;

-- Agendamentos (criados pelo execute_sql, fora daqui porque levam a chave de
-- acesso no endereco; a funcao so guarda o hash dela):
--   ofertas-bf-saude     */10 * * * *  GET .../functions/v1/ofertas?tarefa=saude&k=<chave>
--   ofertas-bf-desligar  5 3 1 12 *    tira os dois agendamentos em 01/12
-- O Pelando nao e lido daqui: ele bloqueia servidor (verificacao do Cloudflare).
-- Quem le e o computador do Douglas, tarefa "TNA Ofertas Pelando" do Agendador
-- do Windows (tna-alertas/ofertas-pc/pelando.py), que manda pra funcao.

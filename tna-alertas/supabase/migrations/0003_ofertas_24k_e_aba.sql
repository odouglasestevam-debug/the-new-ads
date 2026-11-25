-- Monitor de ofertas da Black Friday, 23/11/2026 (pedido do Douglas):
-- 1. Ar-condicionado 24.000 BTUs inverter entra no monitor (produto ar_24k:
--    avisa ate R$ 3.000, preco-alvo abaixo de R$ 2.800).
-- 2. Aba "Ofertas" no TNA Alertas: depois de tocar na notificacao e sair da
--    loja, nao tinha onde rever a oferta. A pagina le pela funcao abaixo.

alter table public.ofertas_bf drop constraint if exists ofertas_bf_produto_check;
alter table public.ofertas_bf add constraint ofertas_bf_produto_check
  check (produto in ('dualsense', 'ar_18k', 'ar_24k', 'depurador'));

-- So o que virou aviso e so os campos da oferta. Fica de fora o texto da
-- mensagem e o chat de origem (qual grupo de WhatsApp mandou), porque a pagina
-- le com a chave anon, que e publica.
create or replace function public.ofertas_avisadas()
returns table (
  id bigint,
  produto text,
  titulo text,
  preco numeric,
  especial boolean,
  cupom text,
  loja text,
  link text,
  fonte text,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, produto, titulo, preco, especial, cupom, loja, link, fonte, criado_em
  from public.ofertas_bf
  where notificado and motivo is null
  order by criado_em desc
  limit 150;
$$;

revoke all on function public.ofertas_avisadas() from public;
grant execute on function public.ofertas_avisadas() to anon, authenticated;

-- Limpeza do que avisou antes da regra "sem preco nao avisa" (aplicada como
-- migration ofertas_avisadas_so_validas): continua notificado, mas com motivo,
-- e por isso sai da aba. E a loja do encurtador meli.promo vira Mercado Livre.
update public.ofertas_bf
   set motivo = 'sem preco na mensagem (avisou antes da regra de 23/11)'
 where notificado and preco is null and produto <> 'depurador' and motivo is null;

update public.ofertas_bf set loja = 'Mercado Livre' where loja = 'meli.promo';

-- Abas de etapa no topo de Conversas (pedido de 24/11/2026: tela no estilo do WhatsApp Web).
-- A busca de conversas passa a aceitar p_etapa e devolve por_etapa, a contagem de cada etapa
-- com todos os outros filtros aplicados (estado, responsável, número e busca).
-- Mesmo corpo de 0017 com o limite de busca de 0021; só entram a etapa e a contagem.
-- A numeração pula 0030 porque esse nome ficou com a proposta descartada de número por vendedora.

-- Trava: se o banco tiver uma versão diferente da que está no repositório, para aqui em vez de sobrescrever.
do $$
declare definicao text;
begin
  definicao := pg_get_functiondef('public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer)'::regprocedure);
  if position('exigir_limite_crm(''busca'')' in definicao) = 0
     or position('b.ultima_entrada_em>=b.ultima_mensagem_em-interval ''1 second''' in definicao) = 0 then
    raise exception 'corpo_inesperado: buscar_conversas_crm';
  end if;
end;
$$;

-- Assinatura nova no lugar da antiga: duas versões com padrões iguais deixariam a API sem saber qual chamar.
drop function public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer);

create function public.buscar_conversas_crm(p_empresa uuid, p_busca text default '', p_estado text default 'todas',
  p_responsavel text default '', p_canal text default '', p_offset integer default 0, p_limite integer default 50,
  p_etapa text default '')
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  if privado.crm_sessao_ok() then perform privado.exigir_limite_crm('busca'); end if;
  return (
    with base as materialized (
      select c.*, jsonb_build_object('id',l.id,'empresa_id',l.empresa_id,'nome',l.nome,'telefone',l.telefone,
        'email',l.email,'etapa',l.etapa,'responsavel_id',l.responsavel_id,'criado_em',l.criado_em) as lead,
        l.nome as nome_lead, l.telefone as telefone_lead, l.responsavel_id, l.etapa as etapa_lead
      from public.conversas c join public.leads l on l.id = c.lead_id and l.empresa_id = c.empresa_id
      where c.empresa_id = p_empresa
    ), sem_etapa as materialized (
      select b.* from base b where
        (p_canal = '' or b.canal = p_canal) and
        (p_responsavel = '' or (p_responsavel = 'sem' and b.responsavel_id is null) or b.responsavel_id::text = p_responsavel) and
        (p_estado = 'todas' or (p_estado = 'nao_lidas' and b.nao_lidas > 0) or (p_estado = 'minhas' and b.responsavel_id = auth.uid())
          or (p_estado = 'sem_resposta' and b.ultima_entrada_em >= b.ultima_mensagem_em - interval '1 second')) and
        (trim(p_busca) = '' or b.nome_lead ilike '%'||left(trim(p_busca),160)||'%' or b.telefone_lead ilike '%'||left(trim(p_busca),160)||'%'
         or b.wa_id ilike '%'||left(trim(p_busca),160)||'%' or exists(select 1 from public.mensagens m
           where m.conversa_id = b.id and m.empresa_id = p_empresa and m.texto ilike '%'||left(trim(p_busca),160)||'%'))
    ), filtradas as materialized (
      select * from sem_etapa where coalesce(p_etapa, '') = '' or etapa_lead = p_etapa
    ), pagina as (
      select * from filtradas order by ultima_mensagem_em desc, id desc
      limit least(greatest(p_limite,1),200) offset greatest(p_offset,0)
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(p)-'nome_lead'-'telefone_lead'-'responsavel_id'-'etapa_lead'
                 order by p.ultima_mensagem_em desc, p.id desc) from pagina p), '[]'::jsonb),
      'total', (select count(*) from filtradas),
      'nao_lidas', coalesce((select sum(nao_lidas) from base), 0),
      'total_etapas', (select count(*) from sem_etapa),
      'por_etapa', coalesce((select jsonb_object_agg(etapa_lead, n)
                   from (select etapa_lead, count(*) as n from sem_etapa group by etapa_lead) x), '{}'::jsonb))
  );
end;
$$;
revoke all on function public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer,text) from public, anon;
grant execute on function public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer,text) to authenticated;

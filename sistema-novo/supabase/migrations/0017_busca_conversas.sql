create function public.buscar_conversas_crm(p_empresa uuid,p_busca text default '',p_estado text default 'todas',
  p_responsavel text default '',p_canal text default '',p_offset integer default 0,p_limite integer default 50)
returns jsonb language sql stable security invoker set search_path='' as $$
  with base as materialized (
    select c.*,jsonb_build_object('id',l.id,'empresa_id',l.empresa_id,'nome',l.nome,'telefone',l.telefone,
      'email',l.email,'etapa',l.etapa,'responsavel_id',l.responsavel_id,'criado_em',l.criado_em) as lead,
      l.nome as nome_lead,l.telefone as telefone_lead,l.responsavel_id
    from public.conversas c join public.leads l on l.id=c.lead_id and l.empresa_id=c.empresa_id
    where c.empresa_id=p_empresa
  ), filtradas as materialized (
    select b.* from base b where
      (p_canal='' or b.canal=p_canal) and
      (p_responsavel='' or (p_responsavel='sem' and b.responsavel_id is null) or b.responsavel_id::text=p_responsavel) and
      (p_estado='todas' or (p_estado='nao_lidas' and b.nao_lidas>0) or (p_estado='minhas' and b.responsavel_id=auth.uid())
        or (p_estado='sem_resposta' and b.ultima_entrada_em>=b.ultima_mensagem_em-interval '1 second')) and
      (trim(p_busca)='' or b.nome_lead ilike '%'||left(trim(p_busca),160)||'%' or b.telefone_lead ilike '%'||left(trim(p_busca),160)||'%'
       or b.wa_id ilike '%'||left(trim(p_busca),160)||'%' or exists(select 1 from public.mensagens m
         where m.conversa_id=b.id and m.empresa_id=p_empresa and m.texto ilike '%'||left(trim(p_busca),160)||'%'))
  ), pagina as (
    select * from filtradas order by ultima_mensagem_em desc,id desc limit least(greatest(p_limite,1),200) offset greatest(p_offset,0)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'nome_lead'-'telefone_lead'-'responsavel_id' order by p.ultima_mensagem_em desc,p.id desc) from pagina p),'[]'::jsonb),
    'total',(select count(*) from filtradas),'nao_lidas',coalesce((select sum(nao_lidas) from base),0));
$$;
revoke all on function public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.buscar_conversas_crm(uuid,text,text,text,text,integer,integer) to authenticated;

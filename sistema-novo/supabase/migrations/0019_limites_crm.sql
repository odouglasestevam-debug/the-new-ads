-- Contadores atômicos por usuário e minuto, privados e exclusivos do CRM.
create table privado.crm_limites (
  ator uuid not null references auth.users(id) on delete cascade,
  acao text not null,
  minuto timestamptz not null,
  quantidade integer not null,
  primary key(ator,acao,minuto)
);
alter table privado.crm_limites enable row level security;
revoke all on privado.crm_limites from public,anon,authenticated;
create index crm_limites_retencao_idx on privado.crm_limites(minuto);

create function privado.consumir_limite_crm(p_ator uuid,p_acao text) returns boolean
language plpgsql security definer set search_path='' as $$
declare teto integer; aceito boolean;
begin
  teto:=case p_acao when 'envio' then 30 when 'conversa' then 20 when 'equipe' then 10 end;
  if p_ator is null or teto is null then raise exception 'limite_invalido';end if;
  insert into privado.crm_limites as atual values(p_ator,p_acao,date_trunc('minute',clock_timestamp()),1)
  on conflict(ator,acao,minuto) do update set quantidade=atual.quantidade+1 where atual.quantidade<teto;
  aceito:=found;
  delete from privado.crm_limites where minuto<now()-interval '1 day';
  return aceito;
end;
$$;
revoke all on function privado.consumir_limite_crm(uuid,text) from public,anon,authenticated;

create function public.crm_limitar_acao(p_ator uuid,p_acao text) returns boolean
language sql security definer set search_path='' as $$
  select privado.consumir_limite_crm(p_ator,p_acao);
$$;
revoke all on function public.crm_limitar_acao(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_limitar_acao(uuid,text) to service_role;

create function privado.limitar_nova_conversa_crm() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Webhooks autenticados pelo servidor não têm auth.uid e não sofrem descarte por este limite.
  if auth.uid() is not null and not privado.consumir_limite_crm(auth.uid(),'conversa') then
    raise exception 'limite_conversas';
  end if;
  return new;
end;
$$;
revoke all on function privado.limitar_nova_conversa_crm() from public,anon,authenticated;
create trigger conversas_limite_crm before insert on public.conversas
for each row execute function privado.limitar_nova_conversa_crm();

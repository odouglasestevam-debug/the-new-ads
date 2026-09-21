alter table public.mensagens add column provider_status_at timestamptz;
alter table public.mensagens add column provider_error jsonb;
create table privado.whatsapp_recibos_pendentes(
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  canal text not null,
  wa_message_id text not null,
  status text not null check(status in ('enviada','entregue','lida','falhou')),
  evento_em timestamptz not null,
  erro jsonb,
  primary key(empresa_id,canal,wa_message_id)
);
alter table privado.whatsapp_recibos_pendentes enable row level security;
create index whatsapp_recibos_retencao_idx on privado.whatsapp_recibos_pendentes(evento_em);
revoke all on privado.whatsapp_recibos_pendentes from public,anon,authenticated;

create function privado.status_whatsapp_avanca(p_atual text,p_novo text,p_quando timestamptz,p_anterior timestamptz) returns boolean
language sql immutable set search_path='' as $$
 select case when p_atual='lida' then false
   when p_novo='lida' then true
   when p_novo='falhou' then p_atual not in ('entregue','lida') and (p_anterior is null or p_quando>=p_anterior)
   when p_atual='falhou' then p_novo in ('entregue','lida')
   else array_position(array['enviando','enviada','entregue','lida'],p_novo)>coalesce(array_position(array['enviando','enviada','entregue','lida'],p_atual),0)
     and (p_anterior is null or p_quando>=p_anterior) end;
$$;
revoke all on function privado.status_whatsapp_avanca(text,text,timestamptz,timestamptz) from public,anon,authenticated;

create function public.registrar_recibo_whatsapp(p_empresa uuid,p_canal text,p_wa_id text,p_status text,p_evento timestamptz,p_erro jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare m public.mensagens;v_quando timestamptz:=coalesce(p_evento,now());
begin
 if p_status not in ('enviada','entregue','lida','falhou') or p_canal not in ('whatsapp_oficial','whatsapp_nao_oficial') or coalesce(p_wa_id,'')='' then raise exception 'recibo_invalido';end if;
 perform pg_advisory_xact_lock(hashtextextended('recibo:'||p_empresa::text||p_canal||p_wa_id,0));
 select msg.* into m from public.mensagens msg join public.conversas c on c.id=msg.conversa_id
 where msg.empresa_id=p_empresa and msg.wa_message_id=p_wa_id and c.canal=p_canal and msg.direcao='saida' for update of msg;
 if found then
   if privado.status_whatsapp_avanca(m.status,p_status,v_quando,m.provider_status_at) then
     update public.mensagens set status=p_status,provider_status_at=v_quando,provider_error=p_erro,
       erro=case when p_status='falhou' then coalesce(p_erro->>'detalhe','O provedor recusou a mensagem.') else null end where id=m.id;
   end if;
 else
   insert into privado.whatsapp_recibos_pendentes as r values(p_empresa,p_canal,p_wa_id,p_status,v_quando,p_erro)
   on conflict(empresa_id,canal,wa_message_id) do update set status=excluded.status,evento_em=excluded.evento_em,erro=excluded.erro
   where privado.status_whatsapp_avanca(r.status,excluded.status,excluded.evento_em,r.evento_em);
 end if;
 delete from privado.whatsapp_recibos_pendentes where evento_em<now()-interval '30 days';
end;
$$;
revoke all on function public.registrar_recibo_whatsapp(uuid,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.registrar_recibo_whatsapp(uuid,text,text,text,timestamptz,jsonb) to service_role;

create function privado.aplicar_recibo_pendente() returns trigger language plpgsql security definer set search_path='' as $$
declare r privado.whatsapp_recibos_pendentes;v_canal text;
begin
 if new.wa_message_id is null or new.direcao<>'saida' then return new;end if;
 if tg_op='UPDATE' and old.wa_message_id is not distinct from new.wa_message_id then return new;end if;
 select canal into v_canal from public.conversas where id=new.conversa_id;
 perform pg_advisory_xact_lock(hashtextextended('recibo:'||new.empresa_id::text||v_canal||new.wa_message_id,0));
 delete from privado.whatsapp_recibos_pendentes where empresa_id=new.empresa_id and canal=v_canal and wa_message_id=new.wa_message_id returning * into r;
 if found and privado.status_whatsapp_avanca(new.status,r.status,r.evento_em,new.provider_status_at) then
   update public.mensagens set status=r.status,provider_status_at=r.evento_em,provider_error=r.erro,
     erro=case when r.status='falhou' then coalesce(r.erro->>'detalhe','O provedor recusou a mensagem.') else null end where id=new.id;
 end if;
 return new;
end;
$$;
revoke all on function privado.aplicar_recibo_pendente() from public,anon,authenticated;
create trigger mensagens_recibo_pendente after insert or update of wa_message_id on public.mensagens
for each row execute function privado.aplicar_recibo_pendente();

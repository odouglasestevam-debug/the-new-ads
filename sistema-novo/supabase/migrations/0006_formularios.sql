-- Formulários do site gerados pelo CRM (Fase 2, modo 1).
create table public.formularios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  -- chave pública que vai no código colado no site; só identifica o formulário
  chave text not null unique default replace(gen_random_uuid()::text, '-', ''),
  ativo boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index formularios_empresa_idx on public.formularios (empresa_id);

alter table public.lead_origens
  add column formulario_id uuid references public.formularios (id) on delete set null;
create index lead_origens_formulario_idx on public.lead_origens (formulario_id);

-- Limite de envios por IP (guardado com hash, nunca o IP puro). Só o servidor lê e grava.
create table public.formulario_envios (
  id bigint generated always as identity primary key,
  formulario_id uuid not null references public.formularios (id) on delete cascade,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);
create index formulario_envios_ip_idx on public.formulario_envios (ip_hash, criado_em);
create index formulario_envios_form_idx on public.formulario_envios (formulario_id);

create trigger trg_formularios_atualizado before update on public.formularios
  for each row execute function privado.integracoes_antes_gravar();

alter table public.formularios enable row level security;
alter table public.formulario_envios enable row level security;

create policy formularios_ver on public.formularios for select to authenticated
  using (privado.pode_ver_empresa(empresa_id));
create policy formularios_criar on public.formularios for insert to authenticated
  with check (privado.pode_administrar_empresa(empresa_id));
create policy formularios_editar on public.formularios for update to authenticated
  using (privado.pode_administrar_empresa(empresa_id)) with check (privado.pode_administrar_empresa(empresa_id));
create policy formularios_apagar on public.formularios for delete to authenticated
  using (privado.pode_administrar_empresa(empresa_id));

revoke all on public.formularios from anon;
revoke all on public.formulario_envios from anon, authenticated;
revoke insert, update on public.formularios from authenticated;
grant insert (empresa_id, nome, ativo, config) on public.formularios to authenticated;
grant update (nome, ativo, config) on public.formularios to authenticated;

-- Recebe um lead do formulário: acha a pessoa pelo telefone (ou e-mail), cria se não existir,
-- completa o que faltava e anexa a origem. Só o servidor chama.
create function public.receber_lead_site(
  p_chave text, p_nome text, p_telefone text, p_email text, p_origem jsonb, p_respostas jsonb
) returns table (lead_id uuid, novo boolean)
language plpgsql security definer set search_path = '' as $$
declare
  f public.formularios;
  v_lead uuid;
  v_novo boolean := false;
  v_email text := nullif(lower(trim(p_email)), '');
  v_nome text := nullif(trim(p_nome), '');
begin
  select * into f from public.formularios where chave = p_chave and ativo;
  if not found then raise exception 'formulario_invalido'; end if;

  for tentativa in 1..2 loop
    v_lead := null;
    if p_telefone is not null then
      select id into v_lead from public.leads where empresa_id = f.empresa_id and telefone = p_telefone;
    end if;
    if v_lead is null and v_email is not null then
      select id into v_lead from public.leads where empresa_id = f.empresa_id and email = v_email
      order by criado_em limit 1;
    end if;

    begin
      if v_lead is null then
        insert into public.leads (empresa_id, nome, telefone, email)
        values (f.empresa_id, v_nome, p_telefone, v_email) returning id into v_lead;
        v_novo := true;
      else
        update public.leads set
          nome = coalesce(nome, v_nome),
          email = coalesce(email, v_email),
          telefone = coalesce(telefone, p_telefone)
        where id = v_lead;
      end if;
      exit;
    exception when unique_violation then
      -- outro envio criou a mesma pessoa ao mesmo tempo: procura de novo
      if tentativa = 2 then raise; end if;
    end;
  end loop;

  insert into public.lead_origens (
    empresa_id, lead_id, canal, formulario_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_placement,
    ad_id, fbclid, gclid, pagina_url, dados
  ) values (
    f.empresa_id, v_lead, 'site', f.id,
    left(p_origem->>'utm_source', 300), left(p_origem->>'utm_medium', 300), left(p_origem->>'utm_campaign', 300),
    left(p_origem->>'utm_content', 300), left(p_origem->>'utm_term', 300), left(p_origem->>'utm_placement', 300),
    left(p_origem->>'ad_id', 64), left(p_origem->>'fbclid', 500), left(p_origem->>'gclid', 500),
    left(p_origem->>'pagina_url', 1000),
    jsonb_build_object('formulario', f.nome, 'respostas', coalesce(p_respostas, '{}'::jsonb),
                       'referrer', left(p_origem->>'referrer', 1000))
  );

  return query select v_lead, v_novo;
end;
$$;
revoke execute on function public.receber_lead_site(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.receber_lead_site(text, text, text, text, jsonb, jsonb) to service_role;

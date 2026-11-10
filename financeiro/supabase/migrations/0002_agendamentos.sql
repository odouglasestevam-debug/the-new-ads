-- Agendamentos do financeiro (separado da 0001 porque pg_cron e pg_net só existem no Supabase).
-- Todos chamam a Edge Function financeiro-rotina com o segredo financeiro_cron do Vault.
-- Horários em UTC (São Paulo = UTC-3).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create function privado.financeiro_chamar_rotina(p_tarefa text) returns void
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/financeiro-rotina',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'financeiro_cron')),
    body := jsonb_build_object('tarefa', p_tarefa),
    timeout_milliseconds := 120000
  );
$$;
revoke all on function privado.financeiro_chamar_rotina(text) from public, anon, authenticated;

-- Conferência completa com o Asaas às 6h, 12h e 18h. É a rede de segurança do webhook.
select cron.schedule('financeiro-sincronizar', '0 9,15,21 * * *', $cron$ select privado.financeiro_chamar_rotina('sincronizar'); $cron$);

-- Cobrança pelo WhatsApp: de hora em hora das 9h às 18h. A primeira rodada do dia envia;
-- as seguintes só repetem o que falhou (até 3 tentativas). Rodar a mais não duplica.
select cron.schedule('financeiro-cobrancas', '0 12-21 * * *', $cron$ select privado.financeiro_chamar_rotina('cobrancas'); $cron$);

-- Previsto do mês: dia 1 às 8h.
select cron.schedule('financeiro-mes', '0 11 1 * *', $cron$ select privado.financeiro_chamar_rotina('mes'); $cron$);

-- Avisos que ficaram na fila (o webhook já tenta na hora; isto é a repescagem).
select cron.schedule('financeiro-avisos', '*/5 * * * *', $cron$
  select privado.financeiro_chamar_rotina('avisos')
  where exists (select 1 from financeiro.avisos
    where enviado_em is null and tentativas < 5 and criado_em > now() - interval '1 day'
      and criado_em < now() - interval '1 minute')
    and exists (select 1 from financeiro.push_inscricoes);
$cron$);

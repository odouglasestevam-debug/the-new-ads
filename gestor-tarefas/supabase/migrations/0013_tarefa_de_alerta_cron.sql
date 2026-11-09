-- Agendamento separado da 0012 porque pg_cron e pg_net só existem no Supabase.
-- A cada 10 minutos, o mesmo ritmo em que o monitor do TNA Alertas decide os alertas de tracking.
select cron.schedule('alertas-para-tarefas', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/alertas-para-tarefas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tarefas_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

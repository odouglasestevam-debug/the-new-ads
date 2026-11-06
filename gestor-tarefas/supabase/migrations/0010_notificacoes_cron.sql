-- Agendamentos das notificações (separado da 0009 porque pg_cron e pg_net só existem no Supabase).

-- Urgentes: de hora em hora, das 8h às 20h de São Paulo (11h a 23h UTC). A regra de quantos avisos
-- cada tarefa ainda deve fica em tarefas_urgentes_pendentes, então rodar a mais não duplica.
select cron.schedule('tarefas-urgentes', '0 11-23 * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/tarefas-lembrete',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tarefas_cron')),
    body := '{"tarefa":"urgentes"}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

-- Atribuições: a cada minuto, mas a função só é chamada se tiver algo na fila.
select cron.schedule('tarefas-atribuicoes', '* * * * *', $cron$
  select net.http_post(
    url := 'https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/tarefas-lembrete',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tarefas_cron')),
    body := '{"tarefa":"atribuicoes"}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from tarefas.atribuicoes_fila f
    where f.enviado_em is null and (f.reservado_em is null or f.reservado_em < now() - interval '5 minutes'));
$cron$);

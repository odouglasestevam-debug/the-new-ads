# Revisão do gestor de tarefas

## Interface e funcionamento

- Visual claro e compacto inspirado no ClickUp; navegação existente de espaços, pastas e listas preservada.
- Visualizações Lista e Quadro, ordenação por entrega, prioridade, nome e criação.
- Concluídas acessíveis na barra; busca com nome acessível e atalho `/` fora dos campos.
- Proteção contra envios duplicados de tarefas e comentários; gravações da mesma tarefa serializadas.
- Falha ao atribuir responsáveis abre a tarefa criada e informa como corrigir, sem ocultar o erro.
- Paginação com desempate estável; resumo de prazos respeita intervalo de datas.
- Sessão encerrada limpa os dados da interface. Consulta de MFA com erro bloqueia a entrada.
- SDK Supabase hospedado junto do app, versão identificada em `site/public/vendor/README.txt`.
- Cabeçalhos CSP, bloqueio de iframe, nosniff, referrer e restrição de câmera/microfone/geolocalização.

## Correções de servidor preparadas

`supabase/migrations/0004_integridade_e_seguranca.sql`:

- MFA obrigatório no banco para contas que já têm segundo fator verificado.
- Conta inativa não lê inscrições push nem recebe teste de notificação.
- Inscrições push limitadas a provedores conhecidos, impedindo URLs arbitrárias.
- Hierarquia de subtarefas validada na API; mudança de lista propagada na mesma transação.
- Bloqueio de troca entre status aberto/concluído quando o status está em uso, evitando situação incoerente.

As duas Edge Functions também verificam MFA. A função de lembrete valida o destino imediatamente antes do envio, inclusive para inscrições antigas, e limita o tempo de cada requisição.

**Essas correções de servidor precisam ser aplicadas no Supabase e não são publicadas pelo Cloudflare.** Aplicar a migração 0004 no projeto `xrvjlhseyqfgyvwwlwwb`, depois publicar `tarefas-usuarios` e `tarefas-lembrete` incluindo `push-seguro.ts`. Conferir inscrições existentes antes do rollout caso a equipe use um provedor fora da lista permitida.

## Validação

`npm ci` e `npm test`: PostgreSQL local via PGlite, 28 verificações originais de permissão/recorrência, além de MFA, hierarquia, movimentação, status e endpoints. Schema Auth e Vault mínimos são simulados; cron e infraestrutura Supabase não são simulados.

`npx playwright install chromium` e `npm run test:ui`: navegação e interação no Chromium com backend simulado, sem credenciais reais. Opcionalmente `CHROME_PATH` indica um Chromium já instalado. Capturas em `tests/artifacts/`, fora da pasta publicada. Testes usam os cabeçalhos de segurança do site.

Os testes locais não substituem teste integrado com sessão real após aplicar a migração. A CSP ainda permite atributos de eventos inline porque a interface existente depende deles. O SDK passou a ser local. O beacon de analytics injetado pelo Cloudflare fica bloqueado pela CSP, sem impedir os fluxos do gestor. A tentativa de permitir esse destino foi rejeitada pela revisão automática; a política restritiva publicada foi mantida. Não houve migração de dados do ClickUp nem alteração no CRM.

## Publicação

Frontend publicado em 17/09/2026: versão Cloudflare `eadcaec0-3b45-4dca-a8b3-26f9290a4604`. Cabeçalhos confirmados no domínio real; consultas anônimas a tarefas e usuários retornam HTTP 401. Migração 0004 e Edge Functions ainda **não aplicadas**, aguardando acesso ao Supabase nesta sessão.

Referências: [MFA no Supabase](https://supabase.com/docs/guides/auth/auth-mfa), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Web Push Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

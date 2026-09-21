# Segurança do CRM — 21/09/2026

Escopo: crm.thenewads.com.br, Worker tna-crm, projeto xrvjlhseyqfgyvwwlwwb. Não altera o gestor de tarefas, /funil, outro projeto Supabase ou funcionalidades Meta Ads.

## Situação da entrega

Correções implementadas e verificadas localmente. Migration 0021, funções e frontend ainda NÃO publicados nesta revisão. A autorização OAuth adicional foi concluída, mas a sessão MCP ativa continua retornando `Insufficient scope` para Edge Functions. Recarregar a janela do VS Code e revalidar o conector antes de publicar.

## Verificações e correções

- As 13 tabelas públicas do CRM inspecionadas têm RLS; os RPCs privilegiados revisados usam search_path restrito e negam execução anônima. Tabelas privadas sem policies permanecem sem acesso direto, intencionalmente.
- Bucket crm-midias privado, limite de 20 MB, tipos permitidos e URLs assinadas curtas. Isso não constitui antivírus ou inspeção do conteúdo binário.
- Preservadas validações de usuário/MFA, permissões por empresa, assinatura dos webhooks, proteção de URLs dos provedores e idempotência dos envios.
- Migration 0021 adiciona cotas atômicas para integrações, recursos WhatsApp, gravações, busca e distribuição. Falha ao consultar a cota nas funções retorna 503; excesso retorna 429.
- Formulário público reserva a tentativa antes da captura, com trava no formulário para impedir corrida entre contagem e gravação. Há limite por formulário independente do IP encaminhado. O identificador de IP armazenado passa a ser HMAC.
- Receptor de leads e operações de equipe/integrações rejeitam empresas inativas. Perfil leitura não pode enviar recibo real de leitura.
- JSON limitado a 64 KiB e webhooks a 2 MiB, com contagem dos bytes recebidos e prazo de leitura de 10 segundos. JSON não objeto é rejeitado. Upload multipart mantém seu limite separado; o novo prazo de JSON não se aplica a ele.
- Respostas sensíveis recebem no-store/nosniff e limites HTTP recebem Retry-After. Frontend recebe HSTS no host do CRM.
- Configuração visual do widget restringe cores/raios e neutraliza fechamento do bloco CSS; redirecionamentos só aceitam HTTPS sem credenciais, no servidor e no navegador.

## Cotas

Por usuário, em janelas fixas de um minuto:

| Operação | Limite |
| --- | ---: |
| Envio WhatsApp | 30 |
| Abertura de conversa | 20 |
| Equipe | 10 |
| Integrações | 20 |
| Recursos WhatsApp (cota compartilhada) | 120 |
| Gravações em leads, notas, origens e formulários | 120 |
| Busca de conversas | 120 |
| Consulta da distribuição | 60 |
| Configuração da distribuição | 20 |
| Presença | 60 |
| Processamento de lote da distribuição | 20 |

Formulários: 6 tentativas por IP/formulário e 120 por formulário nos últimos 10 minutos. IP encaminhado não é tratado como identidade autenticada; a cota total limita sua evasão. Tentativas reservadas contam mesmo se a validação posterior rejeitar os campos.

As cotas SQL são transacionais: operações revertidas também revertem seu contador. Janelas fixas permitem concentração de requisições na virada do minuto. Essas medidas não limitam todo tráfego REST, login ou tráfego antes de autenticação e não são uma defesa completa contra DDoS. Webhooks válidos não receberam uma nova cota de frequência que pudesse descartar eventos do provedor.

## Evidências locais

- `npm.cmd test`: 33 testes aprovados, incluindo RLS/MFA, cotas, permissões, JSON inválido, tamanho/prazo de corpo e reserva do formulário.
- `npm.cmd run test:browser`: aprovado; inclui configuração maliciosa do widget sem injeção de elementos e preservação de aparência válida, além das regressões de uso do CRM.
- Testes de banco usam PostgreSQL descartável PGlite. Requisições simultâneas nessa suíte não representam um teste de carga concorrente de produção.
- `npm audit --omit=dev`: nenhum achado nas dependências de produção declaradas. Não cobre automaticamente SDK vendorizado ou imports Deno.
- Não foram enviados WhatsApps/e-mails reais nem executado teste de carga contra produção.

## Pendências externas e limites da revisão

- Supabase Advisor apontou proteção contra senhas vazadas desativada. Verificar disponibilidade no plano e ativar no painel Auth; essa configuração é compartilhada com outros aplicativos do projeto. Referência: https://supabase.com/docs/guides/auth/password-security.
- Advisor apontou pg_net no schema public. Não mover a extensão compartilhada sem avaliar dependências dos outros aplicativos.
- Configuração real de limites do Supabase Auth e de WAF/rate limiting no gateway não foi alterada ou certificada nesta revisão. Referência: https://supabase.com/docs/guides/auth/rate-limits.
- Revisão não equivale a pentest independente, teste de recuperação de backup ou certificação de ausência de vulnerabilidades.

## Retomada da publicação

1. Revalidar list_edge_functions após recarregar o conector; conferir projeto, flags JWT e versões existentes.
2. Conferir os corpos dos RPCs de produção e que 0021 ainda não foi aplicada. Aplicar 0021 uma única vez antes das funções que dependem da nova reserva/cotas.
3. Publicar form, equipe, integracoes, whatsapp-enviar, whatsapp-lida, whatsapp-modelos, whatsapp-midia, whatsapp-webhook e neogo-webhook, incluindo dependências _shared. Preservar autenticação de cada endpoint.
4. Publicar site/public no Worker tna-crm; executar smoke remoto de assets, headers, login e bloqueio anônimo, sem mensagens reais. Registrar versões e resultados aqui.
5. Em regressão, reverter os artefatos de frontend/funções para versões previamente capturadas; não remover RLS ou abrir grants para contornar falhas. A migration exige reversão SQL específica e revisada, não reaplicação automática.

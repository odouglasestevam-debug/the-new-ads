# Monitor de atendimento por WhatsApp

Mede como a loja atende no WhatsApp sem mudar a rotina dela: a NeoGo fica conectada como mais um aparelho, o sistema só escuta e grava. **Não existe nenhuma função de envio de mensagem.** Primeiro cliente: Sapataria do Futuro Nações Shopping (pedido do Douglas em 10/11/2026, a partir da análise manual de 01/10 a 10/11).

- Tela: https://atendimento.thenewads.com.br (só o Douglas, login do gestor de tarefas)
- Banco: Supabase do CRM e do gestor (`xrvjlhseyqfgyvwwlwwb`, conector `supabase-app`), schema próprio `atendimento`. Não mexe em nada do CRM nem do gestor.
- Front: Cloudflare Worker `tna-atendimento` (`site/`). Deploy: `npx wrangler@4 deploy` dentro de `site/` com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` do `.env` da raiz.
- Testes do banco (PGlite, sem dado real): `node --test atendimento-whatsapp/tests/banco.test.mjs` na raiz do repositório.

## Como funciona

```
NeoGo (Message + Receipt) ─> Edge Function atendimento-webhook ─> atendimento.mensagens
pg_cron a cada 5 min      ─> atendimento-transcrever: baixa o áudio do WhatsApp, decifra (mediaKey) e transcreve (OpenAI gpt-transcribe)
pg_cron 04:00 (Brasília)  ─> atendimento-ia enviar: lote da OpenAI (Batch API, GPT-6.1 Terra) com os atendimentos que mudaram
pg_cron a cada 30 min     ─> atendimento-ia coletar: grava em atendimento.classificacoes quando o lote termina
pg_cron terça 08:00       ─> atendimento.fechar_semanas(): congela a semana anterior em atendimento.semanas
```

- Webhook por conta: `/functions/v1/atendimento-webhook?c=<slug>&t=<url_token>`. O token autentica. A primeira instância que manda evento fica presa à conta (`instance_id`).
- O navegador não lê tabela nenhuma: só funções `public.atendimento_*` que conferem `privado.atendimento_pode()` (estar em `atendimento.usuarios` e, com 2FA cadastrado, sessão aal2).
- As Edge Functions de rotina conferem o header `x-cron-secret` com `public.atendimento_cron_ok()`, que nunca devolve o segredo (Vault `atendimento_cron`).
- Chave da OpenAI: segredo `OPENAI_API_KEY` das Edge Functions. Sem ela, áudio fica pendente e a IA não roda; a tela mostra o aviso.
- Modelos trocáveis por segredo: `ATENDIMENTO_MODELO_IA` (padrão `gpt-6.1-terra`) e `ATENDIMENTO_MODELO_TRANSCRICAO` (padrão `gpt-transcribe`).
- `mensagens.bruto` guarda o payload sem miniaturas por 30 dias, pra conferir mapeamento.

## Regras de cálculo (0003_calculo.sql)

- **Atendimento:** conversa com um contato; um novo começa depois de 8 dias sem mensagem (cobre orçamento, retornos até D+7 e visita).
- **1ª resposta:** primeira mensagem do cliente até a primeira da loja, em minutos com a loja aberta (`minutos_uteis`). Reação com emoji não conta como resposta.
- **Durante a conversa:** demais esperas do cliente, sem contar "ok", "obrigada", emoji e figurinha.
- **Orçamento:** mensagem da loja com valor em reais, em texto ou áudio transcrito. **Retorno:** nova mensagem da loja 12h ou mais depois, sem o cliente ter respondido; D+1 até 36h, D+3 até 84h, D+7 até 180h. Fila do dia: D+1, D+3 e D+7 contados do último preço.
- **Chamou pra loja / dia combinado / recrutamento:** só a IA, sim ou não com o trecho. Não dá nota de atendimento (pedido do Douglas).
- **Recrutamento:** contato com vaga, currículo, emprego ou salário (palavra ou IA) sai de todas as contas de venda.
- **Viu e não respondeu:** recibo `read-self` (o celular da loja abriu) e mais de 30 min de loja sem resposta.
- **Contato sem número (LID):** guardado como `lid:<id>` e juntado ao telefone quando o WhatsApp revela os dois.

Metas iniciais (ajustáveis na tela): 1ª resposta até 15 min, 95% respondidas em 24h, 80% de retorno de orçamento, 80% de quem recebe preço chamado pra loja, 50% com dia combinado, no máximo 30% das mensagens da loja em áudio. Horário inicial de shopping (seg a sáb 10h às 22h, dom 14h às 20h), a confirmar com a loja.

## Histórico pelo WhatsApp Web (antes da NeoGo)

A extensão do Claude no Chrome lê o WhatsApp Web da loja (sem abrir não lida, sem tocar áudio) e devolve lotes JSON Lines. Os lotes ficam em `clientes/sapataria-do-futuro-nacoes/whatsapp-web/lote-NN.jsonl` (fora do Git).

- Importar: `node atendimento-whatsapp/ferramentas/importar-whatsapp-web.mjs clientes/sapataria-do-futuro-nacoes/whatsapp-web sapataria-nacoes > saida.sql` e rodar o SQL (só INSERT, passa pelo `execute_sql`). Sempre reimporta todos os lotes: o `wa_id` é fixo por mensagem, então nada duplica.
- Vale a coleta completa mais recente de cada contato; linha "parcial" (prévia da lista de conversa não lida) só entra se não houver coleta completa ou se for mais nova; `hora_incerta` é descartada.
- Marcadas com `bruto.origem = 'whatsapp_web'`. Não têm recibo de leitura nem conteúdo de áudio (duração só quando o áudio estava baixado).
- Quando a NeoGo for conectada, importar só até o dia anterior à conexão.

## Mensagem automática (0005)

A saudação do anúncio da Meta ("Oi! Como podemos ajudar?") sai no mesmo minuto em que o cliente escreve. Ela fica guardada (`mensagens.automatica`, marcada por gatilho a partir de `contas.textos_automaticos`, editável na tela), mas não conta como resposta nem entra nas contas de mensagem e formato. Sem isso, todo lead de anúncio aparecia respondido em 0 min.

## Estado em 11/11/2026

- Tudo aplicado: `0001` pelo `apply_migration`; `0002` a `0004` pelo Douglas no SQL Editor (`supabase/aplicar-partes-2-a-4.sql`), porque o `apply_migration`/`execute_sql` com UPDATE ou DELETE é recusado automaticamente nesse ambiente. Mudança de banco que apaga ou altera dado: preparar o SQL e pedir pro Douglas rodar no SQL Editor.
- Testado em produção com eventos no formato da NeoGo pelo webhook publicado (sem `instanceId`, pra não prender a conta): mensagem de entrada e saída, read-self, LID ligado ao telefone, LID sozinho, mensagem temporária, áudio PTT, grupo ignorado, miniatura removida, 1ª resposta 8 min. Transcrição sem chave avisa; IA recusa sem segredo; texto do lote conferido.
- Corrigido no teste (webhook v2): campo nulo ia como `null` JSON e o banco contava como "tem anúncio". A Edge Function agora não manda campo vazio.
- Tarefas do Douglas na pasta SDF - Nações: criar a chave da OpenAI e conectar a instância da NeoGo.
- Depois de conectar: conferir com uma mensagem real se a NeoGo manda `Receipt` com `read-self` e se `audioMessage` traz `mediaKey`/`directPath` (o mapeamento foi feito pelo protobuf do whatsmeow, sem amostra real de áudio).
- Reconectar o número religa o fluxo n8n "Trackeamento de Mensagem Nações Shopping", que ainda grava planilha e Supabase em paralelo.

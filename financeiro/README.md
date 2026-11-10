# Financeiro | The New Ads

Central de recebimentos em `financeiro.thenewads.com.br`. Só o Douglas acessa (mesma conta do gestor de tarefas).
O dinheiro continua entrando pelo Asaas; o app lê de lá, avisa no celular quem pagou e, depois da virada,
manda a cobrança pelo WhatsApp de um número próprio (NeoGo), no lugar do WhatsApp pago do Asaas.

Tubarão Ads fica de fora: os clientes de lá não cobram por esta conta do Asaas.

## Peças

| Peça | Onde |
|---|---|
| Tela (PWA) | `site/public`, Worker `tna-financeiro` na Cloudflare, domínio próprio |
| Banco | Supabase `xrvjlhseyqfgyvwwlwwb` (mesmo do gestor e do CRM), schema `financeiro`, views `public.financeiro_*` |
| Servidor | Edge Function `financeiro` (`supabase/functions/financeiro`), sem verify_jwt: cada porta se autentica |
| Agendamentos | pg_cron (`supabase/migrations/0002_agendamentos.sql`) |
| Envio do WhatsApp | fluxo do n8n `n8n/financeiro-envia-whatsapp.json` (o NeoGo só tem API pelo node do n8n) |
| Scripts | `scripts/webhook-asaas.py`, `scripts/notificacoes-asaas.py`, `scripts/gerar-icones.mjs`, `scripts/preparar-funcao.mjs` |

### Como o dado anda

1. **Webhook do Asaas** (`/functions/v1/financeiro/asaas`, header `asaas-access-token`): cada evento de cobrança ou assinatura é gravado e deduplicado. Pagamento novo vira aviso no celular na hora.
2. **Conferência** às 6h, 12h e 18h: lê clientes, assinaturas e cobranças (13 meses pra trás, 70 dias pra frente). É a rede de segurança do webhook. O que sumiu da lista do Asaas é marcado como excluído.
3. **Cobrança** de hora em hora das 9h às 18h: o banco (`financeiro_envios_de_hoje`) decide quem recebe o quê; antes de cada envio a função confere a cobrança no Asaas (quem acabou de pagar não é cobrado). Teto de 12 envios por rodada, pausa de 2 a 4 s entre clientes. Falha tenta de novo até 3 vezes no dia e depois vira aviso.
4. **Dia 1, 8h:** aviso com o previsto do mês.

### Regras de cobrança (editáveis na tela Cobrança)

- 10 dias antes: fatura com link (e Pix copia e cola numa mensagem separada, menos no cartão).
- No vencimento: lembrete.
- Em atraso: uma mensagem por dia até pagar.
- Aviso no celular do Douglas quando o atraso chega a 10 dias.
- Cliente pausado no app não recebe nada. Linha de texto com variável vazia some da mensagem.
- **Modo teste** (padrão): nada sai pelo WhatsApp, o app registra como "simulada" o que mandaria.
- Na virada, quem já estava dentro da janela dos 10 dias não recebe a primeira mensagem de novo (o Asaas já mandou).

### Segredos (Vault, nome `financeiro_<x>`; nunca em arquivo)

`asaas_token` (chave de API do Asaas), `webhook_token` (o mesmo cadastrado no webhook do Asaas), `cron`,
`vapid_publica`, `vapid_privada` (par próprio do Financeiro, não reaproveitar o do gestor),
`whatsapp_url` e `whatsapp_token` (webhook do fluxo do n8n e o valor do header `x-financeiro-token`).

## Testes

```
cd financeiro
npm install
npm test            # banco (PGlite) e montagem da mensagem
npm run test:ui     # telas com Supabase simulado e dados inventados, capturas em tests/artifacts
npx deno@2.9.5 check --no-config --node-modules-dir=none supabase/functions/financeiro/index.ts
```

## Publicação (pede o ok do Douglas a cada passo)

1. `apply_migration` da `0001_estrutura.sql`.
2. Gerar o par VAPID, o `cron` e o `webhook_token` e gravar no Vault (`vault.create_secret`).
3. `node scripts/preparar-funcao.mjs` e publicar a Edge Function `financeiro` com `verify_jwt: false`.
4. Tela: `npx wrangler deploy` dentro de `site/`, com o `.env` da raiz carregado. Ao mudar um arquivo, subir o `?v=` no `index.html`.
5. Com a chave do Asaas: gravar `asaas_token`, rodar `webhook-asaas.py --criar`, disparar a primeira conferência com `{"tarefa":"sincronizar","inicial":true}` (não gera aviso de pagamento antigo) e aplicar a `0002_agendamentos.sql`.

## Virada (depois que o último cliente do ciclo pagar)

1. Número de cobrança conectado no NeoGo, credencial criada no n8n, fluxo importado e testado com o próprio celular. Gravar `whatsapp_url` e `whatsapp_token`.
2. Avisar os clientes, pelo número que eles já conhecem, que a cobrança passa a vir do número novo (cobrança com Pix vinda de número desconhecido parece golpe).
3. `python -I financeiro/scripts/notificacoes-asaas.py` (prévia) e depois `--desligar`. O backup fica em `dados/`.
4. No app, Cobrança > Ligar cobrança.

**Desfazer:** Cobrança > Voltar ao modo teste e `notificacoes-asaas.py --religar dados/asaas-notificacoes-backup-<data>.json`.

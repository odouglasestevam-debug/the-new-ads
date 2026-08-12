# Agenda (cílios)

App interno de agendamento pra substituir o Minha Agenda. Ela cadastra o agendamento
no painel e o app manda confirmação e lembretes automáticos pro WhatsApp da cliente
via NeoGo (gateway WhatsApp, mesma família da NeoAI usada nos fluxos de tracking).

## Setup

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (free tier resolve).
2. No **SQL Editor**, rode o conteúdo de `supabase/schema.sql`.
3. Em **Authentication → Users**, crie um usuário (e-mail/senha) pra sua esposa — é o
   único login do app.
4. Em **Project Settings → API**, copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**nunca** expor essa key no client)

### 2. NeoGo

1. `NEOGO_BASE_URL` = URL base da instância (ex: `http://seu-host:4000`).
2. `NEOGO_API_KEY` = a apikey da instância.
3. Gere `NEOGO_WEBHOOK_TOKEN` (`openssl rand -hex 32`) e defina como env var. Essa rota é
   pública (sem login) porque quem chama é o NeoGo, não um usuário logado — o token no
   próprio path é a única proteção, já que o NeoGo não manda header de autorização
   customizado nesse tipo de webhook.
4. Depois do primeiro deploy, registre o webhook de eventos pra receber respostas das
   clientes (confirma/cancela por WhatsApp), apontando pra:
   `https://SEU-DOMINIO/api/webhooks/neogo/SEU_NEOGO_WEBHOOK_TOKEN`

   Isso pode ser feito com uma chamada direta:

   ```bash
   curl -X PUT "$NEOGO_BASE_URL/instance/SEU_INSTANCE_ID/webhooks/1" \
     -H "apikey: $NEOGO_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://SEU-DOMINIO/api/webhooks/neogo/SEU_NEOGO_WEBHOOK_TOKEN", "events": [], "enabled": true}'
   ```

   > Se o webhook já estava registrado com a URL antiga (sem token), repita esse comando
   > com a URL nova pra sobrescrever — a rota antiga sem token não existe mais no código.

   > **Atenção**: o formato exato do texto da mensagem recebida (dentro de `data.Message`)
   > ainda não foi confirmado com uma resposta real de cliente — só foi possível mapear
   > o node pelo código-fonte, não por um teste ao vivo. `src/app/api/webhooks/neogo/route.ts`
   > tenta os campos mais comuns do whatsmeow (`conversation`, `extendedTextMessage.text`).
   > Manda pra Débora responder "confirmo" num agendamento de teste e olha a tabela
   > `message_log` no Supabase — se o texto não aparecer certo, ajusta `extrairTextoMensagem`
   > nesse arquivo.

### 3. Variáveis de ambiente

Copie `.env.example` pra `.env.local` e preencha tudo (Supabase + NeoGo + `CRON_SECRET`,
que pode ser qualquer string aleatória gerada com `openssl rand -hex 32`).

### 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`, faça login com o usuário criado no passo 1, cadastre uma
cliente com um número de WhatsApp real e crie um agendamento — a mensagem de confirmação
deve chegar na hora.

### 5. Deploy (Vercel)

1. `vercel` (ou conecte o repo no dashboard da Vercel).
2. Configure as mesmas variáveis de `.env.local` no painel do projeto (Settings → Environment
   Variables).
3. O cron de lembretes (`vercel.json`) já está configurado pra rodar a cada 15 min — não
   precisa de nenhuma configuração extra na Vercel além de ter `CRON_SECRET` definido.
4. Depois do deploy, registre o webhook do NeoGo (passo 2) com o domínio de produção.

## Como funciona

- **Confirmação**: disparada na hora que o agendamento é criado (`src/app/actions.ts`).
- **Lembrete 1 dia antes / 3h antes**: calculado em `src/lib/reminders.ts`, respeitando
  horário comercial (8h-20h, horário de São Paulo); disparado pela rota de cron
  (`src/app/api/cron/reminders/route.ts`).
- **Resposta da cliente**: recebida em `src/app/api/webhooks/neogo/route.ts` — se a
  mensagem contiver "confirm" ou "cancel", atualiza o status do agendamento automaticamente.
  Toda mensagem (enviada ou recebida) fica registrada em `message_log` pra auditoria.

## Fora de escopo (por decisão, não esquecimento)

- Sem link público de auto-agendamento — só ela cadastra.
- Sem cobrança de sinal/pagamento.
- Só um profissional/agenda (single-tenant).

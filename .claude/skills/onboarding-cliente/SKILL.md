---
name: onboarding-cliente
description: >
  Estrutura um cliente novo depois que o contrato foi assinado — puxa dados do contrato
  (repo local) e do briefing inicial (Google Forms), cria a pasta do cliente e o briefing.md,
  duplica a estrutura de tarefas no ClickUp (The New Ads ou Tubarão Ads), cria a assinatura
  recorrente no Asaas com base na vigência do contrato, e agenda a call de onboarding/acessos.
  Use quando o usuário disser "onboarding do cliente X", "cliente assinou, bora estruturar",
  "abre o cliente novo" ou "monta o onboarding do [cliente]".
---

# Onboarding de cliente

Skill de orquestração — não reinventa processo nenhum, só executa em ordem o que já existe: o template do ClickUp (`TEMPLATES > 00 - CLIENTE TRÁFEGO`), o contrato gerado pela skill `contrato`, e o padrão de pasta de cliente (`clientes/_modelo-cliente/`). Nasceu de mapear o processo completo em 2026-08-13.

**Trigger**: só roda depois que o contrato já foi assinado. Proposta e negociação são etapas anteriores, fora do escopo desta skill.

## Passo 0 — Anunciar o plano e coletar as variáveis de uma vez

Antes de tocar em qualquer ferramenta de escrita, listar o plano (passos 1-7 abaixo, ajustados ao que o pedido precisa) e pedir numa mensagem só:

1. **Nome do cliente** (usado pra achar o contrato em `contratos/` e nomear pasta/slug)
2. **Qual agência**: The New Ads ou Tubarão Ads (define o space no ClickUp)
3. **Link do Google Sheets de respostas do Forms de briefing inicial** (Douglas sempre tem, é onde ticket médio, site e identidade visual vêm de gestor)
4. **Contexto de negócio extra** que não estiver nem no contrato nem no forms (histórico, concorrentes, diferencial, sazonalidade) — perguntar mesmo que pareça redundante, geralmente só existe na cabeça do Douglas
5. **Data/hora da "Call de Onboarding e Acessos"** (Etapa 02 do ClickUp), se já tiver combinada

Não perguntar o que já dá pra puxar sozinho (contrato e forms) — só confirmar depois de ler, não perguntar antes.

## Passo 1 — Ler o contrato

Buscar em `contratos/` por `contrato-<slug-ou-nome>-*.html` (nunca `.docx`, o `.html` é sempre gerado junto e é mais fácil de parsear). Ver `contratos/contrato-agari-drinks-2026-08-07.html` como exemplo de formato — **é só referência de estrutura, nunca dado real**, cada cliente tem o próprio contrato.

Extrair da qualificação e das cláusulas:
- Razão social / nome fantasia, CNPJ ou CPF
- Nome do contato + CPF
- Serviços contratados (Cláusula 1 — lista o que ele vai receber)
- Valor mensal e forma de pagamento (Cláusula 3)
- Vigência mínima em meses (Cláusula 2) e data de início (geralmente Cláusula 3.6 ou data do documento)

Se não achar o contrato pelo nome, perguntar ao Douglas em vez de assumir que não existe ou inventar um slug.

## Passo 2 — Ler o briefing (Google Forms)

Ler a planilha de respostas via Google Drive (`read_file_content`/`download_file_content`, é Sheets nativo). Extrair: ticket médio, se tem site (e qual URL), se tem identidade visual pronta, e qualquer outro campo relevante pro `briefing.md`. Google Forms não tem API acessível diretamente aqui — sempre a planilha de respostas, nunca tentar acessar o Forms em si.

## Passo 3 — Workspace local

1. Criar `clientes/<slug>/` a partir de `clientes/_modelo-cliente/` (copiar `briefing.md` e `proposta.html`, criar `assets/`).
2. Preencher `briefing.md` com tudo coletado (contrato + forms + contexto extra do Passo 0). Ticket médio vira a base do CPA alvo, se o Douglas não tiver dado outro número explícito.
3. Adicionar entrada em `tarefas.md` com um checklist resumido de onboarding.

## Passo 4 — ClickUp

Espaços fixos: **the new ads** = `90113792830`, **TUBARAO ADS** = `90113792821`. Template de referência: folder `00 - CLIENTE TRÁFEGO` (id `90116238902`, space `TEMPLATES` = `90113790117`), com 4 listas — `Contrato`, `Pagamento`, `Onboarding`, `Gestão de Tráfego` (ids fixos: `901110777003`, `901110776979`, `901110777009`, `901110777024`).

1. `clickup_create_folder` — nome do cliente, no space da agência escolhida no Passo 0.
2. `clickup_create_list_in_folder` — as mesmas 4 listas.
3. Pra cada lista, ler as tarefas do template (`clickup_filter_tasks` nos ids acima) e recriar (`clickup_create_task`) com o mesmo nome/prioridade/assignee na lista nova.
4. Como o trigger é "contrato já assinado", marcar como concluídas as tarefas da lista `Contrato` que já aconteceram (redigir/enviar contrato assinado) — confirmar com o Douglas quais already, não assumir todas.

Isso substitui a ideia antiga de "duplicar a pasta" — a API do ClickUp não tem duplicação direta de folder, então a skill recria estrutura + tarefas uma por uma.

## Passo 5 — Asaas: assinatura recorrente

Projeto já usa Asaas pra tudo (token em `.env`, `ASAS_ACCESS_TOKEN`). Criar:
1. `POST /v3/customers` (se o cliente ainda não existir no Asaas — buscar primeiro por CPF/CNPJ antes de criar duplicado).
2. `POST /v3/subscriptions` — `cycle: MONTHLY`, `value` = valor mensal do contrato (Passo 1), `nextDueDate` = data de início + dia de vencimento do contrato, `endDate` = data de início + vigência em meses (Passo 1). Isso implementa "criar a assinatura com base no tempo assinado em contrato" — depois da vigência mínima o contrato normalmente renova automaticamente por prazo indeterminado (ver texto do contrato), então confirmar com o Douglas se `endDate` deve mesmo travar nesse ponto ou se a assinatura deve continuar (mais comum: deixar sem `endDate`, e o cancelamento é manual quando o contrato encerrar de verdade).

**Não tem endpoint de teste — toda chamada aqui é real e gera cobrança de verdade pro cliente.** Confirmar os valores com o Douglas antes de criar a assinatura (mostrar valor, ciclo e data), nunca criar direto sem essa confirmação.

## Passo 6 — Agenda

Se o Douglas já deu data/hora no Passo 0, criar o evento "Call de Onboarding e Acessos" no Google Calendar com o cliente. Se não deu, deixar como pendência no checklist final em vez de inventar horário.

## Passo 7 — O que fica só no checklist (não automatizar)

- **Grupo de WhatsApp do cliente**: NeoGo não tem operação de criar grupo (confirmado em 2026-08-13) — sempre manual. A skill lista, com base no briefing, quem deveria entrar no grupo (Douglas como admin + contato principal do cliente + demais responsáveis mencionados).
- **Ativos do Meta Business Manager** (conta de anúncio, pixel, pagamento) — já está templado em "Gestão de Tráfego" no ClickUp, não duplicar em outro lugar.
- **Planejamento estratégico e apresentação** (Etapas 04/05 do Onboarding) — dependem de pesquisa de mercado feita pelo Douglas, ficam como tarefas pendentes no ClickUp.

## Passo 8 — Oferecer o próximo passo

Ao final, perguntar se já é hora de rodar a skill `dashboard-cliente` (Supabase + n8n + dashboard) — só faz sentido quando o cliente for de fato começar a rodar tráfego, não necessariamente no mesmo dia do onboarding comercial.

## Checklist final antes de dizer "pronto"

- [ ] Contrato lido e dados extraídos (ou confirmado com Douglas que não achou)
- [ ] Briefing do Forms lido (ticket médio, site, identidade visual)
- [ ] `clientes/<slug>/` criado com `briefing.md` preenchido
- [ ] Entrada em `tarefas.md`
- [ ] Folder + 4 listas + tarefas recriadas no ClickUp, no space certo
- [ ] Assinatura no Asaas criada **só depois de confirmar valor/ciclo/data com o Douglas**
- [ ] Call de Onboarding agendada (ou deixada como pendência explícita)
- [ ] Grupo de WhatsApp e ativos do BM deixados como checklist, não como "feito"
- [ ] Perguntado se já roda `dashboard-cliente` em seguida

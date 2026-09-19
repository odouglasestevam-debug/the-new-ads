---
name: onboarding-cliente
description: >
  Estrutura um cliente novo depois que o contrato foi assinado — puxa dados do contrato
  (repo local) e do briefing inicial (Google Forms), cria a pasta do cliente e o briefing.md,
  cria a pasta do cliente com as listas e tarefas do modelo no gestor de tarefas (tarefas.thenewads.com.br, espaço The New Ads ou Tubarão Ads), cria a assinatura
  recorrente no Asaas com base na vigência do contrato, e agenda a call de onboarding/acessos.
  Use quando o usuário disser "onboarding do cliente X", "cliente assinou, bora estruturar",
  "abre o cliente novo" ou "monta o onboarding do [cliente]".
---

# Onboarding de cliente

Skill de orquestração — não reinventa processo nenhum, só executa em ordem o que já existe: o modelo do gestor de tarefas (espaço `Modelos` > pasta `00 - Cliente tráfego`), o contrato gerado pela skill `contrato`, e o padrão de pasta de cliente (`clientes/_modelo-cliente/`). Nasceu de mapear o processo completo em 2026-08-13.

**Trigger**: só roda depois que o contrato já foi assinado. Proposta e negociação são etapas anteriores, fora do escopo desta skill.

## Passo 0 — Anunciar o plano e coletar as variáveis de uma vez

Antes de tocar em qualquer ferramenta de escrita, listar o plano (passos 1-7 abaixo, ajustados ao que o pedido precisa) e pedir numa mensagem só:

1. **Nome do cliente** (usado pra achar o contrato em `contratos/`, nomear pasta/slug, e localizar a linha certa na planilha única de briefing — ver Passo 2)
2. **Qual agência**: The New Ads ou Tubarão Ads (define o espaço no gestor de tarefas)
3. **Contexto de negócio extra** que não estiver nem no contrato nem no forms (histórico, concorrentes, diferencial, sazonalidade) — perguntar mesmo que pareça redundante, geralmente só existe na cabeça do Douglas
4. **Data/hora da "Call de Onboarding e Acessos"** (Etapa 02 da lista Onboarding), se já tiver combinada — antes de perguntar, checar se já existe evento com o contato do cliente marcado pra essa call (`search_events`/`list_events`); se já tiver, usar esse e não perguntar

Não perguntar o link do Google Sheets — é sempre a mesma planilha única de respostas do Forms (ver Passo 2). Não perguntar o que já dá pra puxar sozinho (contrato e forms) — só confirmar depois de ler, não perguntar antes.

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

Todos os clientes respondem o mesmo Forms — as respostas caem numa única planilha, uma linha por cliente. O link é sempre fixo, não precisa perguntar nem redescobrir:

`https://docs.google.com/spreadsheets/d/17Rcp8pRQ4N5_HNHj6c0t9U792QABHQ4atO3jzyvvK7A/edit?resourcekey=&gid=181066902#gid=181066902`

Ler via Google Drive (`read_file_content`, fileId `17Rcp8pRQ4N5_HNHj6c0t9U792QABHQ4atO3jzyvvK7A`) e localizar a linha do cliente pelo nome/empresa (última coluna de identificação é geralmente "Seu nome completo e o da sua empresa" ou o e-mail). O arquivo cresce a cada cliente novo — se a resposta esperada não aparecer, pode ser porque ainda não foi respondida; nesse caso perguntar ao Douglas em vez de assumir. Extrair: ticket médio, faturamento, site, identidade visual, público-alvo, concorrentes, sazonalidade e qualquer outro campo relevante pro `briefing.md`. Google Forms não tem API acessível diretamente aqui — sempre a planilha de respostas, nunca tentar acessar o Forms em si.

## Passo 3 — Workspace local

1. Criar `clientes/<slug>/` a partir de `clientes/_modelo-cliente/` (copiar `briefing.md` e `proposta.html`, criar `assets/`).
2. Preencher `briefing.md` com tudo coletado (contrato + forms + contexto extra do Passo 0). Ticket médio vira a base do CPA alvo, se o Douglas não tiver dado outro número explícito.
3. Adicionar entrada em `tarefas.md` com um checklist resumido de onboarding.

## Passo 4 — Gestor de tarefas

O ClickUp foi abandonado em 19/09/2026. A estrutura do cliente vai pro gestor de tarefas
(banco `tarefas` no Supabase `xrvjlhseyqfgyvwwlwwb`, conector MCP `supabase-app`, `execute_sql`).
O molde é o espaço **Modelos** > pasta **00 - Cliente tráfego**, com 4 listas: Contrato,
Pagamento, Onboarding e Gestão de Tráfego (tarefas, subtarefas, responsáveis, prioridade e a
"Revisão diária de budget e performance" recorrente seg/qua/sex com checklist na descrição).
Se o Douglas mudar o modelo pela tela, a cópia já sai com a mudança: nunca listar tarefas fixas aqui.

1. Rodar o bloco abaixo trocando só `v_espaco` (nome da agência) e `v_cliente` (nome da pasta,
   igual ao nome do cliente). Ele recusa se já existir pasta com esse nome no espaço, e a
   recorrente já nasce com a próxima data da regra.

```sql
do $$
declare
  v_modelo uuid := (select pa.id from tarefas.pastas pa join tarefas.projetos p on p.id = pa.projeto_id where p.nome = 'Modelos' and pa.nome = '00 - Cliente tráfego');
  v_espaco uuid := (select id from tarefas.projetos where nome = '<The New Ads|Tubarão Ads>');
  v_cliente text := '<Nome do cliente>';
  v_status uuid := (select id from tarefas.status where tipo = 'aberto' order by ordem limit 1);
  v_criador uuid := (select user_id from tarefas.usuarios where email = 'odouglasestevam@gmail.com');
  v_pasta uuid; v_lista uuid; v_nova uuid; v_sub uuid; l record; t record; s record;
begin
  if v_modelo is null or v_espaco is null then raise exception 'Modelo ou espaço não encontrado.'; end if;
  if exists (select 1 from tarefas.pastas where projeto_id = v_espaco and pasta_pai_id is null and lower(nome) = lower(v_cliente)) then
    raise exception 'Já existe a pasta % nesse espaço.', v_cliente; end if;
  insert into tarefas.pastas (projeto_id, nome) values (v_espaco, v_cliente) returning id into v_pasta;
  for l in select * from tarefas.listas where pasta_id = v_modelo order by nome loop
    insert into tarefas.listas (projeto_id, pasta_id, nome) values (v_espaco, v_pasta, l.nome) returning id into v_lista;
    for t in select * from tarefas.tarefas where lista_id = l.id and tarefa_pai_id is null order by ordem loop
      insert into tarefas.tarefas (lista_id, titulo, descricao, status_id, prioridade, data_entrega, recorrencia, recorrencia_intervalo,
        recorrencia_dias_semana, recorrencia_mensal, recorrencia_dia_mes, recorrencia_ordem, recorrencia_dia_semana, criado_por, ordem)
      values (v_lista, t.titulo, t.descricao, v_status, t.prioridade,
        case when t.recorrencia is not null then privado.tarefas_proxima_data(privado.tarefas_hoje() - 1, t.recorrencia, t.recorrencia_intervalo,
          t.recorrencia_dias_semana, t.recorrencia_mensal, t.recorrencia_dia_mes, t.recorrencia_ordem, t.recorrencia_dia_semana) end,
        t.recorrencia, t.recorrencia_intervalo, t.recorrencia_dias_semana, t.recorrencia_mensal, t.recorrencia_dia_mes,
        t.recorrencia_ordem, t.recorrencia_dia_semana, v_criador, t.ordem)
      returning id into v_nova;
      insert into tarefas.tarefa_responsaveis select v_nova, user_id from tarefas.tarefa_responsaveis where tarefa_id = t.id;
      for s in select * from tarefas.tarefas where tarefa_pai_id = t.id order by ordem loop
        insert into tarefas.tarefas (lista_id, tarefa_pai_id, titulo, descricao, status_id, prioridade, criado_por, ordem)
        values (v_lista, v_nova, s.titulo, s.descricao, v_status, s.prioridade, v_criador, s.ordem) returning id into v_sub;
        insert into tarefas.tarefa_responsaveis select v_sub, user_id from tarefas.tarefa_responsaveis where tarefa_id = s.id;
      end loop;
    end loop;
  end loop;
end $$;
```

2. Conferir a cópia (quantidade de tarefas por lista igual à do modelo):
```sql
select l.nome, count(t.*) from tarefas.listas l join tarefas.pastas pa on pa.id = l.pasta_id
left join tarefas.tarefas t on t.lista_id = l.id
where pa.nome = '<Nome do cliente>' group by l.nome order by l.nome;
```
3. Como o trigger é "contrato já assinado", concluir na lista `Contrato` as tarefas que já
   aconteceram (redigir/enviar contrato assinado): confirmar com o Douglas quais, não assumir
   todas. Concluir = `status_id` do status de tipo `concluido`.
4. Permissões: membro com "Todos os espaços" já enxerga a pasta nova. Quem tem espaços
   selecionados só enxerga se o espaço da agência estiver liberado pra ele. Não mexer em
   permissão por aqui: se alguém precisar ou não puder ver o cliente, avisar o Douglas pra
   ajustar em Ajustes > Membros.
5. Mostrar o link da lista Gestão de Tráfego: `https://tarefas.thenewads.com.br/#/lista/<lista_id>`.

## Passo 5 — Asaas: assinatura recorrente

Projeto já usa Asaas pra tudo (token em `.env`, `ASAS_ACCESS_TOKEN`). **Sempre conferir antes de criar qualquer coisa:**

1. `GET /v3/customers?cpfCnpj=<cnpj-ou-cpf-sem-formatacao>` — se já existir cliente, pular criação.
2. `GET /v3/subscriptions?customer=<id>` — se já existir assinatura (qualquer status ativo), **não criar outra**. Reportar a existente (valor, ciclo, vencimento) e seguir pro próximo passo sem tocar no Asaas.
3. Só se não existir cliente e/ou assinatura, criar:
   - `POST /v3/customers` (se o cliente ainda não existir).
   - `POST /v3/subscriptions` — `cycle: MONTHLY`, `value` = valor mensal do contrato (Passo 1), `nextDueDate` = data de início + dia de vencimento do contrato, `endDate` = data de início + vigência em meses (Passo 1). Isso implementa "criar a assinatura com base no tempo assinado em contrato" — depois da vigência mínima o contrato normalmente renova automaticamente por prazo indeterminado (ver texto do contrato), então confirmar com o Douglas se `endDate` deve mesmo travar nesse ponto ou se a assinatura deve continuar (mais comum: deixar sem `endDate`, e o cancelamento é manual quando o contrato encerrar de verdade).

**Não tem endpoint de teste — toda chamada de criação aqui é real e gera cobrança de verdade pro cliente.** Confirmar os valores com o Douglas antes de criar a assinatura (mostrar valor, ciclo e data), nunca criar direto sem essa confirmação. Consultas (`GET`) não têm esse risco e não precisam de confirmação prévia.

## Passo 6 — Agenda

Se o Douglas já deu data/hora no Passo 0, criar o evento "Call de Onboarding e Acessos" no Google Calendar com o cliente. Se não deu, deixar como pendência no checklist final em vez de inventar horário.

## Passo 7 — O que fica só no checklist (não automatizar)

- **Grupo de WhatsApp do cliente**: NeoGo não tem operação de criar grupo (confirmado em 2026-08-13) — sempre manual. A skill lista, com base no briefing, quem deveria entrar no grupo (Douglas como admin + contato principal do cliente + demais responsáveis mencionados).
- **Ativos do Meta Business Manager** (conta de anúncio, pixel, pagamento): já vem no modelo, em "Setup inicial" da lista Gestão de Tráfego. Não duplicar em outro lugar.
- **Planejamento estratégico e apresentação** (Etapas 04/05 do Onboarding): dependem de pesquisa de mercado feita pelo Douglas, ficam como tarefas pendentes no gestor.

## Passo 8 — Oferecer o próximo passo

Ao final, perguntar se já é hora de rodar a skill `dashboard-cliente` (Supabase + n8n + dashboard) — só faz sentido quando o cliente for de fato começar a rodar tráfego, não necessariamente no mesmo dia do onboarding comercial.

## Checklist final antes de dizer "pronto"

- [ ] Contrato lido e dados extraídos (ou confirmado com Douglas que não achou)
- [ ] Briefing do Forms lido (ticket médio, site, identidade visual)
- [ ] `clientes/<slug>/` criado com `briefing.md` preenchido
- [ ] Entrada em `tarefas.md`
- [ ] Pasta do cliente + 4 listas + tarefas copiadas do modelo no gestor de tarefas, no espaço certo
- [ ] Asaas conferido (cliente + assinatura) — criado **só se não existir**, e só depois de confirmar valor/ciclo/data com o Douglas
- [ ] Call de Onboarding agendada (ou deixada como pendência explícita)
- [ ] Grupo de WhatsApp e ativos do BM deixados como checklist, não como "feito"
- [ ] Perguntado se já roda `dashboard-cliente` em seguida

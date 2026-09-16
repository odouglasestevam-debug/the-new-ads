# Sistema novo (multitenant) - plano

Decidido em 16/09/2026 com o Douglas. Ler inteiro antes de mexer em qualquer coisa.

## O que é

Um sistema para clientes da agência, baseado no `/funil` da The New Ads (duplicado, não estendido). Cada cliente é uma empresa com seus usuários e níveis de acesso. Os leads entram sozinhos (formulário do site, WhatsApp de anúncio CTWA e, depois, formulário nativo da Meta) já com a origem da campanha, conjunto e anúncio, e a equipe responde pelo WhatsApp (API oficial e não oficial) num chat dentro do próprio sistema, sem Chatwoot.

## Restrições absolutas

- **Não mexer no `/funil`**: pasta `the-new-ads-site/funil/`, rotas `the-new-ads-site/functions/api/`, tabelas `funil_*` do projeto Supabase `iklynyncffneuvutvgxa`. É o sistema do Douglas e está funcionando.
- **Não mexer no n8n.** O sistema novo não depende dele nem das tabelas `*_tracking` e `*_meta` do banco antigo. Nem todo cliente vai ter acesso e o sistema ainda não está validado.
- Nunca rodar SQL do sistema novo no banco antigo. O banco novo só é acessado pelo conector `supabase-app`.

## Onde vive

- **Banco:** projeto Supabase `xrvjlhseyqfgyvwwlwwb`, organização "oestevamdouglas@gmail.com's Org", conector MCP `supabase-app` (`.mcp.json`, preso a esse project_ref). Começa zerado.
- **Front e rotas:** projeto Cloudflare Pages novo e pasta nova no repo (a definir), com o código do `/funil` copiado como ponto de partida, tirando o que é só da TNA (nichos, formulário de tráfego pago, agenda do Douglas).
- **Subdomínio:** a definir (sugestões: `app.thenewads.com.br`, `crm.thenewads.com.br`).

Motivo do projeto separado: usuários de cliente vão ter login. No mesmo banco dos dashboards e do `/funil`, qualquer erro de RLS numa tabela antiga exporia dado de outro cliente.

## Decisões de produto

**Uma pessoa, um lead.** Identificação por telefone (normalizado E.164), e-mail como plano B. Guarda primeira e última origem. Sem telefone, o lead fica marcado como **cadastro incompleto** (alerta no card), pode ser completado à mão e é mesclado sozinho quando a pessoa aparecer por outro canal com telefone.

**Origem tipo UTM, por canal:**

| canal | origem | fase |
|---|---|---|
| Formulário do site | UTMs da URL + `ad_id` | 2 |
| CTWA | `referral.source_id` (é o ad_id) + `ctwa_clid`; o sistema consulta a API da Meta e grava nome da campanha, conjunto e anúncio, com cache por ad_id | 3 |
| Formulário nativo Meta | webhook `leadgen`; API entrega nomes de campanha/conjunto/anúncio e as respostas. Exige conectar o Facebook e provavelmente revisão de app para páginas de terceiros. **Segundo plano** | depois |

Regra operacional: todo formulário nativo de cliente com telefone obrigatório.

**Credenciais por empresa** (token Meta de usuário do sistema, WhatsApp Phone Number ID, WABA ID, App Secret, verify token, credenciais da API não oficial): cifradas no banco (Supabase Vault), nunca no navegador, campo só de escrita na tela de Integrações. Um número não pode estar na API oficial e na não oficial ao mesmo tempo.

**Papéis (proposta, falta confirmar):** agência (super admin, vê todas as empresas); por empresa: dono, gestor, vendedor (só os leads atribuídos a ele), leitura.

## Fases

0. **Fundação:** schema multitenant (empresas, membros, papéis, RLS por empresa), tabelas de leads com origem e cadastro incompleto, testes provando que uma empresa não enxerga a outra; pasta nova com cópia limpa do `/funil`; projeto Pages novo.
1. **Empresas, usuários e papéis** na interface (convite, troca de empresa, permissões).
2. **Entrada de leads:** endpoint de formulário do site por empresa.
3. **WhatsApp** oficial e não oficial; lead de CTWA nasce da primeira mensagem, com nomes resolvidos pelo source_id.
4. **Chat** nativo.

Tela de Integrações é construída ao longo das fases 2 e 3. Formulário nativo Meta entra depois de validar.

## Andamento

**16/09/2026, banco da Fase 0 aplicado** (`sistema-novo/supabase/migrations/0001` e `0002`):
- Papéis confirmados pelo Douglas: agência, dono, gestor, vendedor (só os leads atribuídos a ele), leitura
- Lead é por empresa: o mesmo telefone em dois clientes vira dois leads, um em cada
- Tabelas: `empresas`, `agencia_admins`, `membros`, `leads`, `lead_origens`, `lead_etapas_log`, `lead_notas`, `integracoes`, `meta_anuncios_cache`
- Funções de permissão no schema `privado` (fora da API). `segredo_id`, origens não manuais, log e cache só o servidor grava
- `sistema-novo/supabase/tests/isolamento.sql`: 31 de 31 testes passando. Rodar de novo depois de qualquer migration

Falta na Fase 0: pasta do front com a cópia do `/funil`, projeto Pages novo, primeiro usuário da agência.

## Pendências (perguntar antes de decidir)
- Cliente piloto (sugestão: Grupo Confiança)
- Subdomínio e nome do sistema
- Custo: projeto está no Free Plan; avisar antes de qualquer coisa que gere cobrança

## Como trabalhar

Antes de aplicar qualquer migration, mostrar o schema proposto ao Douglas e esperar aprovação. Atualizar este arquivo quando uma pendência for decidida.

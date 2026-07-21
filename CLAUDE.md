# The New Ads — Claude Code OS

## O que é esse workspace

Workspace de operação da The New Ads, agência de marketing de performance de Douglas Estevam. Aqui ficam clientes, briefings, propostas, conteúdo, dados e a identidade de marca usada em qualquer entrega visual.

**Estrutura de pastas:**
- `_contexto/` — memória do sistema (não apagar)
- `marca/` — brand book, logos e design-guide da The New Ads
- `clientes/` — um subdiretório por cliente (usar `_modelo-cliente/` como base pra clientes novos)
- `briefings/` — briefings recebidos
- `propostas/` — propostas em andamento e enviadas
- `conteudo/` — produção de conteúdo (copy, posts, roteiros)
- `dados/` — relatórios, exports de campanha, CSVs pra análise
- `tarefas.md` — lista de tarefas corrente
- `templates/skills/` — templates de skills prontos pra personalizar com `/mapear`
- `templates/ferramentas/catalogo.md` — APIs e ferramentas disponíveis pra usar em skills

## Sobre o negócio

Agência de marketing digital de performance. Serviços: Google Ads, Meta Ads, tracking avançado (GTM/GA4/CAPI), landing pages, automações (n8n, Evolution API, Chatwoot), dashboards (Looker Studio) e copywriting. Atende clientes locais em segmentos como advocacia, clínicas, imobiliárias, construção civil, estética e e-commerce.

## O que mais fazemos aqui

- Gestão e análise de campanhas (Google Ads / Meta Ads)
- Copy e apresentações
- Relatórios de performance
- Propostas comerciais
- Conteúdo e posts (incluindo publicação no Instagram)
- Automações operacionais (n8n)

## Clientes e contexto

Atende clientes externos, múltiplos segmentos locais. Cada cliente novo ganha uma pasta em `clientes/[nome-cliente]/`, com base no modelo em `clientes/_modelo-cliente/`.

## Tom de voz

Objetivo, técnico, direto, sem enrolação, em português do Brasil. Nunca usar travessão (—). Sem clichês de IA. Ver `_contexto/preferencias.md` para detalhes completos.

## Ferramentas conectadas

- [ ] N8N (MCP disponível — `claude mcp add n8n -- npx -y n8n-mcp`)
- [ ] Google Calendar (agendar reuniões)
- [ ] Gmail (comunicação com clientes)
- [ ] Google Drive (briefings, decks)
- [ ] Skills `/ads-ratos`, `/meta-ads-ratos`, `/google-ads-ratos`, `/ga4-ratos` (gestão e relatório de campanhas)

*(Marcar conforme for instalando os MCPs — ver `tarefas.md` pra pendências)*

---

## Contexto do negócio

No início de toda conversa, ler os seguintes arquivos (se existirem e estiverem configurados):

1. `_contexto/empresa.md` — quem é o usuário, o que faz, como funciona o negócio
2. `_contexto/preferencias.md` — tom de voz, estilo de escrita, o que evitar
3. `_contexto/estrategia.md` — foco atual, prioridades, o que pode esperar

Usar essas informações como base pra qualquer resposta ou decisão. Ao sugerir prioridades, formatos ou abordagens, considerar o foco atual descrito em `estrategia.md`.

Para qualquer tarefa visual (carrossel, proposta, slide, landing page), consultar `marca/design-guide.md` como referência de estilo — seguir os padrões do brand book (`marca/brand-book.html`) à risca.

Não é necessário listar o que foi lido nem confirmar a leitura. Apenas usar o contexto naturalmente.

---

## Fluxo de trabalho

Antes de executar qualquer tarefa, verificar se existe uma skill relevante em `.claude/skills/` ou `.claude/commands/`.
Se encontrar, seguir as instruções da skill.
Se não encontrar, executar a tarefa normalmente.

Ao concluir uma tarefa que não tinha skill mas parece repetível (o usuário provavelmente vai pedir de novo no futuro), perguntar:

> "Isso pode virar uma skill pra próxima vez. Quer que eu crie?"

Não perguntar pra tarefas pontuais ou perguntas simples. Só quando o padrão de repetição for claro.

---

## Aprender com correções

Quando o usuário corrigir algo, melhorar uma resposta ou dar uma instrução que parece permanente (frases como "na verdade é assim", "não faça mais isso", "prefiro assim", "sempre que...", "evita...", "da próxima vez..."), perguntar:

> "Quer que eu salve isso pra não precisar repetir?"

Se sim, identificar onde faz mais sentido salvar:

- **Sobre o negócio** (quem são os clientes, como funciona a empresa, serviços, mercado) → adicionar em `_contexto/empresa.md`
- **Sobre preferências e estilo** (tom de voz, formato de resposta, o que evitar, como estruturar textos) → adicionar em `_contexto/preferencias.md`
- **Sobre prioridades e foco atual** (projetos em andamento, metas do momento, prazos importantes, o que é prioridade agora) → adicionar em `_contexto/estrategia.md`
- **Regra de comportamento nessa pasta** (onde salvar arquivos, como nomear, fluxos específicos) → adicionar no próprio `CLAUDE.md`

Salvar com uma linha nova clara, sem reformatar o arquivo inteiro. Confirmar o que foi salvo mostrando a linha adicionada.

Não perguntar se a correção for óbvia de contexto imediato (ex: "na verdade o arquivo se chama X"). Só perguntar quando a informação tiver valor duradouro.

---

## Manter contexto atualizado

Ao terminar uma tarefa que mudou algo relevante no projeto (novo cliente, nova skill, mudança de foco, novo processo, ferramenta instalada, estrutura de pastas alterada), perguntar:

> "Isso mudou algo no teu contexto. Quer que eu atualize os arquivos de memória?"

Se sim, identificar o que precisa atualizar:

- **Novo cliente, serviço, ferramenta, equipe** → `_contexto/empresa.md`
- **Mudança de prioridade ou foco** → `_contexto/estrategia.md`
- **Correção de tom ou estilo** → `_contexto/preferencias.md`
- **Nova pasta, regra de organização, skill criada** → `CLAUDE.md`
- **Mudança visual (cores, fontes, logo)** → `marca/design-guide.md`

Mostrar o que vai mudar antes de salvar. Não reformatar o arquivo inteiro, só adicionar ou editar a linha relevante.

**Quando NÃO perguntar:**
- Tarefas pontuais que não mudam o contexto (ex: escrever um email, criar um post avulso)
- Perguntas simples ou conversas sem ação
- Mudanças que já foram salvas pelo bloco "Aprender com correções"

**Dica:** se não sabe se algo mudou, rode `/atualizar` pra uma varredura completa.

---

## Criação de skills

Quando o usuário pedir pra criar uma nova skill:

1. Verificar se existe um template relevante em `templates/skills/`. Se existir, usar como base e adaptar pro contexto do usuário
2. Perguntar: "Essa skill é específica pra esse projeto ou vai ser útil em qualquer projeto?"
   - Específica desse negócio → salvar em `.claude/skills/nome-da-skill/SKILL.md` (local)
   - Útil em qualquer projeto → salvar em `~/.claude/skills/nome-da-skill/SKILL.md` (global)
3. Ler `_contexto/empresa.md` e `_contexto/preferencias.md` pra calibrar o conteúdo da skill ao contexto do negócio
4. Se a skill precisar de arquivos de apoio (templates, referências, exemplos), criar dentro da pasta da skill
5. Seguir o fluxo da skill-creator nativa do Claude Code

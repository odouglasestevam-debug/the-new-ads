---
name: ads-ratos
description: Inteligência de tráfego pago — diagnóstico, relatório, auditoria e estratégia para Meta Ads e Google Ads. Usa benchmarks brasileiros, Quality Gates e Health Score. Use quando o usuário mencionar diagnóstico de conta, relatório de ads, auditoria de tráfego, performance de campanha, análise de conta, health score, benchmark, quality gate, dashboard de ads. Também dispara com /ads-ratos.
---

# Ads Ratos

Camada de inteligência para gestão de tráfego pago. Diagnostica contas,
gera relatórios visuais, audita campanhas e aplica Quality Gates com
benchmarks do mercado brasileiro.

Não executa ações na API diretamente — delega para skills de execução:
- **Meta Ads**: skill `meta-ads-ratos` (SDK oficial facebook-business)
- **Google Ads**: skill `google-ads-ratos` (SDK oficial google-ads)
- **Google Analytics**: skill `ga4-ratos` (GA4 Data API)

Se a skill de execução não estiver instalada, orientar o usuário a instalar.

## Setup

Na primeira vez, rodar:
```
/ads-ratos setup
```

### Fluxo do setup

1. Detecta se o CC-OS RATOS está instalado (lê `_contexto/empresa.md` se existir)
2. Verifica quais skills de execução estão disponíveis (meta-ads-ratos, google-ads-ratos, ga4-ratos)
3. Detecta Python correto (ver seção abaixo)
4. **Importa contas das skills de execução** (ver fluxo abaixo)
5. Testa conexões

### Fluxo de importação de contas (passo 4)

O setup DEVE seguir esta ordem pra popular o `contas.yaml`:

**Passo A — Verificar quais sub-skills têm contas cadastradas:**
```bash
ls ~/.claude/skills/meta-ads-ratos/contas.yaml 2>/dev/null && echo "META_TEM_CONTAS"
ls ~/.claude/skills/google-ads-ratos/contas.yaml 2>/dev/null && echo "GOOGLE_TEM_CONTAS"
ls ~/.claude/skills/ga4-ratos/contas.yaml 2>/dev/null && echo "GA4_TEM_CONTAS"
```

**Passo B — Perguntar ao usuário antes de puxar:**

Se encontrou pelo menos uma sub-skill com contas, PERGUNTAR:
> "Encontrei contas já cadastradas nas skills [lista das que encontrou]. Posso puxar os IDs de lá e já preencher o ads-ratos automaticamente?"

- Se o usuário disser **sim**: ir pro Passo C
- Se o usuário disser **não**: ir pro Passo D

**Passo C — Ler e mesclar os contas.yaml das sub-skills:**
```bash
cat ~/.claude/skills/meta-ads-ratos/contas.yaml 2>/dev/null
cat ~/.claude/skills/google-ads-ratos/contas.yaml 2>/dev/null
cat ~/.claude/skills/ga4-ratos/contas.yaml 2>/dev/null
```
- Cruzar por nome de cliente (ex: "Fabio Haag" aparece no Google e no GA4 = mesmo cliente)
- Montar o `contas.yaml` unificado do ads-ratos com Meta + Google + GA4 por cliente
- Mostrar pro usuário o que montou e perguntar: "Ficou certo? Quer adicionar mais contas via API?"
- Se sim, ir pro Passo D. Se não, salvar e ir pro passo 5 (testar conexões)

**Passo D — Buscar contas via API (fallback ou complemento):**
- Buscar contas via API das skills de execução (ex: `read.py accounts`)
- Mostrar lista pro usuário escolher quais salvar
- Atualizar o `contas.yaml`

**Importante:** NUNCA chamar a API antes de tentar ler os yamls locais. Os yamls são
a fonte de verdade (já foram curados pelo usuário). A API é fallback ou complemento.

## Comandos

| Comando | O que faz | Quando usar |
|---|---|---|
| `/ads-ratos setup` | Configura contas e testa conexões | Primeira vez |
| `/ads-ratos diagnostico` | Health Score + KPIs + alertas automáticos | Check diário (5 min) |
| `/ads-ratos relatorio` | Dashboard HTML com benchmarks BR | Entrega pro cliente (semanal/mensal) |
| `/ads-ratos auditoria` | Análise profunda com Quality Gates | Revisão mensal |
| `/ads-ratos historico` | Registra e consulta otimizações e hipóteses | Após cada ação |

## Cadastro de contas (contas.yaml)

**Arquivo:** `contas.yaml` (na raiz da skill)

Antes de executar qualquer comando, o Claude DEVE ler este arquivo para resolver
nomes de clientes para IDs de conta.

Se não houver contas cadastradas, guiar o setup.

## Referências (carregar sob demanda)

| Arquivo | Quando carregar |
|---|---|
| `references/benchmarks-br.md` | Diagnóstico, relatório e auditoria |
| `references/quality-gates.md` | Auditoria e diagnóstico |

O Claude DEVE ler o arquivo de referência relevante ANTES de executar o comando.

## Aprendizados (memória persistente)

**Arquivo:** `aprendizados.md` (na raiz da skill, `~/.claude/skills/ads-ratos/aprendizados.md`)

O Claude DEVE:
1. **Ler `aprendizados.md` no início de QUALQUER comando** (diagnóstico, relatório, auditoria)
2. **Quando o usuário corrigir algo**, perguntar: "Quer que eu registre isso nos aprendizados pra não esquecer nas próximas vezes?"
3. **Quando o usuário pedir** ("lembra disso", "registra", "anota"), registrar imediatamente
4. **Ser proativo**: se o usuário pedir pra refazer ou ajustar algo que já foi gerado, perguntar se quer registrar a correção
5. **Não duplicar** — verificar se já existe regra similar antes de adicionar

Cada skill de execução (meta-ads-ratos, google-ads-ratos, ga4-ratos) tem seu próprio `aprendizados.md` pra regras específicas da plataforma. O do ads-ratos é pra regras gerais (formato de relatório, preferências de visualização, etc).

## Regras gerais

1. **NUNCA usar MCPs**: toda execução DEVE ser via scripts Python das skills Ratos (meta-ads-ratos, google-ads-ratos, ga4-ratos). Nunca usar fb-ads-mcp-server, adloop ou qualquer outro MCP de terceiro. Isso garante consistência e independência.
2. **Benchmarks BR**: sempre usar benchmarks do mercado brasileiro (não americano)
2. **Terminologia PT-BR**: nunca usar termos em inglês no output (spend → gasto, reach → alcance, etc)
3. **Números sempre**: alertas e recomendações devem ter números específicos, nunca vagos
4. **Comparativo**: sempre comparar com período anterior quando possível
5. **Priorizar**: ordenar alertas e recomendações por impacto financeiro (maior economia primeiro)

## Detecção do Python correto (OBRIGATÓRIO)

Antes de rodar qualquer script, detectar qual `python3` tem os SDKs instalados.
Rodar UMA VEZ no início da sessão e reutilizar o caminho:

```bash
# Detectar Python com facebook-business (Meta Ads)
PYTHON=$(python3 -c "import facebook_business; print('OK')" 2>/dev/null && echo "python3" || \
  (/opt/homebrew/bin/python3 -c "import facebook_business; print('OK')" 2>/dev/null && echo "/opt/homebrew/bin/python3") || \
  echo "NONE")
```

Se `NONE`: orientar o usuário a instalar o SDK (`pip3 install facebook-business`).

Depois de detectar, SEMPRE usar esse Python pra todos os scripts da sessão:
```bash
$PYTHON ~/.claude/skills/meta-ads-ratos/scripts/read.py accounts
```

**Por que isso é necessário:** no Mac existem dois Pythons (system e Homebrew).
Os SDKs ficam no Homebrew (`/opt/homebrew/bin/python3`) mas o `python3` do PATH
pode ser o system (que não tem os pacotes). Detectar uma vez evita erros.

## Detecção de skills de execução

Antes de executar, verificar quais skills estão disponíveis:

```bash
# Meta Ads
ls ~/.claude/skills/meta-ads-ratos/SKILL.md 2>/dev/null && echo "META_OK"

# Google Ads
ls ~/.claude/skills/google-ads-ratos/SKILL.md 2>/dev/null && echo "GOOGLE_OK"

# GA4
ls ~/.claude/skills/ga4-ratos/SKILL.md 2>/dev/null && echo "GA4_OK"
```

Se nenhuma skill estiver instalada, orientar:
- Meta Ads: `git clone https://github.com/duduesh/meta-ads-ratos ~/.claude/skills/meta-ads-ratos`
- Google Ads: (em breve)
- GA4: (em breve)

## Tabela de terminologia PT-BR

| Inglês | Português |
|---|---|
| spend | gasto |
| reach | alcance |
| impressions | impressões |
| clicks | cliques |
| conversions | conversões |
| cost per lead | custo por lead (CPL) |
| click-through rate | taxa de cliques (CTR) |
| cost per click | custo por clique (CPC) |
| cost per mille | custo por mil (CPM) |
| frequency | frequência |
| return on ad spend | retorno sobre investimento (ROAS) |
| budget | orçamento |
| ad set | conjunto de anúncios |
| ad creative | criativo |
| landing page | página de destino |
| conversion rate | taxa de conversão |
| quality score | índice de qualidade |
| search terms | termos de busca |
| negative keywords | palavras-chave negativas |
| audience | público |
| placement | posicionamento |
| daily budget | orçamento diário |
| lifetime budget | orçamento vitalício |

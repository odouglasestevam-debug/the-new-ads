# /ads-ratos setup

Configura o Ads Ratos para um novo cliente ou agência.

## REGRA CRÍTICA

**NUNCA usar MCPs (fb-ads-mcp-server, adloop, etc) neste fluxo.**
Toda execução DEVE ser via scripts Python da skill meta-ads-ratos:
```bash
python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py <comando>
```
Isso garante consistência e que o aluno não dependa de MCPs de terceiros.

## O que este comando faz

1. Detecta se o CC-OS RATOS está instalado
2. Verifica quais skills de execução estão disponíveis
3. Guia o cadastro de contas no contas.yaml
4. Testa conexões

## Instruções para execução

### PASSO 0 — Detectar contexto existente

Verificar se o CC-OS RATOS está instalado:

```bash
ls _contexto/empresa.md 2>/dev/null && echo "CCOS_OK"
```

Se existir, ler `_contexto/empresa.md` para pegar:
- Nome da empresa/agência
- Segmento de atuação
- Clientes (se listados)

Informar: "Detectei que tu usa o CC-OS RATOS. Vou aproveitar o contexto de {EMPRESA}."

### PASSO 1 — Verificar skills de execução

```bash
ls ~/.claude/skills/meta-ads-ratos/SKILL.md 2>/dev/null && echo "META_OK"
ls ~/.claude/skills/google-ads-ratos/SKILL.md 2>/dev/null && echo "GOOGLE_OK"
ls ~/.claude/skills/ga4-ratos/SKILL.md 2>/dev/null && echo "GA4_OK"
```

Informar quais estão instaladas. Se nenhuma:

"Nenhuma skill de execução encontrada. Pra usar o Ads Ratos, tu precisa de pelo menos uma:

- **Meta Ads**: `git clone https://github.com/duduesh/meta-ads-ratos ~/.claude/skills/meta-ads-ratos`
- **Google Ads**: em breve
- **GA4**: em breve

Depois de instalar, roda `/ads-ratos setup` de novo."

### PASSO 2 — Cadastrar contas

Para cada skill disponível:

**Meta Ads** (se meta-ads-ratos instalada):
1. Rodar `python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py accounts`
2. Mostrar a lista de contas disponíveis
3. Perguntar: "Qual conta de anúncio tu quer usar? Me diz o nome do cliente."
4. Para a conta escolhida, perguntar ou buscar automaticamente:
   - Nome do cliente
   - Conta de anúncio (act_XXX)
   - Page ID do Facebook
   - Instagram ID
   - Nicho/segmento (pra benchmarks)
5. Perguntar: "Quer cadastrar mais algum cliente?"

**Google Ads** (se google-ads-ratos instalada):
1. Listar contas disponíveis via SDK
2. Mesmo fluxo de perguntas

### PASSO 3 — Salvar contas.yaml

Salvar o arquivo `contas.yaml` na raiz da skill ads-ratos (`~/.claude/skills/ads-ratos/contas.yaml`):

```yaml
clientes:

  nome-do-cliente:
    nome: "Nome do Cliente"
    nicho: "e-commerce"  # pra benchmarks
    meta:
      conta_anuncio: "act_XXXXXXXXX"
      pagina_facebook: "XXXXXXXXX"
      instagram_id: "XXXXXXXXX"
      instagram_username: "@username"
    google:
      customer_id: "XXX-XXX-XXXX"
    ga4:
      property_id: "XXXXXXXXX"
    moeda: "BRL"
    notas: ""
```

### PASSO 4 — Testar conexões

Para cada plataforma configurada, testar:

**Meta Ads:**
```bash
python3 ~/.claude/skills/meta-ads-ratos/scripts/read.py account-details --id act_XXX
```

**Google Ads:** (quando disponível)
```bash
python3 ~/.claude/skills/google-ads-ratos/scripts/read.py account --id XXX
```

### PASSO 5 — Relatório final

```
═══════════════════════════════════════════════════
 ADS RATOS — Setup completo
═══════════════════════════════════════════════════

 Skills instaladas:
   ✅ meta-ads-ratos
   ❌ google-ads-ratos (não instalada)
   ❌ ga4-ratos (não instalada)

 Clientes cadastrados:
   ✅ Nome do Cliente (Meta Ads — act_XXX)

 Próximos passos:
   /ads-ratos diagnostico  → check rápido da conta
   /ads-ratos relatorio    → dashboard pro cliente
   /ads-ratos auditoria    → análise profunda

═══════════════════════════════════════════════════
```

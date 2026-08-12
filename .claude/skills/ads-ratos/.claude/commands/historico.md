# /ads-ratos historico

Registra e consulta o histórico de otimizações, testes e hipóteses da conta.
Cada vez que uma ação é tomada (pausar criativo, mudar orçamento, trocar público),
deve ser registrada aqui pra saber o que já foi feito e o que funcionou.

## REGRA CRÍTICA

**NUNCA usar MCPs (fb-ads-mcp-server, adloop, etc) neste fluxo.**

## O que este comando faz

Dois modos de operação:

### Modo 1: Registrar (padrão)
```
/ads-ratos historico
```
Pergunta o que foi feito e registra no log.

### Modo 2: Consultar
```
/ads-ratos historico ver
```
Mostra o histórico completo ou filtrado.

## Instruções para execução

### REGISTRAR — Quando o usuário fez uma otimização

1. Perguntar (ou detectar do contexto da conversa):
   - **Cliente**: qual conta
   - **O que foi feito**: ação concreta (pausou criativo X, aumentou orçamento de Y pra Z, etc)
   - **Por quê**: motivo da decisão (CPL alto, criativo cansado, teste de público, etc)
   - **Hipótese**: o que espera que aconteça ("espero que o CPL caia de R$45 pra R$25")
   - **Métricas antes**: snapshot das métricas no momento da ação

2. Criar/atualizar o arquivo `historico/{cliente}.md` na pasta do workspace (ou `~/.claude/skills/ads-ratos/historico/` se não houver workspace).

3. Adicionar entrada no formato:

```markdown
### {DATA} — {TÍTULO CURTO DA AÇÃO}

**Ação:** {o que foi feito, com IDs e nomes reais}
**Motivo:** {por que tomou essa decisão}
**Hipótese:** {o que espera que aconteça}
**Métricas antes:**
- Gasto: R$ XX/dia
- CPL: R$ XX
- CTR: X.X%
- Frequência: X.X

**Status:** ⏳ Aguardando resultado
```

4. Se possível, puxar as métricas atuais automaticamente via meta-ads-ratos/google-ads-ratos
   pra preencher "Métricas antes" sem o usuário ter que digitar.

### CONSULTAR — Quando o usuário quer ver o histórico

1. Ler o arquivo `historico/{cliente}.md`
2. Exibir as entradas mais recentes primeiro
3. Se o usuário pedir, filtrar por:
   - Período ("últimas 2 semanas")
   - Tipo de ação ("só pausas", "só mudanças de orçamento")
   - Status ("só pendentes", "só concluídos")

### ATUALIZAR RESULTADO — Quando já passou tempo suficiente

Quando o usuário rodar `/ads-ratos historico` e houver entradas com status "⏳ Aguardando resultado"
com mais de 7 dias, perguntar:

"Tu tem {N} otimizações pendentes de resultado. Quer que eu puxe as métricas atuais
pra comparar com o antes?"

Se sim:
1. Puxar métricas atuais da mesma campanha/ad set
2. Comparar com "Métricas antes"
3. Atualizar a entrada:

```markdown
**Métricas depois (avaliado em {DATA}):**
- Gasto: R$ XX/dia
- CPL: R$ XX (↓30%)
- CTR: X.X% (↑15%)
- Frequência: X.X

**Resultado:** ✅ Hipótese confirmada — CPL caiu 30%
```

Ou:

```markdown
**Resultado:** ❌ Hipótese refutada — CPL subiu 10% em vez de cair
**Aprendizado:** {o que se aprendeu com isso}
```

### REGISTRAR AUTOMATICAMENTE

Quando o usuário executar ações via meta-ads-ratos ou google-ads-ratos
(pausar campanha, mudar orçamento, trocar criativo), o Claude DEVE
perguntar: "Quer que eu registre essa ação no histórico?"

Se sim, registrar automaticamente com as métricas do momento.

## Estrutura do arquivo de histórico

```markdown
# Histórico de Otimizações — {CLIENTE}

> Última atualização: {DATA}
> Total de ações: {N}
> ✅ Confirmadas: {N} | ❌ Refutadas: {N} | ⏳ Pendentes: {N}

---

### 2026-04-03 — Pausou criativo com baixa conversão

**Ação:** Pausou o criativo "AD Store 2 - Objeção" nas campanhas de venda
**Motivo:** Gasto de R$79 com 24 checkouts mas 0 vendas — desperdício
**Hipótese:** CPL geral da campanha deve cair ~15% sem esse criativo
**Métricas antes:**
- Gasto campanha: R$ 30/dia
- CPL: R$ 19,18
- CTR: 1.28%
- Criativo problemático: R$ 11/dia, 0 vendas

**Métricas depois (avaliado em 2026-04-10):**
- Gasto campanha: R$ 30/dia
- CPL: R$ 15,40 (↓20%)
- CTR: 1.45% (↑13%)

**Resultado:** ✅ Hipótese confirmada — CPL caiu 20%, melhor que os 15% esperados
**Aprendizado:** Criativos de objeção sem prova social não convertem nesse público

---

### 2026-03-28 — Aumentou orçamento de campanha top

**Ação:** Orçamento diário de R$30 → R$50 na campanha principal de vendas
**Motivo:** CPA dentro da meta por 10 dias consecutivos, margem pra escalar
**Hipótese:** Manter CPA em R$19 com 60% mais volume
**Métricas antes:**
- CPA: R$ 19,18
- Conversões/dia: ~1.5
- CTR: 1.28%

**Status:** ⏳ Aguardando resultado

---
```

## Resumo de aprendizados

Quando o histórico tiver 10+ entradas com resultado, gerar automaticamente
uma seção de resumo no topo do arquivo:

```markdown
## Padrões identificados

1. **Criativos de objeção** sem prova social não convertem (2 testes, 0 vendas)
2. **Escalar gradual (20-30%)** funciona melhor que dobrar orçamento
3. **Público Advantage+** supera lookalike 2x em CPA nessa conta
4. **Horário 18h-22h** tem melhor CTR mas pior CPL (volume vs qualidade)
```

## Regras

- Cada entrada DEVE ter: data, ação específica (com nomes/IDs), motivo, hipótese e métricas antes
- NUNCA registrar ações vagas ("melhorei a campanha") — sempre específico
- Métricas SEMPRE com números reais, não estimativas
- Avaliar resultado após 7 dias (mínimo) pra ter dados suficientes
- Se a hipótese for refutada, registrar o aprendizado (o que se aprendeu)
- O arquivo de histórico é do CLIENTE, não global — cada cliente tem seu arquivo

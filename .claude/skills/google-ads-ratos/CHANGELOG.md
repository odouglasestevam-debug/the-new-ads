# Changelog — google-ads-ratos

Este arquivo lista o que muda a cada atualização da skill, num formato que o
**Claude do usuário consegue aplicar sozinho**, preservando as customizações locais.

## Como o Claude deve usar este arquivo (LER PRIMEIRO)

Quando o usuário pedir pra atualizar/checar atualização da skill:

1. Descubra a versão local: leia o arquivo `VERSION` na raiz da skill. Se não existir,
   considere que o usuário está numa versão anterior à primeira entrada abaixo (aplique todas).
2. Aplique **em ordem** todas as versões deste changelog **maiores** que a versão local.
3. Para cada versão, siga as "Regras de aplicação" e as "Mudanças por arquivo".
4. **Regras fixas, valem sempre:**
   - NUNCA edite dados do usuário: `contas.yaml`, `.env`, `google-ads.yaml`, `aprendizados.md`.
   - Antes de editar um arquivo, salve um backup dele (ex: `update.py.bak`).
   - Cada mudança tem um rótulo de risco:
     - `ADITIVO` = acrescenta algo que não existia. Pode aplicar sozinho. Se já existir, pule.
     - `SUBSTITUIÇÃO` = troca um trecho. Localize o bloco "ANTES". Se bater igual, troque pelo
       "DEPOIS". **Se o bloco local estiver diferente do "ANTES" (o usuário customizou ali),
       NÃO sobrescreva cego**: aplique só a mudança descrita preservando o resto, ou explique
       pro usuário e pergunte antes.
     - `BREAKING` / `AÇÃO MANUAL` = mudança de comportamento. Avise o usuário em texto claro.
   - Alternativa válida a copiar os blocos: baixar o arquivo canônico do GitHub e comparar com o
     local. Se o usuário não customizou aquele arquivo, substituir direto é mais seguro. Raw:
     `https://raw.githubusercontent.com/duduesh/google-ads-ratos/main/<caminho-do-arquivo>`
5. Ao terminar, valide que não quebrou: `cd scripts && python3 -m py_compile *.py`.
   Se compilar, atualize o `VERSION` local pro número da versão mais nova aplicada e avise o
   usuário do que mudou (em especial as seções BREAKING).

---

## [1.1.0] — 2026-07-06

### Resumo
Orçamento e lances passam a ser em reais/euro (aceitando vírgula OU ponto), com trava de
segurança pra aumentos grandes de orçamento e conferência do valor gravado na conta.
Deixa a skill robusta pra contas em qualquer moeda/formato e evita erro de casa decimal.

### Regras de aplicação
Segue as regras fixas acima. Nenhum dado do usuário é tocado.

### Mudanças por arquivo

#### 1. `scripts/lib/__init__.py` — ADITIVO (risco baixo)
Adicionar a função `parse_money()` logo **antes** de `def micros_to_currency(micros):`.
Se `parse_money` já existir no arquivo, pule.

```python
def parse_money(value):
    """Converte um valor monetario para float, aceitando virgula OU ponto decimal.

    Serve pra orcamento e lances. Nunca assumir formato: trata BR/euro (virgula) e US (ponto).
      '1,50'     -> 1.5
      '1.50'     -> 1.5
      '1.500,00' -> 1500.0   (ponto de milhar, virgula decimal)
      '1,500.00' -> 1500.0   (virgula de milhar, ponto decimal)
      50         -> 50.0
    """
    s = str(value).strip()
    for sym in ("R$", "r$", "€", "$", " ", " "):
        s = s.replace(sym, "")
    if "," in s and "." in s:
        # o separador decimal e o que aparece mais a direita
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)
```

#### 2. `scripts/update.py` — SUBSTITUIÇÃO (risco médio)
Na função `cmd_campaign`, o tratamento de `--budget` e o retorno foram reescritos.

**ANTES** (localize por este bloco):
```python
    if args.budget:
        # Need to update the budget resource separately
        # First, get current campaign to find budget resource
        from lib import run_query
        query = f"""
            SELECT campaign.campaign_budget
            FROM campaign
            WHERE campaign.id = {args.campaign_id}
        """
        rows = run_query(customer_id, query)
        if rows and "campaign" in rows[0]:
            budget_resource = rows[0]["campaign"].get("campaign_budget", "")
            if budget_resource:
                budget_service = client.get_service("CampaignBudgetService")
                budget_op = client.get_type("CampaignBudgetOperation")
                budget = budget_op.update
                budget.resource_name = budget_resource
                budget.amount_micros = int(args.budget) * 10000  # centavos -> micros

                from google.api_core import protobuf_helpers
                client.copy_from(
                    budget_op.update_mask,
                    protobuf_helpers.field_mask(None, budget._pb)
                )
                # Simple field mask for budget
                budget_op.update_mask.paths.clear()
                budget_op.update_mask.paths.append("amount_micros")

                budget_service.mutate_campaign_budgets(
                    customer_id=customer_id, operations=[budget_op]
                )
                print(f"Budget atualizado: {budget_resource}", file=sys.stderr)

    if not field_mask_paths:
        if not args.budget:
            print_error("Nenhum campo para atualizar. Use --status, --name, ou --budget.")
            sys.exit(1)
        # Budget was updated above, just report success
        print_json({"status": "updated", "campaign_id": args.campaign_id, "budget_updated": True})
        return

    # Set field mask
    operation.update_mask.paths.extend(field_mask_paths)

    response = service.mutate_campaigns(
        customer_id=customer_id, operations=[operation]
    )
    result = response.results[0]
    print_json({
        "status": "updated",
        "resource_name": result.resource_name,
        "fields_updated": field_mask_paths,
    })
```

**DEPOIS**:
```python
    budget_result = None
    if args.budget:
        from lib import run_query, parse_money, micros_to_currency
        # pega o budget resource + o valor atual da campanha
        query = f"""
            SELECT campaign.campaign_budget, campaign_budget.amount_micros
            FROM campaign
            WHERE campaign.id = {args.campaign_id}
        """
        rows = run_query(customer_id, query)
        if not rows or "campaign" not in rows[0]:
            print_error(f"Campanha {args.campaign_id} nao encontrada.")
            sys.exit(1)
        budget_resource = rows[0]["campaign"].get("campaign_budget", "")
        if not budget_resource:
            print_error("Campanha sem orcamento associado.")
            sys.exit(1)

        old_micros = int((rows[0].get("campaign_budget") or {}).get("amount_micros", 0) or 0)
        # valor em reais/euro (aceita virgula OU ponto) -> micros
        new_micros = int(round(parse_money(args.budget) * 1_000_000))

        # trava de seguranca: bloqueia aumento grande sem confirmacao explicita
        if (not args.force) and old_micros > 0 and new_micros > old_micros * 3:
            print_error(
                f"Aumento grande de orcamento: {micros_to_currency(old_micros):.2f}/dia "
                f"-> {micros_to_currency(new_micros):.2f}/dia "
                f"({new_micros / old_micros:.1f}x). Confira se o valor esta certo. "
                f"Se for intencional, rode de novo com --force."
            )
            sys.exit(1)

        budget_service = client.get_service("CampaignBudgetService")
        budget_op = client.get_type("CampaignBudgetOperation")
        budget = budget_op.update
        budget.resource_name = budget_resource
        budget.amount_micros = new_micros
        budget_op.update_mask.paths.append("amount_micros")
        budget_service.mutate_campaign_budgets(
            customer_id=customer_id, operations=[budget_op]
        )

        # readback: rele o valor efetivamente gravado na conta e mostra
        check = run_query(customer_id, query)
        final_micros = new_micros
        if check and check[0].get("campaign_budget"):
            final_micros = int(check[0]["campaign_budget"].get("amount_micros", new_micros) or new_micros)
        budget_result = {
            "anterior": round(micros_to_currency(old_micros), 2),
            "novo": round(micros_to_currency(final_micros), 2),
        }
        print(
            f"Orcamento: {micros_to_currency(old_micros):.2f}/dia -> "
            f"{micros_to_currency(final_micros):.2f}/dia (confirmado na conta)",
            file=sys.stderr,
        )

    if not field_mask_paths:
        if not args.budget:
            print_error("Nenhum campo para atualizar. Use --status, --name, ou --budget.")
            sys.exit(1)
        print_json({
            "status": "updated",
            "campaign_id": args.campaign_id,
            "budget": budget_result,
        })
        return

    # Set field mask
    operation.update_mask.paths.extend(field_mask_paths)

    response = service.mutate_campaigns(
        customer_id=customer_id, operations=[operation]
    )
    result = response.results[0]
    out = {
        "status": "updated",
        "resource_name": result.resource_name,
        "fields_updated": field_mask_paths,
    }
    if budget_result:
        out["budget"] = budget_result
    print_json(out)
```

#### 3. `scripts/update.py` (parser) — SUBSTITUIÇÃO (risco baixo)
No parser do subcomando `campaign`, trocar o help do `--budget` e adicionar `--force`.

**ANTES**:
```python
    p.add_argument("--budget", help="New daily budget in centavos (5000 = R$50)")
    p.set_defaults(func=cmd_campaign)
```
**DEPOIS**:
```python
    p.add_argument("--budget", help="Novo orcamento diario em reais/euro. Aceita virgula ou ponto (ex: 50 ou 1,50)")
    p.add_argument("--force", action="store_true", help="Confirma mudanca grande de orcamento (>3x o atual)")
    p.set_defaults(func=cmd_campaign)
```

#### 4. `scripts/create.py` — SUBSTITUIÇÃO (risco baixo)
Na criação de budget, trocar a conversão de unidade.

**ANTES**:
```python
    budget.amount_micros = int(args.budget) * 10000  # budget in centavos -> micros
```
**DEPOIS**:
```python
    from lib import parse_money
    budget.amount_micros = int(round(parse_money(args.budget) * 1_000_000))  # valor em reais/euro -> micros
```

E no parser (subcomando `campaign`):
**ANTES**:
```python
    p.add_argument("--budget", required=True, help="Daily budget in centavos (5000 = R$50)")
```
**DEPOIS**:
```python
    p.add_argument("--budget", required=True, help="Orcamento diario em reais/euro. Aceita virgula ou ponto (ex: 50 ou 1,50)")
```

#### 5. `SKILL.md` — SUBSTITUIÇÃO (risco baixo)
Trocar os exemplos de `--budget` (que estavam em centavos) e a regra 6. Se o usuário
personalizou o texto do SKILL.md, aplique só estas trocas pontuais:
- Exemplo do `create.py campaign`: `--budget 5000` vira `--budget 50` (R$50/dia; aceita `1,50`).
- Exemplo do `update.py campaign`: `--budget 10000` vira `--budget 100` (R$100/dia; aceita `1,50`).
- Regra 6 passa a explicar que budget/bids são em reais/euro (não centavos), aceitam vírgula
  ou ponto, que mudanças grandes exigem `--force`, e que nunca se deve escrever `amount_micros`
  na mão em script inline (usar sempre `update.py`/`create.py`).

### BREAKING / AÇÃO MANUAL
- **A unidade do `--budget` mudou.** Antes era centavos (`5000` = R$50/dia). Agora é reais/euro
  (`50` = R$50/dia; `1,50` = R$1,50/dia). Se o usuário tiver anotações, atalhos ou hábitos
  passando budget em centavos, avise. Não é preciso mexer em nenhuma campanha existente.

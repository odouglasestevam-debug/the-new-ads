"""Cadastra (ou confere) o webhook do Asaas que avisa o Financeiro na hora de cada pagamento.

Uso (da raiz do workspace), com o token que também está no Vault como financeiro_webhook_token:
  FINANCEIRO_WEBHOOK_TOKEN=... python -I financeiro/scripts/webhook-asaas.py            # lista os webhooks da conta
  FINANCEIRO_WEBHOOK_TOKEN=... python -I financeiro/scripts/webhook-asaas.py --criar    # cria o do Financeiro

O token vem por variável de ambiente pra nunca ficar no histórico do terminal nem em arquivo.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/financeiro/asaas"
EVENTOS = [
    "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE",
    "PAYMENT_DELETED", "PAYMENT_RESTORED", "PAYMENT_REFUNDED", "PAYMENT_RECEIVED_IN_CASH_UNDONE",
    "SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED",
]


def chamar(metodo, caminho, corpo=None):
    env = (RAIZ / ".env").read_text(encoding="utf-8")
    token = re.search(r"^ASAS_ACCESS_TOKEN\s*=\s*(.+)$", env, re.M).group(1).strip().strip("'\"")
    req = urllib.request.Request("https://api.asaas.com/v3" + caminho, method=metodo,
                                 data=json.dumps(corpo).encode("utf-8") if corpo else None,
                                 headers={"access_token": token, "User-Agent": "TNA-Financeiro", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Asaas {e.code}: {e.read().decode('utf-8')[:400]}")


def main():
    existentes = chamar("GET", "/webhooks").get("data", [])
    for w in existentes:
        print(f"- {w.get('name')}: {w.get('url')} ({'ativo' if w.get('enabled') else 'inativo'}"
              f"{', fila interrompida' if w.get('interrupted') else ''})")
    if "--criar" not in sys.argv:
        return
    if any(w.get("url") == URL for w in existentes):
        sys.exit("Já existe um webhook para o Financeiro. Nada foi criado.")
    auth = os.environ.get("FINANCEIRO_WEBHOOK_TOKEN", "")
    if len(auth) < 32:
        sys.exit("Defina FINANCEIRO_WEBHOOK_TOKEN (32+ caracteres, o mesmo do Vault).")
    criado = chamar("POST", "/webhooks", {
        "name": "Financeiro TNA", "url": URL, "email": "odouglasestevam@gmail.com", "enabled": True,
        "interrupted": False, "authToken": auth, "sendType": "SEQUENTIALLY", "events": EVENTOS,
    })
    print(f"Criado: {criado.get('id')} -> {criado.get('url')}")


if __name__ == "__main__":
    main()

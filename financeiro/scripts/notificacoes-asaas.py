"""Liga ou desliga o WhatsApp e o SMS que o Asaas manda para os clientes. O e-mail do Asaas fica como está.

Uso (da raiz do workspace):
  python -I financeiro/scripts/notificacoes-asaas.py                 # só mostra o que mudaria (não altera nada)
  python -I financeiro/scripts/notificacoes-asaas.py --desligar      # dia da virada: desliga WhatsApp e SMS
  python -I financeiro/scripts/notificacoes-asaas.py --religar ARQ   # desfaz, a partir do backup gerado no --desligar

O backup vai para dados/ (fora do Git, tem id de cliente). Chave: ASAS_ACCESS_TOKEN no .env da raiz.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
BASE = "https://api.asaas.com/v3"


def token():
    env = (RAIZ / ".env").read_text(encoding="utf-8")
    m = re.search(r"^ASAS_ACCESS_TOKEN\s*=\s*(.+)$", env, re.M)
    if not m:
        sys.exit("ASAS_ACCESS_TOKEN não está no .env")
    return m.group(1).strip().strip("'\"")


def chamar(metodo, caminho, corpo=None):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(BASE + caminho, data=dados, method=metodo, headers={
        "access_token": token(), "User-Agent": "TNA-Financeiro", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Asaas {e.code} em {metodo} {caminho}: {e.read().decode('utf-8')[:300]}")


def todos(caminho):
    offset = 0
    while True:
        r = chamar("GET", f"{caminho}{'&' if '?' in caminho else '?'}limit=100&offset={offset}")
        yield from r.get("data", [])
        if not r.get("hasMore"):
            return
        offset += 100


def levantar():
    """Cada notificação ativa com WhatsApp ou SMS ligado para o cliente."""
    plano = []
    for cli in todos("/customers"):
        for n in chamar("GET", f"/customers/{cli['id']}/notifications").get("data", []):
            if n.get("whatsappEnabledForCustomer") or n.get("smsEnabledForCustomer"):
                plano.append({"cliente": cli["id"], "nome": cli.get("name"), "notificacao": n["id"], "evento": n.get("event"),
                              "dias": n.get("scheduleOffset"), "whatsapp": bool(n.get("whatsappEnabledForCustomer")),
                              "sms": bool(n.get("smsEnabledForCustomer"))})
        time.sleep(0.2)
    return plano


def main():
    args = sys.argv[1:]
    if args[:1] == ["--religar"]:
        if len(args) < 2:
            sys.exit("Informe o arquivo de backup gerado no --desligar.")
        plano = json.loads(Path(args[1]).read_text(encoding="utf-8"))
        for p in plano:
            chamar("PUT", f"/notifications/{p['notificacao']}", {"whatsappEnabledForCustomer": p["whatsapp"], "smsEnabledForCustomer": p["sms"]})
            time.sleep(0.2)
        print(f"Religado: {len(plano)} notificações voltaram ao que eram.")
        return

    plano = levantar()
    clientes = sorted({p["nome"] or p["cliente"] for p in plano})
    print(f"{len(plano)} notificações com WhatsApp ou SMS ligados, em {len(clientes)} clientes:")
    for nome in clientes:
        print("  -", nome)
    if args[:1] != ["--desligar"]:
        print("\nNada foi alterado. Para desligar no dia da virada: --desligar")
        return

    backup = RAIZ / "dados" / f"asaas-notificacoes-backup-{datetime.now():%Y-%m-%d-%H%M}.json"
    backup.parent.mkdir(exist_ok=True)
    backup.write_text(json.dumps(plano, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nBackup salvo em {backup}")
    for p in plano:
        chamar("PUT", f"/notifications/{p['notificacao']}", {"whatsappEnabledForCustomer": False, "smsEnabledForCustomer": False})
        time.sleep(0.2)
    restantes = levantar()
    print(f"Desligado. Conferência: {len(restantes)} notificações ainda com WhatsApp ou SMS (o esperado é 0).")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Agendamento Calendar - gera refresh token OAuth2 com escopo Google Calendar.

Reaproveita o mesmo OAuth Client (CLIENT_ID / CLIENTE_SECRET) que ja existe
no .env da raiz do workspace (usado hoje pelo google-ads-ratos). So precisa
que a Calendar API esteja habilitada no mesmo projeto do Google Cloud.

Uso:
  python3 oauth_calendar.py
"""

import hashlib
import os
import re
import socket
import sys
import webbrowser
from urllib.parse import unquote

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOOL_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_ENV_PATH = os.path.join(TOOL_DIR, "..", "..", ".env")
OUT_ENV_PATH = os.path.join(TOOL_DIR, ".env")

SCOPE = "https://www.googleapis.com/auth/calendar"
SERVER = "127.0.0.1"


def load_env_file(path):
    values = {}
    if not os.path.isfile(path):
        return values
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def find_free_port(start=8090, end=8099):
    for port in range(start, end + 1):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind((SERVER, port))
            s.close()
            return port
        except OSError:
            continue
    return None


def main():
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        print("ERRO: google-auth-oauthlib nao instalado.")
        print("  Instale com: pip3 install google-auth-oauthlib")
        sys.exit(1)

    root_env = load_env_file(ROOT_ENV_PATH)
    client_id = root_env.get("CLIENT_ID", "").strip()
    client_secret = root_env.get("CLIENTE_SECRET", "").strip()

    if not client_id or not client_secret:
        print(f"ERRO: CLIENT_ID / CLIENTE_SECRET nao encontrados em {ROOT_ENV_PATH}")
        sys.exit(1)

    port = find_free_port()
    if not port:
        print("ERRO: nenhuma porta livre entre 8090-8099.")
        sys.exit(1)

    redirect_uri = f"http://{SERVER}:{port}"

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    flow = Flow.from_client_config(client_config, scopes=[SCOPE])
    flow.redirect_uri = redirect_uri

    passthrough_val = hashlib.sha256(os.urandom(1024)).hexdigest()
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        state=passthrough_val,
        prompt="consent",
        include_granted_scopes="true",
    )

    print()
    print("=" * 60)
    print("  AUTORIZACAO GOOGLE CALENDAR")
    print("=" * 60)
    print()
    print("IMPORTANTE: faca login com a conta Google cujo calendario")
    print("vai ser usado pra agendar as reunioes.")
    print()
    print("Abre esta URL no browser (ou ela vai abrir sozinha):")
    print()
    print(f"  {authorization_url}")
    print()
    print(f"Aguardando callback em {redirect_uri} ...")
    print()

    webbrowser.open(authorization_url)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((SERVER, port))
    sock.listen(1)

    try:
        connection, _ = sock.accept()
        data = connection.recv(4096).decode("utf-8")
    except KeyboardInterrupt:
        print("\nCancelado pelo usuario.")
        sock.close()
        sys.exit(1)

    match = re.search(r"GET\s\/\?(.*?)\s", data)
    if not match:
        print("ERRO: callback invalido recebido do Google.")
        connection.close()
        sock.close()
        sys.exit(1)

    params = {}
    for pair in match.group(1).split("&"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            params[k] = unquote(v)

    if "error" in params:
        print(f"ERRO do Google: {params['error']}")
        connection.close()
        sock.close()
        sys.exit(1)

    code = params.get("code", "")
    if not code:
        print("ERRO: nenhum authorization code recebido.")
        connection.close()
        sock.close()
        sys.exit(1)

    html = (
        "<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;"
        "display:flex;align-items:center;justify-content:center;height:100vh;background:#0A0A0A;color:#FAFAFA;'>"
        "<div style='text-align:center;'>"
        "<h1 style='color:#FF6A00;'>Pronto!</h1>"
        "<p style='font-size:1.2rem;'>Calendario autorizado. Pode fechar esta aba.</p>"
        "</div></body></html>"
    )
    response = f"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}"
    connection.sendall(response.encode())
    connection.close()
    sock.close()

    flow.fetch_token(code=code)
    refresh_token = flow.credentials.refresh_token

    if not refresh_token:
        print("ERRO: Google nao retornou refresh token.")
        print("  Va em https://myaccount.google.com/permissions, revogue o app 'the new ads' (ou nome do OAuth client), e tente de novo.")
        sys.exit(1)

    content = (
        "# Agendamento Calendar - gerado por oauth_calendar.py\n"
        "# NUNCA commitar este arquivo (ja esta no .gitignore da raiz)\n\n"
        f'GOOGLE_CLIENT_ID="{client_id}"\n'
        f'GOOGLE_CLIENT_SECRET="{client_secret}"\n'
        f'GOOGLE_CALENDAR_REFRESH_TOKEN="{refresh_token}"\n'
        'GOOGLE_CALENDAR_ID="primary"\n'
        'TIMEZONE="America/Sao_Paulo"\n'
        'EXPEDIENTE_INICIO="9"\n'
        'EXPEDIENTE_FIM="18"\n'
        'DURACAO_MINUTOS="60"\n'
    )
    with open(OUT_ENV_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Refresh token salvo em {OUT_ENV_PATH}")
    print()
    print("Proximo passo: subir essas variaveis como secrets no Cloudflare Pages.")


if __name__ == "__main__":
    main()

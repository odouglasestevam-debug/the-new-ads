"""Le a busca do Pelando deste computador e manda as ofertas pra funcao
`ofertas` do Supabase (TNA Alertas), que decide se avisa.

Por que roda aqui e nao no servidor: o Pelando devolve a verificacao do
Cloudflare (403, "Just a moment...") pra endereco de servidor. De conexao
residencial a busca abre normal. Com o computador desligado, so os grupos de
WhatsApp (NeoGo) continuam avisando.

Agendador de Tarefas: tarefa "TNA Ofertas Pelando", a cada 5 min, com pythonw
(sem janela). Chave de acesso: OFERTAS_BF_KEY no .env da raiz do repositorio.
Depois de 30/11 o script nao faz nada; pra remover a tarefa:
    schtasks /delete /tn "TNA Ofertas Pelando" /f

Teste sem gravar nem notificar:  python -I pelando.py --dry
Ultima execucao fica em %LOCALAPPDATA%\\tna-ofertas\\ultimo.log
"""
import datetime
import html
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parents[2]
FIM = datetime.datetime(2026, 12, 1, 3, 0, tzinfo=datetime.timezone.utc)  # fim de 30/11 em Brasilia
FUNCAO = "https://iklynyncffneuvutvgxa.supabase.co/functions/v1/ofertas"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
BUSCAS = [
    "dualsense",
    "controle ps5",
    "ar condicionado 18000 inverter",
    "ar condicionado 18000",
    "ar condicionado 24000 inverter",
    "ar condicionado 24000",
    "elgin eco inverter iii",  # alerta forte do de 24 mil (a busca generica pode nao trazer)
    "depurador suggar",
    "depurador de ar",
]
LOG = pathlib.Path(os.environ.get("LOCALAPPDATA", RAIZ)) / "tna-ofertas" / "ultimo.log"


def chave() -> str:
    for linha in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if linha.startswith("OFERTAS_BF_KEY="):
            return linha.split("=", 1)[1].strip().strip('"')
    raise SystemExit("OFERTAS_BF_KEY nao esta no .env")


def astro(v):
    """Props das ilhas do Astro: [0, valor] e [1, lista]."""
    if isinstance(v, list) and len(v) == 2 and v[0] in (0, 1):
        return [astro(x) for x in v[1]] if v[0] == 1 else astro(v[1])
    if isinstance(v, list):
        return [astro(x) for x in v]
    if isinstance(v, dict):
        return {k: astro(x) for k, x in v.items()}
    return v


def enxuto(d: dict) -> dict:
    imagens = d.get("imageSrcset") or []
    imagem = max(imagens, key=lambda x: x.get("width") or 0).get("url") if imagens else d.get("imageUrl")
    return {
        "id": d.get("id"),
        "title": d.get("title"),
        "price": d.get("price"),
        "status": d.get("status"),
        "kind": d.get("kind"),
        "createdAt": d.get("createdAt"),
        "slug": d.get("slug"),
        "store": (d.get("store") or {}).get("name"),
        "image": imagem,
    }


def buscar(q: str) -> list:
    req = urllib.request.Request(
        "https://www.pelando.com.br/busca/" + urllib.parse.quote(q),
        headers={"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        pagina = r.read().decode("utf-8", "replace")
    m = re.search(r'component-export="SearchFeedContent"[^>]*?props="([^"]*)"', pagina)
    if not m:
        raise RuntimeError("sem dados na pagina (o Pelando mudou ou pediu verificacao)")
    deals = astro(json.loads(html.unescape(m.group(1))))["initialData"]["deals"]["deals"]
    return [enxuto(d) for d in deals]


def main() -> None:
    if datetime.datetime.now(datetime.timezone.utc) > FIM:
        return
    dry = "--dry" in sys.argv
    deals, erros = [], []
    for q in BUSCAS:
        try:
            deals += buscar(q)
        except Exception as e:  # uma busca falhar nao derruba as outras; a funcao alerta se todas falharem
            erros.append(f'"{q}" {type(e).__name__}: {e}'[:200])
    corpo = json.dumps({"buscas": len(BUSCAS), "erros": erros, "deals": deals}).encode("utf-8")
    url = f"{FUNCAO}?tarefa=pelando&k={chave()}" + ("&dry=1" if dry else "")
    req = urllib.request.Request(url, data=corpo, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        resposta = r.read().decode("utf-8")
    agora = datetime.datetime.now().strftime("%d/%m %H:%M:%S")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(f"{agora}\n{resposta}\n", encoding="utf-8")
    if dry or "--ver" in sys.argv:
        print(json.dumps(json.loads(resposta), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # pythonw nao tem console: o erro fica no log.
        LOG.parent.mkdir(parents=True, exist_ok=True)
        corpo = e.read().decode("utf-8", "replace")[:500] if hasattr(e, "read") else ""
        LOG.write_text(f"{datetime.datetime.now():%d/%m %H:%M:%S} ERRO\n{type(e).__name__}: {e}\n{corpo}\n", encoding="utf-8")
        raise

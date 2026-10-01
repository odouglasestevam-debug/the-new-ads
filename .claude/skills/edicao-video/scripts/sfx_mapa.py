"""Direção de som: o roteiro que o Claude lê para decidir os efeitos e o mapa que o Douglas aprova antes do render.

  python sfx_mapa.py roteiro VIDEO [--work DIR]   a edição pronta no tempo da SAÍDA: fala por trecho, cortes, cartões e pistas
  python sfx_mapa.py mapa    VIDEO [--work DIR]   depois do sfx.py: cada som com tempo, frase falada, som escolhido e motivo

Fluxo: plan/cortes/cartões prontos -> `roteiro` -> o Claude decide e escreve <work>/sfx_manual.json (com "motivo" e "frase")
-> `sfx.py` -> `mapa` -> o Douglas corta o que não quiser -> render.

As pistas do `roteiro` são só pistas (palavras de tela/app, números, chamada para ação, trecho cortado do bruto). Quem decide é
quem lê a fala, seguindo as regras de references/sfx-guia.md ("Direção de som").
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from common import load_json, work_dir_for

INTERFACE = {"tela", "telas", "app", "aplicativo", "sistema", "site", "link", "whatsapp", "instagram", "painel", "plataforma",
             "automação", "automatizado", "automático", "dados", "dashboard", "clique", "clicar", "botão", "baixar", "formulário",
             "cadastro", "notificação", "mensagem", "digitar", "digite", "online", "internet", "computador", "celular", "e-mail",
             "login", "senha", "pix", "boleto", "protocolo", "documento", "certidão", "registro"}
CTA = {"clique", "link", "fale", "chame", "agende", "salve", "compartilhe", "siga", "comente", "botão", "abaixo", "equipe"}
REVELA = {"segredo", "verdade", "único", "unico", "problema", "descobri", "resultado", "garantia", "prova", "comprova", "erro", "mentira"}


def mmss(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:04.1f}"


def pistas(texto: str, primeiro: bool, ultimo: bool) -> list[str]:
    ws = [re.sub(r"[^\wçãõáéíóúâêô@-]", "", w.lower()) for w in texto.split()]
    out = []
    if primeiro:
        out.append("GANCHO (primeira frase)")
    ach = sorted({w for w in ws if w in INTERFACE})
    if ach:
        out.append("tela/tecnologia: " + ", ".join(ach))
    if re.search(r"\d|r\$|\bmil\b|milh|por cento|%", texto.lower()):
        out.append("número/valor")
    ach = sorted({w for w in ws if w in REVELA})
    if ach:
        out.append("revelação?: " + ", ".join(ach))
    ach = sorted({w for w in ws if w in CTA})
    if ach:
        out.append("chamada para ação: " + ", ".join(ach))
    if ultimo:
        out.append("FECHAMENTO (última frase)")
    return out


def clipes(edl: dict) -> list[dict]:
    cl = edl["clips"]
    out = []
    for i, c in enumerate(cl):
        fim = cl[i + 1]["t0"] if i + 1 < len(cl) else edl["total"]
        ant = cl[i - 1] if i else None
        pulo = round(c["in"] - ant["out"], 1) if ant and not ant["cont"] else 0.0       # cont=True: emenda de zoom, sem pulo no bruto
        out.append({**c, "fim": fim, "pulo": pulo, "i": i})
    return out


def trecho_em(cs: list[dict], t: float) -> dict:
    for c in cs:
        if c["t0"] - 0.15 <= t < c["fim"] - 0.15:
            return c
    return cs[-1]


def roteiro(work: Path) -> None:
    edl = load_json(work / "edl.json")
    cs = clipes(edl)
    cards = load_json(work / "cards.json") if (work / "cards.json").exists() else []
    print(f"ROTEIRO PARA A DIREÇÃO DE SOM  ({edl['total']:.1f} s de vídeo, {len(cs)} trechos)\n")
    for c in cs:
        if c["i"] == 0:
            emenda = "início"
        elif c["pulo"] > 0.05:
            emenda = f"CORTE de fala (tirou {c['pulo']:.1f} s do bruto)"
        else:
            emenda = "emenda de zoom (mesma frase)"
        zoom = f"zoom {c.get('zoom', 1.0):.2f}"
        print(f"{mmss(c['t0'])}  {emenda:<42} {zoom}")
        print(f"        \"{c['text']}\"")
        p = pistas(c["text"], c["i"] == 0, c["i"] == len(cs) - 1)
        if p:
            print("        pistas: " + " | ".join(p))
    if cards:
        print("\nCARTÕES (cada um já toca o próprio som; não duplicar):")
        for k in cards:
            nome = k.get("texto") or k.get("titulo") or k.get("rotulo") or ""
            print(f"  {mmss(float(k['de']))} a {mmss(float(k.get('ate', k['de'])))}  {k['tipo']}  {nome.replace(chr(92) + 'N', ' ')}")
    print("\nPara decidir: transicao = virada de assunto; interface = fala cita tela/app/sistema ou entra cartão; "
          "cinematico = revelação principal e fechamento (até 2); meme = desligado.")


def mapa(work: Path) -> None:
    ev = load_json(work / "sfx_events.json") if (work / "sfx_events.json").exists() else []
    ign = load_json(work / "sfx_ignorados.json") if (work / "sfx_ignorados.json").exists() else []
    edl = load_json(work / "edl.json")
    cs = clipes(edl)
    linhas = [f"MAPA DE SONS  ({len(ev)} efeitos em {edl['total']:.1f} s)", ""]
    for e in ev:
        c = trecho_em(cs, e["t"])
        frase = e.get("frase") or c["text"]
        motivo = e.get("motivo") or {"corte": "corte de fala", "zoom": "emenda de zoom", "card": "cartão na tela",
                                      "palavra-chave": "palavra-chave"}.get(e["origem"], e["origem"])
        linhas.append(f"{mmss(e['t'])}  {e['id'] or e['tipo']:<16} {motivo}")
        linhas.append(f"        \"{frase}\"")
    if ign:
        linhas += ["", "NÃO ENTRARAM (guarda-corpo):"]
        for g in ign:
            linhas.append(f"{mmss(g['t'])}  {g['tipo']:<16} {g['motivo_ignorado']}")
    txt = "\n".join(linhas) + "\n"
    (work / "sfx_mapa.txt").write_text(txt, encoding="utf-8")
    print(txt)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("modo", choices=["roteiro", "mapa"])
    ap.add_argument("video")
    ap.add_argument("--work")
    a = ap.parse_args()
    work = work_dir_for(Path(a.video).resolve(), a.work)
    roteiro(work) if a.modo == "roteiro" else mapa(work)


if __name__ == "__main__":
    main()

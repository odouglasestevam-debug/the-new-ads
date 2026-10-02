"""Elementos gráficos que contam a história: cartões e telas tipográficas (ASS vetorial, sem imagem).

Portado da edição manual do vídeo de IPTU da Regularize e generalizado. O conteúdo de cada cartão é escolha
editorial (o que mostrar e quando), então vem de um arquivo de especificação com tempos do VÍDEO FINAL:

  <pasta de trabalho>/cards.json
  [
    {"tipo": "comentario", "de": 4.3, "ate": 11.0, "rotulo": "COMENTÁRIO QUE MAIS RECEBEMOS",
     "texto": "Eu pago IPTU, tenho água e\\Nluz no meu nome. A casa\\Né minha!", "riscar_em": 10.4},
    {"tipo": "termo", "de": 24.5, "ate": 27.0, "kicker": "O ÚNICO DOCUMENTO QUE PROVA", "texto": "Matrícula"},
    {"tipo": "lista", "de": 32.0, "ate": 40.0, "titulo": "ISSO PODE CAUSAR:", "icone": "x",
     "itens": [{"t": 33.1, "texto": "Dificuldade de venda"}, {"t": 35.0, "texto": "Desvalorização do imóvel"}]},
    {"tipo": "tipografia", "de": 27.0, "ate": 29.4, "tamanho": 150,
     "palavras": [{"t": 27.0, "texto": "Enquanto não\\N"}, {"t": 27.9, "texto": "a possuir,", "ouro": true}]}
  ]

Use `python cards.py VIDEO --tempos` para ver o instante de cada palavra no vídeo final.
A tela tipográfica cobre a imagem (use quando ela olha para baixo falando) e a legenda some enquanto ela está no ar.
Gera <work>/cards.ass, que o render aplica por cima da imagem e por baixo da legenda.
Cores e fontes: accent do perfil do cliente; cartão escuro #141414; X vermelho.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from common import (FONTS_DIR, ass_bgr, clip_of, font_available, load_json, load_presets, merge_profile, probe,
                    src_to_out, ts, work_dir_for)
from render_geometry import target_size

RED = "&H3C3CE0&"
DARK = "&H141414&"


def rrect(w: float, h: float, r: float) -> str:
    k = r * 0.45
    return (f"m {r} 0 l {w - r} 0 b {w - k} 0 {w} {k} {w} {r} l {w} {h - r} b {w} {h - k} {w - k} {h} {w - r} {h} l {r} {h} "
            f"b {k} {h} 0 {h - k} 0 {h - r} l 0 {r} b 0 {k} {k} 0 {r} 0")


def CA(c: dict, txt: str) -> str:
    """Texto de destaque sempre em caixa alta (Douglas, 01/10/2026). Só o comentário citado (cartão "comentario")
    fica como foi escrito, porque imita uma mensagem real; "caixa_alta": false no cartão desliga."""
    return txt.upper() if c.get("caixa_alta", True) else txt


def fade_out(st: float, en: float, d: float = 0.25) -> str:
    return f"\\t({int(max(en - st - d, 0) * 1000)},{int((en - st) * 1000)},\\alpha&HFF&)"


XMARK = "m 0 6 l 6 0 l 22 16 l 38 0 l 44 6 l 28 22 l 44 38 l 38 44 l 22 28 l 6 44 l 0 38 l 16 22"
CHECK = "m 0 24 l 8 16 l 18 26 l 38 2 l 46 10 l 18 42"


def build(spec: list[dict], W: int, H: int, accent: str, fonts: dict) -> list[str]:
    ev: list[str] = []
    s = W / 1080
    P = lambda v: int(round(v * s))
    for c in spec:
        de, ate = float(c["de"]), float(c["ate"])
        cy = int(H * float(c.get("y", 0.225)))
        fo = fade_out(de, ate)
        kind = c["tipo"]
        if kind == "comentario":
            BW, BH = P(940), P(300)
            bx, by = (W - BW) // 2, cy - BH // 2
            ev.append(f"Dialogue: 3,{ts(de)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos({bx},{by})\\p1\\c&HFFFFFF&\\bord0\\shad6\\4c&H000000&\\4a&H90&"
                      f"\\alpha&HFF&\\t(0,200,\\alpha&H00&){fo}}}{rrect(BW, BH, P(34))}{{\\p0}}")
            ev.append(f"Dialogue: 4,{ts(de)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos({bx + P(40)},{by + P(38)})\\p1\\c&HC8C8C8&\\bord0\\shad0\\alpha&HFF&"
                      f"\\t(0,200,\\alpha&H00&){fo}\\fscx{P(100)}\\fscy{P(100)}}}m 32 0 b 50 0 64 14 64 32 b 64 50 50 64 32 64 b 14 64 0 50 0 32 b 0 14 14 0 32 0{{\\p0}}")
            ev.append(f"Dialogue: 4,{ts(de)},{ts(ate)},CmtLbl,,0,0,0,,{{\\an7\\pos({bx + P(124)},{by + P(44)})\\alpha&HFF&\\t(0,200,\\alpha&H00&){fo}}}{CA(c, c.get('rotulo', 'COMENTÁRIO'))}")
            ev.append(f"Dialogue: 4,{ts(de + 0.15)},{ts(ate)},Cmt,,0,0,0,,{{\\an7\\pos({bx + P(124)},{by + P(104)})\\alpha&HFF&\\t(0,220,\\alpha&H00&){fo}}}{c['texto']}")
            if c.get("riscar_em") is not None:
                t_r = float(c["riscar_em"])
                ev.append(f"Dialogue: 5,{ts(t_r)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos({bx + P(30)},{by + P(175)})\\p1\\c{RED}\\bord0\\shad0\\fscx0"
                          f"\\t(0,220,\\fscx100){fade_out(t_r, ate)}}}m 0 -4 l {BW - P(60)} -4 l {BW - P(60)} 4 l 0 4{{\\p0}}")
        elif kind == "termo":
            BW, BH = P(800), P(290)
            ev.append(f"Dialogue: 3,{ts(de)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos({(W - BW) // 2},{cy - BH // 2})\\p1\\c{DARK}\\alpha&H0A&\\3c{accent}\\bord2\\shad0"
                      f"\\fscx96\\fscy96\\t(0,200,\\fscx100\\fscy100){fo}}}{rrect(BW, BH, P(36))}{{\\p0}}")
            ev.append(f"Dialogue: 4,{ts(de)},{ts(ate)},Kick,,0,0,0,,{{\\an5\\move({W // 2},{cy - P(70)},{W // 2},{cy - P(84)},0,300)\\alpha&HFF&\\t(0,220,\\alpha&H00&){fo}}}{CA(c, c['kicker'])}")
            ev.append(f"Dialogue: 4,{ts(de + 0.05)},{ts(ate)},Serif,,0,0,0,,{{\\an5\\move({W // 2},{cy + P(48)},{W // 2},{cy + P(24)},0,320)\\alpha&HFF&\\t(0,240,\\alpha&H00&)"
                      f"\\fscx94\\fscy94\\t(0,320,\\fscx100\\fscy100){fo}}}{CA(c, c['texto'])}")
            ev.append(f"Dialogue: 4,{ts(de + 0.3)},{ts(ate)},Shape,,0,0,0,,{{\\an5\\pos({W // 2},{cy + P(112)})\\p1\\c{accent}\\bord0\\shad0\\fscx0\\t(0,420,\\fscx100){fo}}}m 0 0 l {P(340)} 0 l {P(340)} 5 l 0 5{{\\p0}}")
        elif kind == "lista":
            itens = c["itens"]
            BW, BH = P(900), P(150 + 100 * len(itens) + 30)
            lx, ly = (W - BW) // 2, cy - BH // 2 + P(30)
            ev.append(f"Dialogue: 3,{ts(de)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos({lx},{ly})\\p1\\c{DARK}\\alpha&H0A&\\3c{accent}\\bord2\\shad0"
                      f"\\alpha&HFF&\\t(0,200,\\alpha&H0A&){fo}}}{rrect(BW, BH, P(36))}{{\\p0}}")
            ev.append(f"Dialogue: 4,{ts(de)},{ts(ate)},Kick,,0,0,0,,{{\\an5\\move({W // 2},{ly + P(72)},{W // 2},{ly + P(62)},0,250)\\alpha&HFF&\\t(0,200,\\alpha&H00&){fo}}}{CA(c, c['titulo'])}")
            icon, icol = (CHECK, accent) if c.get("icone") == "check" else (XMARK, RED)
            for k, it in enumerate(itens):
                yy = ly + P(150 + k * 100)
                t_i = float(it["t"])
                f2 = fade_out(t_i, ate)
                ev.append(f"Dialogue: 4,{ts(t_i)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos({lx + P(60)},{yy - P(22)})\\p1\\c{icol}\\bord0\\shad0\\fscx40\\fscy40"
                          f"\\t(0,160,\\fscx105\\fscy105)\\t(160,240,\\fscx100\\fscy100){f2}}}{icon}{{\\p0}}")
                ev.append(f"Dialogue: 4,{ts(t_i)},{ts(ate)},Item,,0,0,0,,{{\\an4\\move({lx + P(150)},{yy},{lx + P(130)},{yy},0,220)\\alpha&HFF&\\t(0,200,\\alpha&H00&){f2}}}{CA(c, it['texto'])}")
        elif kind == "tipografia":
            size = P(c.get("tamanho", 150))
            nlines = sum(p["texto"].count("\\N") for p in c["palavras"]) + 1
            top = int(H * 0.40 - max(0, nlines - 2) * size * 1.1)
            full = f"m 0 0 l {W} 0 l {W} {H} l 0 {H}"
            ev.append(f"Dialogue: 8,{ts(de)},{ts(ate)},Shape,,0,0,0,,{{\\an7\\pos(0,0)\\p1\\c{DARK}\\bord0\\shad0\\alpha&H40&\\t(0,70,\\alpha&H00&)}}{full}{{\\p0}}")
            ev.append(f"Dialogue: 9,{ts(de)},{ts(ate)},Shape,,0,0,0,,{{\\an5\\pos({W // 2},{top - P(58)})\\p1\\c{accent}\\bord0\\shad0\\fscx0\\t(0,300,\\fscx100)}}m 0 0 l {P(160)} 0 l {P(160)} 5 l 0 5{{\\p0}}")
            txt = ""
            for p in c["palavras"]:
                ms = int((float(p["t"]) - de) * 1000)
                col = accent if p.get("ouro") else "&HFFFFFF&"
                txt += f"{{\\c{col}\\alpha&HFF&\\t({ms},{ms + 140},\\alpha&H00&)}}{CA(c, p['texto'])}"
            ev.append(f"Dialogue: 9,{ts(de)},{ts(ate)},Serif,,0,0,0,,{{\\an8\\pos({W // 2},{top})\\fs{size}}}{txt}")
        else:
            raise SystemExit(f"Tipo de cartão desconhecido: {kind}")
    return ev


def tempos(work: Path) -> None:
    edl = load_json(work / "edl.json")
    words = load_json(work / "words.json")["words"]
    corr = {}
    if (work / "correcoes.json").exists():
        corr = load_json(work / "correcoes.json")
    line, t0 = [], None
    for i, w in enumerate(words):
        t = src_to_out(edl, (w["s"] + w["e"]) / 2)
        if t is None:
            continue
        txt = corr.get(w["w"].strip(".,?!"), w["w"])
        if t0 is None:
            t0 = t
        line.append(f"{txt}@{t:.1f}")
        if w["w"][-1] in ".?!":
            print(f"[{t0:5.1f}] " + " ".join(line))
            line, t0 = [], None
    if line:
        print(f"[{t0:5.1f}] " + " ".join(line))
    print(f"\nduração total: {edl['total']:.1f}s | cortes (emendas) em:",
          ", ".join(f"{c['t0']:.1f}" for c in edl["clips"][1:]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--profile")
    ap.add_argument("--segmento", default="padrao")
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--tempos", action="store_true", help="mostra o instante de cada palavra no vídeo final")
    a = ap.parse_args()

    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    if a.tempos:
        tempos(work)
        return
    spec_path = work / "cards.json"
    if not spec_path.exists():
        raise SystemExit(f"Falta {spec_path}. Rode --tempos e escreva o cards.json (ver o topo de cards.py).")
    P = load_presets()
    profile = load_json(a.profile) if a.profile else {}
    cfg = merge_profile(P["segmentos"].get(profile.get("segmento") or a.segmento, P["segmentos"]["padrao"]), profile)
    info = probe(video)
    W, H = target_size(info["w"], info["h"], a.aspect)
    accent = ass_bgr(cfg["accent"])
    sans, serif = "Poppins ExtraBold", "DM Serif Display"
    semi = "Poppins SemiBold"
    for fam in (sans, semi, serif):
        if not font_available(fam):
            raise SystemExit(f"Fonte '{fam}' não encontrada. Rode: python fetch_assets.py")
    s = W / 1080
    sz = lambda v: int(round(v * s))
    bg = "&H00000000"
    acc = "&H00" + accent[2:-1]
    styles = (
        f"Style: Shape,Arial,20,&H00FFFFFF,&H00FFFFFF,{acc},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n"
        f"Style: Kick,{sans},{sz(38)},&H00FFFFFF,&H00FFFFFF,{bg},{bg},-1,0,0,0,100,100,5,0,1,0,0,5,0,0,0,1\n"
        f"Style: Serif,{serif},{sz(150)},{acc},&H00FFFFFF,{bg},&H64000000,0,0,0,0,100,100,1,0,1,0,3,5,0,0,0,1\n"
        f"Style: CmtLbl,{sans},{sz(32)},&H00808080,&H00FFFFFF,{bg},{bg},-1,0,0,0,100,100,3,0,1,0,0,7,0,0,0,1\n"
        f"Style: Cmt,{semi},{sz(56)},&H00202020,&H00FFFFFF,{bg},{bg},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n"
        f"Style: Item,{sans},{sz(54)},&H00FFFFFF,&H00FFFFFF,{bg},{bg},-1,0,0,0,100,100,0,0,1,0,0,4,0,0,0,1\n"
    )
    header = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
              "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
              "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
              + styles + "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    spec = load_json(spec_path)
    ev = build(spec, W, H, accent, P["fonts"])
    (work / "cards.ass").write_text(header + "\n".join(ev) + "\n", encoding="utf-8")
    print(f"cards: {len(spec)} elementos ({', '.join(c['tipo'] for c in spec)}) -> {work / 'cards.ass'}")


_ = (FONTS_DIR, clip_of)

if __name__ == "__main__":
    main()

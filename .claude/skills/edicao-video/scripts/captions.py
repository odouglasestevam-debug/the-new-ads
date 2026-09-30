"""Gera as legendas animadas (subs.ass) na linha do tempo FINAL, já com os cortes.

Estilos: highlight (palavra falada acende), pop, karaoke, bounce, impacto.
Regras herdadas da auditoria:
  - PlayRes = tamanho real do vídeo de saída (senão o tamanho da fonte sai errado em vertical);
  - legenda entra por último no render, depois de qualquer overlay;
  - posição dentro da zona segura de Reels/TikTok/Shorts (interface cobre o rodapé e o topo);
  - fonte que não existe é erro, não "quase Arial" em silêncio;
  - sem travessão em nenhum texto.

Uso: python captions.py VIDEO [--work DIR] [--style highlight] [--profile perfil.json]
        [--segmento imobiliaria_construcao] [--accent "#E0B84A"] [--font "Poppins Black"]
        [--keywords palavras.json | "IPTU,matrícula"] [--hook "TEXTO DO GANCHO"] [--aspect 9:16]
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

from common import (FONTS_DIR, ass_bgr, clean_text, clip_of, font_available, hex_to_ass, load_json,
                    load_presets, merge_profile, norm, probe, save_json, ts, work_dir_for)
from render_geometry import target_size


def load_profile(path: str | None) -> dict:
    return load_json(path) if path else {}


def resolve_keywords(arg, words: list[dict], extra: list[str]) -> set[int]:
    """Índices (em words) das palavras-chave. Aceita lista de textos ou de índices."""
    wanted_txt, wanted_idx = set(), set()
    items = []
    if arg:
        p = Path(arg)
        items = load_json(p) if p.exists() else [x.strip() for x in arg.split(",") if x.strip()]
    for it in list(items) + list(extra or []):
        if isinstance(it, int):
            wanted_idx.add(it)
        else:
            wanted_txt.add(norm(str(it)))
    out = set(wanted_idx)
    for i, w in enumerate(words):
        n = norm(w["w"])
        if n and n in wanted_txt:
            out.add(i)
        elif re.search(r"\d", w["w"]) or "%" in w["w"] or w["w"].startswith("R$"):
            out.add(i)                                   # números e valores sempre destacam
    return out


def text_width(font_file: Path | None, size: float, text: str) -> float:
    try:
        from PIL import ImageFont
        if font_file and font_file.exists():
            return ImageFont.truetype(str(font_file), max(8, int(size))).getlength(text)
    except Exception:
        pass
    return len(text) * size * 0.66


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--profile", help="perfil-edicao.json do cliente")
    ap.add_argument("--segmento", default="padrao")
    ap.add_argument("--style")
    ap.add_argument("--accent")
    ap.add_argument("--font")
    ap.add_argument("--hook-font")
    ap.add_argument("--uppercase", choices=["sim", "nao"])
    ap.add_argument("--keywords", help="arquivo .json (lista de textos ou índices) ou 'IPTU,matrícula'")
    ap.add_argument("--hook", help="texto do gancho nos primeiros segundos (use \\n para quebrar linha)")
    ap.add_argument("--hook-dur", type=float, default=2.6)
    ap.add_argument("--hook-pos", type=float, help="altura do gancho (0 a 1). Padrão 0.16; olhe um quadro e fuja de logo e rosto")
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--pos", type=float, help="altura da legenda (0 a 1 da tela). Padrão: 0.62 vertical")
    a = ap.parse_args()

    P = load_presets()
    profile = load_profile(a.profile)
    seg = profile.get("segmento") or a.segmento
    cfg = merge_profile(P["segmentos"].get(seg, P["segmentos"]["padrao"]), profile)
    for k, v in (("caption_style", a.style), ("accent", a.accent), ("font", a.font), ("hook_font", a.hook_font)):
        if v:
            cfg[k] = v
    if a.uppercase:
        cfg["uppercase"] = a.uppercase == "sim"
    st = dict(P["caption_styles"][cfg["caption_style"]])

    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    edl = load_json(work / "edl.json")
    wj = load_json(work / "words.json")["words"]
    info = probe(video)
    W, H = target_size(info["w"], info["h"], a.aspect)
    vertical = H > W * 1.2

    # fontes: precisam existir de verdade
    for fam in {cfg["font"], cfg.get("hook_font") or cfg["font"]}:
        if not font_available(fam):
            raise SystemExit(f"Fonte '{fam}' não encontrada. Rode: python fetch_assets.py "
                             f"(ou coloque o .ttf em {FONTS_DIR})")
    fmeta = P["fonts"].get(cfg["font"], {})
    font_file = FONTS_DIR / fmeta["file"] if fmeta.get("file") else None

    # palavras que sobreviveram aos cortes, em tempo de saída
    dropped = {round(d["s"], 3) for d in edl.get("dropped_words", [])}
    words = []
    for i, w in enumerate(wj):
        if round(w["s"], 3) in dropped:
            continue
        mid = (w["s"] + w["e"]) / 2
        c = clip_of(edl, mid)
        if not c:
            continue
        s_out = c["t0"] + max(w["s"], c["in"]) - c["in"]
        e_out = c["t0"] + min(w["e"], c["out"]) - c["in"]
        if e_out - s_out < 0.04:
            e_out = s_out + 0.04
        words.append({"i": i, "w": w["w"], "s": s_out, "e": e_out, "clip": c, "hard": (not c["cont"])})
    kw_idx = resolve_keywords(a.keywords, [{"w": x["w"]} for x in wj], profile.get("palavras_destaque"))
    for x in words:
        x["key"] = x["i"] in kw_idx

    # ------------------------------------------------------------ agrupamento em linhas
    def shown(w) -> str:
        t = clean_text(w["w"])
        t = re.sub(r"[.,;:]+$", "", t)
        return t.upper() if cfg["uppercase"] else t

    groups, cur = [], []
    for k, w in enumerate(words):
        cur.append(w)
        nxt = words[k + 1] if k + 1 < len(words) else None
        txt = " ".join(shown(x) for x in cur)
        end_punct = w["w"][-1] in ".?!" or (w["w"][-1] == "," and len(cur) >= 2)
        big_gap = nxt is not None and nxt["s"] - w["e"] > 0.30
        cut_after = w["clip"] is not (nxt["clip"] if nxt else None) and w["clip"]["cont"] is False
        if (nxt is None or len(cur) >= st["group_words"] or len(txt) >= st["max_chars"]
                or end_punct or big_gap or cut_after):
            groups.append(cur)
            cur = []

    # ------------------------------------------------------------ geometria
    base = W if H >= W else H * 0.75
    size = round(base * st["font_scale"] * P["fonts"].get(cfg["font"], {}).get("size", 1.0))
    outline = round(size * st["outline"], 1)
    shadow = round(size * st["shadow"], 1)
    y_frac = a.pos if a.pos else (0.62 if vertical else (0.72 if abs(H - W) < 10 else 0.80))
    if vertical and not (0.40 <= y_frac <= 0.72):
        print(f"AVISO: legenda em {y_frac:.0%} da altura cai na zona coberta pela interface do Reels/TikTok (segura: 40% a 72%).")
    X, Y = W // 2, int(H * y_frac)
    accent, WHITE = ass_bgr(cfg["accent"]), "&HFFFFFF&"
    karaoke = st["mode"] == "karaoke"
    bold = P["fonts"].get(cfg["font"], {}).get("bold", 0)
    hook_font = cfg.get("hook_font") or cfg["font"]

    def fit(text: str) -> int:
        """Tamanho da fonte para a linha caber em 88% da largura."""
        w = text_width(font_file, size, text) + 2 * outline
        return size if w <= W * 0.88 else int(size * W * 0.88 / w)

    ev, preview = [], []
    for gi, g in enumerate(groups):
        g_start = g[0]["s"]
        nxt_start = groups[gi + 1][0]["s"] if gi + 1 < len(groups) else None
        g_end = min(g[-1]["e"] + 0.45, nxt_start) if nxt_start is not None else g[-1]["e"] + 0.45
        g_end = max(g_end, g_start + 0.10)
        line = " ".join(shown(x) for x in g)
        fs = fit(line)
        fs_tag = f"\\fs{fs}" if fs != size else ""
        preview.append(f"{g_start:6.2f}  {line}")
        pos = f"\\an5\\pos({X},{Y})"

        if st["mode"] == "highlight":
            carry = None
            for wi, w in enumerate(g):
                s_ = g_start if wi == 0 else w["s"]
                e_ = g[wi + 1]["s"] if wi + 1 < len(g) else g_end
                if carry is not None:
                    s_, carry = carry, None
                if e_ - s_ < 0.07 and wi + 1 < len(g):      # palavra rápida demais: o destaque passa direto para a próxima
                    carry = s_
                    continue
                parts = []
                for wj_, x in enumerate(g):
                    t = shown(x)
                    if wj_ == wi:
                        sc = st["active_scale"] + (8 if x["key"] else 0)      # palavra-chave pula mais
                        parts.append(f"{{\\c{accent}\\fscx86\\fscy86\\t(0,{st['pop_ms']},\\fscx{sc}\\fscy{sc})}}"
                                     f"{t}{{\\c{WHITE}\\fscx100\\fscy100}}")
                    elif x["key"]:
                        parts.append(f"{{\\c{accent}}}{t}{{\\c{WHITE}}}")      # palavra-chave fica acesa
                    else:
                        parts.append(t)
                ev.append(f"Dialogue: 0,{ts(s_)},{ts(e_)},Cap,,0,0,0,,{{{pos}{fs_tag}}}" + " ".join(parts))
        elif st["mode"] == "karaoke":
            parts = []
            for wi, w in enumerate(g):
                nxt_w = g[wi + 1]["s"] if wi + 1 < len(g) else w["e"]
                cs = max(1, int(round((nxt_w - w["s"]) * 100)))
                parts.append(f"{{\\kf{cs}}}{shown(w)}")
            ev.append(f"Dialogue: 0,{ts(g_start)},{ts(g_end)},Cap,,0,0,0,,{{{pos}{fs_tag}}}" + " ".join(parts))
        else:  # pop, bounce, impacto
            parts = []
            for x in g:
                t = shown(x)
                if x["key"]:
                    ks = st.get("key_scale", 110)
                    parts.append(f"{{\\c{accent}\\fscx{ks}\\fscy{ks}}}{t}{{\\c{WHITE}\\fscx100\\fscy100}}")
                else:
                    parts.append(t)
            if st["mode"] == "bounce":
                anim = (f"\\an5\\move({X},{Y + 38},{X},{Y},0,130)\\fscx70\\fscy70"
                        f"\\t(0,110,\\fscx116\\fscy116)\\t(110,200,\\fscx100\\fscy100)")
            else:
                anim = f"{pos}\\fscx82\\fscy82\\t(0,{st['pop_ms']},\\fscx100\\fscy100)"
            ev.append(f"Dialogue: 0,{ts(g_start)},{ts(g_end)},Cap,,0,0,0,,{{{anim}{fs_tag}}}" + " ".join(parts))

    # ------------------------------------------------------------ gancho (texto do topo)
    hook_style = ""
    if a.hook:
        hs = round(base * 0.072 * P["fonts"].get(hook_font, {}).get("size", 1.0))
        hy = int(H * (a.hook_pos if a.hook_pos else (0.16 if vertical else 0.12)))
        lines = a.hook.replace("\\n", "\n").split("\n")
        txt = "\\N".join(clean_text(x).upper() for x in lines)
        he = min(a.hook_dur, edl["total"] * 0.4)
        ev.append(f"Dialogue: 3,{ts(0.15)},{ts(he)},Hook,,0,0,0,,{{\\an5\\pos({X},{hy})\\fad(160,260)"
                  f"\\fscx90\\fscy90\\t(0,180,\\fscx100\\fscy100)}}{txt}")
        bar_y = hy + int(hs * (0.62 * len(lines) + 0.30))
        ev.append(f"Dialogue: 3,{ts(0.25)},{ts(he)},Hook,,0,0,0,,{{\\an5\\pos({X},{bar_y})\\p1\\c{accent}\\bord0\\shad0"
                  f"\\fscx0\\t(0,320,\\fscx100)\\fad(0,260)}}m 0 0 l 170 0 l 170 6 l 0 6{{\\p0}}")
        hook_style = (f"Style: Hook,{hook_font},{hs},{accent.replace('&H', '&H00').rstrip('&')},&H00FFFFFF,"
                      f"&H00000000,&H96000000,{P['fonts'].get(hook_font, {}).get('bold', 0)},0,0,0,100,100,2,0,1,"
                      f"{round(hs * 0.06, 1)},{round(hs * 0.03, 1)},5,60,60,0,1\n")

    primary, secondary = ("&H00" + accent[2:-1], "&H00FFFFFF") if karaoke else ("&H00FFFFFF", "&H00FFFFFF")
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{cfg['font']},{size},{primary},{secondary},&H00000000,&H96000000,{bold},0,0,0,100,100,1,0,1,{outline},{shadow},5,60,60,0,1
{hook_style}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    out = work / "subs.ass"
    out.write_text(header + "\n".join(ev) + "\n", encoding="utf-8")
    save_json(work / "captions.json", {"style": cfg["caption_style"], "font": cfg["font"], "accent": cfg["accent"],
                                       "size": [W, H], "groups": len(groups), "keywords": sorted(kw_idx)})
    print(f"legendas: {len(groups)} linhas, estilo {cfg['caption_style']}, fonte {cfg['font']} {size}px, "
          f"destaque {cfg['accent']}, {len(kw_idx)} palavras-chave, tela {W}x{H}")
    for p_ in preview[:14]:
        print("  ", p_)
    if len(preview) > 14:
        print(f"   ... +{len(preview) - 14} linhas")
    print(f"salvo: {out}")


_ = hex_to_ass

if __name__ == "__main__":
    main()

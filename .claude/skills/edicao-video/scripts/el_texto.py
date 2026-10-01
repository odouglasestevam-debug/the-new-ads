"""Texto renderizado em imagem (PIL) para os elementos de cena: título com brilho, contorno, marca-texto,
pares de fonte (pesada + serifada itálica), desfoque de fundo. Tudo vira camada RGBA pré-multiplicada (float32),
que o elementos.py anima, põe atrás da pessoa, deita em perspectiva ou prende na cena.

Linha (dentro de "linhas" de um elemento):
  {"texto": "sabe", "fonte": "pesada", "tam": 0.30, "cor": "#F2C200", "brilho": 0.8,
   "contorno": false, "marca": null, "sublinhado": null, "desfoque": 0, "sombra": 0.4,
   "espaco": 0, "dx": 0, "dy": 0, "alinhar": "centro", "t": null, "entrada": null, "caixa_alta": false}
tam = tamanho da fonte em fração da LARGURA do vídeo (0.30 = 30% de 1080 = 324 px).
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from common import FONTS_DIR, clean_text, load_presets

APELIDOS = {
    "pesada": "Archivo Black",          # título de impacto ("sabe", "perspectiva", "TEXTO")
    "condensada": "Anton",
    "serif": "Instrument Serif",        # legenda editorial, parte fina do par
    "serif_italic": "Instrument Serif Italic",
    "larga": "Krona One",               # gancho extra-largo em caixa alta (ref1)
    "marcador": "Kalam",                # quadro branco
    "fina": "Barlow Condensed Light",   # "saiba mais"
    "fina_pesada": "Barlow Condensed ExtraBold",
    "poppins": "Poppins ExtraBold",
    "poppins_semi": "Poppins SemiBold",
    "poppins_black": "Poppins Black",
    "dm_serif": "DM Serif Display",
    "bebas": "Bebas Neue",
}


def hex_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


@lru_cache(maxsize=None)
def font_file(nome: str) -> str:
    fam = APELIDOS.get(nome, nome)
    meta = load_presets()["fonts"].get(fam)
    if not meta or not meta.get("file") or not (FONTS_DIR / meta["file"]).exists():
        raise SystemExit(f"Fonte '{nome}' ({fam}) não encontrada em fonts/. Rode: python fetch_assets.py. "
                         f"Apelidos: {', '.join(APELIDOS)}")
    return str(FONTS_DIR / meta["file"])


@lru_cache(maxsize=256)
def font(nome: str, px: int):
    from PIL import ImageFont
    return ImageFont.truetype(font_file(nome), max(6, int(px)))


def _mask(txt: str, f, espaco_px: float, stroke: int = 0) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Máscara 0..1 do texto (com stroke opcional) e a caixa (x0, y0, x1, y1) da tinta dentro dela."""
    from PIL import Image, ImageDraw
    asc, desc = f.getmetrics()
    if espaco_px:
        widths = [f.getlength(c) for c in txt]
        w = int(sum(widths) + espaco_px * max(0, len(txt) - 1)) + 4 * stroke + 8
    else:
        widths = None
        w = int(f.getlength(txt)) + 4 * stroke + 8
    h = asc + desc + 4 * stroke + 8
    im = Image.new("L", (max(w, 1), max(h, 1)), 0)
    d = ImageDraw.Draw(im)
    x0 = 2 * stroke + 4
    if widths:
        x = x0
        for c, cw in zip(txt, widths):
            d.text((x, 2 * stroke + 4), c, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
            x += cw + espaco_px
    else:
        d.text((x0, 2 * stroke + 4), txt, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
    a = np.asarray(im, dtype=np.float32) / 255
    ys, xs = np.nonzero(a > 0.02)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1) if len(xs) else (0, 0, 1, 1)
    return a, box


class Linha:
    """Uma linha pronta: camadas 'fundo' (marca-texto, sublinhado) e 'frente' (brilho + texto), pré-multiplicadas.

    Coordenadas internas: a tinta do texto ocupa (tx, ty, tx+tw, ty+th) dentro da imagem.
    """

    def __init__(self, spec: dict, W: int):
        s = dict(spec)
        txt = clean_text(str(s.get("texto", "")))
        if s.get("caixa_alta"):
            txt = txt.upper()
        self.spec, self.txt = s, txt
        px = max(8, int(round(float(s.get("tam", 0.08)) * W)))
        f = font(s.get("fonte", "pesada"), px)
        esp = float(s.get("espaco", 0)) * px
        cor = np.array(hex_rgb(s.get("cor", "#FFFFFF")), np.float32)
        contorno = s.get("contorno")
        if contorno:
            sw = max(1, int(round((0.035 if contorno is True else float(contorno)) * px)))
            full, box = _mask(txt, f, esp, sw)
            fill, _ = _mask(txt, f, esp, 0)
            off = sw                                    # o stroke acrescenta sw de cada lado: recentrar a versão sem stroke
            pad = np.zeros_like(full)
            hh, ww = fill.shape
            pad[off:off + hh, off:off + ww] = fill[:pad.shape[0] - off, :pad.shape[1] - off]
            alpha = np.clip(full - pad, 0, 1)
        else:
            alpha, box = _mask(txt, f, esp, 0)
            borda = s.get("borda")
            if borda:                                   # texto cheio com borda de outra cor
                sw = max(1, int(round(float(borda.get("largura", 0.04)) * px)))
                full, box = _mask(txt, f, esp, sw)
                hh, ww = alpha.shape
                a2 = np.zeros_like(full)
                a2[sw:sw + hh, sw:sw + ww] = alpha[:full.shape[0] - sw, :full.shape[1] - sw]
                self._borda = (full, np.array(hex_rgb(borda.get("cor", "#000000")), np.float32))
                alpha = a2
        # margem para brilho / desfoque / marca
        glow = float(s.get("brilho", 0) or 0)
        blur = float(s.get("desfoque", 0) or 0)
        m = int(px * (0.55 if glow else 0.18) + blur * px * 2.5) + 6
        H0, W0 = alpha.shape
        HH, WW = H0 + 2 * m, W0 + 2 * m
        A = np.zeros((HH, WW), np.float32)
        A[m:m + H0, m:m + W0] = alpha
        x0, y0, x1, y1 = box
        self.tx, self.ty, self.tw, self.th = x0 + m, y0 + m, x1 - x0, y1 - y0
        self.px = px
        front = np.zeros((HH, WW, 4), np.float32)
        import cv2
        if glow:
            gcol = np.array(hex_rgb(s.get("cor_brilho", s.get("cor", "#FFFFFF"))), np.float32)
            g1 = cv2.GaussianBlur(A, (0, 0), px * 0.16) * min(1.0, glow * 1.1)
            g2 = cv2.GaussianBlur(A, (0, 0), px * 0.05) * min(1.0, glow * 0.9)
            g = np.clip(g1 + g2, 0, 1)
            front[..., :3] += gcol * g[..., None]
            front[..., 3] = np.maximum(front[..., 3], g)
        sh = float(s.get("sombra", 0) or 0)
        if sh:
            k = int(px * 0.03) + 1
            S = np.roll(np.roll(cv2.GaussianBlur(A, (0, 0), px * 0.06), k, 0), k, 1) * sh
            front = front * (1 - S[..., None] * 0) + 0                       # sombra preta: só alpha
            front[..., 3] = np.clip(front[..., 3] + S * (1 - front[..., 3]), 0, 1)
        if getattr(self, "_borda", None) is not None:
            bfull, bcol = self._borda
            B = np.zeros((HH, WW), np.float32)
            B[m:m + bfull.shape[0], m:m + bfull.shape[1]] = bfull
            front[..., :3] = front[..., :3] * (1 - B[..., None]) + bcol * B[..., None]
            front[..., 3] = B + front[..., 3] * (1 - B)
        front[..., :3] = front[..., :3] * (1 - A[..., None]) + cor * A[..., None]
        front[..., 3] = A + front[..., 3] * (1 - A)
        if blur:
            front = cv2.GaussianBlur(front, (0, 0), blur * px)
        op = float(s.get("opacidade", 1))
        self.front = front * op
        # fundo: marca-texto e sublinhado
        back = np.zeros_like(front)
        mc = s.get("marca")
        if mc:
            col = np.array(hex_rgb(mc), np.float32)
            ph, pv = int(px * 0.16), int(px * 0.06)
            ya, yb = max(0, self.ty - pv), min(HH, self.ty + self.th + pv)
            xa, xb = max(0, self.tx - ph), min(WW, self.tx + self.tw + ph)
            back[ya:yb, xa:xb, :3] = col
            back[ya:yb, xa:xb, 3] = 1
            self.marca_box = (xa, ya, xb, yb)
        sb = s.get("sublinhado")
        if sb:
            col = np.array(hex_rgb(sb), np.float32)
            th = max(2, int(px * 0.07))
            yy = min(HH - th, self.ty + self.th + int(px * 0.16))
            cx = self.tx + self.tw // 2
            hw = max(int(px * 0.5), int(self.tw * 0.18))
            back[yy:yy + th, cx - hw // 2:cx + hw // 2, :3] = col
            back[yy:yy + th, cx - hw // 2:cx + hw // 2, 3] = 1
            self.sub_box = (cx - hw // 2, yy, cx + hw // 2, yy + th)
        self.back = back * op if (mc or sb) else None


def bloco(linhas: list[dict], W: int, H: int, x: float, y: float, gap: float = 0.0) -> list[dict]:
    """Empilha as linhas e devolve onde cada uma vai na tela (centro do bloco em x, y; frações).

    Cada item: {"linha": Linha, "x": px canto sup. esq. da imagem, "y": ..., "spec": spec}
    """
    objs = [Linha(l, W) for l in linhas]
    if not objs:
        return []
    alturas = [o.th for o in objs]
    gaps = [float(l.get("gap", gap)) * W for l in linhas]
    total = sum(alturas) + sum(gaps[1:])
    cx, cy = x * W, y * H
    ycur = cy - total / 2
    out = []
    for k, (o, l) in enumerate(zip(objs, linhas)):
        if k:
            ycur += gaps[k]
        al = l.get("alinhar", "centro")
        lx = {"centro": cx - o.tw / 2, "esq": cx - max(p.tw for p in objs) / 2,
              "dir": cx + max(p.tw for p in objs) / 2 - o.tw}.get(al, cx - o.tw / 2)
        lx += float(l.get("dx", 0)) * W
        ly = ycur + float(l.get("dy", 0)) * W
        out.append({"linha": o, "x": int(round(lx - o.tx)), "y": int(round(ly - o.ty)), "spec": l})
        ycur += o.th
    return out

"""Quadro branco desenhado à mão, sincronizado com a fala (ref2: o céu vira lousa).

  {"tipo": "quadro", "de": 0.5, "ate": 30.0, "cor": "#151515", "fonte": "marcador", "camada": "frente",
   "camera": [{"t": 0.5, "dx": 0, "dy": 0, "escala": 1}, {"t": 14.0, "dx": -0.55, "dy": 0, "escala": 1}],
   "itens": [
     {"forma": "texto", "t": 0.6, "x": 0.5, "y": 0.07, "tam": 0.042, "texto": "O QUE EU FARIA PARA FECHAR\\nDE 2 A 3 CONTRATOS",
      "sublinhar": [{"palavra": "CONTRATOS", "t": 2.4}], "circular": [{"palavra": "2", "t": 2.0}]},
     {"forma": "seta", "t": 3.0, "de": [0.30, 0.20], "para": [0.30, 0.27], "curva": 0.15},
     {"forma": "caixa", "t": 5.0, "x": 0.75, "y": 0.25, "w": 0.22, "h": 0.09},
     {"forma": "circulo", "t": 6.0, "x": 0.5, "y": 0.4, "w": 0.3, "h": 0.06},
     {"forma": "linha", "t": 7.0, "pontos": [[0.1, 0.5], [0.4, 0.52]]},
     {"forma": "funil", "t": 8.0, "x": 0.5, "y": 0.22, "w": 0.6, "h": 0.28, "camadas": 3},
     {"forma": "imagem", "t": 9.0, "arquivo": "print.png", "x": 0.5, "y": 0.2, "largura": 0.5, "ate": 11.0}
   ]}

Coordenadas em fração da tela com a câmera parada (dx=dy=0, escala=1). A câmera anda pela lousa: dx -0.55 leva
tudo 55% da largura para a esquerda (o próximo bloco desenhado à direita, x > 1, entra na tela).
Cada item: "t" (começa a desenhar), "dur" (quanto leva para desenhar), "ate" (some), "cor", "espessura".
Cor de destaque padrão para sublinhado e círculo: vermelho marcador #E5392F; verde #2E8B3E está à mão em "cor".
"""
from __future__ import annotations

import numpy as np

from elementos import El, Imagem, ease, ease_io, entrada_params, paste, scaled

VERMELHO = "#E5392F"


def _jitter(pts: np.ndarray, amp: float, seed: int) -> np.ndarray:
    """Tremor de mão: deslocamento suave na normal do traço."""
    if len(pts) < 3 or amp <= 0:
        return pts
    rng = np.random.default_rng(seed)
    d = np.gradient(pts, axis=0)
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    s = np.linspace(0, 1, len(pts))
    off = amp * (np.sin(s * rng.uniform(5, 9) + rng.uniform(0, 6)) * 0.6 + np.sin(s * rng.uniform(13, 21)) * 0.4)
    return pts + nrm * off[:, None]


def _dense(pts: np.ndarray, step: float) -> np.ndarray:
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / n)
    return np.array(out)


def _ellipse(cx, cy, rx, ry, a0=-1.75, turns=1.06, n=90):
    th = a0 + np.linspace(0, 2 * np.pi * turns, n)
    return np.stack([cx + rx * np.cos(th), cy + ry * np.sin(th)], 1)


class Quadro(El):
    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        from el_texto import Linha, font
        self.cor = s.get("cor", "#151515")
        self.fonte = s.get("fonte", "marcador")
        self.cam = sorted(s.get("camera") or [{"t": self.de, "dx": 0, "dy": 0, "escala": 1}], key=lambda k: k["t"])
        self.itens = []
        for n, it in enumerate(s.get("itens", [])):
            f = it["forma"]
            it = dict(it)
            it["_seed"] = n * 7 + 3
            it.setdefault("t", self.de)
            it.setdefault("espessura", 0.0042)
            if f == "texto":
                tam = float(it.get("tam", 0.04))
                linhas = str(it["texto"]).replace("\\n", "\n").split("\n")
                objs = [Linha({"texto": l, "fonte": it.get("fonte", self.fonte), "tam": tam,
                               "cor": it.get("cor", self.cor)}, W) for l in linhas]
                lh = tam * W * 1.18
                y0 = float(it["y"]) * H - lh * len(objs) / 2
                lay = []
                fnt = font(it.get("fonte", self.fonte), int(tam * W))
                for k, (o, txt) in enumerate(zip(objs, linhas)):
                    al = it.get("alinhar", "centro")
                    cx = float(it["x"]) * W
                    lx = cx - o.tw / 2 if al == "centro" else (cx if al == "esq" else cx - o.tw)
                    ly = y0 + k * lh
                    lay.append({"o": o, "txt": o.txt, "x": lx, "y": ly, "fnt": fnt})
                it["_linhas"] = lay
                it.setdefault("dur", min(1.4, 0.035 * len(str(it["texto"]))))
            elif f == "imagem":
                im = Imagem({"arquivo": it["arquivo"], "largura": it.get("largura", 0.5), "raio": it.get("raio", 0.012),
                             "borda": it.get("borda", 0.004), "sombra": it.get("sombra", 0.4), "x": it.get("x", 0.5),
                             "y": it.get("y", 0.5), "de": it["t"], "ate": it.get("ate", self.ate),
                             "entrada": it.get("entrada", "pop")}, W, H, base)
                it["_img"] = im
            else:
                it["_path"] = self._caminhos(it)
                it.setdefault("dur", 0.5 if f in ("seta", "linha") else 0.7)
            self.itens.append(it)

    # ---- câmera
    def camera(self, t: float) -> tuple[float, float, float]:
        ks = self.cam
        if t <= ks[0]["t"]:
            k = ks[0]
            return k.get("dx", 0), k.get("dy", 0), k.get("escala", 1)
        for a, b in zip(ks[:-1], ks[1:]):
            if t < b["t"]:
                d = float(b.get("dur", min(0.8, b["t"] - a["t"])))
                p = ease_io((t - (b["t"] - d)) / d) if t > b["t"] - d else 0.0
                return tuple(a.get(n, z) + (b.get(n, z) - a.get(n, z)) * p for n, z in (("dx", 0), ("dy", 0), ("escala", 1)))
        k = ks[-1]
        return k.get("dx", 0), k.get("dy", 0), k.get("escala", 1)

    def tela(self, x: float, y: float, cam) -> tuple[float, float]:
        dx, dy, s = cam
        return ((x / self.W - 0.5) * s + 0.5 + dx) * self.W, ((y / self.H - 0.5) * s + 0.5 + dy) * self.H

    # ---- formas como lista de traços (px da tela com câmera parada)
    def _caminhos(self, it: dict) -> list[np.ndarray]:
        W, H = self.W, self.H
        f = it["forma"]
        P = lambda x, y: np.array([x * W, y * H], float)
        if f == "seta":
            a, b = P(*it["de"]), P(*it["para"])
            v = b - a
            L = np.linalg.norm(v) + 1e-9
            nrm = np.array([-v[1], v[0]]) / L
            c = (a + b) / 2 + nrm * L * float(it.get("curva", 0.0))
            tt = np.linspace(0, 1, 40)[:, None]
            shaft = (1 - tt) ** 2 * a + 2 * (1 - tt) * tt * c + tt ** 2 * b
            dirv = shaft[-1] - shaft[-4]
            dirv /= np.linalg.norm(dirv) + 1e-9
            hl = min(L * 0.35, W * 0.035)
            rot = lambda v, ang: np.array([v[0] * np.cos(ang) - v[1] * np.sin(ang), v[0] * np.sin(ang) + v[1] * np.cos(ang)])
            h1 = np.array([b, b - rot(dirv, 0.5) * hl])
            h2 = np.array([b, b - rot(dirv, -0.5) * hl])
            return [shaft, h1, h2]
        if f == "caixa":
            cx, cy, w, h = it["x"] * W, it["y"] * H, it["w"] * W, it["h"] * H
            x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
            return [np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0 - h * 0.06]])]
        if f == "circulo":
            return [_ellipse(it["x"] * W, it["y"] * H, it["w"] * W / 2, it["h"] * H / 2)]
        if f == "linha":
            return [np.array([P(*p) for p in it["pontos"]])]
        if f == "funil":
            cx, cy, w, h = it["x"] * W, it["y"] * H, it["w"] * W, it["h"] * H
            top = cy - h / 2
            neck_w, neck_y = w * 0.16, cy + h * 0.32
            ry = h * 0.07
            paths = [_ellipse(cx, top, w / 2, ry, a0=np.pi, turns=1.0),
                     np.array([[cx - w / 2, top], [cx - neck_w / 2, neck_y], [cx - neck_w / 2, cy + h / 2]]),
                     np.array([[cx + w / 2, top], [cx + neck_w / 2, neck_y], [cx + neck_w / 2, cy + h / 2]]),
                     _ellipse(cx, cy + h / 2, neck_w / 2, ry * 0.35, a0=0, turns=0.5)]
            n = int(it.get("camadas", 0))
            for k in range(1, n):
                fy = top + (neck_y - top) * k / n
                half = (w / 2) + ((neck_w / 2) - (w / 2)) * k / n
                arc = _ellipse(cx, fy, half, ry * (1 - 0.6 * k / n), a0=0, turns=0.5)
                paths.append(arc)
            return paths
        raise SystemExit(f"quadro: forma '{f}' não existe (texto, seta, caixa, circulo, linha, funil, imagem)")

    def _stroke(self, d, paths: list[np.ndarray], p: float, cam, cor, w: float, seed: int) -> None:
        """Desenha a fração p (0 a 1) do comprimento total dos traços, em ordem."""
        tot = [np.sum(np.linalg.norm(np.diff(q, axis=0), axis=1)) for q in paths]
        T = sum(tot) * p
        for q, L in zip(paths, tot):
            if T <= 0:
                break
            sc = [self.tela(x, y, cam) for x, y in q]
            q2 = _dense(np.array(sc), max(3.0, self.W / 360))
            q2 = _jitter(q2, self.W * 0.0016, seed)
            seg = np.linalg.norm(np.diff(q2, axis=0), axis=1)
            cum = np.concatenate([[0], np.cumsum(seg)]) * (L / max(cum_tot(seg), 1e-6))
            keep = q2[cum <= T]
            if len(keep) >= 2:
                d.line([tuple(map(float, pt)) for pt in keep], fill=cor, width=max(2, int(w)), joint="curve")
                r = max(1, int(w / 2))
                for pt in (keep[0], keep[-1]):
                    d.ellipse((pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r), fill=cor)
            T -= L
            seed += 1

    def draw(self, ctx) -> None:
        from PIL import Image, ImageDraw
        from el_texto import hex_rgb
        t, W, H = ctx.t, ctx.W, ctx.H
        cam = self.camera(t)
        a_all = self.alpha_saida(t)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        textos = []
        for it in self.itens:
            if t < it["t"] or (it.get("ate") is not None and t >= float(it["ate"])):
                continue
            f = it["forma"]
            cor = tuple(int(c * 255) for c in hex_rgb(it.get("cor", self.cor))) + (255,)
            w = float(it["espessura"]) * W * cam[2]
            p = min(1.0, (t - it["t"]) / max(float(it["dur"]), 1e-3)) if f != "imagem" else 1.0
            if f == "texto":
                textos.append((it, ease(p)))
                for k, kind in (("sublinhar", "sub"), ("circular", "circ")):
                    for mk in it.get(k, []):
                        if t < float(mk["t"]):
                            continue
                        pm = min(1.0, (t - float(mk["t"])) / float(mk.get("dur", 0.32 if kind == "sub" else 0.45)))
                        box = self._palavra(it, mk["palavra"])
                        if not box:
                            continue
                        x0, y0, x1, y1 = box
                        mc = tuple(int(c * 255) for c in hex_rgb(mk.get("cor", VERMELHO))) + (255,)
                        if kind == "sub":
                            yy = y1 + (y1 - y0) * 0.18
                            pts = np.array([[x0 - (x1 - x0) * 0.04, yy], [x1 + (x1 - x0) * 0.04, yy + (y1 - y0) * 0.05]])
                        else:
                            pts = _ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 * 1.25 + W * 0.01, (y1 - y0) / 2 * 1.5)
                        self._stroke(d, [pts], pm, (0, 0, 1), mc, float(mk.get("espessura", 0.005)) * W * cam[2] / max(cam[2], 1e-3),
                                     it["_seed"] + 31)
            elif f == "imagem":
                continue
            else:
                self._stroke(d, it["_path"], ease(p), cam, cor, w, it["_seed"])
        arr = np.asarray(lay, np.float32) / 255
        pre = np.concatenate([arr[..., :3] * arr[..., 3:4], arr[..., 3:4]], 2)
        for it, p in textos:                           # texto escrito da esquerda para a direita
            for ln in it["_linhas"]:
                o = ln["o"]
                img = scaled(o.front, cam[2])
                sx, sy = self.tela(ln["x"], ln["y"], cam)
                x = int(sx - o.tx * cam[2])
                y = int(sy - o.ty * cam[2])
                if p < 1:
                    img = img.copy()
                    img[:, int((o.tx + o.tw * p) * cam[2]):] = 0
                h, w_ = img.shape[:2]
                xa, ya = max(0, x), max(0, y)
                xb, yb = min(W, x + w_), min(H, y + h)
                if xa < xb and ya < yb:
                    L = img[ya - y:yb - y, xa - x:xb - x]
                    pre[ya:yb, xa:xb] = L + pre[ya:yb, xa:xb] * (1 - L[..., 3:4])
        # os sublinhados foram desenhados em coordenada de tela já com câmera: refazer acima do texto
        hole = ctx.mask() if self.s.get("camada") == "atras" else None
        paste(ctx.frame, pre, 0, 0, a_all, hole)
        for it in self.itens:
            if it["forma"] == "imagem" and t >= it["t"] and (it.get("ate") is None or t < float(it["ate"])):
                it["_img"].draw(ctx)

    def _palavra(self, it: dict, palavra: str):
        """Caixa (tela, px, com a câmera atual) de uma palavra dentro do texto do item."""
        cam = self.camera_atual if hasattr(self, "camera_atual") else None
        for ln in it["_linhas"]:
            txt = ln["txt"]
            k = txt.lower().find(str(palavra).lower())
            if k < 0:
                continue
            f, o = ln["fnt"], ln["o"]
            x0 = ln["x"] + f.getlength(txt[:k]) - (f.getlength(txt) - o.tw) / 2
            x1 = x0 + f.getlength(txt[k:k + len(palavra)])
            y0, y1 = ln["y"], ln["y"] + o.th
            return (x0, y0, x1, y1) if cam is None else (x0, y0, x1, y1)
        return None


def cum_tot(seg: np.ndarray) -> float:
    return float(np.sum(seg))


_ = (entrada_params, ease_io)

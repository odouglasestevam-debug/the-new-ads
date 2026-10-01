"""Caixa de ferramentas de edição profissional: elementos que interagem com a cena, quadro a quadro.

Vem das referências que o Douglas mandou em 01/10/2026 (references/referencias-douglas.md). QUANDO usar cada
um está em references/caixa-ferramentas.md (ler antes de escolher). Aqui está o COMO.

O render.py chama este script sozinho quando existe <work>/elementos.json (ou transição "foco" no fx_events.json):
  base.mp4 (cortes, zoom, efeitos ffmpeg, cor)  ->  elementos.py  ->  base_el.mp4  ->  cartões + legenda + áudio
Então tudo aqui fica POR BAIXO da legenda, e a legenda continua nítida.

Tempos sempre do VÍDEO FINAL (ver `cards.py VIDEO --tempos`). Posições em fração da tela (0 a 1).
Coordenadas de quadro: `python elementos.py VIDEO --work W --quadro 4.2` gera o quadro com grade de 10%.
Conferir sem renderizar tudo: `python elementos.py VIDEO --work W --previa 3.1,8.4` (precisa do base.mp4).

<work>/elementos.json é uma lista; a ordem é a ordem de empilhamento (o de baixo da lista fica por cima):

  {"tipo": "texto", "de": 0.3, "ate": 3.9, "camada": "atras", "ancora": "cena", "x": 0.42, "y": 0.27,
   "linhas": [{"texto": "sabe", "fonte": "pesada", "tam": 0.30, "cor": "#F2C200", "brilho": 0.8},
              {"texto": "fazer?", "fonte": "serif_italic", "tam": 0.17, "dx": 0.06, "gap": -0.05, "t": 0.9}],
   "entrada": "sobe"}
      camada: frente (padrão) | atras (a pessoa passa na frente). ancora: tela (padrão) | cena (acompanha o
      zoom e os cortes de enquadramento; com "rastrear": true segue também câmera na mão, por fluxo óptico).
      entrada: corte | fade | sobe | escala | foco | maquina | desliza ; "dur_entrada" 0.3 ; saida: fade | corte | foco
      Linhas: ver el_texto.py (fonte, tam, cor, brilho, contorno, borda, marca, sublinhado, desfoque, sombra, dx, dy, t).

  {"tipo": "texto", ..., "plano": [[0.05,0.78],[0.95,0.78],[1.0,0.93],[0.0,0.93]], "proporcao": 3.0,
   "camada": "atras", "textura": 0.5, "opacidade": 0.9}
      Texto deitado em perspectiva na parede ou no chão: 4 cantos do plano (sup-esq, sup-dir, inf-dir, inf-esq).
      tam das linhas é fração da largura do plano. "textura" deixa a textura do chão aparecer no texto.

  {"tipo": "clone", "de": 16.5, "ate": 21.5, "origem": 48.2, "camada": "atras", "opacidade": 1}
      A mesma pessoa de outra tomada (origem = segundos no BRUTO). Só com câmera no tripé, sem mexer.

  {"tipo": "rastro", "de": 22.5, "ate": 25.0, "atrasos": [0.12, 0.24, 0.36], "opacidade": 0.4}
      Eco semitransparente da pessoa (movimento vira rastro). Câmera parada.

  {"tipo": "foco", "t": 4.6, "dur": 0.45, "clarao": 0.35}
      Transição por foco: desfoca e clareia até o corte, o plano novo entra desfocado e foca.
      Também entra pelo perfil: "transicao": ["foco"] (plan_fx.py põe nos cortes).

  {"tipo": "moldura", "de": 21.55, "ate": 35.0, "fundo": "#DAD7C3", "largura": 0.70, "y": 0.58,
   "entrada": "branco", "cabecalho": {"y": 0.085, "marca": "#F08A4B", "alcas": true,
     "linhas": [{"texto": "clique em", "fonte": "pesada", "tam": 0.075, "cor": "#1A1A1A"},
                {"texto": "saiba mais", "fonte": "fina", "tam": 0.085, "cor": "#1A1A1A", "gap": -0.012}]}}
      Vídeo reduzido com borda sobre fundo de cor, com título fixo. entrada: corte | encolhe | branco.

  {"tipo": "imagem", "arquivo": "print.png", "de": 4.0, "ate": 7.0, "x": 0.5, "y": 0.3, "largura": 0.6,
   "entrada": "pop", "raio": 0.03, "borda": 0.008, "sombra": 0.5, "fundo": null, "flutua": false}
      Print, mockup, logo, prova. "fundo": "#0D0D0D" cobre a tela (cartão final de logo).

  {"tipo": "video", "arquivo": "broll.mp4", "de": 24.9, "ate": 28.8, "inicio": 0, "modo": "cheia"}
      B-roll. modo: cheia (cobre a tela) | janela (x, y, largura, raio, borda como imagem). Sem o som do B-roll.

  {"tipo": "cinetica", "de": 5.7, "ate": 9.0, "fundo": "#FBFBF6", "brilho": "#D4FF00", "y": 0.42,
   "linhas": [{"texto": "A primeira", "fonte": "poppins_semi", "tam": 0.05, "cor": "#222222", "t": 5.8},
              {"texto": "impressão", "fonte": "poppins", "tam": 0.1, "cor": "#111111", "marca": "#D4FF00", "t": 6.3}]}
      Tela cheia de tipografia cinética (palavra entra focando, marca-texto cresce). Esconde a legenda.

  {"tipo": "cta", "de": 17.0, "ate": 20.6, "texto": "Fale com a gente no WhatsApp.", "botao": "SAIBA MAIS",
   "cor": "#D4FF00", "y": 0.36, "clique_em": 18.6}
      Botão falso de anúncio com cursor que clica.

  {"tipo": "quadro", ...}   quadro branco desenhado à mão, sincronizado com a fala: ver el_quadro.py.

Qualquer elemento aceita "esconde_legenda": true (captions.py tira a legenda do trecho).
"""
from __future__ import annotations

import os

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import argparse
import subprocess
from collections import deque
from pathlib import Path

import numpy as np

from common import FF, load_json, probe, run, save_json, work_dir_for

# ------------------------------------------------------------------ utilidades

def ease(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 1 - (1 - p) ** 3                      # ease-out cúbico


def ease_io(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 3 * p * p - 2 * p * p * p


def back_out(p: float, k: float = 1.7) -> float:
    p = min(1.0, max(0.0, p))
    q = p - 1
    return 1 + (k + 1) * q ** 3 + k * q ** 2      # passa um pouco e volta (pop)


def paste(dst: np.ndarray, lay: np.ndarray, x: int, y: int, a: float = 1.0, hole: np.ndarray | None = None) -> None:
    """Composição 'over' de camada RGBA pré-multiplicada em dst (float32 RGB). hole = máscara que esconde a camada."""
    h, w = lay.shape[:2]
    xa, ya = max(0, x), max(0, y)
    xb, yb = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if xa >= xb or ya >= yb or a <= 0.001:
        return
    L = lay[ya - y:yb - y, xa - x:xb - x]
    if hole is not None:
        k = a * (1 - hole[ya:yb, xa:xb])[..., None]
        dst[ya:yb, xa:xb] = L[..., :3] * k + dst[ya:yb, xa:xb] * (1 - L[..., 3:4] * k)
    elif a < 0.999:
        dst[ya:yb, xa:xb] = L[..., :3] * a + dst[ya:yb, xa:xb] * (1 - L[..., 3:4] * a)
    else:
        dst[ya:yb, xa:xb] = L[..., :3] + dst[ya:yb, xa:xb] * (1 - L[..., 3:4])


def over(dst: np.ndarray, lay: np.ndarray, x: int, y: int, a: float = 1.0) -> None:
    """Como paste, mas dst é RGBA pré-multiplicado (montar camada antes de compor na imagem)."""
    h, w = lay.shape[:2]
    xa, ya = max(0, x), max(0, y)
    xb, yb = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if xa >= xb or ya >= yb or a <= 0.001:
        return
    L = lay[ya - y:yb - y, xa - x:xb - x] * a
    dst[ya:yb, xa:xb] = L + dst[ya:yb, xa:xb] * (1 - L[..., 3:4])


def scaled(img: np.ndarray, s: float) -> np.ndarray:
    import cv2
    if abs(s - 1) < 0.004:
        return img
    h, w = img.shape[:2]
    return cv2.resize(img, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_LINEAR)


def blurred(img: np.ndarray, sigma: float) -> np.ndarray:
    import cv2
    if sigma < 0.4:
        return img
    if sigma > 6:                                 # desfoque grande: reduz, desfoca, volta (rápido e igual ao olho)
        h, w = img.shape[:2]
        f = 4
        sm = cv2.resize(img, (max(1, w // f), max(1, h // f)), interpolation=cv2.INTER_AREA)
        sm = cv2.GaussianBlur(sm, (0, 0), sigma / f)
        return cv2.resize(sm, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(img, (0, 0), sigma)


def rounded_mask(w: int, h: int, r: int) -> np.ndarray:
    from PIL import Image, ImageDraw
    im = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=max(0, r * 2), fill=255)
    return np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255


def hexc(h: str) -> np.ndarray:
    from el_texto import hex_rgb
    return np.array(hex_rgb(h), np.float32)


def entrada_params(kind: str, p: float, H: int, px: float) -> dict:
    """Estado da entrada no progresso p (0 a 1)."""
    e = ease(p)
    if kind in (None, "corte"):
        return {"a": 1.0 if p >= 0 else 0.0}
    if kind == "fade":
        return {"a": e}
    if kind == "sobe":
        return {"a": e, "dy": (1 - e) * 0.035 * H}
    if kind == "desliza":
        return {"a": e, "dx": (1 - e) * 0.12 * H}
    if kind in ("escala", "pop"):
        return {"a": min(1.0, p * 3), "s": 0.6 + 0.4 * back_out(p)}
    if kind == "foco":
        return {"a": min(1.0, p * 2.2), "blur": (1 - e) * px * 0.22, "s": 1.06 - 0.06 * e}
    if kind == "maquina":
        return {"a": 1.0, "reveal": p}
    raise SystemExit(f"entrada '{kind}' não existe (corte, fade, sobe, desliza, escala, pop, foco, maquina)")


# ------------------------------------------------------------------ geometria do render (cena -> tela)

class Geo:
    """Sabe onde cada pixel do BRUTO cai na tela em cada instante (zoom e recorte por clipe, aproximação do gancho)."""

    def __init__(self, g: dict):
        self.g = g
        self.W, self.H, self.fps = g["W"], g["H"], g["fps"]
        self.clips = g["clips"]
        self.e = g.get("escala", 1.0)

    def idx(self, t: float) -> int:
        for k, c in enumerate(self.clips):
            if t < c["v1"]:
                return k
        return len(self.clips) - 1

    def hard_between(self, k0: int, k1: int) -> bool:
        return any(not self.clips[j - 1]["cont"] for j in range(min(k0, k1) + 1, max(k0, k1) + 1))

    def src_time(self, t: float) -> float:
        c = self.clips[self.idx(t)]
        return c["vin"] + (t - c["v0"])

    def A(self, t: float) -> np.ndarray:
        """3x3: coordenada do bruto (px) -> coordenada da tela (px, já na resolução de trabalho)."""
        g = self.g
        c = self.clips[self.idx(t)]
        if g.get("fit") == "blur":
            return np.eye(3)
        cw, ch, x, y = c["box"]
        Wf, Hf = g["W_full"], g["H_full"]
        k = Wf / cw
        M = np.array([[k, 0, -x * k], [0, k, -y * k], [0, 0, 1]], float)
        if c.get("push"):
            tau = t - c["v0"]
            s = 1 + c["push"] * tau / max(c["v1"] - c["v0"], 1e-3)
            P = np.array([[s, 0, -Wf * (s - 1) * g["face_u"]], [0, s, -Hf * (s - 1) * g["face_v"]], [0, 0, 1]])
            M = P @ M
        E = np.diag([self.e, self.e, 1.0])
        return E @ M


# ------------------------------------------------------------------ contexto de um quadro

class Ctx:
    def __init__(self, W: int, H: int, fps: float, geo: Geo, seg_factory):
        self.W, self.H, self.fps, self.geo = W, H, fps, geo
        self._segf = seg_factory
        self._seg = None
        self.t = 0.0
        self.i = 0
        self.frame: np.ndarray | None = None      # float32 RGB 0..1, é aqui que se desenha
        self.raw: np.ndarray | None = None        # uint8 original do quadro
        self._mask = None
        self._gray = None
        self.cut = False                          # corte seco neste quadro

    def mask(self) -> np.ndarray:
        if self._mask is None:
            if self._seg is None:
                self._seg = self._segf()
            self._mask = self._seg(self.raw, reset=self.cut)
        return self._mask

    def gray(self) -> np.ndarray:
        import cv2
        if self._gray is None:
            self._gray = cv2.cvtColor(cv2.resize(self.raw, (self.W // 2, self.H // 2), interpolation=cv2.INTER_AREA),
                                      cv2.COLOR_RGB2GRAY)
        return self._gray


# ------------------------------------------------------------------ elementos

class El:
    estagio = "tela"                    # cena | transicao | moldura | tela
    precisa_mascara = False

    def __init__(self, s: dict, W: int, H: int, base: Path):
        self.s, self.W, self.H, self.base = s, W, H, base
        self.de = float(s.get("de", s.get("t", 0)))
        self.ate = float(s.get("ate", self.de))

    def ativo(self, t: float) -> bool:
        return self.de <= t < self.ate

    def alpha_saida(self, t: float, kind: str | None = None, d: float = 0.22) -> float:
        kind = kind or self.s.get("saida", "fade")
        if kind == "corte":
            return 1.0
        return ease((self.ate - t) / d)

    def arquivo(self, nome: str) -> Path:
        p = Path(nome)
        if not p.is_absolute():
            for cand in (self.base / nome, self.base.parent.parent / nome, Path.cwd() / nome):
                if cand.exists():
                    return cand.resolve()
        if not p.exists():
            raise SystemExit(f"{self.s['tipo']}: arquivo não encontrado: {nome}")
        return p.resolve()


class Texto(El):
    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        from el_texto import bloco
        self.atras = s.get("camada", "frente") == "atras"
        self.plano = s.get("plano")
        self.ancora = s.get("ancora", "tela")
        self.rastrear = bool(s.get("rastrear"))
        self.estagio = "cena" if (self.atras or self.plano or self.ancora == "cena") else "tela"
        self.precisa_mascara = self.atras or self.rastrear
        if not s.get("linhas"):
            raise SystemExit("texto: falta 'linhas'")
        if self.plano:
            q = np.array(self.plano, float) * [W, H]
            topw, botw = np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[2] - q[3])
            self.cw = int(max(topw, botw))
            self.ch = int(self.cw / float(s.get("proporcao", 3.0)))
            self.quad = q.astype(np.float32)
            self.items = bloco(s["linhas"], self.cw, self.ch, 0.5, 0.5, float(s.get("gap", 0)))
        else:
            self.items = bloco(s["linhas"], W, H, float(s.get("x", 0.5)), float(s.get("y", 0.5)), float(s.get("gap", 0)))
        self.T_ref = None
        self.trk = None

    def _pecas(self, t: float):
        """(imagem, x, y, alpha) de cada linha neste instante, já com a animação de entrada."""
        out = []
        kind0 = self.s.get("entrada", "fade")
        dur = float(self.s.get("dur_entrada", 0.3))
        a_out = self.alpha_saida(t)
        blur_out = 0.0
        if self.s.get("saida") == "foco":
            blur_out = (1 - a_out) * 24
        for it in self.items:
            o, sp = it["linha"], it["spec"]
            t0 = float(sp["t"]) if sp.get("t") is not None else self.de
            if t < t0:
                continue
            kind = sp.get("entrada", kind0)
            st = entrada_params(kind, (t - t0) / dur, self.H, o.px)
            a = st.get("a", 1) * a_out
            for img in ((o.back, o.front) if o.back is not None else (o.front,)):
                im = img
                x, y = it["x"], it["y"]
                if st.get("reveal") is not None and st["reveal"] < 1:
                    cut = int(o.tx + o.tw * st["reveal"])
                    im = im.copy()
                    im[:, cut:] = 0
                if img is o.back and o.spec.get("marca") and kind != "corte":
                    pm = min(1.0, (t - t0) / 0.22)                       # marca-texto cresce da esquerda
                    xa, ya, xb, yb = o.marca_box
                    im = im.copy()
                    im[:, int(xa + (xb - xa) * ease(pm)):] = 0
                s_ = st.get("s", 1.0)
                if s_ != 1.0:
                    h0, w0 = im.shape[:2]
                    im = scaled(im, s_)
                    x += int((w0 - im.shape[1]) / 2)
                    y += int((h0 - im.shape[0]) / 2)
                b = st.get("blur", 0) + blur_out
                if b > 0.4:
                    im = blurred(im, b)
                out.append((im, int(x + st.get("dx", 0)), int(y + st.get("dy", 0)), a))
        return out

    def _transform(self, ctx: Ctx) -> np.ndarray | None:
        if self.ancora != "cena" and not self.rastrear:
            return None
        if self.rastrear:
            if self.trk is None:
                self.trk = Rastreador(ctx, plano=bool(self.plano))
            return self.trk.update(ctx)
        if self.T_ref is None:
            self.T_ref = np.linalg.inv(ctx.geo.A(self.de))
        return ctx.geo.A(ctx.t) @ self.T_ref

    def draw(self, ctx: Ctx) -> None:
        import cv2
        pcs = self._pecas(ctx.t)
        T = self._transform(ctx)
        if not pcs:
            return
        hole = ctx.mask() if self.atras else None
        op = float(self.s.get("opacidade", 1.0))
        if self.plano:
            canvas = np.zeros((self.ch, self.cw, 4), np.float32)
            for im, x, y, a in pcs:
                over(canvas, im, x, y, a)
            src = np.float32([[0, 0], [self.cw, 0], [self.cw, self.ch], [0, self.ch]])
            Hm = cv2.getPerspectiveTransform(src, self.quad).astype(float)
            if T is not None:
                Hm = T @ Hm
            self._warp_paste(ctx, canvas, Hm, hole, op)
            return
        if T is None or np.allclose(T, np.eye(3), atol=1e-4):
            for im, x, y, a in pcs:
                paste(ctx.frame, im, x, y, a * op, hole)
            return
        # preso na cena: monta a camada na caixa do bloco e leva para onde a cena foi
        x0 = min(x for _, x, _, _ in pcs)
        y0 = min(y for _, _, y, _ in pcs)
        x1 = max(x + im.shape[1] for im, x, _, _ in pcs)
        y1 = max(y + im.shape[0] for im, _, y, _ in pcs)
        canvas = np.zeros((y1 - y0, x1 - x0, 4), np.float32)
        for im, x, y, a in pcs:
            over(canvas, im, x - x0, y - y0, a)
        Hm = T @ np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]], float)
        self._warp_paste(ctx, canvas, Hm, hole, op)

    def _warp_paste(self, ctx: Ctx, canvas: np.ndarray, Hm: np.ndarray, hole, op: float) -> None:
        import cv2
        h, w = canvas.shape[:2]
        cs = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
        dst = cv2.perspectiveTransform(cs, Hm).reshape(-1, 2)
        xa, ya = np.floor(dst.min(0)).astype(int)
        xb, yb = np.ceil(dst.max(0)).astype(int)
        xa, ya = max(xa, 0), max(ya, 0)
        xb, yb = min(xb, ctx.W), min(yb, ctx.H)
        if xa >= xb or ya >= yb:
            return
        Tm = np.array([[1, 0, -xa], [0, 1, -ya], [0, 0, 1]], float) @ Hm
        lay = cv2.warpPerspective(canvas, Tm, (xb - xa, yb - ya), flags=cv2.INTER_LINEAR, borderValue=0)
        tx = float(self.s.get("textura", 0) or 0)
        if tx:                                           # a textura do chão/parede aparece através do texto
            reg = ctx.frame[ya:yb, xa:xb]
            lum = reg.mean(2, keepdims=True)
            k = lum / max(float(lum.mean()), 1e-3)
            lay[..., :3] *= np.clip(1 - tx + tx * k, 0, 1.6)
        paste(ctx.frame, lay, xa, ya, op, hole)


class Rastreador:
    """Segue o movimento da câmera por fluxo óptico no fundo (a pessoa é ignorada). Em troca de enquadramento do
    próprio render (zoom/corte), usa a geometria exata em vez do fluxo."""

    def __init__(self, ctx: Ctx, plano: bool):
        self.plano = plano
        self.T = np.eye(3)
        self.prev = None
        self.k_prev = None
        self.t_prev = None

    def update(self, ctx: Ctx) -> np.ndarray:
        import cv2
        g = ctx.gray()
        k = ctx.geo.idx(ctx.t)
        if self.prev is not None:
            if k != self.k_prev:
                F = ctx.geo.A(ctx.t) @ np.linalg.inv(ctx.geo.A(self.t_prev))
            else:
                excl = (cv2.resize(ctx.mask(), (g.shape[1], g.shape[0])) < 0.3).astype(np.uint8) * 255
                excl = cv2.erode(excl, np.ones((15, 15), np.uint8))
                p0 = cv2.goodFeaturesToTrack(self.prev, 400, 0.01, 8, mask=excl)
                F = np.eye(3)
                if p0 is not None and len(p0) >= 12:
                    p1, st, _ = cv2.calcOpticalFlowPyrLK(self.prev, g, p0, None, winSize=(21, 21), maxLevel=3)
                    good = st.reshape(-1) == 1
                    a, b = p0[good], p1[good]
                    if len(a) >= 12:
                        if self.plano:
                            Hh, _ = cv2.findHomography(a, b, cv2.RANSAC, 2.0)
                        else:
                            M, _ = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                            Hh = None if M is None else np.vstack([M, [0, 0, 1]])
                        if Hh is not None:
                            S = np.diag([2.0, 2.0, 1.0])
                            F = S @ Hh @ np.linalg.inv(S)
            self.T = F @ self.T
        self.prev, self.k_prev, self.t_prev = g, k, ctx.t
        return self.T


class Clone(El):
    estagio = "cena"
    precisa_mascara = True

    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        if "origem" not in s:
            raise SystemExit("clone: falta 'origem' (segundos no bruto onde começa a outra tomada)")
        self.proc = None
        self.k = None
        self.seg = None

    def _open(self, ctx: Ctx, k: int) -> None:
        g = ctx.geo.g
        c = ctx.geo.clips[k]
        if c.get("push"):
            print(f"  aviso: clone em {ctx.t:.2f}s cai no trecho de aproximação do gancho; o clone não acompanha o zoom lento.")
        cw, ch, x, y = c["box"]
        ts0 = float(self.s["origem"]) + (ctx.t - self.de)
        vf = (g["tonemap"] + "," if g.get("hdr") else "") + f"crop={cw}:{ch}:{x}:{y},scale={ctx.W}:{ctx.H}:flags=lanczos"
        if g.get("grade"):
            vf += "," + g["grade"]
        vf += f",fps={ctx.fps}"
        if self.proc:
            self.proc.kill()
        self.proc = subprocess.Popen([FF, "-v", "error", "-ss", f"{ts0:.3f}", "-i", g["src"], "-an", "-vf", vf,
                                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL)
        self.k = k

    def draw(self, ctx: Ctx) -> None:
        k = ctx.geo.idx(ctx.t)
        if self.proc is None or k != self.k:
            self._open(ctx, k)
        n = ctx.W * ctx.H * 3
        buf = self.proc.stdout.read(n)
        if len(buf) < n:
            return
        img = np.frombuffer(buf, np.uint8).reshape(ctx.H, ctx.W, 3)
        if self.seg is None:
            from segment import Segmenter
            self.seg = Segmenter(modelo=getattr(ctx, "modelo", "fino"))
        mc = self.seg(img)
        a = mc * float(self.s.get("opacidade", 1.0)) * self.alpha_saida(ctx.t, d=0.15)
        if self.s.get("camada", "atras") == "atras":
            a = a * (1 - ctx.mask())
        a = a[..., None]
        ctx.frame[:] = ctx.frame * (1 - a) + (img.astype(np.float32) / 255) * a

    def fim(self):
        if self.proc:
            self.proc.kill()
        if self.seg is not None:
            self.seg.close()


class Rastro(El):
    estagio = "cena"
    precisa_mascara = True

    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        self.atrasos = sorted(float(x) for x in s.get("atrasos", [0.12, 0.24, 0.36]))
        self.hist: deque = deque()

    def draw(self, ctx: Ctx) -> None:
        m = ctx.mask()
        n = [max(1, int(round(d * ctx.fps))) for d in self.atrasos]
        self.hist.append((ctx.raw, m))
        while len(self.hist) > max(n) + 1:
            self.hist.popleft()
        op = float(self.s.get("opacidade", 0.4)) * self.alpha_saida(ctx.t, d=0.2)
        for j, k in sorted(enumerate(n), key=lambda x: -x[1]):        # o mais antigo primeiro (fica por baixo)
            if len(self.hist) <= k:
                continue
            img, mp = self.hist[-1 - k]
            a = (mp * (1 - m) * op * (1 - j / (len(n) + 1)))[..., None]
            ctx.frame[:] = ctx.frame * (1 - a) + (img.astype(np.float32) / 255) * a


class Foco(El):
    estagio = "transicao"

    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        self.T = float(s["t"])
        self.d = float(s.get("dur", 0.45))
        self.pre, self.pos = self.d * 0.35, self.d * 0.65
        self.de, self.ate = self.T - self.pre, self.T + self.pos

    def draw(self, ctx: Ctx) -> None:
        t = ctx.t
        if t < self.T:
            k = ease_io((t - self.de) / self.pre)
        else:
            k = 1 - ease((t - self.T) / self.pos)
        if k <= 0.01:
            return
        sig = k * float(self.s.get("sigma", 0.035)) * ctx.W
        f = blurred(ctx.frame, sig)
        c = k * float(self.s.get("clarao", 0.35))
        if c > 0.005:
            bloom = blurred(np.clip(f - 0.55, 0, 1), ctx.W * 0.03)
            f = f * (1 + 0.55 * c) + bloom * 1.6 * c + 0.06 * c
        ctx.frame[:] = np.clip(f, 0, 1)


class Moldura(El):
    estagio = "moldura"

    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        from el_texto import bloco
        self.fundo = hexc(s.get("fundo", "#DAD7C3"))
        self.larg = float(s.get("largura", 0.70))
        self.y = float(s.get("y", 0.58))
        cab = s.get("cabecalho")
        self.cab = []
        self.cab_box = None
        if cab:
            lin = [dict(l, marca=l.get("marca", cab.get("marca"))) for l in cab["linhas"]]
            self.cab = bloco(lin, W, H, float(cab.get("x", 0.5)), float(cab.get("y", 0.085)), 0)
            if cab.get("alcas", True):
                xs = [it["x"] + (it["linha"].marca_box[0] if hasattr(it["linha"], "marca_box") else it["linha"].tx) for it in self.cab]
                xe = [it["x"] + (it["linha"].marca_box[2] if hasattr(it["linha"], "marca_box") else it["linha"].tx + it["linha"].tw) for it in self.cab]
                ys = [it["y"] + (it["linha"].marca_box[1] if hasattr(it["linha"], "marca_box") else it["linha"].ty) for it in self.cab]
                ye = [it["y"] + (it["linha"].marca_box[3] if hasattr(it["linha"], "marca_box") else it["linha"].ty + it["linha"].th) for it in self.cab]
                self.cab_box = (min(xs) - 6, min(ys) - 6, max(xe) + 6, max(ye) + 6)
        bw = max(2, int(float(s.get("borda", 0.008)) * W))
        self.bw = bw

    def draw(self, ctx: Ctx) -> None:
        import cv2
        W, H, t = ctx.W, ctx.H, ctx.t
        ent = self.s.get("entrada", "corte")
        p = (t - self.de) / 0.35
        if ent == "encolhe" and p < 1:
            e = ease_io(p)
            lg = 1 + (self.larg - 1) * e
            yc = 0.5 + (self.y - 0.5) * e
            a_cab = e
        else:
            lg, yc, a_cab = self.larg, self.y, 1.0
        a_out = self.alpha_saida(t, "corte")
        fw, fh = int(W * lg), int(H * lg)
        small = cv2.resize(ctx.frame, (fw, fh), interpolation=cv2.INTER_AREA)
        out = np.empty_like(ctx.frame)
        out[:] = self.fundo
        x0, y0 = (W - fw) // 2, int(H * yc - fh / 2)
        bw = self.bw if lg < 0.98 else 0
        sh = float(self.s.get("sombra", 0.35))
        if sh and bw:
            S = np.zeros((H, W), np.float32)
            S[max(0, y0 - bw + 12):y0 + fh + bw + 12, max(0, x0 - bw + 8):x0 + fw + bw + 8] = 1
            S = blurred(S, W * 0.02) * sh
            out *= (1 - S[..., None])
        if bw:
            out[max(0, y0 - bw):y0 + fh + bw, max(0, x0 - bw):x0 + fw + bw] = hexc(self.s.get("cor_borda", "#FFFFFF"))
        ya, yb = max(0, y0), min(H, y0 + fh)
        out[ya:yb, x0:x0 + fw] = small[ya - y0:yb - y0]
        for it in self.cab:
            o = it["linha"]
            if o.back is not None:
                paste(out, o.back, it["x"], it["y"], a_cab)
            paste(out, o.front, it["x"], it["y"], a_cab)
        if self.cab_box and a_cab > 0.5:
            xa, ya_, xb, yb_ = self.cab_box
            col = (0.23, 0.51, 0.96)
            lay = (out * 255).astype(np.uint8)
            cv2.rectangle(lay, (xa, ya_), (xb, yb_), tuple(int(c * 255) for c in col), max(1, W // 540), cv2.LINE_AA)
            for cx, cy in ((xb, ya_), (xa, yb_)):
                cv2.circle(lay, (cx, cy), max(3, W // 150), tuple(int(c * 255) for c in col), -1, cv2.LINE_AA)
            out = lay.astype(np.float32) / 255
        if ent == "branco" and t - self.de < 2.5 / ctx.fps:
            out[:] = 1.0
        ctx.frame[:] = out if a_out >= 1 else ctx.frame * (1 - a_out) + out * a_out


class Imagem(El):
    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        from PIL import Image
        im = Image.open(self.arquivo(s["arquivo"])).convert("RGBA")
        w = int(float(s.get("largura", 0.6)) * W)
        h = int(im.height * w / im.width)
        im = im.resize((w, h), Image.LANCZOS)
        if s.get("rotacao"):
            im = im.rotate(float(s["rotacao"]), resample=Image.BICUBIC, expand=True)
        a = np.asarray(im, np.float32) / 255
        self.img = self._moldar(a, s, W)
        self.fundo = hexc(s["fundo"]) if s.get("fundo") else None

    @staticmethod
    def _moldar(a: np.ndarray, s: dict, W: int) -> np.ndarray:
        """Cantos arredondados, borda e sombra. Entra RGBA reto, sai RGBA pré-multiplicado."""
        h, w = a.shape[:2]
        r = int(float(s.get("raio", 0)) * W)
        if r:
            a[..., 3] *= rounded_mask(w, h, r)
        pre = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], 2)
        bw = int(float(s.get("borda", 0)) * W)
        sh = float(s.get("sombra", 0) or 0)
        m = bw + (int(W * 0.04) if sh else 0)
        if not m:
            return pre
        out = np.zeros((h + 2 * m, w + 2 * m, 4), np.float32)
        if sh:
            S = np.zeros(out.shape[:2], np.float32)
            S[m - bw + int(W * 0.012):m + h + bw + int(W * 0.012), m - bw:m + w + bw] = 1
            S = blurred(S, W * 0.018) * sh
            out[..., 3] = S
        if bw:
            bm = rounded_mask(w + 2 * bw, h + 2 * bw, r + bw if r else 0)
            col = hexc(s.get("cor_borda", "#FFFFFF"))
            reg = out[m - bw:m + h + bw, m - bw:m + w + bw]
            reg[..., :3] = col * bm[..., None] + reg[..., :3] * (1 - bm[..., None])
            reg[..., 3] = bm + reg[..., 3] * (1 - bm)
        over(out, pre, m, m)
        return out

    def _pos(self, t: float, img: np.ndarray):
        h, w = img.shape[:2]
        x = int(float(self.s.get("x", 0.5)) * self.W - w / 2)
        y = int(float(self.s.get("y", 0.5)) * self.H - h / 2)
        if self.s.get("flutua"):
            y += int(np.sin((t - self.de) * 2.2) * self.H * 0.004)
        return x, y

    def draw(self, ctx: Ctx) -> None:
        if self.fundo is not None:
            ctx.frame[:] = ctx.frame * (1 - self.alpha_saida(ctx.t)) + self.fundo * self.alpha_saida(ctx.t)
        self._draw_img(ctx, self.img)

    def _draw_img(self, ctx: Ctx, img: np.ndarray) -> None:
        t = ctx.t
        st = entrada_params(self.s.get("entrada", "pop"), (t - self.de) / float(self.s.get("dur_entrada", 0.32)),
                            ctx.H, img.shape[1] * 0.2)
        im = img
        x, y = self._pos(t, im)
        s_ = st.get("s", 1.0)
        if s_ != 1.0:
            h0, w0 = im.shape[:2]
            im = scaled(im, s_)
            x += (w0 - im.shape[1]) // 2
            y += (h0 - im.shape[0]) // 2
        if st.get("blur", 0) > 0.4:
            im = blurred(im, st["blur"])
        hole = ctx.mask() if self.s.get("camada") == "atras" else None
        paste(ctx.frame, im, int(x + st.get("dx", 0)), int(y + st.get("dy", 0)), st.get("a", 1) * self.alpha_saida(t), hole)


class Video(Imagem):
    def __init__(self, s, W, H, base):
        El.__init__(self, s, W, H, base)
        self.path = self.arquivo(s["arquivo"])
        self.modo = s.get("modo", "cheia")
        if self.modo == "cheia":
            self.vw, self.vh = W, H
            vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
        else:
            info = probe(self.path)
            self.vw = int(float(s.get("largura", 0.6)) * W) // 2 * 2
            self.vh = int(info["h"] * self.vw / info["w"]) // 2 * 2
            vf = f"scale={self.vw}:{self.vh}"
        self.vf = vf
        self.proc = None
        self.fundo = None

    def draw(self, ctx: Ctx) -> None:
        if self.proc is None:
            ss = float(self.s.get("inicio", 0)) + (ctx.t - self.de)
            self.proc = subprocess.Popen([FF, "-v", "error", "-ss", f"{ss:.3f}", "-i", str(self.path), "-an",
                                          "-vf", self.vf + f",fps={ctx.fps}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        n = self.vw * self.vh * 3
        buf = self.proc.stdout.read(n)
        if len(buf) < n:
            return
        rgb = np.frombuffer(buf, np.uint8).reshape(self.vh, self.vw, 3).astype(np.float32) / 255
        if self.modo == "cheia":
            a = ease((ctx.t - self.de) / 0.12) * self.alpha_saida(ctx.t, d=0.12)
            ctx.frame[:] = ctx.frame * (1 - a) + rgb * a
            return
        a4 = np.concatenate([rgb, np.ones((self.vh, self.vw, 1), np.float32)], 2)
        self._draw_img(ctx, self._moldar(a4, self.s, ctx.W))

    def fim(self):
        if self.proc:
            self.proc.kill()


class Cinetica(El):
    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        self.tx = Texto(dict(s, tipo="texto", camada="frente", ancora="tela",
                             entrada=s.get("entrada", "foco"), saida=s.get("saida", "foco")), W, H, base)
        self.fundo = hexc(s.get("fundo", "#FBFBF6"))
        self.glow = None
        if s.get("brilho"):
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            d = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - float(s.get("y", 0.45)) * H) / H) ** 2)
            g = np.clip(1 - d / 0.45, 0, 1) ** 2 * 0.16
            self.glow = (hexc(s["brilho"]) - self.fundo)[None, None, :] * g[..., None]

    def draw(self, ctx: Ctx) -> None:
        a = ease((ctx.t - self.de) / 0.08) * self.alpha_saida(ctx.t, d=0.12)
        bg = np.empty_like(ctx.frame)
        bg[:] = self.fundo
        if self.glow is not None:
            bg += self.glow
        ctx.frame[:] = ctx.frame * (1 - a) + bg * a
        self.tx.draw(ctx)


class Cta(El):
    def __init__(self, s, W, H, base):
        super().__init__(s, W, H, base)
        from PIL import Image, ImageDraw
        from el_texto import font, hex_rgb
        pw = int(float(s.get("largura", 0.84)) * W)
        ph = int(W * 0.078)
        im = Image.new("RGBA", (pw * 2, ph * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((0, 0, pw * 2 - 1, ph * 2 - 1), radius=ph, fill=(255, 255, 255, 255))
        f1 = font("poppins_semi", int(W * 0.03) * 2)
        f2 = font("poppins", int(W * 0.026) * 2)
        bt = s.get("botao", "SAIBA MAIS")
        bw = int(f2.getlength(bt)) + int(W * 0.06) * 2
        bh = int(ph * 0.66) * 2
        bx0, by0 = pw * 2 - bw - int(ph * 0.17) * 2, (ph * 2 - bh) // 2
        acc = tuple(int(c * 255) for c in hex_rgb(s.get("cor", "#D4FF00")))
        self.btn = (bx0 // 2, by0 // 2, (bx0 + bw) // 2, (by0 + bh) // 2)
        d.rounded_rectangle((bx0, by0, bx0 + bw, by0 + bh), radius=bh // 2, fill=acc + (255,))
        d.text((bx0 + bw // 2, ph), bt, font=f2, fill=(17, 17, 17, 255), anchor="mm")
        d.text((int(ph * 0.45) * 2, ph), s.get("texto", ""), font=f1, fill=(51, 51, 51, 255), anchor="lm")
        im = im.resize((pw, ph), Image.LANCZOS)
        a = np.asarray(im, np.float32) / 255
        self.pill = Imagem._moldar(a, {"sombra": 0.35}, W)
        self.m = (self.pill.shape[1] - pw) // 2
        self.pw, self.ph = pw, ph
        cur = Image.new("RGBA", (120, 160), (0, 0, 0, 0))
        dc = ImageDraw.Draw(cur)
        pts = [(8, 6), (8, 128), (38, 98), (58, 146), (78, 138), (58, 92), (100, 92)]
        dc.polygon(pts, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=7)
        cs = int(W * 0.05)
        cur = cur.resize((cs, int(cs * 160 / 120)), Image.LANCZOS)
        c = np.asarray(cur, np.float32) / 255
        self.cursor = np.concatenate([c[..., :3] * c[..., 3:4], c[..., 3:4]], 2)

    def draw(self, ctx: Ctx) -> None:
        t, W, H = ctx.t, ctx.W, ctx.H
        st = entrada_params("pop", (t - self.de) / 0.32, H, 1)
        aout = self.alpha_saida(t)
        im = scaled(self.pill, st["s"])
        cx, cy = W // 2, int(float(self.s.get("y", 0.36)) * H)
        paste(ctx.frame, im, cx - im.shape[1] // 2, cy - im.shape[0] // 2, st["a"] * aout)
        tc = float(self.s.get("clique_em", self.de + 1.2))
        ox, oy = cx - self.pw // 2, cy - self.ph // 2
        bx = ox + (self.btn[0] + self.btn[2]) // 2
        by = oy + (self.btn[1] + self.btn[3]) // 2
        if t >= tc:
            r = ease((t - tc) / 0.4)
            if r < 1:
                import cv2
                lay = np.zeros((H, W), np.float32)
                cv2.circle(lay, (bx, by), int(W * 0.07 * r), 1.0, max(2, W // 300), cv2.LINE_AA)
                a = (lay * (1 - r) * 0.8)[..., None]
                ctx.frame[:] = ctx.frame * (1 - a) + a
        if self.s.get("cursor", True) and t >= tc - 0.8:
            p = ease_io((t - (tc - 0.8)) / 0.65)
            x = int(bx + (1 - p) * W * 0.16)
            y = int(by + (1 - p) * W * 0.12)
            sc = 0.82 if 0 <= t - tc < 0.14 else 1.0
            cur = scaled(self.cursor, sc)
            paste(ctx.frame, cur, x, y, min(1, (t - (tc - 0.8)) / 0.15) * aout)


TIPOS = {"texto": Texto, "clone": Clone, "rastro": Rastro, "foco": Foco, "moldura": Moldura, "imagem": Imagem,
         "video": Video, "cinetica": Cinetica, "cta": Cta}


def carregar(work: Path, W: int, H: int, base: Path) -> list[El]:
    els = []
    ej = work / "elementos.json"
    spec = load_json(ej) if ej.exists() else []
    for s in spec:
        tp = s.get("tipo")
        if tp == "quadro":
            from el_quadro import Quadro
            els.append(Quadro(s, W, H, base))
            continue
        if tp not in TIPOS:
            raise SystemExit(f"elementos.json: tipo '{tp}' não existe. Tipos: {', '.join(list(TIPOS) + ['quadro'])}")
        els.append(TIPOS[tp](s, W, H, base))
    fxp = work / "fx_events.json"
    if fxp.exists():
        for e in load_json(fxp):
            if e["fx"] == "foco":
                els.append(Foco({"tipo": "foco", "t": e["t"], "dur": e.get("dur") or 0.45}, W, H, base))
    return els


def avisos(els: list[El], geo: Geo) -> None:
    for e in els:
        if isinstance(e, Foco):
            continue
        k0, k1 = geo.idx(e.de), geo.idx(max(e.de, e.ate - 1e-3))
        presa = isinstance(e, (Clone, Rastro)) or (isinstance(e, Texto) and (e.plano or e.ancora == "cena"))
        if presa and geo.hard_between(k0, k1):
            print(f"  AVISO: {e.s['tipo']} de {e.de:.2f} a {e.ate:.2f}s atravessa um corte seco; depois do corte a cena é "
                  f"outra e o elemento fica solto. Termine o elemento no corte.")


# ------------------------------------------------------------------ motor

def processar(work: Path, src_base: Path, out: Path, t_ini: float | None = None, so_quadros: list[float] | None = None) -> list:
    g = load_json(work / "geometria.json")
    geo = Geo(g)
    W, H, fps = g["W"], g["H"], g["fps"]
    els = carregar(work, W, H, work)
    if not els:
        return []
    avisos(els, geo)
    from segment import Segmenter
    modelo = "rapido" if g.get("escala", 1.0) < 1 else "fino"       # prévia rápida, render final com a borda melhor
    ctx = Ctx(W, H, fps, geo, lambda: Segmenter(modelo=modelo))
    ctx.modelo = modelo
    ss = ["-ss", f"{t_ini:.3f}"] if t_ini else []
    rd = subprocess.Popen([FF, "-v", "error", *ss, "-i", str(src_base), "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    wr = None
    if so_quadros is None:
        wr = subprocess.Popen([FF, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                               "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "13",
                               "-pix_fmt", "yuv420p", str(out)], stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = W * H * 3
    i = int(round((t_ini or 0) * fps))
    k_prev = None
    ordem = {"cena": 0, "transicao": 1, "moldura": 2, "tela": 3}
    els_ord = sorted(enumerate(els), key=lambda x: (ordem[x[1].estagio], x[0]))
    capt, alvo = [], sorted(so_quadros or [])
    usados = 0
    while True:
        buf = rd.stdout.read(n)
        if len(buf) < n:
            break
        t = i / fps
        k = geo.idx(t)
        ctx.cut = k_prev is not None and k != k_prev and geo.hard_between(k_prev, k)
        k_prev = k
        ativos = [e for _, e in els_ord if e.ativo(t)]
        if ativos:
            usados += 1
            ctx.t, ctx.i = t, i
            ctx.raw = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            ctx._mask = ctx._gray = None
            ctx.frame = ctx.raw.astype(np.float32) / 255
            for e in ativos:
                e.draw(ctx)
            outb = (np.clip(ctx.frame, 0, 1) * 255 + 0.5).astype(np.uint8)
        else:
            outb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            if ctx._seg is not None and ctx.cut:
                ctx._seg.reset()
        if wr:
            wr.stdin.write(outb.tobytes())
        elif alvo and t + 0.5 / fps >= alvo[0]:
            capt.append((alvo.pop(0), outb.copy()))
            if not alvo:
                break
        i += 1
    rd.kill()
    for e in els:
        if hasattr(e, "fim"):
            e.fim()
    if ctx._seg is not None:
        ctx._seg.close()
    if wr:
        wr.stdin.close()
        wr.wait()
        print(f"elementos: {len(els)} ({', '.join(sorted({e.s['tipo'] for e in els}))}), {usados} quadros trabalhados -> {out}")
    return capt


def quadro_grade(img: np.ndarray, path: Path, t: float) -> None:
    """Quadro com grade de 10% e rótulos, para escolher posição e os 4 cantos de um plano."""
    import cv2
    im = img.copy()
    H, W = im.shape[:2]
    for k in range(1, 10):
        x, y = int(W * k / 10), int(H * k / 10)
        cv2.line(im, (x, 0), (x, H), (255, 255, 0), 1, cv2.LINE_AA)
        cv2.line(im, (0, y), (W, y), (255, 255, 0), 1, cv2.LINE_AA)
        cv2.putText(im, f"{k / 10:.1f}", (x + 3, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2, cv2.LINE_AA)
        cv2.putText(im, f"{k / 10:.1f}", (4, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2, cv2.LINE_AA)
    for k in range(1, 20):
        x, y = int(W * k / 20), int(H * k / 20)
        cv2.line(im, (x, 0), (x, H), (255, 255, 0), 1) if k % 2 else None
        cv2.line(im, (0, y), (W, y), (255, 255, 0), 1) if k % 2 else None
    cv2.putText(im, f"t={t:.2f}s", (W - 190, H - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 0), 2, cv2.LINE_AA)
    from PIL import Image
    Image.fromarray(im).save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--quadro", type=float, help="exporta o quadro do vídeo final nesse instante com grade de coordenadas")
    ap.add_argument("--previa", help="instantes (s) separados por vírgula: mostra esses quadros já com os elementos")
    a = ap.parse_args()
    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    base = work / "base.mp4"
    vdir = work / "verify"
    vdir.mkdir(exist_ok=True)
    if a.quadro is not None:
        srcv = base if base.exists() else next((p for p in (work / "preview.mp4", work / "final.mp4") if p.exists()), None)
        if srcv is None:
            raise SystemExit("Ainda não há vídeo renderizado. Rode render.py --preview antes (ele gera base.mp4).")
        from PIL import Image
        f = vdir / f"quadro_{a.quadro:.2f}.png"
        run([FF, "-v", "error", "-y", "-ss", f"{a.quadro:.3f}", "-i", srcv, "-frames:v", 1, f])
        quadro_grade(np.array(Image.open(f).convert("RGB")), f, a.quadro)
        print(f"quadro com grade: {f}  (fonte: {srcv.name})")
        return
    if a.previa:
        if not base.exists():
            raise SystemExit("Falta base.mp4. Rode render.py (com --preview serve) uma vez.")
        ts = [float(x) for x in a.previa.split(",")]
        from PIL import Image
        g = load_json(work / "geometria.json")
        els = carregar(work, g["W"], g["H"], work)
        tiles = []
        for t in ts:
            ini = min([e.de for e in els if e.de <= t <= e.ate + 0.5] or [t])
            ini = max(0.0, ini - 0.05)
            cap = processar(work, base, work / "_previa.mp4", t_ini=ini, so_quadros=[t])
            if cap:
                tiles.append(cap[0][1])
        if not tiles:
            raise SystemExit("Nenhum quadro capturado.")
        h = min(x.shape[0] for x in tiles)
        sheet = Image.fromarray(np.concatenate([x[:h] for x in tiles], 1))
        sheet.thumbnail((2400, 1400))
        p = vdir / "previa_elementos.png"
        sheet.save(p)
        print(f"prévia: {p}")
        return
    if not base.exists():
        raise SystemExit("Falta base.mp4 (o render.py gera e chama este script sozinho).")
    processar(work, base, work / "base_el.mp4")


_ = save_json

if __name__ == "__main__":
    main()

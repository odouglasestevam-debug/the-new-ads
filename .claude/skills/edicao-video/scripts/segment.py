"""Recorte de pessoa quadro a quadro (MediaPipe selfie_multiclass, local).

Base dos efeitos que interagem com a cena: texto atrás da pessoa, texto no chão com oclusão (a pessoa pisa
em cima), clones e rastro. Devolve máscara float 0..1 no tamanho do quadro.

Qualidade: o modelo trabalha em 256x256. A borda é refinada com filtro guiado pela imagem (o cabelo e o contorno
seguem a foto, não o quadradinho do modelo) e suavizada no tempo (sem tremer de um quadro para o outro).
Funciona bem com pessoa inteira ou de meio corpo, de frente, com fundo que não seja da cor da roupa.
Conferir sempre a folha de máscara (`python segment.py VIDEO --teste 3.2,8.0`).

Uso: python segment.py VIDEO --teste 1.0,5.0,9.0 [--out pasta]
"""
from __future__ import annotations

import os

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np

from common import ASSETS_DIR

MODELOS = {
    "fino": ASSETS_DIR / "selfie_multiclass_256x256.tflite",     # ~120 ms/quadro, borda melhor (render final)
    "rapido": ASSETS_DIR / "selfie_segmenter.tflite",           # ~7 ms/quadro (prévia)
}


def _box(x: np.ndarray, r: int) -> np.ndarray:
    import cv2
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)


def guided(I: np.ndarray, p: np.ndarray, r: int, eps: float) -> np.ndarray:
    """Filtro guiado (He et al.) em tons de cinza: a máscara ganha a borda da imagem."""
    mI, mp_ = _box(I, r), _box(p, r)
    cov = _box(I * p, r) - mI * mp_
    var = _box(I * I, r) - mI * mI
    a = cov / (var + eps)
    b = mp_ - a * mI
    return _box(a, r) * I + _box(b, r)


class Segmenter:
    """seg = Segmenter(); m = seg(frame_rgb_uint8)  -> máscara float32 HxW (1 = pessoa)."""

    def __init__(self, smooth: float = 0.55, work_w: int = 540, modelo: str = "fino"):
        MODEL = MODELOS[modelo]
        if not MODEL.exists():
            raise SystemExit("Falta o modelo de recorte. Rode: python fetch_assets.py --only seg")
        self.multi = modelo == "fino"
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
            base_options=mpt.BaseOptions(model_asset_path=str(MODEL)), running_mode=vision.RunningMode.IMAGE,
            output_confidence_masks=True, output_category_mask=False))
        self.smooth = smooth            # peso do quadro anterior (0 = sem suavização no tempo)
        self.work_w = work_w
        self.prev: np.ndarray | None = None

    def close(self) -> None:
        """Fechar explicitamente: o fechamento automático do MediaPipe na saída do Python pode travar por minutos."""
        if self.seg is not None:
            self.seg.close()
            self.seg = None

    def reset(self) -> None:
        """Chamar em corte seco: a máscara do plano anterior não vale para o novo."""
        self.prev = None

    def raw(self, rgb: np.ndarray) -> np.ndarray:
        """Probabilidade de pessoa (1 - fundo), na resolução de trabalho."""
        import cv2
        h, w = rgb.shape[:2]
        ww = self.work_w
        wh = int(round(h * ww / w))
        small = cv2.resize(rgb, (ww, wh), interpolation=cv2.INTER_AREA)
        res = self.seg.segment(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(small)))
        m = res.confidence_masks[0].numpy_view()          # multiclasse: canal 0 = fundo; selfie: canal 0 = pessoa
        m = cv2.resize(m, (ww, wh), interpolation=cv2.INTER_LINEAR)
        return ((1.0 - m) if self.multi else m).astype(np.float32), small

    def __call__(self, rgb: np.ndarray, reset: bool = False) -> np.ndarray:
        import cv2
        if reset:
            self.reset()
        h, w = rgb.shape[:2]
        p, small = self.raw(rgb)
        gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
        r = max(2, self.work_w // 90)
        q = np.clip(guided(gray, p, r, 1e-3), 0, 1)
        q = np.clip((q - 0.25) / 0.5, 0, 1)                 # contraste: tira o halo meio-transparente
        if self.prev is not None and self.prev.shape == q.shape:
            q = self.smooth * self.prev + (1 - self.smooth) * q
        self.prev = q
        m = cv2.resize(q, (w, h), interpolation=cv2.INTER_LINEAR)
        return cv2.GaussianBlur(m, (0, 0), max(0.8, w / 1080))


def main() -> None:
    import argparse
    import tempfile
    from pathlib import Path

    from PIL import Image

    from common import FF, run
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--teste", required=True, help="instantes (s) separados por vírgula")
    ap.add_argument("--out")
    ap.add_argument("--modelo", choices=list(MODELOS), default="fino")
    a = ap.parse_args()
    src = Path(a.video).resolve()
    out = Path(a.out) if a.out else src.parent / "_edicao" / src.stem / "verify"
    out.mkdir(parents=True, exist_ok=True)
    seg = Segmenter(smooth=0, modelo=a.modelo)
    tiles = []
    for t in [float(x) for x in a.teste.split(",")]:
        f = Path(tempfile.mkdtemp()) / "q.png"
        run([FF, "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", src, "-frames:v", 1, f])
        rgb = np.array(Image.open(f).convert("RGB"))
        m = seg(rgb, reset=True)
        red = rgb.copy().astype(np.float32)
        red = red * (1 - 0.55 * m[..., None]) + np.array([255, 40, 40]) * 0.55 * m[..., None]
        cut = (rgb * m[..., None] + np.array([0, 255, 0]) * (1 - m[..., None])).astype(np.uint8)
        row = np.concatenate([rgb, red.astype(np.uint8), cut], axis=1)
        tiles.append(row)
    sheet = Image.fromarray(np.concatenate(tiles, axis=0))
    sheet.thumbnail((1800, 4000))
    p = out / "mascara.png"
    sheet.save(p)
    seg.close()
    print(f"folha de máscara (original | máscara | recorte sobre verde): {p}")


if __name__ == "__main__":
    main()

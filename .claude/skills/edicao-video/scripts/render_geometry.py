"""Geometria compartilhada: tamanho de saída por formato e caixas de corte/zoom.

(fx, fy) = onde está o rosto, em fração da imagem de origem (0 a 1). O recorte de formato é
centrado no rosto e o zoom é feito EM TORNO do rosto: ele continua no mesmo lugar da tela,
só o fundo se aproxima.
"""
from __future__ import annotations

ASPECTS = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}


def even(n: float) -> int:
    return int(n) // 2 * 2


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def target_size(sw: int, sh: int, aspect: str) -> tuple[int, int]:
    if aspect in ASPECTS:
        return ASPECTS[aspect]
    return even(sw), even(sh)           # "original"


def base_box(sw: int, sh: int, W: int, H: int, fx: float, fy: float) -> tuple[int, int, int, int]:
    """Maior caixa com a proporção da saída dentro da origem, centrada no rosto."""
    ar = W / H
    if sw / sh > ar:
        bw, bh = even(sh * ar), even(sh)
    else:
        bw, bh = even(sw), even(sw / ar)
    bx = int(clamp(fx * sw - bw / 2, 0, sw - bw))
    by = int(clamp(fy * sh - bh / 2, 0, sh - bh))
    return bw, bh, bx, by


def face_uv(sw: int, sh: int, W: int, H: int, fx: float, fy: float) -> tuple[float, float]:
    """Posição do rosto dentro da caixa base, em fração (0 a 1) da imagem de saída."""
    bw, bh, bx, by = base_box(sw, sh, W, H, fx, fy)
    return clamp((fx * sw - bx) / bw, 0, 1), clamp((fy * sh - by) / bh, 0, 1)


def zoom_box(sw: int, sh: int, W: int, H: int, z: float, fx: float, fy: float) -> tuple[int, int, int, int]:
    """Caixa de corte (na resolução da origem) para um punch-in de fator z em torno do rosto."""
    bw, bh, bx, by = base_box(sw, sh, W, H, fx, fy)
    cw, ch = even(bw / z), even(bh / z)
    px, py = fx * sw, fy * sh
    x = int(clamp(px - (px - bx) * cw / bw, bx, bx + bw - cw))
    y = int(clamp(py - (py - by) * ch / bh, by, by + bh - ch))
    return cw, ch, x, y

"""Geometria compartilhada: tamanho de saída por formato e caixas de corte/zoom."""
from __future__ import annotations

ASPECTS = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}


def even(n: float) -> int:
    return int(n) // 2 * 2


def target_size(sw: int, sh: int, aspect: str) -> tuple[int, int]:
    if aspect in ASPECTS:
        return ASPECTS[aspect]
    return even(sw), even(sh)           # "original"


def base_box(sw: int, sh: int, W: int, H: int, fx: float, fy: float) -> tuple[int, int, int, int]:
    """Maior caixa com a proporção da saída dentro da origem, posicionada pelo foco (fx, fy)."""
    ar = W / H
    if sw / sh > ar:
        bw, bh = even(sh * ar), even(sh)
    else:
        bw, bh = even(sw), even(sw / ar)
    bx = int((sw - bw) * fx)
    by = int((sh - bh) * fy)
    return bw, bh, bx, by


def zoom_box(sw: int, sh: int, W: int, H: int, z: float, fx: float, fy: float) -> tuple[int, int, int, int]:
    """Caixa de corte (na resolução da origem) para um punch-in de fator z."""
    bw, bh, bx, by = base_box(sw, sh, W, H, fx, fy)
    cw, ch = even(bw / z), even(bh / z)
    x = int(bx + (bw - cw) * fx)
    y = int(by + (bh - ch) * fy)
    return cw, ch, x, y

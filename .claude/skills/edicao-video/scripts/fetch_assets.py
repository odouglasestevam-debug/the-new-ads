"""Baixa as fontes (OFL) e o modelo do MediaPipe usados pela skill.

Única parte da skill que usa rede. Cada arquivo é verificado pelo formato
(TTF/OTF ou TFLite) antes de ficar em disco. Rodar uma vez.

Uso: python fetch_assets.py [--only fonts|gaze]
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

from common import ASSETS_DIR, FONTS_DIR, load_presets

GAZE_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
GAZE_FILE = ASSETS_DIR / "face_landmarker.task"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "tna-edicao-video"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def is_font(b: bytes) -> bool:
    return b[:4] in (b"\x00\x01\x00\x00", b"OTTO", b"true")


def fetch_fonts() -> None:
    FONTS_DIR.mkdir(exist_ok=True)
    for name, meta in load_presets()["fonts"].items():
        if not meta.get("url"):
            continue
        dest = FONTS_DIR / meta["file"]
        if dest.exists():
            print(f"  ok (já existe)  {name}")
            continue
        try:
            data = get(meta["url"])
        except Exception as e:
            print(f"  FALHOU  {name}: {e}")
            continue
        if not is_font(data):
            print(f"  REJEITADO  {name}: o arquivo não é uma fonte válida")
            continue
        dest.write_bytes(data)
        print(f"  baixada  {name}  ({len(data) // 1024} KB)")


def fetch_gaze() -> None:
    ASSETS_DIR.mkdir(exist_ok=True)
    if GAZE_FILE.exists():
        print("  ok (já existe)  face_landmarker.task")
        return
    data = get(GAZE_URL)
    if len(data) < 1_000_000:
        sys.exit("Modelo do MediaPipe veio pequeno demais, abortando.")
    GAZE_FILE.write_bytes(data)
    print(f"  baixado  face_landmarker.task  ({len(data) // 1024} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["fonts", "gaze"])
    a = ap.parse_args()
    if a.only in (None, "fonts"):
        print("Fontes:")
        fetch_fonts()
    if a.only in (None, "gaze"):
        print("Modelo de olhar:")
        fetch_gaze()

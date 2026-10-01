"""Baixa as fontes (OFL), os modelos do MediaPipe e as trilhas de fundo (Mixkit) usados pela skill.

Única parte da skill que usa rede. Cada arquivo é verificado pelo formato
(TTF/OTF, TFLite ou MP3) antes de ficar em disco. Rodar uma vez.

Uso: python fetch_assets.py [--only fonts|gaze|seg|musica]
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

from common import ASSETS_DIR, FONTS_DIR, load_presets

GAZE_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
GAZE_FILE = ASSETS_DIR / "face_landmarker.task"
# recorte de pessoa (texto atrás da pessoa, perspectiva com oclusão, clones, rastro). Mesma origem do modelo de rosto.
SEG_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
SEG_FILE = ASSETS_DIR / "selfie_multiclass_256x256.tflite"
SEG_RAPIDO_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
SEG_RAPIDO_FILE = ASSETS_DIR / "selfie_segmenter.tflite"           # versão leve, usada na prévia


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


def fetch_seg() -> None:
    ASSETS_DIR.mkdir(exist_ok=True)
    for url, dest, minimo in ((SEG_URL, SEG_FILE, 500_000), (SEG_RAPIDO_URL, SEG_RAPIDO_FILE, 100_000)):
        if dest.exists():
            print(f"  ok (já existe)  {dest.name}")
            continue
        data = get(url)
        if len(data) < minimo or b"TFL3" not in data[:16]:
            sys.exit(f"Modelo {dest.name} veio pequeno demais ou não é TFLite, abortando.")
        dest.write_bytes(data)
        print(f"  baixado  {dest.name}  ({len(data) // 1024} KB)")


def is_mp3(b: bytes) -> bool:
    return b[:3] == b"ID3" or (len(b) > 1 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0)


def fetch_musica() -> None:
    """Trilhas do acervo (assets/musica/catalogo.json). Só baixa do host listado na faixa, e só se o arquivo for mp3."""
    import json
    pasta = ASSETS_DIR / "musica"
    cat = json.loads((pasta / "catalogo.json").read_text(encoding="utf-8"))
    for f in cat["faixas"]:
        dest = pasta / f["arquivo"]
        if dest.exists():
            print(f"  ok (já existe)  {f['arquivo']}  {f['titulo']}")
            continue
        if not f["url"].startswith("https://assets.mixkit.co/music/"):
            print(f"  RECUSADO  {f['arquivo']}: host fora da lista")
            continue
        try:
            data = get(f["url"])
        except Exception as e:
            print(f"  FALHOU  {f['arquivo']}: {e}")
            continue
        if len(data) < 300_000 or not is_mp3(data):
            print(f"  REJEITADO  {f['arquivo']}: não é mp3 ou veio pequeno demais")
            continue
        dest.write_bytes(data)
        print(f"  baixada  {f['arquivo']}  {f['titulo']}  ({len(data) // 1024} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["fonts", "gaze", "seg", "musica"])
    a = ap.parse_args()
    if a.only in (None, "musica"):
        print("Trilhas de fundo:")
        fetch_musica()
    if a.only in (None, "fonts"):
        print("Fontes:")
        fetch_fonts()
    if a.only in (None, "gaze"):
        print("Modelo de olhar:")
        fetch_gaze()
    if a.only in (None, "seg"):
        print("Modelo de recorte de pessoa:")
        fetch_seg()

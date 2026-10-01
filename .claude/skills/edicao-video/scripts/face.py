"""Acha onde está o rosto no vídeo (MediaPipe, local) para enquadrar e dar zoom no lugar certo.

Amostra alguns quadros dentro dos trechos que ficam no vídeo final e usa a mediana.
Salva <work>/face.json: {"fx","fy","top","bottom","n"} (frações da imagem de origem).

Uso: python face.py VIDEO [--work DIR] [--n 9]
"""
from __future__ import annotations

import os

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import argparse
from pathlib import Path

import numpy as np

from common import ASSETS_DIR, FF, load_json, probe, run, save_json, work_dir_for

MODEL = ASSETS_DIR / "face_landmarker.task"


def detect(video: Path, times: list[float]) -> dict | None:
    if not MODEL.exists():
        return None
    import tempfile

    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    from PIL import Image

    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=str(MODEL)), running_mode=vision.RunningMode.IMAGE, num_faces=1))
    pts = []
    tmp = Path(tempfile.mkdtemp())
    for k, t in enumerate(times):
        f = tmp / f"{k}.jpg"
        run([FF, "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", video, "-frames:v", 1, "-vf", "scale=540:-2", "-q:v", 2, f])
        if not f.exists():
            continue
        img = np.array(Image.open(f).convert("RGB"))
        res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=img))
        if res.face_landmarks:
            xs = [p.x for p in res.face_landmarks[0]]
            ys = [p.y for p in res.face_landmarks[0]]
            pts.append((np.mean([min(xs), max(xs)]), np.mean([min(ys), max(ys)]), min(ys), max(ys)))
    lm.close()                      # sem isso o MediaPipe pode travar minutos na saída do Python
    if not pts:
        return None
    a = np.median(np.array(pts), axis=0)
    return {"fx": round(float(a[0]), 3), "fy": round(float(a[1]), 3), "top": round(float(a[2]), 3),
            "bottom": round(float(a[3]), 3), "n": len(pts)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--n", type=int, default=9)
    a = ap.parse_args()
    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    edl = work / "edl.json"
    if edl.exists():
        clips = load_json(edl)["clips"]
        times = [(c["in"] + c["out"]) / 2 for c in clips]
        times = [times[int(i)] for i in np.linspace(0, len(times) - 1, min(a.n, len(times)))]
    else:
        d = probe(video)["duration"]
        times = list(np.linspace(d * 0.05, d * 0.95, a.n))
    r = detect(video, times)
    if not r:
        raise SystemExit("Não achei rosto (ou falta o modelo: python fetch_assets.py --only gaze).")
    save_json(work / "face.json", r)
    print(f"rosto: centro ({r['fx']:.2f}, {r['fy']:.2f}), topo {r['top']:.2f}, queixo {r['bottom']:.2f}  ({r['n']} quadros)")


if __name__ == "__main__":
    main()

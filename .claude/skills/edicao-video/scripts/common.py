"""Base compartilhada da skill edicao-video: ffmpeg, probe, áudio, EDL, presets.

Tudo roda local. Nenhuma chamada de rede aqui.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SKILL_DIR = Path(__file__).resolve().parent.parent
FONTS_DIR = SKILL_DIR / "fonts"
ASSETS_DIR = SKILL_DIR / "assets"
PRESETS_PATH = SKILL_DIR / "presets.json"


# ---------------------------------------------------------------- ffmpeg

def find_ffmpeg() -> str:
    env = os.environ.get("TNA_FFMPEG")
    if env and Path(env).exists():
        return env
    w = shutil.which("ffmpeg")
    if w:
        return w
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg não encontrado. Instale (pip install imageio-ffmpeg) ou defina TNA_FFMPEG.")


FF = find_ffmpeg()


def run(cmd: list, quiet: bool = True, cwd: str | Path | None = None) -> subprocess.CompletedProcess:
    cmd = [str(c) for c in cmd]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=cwd)
    if r.returncode != 0:
        tail = "\n".join(r.stderr.strip().splitlines()[-25:])
        sys.exit(f"ffmpeg falhou (código {r.returncode}):\n{tail}")
    return r


def probe(path: str | Path) -> dict:
    """Dimensões de exibição (já com rotação), fps, duração e se tem áudio."""
    r = subprocess.run([FF, "-hide_banner", "-i", str(path)], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    err = r.stderr
    d = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", err)
    if not d:
        sys.exit(f"Não consegui ler o vídeo: {path}")
    dur = int(d[1]) * 3600 + int(d[2]) * 60 + float(d[3])
    v = re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", err)
    if not v:
        sys.exit(f"Sem trilha de vídeo em {path}")
    w, h = int(v[1]), int(v[2])
    rot = re.search(r"rotation of (-?\d+(?:\.\d+)?) degrees", err)
    if rot and int(round(abs(float(rot[1])))) % 180 == 90:
        w, h = h, w
    fps = re.search(r"(\d+(?:\.\d+)?) fps", err)
    return {"w": w, "h": h, "fps": float(fps[1]) if fps else 30.0, "duration": dur,
            "has_audio": "Audio:" in err}


def extract_wav(src: str | Path, dest: str | Path, sr: int = 16000, filt: str | None = None) -> Path:
    dest = Path(dest)
    if dest.exists():
        return dest
    cmd = [FF, "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", sr]
    if filt:
        cmd += ["-af", filt]
    run(cmd + ["-c:a", "pcm_s16le", dest])
    return dest


def read_wav(path: str | Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        return x, w.getframerate()


def write_wav(path: str | Path, x: np.ndarray, sr: int) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- energia da fala

class Envelope:
    """Envelope RMS em dB a cada 10 ms. Limiar = 22 dB abaixo da fala típica."""

    HOP = 100  # quadros por segundo

    def __init__(self, wav: str | Path):
        x, sr = read_wav(wav)
        hop = sr // self.HOP
        k = len(x) // hop
        rms = np.sqrt((x[: k * hop].reshape(k, hop) ** 2).mean(1)) + 1e-9
        self.db = 20 * np.log10(rms)
        loud = self.db[self.db > np.percentile(self.db, 60)]
        self.thr = float(np.median(loud)) - 22
        self.n = k

    def onset(self, t0: float, t1: float) -> float:
        """Primeiro instante com fala real entre t0 e t1."""
        for i in range(max(0, int(t0 * self.HOP)), min(self.n - 3, int(t1 * self.HOP))):
            if (self.db[i:i + 3] > self.thr).all():
                return i / self.HOP
        return t0

    def offset(self, t0: float, tmax: float) -> float:
        """Fim real da fala a partir de t0 (150 ms abaixo do limiar)."""
        for i in range(max(0, int(t0 * self.HOP)), min(self.n - 15, int(tmax * self.HOP))):
            if (self.db[i:i + 15] < self.thr).all():
                return i / self.HOP
        return tmax

    def peak_db(self, t0: float, t1: float) -> float:
        a, b = int(t0 * self.HOP), max(int(t1 * self.HOP), int(t0 * self.HOP) + 1)
        seg = self.db[a:b]
        return float(seg.max()) if len(seg) else -120.0


# ---------------------------------------------------------------- EDL / linha do tempo

def load_json(p: str | Path):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def save_json(p: str | Path, obj) -> None:
    Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def src_to_out(edl: dict, t: float) -> float | None:
    """Tempo do vídeo de origem -> tempo no vídeo final. None se a palavra foi cortada."""
    for c in edl["clips"]:
        if c["in"] <= t < c["out"]:
            return c["t0"] + t - c["in"]
    return None


def clip_of(edl: dict, t: float) -> dict | None:
    for c in edl["clips"]:
        if c["in"] <= t < c["out"]:
            return c
    return None


def load_presets() -> dict:
    return load_json(PRESETS_PATH)


def merge_profile(base: dict, profile: dict | None) -> dict:
    out = dict(base)
    if profile:
        out.update({k: v for k, v in profile.items() if v is not None})
    return out


# ---------------------------------------------------------------- cores e texto

def hex_to_ass(hexcolor: str, alpha: int = 0) -> str:
    """#RRGGBB -> &HAABBGGRR (formato ASS). Em tags inline, usar ass_bgr()."""
    h = hexcolor.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_bgr(hexcolor: str) -> str:
    h = hexcolor.lstrip("#")
    return f"&H{h[4:6]}{h[2:4]}{h[0:2]}&".upper()


DASHES = ("\u2014", "\u2013", "\u2012", "\u2015")


def clean_text(s: str) -> str:
    """Sem travessão (regra da TNA) e sem caracteres que quebram o ASS."""
    for d in DASHES:
        s = s.replace(d, ", ")
    return re.sub(r"[{}\\]", "", s).strip()


def norm(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s)


def ts(x: float) -> str:
    x = max(0.0, x)
    return f"{int(x // 3600)}:{int(x % 3600 // 60):02d}:{x % 60:05.2f}"


def font_available(family: str) -> bool:
    """Confere se a fonte existe de verdade (evita cair em 'quase Arial' em silêncio)."""
    from PIL import ImageFont
    dirs = [FONTS_DIR, Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Windows/Fonts"]
    want = family.lower().strip()
    for d in dirs:
        if not d.exists():
            continue
        for f in list(d.glob("*.ttf")) + list(d.glob("*.otf")):
            try:
                fam, sty = ImageFont.truetype(str(f), 20).getname()
            except Exception:
                continue
            if fam.lower() == want or f"{fam} {sty}".lower() == want:
                return True
    return False


def work_dir_for(video: str | Path, work: str | None) -> Path:
    v = Path(video).resolve()
    w = Path(work).resolve() if work else v.parent / "_edicao" / v.stem
    w.mkdir(parents=True, exist_ok=True)
    return w


def db_to_lin(db: float) -> float:
    return 10 ** (db / 20)


def fmt_dur(s: float) -> str:
    m, sec = divmod(s, 60)
    return f"{int(m)}:{sec:05.2f}" if m else f"{sec:.2f}s"


__all__ = [n for n in dir() if not n.startswith("_")]
_ = math  # noqa

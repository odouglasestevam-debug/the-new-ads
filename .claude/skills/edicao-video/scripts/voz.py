"""Tratamento de voz (tira eco e ruído de mic distante) com VoiceFixer, local.

Procedimento validado no caso IPTU/Regularize (memória: edicao-video-olhar-e-eco):
  - VoiceFixer modo 0 (não empilhar RNNoise por cima: derruba a clareza);
  - alinhar o resultado com o áudio da câmera por correlação (o VoiceFixer desloca de -3 a +23 ms),
    senão a fala sai "gaguejada" nas emendas;
  - NUNCA decidir corte pelo áudio restaurado (ele zera fechamento de consoante e o detector acha que a
    palavra acabou). Os cortes seguem saindo do áudio original (plan_cuts.py);
  - o VoiceFixer deixa a voz "fanha" (tira corpo em 160-300 Hz): o render aplica EQ compensatória depois.

Gera <work>/voz_restaurada.wav (mono 48k, mesma linha do tempo do vídeo de origem). O render usa esse arquivo
no lugar do áudio da câmera quando ele existe (desligue com --voz original).

Uso: python voz.py VIDEO [--work DIR] [--modo 0]
"""
from __future__ import annotations

import os

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import argparse
import time
import warnings
from pathlib import Path

import numpy as np

from common import FF, read_wav, run, work_dir_for, write_wav

warnings.filterwarnings("ignore")


def achar_lag(ref: np.ndarray, sig: np.ndarray, sr: int, max_ms: int = 120) -> int:
    """Atraso (em amostras) de `sig` em relação a `ref`, por correlação cruzada. Positivo = sig atrasado."""
    n = min(len(ref), len(sig), sr * 40)
    a = ref[:n] - ref[:n].mean()
    b = sig[:n] - sig[:n].mean()
    size = 1 << (2 * n - 1).bit_length()
    c = np.fft.irfft(np.fft.rfft(a, size) * np.conj(np.fft.rfft(b, size)), size)
    m = int(sr * max_ms / 1000)
    cand = np.concatenate([c[-m:], c[:m + 1]])            # lags de -m a +m
    # c[k] é máximo quando ref[n+k] = sig[n], ou seja, k>0 significa que sig está ADIANTADO; invertemos para
    # devolver "atraso de sig" (positivo = sig chega depois da referência)
    return -(int(np.argmax(cand)) - m)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--modo", type=int, default=0, choices=[0, 1, 2], help="modo do VoiceFixer (0 é o validado)")
    a = ap.parse_args()

    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    out = work / "voz_restaurada.wav"
    if out.exists():
        print(f"cache: {out}")
        return

    orig = work / "voz_orig44.wav"
    if not orig.exists():
        run([FF, "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", 44100, "-c:a", "pcm_s16le", orig])
    rest = work / "voz_vf_bruto.wav"
    if not rest.exists():
        from voicefixer import VoiceFixer
        t0 = time.time()
        print("VoiceFixer (CPU, local)... isso leva alguns minutos", flush=True)
        VoiceFixer().restore(input=str(orig), output=str(rest), cuda=False, mode=a.modo)
        print(f"  restaurado em {time.time() - t0:.0f}s", flush=True)

    x0, sr0 = read_wav(orig)
    x1, sr1 = read_wav(rest)
    if sr1 != sr0:                                          # o VoiceFixer devolve 44,1 kHz; se não, reamostra
        tmp = work / "_vf44.wav"
        run([FF, "-v", "error", "-y", "-i", rest, "-ar", sr0, "-ac", 1, "-c:a", "pcm_s16le", tmp])
        x1, sr1 = read_wav(tmp)
    lag = achar_lag(x0, x1, sr0)
    print(f"alinhamento: restaurado atrasado {lag / sr0 * 1000:+.1f} ms em relação à câmera")
    if lag > 0:
        x1 = x1[lag:]
    elif lag < 0:
        x1 = np.concatenate([np.zeros(-lag, dtype=x1.dtype), x1])
    n = len(x0)
    x1 = np.concatenate([x1, np.zeros(max(0, n - len(x1)))])[:n]
    tmp44 = work / "_vf_alinhado44.wav"
    write_wav(tmp44, x1, sr0)
    run([FF, "-v", "error", "-y", "-i", tmp44, "-ar", 48000, "-ac", 1, "-c:a", "pcm_s16le", out])
    # conferência: depois de alinhar, o lag residual tem que ser ~0
    y, _ = read_wav(out)
    x48 = np.interp(np.arange(len(y)) / 48000, np.arange(len(x0)) / sr0, x0)
    print(f"lag residual: {achar_lag(x48, y, 48000) / 48 :+.1f} ms (esperado ~0)")
    print(f"salvo: {out}")


if __name__ == "__main__":
    main()

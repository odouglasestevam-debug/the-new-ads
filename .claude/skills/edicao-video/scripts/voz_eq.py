"""Equalização da voz por medição: aproxima o espectro médio da fala da curva-padrão de fala (ANSI S3.5, esforço normal).

Por quê (Douglas, 01/10/2026: "a skill está deixando fanho"): a EQ fixa depois do VoiceFixer foi calibrada no IPTU
(mic distante, eco). No vídeo da TNA (celular perto da boca) ela deixou 160 a 630 Hz de 8 a 14 dB acima do normal e
4 a 8 kHz de 12 a 17 dB acima, com 1 a 3 kHz afundado no meio: voz oca e anasalada. Cada gravação pede uma correção
diferente, então a correção é medida em cada vídeo.

Como: espectro médio dos quadros com fala, em terços de oitava; diferença para a curva-padrão, só no FORMATO
(o volume fica com o loudness); suavizada; corte até -9 dB e reforço até +6 dB (reforço maior levantaria chiado).
Sai como um FIR de fase linear do ffmpeg (firequalizer), sem atraso no áudio.

Uso: python voz_eq.py ARQUIVO [--pre "highpass=f=70"]     # mostra medido, alvo, correção e o resultado depois
"""
from __future__ import annotations

import argparse
import subprocess

import numpy as np

from common import FF

TERCOS = [125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000]
# ANSI S3.5-1997, tabela 3, fala com esforço normal: nível espectral (dB/Hz) de 160 Hz a 8 kHz.
# Nível de banda = nível espectral + 10 log10(largura do terço de oitava, 0,2316 f). 125 Hz extrapolado (-3 dB do de 160).
_ESPECTRAL = {160: 32.41, 200: 34.48, 250: 34.75, 315: 33.98, 400: 34.59, 500: 34.27, 630: 32.06, 800: 28.30,
              1000: 25.01, 1250: 23.00, 1600: 20.15, 2000: 17.32, 2500: 13.18, 3150: 11.55, 4000: 9.33, 5000: 5.31,
              6300: 2.59, 8000: 1.13}
ALVO = {f: v + 10 * np.log10(0.2316 * f) for f, v in _ESPECTRAL.items()}
ALVO[125] = ALVO[160] - 3.0
CORTE_MAX, REFORCO_MAX = -9.0, 6.0
SR, N = 32000, 2048


def _pcm(arq, pre: str = "", t_max: float = 120.0) -> np.ndarray:
    cmd = [FF, "-v", "error", "-t", f"{t_max:.1f}", "-i", str(arq)] + (["-af", pre] if pre else []) + \
          ["-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    r = subprocess.run(cmd, capture_output=True)
    return np.frombuffer(r.stdout, np.int16).astype(np.float64) / 32768


def medir(arq, pre: str = "") -> np.ndarray:
    """Nível de cada terço de oitava (dB) nos quadros com fala, centrado na média de 250 Hz a 4 kHz."""
    y = _pcm(arq, pre)
    if len(y) < N * 8:
        raise ValueError("áudio curto demais para medir a voz")
    janela = np.hanning(N)
    S = np.array([np.abs(np.fft.rfft(y[i:i + N] * janela)) ** 2 for i in range(0, len(y) - N, N // 2)])
    e = S.sum(1)
    S = S[e > np.percentile(e, 40)]                        # só quadros com fala (tira pausa e respiração)
    m = S.mean(0)
    fr = np.fft.rfftfreq(N, 1 / SR)
    lv = np.array([10 * np.log10(m[(fr >= f / 2 ** (1 / 6)) & (fr < f * 2 ** (1 / 6))].sum() + 1e-12) for f in TERCOS])
    meio = [i for i, f in enumerate(TERCOS) if 250 <= f <= 4000]
    return lv - lv[meio].mean()


def _alvo() -> np.ndarray:
    a = np.array([ALVO[f] for f in TERCOS])
    meio = [i for i, f in enumerate(TERCOS) if 250 <= f <= 4000]
    return a - a[meio].mean()


def correcao(med: np.ndarray) -> dict[int, float]:
    """Ganho por terço de oitava (dB) que leva a fala medida para o formato da curva-padrão."""
    d = _alvo() - med
    d = np.convolve(np.pad(d, 1, mode="edge"), [0.25, 0.5, 0.25], mode="valid")     # suaviza: nada de pico estreito
    d = np.clip(d, CORTE_MAX, REFORCO_MAX)
    meio = [i for i, f in enumerate(TERCOS) if 250 <= f <= 4000]
    d = d - d[meio].mean()                                                         # só formato; volume é do loudness
    return {f: round(float(v), 1) for f, v in zip(TERCOS, d)}


def filtro(g: dict[int, float]) -> str:
    """FIR de fase linear (firequalizer) desenhado pela curva de ganhos (pontos a cada terço; scale=loglog do ffmpeg lê a frequência em outra unidade e não funciona)."""
    if max(abs(v) for v in g.values()) < 0.5:
        return ""
    fs = sorted(g)
    pts = [(20, g[fs[0]])] + [(f, g[f]) for f in fs] + [(16000, g[fs[-1]])]
    ent = ";".join(f"entry({f},{v:g})" for f, v in pts)
    # o FIR atrasa o áudio no próprio comprimento (delay): o atrim tira esse atraso e a voz continua batendo com a boca
    return f"firequalizer=gain_entry='{ent}':scale=linlog:delay=0.02,atrim=start=0.02,asetpts=PTS-STARTPTS"


def eq_auto(arq, pre: str = "") -> tuple[str, str]:
    """(filtro ffmpeg terminado em vírgula, ou "", resumo legível)."""
    try:
        g = correcao(medir(arq, pre))
    except Exception as e:                                                         # sem medição, sem EQ (não inventa)
        return "", f"sem equalização medida ({e})"
    f = filtro(g)
    return (f + "," if f else ""), "  ".join(f"{k if k < 1000 else format(k / 1000, 'g') + 'k'}:{v:+.1f}" for k, v in g.items())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivo")
    ap.add_argument("--pre", default="", help="filtros antes da medição (ex.: highpass e denoise da cadeia de voz)")
    a = ap.parse_args()
    med = medir(a.arquivo, a.pre)
    alvo = _alvo()
    g = correcao(med)
    pre = (a.pre + "," if a.pre else "") + filtro(g)
    dep = medir(a.arquivo, pre.rstrip(","))
    print("terço Hz  " + "".join(f"{f:>6}" for f in TERCOS))
    print("medido    " + "".join(f"{v:6.1f}" for v in med))
    print("alvo      " + "".join(f"{v:6.1f}" for v in alvo))
    print("depois    " + "".join(f"{v:6.1f}" for v in dep))
    print("erro antes " + f"{np.abs(med - alvo).mean():.1f} dB  | erro depois {np.abs(dep - alvo).mean():.1f} dB (média por terço)")
    print("correção por oitava: " + "  ".join(f"{k}:{v:+.1f}" for k, v in g.items()))


if __name__ == "__main__":
    main()

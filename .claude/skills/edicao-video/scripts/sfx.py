"""Efeitos sonoros sintéticos (sem banco de áudio, sem direito autoral) alinhados à imagem.

Regras (auditoria + vídeo-use): menos efeitos, cada um amarrado a algo visível.
  - whoosh nos cortes onde o zoom muda (pico do som cai na emenda);
  - pop na palavra-chave quando ela entra;
  - impact só em momento pedido (gancho, CTA) via sfx_manual.json;
  - teto por densidade (nível off/leve/media/alta) e distância mínima entre efeitos.

Uso: python sfx.py VIDEO [--work DIR] [--nivel leve|media|alta|off] [--profile perfil.json]
Manual: <work>/sfx_manual.json  ->  [{"t": 12.3, "tipo": "impact"}, {"t": 3.0, "tipo": "tick"}]
Saída: sfx.wav (mono 48k) e sfx_events.json
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from common import load_json, load_presets, merge_profile, save_json, work_dir_for, write_wav

SR = 48000


def _norm(y: np.ndarray) -> np.ndarray:
    return y / (np.abs(y).max() + 1e-9)


def whoosh(d: float = 0.38, seed: int = 7) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = int(SR * d)
    x = r.standard_normal(n)
    a = 0.02 + 0.25 * np.arange(n) / n                      # passa-baixa abrindo = "vuuush"
    y = np.zeros(n)
    lp = 0.0
    for i in range(n):
        lp += a[i] * (x[i] - lp)
        y[i] = lp
    return _norm(y * np.sin(np.linspace(0, np.pi, n)) ** 2)


def impact(d: float = 0.5, seed: int = 11) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = int(SR * d)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 6) + 45) / SR) * np.exp(-t * 7) \
        + 0.25 * r.standard_normal(n) * np.exp(-t * 40)
    return _norm(y)


def tick(d: float = 0.12) -> np.ndarray:
    n = int(SR * d)
    t = np.arange(n) / SR
    return _norm(np.sin(2 * np.pi * 900 * t) * np.exp(-t * 45))


def pop(d: float = 0.25) -> np.ndarray:
    n = int(SR * d)
    t = np.arange(n) / SR
    return _norm(np.sin(2 * np.pi * np.cumsum(600 + 900 * np.exp(-t * 30)) / SR) * np.exp(-t * 22))


def glitch(d: float = 0.3, seed: int = 5) -> np.ndarray:
    """Rajadas de ruído reduzido (bit-crush) picotadas, que caem rápido."""
    r = np.random.default_rng(seed)
    n = int(SR * d)
    held = np.repeat(r.standard_normal(n // 24 + 1), 24)[:n]
    gate = np.zeros(n)
    i = 0
    while i < n:
        seg = int(r.uniform(0.02, 0.06) * SR)
        if r.random() < 0.65:
            gate[i:i + seg] = 1
        i += seg
    return _norm(held * gate * np.exp(-np.arange(n) / SR * 5))


def shimmer(d: float = 0.35) -> np.ndarray:
    """Varredura aguda ascendente, para acompanhar o flash."""
    n = int(SR * d)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * np.cumsum(1400 + 5200 * t / d) / SR) * np.sin(np.linspace(0, np.pi, n)) ** 2
    return _norm(y)


SOUNDS = {"whoosh": (whoosh, 0.22, 1.0), "pop": (pop, 0.01, 0.8), "impact": (impact, 0.0, 1.3), "tick": (tick, 0.0, 0.7),
          "glitch": (glitch, 0.02, 0.9), "shimmer": (shimmer, 0.10, 0.6)}
# tipo -> (gerador, segundos de antecedência do início do som em relação ao evento, ganho relativo)
PRIORITY = {"impact": 0, "manual": 0, "pop": 1, "glitch": 1, "shimmer": 1, "whoosh": 2, "tick": 2}


def prev_cont(edl: dict, c: dict) -> bool:
    i = edl["clips"].index(c)
    return i > 0 and edl["clips"][i - 1]["cont"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--profile")
    ap.add_argument("--segmento", default="padrao")
    ap.add_argument("--nivel", choices=["off", "leve", "media", "alta"])
    a = ap.parse_args()

    P = load_presets()
    profile = load_json(a.profile) if a.profile else {}
    seg = profile.get("segmento") or a.segmento
    cfg = merge_profile(P["segmentos"].get(seg, P["segmentos"]["padrao"]), profile)
    nivel = a.nivel or cfg.get("sfx", "media")
    lv = P["sfx_niveis"][nivel]

    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    edl = load_json(work / "edl.json")
    total = edl["total"]

    ev = []                                                      # (tempo do evento na tela, tipo, origem)
    manual = work / "sfx_manual.json"
    if manual.exists():
        for m in load_json(manual):
            ev.append((float(m["t"]), m["tipo"], "manual"))
    fxp = work / "fx_events.json"
    if fxp.exists():                                             # cada efeito visual toca o seu som
        from fx import CATALOGO
        for e in load_json(fxp):
            tipo = CATALOGO[e["fx"]]["sfx"]
            if not tipo:
                continue
            if e["origem"] in ("corte", "zoom") and not lv["cuts"]:
                continue
            if e["origem"] == "palavra-chave" and not lv["keywords"]:
                continue
            ev.append((float(e["t"]), tipo, e["origem"]))
    elif lv["cuts"]:
        for c in edl["clips"][1:]:
            ev.append((c["t0"], "whoosh", "corte" if not prev_cont(edl, c) else "zoom"))
    if not fxp.exists() and lv["keywords"] and (work / "captions.json").exists() and (work / "subs.ass").exists():
        kws = load_json(work / "captions.json")["keywords"]
        words = load_json(work / "words.json")["words"]
        from common import src_to_out
        seen_key = set()
        for i in kws:
            w = words[i]
            t = src_to_out(edl, (w["s"] + w["e"]) / 2)
            if t is not None and w["w"].lower() not in seen_key:
                seen_key.add(w["w"].lower())                     # 1 pop por palavra-chave distinta
                ev.append((max(0.0, t - (w["e"] - w["s"]) / 2), "pop", "palavra-chave"))

    # teto de densidade: manual sempre entra; o resto disputa por prioridade, espaçado
    rank = lambda e: -1 if e[2] == "manual" else (0 if e[2] == "corte" else PRIORITY[e[1]])   # corte real vence pop e zoom
    ev.sort(key=lambda e: (rank(e), e[0]))
    kept = []
    for t, tipo, origem in ev:
        if origem == "manual":
            kept.append((t, tipo, origem))
            continue
        if lv["max_per_10s"] == 0:
            continue
        near = [k for k in kept if abs(k[0] - t) < lv["min_gap"]]
        win = [k for k in kept if abs(k[0] - t) < 5 and k[2] != "manual"]     # janela de 10 s centrada no evento
        if near or len(win) >= lv["max_per_10s"]:
            continue
        kept.append((t, tipo, origem))
    kept.sort()

    buf = np.zeros(int(SR * (total + 1)))
    log = []
    for t, tipo, origem in kept:
        gen, lead, gain = SOUNDS[tipo]
        sig = gen()
        at = max(0.0, t - (lead if tipo != "whoosh" else len(sig) / SR * 0.55))
        p = int(at * SR)
        buf[p:p + len(sig)] += lv["gain"] * gain * sig[:len(buf) - p] if lv["gain"] else 0
        log.append({"t": round(t, 2), "tipo": tipo, "origem": origem})
    write_wav(work / "sfx.wav", np.clip(buf, -1, 1), SR)
    save_json(work / "sfx_events.json", log)
    print(f"sfx nível '{nivel}': {len(log)} efeitos em {total:.1f}s ({len(log) / max(total, 1) * 10:.1f} por 10s)")
    for e in log:
        print(f"  {e['t']:6.2f}s  {e['tipo']:<7} ({e['origem']})")


if __name__ == "__main__":
    main()

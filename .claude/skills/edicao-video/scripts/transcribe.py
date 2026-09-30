"""Transcrição local por palavra (faster-whisper). Nada sai da máquina.

Gera <work>/words.json: [{"w": "Pagar", "s": 0.12, "e": 0.50}, ...] e guarda o
áudio 16k em <work>/audio16k.wav. Reaproveita o cache enquanto o vídeo não mudar.

Limites conhecidos do Whisper (por isso plan_cuts confere com a energia do áudio):
  - timestamps erram ~0,2 s em regravações e pausas;
  - "engole" palavra repetida ou abandonada; transcrever cada clipe isolado para conferir;
  - pode alucinar texto em silêncio longo.

Uso: python transcribe.py VIDEO [--work DIR] [--model medium] [--lang pt] [--prompt "Regularize, matrícula, IPTU"]
"""
from __future__ import annotations

import argparse
import hashlib
import time

from common import load_json, probe, save_json, work_dir_for


def fingerprint(video, model, lang, prompt) -> str:
    st = video.stat()
    return hashlib.sha1(f"{video.name}|{st.st_size}|{int(st.st_mtime)}|{model}|{lang}|{prompt}".encode()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--model", default="medium", help="small (rápido) | medium (padrão) | large-v3 (melhor, lento)")
    ap.add_argument("--lang", default="pt")
    ap.add_argument("--prompt", default="", help="vocabulário do cliente (nomes, siglas) para o Whisper acertar")
    ap.add_argument("--vad", action="store_true", help="filtro de voz do Whisper (corta alucinação, mas pode engolir voz baixa)")
    a = ap.parse_args()

    from pathlib import Path
    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    out = work / "words.json"
    fp = fingerprint(video, a.model, a.lang, a.prompt)
    if out.exists():
        old = load_json(out)
        if old.get("fingerprint") == fp:
            print(f"cache: {out} ({len(old['words'])} palavras)")
            return

    info = probe(video)
    if not info["has_audio"]:
        raise SystemExit("O vídeo não tem áudio.")
    wav = work / "audio16k.wav"
    if wav.exists():
        wav.unlink()
    from common import FF, run
    run([FF, "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", 16000, "-c:a", "pcm_s16le", wav])

    from faster_whisper import WhisperModel
    t0 = time.time()
    print(f"transcrevendo com {a.model} (CPU, local)...", flush=True)
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    segs, meta = model.transcribe(
        str(wav), language=a.lang, word_timestamps=True, beam_size=5,
        condition_on_previous_text=False, vad_filter=a.vad,
        initial_prompt=a.prompt or None,
    )
    words = []
    for s in segs:
        for w in s.words or []:
            t = w.word.strip()
            if t:
                words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3)})
    save_json(out, {"fingerprint": fp, "source": str(video), "language": meta.language, "duration": info["duration"], "words": words})
    print(f"{len(words)} palavras em {time.time() - t0:.0f}s -> {out}")
    print("texto:", " ".join(w["w"] for w in words)[:600])


if __name__ == "__main__":
    main()

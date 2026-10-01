"""Recorta os efeitos sonoros de um vídeo de referência (reel de que o Douglas gostou) e prepara a conferência.

Quando ele diz "o efeito tem que ser idêntico ao do vídeo", a síntese não resolve: o som é o que está no arquivo. Este script
recorta cada som do áudio do reel, mede se tem voz junto e gera, para ele ouvir e dizer qual é qual:
  - <saida>/sons/refNN.wav        cada som, mono 48k, pico 0,7 (mesmo nível do acervo)
  - <saida>-ouvir.mp3              voz do Windows diz "Som N" e o som toca 3 vezes
  - <saida>-marcado.mp4            o reel original com uma etiqueta "SOM N" no instante de cada som (ouvir no contexto)
  - <saida>-indice.txt             tempo, duração, o que aparece na tela, se tem voz junto

Entrada: janelas.json  [{"id": "ref01", "ini": 4.36, "fim": 4.52, "tela": "texto aparece", "voz": false, "fixo": false}, ...]
"fixo": true usa os limites exatos (sons coladas, como o par aperta-solta do clique do mouse).
`ini`/`fim` são aproximados; nos sons sem voz o fim é estendido até o som morrer (sem passar da próxima palavra).
Aviso: o som é de terceiro (provavelmente de banco de som). Fica no acervo como uso interno e com a licença marcada
"desconhecida"; para anúncio de cliente, trocar por equivalente licenciado se o som for muito reconhecível.

Uso: python sfx_ref.py VIDEO --janelas janelas.json --saida PASTA/nome [--words words.json]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

import numpy as np

from common import FF, FONTS_DIR, load_json, read_wav, run, write_wav
from sfx_acervo import PS_FALAR, SR, _fade, _put

HOP = 0.005


def _env_db(x: np.ndarray, sr: int) -> np.ndarray:
    h = int(HOP * sr)
    n = len(x) // h
    return 20 * np.log10(np.sqrt(np.mean(x[:n * h].reshape(n, h) ** 2, axis=1)) + 1e-9)


def recortar(x: np.ndarray, sr: int, words: list[dict], j: dict) -> tuple[np.ndarray, float, float]:
    """Devolve (trecho, ini, fim) com os limites refinados. Com voz junto, usa a janela como veio."""
    ini, fim = float(j["ini"]), float(j["fim"])
    if not j.get("voz", False) and not j.get("fixo", False):
        db = _env_db(x, sr)
        piso = float(np.percentile(db, 10))
        prox = min([w["s"] for w in words if w["s"] > fim - 0.02] or [len(x) / sr])
        i = int(ini / HOP)
        while i > 0 and db[i - 1] > piso + 10 and ini - i * HOP < 0.04:      # ataque
            i -= 1
        ini = i * HOP
        k = int(fim / HOP)
        while k < len(db) - 1 and db[k] > piso + 6 and k * HOP < min(fim + 0.35, prox - 0.02):   # cauda
            k += 1
        fim = k * HOP
    return x[int(ini * sr):int(fim * sr)], ini, fim


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--janelas", required=True)
    ap.add_argument("--saida", required=True, help="prefixo dos arquivos de saída, ex.: C:/Users/x/Downloads/sons-do-reel")
    ap.add_argument("--words")
    ap.add_argument("--repetir", type=int, default=3)
    a = ap.parse_args()

    video = Path(a.video).resolve()
    saida = Path(a.saida).resolve()
    pasta = saida.parent / (saida.name + "-sons")
    pasta.mkdir(parents=True, exist_ok=True)
    tmp = saida.parent / "_ref_tmp"
    tmp.mkdir(exist_ok=True)
    janelas = load_json(a.janelas)
    words = load_json(a.words)["words"] if a.words else []

    wav = tmp / "a48.wav"
    run([FF, "-v", "error", "-y", "-i", video, "-vn", "-ac", 1, "-ar", SR, "-c:a", "pcm_s16le", wav])
    x, sr = read_wav(wav)
    x = x.astype(np.float64)

    sons = []
    for j in janelas:
        y, ini, fim = recortar(x, sr, words, j)
        if len(y) < 64:
            continue
        y = _fade(y / (np.abs(y).max() + 1e-9) * 0.7, 0.001, 0.01)
        write_wav(pasta / f"{j['id']}.wav", y, sr)
        sons.append({**j, "ini": round(ini, 3), "fim": round(fim, 3), "y": y, "dur": len(y) / sr})
    (pasta / "janelas_refinadas.json").write_text(json.dumps([{k: v for k, v in s.items() if k != "y"} for s in sons],
                                                            ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- índice
    linhas = ["SONS RECORTADOS DO VÍDEO DE REFERÊNCIA", f"Fonte: {video.name}", ""]
    for n, s in enumerate(sons, 1):
        linhas.append(f"Som {n:02d}  ({s['id']})  {s['ini']:6.2f}s a {s['fim']:6.2f}s  dur {s['dur']:.2f}s  "
                      f"{'COM VOZ junto' if s.get('voz') else 'limpo'}  |  na tela: {s.get('tela', '')}")
    saida.with_name(saida.name + "-indice.txt").write_text("\n".join(linhas) + "\n", encoding="utf-8")

    # ---- mp3 para ouvir: "Som N" e o som 3 vezes
    falas = [f"Som {n}." for n in range(1, len(sons) + 1)]
    (tmp / "falas.json").write_text(json.dumps(falas, ensure_ascii=False), encoding="utf-8")
    (tmp / "falar.ps1").write_text(PS_FALAR, encoding="utf-8-sig")
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(tmp / "falar.ps1"),
                        str(tmp / "falas.json"), str(tmp)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"Falha na voz do Windows: {r.stderr[:300]}")
    t, partes = 0.3, []
    for i, s in enumerate(sons):
        run([FF, "-v", "error", "-y", "-i", tmp / f"l{i:02d}.wav", "-ac", 1, "-ar", SR, "-c:a", "pcm_s16le", tmp / f"v{i:02d}.wav"])
        v, _ = read_wav(tmp / f"v{i:02d}.wav")
        v = v.astype(np.float64)
        partes.append((t, v / (np.abs(v).max() + 1e-9) * 0.5))
        t += len(v) / SR + 0.4
        for _ in range(a.repetir):
            partes.append((t, s["y"]))
            t += max(len(s["y"]) / SR, 0.2) + 0.6
        t += 0.6
    buf = np.zeros(int(SR * (t + 0.5)))
    for at, y in partes:
        _put(buf, y, at)
    write_wav(tmp / "ouvir.wav", buf / max(np.abs(buf).max(), 1e-9) * 0.89, SR)
    mp3 = saida.with_name(saida.name + "-ouvir.mp3")
    run([FF, "-v", "error", "-y", "-i", tmp / "ouvir.wav", "-c:a", "libmp3lame", "-q:a", "2", mp3])

    # ---- reel original com etiqueta em cada som
    info = subprocess.run([FF, "-i", str(video)], capture_output=True, text=True).stderr
    W, H = 720, 1280
    for ln in info.splitlines():
        if "Video:" in ln and "x" in ln:
            import re
            m = re.search(r"(\d{3,4})x(\d{3,4})", ln)
            if m:
                W, H = int(m.group(1)), int(m.group(2))
                break

    def ts(x_: float) -> str:
        h, rr = divmod(x_, 3600)
        mm, ss = divmod(rr, 60)
        return f"{int(h)}:{int(mm):02d}:{ss:05.2f}"
    ass = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n"
           "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
           "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
           f"Style: Som,Poppins ExtraBold,{int(H * 0.05)},&H00141414,&H00FFFFFF,&H004AB8E0,&H004AB8E0,-1,0,0,0,100,100,0,0,3,10,0,2,0,0,{int(H * 0.06)},1\n\n"
           "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    for n, s in enumerate(sons, 1):
        ass += f"Dialogue: 1,{ts(max(s['ini'] - 0.05, 0))},{ts(s['ini'] + max(s['dur'], 0.45) + 0.1)},Som,,0,0,0,,SOM {n}\n"
    (tmp / "marcas.ass").write_text(ass, encoding="utf-8")
    fd = os.path.relpath(FONTS_DIR, tmp).replace("\\", "/")
    mp4 = saida.with_name(saida.name + "-marcado.mp4")
    run([FF, "-v", "error", "-y", "-i", video, "-vf", f"ass=marcas.ass:fontsdir={fd}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-crf", "23", "-c:a", "copy", mp4], cwd=tmp)
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    print(f"{len(sons)} sons em {pasta}\n{mp3}\n{mp4}\n{saida.with_name(saida.name + '-indice.txt')}")


if __name__ == "__main__":
    main()

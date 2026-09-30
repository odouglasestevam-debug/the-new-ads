"""Conferência do vídeo final por MEDIÇÃO, não por olhômetro.

Checa: duração, loudness e pico, pausas que sobraram, legendas (fonte, tempos), e gera uma
folha de contato com os quadros nas emendas para eu olhar de verdade.
Opcional: --gaze (olhar para baixo, MediaPipe) e --echo (cauda de eco depois das frases).

Uso: python verify.py VIDEO [--work DIR] [--final arquivo.mp4] [--gaze] [--echo] [--ref bruto.mp4]
"""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

import numpy as np

from common import (ASSETS_DIR, FF, Envelope, FONTS_DIR, extract_wav, font_available, load_json, probe, run,
                    save_json, work_dir_for)


def loudness(path: Path) -> tuple[float, float]:
    r = subprocess.run([FF, "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = r.stderr[r.stderr.rfind("Summary"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", tail)
    p = re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)
    return (float(i[1]) if i else float("nan"), float(p[1]) if p else float("nan"))


def leftover_pauses(path: Path, min_s: float = 0.5) -> list[tuple[float, float]]:
    r = subprocess.run([FF, "-hide_banner", "-nostats", "-i", str(path), "-af", f"silencedetect=noise=-38dB:d={min_s}",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    st = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", r.stderr)]
    return [(max(a, 0), b) for a, b in zip(st, en)]


def contact_sheet(final: Path, times: list[float], out: Path) -> None:
    from PIL import Image, ImageDraw
    tmp = out.parent / "_frames"
    tmp.mkdir(exist_ok=True)
    imgs = []
    for k, t in enumerate(times):
        f = tmp / f"f{k:02d}.jpg"
        run([FF, "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", final, "-frames:v", 1, "-vf", "scale=-2:560", "-q:v", 3, f])
        if f.exists():
            im = Image.open(f).convert("RGB")
            ImageDraw.Draw(im).rectangle((0, 0, 92, 24), fill=(0, 0, 0))
            ImageDraw.Draw(im).text((6, 6), f"{t:6.2f}s", fill=(255, 255, 255))
            imgs.append(im)
    if not imgs:
        return
    cols = min(len(imgs), 6)
    rows = (len(imgs) + cols - 1) // cols
    w, h = imgs[0].size
    sheet = Image.new("RGB", (cols * w, rows * h), (20, 20, 20))
    for i, im in enumerate(imgs):
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(out, quality=88)


def gaze_events(video: Path, thr: float = 0.24, min_frames: int = 3, fps: int = 15) -> list[tuple[float, float]]:
    """Olhar para baixo = abertura do olho < thr por >= min_frames (15 fps). 1 a 2 quadros é piscada."""
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    model = ASSETS_DIR / "face_landmarker.task"
    if not model.exists():
        raise SystemExit("Modelo de olhar ausente. Rode: python fetch_assets.py --only gaze")
    info = probe(video)
    w = 540
    h = int(info["h"] * w / info["w"]) // 2 * 2
    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=str(model)), running_mode=vision.RunningMode.IMAGE, num_faces=1))
    p = subprocess.Popen([FF, "-v", "error", "-i", str(video), "-an", "-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    opening, n = [], 0
    while True:
        buf = p.stdout.read(w * h * 3)
        if len(buf) < w * h * 3:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=frame))
        if not res.face_landmarks:
            opening.append(None)
        else:
            L = res.face_landmarks[0]

            def ratio(up, lo, c1, c2):
                vert = abs(L[up].y - L[lo].y) * h
                horz = abs(L[c1].x - L[c2].x) * w
                return vert / horz if horz else 1.0

            opening.append((ratio(159, 145, 33, 133) + ratio(386, 374, 362, 263)) / 2)
        n += 1
    p.wait()
    ev, start = [], None
    for i, o in enumerate(opening + [1.0]):
        low = o is not None and o < thr
        if low and start is None:
            start = i
        if not low and start is not None:
            if i - start >= min_frames:
                ev.append((start / fps, i / fps))
            start = None
    return ev


def echo_tail(video: Path, work: Path, tag: str) -> dict:
    """Quanto a energia cai 100 ms e 300 ms depois do fim de cada trecho de fala (dB abaixo da fala).
    Indicativo: compare com o bruto. Cauda que cai devagar = eco/reverberação."""
    env = Envelope(extract_wav(video, work / f"echo_{tag}.wav", 16000))
    speech = float(np.median(env.db[env.db > env.thr + 10])) if (env.db > env.thr + 10).any() else 0.0
    d100, d300 = [], []
    i = 0
    while i < env.n - 40:
        if env.db[i] > env.thr and (env.db[i + 1:i + 16] < env.thr).all():
            d100.append(env.db[i + 10] - speech)
            d300.append(env.db[i + 30] - speech)
            i += 40
        else:
            i += 1
    if not d100:
        return {}
    return {"fins_de_frase": len(d100), "queda_100ms_db": round(float(np.mean(d100)), 1),
            "queda_300ms_db": round(float(np.mean(d300)), 1)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video", help="vídeo de origem (para achar a pasta de trabalho)")
    ap.add_argument("--work")
    ap.add_argument("--final", help="arquivo a conferir (padrão: final.mp4, senão preview.mp4)")
    ap.add_argument("--gaze", action="store_true")
    ap.add_argument("--echo", action="store_true")
    ap.add_argument("--ref", help="vídeo bruto para comparar o eco")
    a = ap.parse_args()

    work = work_dir_for(Path(a.video).resolve(), a.work)
    edl = load_json(work / "edl.json")
    final = Path(a.final) if a.final else (work / "final.mp4" if (work / "final.mp4").exists() else work / "preview.mp4")
    if not final.exists():
        raise SystemExit("Nada para conferir ainda. Renderize primeiro.")
    vdir = work / "verify"
    vdir.mkdir(exist_ok=True)
    rep, problems = {}, []

    info = probe(final)
    rep["duracao"] = round(info["duration"], 2)
    if abs(info["duration"] - edl["total"]) > 0.25:
        problems.append(f"duração {info['duration']:.2f}s difere do plano {edl['total']:.2f}s")
    print(f"arquivo: {final.name}  {info['w']}x{info['h']}  {info['duration']:.2f}s")

    lufs, peak = loudness(final)
    rep["loudness_lufs"], rep["pico_dbfs"] = lufs, peak
    print(f"loudness: {lufs:.1f} LUFS (alvo -14)  pico {peak:.1f} dBFS (limite -1,0)")
    if not (-15.5 <= lufs <= -12.5):
        problems.append(f"loudness fora do alvo: {lufs:.1f} LUFS")
    if peak > -0.9:
        problems.append(f"pico alto: {peak:.1f} dBFS (risco de distorcer na plataforma)")

    pauses = leftover_pauses(final)
    rep["pausas_restantes"] = pauses
    print(f"pausas >= 0,5 s que sobraram: {len(pauses)}" + "".join(f"\n   {s:6.2f}s a {e:6.2f}s" for s, e in pauses[:8]))

    ass = work / "subs.ass"
    if ass.exists():
        txt = ass.read_text(encoding="utf-8")
        fonts = set(re.findall(r"^Style: \w+,([^,]+),", txt, re.M))
        for f in fonts:
            if not font_available(f):
                problems.append(f"fonte '{f}' não encontrada: a legenda renderizou com fonte errada")
        ev = re.findall(r"^Dialogue: \d+,([\d:.]+),([\d:.]+),", txt, re.M)

        def sec(t):
            h, m, s = t.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)

        durs = [sec(e) - sec(s) for s, e in ev]
        short = [d for d in durs if d < 0.08]
        last_end = max((sec(e) for _, e in ev), default=0)
        print(f"legendas: {len(ev)} eventos, fontes {sorted(fonts)}, último termina em {last_end:.2f}s")
        if last_end > edl["total"] + 0.6:
            problems.append("legenda passa do fim do vídeo")
        if short:
            problems.append(f"{len(short)} eventos de legenda com menos de 80 ms (piscam)")
        if "—" in txt or "–" in txt:
            problems.append("travessão encontrado na legenda")

    # folha de contato: início, gancho, cada emenda (antes/depois), meio e fim
    times = [0.3, 1.2]
    for c in edl["clips"][1:]:
        times += [max(c["t0"] - 0.12, 0), c["t0"] + 0.12]
    times += [edl["total"] / 2, edl["total"] - 0.6]
    times = sorted({round(min(t, info["duration"] - 0.1), 2) for t in times})[:24]
    sheet = vdir / "contato.png"
    contact_sheet(final, times, sheet)
    print(f"folha de contato ({len(times)} quadros): {sheet}")

    if a.gaze:
        g = gaze_events(final)
        rep["olhar_para_baixo"] = g
        print(f"olhar para baixo (abertura < 0,24 por >= 3 quadros): {len(g)} trechos" + "".join(f"\n   {s:5.2f}s a {e:5.2f}s" for s, e in g))
        if g:
            problems.append(f"{len(g)} trechos com olhar para baixo: conferir os quadros e decidir corte, L-cut ou cutaway")
    if a.echo:
        e_final = echo_tail(final, work, "final")
        print(f"eco no final: {e_final}")
        if a.ref:
            e_ref = echo_tail(Path(a.ref), work, "ref")
            print(f"eco no bruto: {e_ref}  (queda menor em 300 ms = mais cauda de eco)")
            rep["eco_ref"] = e_ref
        rep["eco_final"] = e_final

    rep["problemas"] = problems
    save_json(vdir / "relatorio.json", rep)
    print("\nPROBLEMAS:" if problems else "\nSem problemas nas checagens automáticas.")
    for p_ in problems:
        print("  -", p_)
    print("(Medição não substitui olhar a folha de contato e ouvir o áudio.)")


_ = FONTS_DIR

if __name__ == "__main__":
    main()

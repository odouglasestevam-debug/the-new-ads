"""Renderiza o vídeo final a partir do edl.json (+ subs.ass + sfx.wav).

Ordem (regras da auditoria):
  1. cada clipe é recortado da ORIGEM com zoom e formato já aplicados (sem reencodar duas vezes);
  2. correção de imagem depois da concatenação, legenda (ass) POR ÚLTIMO;
  3. fade de 30 ms nas emendas de áudio (sem estalo), exceto em troca de zoom sem corte;
  4. voz tratada, música com ducking sob a fala, efeitos, e loudness medido em duas passadas
     (-14 LUFS, pico -1,5 dBTP, padrão de Reels/TikTok/YouTube).

Uso: python render.py VIDEO [--work DIR] [--aspect 9:16] [--grade auto|natural|luz_fraca|...]
        [--music arquivo.mp3] [--preview] [--out final.mp4] [--profile perfil.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from common import (FF, FONTS_DIR, TONEMAP, load_json, load_presets, merge_profile, probe, run, save_json,
                    work_dir_for)
from render_geometry import face_uv, target_size, zoom_box


# ------------------------------------------------------------------ correção de imagem por ambiente

def measure_scene(src: Path, dur: float, hdr: bool = False) -> dict:
    """Luminância e cor médias (amostra de ~1 quadro por 2 s). Só números, sem decisão."""
    d = tempfile.mkdtemp()
    try:
        run([FF, "-v", "error", "-y", "-t", min(dur, 60), "-i", src, "-an", "-vf",
             ("" if not hdr else TONEMAP + ",") + "fps=0.5,scale=320:-2,signalstats,metadata=print:file=stats.txt", "-f", "null", "-"], cwd=d)
        txt = (Path(d) / "stats.txt").read_text()
    finally:
        shutil.rmtree(d, ignore_errors=True)

    def avg(k: str) -> float:
        v = [float(x) for x in re.findall(rf"lavfi\.signalstats\.{k}=([\d.]+)", txt)]
        return sum(v) / len(v) if v else 0.0

    return {"y": avg("YAVG"), "ylow": avg("YLOW"), "yhigh": avg("YHIGH"), "v_minus_u": avg("VAVG") - avg("UAVG"),
            "sat": avg("SATAVG")}


def choose_grade(m: dict) -> tuple[str, str]:
    """Só exposição decide sozinha. Cast de cor fica como aviso (pode ser a cor do produto)."""
    if m["y"] < 80:
        return "luz_fraca", f"imagem escura (luminância média {m['y']:.0f}/255)"
    if m["y"] > 165:
        return "externo_sol", f"imagem muito clara (luminância média {m['y']:.0f}/255)"
    return "natural", f"exposição normal (luminância média {m['y']:.0f}/255)"


# ------------------------------------------------------------------ áudio

def loudnorm_two_pass(src: Path, dst: Path, target: float, tp: float) -> dict:
    base = f"loudnorm=I={target}:TP={tp}:LRA=11"
    r = run([FF, "-hide_banner", "-nostats", "-i", src, "-af", base + ":print_format=json", "-f", "null", "-"])
    blob = r.stderr[r.stderr.rfind("{"): r.stderr.rfind("}") + 1]
    m = json.loads(blob)
    f = (f"{base}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
         f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    run([FF, "-v", "error", "-y", "-i", src, "-af", f + ",aresample=48000", "-c:a", "pcm_s16le", dst])
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--profile")
    ap.add_argument("--segmento", default="padrao")
    ap.add_argument("--aspect", default="9:16", help="9:16 | 4:5 | 1:1 | 16:9 | original")
    ap.add_argument("--focus", default="auto", help="auto (acha o rosto) ou 'x,y' de 0 a 1 (centro do rosto na imagem de origem)")
    ap.add_argument("--grade", help="auto | none | natural | luz_fraca | luz_quente | contraluz | externo_sol | luz_fluorescente | estudio_neutro | cinematografico")
    ap.add_argument("--denoise", choices=["off", "leve", "forte"], default="leve")
    ap.add_argument("--music", help="arquivo de música (a escolha é do Douglas)")
    ap.add_argument("--music-vol", type=float, default=0.16)
    ap.add_argument("--bar", choices=["sim", "nao"], help="barra de progresso no topo")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--no-fx", action="store_true", help="sem efeitos visuais e transições")
    ap.add_argument("--look", help="grain,vinheta,vhs (separados por vírgula) ou 'nenhum'. Padrão: o do perfil")
    ap.add_argument("--fit", choices=["cover", "blur"], default="cover",
                    help="cover = recorta para preencher a tela | blur = mostra o quadro inteiro sobre fundo desfocado (horizontal em vertical)")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--preview", action="store_true", help="rápido e leve, só para conferir")
    ap.add_argument("--out")
    a = ap.parse_args()

    P = load_presets()
    profile = load_json(a.profile) if a.profile else {}
    cfg = merge_profile(P["segmentos"].get(profile.get("segmento") or a.segmento, P["segmentos"]["padrao"]), profile)
    src = Path(a.video).resolve()
    work = work_dir_for(src, a.work)
    edl = load_json(work / "edl.json")
    info = probe(src)
    sw, sh = info["w"], info["h"]
    W, H = target_size(sw, sh, a.aspect)
    clips, total = edl["clips"], edl["total"]
    if a.focus == "auto":
        from face import detect
        mids = [(c["in"] + c["out"]) / 2 for c in edl["clips"]]
        pick = [mids[int(i)] for i in range(0, len(mids), max(1, len(mids) // 9))][:9]
        fr = detect(src, pick)
        if fr:
            save_json(work / "face.json", fr)
            fx, fy = fr["fx"], fr["fy"]
            print(f"rosto: centro ({fx:.2f}, {fy:.2f}) em {fr['n']} quadros")
        else:
            fx, fy = 0.5, 0.35
            print("rosto não detectado: usando enquadramento central (0.5, 0.35). Passe --focus x,y se precisar.")
    else:
        fx, fy = (float(x) for x in a.focus.split(","))
    face_u, face_v = face_uv(sw, sh, W, H, fx, fy)
    from render_geometry import base_box
    bw0 = base_box(sw, sh, W, H, fx, fy)[0]
    up = W / bw0 * max(c["zoom"] for c in clips)
    blur_fit = a.fit == "blur" and abs(sw / sh - W / H) > 0.05
    if up > 1.35 and not blur_fit:
        print(f"AVISO: a imagem será ampliada {up:.1f}x (origem {sw}x{sh} para {W}x{H} com zoom). Vai ficar mole e apertada. "
              f"Converter vertical em horizontal/quadrado raramente presta; prefira regravar ou manter o formato.")

    if info["hdr"]:
        print("vídeo HDR (HLG/PQ): convertendo para SDR Rec.709 antes de tudo")

    # ---- imagem: escolha do preset
    gname = a.grade or cfg.get("grade", "auto")
    scene = measure_scene(src, info["duration"], info["hdr"])
    why = "escolhido por você"
    if gname == "auto":
        gname, why = choose_grade(scene)
    if gname not in P["grades"]:
        raise SystemExit(f"Preset de imagem '{gname}' não existe. Opções: {[k for k in P['grades'] if not k.startswith('_')]}")
    grade = P["grades"][gname]
    print(f"imagem: '{gname}' ({why})")
    if scene["v_minus_u"] > 30:
        print(f"  aviso: cor bem quente/saturada (V-U={scene['v_minus_u']:.0f}). Pode ser a cor do produto ou da luz; "
              f"conferir no antes/depois antes de trocar para luz_quente.")

    # ---- vídeo: um trim por clipe, zoom por recorte na origem
    fc = []
    for n, c in enumerate(clips):
        vin, vout = c.get("vin", c["in"]), c.get("vout", c["out"])      # L-cut: a imagem pode trocar antes do áudio
        d = vout - vin
        head = (f"[0:v]trim=start={vin:.3f}:end={vout:.3f},setpts=PTS-STARTPTS,"
                + (TONEMAP + "," if info["hdr"] else ""))
        if blur_fit:                                    # quadro inteiro na frente, o mesmo quadro desfocado atrás
            z = c["zoom"]
            fg = f"scale={W}:{H}:force_original_aspect_ratio=decrease" + (f",scale=trunc(iw*{z}/2)*2:-2" if z > 1 else "")
            v = (head + f"split[bg{n}][fg{n}];[bg{n}]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                 f"gblur=sigma={int(40 * W / 1080)},eq=brightness=-0.08[bb{n}];[fg{n}]{fg}[ff{n}];"
                 f"[bb{n}][ff{n}]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2")
        else:
            cw, ch, x, y = zoom_box(sw, sh, W, H, c["zoom"], fx, fy)
            v = head + f"crop={cw}:{ch}:{x}:{y},scale={W}:{H}:flags=lanczos"
            if c.get("push"):                           # gancho: aproximação lenta
                v += (f",scale=w='trunc({W}*(1+{c['push']}*t/{d:.3f})/2)*2':h=-2:eval=frame:flags=bicubic,"
                      f"crop={W}:{H}:'(iw-{W})*{face_u:.4f}':'(ih-{H})*{face_v:.4f}'")
        fc.append(v + f",setsar=1,fps={a.fps}[v{n}]")
    fc.append("".join(f"[v{n}]" for n in range(len(clips))) + f"concat=n={len(clips)}:v=1:a=0[vc]")

    # efeitos e transições (por cima, não mudam a duração), depois cor, look, legenda e barra
    vlabel, fx_count = "vc", 0
    evp = work / "fx_events.json"
    if evp.exists() and not a.no_fx:
        from fx import emit as fx_emit
        evs = load_json(evp)
        frags, vlabel = fx_emit(evs, W, H, "vc")
        fc += frags
        fx_count = len(frags)
    from fx import LOOKS
    looks = a.look if a.look is not None else cfg.get("look", [])
    looks = [] if looks in ("nenhum", "") else ([x for x in looks.split(",") if x] if isinstance(looks, str) else list(looks))
    for lk in looks:
        if lk not in LOOKS:
            raise SystemExit(f"Look '{lk}' não existe. Opções: {list(LOOKS)}")
    tail = ([grade] if grade else []) + [LOOKS[lk] for lk in looks]
    captions_ok = (work / "subs.ass").exists() and not a.no_captions
    if captions_ok:
        fonts_local = work / "fonts"                     # caminho relativo evita o problema do 'C:' no filtro
        if not fonts_local.exists():
            shutil.copytree(FONTS_DIR, fonts_local)
        tail.append("ass=subs.ass:fontsdir=fonts")
    bar = (a.bar == "sim") if a.bar else bool(cfg.get("progress_bar"))
    if bar:
        color = "0x" + cfg["accent"].lstrip("#")
        tail.append(f"drawbox=x=0:y=0:w=iw:h=12:color=black@0.35:t=fill,"
                    f"drawbox=x=0:y=0:w='iw*t/{total:.3f}':h=12:color={color}:t=fill")
    if a.preview:
        tail.append("scale=trunc(iw/4)*2:-2")
    tail.append("format=yuv420p")
    fc.append(f"[{vlabel}]" + ",".join(tail) + "[vout]")
    (work / "video.filter").write_text(";\n".join(fc), encoding="utf-8")

    # ---- áudio: voz -> (+ música com ducking) -> (+ sfx) -> loudness
    af = []
    for n, c in enumerate(clips):
        d = c["out"] - c["in"]
        prev_cont = n > 0 and clips[n - 1]["cont"]
        chain = f"[0:a]atrim=start={c['in']:.3f}:end={c['out']:.3f},asetpts=PTS-STARTPTS"
        if not prev_cont:
            chain += ",afade=t=in:d=0.03"
        if not c["cont"]:
            chain += f",afade=t=out:st={max(d - 0.03, 0):.3f}:d=0.03"
        af.append(chain + f"[a{n}]")
    af.append("".join(f"[a{n}]" for n in range(len(clips))) + f"concat=n={len(clips)}:v=0:a=1[ac]")
    voz = P["voz"]["cadeia"].replace("{denoise}", P["voz"]["denoise"][a.denoise])
    use_sfx = (work / "sfx.wav").exists() and not a.no_sfx
    inputs = ["-i", src]
    idx = 1
    mix = []
    if a.music:
        af.append(f"[ac]{voz},aresample=48000,asplit=2[voz][sc]")
        af.append(f"[{idx}:a]aloop=loop=-1:size=2000000000,atrim=duration={total:.3f},asetpts=PTS-STARTPTS,"
                  f"volume={a.music_vol},afade=t=in:d=0.4,afade=t=out:st={max(total - 1.2, 0):.3f}:d=1.2,aresample=48000[mus]")
        af.append("[mus][sc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=350[musd]")
        inputs += ["-i", a.music]
        idx += 1
        mix = ["[voz]", "[musd]"]
    else:
        af.append(f"[ac]{voz},aresample=48000[voz]")
        mix = ["[voz]"]
    if use_sfx:
        af.append(f"[{idx}:a]volume=0.9,aresample=48000[fx]")
        inputs += ["-i", work / "sfx.wav"]
        mix.append("[fx]")
    af.append("".join(mix) + f"amix=inputs={len(mix)}:duration=first:normalize=0,"
              f"aformat=sample_fmts=fltp:channel_layouts=stereo[mixout]")
    (work / "audio.filter").write_text(";\n".join(af), encoding="utf-8")

    mix_wav = work / "mix.wav"
    run([FF, "-v", "error", "-y", *inputs, "-filter_complex_script", work / "audio.filter", "-map", "[mixout]",
         "-t", f"{total:.3f}", "-c:a", "pcm_s16le", mix_wav])
    norm_wav = work / "mix_norm.wav"
    m = loudnorm_two_pass(mix_wav, norm_wav, P["voz"]["alvo_lufs"], P["voz"]["pico_db"])
    print(f"áudio: {float(m['input_i']):.1f} LUFS medido -> {P['voz']['alvo_lufs']} LUFS (pico {float(m['input_tp']):.1f} dBTP)")

    # ---- encode final
    out = Path(a.out).resolve() if a.out else work / ("preview.mp4" if a.preview else "final.mp4")
    enc = ["-c:v", "libx264", "-preset", "veryfast" if a.preview else "medium", "-crf", "27" if a.preview else "19",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
    run([FF, "-v", "error", "-y", "-i", src, "-i", norm_wav, "-filter_complex_script", work / "video.filter",
         "-map", "[vout]", "-map", "1:a", *enc, "-t", f"{total:.3f}", out], cwd=work)
    size = out.stat().st_size / 1e6
    save_json(work / "render.json", {"out": str(out), "grade": gname, "grade_motivo": why, "scene": scene, "aspect": a.aspect,
                                     "size_px": [W, H], "total": total, "music": a.music, "sfx": use_sfx,
                                     "captions": captions_ok, "bar": bar, "fx_visuais": fx_count, "looks": looks, "fit": a.fit, "loudness_antes": m["input_i"]})
    print(f"\nPRONTO: {out}  ({size:.1f} MB, {total:.1f}s, {W}x{H})")


_ = os

if __name__ == "__main__":
    main()

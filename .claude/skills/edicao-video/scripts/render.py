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


def find_drop(music: str | Path) -> tuple[float, float]:
    """Onde a música 'cai' (entra o grave/batida forte): maior salto de energia do grave entre 2 s antes e 2 s depois."""
    import librosa
    import numpy as np
    y, sr = librosa.load(str(music), sr=22050, mono=True, duration=150)
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=1102))
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    lo = 10 * np.log10((S[f < 160] ** 2).sum(0) + 1e-9)
    hop = 1102 / sr
    k = int(2.0 / hop)
    best, bt = -99.0, 0.0
    for i in range(k, len(lo) - k):
        g = float(np.median(lo[i:i + k]) - np.median(lo[i - k:i]))
        if g > best:
            best, bt = g, i * hop
    return round(bt, 2), round(best, 1)


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
    ap.add_argument("--music", help="arquivo ou id do acervo (musica.py listar). Sem isso, a trilha sai do acervo pelo clima do perfil")
    ap.add_argument("--no-music", action="store_true", help="sem trilha. Música é indispensável (Douglas, 01/10): só com pedido dele")
    ap.add_argument("--music-vol", type=float, help="volume fixo da trilha. Padrão: medido, %.0f dB abaixo da voz" % 13)
    ap.add_argument("--music-start", type=float, help="começa a música nesse segundo do arquivo (padrão: o início útil da trilha)")
    ap.add_argument("--music-in", type=float, help="a música entra nesse segundo do vídeo (antes, só voz)")
    ap.add_argument("--music-drop", type=float,
                    help="acha o 'drop' da música e encaixa nesse segundo do vídeo (ex.: na virada para a tela de motion)")
    ap.add_argument("--no-elementos", action="store_true", help="ignora elementos.json (texto atrás, perspectiva, clones...)")
    ap.add_argument("--bar", choices=["sim", "nao"], help="barra de progresso no topo")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--no-fx", action="store_true", help="sem efeitos visuais e transições")
    ap.add_argument("--no-cards", action="store_true", help="sem cartões e telas tipográficas (cards.ass)")
    ap.add_argument("--voz", choices=["auto", "original"], default="auto",
                    help="auto = usa voz_restaurada.wav (VoiceFixer) se existir | original = áudio da câmera")
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

    # caixa de ferramentas (elementos.py): texto atrás da pessoa, perspectiva, clones, rastro, foco, moldura...
    # Precisa da imagem já tratada e ANTES da legenda: renderiza a base, processa e depois põe legenda e áudio.
    el_json = work / "elementos.json"
    tem_foco = evp.exists() and any(e.get("fx") == "foco" for e in load_json(evp))
    staged = not a.no_elementos and ((el_json.exists() and load_json(el_json)) or (tem_foco and not a.no_fx))
    Wp, Hp = (W // 4 * 2, int(round(H * (W // 4 * 2) / W / 2)) * 2) if a.preview else (W, H)
    geo_clips, v0 = [], 0.0
    for c in clips:
        vin, vout = c.get("vin", c["in"]), c.get("vout", c["out"])
        geo_clips.append({"v0": round(v0, 4), "v1": round(v0 + vout - vin, 4), "vin": vin, "zoom": c["zoom"],
                          "box": list(zoom_box(sw, sh, W, H, c["zoom"], fx, fy)), "push": c.get("push", 0.0),
                          "cont": c["cont"]})
        v0 += vout - vin
    save_json(work / "geometria.json", {"W": Wp, "H": Hp, "W_full": W, "H_full": H, "escala": Wp / W, "fps": a.fps,
                                        "sw": sw, "sh": sh, "fit": "blur" if blur_fit else "cover", "face_u": face_u,
                                        "face_v": face_v, "src": str(src), "hdr": info["hdr"], "tonemap": TONEMAP,
                                        "grade": grade, "pasta_video": str(src.parent), "clips": geo_clips})
    if staged and blur_fit:
        print("aviso: com --fit blur os elementos presos na cena (ancora cena, plano, clone) ficam presos na tela.")
    captions_ok = (work / "subs.ass").exists() and not a.no_captions
    cards_ok = (work / "cards.ass").exists() and not a.no_cards
    if captions_ok or cards_ok:
        fonts_local = work / "fonts"                     # caminho relativo evita o problema do 'C:' no filtro
        if not fonts_local.exists():
            shutil.copytree(FONTS_DIR, fonts_local)
    post = []                                            # o que entra depois dos elementos (legenda por último)
    if staged:
        if a.preview:
            tail.append(f"scale={Wp}:{Hp}")
        # sidedata=delete: com a mesma entrada em vários trechos + concat, o ffmpeg 7.1 copia a marca de giro do iPhone
        # (displaymatrix) para a saída, e quem lê o arquivo gira de novo (quadro deitado, listras no elementos.py)
        fc_base = fc + [f"[{vlabel}]" + ",".join(tail + ["format=yuv420p", "sidedata=delete:type=DISPLAYMATRIX"]) + "[vbase]"]
        tail = post
    if cards_ok:
        tail.append("ass=cards.ass:fontsdir=fonts")      # cartões e telas tipográficas: por baixo da legenda
    if captions_ok:
        tail.append("ass=subs.ass:fontsdir=fonts")
    bar = (a.bar == "sim") if a.bar else bool(cfg.get("progress_bar"))
    if bar:
        color = "0x" + cfg["accent"].lstrip("#")
        tail.append(f"drawbox=x=0:y=0:w=iw:h=12:color=black@0.35:t=fill,"
                    f"drawbox=x=0:y=0:w='iw*t/{total:.3f}':h=12:color={color}:t=fill")
    if a.preview and not staged:
        tail.append("scale=trunc(iw/4)*2:-2")
    tail += ["format=yuv420p", "sidedata=delete:type=DISPLAYMATRIX"]   # vídeo de iPhone não sai deitado no player
    if staged:
        (work / "video_base.filter").write_text(";\n".join(fc_base), encoding="utf-8")
        fc = ["[0:v]" + ",".join(tail) + "[vout]"]
    else:
        fc.append(f"[{vlabel}]" + ",".join(tail) + "[vout]")
    (work / "video.filter").write_text(";\n".join(fc), encoding="utf-8")

    # ---- áudio: voz -> (+ música com ducking) -> (+ sfx) -> loudness
    af = []
    restored = work / "voz_restaurada.wav"
    use_vf = restored.exists() and a.voz == "auto"
    aidx = 1 if use_vf else 0                        # entrada de onde sai a voz (1 = VoiceFixer, 0 = câmera)
    if use_vf:
        print("voz: restaurada (VoiceFixer) + EQ compensatória")
    for n, c in enumerate(clips):
        d = c["out"] - c["in"]
        prev_cont = n > 0 and clips[n - 1]["cont"]
        chain = f"[{aidx}:a]atrim=start={c['in']:.3f}:end={c['out']:.3f},asetpts=PTS-STARTPTS"
        if not prev_cont:
            chain += ",afade=t=in:d=0.03"
        if not c["cont"]:
            chain += f",afade=t=out:st={max(d - 0.03, 0):.3f}:d=0.03"
        af.append(chain + f"[a{n}]")
    af.append("".join(f"[a{n}]" for n in range(len(clips))) + f"concat=n={len(clips)}:v=0:a=1[ac]")
    voz = (P["voz"]["cadeia_restaurada"] if use_vf
           else P["voz"]["cadeia"].replace("{denoise}", P["voz"]["denoise"][a.denoise]))
    use_sfx = (work / "sfx.wav").exists() and not a.no_sfx
    inputs = ["-i", src]
    idx = 1
    if use_vf:
        inputs += ["-i", restored]
        idx = 2
    mix = []
    trilha = None                                    # música é indispensável (Douglas, 01/10): sem --music, sai do acervo
    if not a.no_music:
        import musica
        if not a.music:
            trilha = musica.escolher(dict(cfg, segmento=profile.get("segmento") or a.segmento), src.stem)
        elif not Path(a.music).exists():
            trilha = musica.faixa(a.music)
        if trilha:
            a.music = str(musica.caminho(trilha))
            print(f"música: {trilha['titulo']} ({trilha['artista']}, {trilha['fonte']}), clima {trilha['clima']}, "
                  f"{trilha.get('bpm', '?')} bpm. Trocar: --music ID, ou musica.py vetar {trilha['id']}")
    else:
        a.music = None
        print("música: desligada (--no-music)")
    if a.music:
        m_start = a.music_start if a.music_start is not None else float((trilha or {}).get("inicio", 0.0))
        if a.music_vol is None:                      # volume medido: a trilha fica REL_DB abaixo da voz
            mg = list(af) + [f"[ac]{voz},aresample=48000,loudnorm=print_format=json[vz]"]
            (work / "voz_medir.filter").write_text(";\n".join(mg), encoding="utf-8")
            r = run([FF, "-hide_banner", "-nostats", *inputs, "-filter_complex_script", work / "voz_medir.filter",
                     "-map", "[vz]", "-f", "null", "-"])
            voz_lufs = float(json.loads(r.stderr[r.stderr.rfind("{"): r.stderr.rfind("}") + 1])["input_i"])
            m_lufs = float(trilha["lufs"]) if trilha and "lufs" in trilha else musica.medir_lufs(Path(a.music), m_start)
            rel = float((cfg.get("musica") or {}).get("rel_db", musica.REL_DB)) if isinstance(cfg.get("musica"), dict) else musica.REL_DB
            a.music_vol = round(10 ** ((voz_lufs - rel - m_lufs) / 20), 4)
            print(f"música: voz {voz_lufs:.1f} LUFS, trilha {m_lufs:.1f} LUFS -> volume {a.music_vol} ({rel:g} dB abaixo da voz, "
                  f"e o ducking baixa mais durante a fala)")
        m_off, m_delay = m_start, a.music_in or 0.0
        if a.music_drop is not None:
            dt, gain = find_drop(a.music)
            m_off = dt - a.music_drop + m_delay
            if m_off < 0:
                if a.music_in is not None:
                    raise SystemExit(f"--music-drop: o drop da música ({dt}s) não chega em {a.music_drop}s entrando em {m_delay}s.")
                m_delay, m_off = -m_off, 0.0
            print(f"música: drop achado em {dt}s do arquivo (+{gain} dB no grave), cai em {a.music_drop}s do vídeo "
                  f"(arquivo a partir de {m_off:.2f}s, entra em {m_delay:.2f}s). Conferir de ouvido.")
        mdur = max(total - m_delay, 0.5)
        af.append(f"[ac]{voz},aresample=48000,asplit=2[voz][sc]")
        af.append(f"[{idx}:a]atrim=start={m_off:.3f},asetpts=PTS-STARTPTS,aloop=loop=-1:size=2000000000,"
                  f"atrim=duration={mdur:.3f},asetpts=PTS-STARTPTS,volume={a.music_vol},"
                  f"highpass=f=35,equalizer=f=2500:t=q:w=1.0:g=-4,afade=t=in:d=0.4,"      # abre espaço para a voz
                  f"afade=t=out:st={max(mdur - 1.2, 0):.3f}:d=1.2,aresample=48000,"
                  f"adelay={int(m_delay * 1000)}:all=1,apad,atrim=duration={total:.3f}[mus]")
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
    vsrc = src
    if staged:
        base_mp4, base_el = work / "base.mp4", work / "base_el.mp4"
        run([FF, "-v", "error", "-y", "-i", src, "-filter_complex_script", work / "video_base.filter", "-map", "[vbase]",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", "-t", f"{total:.3f}",
             base_mp4], cwd=work)
        from elementos import processar
        processar(work, base_mp4, base_el)
        vsrc = base_el
    run([FF, "-v", "error", "-y", "-i", vsrc, "-i", norm_wav, "-filter_complex_script", work / "video.filter",
         "-map", "[vout]", "-map", "1:a", *enc, "-t", f"{total:.3f}", out], cwd=work)
    if staged:
        base_el.unlink(missing_ok=True)                  # intermediário grande; o base.mp4 fica para o elementos.py --previa
    size = out.stat().st_size / 1e6
    save_json(work / "render.json", {"out": str(out), "grade": gname, "grade_motivo": why, "scene": scene, "aspect": a.aspect,
                                     "size_px": [W, H], "total": total, "music": a.music, "music_vol": a.music_vol,
                                     "trilha": trilha and {k: trilha.get(k) for k in ("id", "titulo", "artista", "clima", "fonte", "licenca")},
                                     "sfx": use_sfx,
                                     "captions": captions_ok, "cards": cards_ok, "voz_restaurada": use_vf, "bar": bar, "fx_visuais": fx_count, "looks": looks, "fit": a.fit, "elementos": bool(staged), "loudness_antes": m["input_i"]})
    print(f"\nPRONTO: {out}  ({size:.1f} MB, {total:.1f}s, {W}x{H})")


_ = os

if __name__ == "__main__":
    main()

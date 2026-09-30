"""Decide onde entram as transições e os efeitos de impacto. Gera fx_events.json.

Regras (mesma lógica dos efeitos sonoros: poucos, amarrados a algo visível):
  - transição só nos CORTES REAIS (onde uma pausa saiu), na sequência definida no perfil;
  - impacto só em palavra-chave, com teto por 10 s e distância mínima;
  - nada de efeito empilhado: impacto não cai perto de uma transição;
  - gancho: um efeito opcional no primeiro segundo;
  - com --music, os impactos encaixam na batida mais próxima (beat sync);
  - fx_manual.json força efeitos: [{"t": 12.3, "fx": "shake"}].

Uso: python plan_fx.py VIDEO [--work DIR] [--profile perfil.json] [--nivel off|leve|media|alta] [--music arquivo.mp3]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from common import load_json, load_presets, merge_profile, save_json, src_to_out, work_dir_for
from fx import CATALOGO

NIVEIS = {
    "off":   {"imp10": 0, "gap": 99,  "cada": 99},
    "leve":  {"imp10": 1, "gap": 3.5, "cada": 2},
    "media": {"imp10": 2, "gap": 2.5, "cada": 1},
    "alta":  {"imp10": 3, "gap": 1.6, "cada": 1},
}


def beats(music: str) -> list[float]:
    import librosa
    y, sr = librosa.load(music, sr=22050, mono=True)
    _, b = librosa.beat.beat_track(y=y, sr=sr, units="time")
    return [float(x) for x in b]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--profile")
    ap.add_argument("--segmento", default="padrao")
    ap.add_argument("--nivel", choices=list(NIVEIS))
    ap.add_argument("--music")
    a = ap.parse_args()

    P = load_presets()
    profile = load_json(a.profile) if a.profile else {}
    cfg = merge_profile(P["segmentos"].get(profile.get("segmento") or a.segmento, P["segmentos"]["padrao"]), profile)
    nivel = a.nivel or cfg.get("fx", "media")
    lv = NIVEIS[nivel]

    work = work_dir_for(Path(a.video).resolve(), a.work)
    edl = load_json(work / "edl.json")
    clips = edl["clips"]
    seq = cfg.get("transicao") or ["corte_seco"]
    seq = [seq] if isinstance(seq, str) else list(seq)
    for n in seq + [cfg.get("impacto"), cfg.get("gancho_fx")]:
        if n and n not in CATALOGO:
            raise SystemExit(f"Efeito '{n}' não existe. Rode: python fx.py")

    ev = []
    if nivel != "off":
        # transições nos cortes reais
        k = 0
        for i in range(1, len(clips)):
            c = clips[i]
            if clips[i - 1]["cont"]:
                ev.append({"t": round(c["t0"], 3), "fx": "troca_zoom", "origem": "zoom"})
                continue
            k += 1
            name = seq[(k - 1) % len(seq)] if k % lv["cada"] == 0 else "corte_seco"
            ev.append({"t": round(c["t0"], 3), "fx": name, "origem": "corte"})
        # gancho
        if cfg.get("gancho_fx"):
            ev.append({"t": 0.14 if cfg["gancho_fx"] in ("flash", "glitch") else 0.05, "fx": cfg["gancho_fx"], "origem": "gancho"})
        # impacto nas palavras-chave
        imp = cfg.get("impacto")
        cap = work / "captions.json"
        if imp and lv["imp10"] and cap.exists():
            words = load_json(work / "words.json")["words"]
            beat_t = beats(a.music) if a.music else []
            kept = [e["t"] for e in ev if e["origem"] in ("corte", "gancho")]
            seen, cand = set(), []
            for i in load_json(cap)["keywords"]:
                w = words[i]
                t = src_to_out(edl, (w["s"] + w["e"]) / 2)
                if t is None or w["w"].lower() in seen:
                    continue
                seen.add(w["w"].lower())
                t = max(0.0, t - (w["e"] - w["s"]) / 2)
                if beat_t:
                    nb = min(beat_t, key=lambda b: abs(b - t))
                    if abs(nb - t) <= 0.15:
                        t = nb
                cand.append(t)
            placed = []
            for t in sorted(cand):
                if any(abs(t - x) < 0.6 for x in kept):                   # longe de transição
                    continue
                if any(abs(t - x) < lv["gap"] for x in placed):
                    continue
                if len([x for x in placed if abs(x - t) < 5]) >= lv["imp10"]:
                    continue
                placed.append(t)
            ev += [{"t": round(t, 3), "fx": imp, "origem": "palavra-chave"} for t in placed]

    manual = work / "fx_manual.json"
    if manual.exists():
        for m in load_json(manual):
            if m["fx"] not in CATALOGO:
                raise SystemExit(f"fx_manual.json: efeito '{m['fx']}' não existe.")
            ev.append({"t": float(m["t"]), "fx": m["fx"], "origem": "manual"})

    ev.sort(key=lambda e: e["t"])
    for e in ev:
        e["dur"] = CATALOGO[e["fx"]]["dur"]
    save_json(work / "fx_events.json", ev)
    vis = [e for e in ev if e["fx"] in ("flash", "whip", "glitch", "dip_preto", "zoom_blur", "pulse", "shake")]
    print(f"fx nível '{nivel}': {len(vis)} efeitos visuais, {len(ev) - len(vis)} cortes só com som, em {edl['total']:.1f}s")
    for e in ev:
        if e["fx"] in ("corte_seco", "troca_zoom"):
            continue
        print(f"  {e['t']:6.2f}s  {e['fx']:<10} ({e['origem']})")


if __name__ == "__main__":
    main()

"""Planeja os cortes de pausa e gera o edl.json. NÃO renderiza nada.

Regras (vêm da auditoria das skills de referência):
  - nunca corta dentro de uma palavra: as bordas de cada clipe caem em silêncio real,
    achado pela energia do áudio (não só pelo timestamp do Whisper, que erra ~0,2 s);
  - folga (pad) antes e depois de cada borda, senão a fala fica "mordida";
  - fade de 30 ms em cada emenda é feito no render (evita estalo);
  - palavra sem energia no áudio é descartada como alucinação do Whisper;
  - o plano é só uma proposta: o Douglas confirma antes do render.

Uso: python plan_cuts.py VIDEO [--work DIR] [--gap 0.35] [--pre 0.06] [--post 0.10]
                         [--zoom 1.12] [--fillers] [--hook-push 0.07]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from common import Envelope, extract_wav, fmt_dur, load_json, norm, probe, save_json, work_dir_for

FILLERS = {"e", "ah", "ahn", "hum", "hm", "hmm", "eh", "ehh", "uh", "uhm", "ne"}  # interjeições puras


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--gap", type=float, default=0.35, help="pausa mínima (s) para virar corte")
    ap.add_argument("--pre", type=float, default=0.06, help="folga antes da 1ª palavra do clipe")
    ap.add_argument("--post", type=float, default=0.10, help="folga depois da última palavra")
    ap.add_argument("--zoom", type=float, default=1.12, help="punch-in nos clipes alternados (1.0 desliga)")
    ap.add_argument("--hook-push", type=float, default=0.07, help="aproximação lenta no 1º clipe (0 desliga)")
    ap.add_argument("--min-cut", type=float, default=0.12, help="se o corte tirar menos que isto (s), não corta")
    ap.add_argument("--interrupt", type=float, default=4.0, help="troca de zoom sem cortar a cada ~N s em trecho longo (0 desliga)")
    ap.add_argument("--force", action="store_true", help="ignora a trava de vídeo sem fala")
    ap.add_argument("--drop", default="", help="trechos do bruto a remover (escolha de take): '10.3-22.4,30-31.5' em segundos")
    ap.add_argument("--no-cuts", action="store_true", help="NÃO corta nada: mantém o vídeo inteiro e só planeja zooms (para legenda/cor/áudio sem mexer na duração)")
    ap.add_argument("--fillers", action="store_true", help="também cortar interjeições puras (ãh, hum). Só com pedido explícito.")
    ap.add_argument("--long-pause", type=float, default=1.2, help="avisar pausas maiores que isto (podem ser intencionais)")
    a = ap.parse_args()

    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    wj = load_json(work / "words.json")
    info = probe(video)
    env = Envelope(extract_wav(video, work / "audio16k.wav", 16000))

    # 1) palavras válidas: precisam ter fala de verdade no trecho (filtra alucinação)
    words, dropped = [], []
    for w in wj["words"]:
        if env.peak_db(w["s"], w["e"]) < env.thr:
            dropped.append(w)
            continue
        w = dict(w)
        if w["e"] - w["s"] > 0.9:                       # Whisper estica palavra sobre a pausa
            w["s"] = max(w["s"], env.onset(w["s"], w["e"]))
        if a.fillers and norm(w["w"]) in FILLERS:
            dropped.append(w)
            continue
        words.append(w)
    drops = []
    for part in [x for x in a.drop.split(",") if x.strip()]:
        lo, hi = part.split("-")
        drops.append((float(lo), float(hi)))
    if drops:
        before = len(words)
        words = [w for w in words if not any(lo <= (w["s"] + w["e"]) / 2 < hi for lo, hi in drops)]
        print(f"--drop: {before - len(words)} palavras removidas em {len(drops)} trechos")
    words = [w for w in words if norm(w["w"]) not in {"musica", "legendas"}]      # o Whisper "escuta" música instrumental
    speech = sum(w["e"] - w["s"] for w in words)
    if not a.no_cuts and not a.force and (len(words) < 8 or speech < 0.15 * info["duration"]):
        raise SystemExit(
            f"PARADO: este vídeo quase não tem fala ({len(words)} palavras, {speech:.1f}s de fala em {info['duration']:.1f}s). "
            f"Corte de pausa não se aplica e cortaria o vídeo quase inteiro. Se é um vídeo de música/produto, "
            f"use --force só se o Douglas pediu mesmo para cortar, ou edite sem esta etapa.")
    if not words and not a.no_cuts:
        raise SystemExit("Nenhuma palavra válida encontrada. Confira o áudio.")

    # 2) agrupa em clipes: pausa maior que --gap vira corte (--no-cuts: vídeo inteiro, nada é cortado)
    groups, cur = [], ([words[0]] if words else [])
    for prev, nxt in zip(words, words[1:]):
        if nxt["s"] - prev["e"] > a.gap and not a.no_cuts:
            groups.append(cur)
            cur = []
        cur.append(nxt)
    if cur:
        groups.append(cur)

    # 3) bordas em silêncio real
    clips = []
    if a.no_cuts:
        groups = []
        clips.append({"in": 0.0, "out": round(info["duration"], 3), "n_words": len(words),
                      "text": " ".join(x["w"] for x in words)})
    for gi, g in enumerate(groups):
        first, last = g[0], g[-1]
        prev_end = groups[gi - 1][-1]["e"] if gi else 0.0
        next_start = groups[gi + 1][0]["s"] if gi + 1 < len(groups) else info["duration"]
        s_ = env.onset(max(prev_end, first["s"] - 0.25), first["e"])
        s_ = min(s_, first["s"])                        # nunca depois do começo da palavra
        t_in = max(0.0, s_ - a.pre)
        e_ = env.offset(last["s"], min(next_start, last["e"] + 0.4))
        t_out = min(max(e_, last["e"] - 0.02) + a.post, next_start - 0.02, info["duration"])
        if clips and t_in < clips[-1]["out"]:           # bordas se sobrepõem: corta no meio
            mid = round((clips[-1]["out"] + t_in) / 2, 3)
            clips[-1]["out"] = mid
            t_in = mid
        clips.append({"in": round(t_in, 3), "out": round(t_out, 3), "n_words": len(g),
                      "text": " ".join(x["w"] for x in g)})

    # 3b) corte que não tira nada (fala contínua, o Whisper só errou o timestamp): funde
    merged = [clips[0]]
    for c in clips[1:]:
        if c["in"] - merged[-1]["out"] < a.min_cut:
            merged[-1].update(out=c["out"], n_words=merged[-1]["n_words"] + c["n_words"],
                              text=merged[-1]["text"] + " " + c["text"])
        else:
            merged.append(c)
    clips = merged

    # 3c) troca de enquadramento SEM corte de áudio em trecho longo (pattern interrupt)
    pieces = []
    for c in clips:
        ws = [w for w in words if w["s"] >= c["in"] - 0.01 and w["e"] <= c["out"] + 0.01]
        last, cuts = c["in"], []
        if a.interrupt > 0:
            for i, w in enumerate(ws[:-1]):
                if (w["w"][-1] in ".?!" or (w["w"][-1] == "," and w["e"] - last > a.interrupt * 1.3)) \
                        and w["e"] - last >= a.interrupt * 0.6 and c["out"] - w["e"] >= 1.5:
                    mid = round((w["e"] + ws[i + 1]["s"]) / 2, 3)
                    cuts.append(mid)
                    last = mid
        edges = [c["in"]] + cuts + [c["out"]]
        for k in range(len(edges) - 1):
            seg = [w["w"] for w in ws if edges[k] - 0.01 <= w["s"] < edges[k + 1]]
            pieces.append({"in": edges[k], "out": edges[k + 1], "n_words": len(seg), "text": " ".join(seg),
                           "cont": k < len(edges) - 2})
    clips = pieces

    # 4) linha do tempo final + zoom alternado (punch-in a cada troca de enquadramento)
    t = 0.0
    for n, c in enumerate(clips):
        c["t0"] = round(t, 3)
        c["zoom"] = 1.0 if (n % 2 == 0 or a.zoom <= 1.0) else a.zoom
        c["push"] = a.hook_push if n == 0 else 0.0
        t += c["out"] - c["in"]
    total = round(t, 3)

    edl = {
        "source": str(video), "work": str(work), "total": total, "orig": info["duration"],
        "gap": a.gap, "pre": a.pre, "post": a.post, "clips": clips,
        "dropped_words": [{"w": d["w"], "s": d["s"]} for d in dropped],
    }
    save_json(work / "edl.json", edl)

    # 4b) possíveis regravações: trechos que repetem quase as mesmas palavras (NÃO remove nada, só avisa)
    retakes = []
    toks = [set(norm(x) for x in c["text"].split() if len(norm(x)) > 2) for c in clips]
    for i in range(len(clips)):
        for j in range(i + 1, len(clips)):
            if clips[i]["cont"] or len(toks[i]) < 4 or len(toks[j]) < 4:
                continue
            inter = len(toks[i] & toks[j]) / min(len(toks[i]), len(toks[j]))
            if inter >= 0.6:
                retakes.append({"a": i + 1, "b": j + 1, "sobreposicao": round(inter, 2)})
    edl["retakes"] = retakes
    save_json(work / "edl.json", edl)

    # 5) relatório para o Douglas confirmar
    removed = info["duration"] - total
    print(f"\nPLANO DE CORTES  ({video.name})")
    print(f"  original {fmt_dur(info['duration'])}  ->  final {fmt_dur(total)}  (tira {fmt_dur(removed)}, {removed / info['duration'] * 100:.0f}%)")
    ncut = sum(1 for c in clips[:-1] if not c["cont"])
    print(f"  {len(clips)} enquadramentos: {ncut} cortes de pausa + {len(clips) - 1 - ncut} trocas de zoom sem cortar a fala")
    print(f"  pausa mínima para cortar: {a.gap}s\n")
    for i, (c, d) in enumerate(zip(clips, clips[1:])):
        at = c["t0"] + c["out"] - c["in"]
        if c["cont"]:
            print(f"  zoom    {i + 1:>2} em {at:6.2f}s  sem corte       '{c['text'][-28:]}' | '{d['text'][:28]}'")
            continue
        gap = d["in"] - c["out"]
        flag = "  <- PAUSA LONGA, pode ser intencional" if gap > a.long_pause else ""
        print(f"  corte   {i + 1:>2} em {at:6.2f}s  tira {gap:5.2f}s  '{c['text'][-28:]}' | '{d['text'][:28]}'{flag}")
    if retakes:
        print("\n  POSSÍVEIS REGRAVAÇÕES (o mesmo conteúdo dito mais de uma vez; escolha qual take fica):")
        for r in retakes:
            ca, cb = clips[r["a"] - 1], clips[r["b"] - 1]
            print(f"    enquadramento {r['a']} ({ca['t0']:.1f}s) e {r['b']} ({cb['t0']:.1f}s), {r['sobreposicao']:.0%} das palavras iguais")
    lead = clips[0]["in"]
    tail = info["duration"] - clips[-1]["out"]
    print(f"\n  início: tira {lead:.2f}s   fim: tira {tail:.2f}s")
    if dropped:
        print(f"  palavras descartadas (sem energia ou interjeição): {', '.join(d['w'] for d in dropped)}")
    print(f"\nedl salvo em {work / 'edl.json'}")


if __name__ == "__main__":
    main()

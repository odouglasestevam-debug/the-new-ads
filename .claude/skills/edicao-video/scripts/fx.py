"""Efeitos e transições no estilo CapCut, recriados em ffmpeg (sem asset de terceiros, sem licença).

Cada efeito é "por cima": não muda a duração nem a sincronia, então legenda e áudio continuam alinhados.
Entram depois da concatenação e ANTES da correção de cor e da legenda (a legenda não é afetada pelo efeito,
então continua legível durante o flash ou o glitch).

Catálogo (nome -> tipo, duração padrão, som que acompanha):
  transições (nos cortes reais): corte_seco, flash, whip, glitch, dip_preto, zoom_blur, foco (feito no elementos.py)
  impacto (na palavra-chave):    pulse, shake, flash, glitch
  looks (o vídeo todo):          grain, vinheta, vhs
Uso direto: python fx.py   (lista o catálogo)
"""
from __future__ import annotations

from math import pi

CATALOGO = {
    "corte_seco": {"tipo": "transicao", "dur": 0.0,  "sfx": "whoosh",  "desc": "Corte limpo, só com whoosh. O mais sóbrio."},
    "troca_zoom": {"tipo": "transicao", "dur": 0.0,  "sfx": "whoosh",  "desc": "Troca de zoom sem cortar a fala (interno)."},
    "flash":      {"tipo": "ambos",     "dur": 0.24, "sfx": "shimmer", "desc": "Clarão branco rápido. Energia, revelação."},
    "whip":       {"tipo": "transicao", "dur": 0.30, "sfx": "whoosh",  "desc": "Borrão horizontal de 'virada de câmera' (swipe)."},
    "glitch":     {"tipo": "ambos",     "dur": 0.32, "sfx": "glitch",  "desc": "Separação RGB com ruído digital. Tendência de alta energia."},
    "dip_preto":  {"tipo": "transicao", "dur": 0.36, "sfx": None,      "desc": "Mergulho no preto. Cinematográfico, sério."},
    "zoom_blur":  {"tipo": "transicao", "dur": 0.30, "sfx": "whoosh",  "desc": "Aproximação com desfoque. Dá peso ao corte."},
    "foco":       {"tipo": "transicao", "dur": 0.45, "sfx": "whoosh",  "desc": "Desfoca e clareia até o corte, o plano novo entra focando (ref3). Desenhado no elementos.py."},
    "pulse":      {"tipo": "impacto",   "dur": 0.30, "sfx": "pop",     "desc": "Batida de zoom (sobe e volta). Destaca a palavra-chave."},
    "shake":      {"tipo": "impacto",   "dur": 0.34, "sfx": "impact",  "desc": "Tremida de câmera que amortece. Pancada, ênfase forte."},
}
LOOKS = {
    "grain":   "noise=alls=9:allf=t+u",
    "vinheta": "vignette=angle=PI/5",
    "vhs":     "noise=alls=14:allf=t,rgbashift=rh=3:bh=-3,eq=saturation=1.15:contrast=1.05,gblur=sigma=0.7",
}


def _win(a: float, b: float) -> str:
    return f"enable='between(t,{a:.3f},{b:.3f})'"


# ---- cada função devolve ("simple", filtro) ou ("branch", função(cur, nxt, k) -> trecho do grafo)

def _flash(T, d, W, H, peak=0.5):
    h = d / 2
    return ("simple", f"eq=brightness='{peak}*max(0,1-abs(t-{T:.3f})/{h:.3f})':eval=frame")


def _dip(T, d, W, H):
    h = d / 2
    return ("simple", f"eq=brightness='-1*max(0,1-abs(t-{T:.3f})/{h:.3f})':eval=frame")


def _whip(T, d, W, H):
    s = max(1, round(W / 1080))
    a, b, c, e = T - d / 2, T - d / 6, T + d / 6, T + d / 2
    return ("simple", f"avgblur=sizeX={22 * s}:sizeY=1:{_win(a, b)},avgblur=sizeX={90 * s}:sizeY=1:{_win(b, c)},"
                      f"avgblur=sizeX={22 * s}:sizeY=1:{_win(c, e)}")


def _glitch(T, d, W, H):
    s = W / 1080
    p = lambda v: int(round(v * s))
    return ("simple",
            f"rgbashift=edge=wrap:rh={-p(16)}:bh={p(16)}:{_win(T, T + d * 0.3)},"
            f"rgbashift=edge=wrap:rh={p(14)}:bv={-p(10)}:gh={-p(6)}:{_win(T + d * 0.3, T + d * 0.65)},"
            f"rgbashift=edge=wrap:rh={-p(8)}:bh={p(8)}:{_win(T + d * 0.65, T + d)},"
            f"noise=alls=30:allf=t:{_win(T, T + d * 0.7)}")


def _shake(T, d, W, H, amp=16):
    a = amp * W / 1080

    def branch(cur, nxt, k):
        dec = f"exp(-7*max(0,t-{T:.3f}))"
        x = f"(iw-ow)/2+{a:.1f}*sin(70*t)*{dec}"
        y = f"(ih-oh)/2+{a:.1f}*cos(53*t)*{dec}"
        return (f"[{cur}]split[{cur}a{k}][{cur}b{k}];"
                f"[{cur}b{k}]scale=w='trunc({W}*(1+0.08*{dec})/2)*2':h=-2:eval=frame,crop={W}:{H}:x='{x}':y='{y}'[{cur}s{k}];"
                f"[{cur}a{k}][{cur}s{k}]overlay={_win(T, T + d)}[{nxt}]")
    return ("branch", branch)


def _pulse(T, d, W, H, amp=0.09):
    def branch(cur, nxt, k):
        e = f"sin({pi:.5f}*clip((t-{T:.3f})/{d:.3f},0,1))"
        return (f"[{cur}]split[{cur}a{k}][{cur}b{k}];[{cur}b{k}]scale=w='trunc({W}*(1+{amp}*{e})/2)*2':h=-2:eval=frame,"
                f"crop={W}:{H}[{cur}s{k}];[{cur}a{k}][{cur}s{k}]overlay={_win(T, T + d)}[{nxt}]")
    return ("branch", branch)


def _zoom_blur(T, d, W, H):
    kind, pulse = _pulse(T, d, W, H, amp=0.12)

    def branch(cur, nxt, k):
        mid = f"{cur}z{k}"
        return pulse(cur, mid, k) + f";[{mid}]gblur=sigma={8 * W / 1080:.1f}:{_win(T - d * 0.35, T + d * 0.25)}[{nxt}]"
    return ("branch", branch)


BUILD = {"flash": _flash, "dip_preto": _dip, "whip": _whip, "glitch": _glitch, "shake": _shake,
         "pulse": _pulse, "zoom_blur": _zoom_blur}


def emit(events: list[dict], W: int, H: int, inp: str = "vc") -> tuple[list[str], str]:
    """Eventos [{t, fx, dur?}] -> trechos de filtergraph encadeados. Devolve (trechos, rótulo final)."""
    frags, cur, k = [], inp, 0
    for ev in sorted(events, key=lambda e: e["t"]):
        name = ev["fx"]
        if name not in BUILD:                       # corte_seco / troca_zoom não têm parte visual
            continue
        d = ev.get("dur") or CATALOGO[name]["dur"]
        kind, obj = BUILD[name](float(ev["t"]), d, W, H)
        nxt = f"fx{k}"
        frags.append(f"[{cur}]{obj}[{nxt}]" if kind == "simple" else obj(cur, nxt, k))
        cur, k = nxt, k + 1
    return frags, cur


def listar() -> None:
    for n, m in CATALOGO.items():
        print(f"  {n:<11} {m['tipo']:<10} {m['desc']}")
    print("  looks:", ", ".join(LOOKS))


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    listar()

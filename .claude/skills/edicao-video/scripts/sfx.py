"""Efeitos sonoros sintéticos (sem banco de áudio, sem direito autoral) alinhados à imagem.

Regras (auditoria + vídeo-use + guia de SFX aprovado pelo Douglas): menos efeitos, cada um amarrado a algo visível.
  - rush (acervo) nos cortes que mudam o zoom: rush_in quando aproxima, rush_out quando afasta; pico na emenda;
  - cartões (cards.json): ui quando o cartão entra, click em item de lista e no riscado, typing na tela tipográfica,
    riser logo antes e hit logo depois da revelação do "termo";
  - pop na palavra-chave quando ela entra (só nível media/alta com fx, ver presets);
  - impact, hit, riser, shutter etc. fora dos cartões só por pedido via sfx_manual.json;
  - teto por densidade (nível off/leve/media/alta) e distância mínima entre efeitos. Sons de cartão não contam no teto.

Os sons novos vêm de sfx_acervo.py (assets/sfx/catalogo.json). `python sfx_acervo.py listar` mostra todos.

Uso: python sfx.py VIDEO [--work DIR] [--nivel leve|media|alta|off] [--profile perfil.json] [--no-cards]
Manual: <work>/sfx_manual.json  ->  [{"t": 12.3, "tipo": "impact"}, {"t": 3.0, "tipo": "tick"},
        {"t": 20.0, "tipo": "riser", "dur": 1.5}, {"t": 20.0, "tipo": "hit"}, {"t": 5.0, "tipo": "click", "id": "click_mouse"}]
        tipo = som antigo (whoosh, pop, impact, tick, glitch, shimmer), categoria do acervo (rush, shutter, typing, click,
        ui, riser, hit) ou id direto do acervo. "dur" vale para riser e typing.
        Categorias por gênero (meme, interface, transicao, cinematico): basta {"t": 30, "tipo": "transicao", "motivo": "virada", "frase": "..."}
        e o som é escolhido sozinho (cabe no espaço, rodízio, sem os vetados). meme só com "sfx_meme": true no perfil; limites em LIMITES_GENERO.
Saída: sfx.wav (mono 48k), sfx_events.json (com motivo) e sfx_ignorados.json
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from common import load_json, load_presets, merge_profile, save_json, work_dir_for, write_wav
from sfx_acervo import ACERVO_CATS, GENEROS, carregar, catalogo, escolher, pico_s, resolver

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
PRIORITY = {"impact": 0, "manual": 0, "riser": 0, "hit": 0, "pop": 1, "glitch": 1, "shimmer": 1, "typing": 1, "click": 1, "ui": 1,
            "whoosh": 2, "tick": 2, "rush": 2, "shutter": 2, "meme": 1, "interface": 1, "transicao": 2, "cinematico": 0}
# categorias por gênero (meme, interface, transicao, cinematico): guarda-corpos contra efeito demais. "forcar": true no evento ignora.
LIMITES_GENERO = {"cinematico": {"max": 2}, "transicao": {"gap": 6.0}, "interface": {"gap": 1.2}}
# Cautela de editor (Douglas, 01/10/2026): ter o acervo à mão não é usar tudo. Um momento de som por vez:
#   - o rush automático cede a qualquer pedido manual ou cartão a menos de FOLGA_FIXOS s (som colado em som vira ruído);
#   - com direção de som (sfx_manual.json) quem põe os efeitos é a direção; o automático cai para a densidade de "leve";
#   - AVISO_POR_10S: acima disso o log avisa que o vídeo está carregado (a v3 do IPTU, com 4,9, foi reprovada por excesso).
FOLGA_FIXOS = 2.5
AVISO_POR_10S = 3.0
# Segunda correção (Douglas, 01/10/2026): a v4 do IPTU, com 13 efeitos (2,9 por 10 s), ainda foi "exagero de efeito sonoro",
# e o vídeo agora sempre tem música por baixo. Por isso:
#   - teto DURO de MOMENTOS_POR_10S momentos de som (sons a menos de 0,35 s um do outro contam como um momento);
#   - passando do teto, sai primeiro o automático (rush de corte), depois o que vem antes em CORTE_ORDEM
#     (transição sem transição na imagem sai antes da que tem);
#   - cartão só toca na revelação (termo: riser + hit); o resto dos cartões fica mudo, salvo "sfx_cartoes": "completo" no perfil.
MOMENTOS_POR_10S = 1.0
CORTE_ORDEM = ["interface", "meme", "ui", "click", "typing", "pop", "tick", "shutter", "whoosh", "rush",
               "transicao_sem_imagem", "transicao", "glitch", "shimmer", "impact", "cinematico", "riser", "hit"]


def prev_cont(edl: dict, c: dict) -> bool:
    i = edl["clips"].index(c)
    return i > 0 and edl["clips"][i - 1]["cont"]


def mudanca_zoom(edl: dict, t: float) -> float:
    """Variação de zoom na emenda que começa em t (positivo = aproxima). 0 se não houver emenda ali."""
    clips = edl["clips"]
    for i in range(1, len(clips)):
        if abs(clips[i]["t0"] - t) < 0.2:
            return clips[i].get("zoom", 1.0) - clips[i - 1].get("zoom", 1.0)
    return 0.0


def genero_de(tipo: str, opt: dict) -> str | None:
    """Categoria por gênero do evento (tipo = categoria ou id do acervo; ou id nas opções). None se não for de gênero."""
    cat = catalogo()
    for k in (opt.get("id"), tipo):
        if k in cat and cat[k]["categoria"] in GENEROS:
            return cat[k]["categoria"]
    return tipo if tipo in GENEROS else None


def filtrar_generos(ev: list[tuple], cfg: dict) -> tuple[list[tuple], list[dict]]:
    """Guarda-corpos dos pedidos manuais de categoria por gênero. Devolve (eventos que ficam, ignorados com o motivo)."""
    ok, ignorados, ultimo, cont = [], [], {}, {}
    for e in sorted(ev, key=lambda e: e[0]):
        t, tipo, origem, opt = e
        g = genero_de(tipo, opt) if origem == "manual" else None
        lim = LIMITES_GENERO.get(g, {})
        if g is None or opt.get("forcar"):
            motivo = None
        elif g == "meme" and not cfg.get("sfx_meme", False):
            motivo = "meme está desligado neste perfil (sfx_meme)"
        elif "max" in lim and cont.get(g, 0) >= lim["max"]:
            motivo = f"já há {lim['max']} {g} neste vídeo"
        elif "gap" in lim and g in ultimo and t - ultimo[g] < lim["gap"]:
            motivo = f"{g} a menos de {lim['gap']:g} s do anterior"
        else:
            motivo = None
        if motivo:
            ignorados.append({"t": round(t, 2), "tipo": tipo, "motivo_ignorado": motivo, **{k: opt[k] for k in ("motivo", "frase") if k in opt}})
            continue
        ok.append(e)
        if g:
            ultimo[g] = t
            cont[g] = cont.get(g, 0) + 1
    return ok, ignorados


def eventos_cards(spec: list[dict], modo: str = "revelacao") -> list[tuple]:
    """Sons dos cartões. modo "revelacao" (padrão desde 01/10): só a revelação do termo toca.
    modo "completo": um som para cada coisa que aparece na tela (guia de SFX antigo)."""
    ev = []
    for c in spec:
        de, k = float(c["de"]), c["tipo"]
        if modo != "completo" and k != "termo":
            continue
        if k == "comentario":
            ev.append((de + 0.02, "ui", "card", {"id": "ui_aparece"}))
            if c.get("riscar_em") is not None:
                ev.append((float(c["riscar_em"]), "click", "card", {"id": "click_seco"}))
        elif k == "termo":                                       # revelação: riser acaba onde o hit cai
            ev.append((de, "riser", "card", {"dur": 1.4}))
            ev.append((de, "hit", "card", {}))
        elif k == "lista":
            ev.append((de + 0.02, "ui", "card", {"id": "ui_swipe"}))
            item = "click_suave" if c.get("icone") == "check" else "click_toque"
            for it in c["itens"]:
                ev.append((float(it["t"]), "click", "card", {"id": item}))
        elif k == "tipografia":
            ev.append((de, "ui", "card", {"id": "ui_swipe"}))
            for p in c["palavras"]:                              # uma rajada de teclas por palavra que entra
                n = len(p["texto"].replace("\\N", "").strip())
                if n:
                    ev.append((float(p["t"]), "typing", "card", {"id": "teclado_suave", "dur": min(0.06 * n + 0.1, 0.7)}))
    return ev


def transicoes_na_imagem(work: Path) -> list[float]:
    """Instantes com transição visível (foco da caixa de ferramentas, ou fx de transição que não é corte seco)."""
    ts = []
    ej = work / "elementos.json"
    if ej.exists():
        ts += [float(e["t"]) for e in load_json(ej) if e.get("tipo") == "foco"]
    fxp = work / "fx_events.json"
    if fxp.exists():
        from fx import CATALOGO
        ts += [float(e["t"]) for e in load_json(fxp)
               if CATALOGO.get(e["fx"], {}).get("tipo") == "transicao" and e["fx"] not in ("corte_seco", "troca_zoom")]
    return ts


def aplicar_teto(kept: list[tuple], total: float, visuais: list[float], por10: float) -> tuple[list[tuple], list[tuple]]:
    """Teto duro de momentos de som. Devolve (fica, sai). Sons a menos de 0,35 s formam um momento só (riser + hit)."""
    limite = max(2, round(total / 10 * por10))
    momentos: list[list[tuple]] = []
    for e in sorted(kept, key=lambda e: e[0]):
        if momentos and e[0] - momentos[-1][-1][0] < 0.35:
            momentos[-1].append(e)
        else:
            momentos.append([e])
    cat = catalogo()

    def peso(m: list[tuple]) -> int:
        if all(e[2] not in ("manual", "card") for e in m):
            return -1                                    # automático (rush de corte) sai antes de qualquer direção
        melhor = 0
        for t, tipo, origem, opt in m:
            c = next((cat[k]["categoria"] for k in (opt.get("id"), tipo) if k and k in cat), tipo)
            if c == "transicao" and not any(abs(t - v) < 0.3 for v in visuais):
                c = "transicao_sem_imagem"
            melhor = max(melhor, CORTE_ORDEM.index(c) if c in CORTE_ORDEM else len(CORTE_ORDEM) // 2)
        return melhor

    sai: list[tuple] = []
    while len(momentos) > limite:
        def aperto(m):                                   # empate: sai o que está mais colado em outro momento
            outros = [o[0][0] for o in momentos if o is not m]
            return min(abs(m[0][0] - x) for x in outros) if outros else 99
        m = min(momentos, key=lambda m: (peso(m), aperto(m)))
        momentos.remove(m)
        sai += m
    return [e for m in momentos for e in m], sai


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--profile")
    ap.add_argument("--segmento", default="padrao")
    ap.add_argument("--nivel", choices=["off", "leve", "media", "alta"])
    ap.add_argument("--no-cards", action="store_true", help="não cria os sons dos cartões (cards.json)")
    a = ap.parse_args()

    P = load_presets()
    profile = load_json(a.profile) if a.profile else {}
    seg = profile.get("segmento") or a.segmento
    cfg = merge_profile(P["segmentos"].get(seg, P["segmentos"]["padrao"]), profile)
    nivel = a.nivel or cfg.get("sfx", "media")
    lv = P["sfx_niveis"][nivel]
    alias = cfg.get("sfx_acervo") or {}                          # personalidade do cliente: troca um som por outro

    video = Path(a.video).resolve()
    work = work_dir_for(video, a.work)
    edl = load_json(work / "edl.json")
    total = edl["total"]

    ev = []                                                      # (tempo na tela, tipo, origem, opções {id, dur})
    manual = work / "sfx_manual.json"
    if manual.exists():
        for m in load_json(manual):
            ev.append((float(m["t"]), m["tipo"], "manual", {k: m[k] for k in ("id", "dur", "motivo", "frase", "forcar") if k in m}))
    if (work / "cards.json").exists() and not a.no_cards:
        ev += eventos_cards(load_json(work / "cards.json"), cfg.get("sfx_cartoes", "revelacao"))
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
            opt = {}
            if tipo == "whoosh" and e["origem"] in ("corte", "zoom") and cfg.get("sfx_rush_direcional", True):
                dz = mudanca_zoom(edl, float(e["t"]))
                if abs(dz) > 0.01:                               # guia: rush em zoom in e zoom out
                    tipo, opt = "rush", {"id": "rush_in_curto" if dz > 0 else "rush_out_curto"}
            ev.append((float(e["t"]), tipo, e["origem"], opt))
    elif lv["cuts"]:
        clips = edl["clips"]
        for i, c in enumerate(clips[1:], 1):
            origem = "corte" if not prev_cont(edl, c) else "zoom"
            dz = c.get("zoom", 1.0) - clips[i - 1].get("zoom", 1.0)
            if cfg.get("sfx_rush_direcional", True) and abs(dz) > 0.01:     # guia: rush em zoom in e zoom out
                ev.append((c["t0"], "rush", origem, {"id": "rush_in_curto" if dz > 0 else "rush_out_curto"}))
            else:
                ev.append((c["t0"], "whoosh", origem, {}))
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
                ev.append((max(0.0, t - (w["e"] - w["s"]) / 2), "pop", "palavra-chave", {}))

    ev, ignorados = filtrar_generos(ev, cfg)
    save_json(work / "sfx_ignorados.json", ignorados)

    # teto de densidade: manual e cartões sempre entram (e tiram o que cair a menos de FOLGA_FIXOS deles); o resto disputa por prioridade
    fixos = ("manual", "card")
    dirigido = any(e[2] == "manual" for e in ev)
    dens = P["sfx_niveis"]["leve"] if dirigido and nivel in ("media", "alta") else lv      # com direção, o automático só preenche
    rank = lambda e: -1 if e[2] in fixos else (0 if e[2] == "corte" else PRIORITY[e[1]])   # corte real vence pop e zoom
    ev.sort(key=lambda e: (rank(e), e[0]))
    kept = []
    for t, tipo, origem, opt in ev:
        if origem in fixos:
            kept.append((t, tipo, origem, opt))
            continue
        if lv["max_per_10s"] == 0:
            continue
        if any(k[2] in fixos and abs(k[0] - t) < FOLGA_FIXOS for k in kept):  # pedido manual e cartão vencem o automático
            continue
        near = [k for k in kept if abs(k[0] - t) < dens["min_gap"] and k[2] not in fixos]
        win = [k for k in kept if abs(k[0] - t) < 5 and k[2] not in fixos]     # janela de 10 s centrada no evento
        if near or len(win) >= dens["max_per_10s"]:
            continue
        kept.append((t, tipo, origem, opt))
    kept, sai = aplicar_teto(kept, total, transicoes_na_imagem(work), float(cfg.get("sfx_momentos_10s", MOMENTOS_POR_10S)))
    for t, tipo, origem, opt in sai:
        ignorados.append({"t": round(t, 2), "tipo": opt.get("id") or tipo, "motivo_ignorado": "teto de som do vídeo "
                          f"({cfg.get('sfx_momentos_10s', MOMENTOS_POR_10S):g} momento por 10 s): ficou o que pesa mais",
                          **{k: opt[k] for k in ("motivo", "frase") if k in opt}})
    save_json(work / "sfx_ignorados.json", ignorados)
    kept.sort(key=lambda e: e[0])

    buf = np.zeros(int(SR * (total + 1)))
    log = []
    usados = []                                                  # sons de gênero já usados no vídeo (rodízio)
    for i, (t, tipo, origem, opt) in enumerate(kept):
        if tipo in GENEROS and not opt.get("id"):                # só a categoria: o som é escolhido (cabe no espaço, rodízio, vetados)
            prox = (kept[i + 1][0] if i + 1 < len(kept) else total) - t
            id_ = escolher(tipo, prox, usados, video.stem)
        else:
            id_ = resolver(tipo, alias, opt.get("id"))
        if id_ and catalogo()[id_]["categoria"] in GENEROS:
            usados.append(id_)
        if id_ is None:                                          # som antigo (whoosh, pop, impact...)
            gen, lead, gain = SOUNDS[tipo]
            sig = gen()
            at = max(0.0, t - (lead if tipo != "whoosh" else len(sig) / SR * 0.55))
        else:                                                    # acervo
            sig = carregar(id_, opt.get("dur"))
            gain = catalogo()[id_]["ganho"]
            at = t - pico_s(id_, sig) - (0.04 if catalogo()[id_]["categoria"] == "riser" else 0.0)   # riser acaba um instante antes
            if at < 0:                                           # começo cortado: o riser perde a parte inicial, que é a mais fraca
                sig = sig[int(-at * SR):]
                at = 0.0
        p = int(at * SR)
        if lv["gain"] and p < len(buf):
            buf[p:p + len(sig)] += lv["gain"] * gain * sig[:len(buf) - p]
        log.append({"t": round(t, 2), "tipo": tipo, "id": id_, "origem": origem, **{k: opt[k] for k in ("motivo", "frase") if k in opt}})
    write_wav(work / "sfx.wav", np.clip(buf, -1, 1), SR)
    save_json(work / "sfx_events.json", log)
    por10 = len(log) / max(total, 1) * 10
    print(f"sfx nível '{nivel}'{' (com direção: automático em densidade leve)' if dens is not lv else ''}: "
          f"{len(log)} efeitos em {total:.1f}s ({por10:.1f} por 10s)")
    if por10 > AVISO_POR_10S:
        print(f"  AVISO: {por10:.1f} por 10 s passa de {AVISO_POR_10S:g}. Vídeo carregado: tirar efeito antes de entregar "
              "(primeiro interface, depois transição, depois o rush).")
    for e in log:
        print(f"  {e['t']:6.2f}s  {e['id'] or e['tipo']:<16} ({e['origem']}){'  ' + e['motivo'] if e.get('motivo') else ''}")
    for g in ignorados:
        print(f"  {g['t']:6.2f}s  IGNORADO {g['tipo']}: {g['motivo_ignorado']}")


if __name__ == "__main__":
    main()

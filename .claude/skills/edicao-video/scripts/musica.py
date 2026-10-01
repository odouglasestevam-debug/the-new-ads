"""Acervo de trilhas de fundo. Música é indispensável (Douglas, 01/10/2026): todo vídeo sai com trilha.

O render.py chama escolher() quando não recebe --music. A trilha vem do clima do perfil do cliente
("musica": {"clima": "serio"} ou {"id": "mixkit_440_infinity"}), ou do segmento (CLIMA_SEGMENTO).
Rodízio por vídeo, favoritas primeiro, vetadas nunca. Volume pelo loudness medido (fica REL_DB abaixo da voz).

Uso:
  python musica.py listar [--clima serio]
  python musica.py analisar            # mede LUFS, BPM, início útil e ocupação da faixa da voz (1 a 4 kHz)
  python musica.py demo [saida.mp3]    # voz anuncia cada trilha e toca 15 s dela, com índice de tempos
  python musica.py vetar ID | favoritar ID | aprovar ID
Os mp3 vêm de fetch_assets.py --only musica (fora do Git: a licença do Mixkit proíbe redistribuir o arquivo).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from common import ASSETS_DIR, FF, run

PASTA = ASSETS_DIR / "musica"
CATALOGO = PASTA / "catalogo.json"
CLIMAS = {
    "corporativo": "positiva, ritmo médio, discreta: serviço, consultoria, agência",
    "serio": "contida, sem euforia: jurídico, regularização, alerta de problema",
    "leve": "calma, acolhedora: saúde, estética, clínica",
    "energia": "batida forte: varejo, oferta, promoção",
    "inspirador": "trilha que cresce: institucional, história, conquista",
    "elegante": "sofisticada: imóvel de alto padrão, arquitetura",
}
CLIMA_SEGMENTO = {"advocacia": "serio", "clinica_estetica": "leve", "imobiliaria_construcao": "corporativo",
                  "ecommerce_varejo": "energia", "tna": "corporativo", "padrao": "corporativo"}
REL_DB = 16.0          # a trilha fica ~16 dB abaixo da voz (antes do ducking, que baixa mais durante a fala)


def carregar() -> dict:
    return json.loads(CATALOGO.read_text(encoding="utf-8"))


def salvar(cat: dict) -> None:
    CATALOGO.write_text(json.dumps(cat, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def faixa(id_: str) -> dict:
    for f in carregar()["faixas"]:
        if f["id"] == id_ or f["arquivo"] == id_ or f["id"].startswith(id_):
            return f
    raise SystemExit(f"trilha '{id_}' não está no catálogo ({CATALOGO})")


def caminho(f: dict) -> Path:
    return PASTA / f["arquivo"]


def clima_de(cfg: dict) -> str:
    m = cfg.get("musica") or {}
    c = (m.get("clima") if isinstance(m, dict) else None) or cfg.get("musica_clima")
    return c or CLIMA_SEGMENTO.get(cfg.get("segmento", "padrao"), "corporativo")


def escolher(cfg: dict, semente: str) -> dict:
    """Trilha para este vídeo: id fixo do perfil, senão rodízio no clima (favoritas antes, vetadas nunca)."""
    m = cfg.get("musica") or {}
    if isinstance(m, dict) and m.get("id"):
        return faixa(m["id"])
    clima = clima_de(cfg)
    fs = [f for f in carregar()["faixas"] if f["clima"] == clima and f.get("status") != "vetada" and caminho(f).exists()]
    if not fs:
        raise SystemExit(f"Nenhuma trilha disponível no clima '{clima}'. Rodar fetch_assets.py --only musica, "
                         f"ou passar --music ARQUIVO.")
    fav = [f for f in fs if f.get("status") == "favorita"]
    pool = fav or fs
    k = int(hashlib.md5(semente.encode("utf-8")).hexdigest(), 16) % len(pool)
    return pool[k]


def medir_lufs(arq: Path, inicio: float = 0.0) -> float:
    r = run([FF, "-hide_banner", "-nostats", "-ss", f"{inicio:.2f}", "-i", arq, "-af", "loudnorm=print_format=json",
             "-f", "null", "-"])
    blob = r.stderr[r.stderr.rfind("{"): r.stderr.rfind("}") + 1]
    return float(json.loads(blob)["input_i"])


def analisar(forcar: bool = False) -> None:
    import librosa
    import numpy as np
    cat = carregar()
    for f in cat["faixas"]:
        arq = caminho(f)
        if not arq.exists() or ("lufs" in f and not forcar):
            continue
        y, sr = librosa.load(str(arq), sr=22050, mono=True)
        hop = 512
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        t = np.arange(len(rms)) * hop / sr
        med = float(np.median(rms))
        ini = float(t[np.argmax(rms >= 0.5 * med)])                     # pula a introdução quase muda
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop)
        S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)) ** 2
        fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
        voz = float(S[(fr >= 1000) & (fr <= 4000)].sum() / (S.sum() + 1e-9))
        seg = rms[t >= ini]
        db = 20 * np.log10(np.maximum(seg, 1e-6))
        f.update({"dur_s": round(len(y) / sr, 1), "inicio": round(ini, 2), "bpm": round(float(np.atleast_1d(tempo)[0])),
                  "lufs": round(medir_lufs(arq, ini), 1), "ocupa_voz": round(voz, 3),
                  "variacao_db": round(float(np.percentile(db, 90) - np.percentile(db, 10)), 1)})
        print(f"  {f['id']:<34} {f['dur_s']:>6}s  início {f['inicio']:>5}s  {f['bpm']:>3} bpm  {f['lufs']:>6} LUFS  "
              f"voz {f['ocupa_voz']:.2f}  variação {f['variacao_db']} dB")
    salvar(cat)


def listar(clima: str | None = None) -> None:
    cat = carregar()
    for c, uso in CLIMAS.items():
        if clima and c != clima:
            continue
        print(f"\n== {c}: {uso}")
        for f in cat["faixas"]:
            if f["clima"] != c:
                continue
            ok = "" if caminho(f).exists() else "  (não baixada)"
            med = f"  {f.get('bpm', '?')} bpm  {f.get('lufs', '?')} LUFS  voz {f.get('ocupa_voz', '?')}" if "lufs" in f else ""
            print(f"  [{f.get('status', '?'):<12}] {f['id']:<34} {f['titulo']} ({f['artista']}, {f['duracao']}){med}{ok}")


def marcar(id_: str, status: str) -> None:
    cat = carregar()
    alvo = faixa(id_)["id"]
    for f in cat["faixas"]:
        if f["id"] == alvo:
            f["status"] = status
    salvar(cat)
    print(f"{alvo}: {status}")


def demo(saida: Path, trecho: float = 15.0) -> None:
    """Um arquivo para ouvir o acervo: a voz anuncia clima e número, a trilha toca `trecho` s a partir do início útil."""
    import subprocess
    from sfx_acervo import PS_FALAR, _mmss
    cat = [f for f in carregar()["faixas"] if caminho(f).exists() and f.get("status") != "vetada"]
    saida = Path(saida).resolve()
    tmp = saida.parent / "_musica_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    falas, ult = [], None
    for i, f in enumerate(cat, 1):
        pre = f"Clima {f['clima'].replace('serio', 'sério')}. " if f["clima"] != ult else ""
        ult = f["clima"]
        falas.append(f"{pre}Número {i}. {f['titulo']}.")
    (tmp / "falas.json").write_text(json.dumps(falas, ensure_ascii=False), encoding="utf-8")
    (tmp / "falar.ps1").write_text(PS_FALAR, encoding="utf-8-sig")
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(tmp / "falar.ps1"),
                        str(tmp / "falas.json"), str(tmp)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"Falha na voz do Windows: {r.stderr[:300]}")
    lista = []
    for i, f in enumerate(cat):
        v, m = tmp / f"v{i:02d}.wav", tmp / f"m{i:02d}.wav"
        run([FF, "-v", "error", "-y", "-i", tmp / f"l{i:02d}.wav", "-ac", "2", "-ar", "48000", "-af", "loudnorm=I=-18", v])
        g = 10 ** ((-18.0 - f.get("lufs", -18.0)) / 20)                # todas no mesmo volume, para comparar
        run([FF, "-v", "error", "-y", "-ss", f"{f.get('inicio', 0):.2f}", "-t", f"{trecho:.1f}", "-i", caminho(f),
             "-ac", "2", "-ar", "48000", "-af", f"volume={g:.3f},afade=t=in:d=0.3,afade=t=out:st={trecho - 1.5:.1f}:d=1.5", m])
        lista += [v, m]
    txt = tmp / "lista.txt"
    txt.write_text("".join(f"file '{p.as_posix()}'\n" for p in lista), encoding="utf-8")
    run([FF, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", txt, "-c:a", "libmp3lame", "-q:a", "2", saida])
    # índice pelos tempos reais de cada pedaço
    import wave
    t, linhas = 0.0, ["ACERVO DE TRILHAS: índice do áudio", f"Cada trilha toca {trecho:.0f} s depois do nome.", ""]
    for i, f in enumerate(cat):
        with wave.open(str(tmp / f"v{i:02d}.wav")) as w:
            dv = w.getnframes() / w.getframerate()
        linhas.append(f"{_mmss(t)}  {i + 1:>2}. [{f['clima']}] {f['id']}  {f['titulo']} ({f['artista']})")
        with wave.open(str(tmp / f"m{i:02d}.wav")) as w:
            t += dv + w.getnframes() / w.getframerate()
    saida.with_name(saida.stem + "-indice.txt").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    for p in tmp.iterdir():
        p.unlink()
    tmp.rmdir()
    print(f"demo: {saida} ({t / 60:.1f} min, {len(cat)} trilhas)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("acao", choices=["listar", "analisar", "demo", "vetar", "favoritar", "aprovar"])
    ap.add_argument("alvo", nargs="?")
    ap.add_argument("--clima", choices=list(CLIMAS))
    ap.add_argument("--forcar", action="store_true")
    a = ap.parse_args()
    if a.acao == "listar":
        listar(a.clima)
    elif a.acao == "analisar":
        analisar(a.forcar)
    elif a.acao == "demo":
        demo(Path(a.alvo or (Path.home() / "Downloads" / "acervo-trilhas.mp3")))
    else:
        if not a.alvo:
            sys.exit("informe o id da trilha")
        marcar(a.alvo, {"vetar": "vetada", "favoritar": "favorita", "aprovar": "aprovada"}[a.acao])


if __name__ == "__main__":
    main()

"""Acervo de efeitos sonoros da skill: 7 categorias, cada uma amarrada a um momento da tela.

Origem: guia de uso de SFX do vídeo de referência que o Douglas aprovou (30/09/2026). As categorias e as regras de
quando usar vêm de lá; os SONS são sintetizados aqui (originais, sem direito autoral, nada baixado nem copiado).

  rush     zoom in / zoom out (corte que aproxima ou afasta)
  shutter  camera shutter: cortes rápidos e transições secas
  typing   keyboard/typing: texto digitado ou revelado na tela
  click    cliques: botão, elemento ou informação que aparece
  ui       sons de interface: animação aparecendo (cartão, ícone, check, notificação)
  riser    ANTES de revelar informação importante (cria expectativa; termina na revelação)
  hit      DEPOIS da revelação (dá o impacto)

Estado: o reel de referência só tem a voz da criadora (nenhum efeito tocando), então estes sons são criados por nós e
aprovados um por vez pelo Douglas. Aprovado até agora: rush (woosh, a versão `rush_in_curto` e irmãs). Reprovados: cliques e mouse. Em aprovação: camera shutter.

Sons reais: em 01/10/2026 o Douglas mandou o SaveClip.mp3 (13 s, só efeitos, sem voz). Foram recortados 10 sons e importados
como `ref01_...` a `ref10_...` (origem "importado", licença desconhecida: uso interno). A categoria de cada um é palpite pela
medição, a confirmar de ouvido; nenhum é padrão de categoria. Para renomear/recategorizar: apagar a entrada do catalogo.json e o
wav, e rodar `importar` de novo com a categoria certa (os recortes originais ficam em assets/sfx/_origem/saveclip/).

O acervo cresce: `importar` aceita um som real (Freesound CC0, Pixabay etc.), limpa, normaliza e registra com a licença.
Um som importado com o mesmo id substitui o sintético; o perfil do cliente pode trocar um som por outro
(`"sfx_acervo": {"hit_seco": "hit_metal"}`).

Uso:
  python sfx_acervo.py gerar [--forcar]        cria assets/sfx/<categoria>/*.wav e o catalogo.json
  python sfx_acervo.py listar [--cat hit]      mostra id, duração e quando usar
  python sfx_acervo.py demo [--saida X.mp4]    vídeo com o nome de cada som na tela, para ouvir e aprovar
  python sfx_acervo.py audio [--saida X.mp3]   mp3 só de áudio: voz (Windows) diz o nome, o som toca 2 vezes; gera o índice .txt
  python sfx_acervo.py importar ARQ --cat click --id click_x --licenca "CC0 Freesound" [--desc ".."]
"""
from __future__ import annotations

import argparse
import functools
import os
import sys
from pathlib import Path

import numpy as np
from scipy import signal

from common import ASSETS_DIR, FF, FONTS_DIR, load_json, read_wav, run, save_json, write_wav

SR = 48000
SFX_DIR = ASSETS_DIR / "sfx"
CATALOGO = SFX_DIR / "catalogo.json"
CATS = ["rush", "shutter", "typing", "click", "ui", "riser", "hit"]
ACERVO_CATS = set(CATS)
USO = {
    "rush": "Zoom in ou zoom out: o corte que aproxima ou afasta a pessoa. rush_in quando aproxima, rush_out quando afasta.",
    "shutter": "Cortes rápidos e transições secas entre cenas.",
    "typing": "Texto sendo digitado ou revelado na tela, palavra por palavra.",
    "click": "Botão, elemento ou informação que aparece na tela; item de lista; riscar.",
    "ui": "Animação aparecendo: cartão, ícone, check, notificação.",
    "riser": "Logo ANTES de revelar uma informação importante, para gerar expectativa. Termina exatamente na revelação.",
    "hit": "Logo DEPOIS da revelação, no instante em que a informação aparece, para dar impacto.",
}
GANHO = {"rush": 1.0, "shutter": 0.8, "typing": 0.55, "click": 0.8, "ui": 0.7, "riser": 1.1, "hit": 1.3}


# ---------------------------------------------------------------- blocos de síntese

def _t(d: float) -> np.ndarray:
    return np.arange(int(SR * d)) / SR


def _norm(y: np.ndarray, peak: float = 0.7) -> np.ndarray:
    return y / (np.abs(y).max() + 1e-9) * peak


def _noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n)


def _band(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, [lo, min(hi, SR / 2 - 100)], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def _low(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def _fade(y: np.ndarray, ini: float = 0.002, fim: float = 0.012) -> np.ndarray:
    y = y.copy()
    a, b = min(int(SR * ini), len(y)), min(int(SR * fim), len(y))
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if b:
        y[-b:] *= np.linspace(1, 0, b)
    return y


def _put(buf: np.ndarray, y: np.ndarray, at: float, g: float = 1.0) -> None:
    p = int(at * SR)
    if p < 0 or p >= len(buf):
        return
    m = min(len(y), len(buf) - p)
    buf[p:p + m] += g * y[:m]


def _reverb(y: np.ndarray, rt: float = 0.4, wet: float = 0.25, seed: int = 3) -> np.ndarray:
    n = int(SR * rt)
    t = np.arange(n) / SR
    ir = _noise(n, seed) * np.exp(-t * 6.9 / rt)
    ir = signal.sosfilt(signal.butter(1, 250, btype="high", fs=SR, output="sos"), ir)
    conv = signal.fftconvolve(y, ir)
    conv *= np.abs(y).max() / (np.abs(conv).max() + 1e-9)
    out = np.zeros(len(conv))
    out[:len(y)] += y
    return out + wet * conv


def _sweep(n: int, f0: float, f1: float, bw: float = 1.1, seed: int = 1, curva: float = 1.0) -> np.ndarray:
    """Ruído filtrado por uma banda que anda de f0 a f1 (largura bw em oitavas): o 'vuuush'."""
    x = _noise(n + 2048, seed)
    f, _, Z = signal.stft(x, SR, nperseg=1024, noverlap=896)
    fc = f0 * (f1 / f0) ** (np.linspace(0, 1, Z.shape[1]) ** curva)
    lf = np.log2(np.maximum(f, 20)[:, None] / fc[None, :])
    _, y = signal.istft(Z * np.exp(-0.5 * (lf / bw) ** 2), SR, nperseg=1024, noverlap=896)
    return y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))


def _tap(f_body: float, tau_body: float, nlo: float, nhi: float, tau_noise: float, g_noise: float, g_body: float,
         seed: int, d: float = 0.14) -> np.ndarray:
    """Toque seco: corpo ressonante + estalo de ruído filtrado."""
    t = _t(d)
    body = np.sin(2 * np.pi * f_body * t) * np.exp(-t / tau_body)
    nz = _band(_noise(len(t), seed), nlo, nhi) * np.exp(-t / tau_noise)
    nz = nz / (np.abs(nz).max() + 1e-9) * 3.0                  # estalo curto: precisa de energia para ser ouvido
    return g_body * body + g_noise * nz


def _bell(f: float, tau: float, d: float, parciais=(1, 2.0, 3.01, 4.2), amps=(1, .35, .2, .1)) -> np.ndarray:
    t = _t(d)
    y = np.zeros(len(t))
    for p, a in zip(parciais, amps):
        y += a * np.sin(2 * np.pi * f * p * t) * np.exp(-t / (tau / p ** 0.6))
    return y * np.minimum(t / 0.002, 1)


# ---------------------------------------------------------------- rush (zoom)

def _rush(d: float, f0: float, f1: float, pico: float, seed: int) -> np.ndarray:
    n = int(SR * d)
    x = np.linspace(0, 1, n)
    # envelope assimétrico: sobe até `pico` e cai mais rápido
    env = np.where(x < pico, (x / pico) ** 1.6, ((1 - x) / (1 - pico)) ** 1.1)
    y = _sweep(n, f0, f1, bw=1.15, seed=seed) * env
    return _fade(_norm(y), 0.004, 0.02)


def rush_in_curto(d=0.45): return _rush(d, 250, 3600, 0.68, 21)
def rush_in_medio(d=0.8): return _rush(d, 200, 3200, 0.72, 22)
def rush_out_curto(d=0.45): return _rush(d, 3600, 250, 0.32, 23)
def rush_out_medio(d=0.8): return _rush(d, 3200, 200, 0.28, 24)
def rush_lateral(d=0.36): return _rush(d, 700, 2600, 0.5, 25) * 0.9


# ---------------------------------------------------------------- camera shutter

def _shot(forca: float, f_body: float, seed: int) -> np.ndarray:
    est = _tap(f_body, 0.010, 2500, 10000, 0.004, 1.0, 0.35, seed)
    thunk = _tap(220, 0.03, 100, 600, 0.01, 0.2, 0.7, seed + 1)
    out = est.copy()
    out[:len(thunk)] += thunk * 0.6
    return out * forca


def shutter_simples(d=0.2):
    buf = np.zeros(int(SR * d))
    _put(buf, _shot(1.0, 700, 31), 0.0)
    return _norm(_fade(buf))


def shutter_dslr(d=0.34):
    buf = np.zeros(int(SR * d))
    _put(buf, _shot(1.0, 700, 32), 0.0)
    _put(buf, _shot(0.65, 520, 33), 0.085)               # lâmina fechando: mais grave e mais fraca
    return _norm(_fade(_reverb(buf, 0.15, 0.12, 4)[:len(buf)]))


def shutter_rajada(d=0.62):
    buf = np.zeros(int(SR * d))
    for i, (at, g) in enumerate([(0.0, 0.9), (0.15, 0.8), (0.30, 0.9), (0.44, 1.0)]):
        _put(buf, _shot(g, 700 - 30 * i, 34 + i), at)
    return _norm(_fade(buf))


# ---------------------------------------------------------------- teclado / digitando

def _tecla(rng: np.random.Generator, tipo: str) -> np.ndarray:
    s = int(rng.integers(1, 10 ** 6))
    if tipo == "mecanico":                                  # "thock" grave com estalo
        k = _tap(float(rng.uniform(380, 520)), 0.020, 1800, 6000, 0.004, 0.8, 0.9, s, 0.12)
        th = _tap(150, 0.03, 80, 500, 0.012, 0.0, 0.6, s + 1, 0.12)
    else:                                                   # notebook, mais macio
        k = _tap(float(rng.uniform(500, 700)), 0.012, 2500, 8000, 0.002, 0.4, 0.8, s, 0.12)
        th = _tap(200, 0.015, 100, 600, 0.008, 0.0, 0.4, s + 1, 0.12)
    return k + th


def _digitar(d: float, tipo: str, media: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    buf = np.zeros(int(SR * (d + 0.15)))
    t = 0.0
    while t < d - 0.04:
        _put(buf, _tecla(rng, tipo), t, float(rng.uniform(0.6, 1.0)))
        t += float(rng.gamma(4.0, media / 4.0)) + (0.12 if rng.random() < 0.1 else 0.0)
    return _norm(_fade(buf[:int(SR * d)], 0.002, 0.04))


def teclado_mecanico(d=1.6): return _digitar(d, "mecanico", 0.085, 41)
def teclado_suave(d=1.6): return _digitar(d, "suave", 0.075, 42)
def digitando_rapido(d=1.2): return _digitar(d, "suave", 0.052, 43)


# ---------------------------------------------------------------- cliques

def click_seco(d=0.1):
    return _norm(_fade(_tap(520, 0.008, 2500, 7000, 0.0015, 0.7, 1.0, 51, d)))


def click_mouse(d=0.16):
    buf = np.zeros(int(SR * d))
    _put(buf, _tap(600, 0.010, 1500, 6000, 0.003, 0.8, 0.8, 52), 0.0)       # apertar
    _put(buf, _tap(800, 0.006, 2000, 7000, 0.002, 0.7, 0.4, 53), 0.075, 0.6)  # soltar
    return _norm(_fade(buf))


def click_suave(d=0.14):
    t = _t(d)
    y = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.02) + 0.3 * np.sin(2 * np.pi * 840 * t) * np.exp(-t / 0.01)
    y += 0.15 * _low(_noise(len(t), 54), 3000) * np.exp(-t / 0.004)
    return _norm(_fade(y * np.minimum(t / 0.0015, 1)))


def click_toque(d=0.16):
    return _norm(_fade(_tap(260, 0.030, 400, 2500, 0.008, 0.6, 1.0, 55, d)))


# ---------------------------------------------------------------- interface

def ui_pop(d=0.26):
    t = _t(d)
    f = 460 * (1 + 0.8 * (1 - np.exp(-t * 45)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.minimum(t / 0.003, 1) * np.exp(-t / 0.06)
    return _norm(_fade(y))


def ui_aparece(d=0.32):
    t = _t(d)
    f = 350 + 550 * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + 0.2 * np.sin(2 * ph)) * np.minimum(t / 0.004, 1) * np.exp(-t / 0.075)
    return _norm(_fade(_low(y, 3500)))


def ui_swipe(d=0.34):
    n = int(SR * d)
    y = _sweep(n, 500, 3200, 1.0, 61) * np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return _norm(_fade(y, 0.01, 0.03)) * 0.8


def ui_notify(d=0.95):
    buf = np.zeros(int(SR * d))
    _put(buf, _bell(659, 0.35, 0.6), 0.0)
    _put(buf, _bell(880, 0.40, 0.6), 0.13, 0.85)
    return _norm(_fade(_reverb(buf, 0.5, 0.22, 5)[:len(buf)], 0.002, 0.05))


def ui_confirm(d=0.75):
    buf = np.zeros(int(SR * d))
    for i, f in enumerate([523, 659, 784]):
        _put(buf, _bell(f, 0.25, 0.5), 0.07 * i)
    return _norm(_fade(_reverb(buf, 0.4, 0.2, 6)[:len(buf)], 0.002, 0.05))


def ui_toggle(d=0.16):
    buf = np.zeros(int(SR * d))
    for at, f, dd in [(0.0, 380, 0.05), (0.05, 570, 0.08)]:
        t = _t(dd)
        _put(buf, np.sin(2 * np.pi * f * t) * np.exp(-t / 0.025) * np.minimum(t / 0.002, 1), at)
    return _norm(_fade(_low(buf, 2500)))


# ---------------------------------------------------------------- riser (dura `d`; o som termina em d)

def riser_ruido(d=2.0):
    n = int(SR * d)
    t = np.arange(n) / SR
    trem = 1 + 0.35 * np.sin(2 * np.pi * np.cumsum(6 + 12 * (t / d)) / SR)
    y = _sweep(n, 200, 7500, 1.0, 71, curva=1.6) * (t / d) ** 2.2 * trem
    return _norm(_fade(y, 0.02, 0.008))


def riser_tonal(d=2.0):
    n = int(SR * d)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(110 * 8 ** ((t / d) ** 1.3)) / SR
    y = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.3 * np.sin(1.5 * ph)
    y = y * 0.7 + 0.35 * _sweep(n, 300, 6000, 1.0, 72, 1.4) / (np.abs(_sweep(n, 300, 6000, 1.0, 72, 1.4)).max() + 1e-9)
    return _norm(_fade(y * (t / d) ** 1.8, 0.02, 0.008))


def riser_pulso(d=2.0):
    n = int(SR * d)
    t = np.arange(n) / SR
    buf = np.zeros(n)
    at, k = 0.0, 0
    while at < d - 0.05:                                     # batidas que aceleram: expectativa
        tt = _t(0.22)
        f = 50 + 40 * np.exp(-tt * 25)
        thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.07)
        _put(buf, thump, at, 0.35 + 0.65 * at / d)
        at += max(0.075, 0.42 * 0.82 ** k)
        k += 1
    sw = _sweep(n, 300, 5000, 1.0, 73, 1.5)
    buf += 0.5 * sw / (np.abs(sw).max() + 1e-9) * (t / d) ** 2
    return _norm(_fade(buf, 0.01, 0.008))


# ---------------------------------------------------------------- hit (impacto)

def hit_cinematico(d=1.8):
    t = _t(d)
    sub = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 8)) / SR) * np.exp(-t / 0.55)
    corpo = _low(_noise(len(t), 81), 2500) * np.exp(-t / 0.06) * 0.8
    y = _reverb(sub + corpo, 0.9, 0.3, 7)[:len(t)]
    return _norm(_fade(y, 0.001, 0.12))


def hit_seco(d=0.45):
    t = _t(d)
    kick = np.sin(2 * np.pi * np.cumsum(55 + 130 * np.exp(-t * 35)) / SR) * np.exp(-t / 0.11)
    estalo = _band(_noise(len(t), 82), 1000, 5000) * np.exp(-t / 0.006) * 0.3
    return _norm(_fade(kick + estalo, 0.001, 0.05))


def hit_sub(d=1.0):
    t = _t(d)
    y = np.sin(2 * np.pi * np.cumsum(34 + 30 * np.exp(-t * 6)) / SR) * (1 - np.exp(-t * 200)) * np.exp(-t / 0.35)
    return _norm(_fade(y, 0.002, 0.1))


def hit_metal(d=1.2):
    t = _t(d)
    y = np.zeros(len(t))
    for r, a, tau in [(1, 1.0, .5), (2.76, .6, .35), (5.4, .35, .2), (8.9, .2, .1)]:
        y += a * np.sin(2 * np.pi * 185 * r * t) * np.exp(-t / tau)
    y += 0.8 * np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.2)
    y += 0.3 * _band(_noise(len(t), 83), 1500, 7000) * np.exp(-t / 0.008)
    return _norm(_fade(_reverb(y, 0.5, 0.2, 8)[:len(t)], 0.001, 0.1))


# id -> (função, categoria, descrição curta, dinâmico: aceita duração)
SONS = {
    "rush_in_curto": (rush_in_curto, "rush", "Rush de zoom in curto: sobe e passa na emenda.", False),
    "rush_in_medio": (rush_in_medio, "rush", "Rush de zoom in mais longo, para aproximação lenta.", False),
    "rush_out_curto": (rush_out_curto, "rush", "Rush de zoom out curto: desce.", False),
    "rush_out_medio": (rush_out_medio, "rush", "Rush de zoom out mais longo.", False),
    "rush_lateral": (rush_lateral, "rush", "Passagem lateral (whip), para troca de cena sem zoom.", False),
    "shutter_simples": (shutter_simples, "shutter", "Um clique de câmera.", False),
    "shutter_dslr": (shutter_dslr, "shutter", "Clique duplo de DSLR (espelho e lâmina).", False),
    "shutter_rajada": (shutter_rajada, "shutter", "Rajada de 4 disparos, para sequência de cortes rápidos.", False),
    "teclado_mecanico": (teclado_mecanico, "typing", "Teclado mecânico, 'thock' grave.", True),
    "teclado_suave": (teclado_suave, "typing", "Teclado de notebook, macio.", True),
    "digitando_rapido": (digitando_rapido, "typing", "Digitação rápida e contínua.", True),
    "click_seco": (click_seco, "click", "Clique curto e seco.", False),
    "click_mouse": (click_mouse, "click", "Clique de mouse (aperta e solta).", False),
    "click_suave": (click_suave, "click", "Clique arredondado, discreto.", False),
    "click_toque": (click_toque, "click", "Toque na tela, mais grave.", False),
    "ui_pop": (ui_pop, "ui", "Pop quente de elemento entrando.", False),
    "ui_aparece": (ui_aparece, "ui", "Bolha: algo aparece e assenta.", False),
    "ui_swipe": (ui_swipe, "ui", "Deslize suave, para cartão ou tela entrando.", False),
    "ui_notify": (ui_notify, "ui", "Notificação de duas notas.", False),
    "ui_confirm": (ui_confirm, "ui", "Confirmação em três notas ascendentes (check).", False),
    "ui_toggle": (ui_toggle, "ui", "Liga/desliga curto.", False),
    "riser_ruido": (riser_ruido, "riser", "Riser de ruído que abre e sobe.", True),
    "riser_tonal": (riser_tonal, "riser", "Riser com tom subindo e ruído.", True),
    "riser_pulso": (riser_pulso, "riser", "Batidas que aceleram até a revelação.", True),
    "hit_cinematico": (hit_cinematico, "hit", "Impacto grave com cauda longa.", False),
    "hit_seco": (hit_seco, "hit", "Impacto curto e firme (padrão).", False),
    "hit_sub": (hit_sub, "hit", "Queda de sub-grave, sem estalo.", False),
    "hit_metal": (hit_metal, "hit", "Impacto metálico com cauda.", False),
}
PADRAO = {"rush": "rush_in_curto", "shutter": "shutter_dslr", "typing": "teclado_suave", "click": "click_suave",
          "ui": "ui_aparece", "riser": "riser_ruido", "hit": "hit_seco"}


def _pico(cat: str, y: np.ndarray) -> float:
    """Instante (s) do ponto de impacto dentro do arquivo: é nele que o som encosta no evento da tela."""
    if cat == "riser":
        return len(y) / SR
    if cat == "typing":
        return 0.0
    env = np.convolve(np.abs(y), np.ones(int(SR * 0.005)) / int(SR * 0.005), mode="same")
    return float(np.argmax(env) / SR)


# ---------------------------------------------------------------- catálogo

def _wav_path(id_: str, cat: str) -> Path:
    return SFX_DIR / cat / f"{id_}.wav"


def gerar(forcar: bool = False) -> dict:
    old = {s["id"]: s for s in load_json(CATALOGO)["sons"]} if CATALOGO.exists() else {}
    sons = []
    for id_, (fn, cat, desc, dyn) in SONS.items():
        p = _wav_path(id_, cat)
        if id_ in old and old[id_]["origem"] == "importado" and p.exists():
            sons.append(old[id_])
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        y = fn()
        if forcar or not p.exists():
            write_wav(p, y, SR)
        y, _ = read_wav(p)
        sons.append({"id": id_, "categoria": cat, "arquivo": f"{cat}/{id_}.wav", "desc": desc,
                     "quando_usar": USO[cat], "dur": round(len(y) / SR, 3), "pico_s": round(_pico(cat, y), 3),
                     "ganho": GANHO[cat], "dinamico": dyn, "padrao": PADRAO[cat] == id_, "origem": "sintetico",
                     "licenca": "original (gerado em código)"})
    for id_, s in old.items():                                # importados que não existem no gerador
        if id_ not in SONS:
            sons.append(s)
    save_json(CATALOGO, {"versao": 1, "origem_regras": "guia de SFX aprovado pelo Douglas em 30/09/2026", "sons": sons})
    return {s["id"]: s for s in sons}


@functools.lru_cache(maxsize=1)
def catalogo() -> dict:
    if not CATALOGO.exists():
        return gerar()
    return {s["id"]: s for s in load_json(CATALOGO)["sons"]}


def resolver(tipo: str, alias: dict | None = None, pedido: str | None = None) -> str | None:
    """Categoria ou id -> id do acervo (None se for um som antigo: whoosh, pop, impact...). `alias` troca um som por outro."""
    alvo = pedido or tipo
    if alvo in ACERVO_CATS:
        alvo = PADRAO[alvo]
    alvo = (alias or {}).get(alvo, alvo)
    return alvo if alvo in catalogo() else None


def carregar(id_: str, dur: float | None = None) -> np.ndarray:
    """Som pronto para misturar (mono 48k, pico 0,7). `dur` só vale para riser e typing."""
    s = catalogo()[id_]
    cat = s["categoria"]
    if s["origem"] == "sintetico" and dur and s["dinamico"]:
        return SONS[id_][0](d=float(dur))
    y, sr = read_wav(SFX_DIR / s["arquivo"])
    if sr != SR:
        y = signal.resample_poly(y, SR, sr)
    y = y.astype(np.float64)
    if dur and s["dinamico"]:
        n = int(SR * dur)
        if cat == "riser":                                   # o fim é o que importa: fica o final do arquivo
            y = y[-n:] if len(y) >= n else np.concatenate([np.zeros(n - len(y)), y])
        else:
            y = _fade(y[:n], 0.002, 0.04) if len(y) >= n else np.tile(y, int(np.ceil(n / len(y))))[:n]
    return y


def pico_s(id_: str, y: np.ndarray) -> float:
    return _pico(catalogo()[id_]["categoria"], y)


# ---------------------------------------------------------------- importar

def importar(arq: str, cat: str, id_: str, licenca: str, desc: str | None, dyn: bool) -> None:
    if cat not in ACERVO_CATS:
        raise SystemExit(f"Categoria inválida: {cat}. Use uma de {', '.join(CATS)}")
    tmp = SFX_DIR / "_tmp_import.wav"
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    run([FF, "-v", "error", "-y", "-i", arq, "-vn", "-ac", "1", "-ar", SR, "-c:a", "pcm_s16le", tmp])
    y, _ = read_wav(tmp)
    tmp.unlink()
    y = y.astype(np.float64)
    ativo = np.where(np.abs(y) > np.abs(y).max() * 10 ** (-50 / 20))[0]      # corta silêncio das pontas (-50 dB)
    y = y[max(ativo[0] - int(SR * 0.005), 0): ativo[-1] + int(SR * 0.05)]
    y = _fade(_norm(y), 0.001, 0.02)
    p = _wav_path(id_, cat)
    p.parent.mkdir(parents=True, exist_ok=True)
    write_wav(p, y, SR)
    cats = catalogo()
    entrada = {"id": id_, "categoria": cat, "arquivo": f"{cat}/{id_}.wav", "desc": desc or f"Importado ({licenca})",
               "quando_usar": USO[cat], "dur": round(len(y) / SR, 3), "pico_s": round(_pico(cat, y), 3),
               "ganho": GANHO[cat], "dinamico": dyn or cat in ("riser", "typing"), "padrao": False,
               "origem": "importado", "licenca": licenca}
    cats = dict(cats)
    cats[id_] = entrada
    save_json(CATALOGO, {"versao": 1, "origem_regras": "guia de SFX aprovado pelo Douglas em 30/09/2026",
                         "sons": list(cats.values())})
    catalogo.cache_clear()
    print(f"importado: {p} ({entrada['dur']}s, licença: {licenca})")


# ---------------------------------------------------------------- demonstração em vídeo

def _ass_dem(itens: list[dict], W: int, H: int, total: int) -> str:
    def ts(x: float) -> str:
        h, r = divmod(x, 3600)
        m, s = divmod(r, 60)
        return f"{int(h)}:{int(m):02d}:{s:05.2f}"
    gold = "&H4AB8E0&"                                       # #E0B84A em BGR
    head = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
            "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: Cat,Poppins ExtraBold,48,{gold},&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,6,0,1,0,0,5,0,0,0,1\n"
            "Style: Id,Poppins ExtraBold,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,60,60,0,1\n"
            "Style: Uso,Poppins SemiBold,36,&H00C8C8C8,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,70,70,0,1\n"
            "Style: Num,Poppins SemiBold,30,&H00808080,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,2,0,0,60,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    ev = []
    for i, it in enumerate(itens):
        a, b = ts(it["ini"]), ts(it["fim"])
        ev.append(f"Dialogue: 1,{a},{b},Cat,,0,0,0,,{{\\pos({W // 2},{int(H * 0.30)})}}{it['cat'].upper()}")
        ev.append(f"Dialogue: 1,{a},{b},Id,,0,0,0,,{{\\pos({W // 2},{int(H * 0.40)})}}{it['id']}")
        ev.append(f"Dialogue: 1,{a},{b},Uso,,0,0,0,,{{\\pos({W // 2},{int(H * 0.50)})}}{it['uso']}")
        ev.append(f"Dialogue: 1,{a},{b},Num,,0,0,0,,{i + 1:02d} / {total:02d}")
    return head + "\n".join(ev) + "\n"


def _fila() -> list[dict]:
    """Todos os sons do acervo na ordem das categorias, mais o combo riser + hit no fim."""
    cat = catalogo()
    ordem = [s for c in CATS for s in cat.values() if s["categoria"] == c]
    fila = []                                                # (id, rótulo, uso, dur do som, sinal)
    for s in ordem:
        dur = 1.6 if s["categoria"] == "typing" else (2.0 if s["categoria"] == "riser" else None)
        y = carregar(s["id"], dur)
        fila.append({"id": s["id"], "cat": s["categoria"], "uso": s["quando_usar"], "y": y, "g": s["ganho"], "extra": None})
    # fecha com o combo da regra: riser logo antes da revelação, hit logo depois
    r = carregar("riser_ruido", 2.0)
    h = carregar("hit_seco")
    combo = np.concatenate([r, np.zeros(int(SR * 0.04)), h])
    fila.append({"id": "riser_ruido + hit_seco", "cat": "combo", "uso": "Riser termina na revelação e o hit cai no mesmo instante: é a dupla da referência.",
                 "y": combo, "g": 1.0, "extra": None})
    return fila


def demo(saida: Path) -> None:
    fila = _fila()
    buf_len, t, itens = 0, 0.0, []
    for f in fila:
        dur_som = len(f["y"]) / SR
        itens.append({**f, "ini": t, "som": t + 0.6, "fim": t + 0.6 + max(dur_som, 0.5) + 0.8})
        t = itens[-1]["fim"]
    buf = np.zeros(int(SR * (t + 0.5)))
    for it in itens:
        _put(buf, it["y"], it["som"], 0.8 * it["g"])
    buf = buf / max(np.abs(buf).max(), 1e-9) * 0.89
    saida = Path(saida).resolve()
    tmpd = saida.parent / "_demo_tmp"
    tmpd.mkdir(parents=True, exist_ok=True)
    wav = tmpd / "demo.wav"
    write_wav(wav, buf, SR)
    W, H = 720, 1280
    (tmpd / "demo.ass").write_text(_ass_dem(itens, W, H, len(itens)), encoding="utf-8")
    fd = os.path.relpath(FONTS_DIR, tmpd).replace("\\", "/")
    run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x141414:s={W}x{H}:r=30:d={t + 0.5:.2f}", "-i", "demo.wav",
         "-vf", f"ass=demo.ass:fontsdir={fd}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-c:a", "aac",
         "-b:a", "160k", "-shortest", saida], cwd=tmpd)
    for f in tmpd.iterdir():
        f.unlink()
    tmpd.rmdir()
    print(f"demo: {saida} ({t:.0f}s, {len(itens)} sons)")


PS_FALAR = """param($json, $dir)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Maria Desktop')
$itens = Get-Content -Raw -Encoding UTF8 $json | ConvertFrom-Json
$i = 0
foreach ($t in $itens) { $s.SetOutputToWaveFile((Join-Path $dir ('l{0:00}.wav' -f $i))); $s.Speak($t); $i++ }
$s.Dispose()
"""


def _mmss(x: float) -> str:
    return f"{int(x // 60):02d}:{int(x % 60):02d}"


def audio(saida: Path, repetir: int = 2) -> None:
    """Um arquivo só para ouvir o acervo: a voz anuncia o nome, o som toca `repetir` vezes. Gera também o índice com os tempos."""
    import json
    import subprocess
    fila = _fila()
    saida = Path(saida).resolve()
    tmpd = saida.parent / "_audio_tmp"
    tmpd.mkdir(parents=True, exist_ok=True)
    falas, ult = [], None
    for i, f in enumerate(fila, 1):
        nome = f["id"].replace("_", " ").replace("+", "mais")
        pre = f"Categoria {f['cat']}. " if f["cat"] != ult else ""
        ult = f["cat"]
        falas.append(f"{pre}Número {i}. {nome}.")
    (tmpd / "falas.json").write_text(json.dumps(falas, ensure_ascii=False), encoding="utf-8")
    (tmpd / "falar.ps1").write_text(PS_FALAR, encoding="utf-8-sig")
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(tmpd / "falar.ps1"),
                        str(tmpd / "falas.json"), str(tmpd)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"Falha na voz do Windows: {r.stderr[:300]}")
    t, partes, indice = 0.3, [], []
    for i, f in enumerate(fila):
        run([FF, "-v", "error", "-y", "-i", tmpd / f"l{i:02d}.wav", "-ac", 1, "-ar", SR, "-c:a", "pcm_s16le", tmpd / f"v{i:02d}.wav"])
        v, _ = read_wav(tmpd / f"v{i:02d}.wav")
        v = v.astype(np.float64)
        v = v / (np.abs(v).max() + 1e-9) * 0.5
        indice.append((t, f))
        partes.append((t, v, 1.0))
        t += len(v) / SR + 0.45
        for _ in range(repetir):
            partes.append((t, f["y"], 0.8 * f["g"]))
            t += len(f["y"]) / SR + 0.7
        t += 0.8
    buf = np.zeros(int(SR * (t + 0.5)))
    for at, y, g in partes:
        _put(buf, y, at, g)
    buf = buf / max(np.abs(buf).max(), 1e-9) * 0.89
    wav = tmpd / "acervo.wav"
    write_wav(wav, buf, SR)
    run([FF, "-v", "error", "-y", "-i", wav, "-c:a", "libmp3lame", "-q:a", "2", saida])
    linhas = ["ACERVO DE EFEITOS SONOROS: índice do áudio", f"Cada som toca {repetir} vezes depois do nome.", ""]
    ult = None
    for at, f in indice:
        if f["cat"] != ult:
            linhas += ["", f"== {f['cat'].upper()}: {USO.get(f['cat'], f['uso'])}"]
            ult = f["cat"]
        linhas.append(f"{_mmss(at)}  {f['id']}")
    saida.with_name(saida.stem + "-indice.txt").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    for f in tmpd.iterdir():
        f.unlink()
    tmpd.rmdir()
    print(f"audio: {saida} ({t:.0f}s, {len(fila)} sons)")


def auditar(opcoes: list[tuple[str, np.ndarray, str]], saida: Path, repetir: int = 3) -> None:
    """Áudio de aprovação, um som por vez: a voz anuncia cada opção e ela toca `repetir` vezes.
    opcoes = [(fala, sinal 48k, nome do arquivo)]. Grava também um wav por opção em <saida sem extensão>/."""
    import json
    import subprocess
    saida = Path(saida).resolve()
    tmpd = saida.parent / "_aud_tmp"
    tmpd.mkdir(parents=True, exist_ok=True)
    (tmpd / "falas.json").write_text(json.dumps([o[0] for o in opcoes], ensure_ascii=False), encoding="utf-8")
    (tmpd / "falar.ps1").write_text(PS_FALAR, encoding="utf-8-sig")
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(tmpd / "falar.ps1"),
                        str(tmpd / "falas.json"), str(tmpd)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"Falha na voz do Windows: {r.stderr[:300]}")
    t, partes = 0.3, []
    for i, (_, y, _) in enumerate(opcoes):
        run([FF, "-v", "error", "-y", "-i", tmpd / f"l{i:02d}.wav", "-ac", 1, "-ar", SR, "-c:a", "pcm_s16le", tmpd / f"v{i:02d}.wav"])
        v, _ = read_wav(tmpd / f"v{i:02d}.wav")
        v = v.astype(np.float64)
        partes.append((t, v / (np.abs(v).max() + 1e-9) * 0.5))
        t += len(v) / SR + 0.5
        for _ in range(repetir):
            partes.append((t, y * 0.85))
            t += len(y) / SR + 0.9
        t += 0.7
    buf = np.zeros(int(SR * (t + 0.5)))
    for at, y in partes:
        _put(buf, y, at)
    write_wav(tmpd / "o.wav", buf / max(np.abs(buf).max(), 1e-9) * 0.89, SR)
    run([FF, "-v", "error", "-y", "-i", tmpd / "o.wav", "-c:a", "libmp3lame", "-q:a", "2", saida])
    pasta = saida.with_suffix("")
    pasta.mkdir(exist_ok=True)
    for _, y, nome in opcoes:
        write_wav(pasta / f"{nome}.wav", y, SR)
    for f in tmpd.iterdir():
        f.unlink()
    tmpd.rmdir()
    print(f"{saida} ({t:.0f}s), wavs em {pasta}")


# ---------------------------------------------------------------- CLI

def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    g = sp.add_parser("gerar")
    g.add_argument("--forcar", action="store_true")
    li = sp.add_parser("listar")
    li.add_argument("--cat")
    d = sp.add_parser("demo")
    d.add_argument("--saida", default=str(Path.home() / "Downloads" / "acervo-sfx-demo.mp4"))
    au = sp.add_parser("audio", help="um mp3 para ouvir: a voz diz o nome de cada som e ele toca duas vezes")
    au.add_argument("--saida", default=str(Path.home() / "Downloads" / "acervo-sfx.mp3"))
    au.add_argument("--repetir", type=int, default=2)
    im = sp.add_parser("importar")
    im.add_argument("arquivo")
    im.add_argument("--cat", required=True)
    im.add_argument("--id", required=True)
    im.add_argument("--licenca", required=True, help="de onde veio e sob qual licença (obrigatório)")
    im.add_argument("--desc")
    im.add_argument("--dinamico", action="store_true")
    a = ap.parse_args()

    if a.cmd == "gerar":
        c = gerar(a.forcar)
        print(f"{len(c)} sons em {SFX_DIR}")
    elif a.cmd == "listar":
        for s in catalogo().values():
            if a.cat and s["categoria"] != a.cat:
                continue
            print(f"{s['categoria']:<8} {s['id']:<18} {s['dur']:5.2f}s  {'*' if s['padrao'] else ' '} {s['desc']}")
        if not a.cat:
            print("\n* = padrão da categoria\n")
            for c in CATS:
                print(f"{c:<8} {USO[c]}")
    elif a.cmd == "demo":
        demo(Path(a.saida))
    elif a.cmd == "audio":
        audio(Path(a.saida), a.repetir)
    elif a.cmd == "importar":
        importar(a.arquivo, a.cat, a.id, a.licenca, a.desc, a.dinamico)


if __name__ == "__main__":
    main()

"""Recorta a pessoa de uma foto (fundo transparente) pra usar em landing page.

Uso:
  python recorte.py <foto> <saida.webp|saida.png> [--altura 1500] [--previa previa.jpg]

Como funciona: o MediaPipe acha a pessoa (máscara em baixa resolução), o GrabCut
refaz a borda em resolução cheia, um filtro guiado suaviza o contorno e a borda é
descontaminada (tira a cor do fundo que vaza no contorno, o "halo").
Funciona melhor com fundo liso de estúdio. Em fundo cheio de detalhe, sempre
conferir a prévia: pedaço de fundo grudado no braço ou buraco no cabelo
aparecem ali.
"""
import argparse
import os
import urllib.request

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
from PIL import Image, ImageOps

MODELO_URL = ("https://storage.googleapis.com/mediapipe-models/image_segmenter/"
              "selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite")
MODELO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelos", "selfie_multiclass.tflite")
FUNDO_PREVIA = (26, 9, 7)  # BGR do fundo escuro da prévia


def baixa_modelo():
    if not os.path.exists(MODELO):
        os.makedirs(os.path.dirname(MODELO), exist_ok=True)
        print("baixando o modelo de segmentação do MediaPipe (16 MB)...")
        urllib.request.urlretrieve(MODELO_URL, MODELO)


def abre(caminho, largura):
    # PIL respeita a rotação do EXIF e aceita caminho com acento no Windows
    im = ImageOps.exif_transpose(Image.open(caminho)).convert("RGB")
    if im.width > largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def mascara_mediapipe(img):
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=mpt.BaseOptions(model_asset_path=MODELO), output_confidence_masks=True))
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    fundo = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)).confidence_masks[0].numpy_view()
    return 1.0 - cv2.resize(fundo, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)


def maior_componente(m):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
    if n <= 1:
        return m.astype(np.float32)
    return (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.float32)


def recorta(img):
    guia = img.astype(np.float32) / 255
    alpha = mascara_mediapipe(img)
    alpha = np.clip((cv2.ximgproc.guidedFilter(guia, alpha.astype(np.float32), 8, 1e-4) - .15) / .7, 0, 1)

    # GrabCut parte da máscara do MediaPipe: certeza no miolo, dúvida na borda
    gc = np.full(alpha.shape, cv2.GC_PR_BGD, np.uint8)
    gc[alpha > .5] = cv2.GC_PR_FGD
    gc[cv2.erode((alpha > .9).astype(np.uint8), np.ones((31, 31), np.uint8)) == 1] = cv2.GC_FGD
    gc[cv2.dilate((alpha > .1).astype(np.uint8), np.ones((41, 41), np.uint8)) == 0] = cv2.GC_BGD
    cv2.grabCut(img, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    duro = maior_componente(np.isin(gc, [cv2.GC_FGD, cv2.GC_PR_FGD]))
    duro = cv2.morphologyEx(duro, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    a = np.clip(cv2.erode(cv2.ximgproc.guidedFilter(guia, duro, 3, 1e-3), np.ones((3, 3), np.uint8)), 0, 1)

    # descontamina a borda: estima a cor do fundo pelos cantos de cima e tira ela do contorno
    cantos = np.concatenate([img[:60, :60].reshape(-1, 3), img[:60, -60:].reshape(-1, 3)])
    fundo = np.median(cantos, axis=0).astype(np.float32)
    ac = np.clip(a, .35, 1)[..., None]
    limpo = np.clip((img.astype(np.float32) - (1 - ac) * fundo) / ac, 0, 255)
    borda = ((a > .01) & (a < .98))[..., None]
    cor = np.where(borda, limpo, img.astype(np.float32)).astype(np.uint8)
    return cor, a


def main():
    ap = argparse.ArgumentParser(description="Recorta a pessoa de uma foto")
    ap.add_argument("foto")
    ap.add_argument("saida", help=".webp (página) ou .png (original com transparência)")
    ap.add_argument("--altura", type=int, default=1500, help="altura máxima do arquivo final")
    ap.add_argument("--largura-trabalho", type=int, default=1400)
    ap.add_argument("--previa", help="jpg de conferência sobre fundo escuro")
    a = ap.parse_args()

    baixa_modelo()
    img = abre(a.foto, a.largura_trabalho)
    cor, alpha = recorta(img)

    rgba = np.dstack([cv2.cvtColor(cor, cv2.COLOR_BGR2RGB), (alpha * 255).astype(np.uint8)])
    final = Image.fromarray(rgba, "RGBA")
    if final.height > a.altura:
        final = final.resize((round(final.width * a.altura / final.height), a.altura), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(a.saida)), exist_ok=True)
    if a.saida.lower().endswith(".webp"):
        final.save(a.saida, quality=82, method=6)
    else:
        final.save(a.saida)
    print("recorte salvo:", a.saida, final.size)

    if a.previa:
        fundo = np.zeros_like(cor, dtype=np.float32); fundo[:] = FUNDO_PREVIA
        comp = cor.astype(np.float32) * alpha[..., None] + fundo * (1 - alpha[..., None])
        h = 1000
        comp = cv2.resize(comp.astype(np.uint8), (round(comp.shape[1] * h / comp.shape[0]), h))
        cv2.imencode(".jpg", comp)[1].tofile(a.previa)
        print("prévia:", a.previa)


if __name__ == "__main__":
    main()

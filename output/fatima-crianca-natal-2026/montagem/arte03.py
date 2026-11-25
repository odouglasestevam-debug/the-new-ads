import sys, cv2, numpy as np
sys.path.insert(0, sys.argv[4]); from compor import *
orig8 = cv2.imread(sys.argv[1]); orig = orig8.astype(np.float32); F = sys.argv[2]
h, w = orig.shape[:2]
hsv = cv2.cvtColor(orig8, cv2.COLOR_BGR2HSV); H, Sa, V = [hsv[:,:,i].astype(int) for i in range(3)]
amarelo = (H >= 17) & (H <= 34) & (Sa > 160) & (V > 190)
verde = (H > 30) & (H < 95) & (Sa > 60) & (V > 25)
frutinha = ((H <= 6) | (H >= 172)) & (Sa > 170) & (V > 60)
# 1) mão à esquerda da caixa: a faixa inteira vira o amarelo do fundo (uniforme, BGR ~ 2,207,254),
#    menos o pinheiro, que fica por cima
regiao = np.zeros((h, w), np.float32); regiao[676:1120, 0:120] = 1
pinheiro = ((verde | frutinha) & (np.arange(h)[:, None] > 1030)).astype(np.float32)
pinheiro = cv2.GaussianBlur(pinheiro, (3, 3), 0)
alfa = cv2.GaussianBlur(regiao, (5, 5), 0) * (1 - pinheiro)
fundo = np.zeros_like(orig); fundo[:] = (2, 207, 253)
limpo = orig * (1 - alfa[..., None]) + fundo * alfa[..., None]
mao = (alfa > 0.5).astype(np.uint8)
# 2) caixa nova no lugar da antiga (cobre a antiga inteira) + sombra
dest = np.float32([[103, 299], [707, 299], [707, 1107], [103, 1107]])
caixa = mascara_poligono(orig.shape, dest, raio=24)
sombra = cv2.GaussianBlur(np.roll(np.roll(caixa, 12, 0), 9, 1), (0, 0), 14)
out = limpo * (1 - 0.32 * sombra[..., None] * (1 - caixa[..., None]))
f = cv2.imread(F + '/IMG_9148.jpg').astype(np.float32)   # versão 1350x1800
src = np.float32([[248, 398], [1042, 400], [1030, 1436], [268, 1438]])
M = cv2.getPerspectiveTransform(src, dest)
warp = cv2.warpPerspective(f, M, (w, h), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
out = out * (1 - caixa[..., None]) + warp * caixa[..., None]
cv2.imwrite(sys.argv[3], np.clip(out, 0, 255).astype(np.uint8))
cv2.imwrite(sys.argv[3].replace('.png', '-mao.png'), mao * 255)
print('ok', int(mao.sum()))

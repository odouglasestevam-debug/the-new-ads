import sys, cv2, numpy as np
sys.path.insert(0, sys.argv[4]); from compor import *
from scipy.ndimage import median_filter, uniform_filter1d
orig = cv2.imread(sys.argv[1]).astype(np.float32); F = sys.argv[2]
h, w = orig.shape[:2]

def tapar_buracos_pequenos(m, limite=400):
    inv = (1 - m).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    out = m.copy()
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < limite: out[lab == i] = 1
    return out
hsv = cv2.cvtColor(orig.astype(np.uint8), cv2.COLOR_BGR2HSV)
H, Sa, V = hsv[:,:,0].astype(int), hsv[:,:,1].astype(int), hsv[:,:,2].astype(int)
verm = (((H < 9) | (H > 168)) & (Sa > 120) & (V > 60))
# borda de baixo da fita de cima: entra na fita e desce até 3 px seguidos sem vermelho
topo = np.zeros(w); base = np.zeros(w)
for x in range(w):
    col = verm[:, x]
    ys = [y for y in range(545, 600) if col[y]]
    y = ys[len(ys)//2] if ys else 590
    gap = 0
    while y < 700 and gap < 3:
        gap = 0 if col[y] else gap + 1; y += 1
    topo[x] = y - 3
    ys = [y for y in range(1150, 1185) if col[y]]
    y = ys[len(ys)//2] if ys else 1165
    gap = 0
    while y > 1080 and gap < 3:
        gap = 0 if col[y] else gap + 1; y -= 1
    base[x] = y + 3
topo = uniform_filter1d(median_filter(topo, 41), 15); base = uniform_filter1d(median_filter(base, 41), 15)
print('topo min/max', topo.min().round(), topo.max().round(), '| base min/max', base.min().round(), base.max().round())
# máscara da área da foto entre as fitas (com 2 px de folga pra dentro da fita)
yy = np.arange(h)[:, None]
area = ((yy >= topo[None, :] - 2) & (yy <= base[None, :] + 2)).astype(np.float32)
area = cv2.GaussianBlur(area, (3, 3), 0)
# laço: só vermelho puro (as chamas do Hot Wheels são mais laranja), maior componente, buracos preenchidos
estrito = (((H <= 5) | (H >= 172)) & (Sa > 140) & (V > 50)).astype(np.uint8)
zona = np.zeros((h, w), np.uint8); zona[505:690, 425:715] = 1
m = cv2.morphologyEx(estrito * zona, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
maior = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
keep = (lab == maior).astype(np.uint8)
keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
keep = tapar_buracos_pequenos(keep)   # só os fios dourados do laço
keep = cv2.dilate(keep, np.ones((3, 3), np.uint8)).astype(np.float32)
keep[:int(topo.min())-6, :] = 1   # acima da área da foto nada muda
keep = cv2.GaussianBlur(keep, (3, 3), 0)
alpha = np.clip(area * (1 - keep), 0, 1)
f = cv2.imread(F + '/IMG_9172.jpg').astype(np.float32)
fh, fw = f.shape[:2]
alt = base.max() - topo.min() + 8
largura = fw; aspecto = w / alt
rec = recorte_foto(f, (fw/2, 2050), largura, aspecto)
quad = np.float32([[0, topo.min()-4], [w, topo.min()-4], [w, topo.min()-4+alt], [0, topo.min()-4+alt]])
out = colar_quad(orig, f, rec, quad, alpha)
cv2.imwrite(sys.argv[3], np.clip(out, 0, 255).astype(np.uint8))
cv2.imwrite(sys.argv[3].replace('.png', '-mask.png'), (alpha*255).astype(np.uint8))
print('ok', rec)

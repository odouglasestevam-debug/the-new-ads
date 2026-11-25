import sys, cv2, numpy as np
sys.path.insert(0, sys.argv[4]); from compor import *
orig8 = cv2.imread(sys.argv[1]); orig = orig8.astype(np.float32); F = sys.argv[2]
h, w = orig.shape[:2]
hsv = cv2.cvtColor(orig8, cv2.COLOR_BGR2HSV); H, Sa, V = [hsv[:,:,i].astype(int) for i in range(3)]
branco = (Sa < 40) & (V > 228)
verm = ((H <= 6) | (H >= 172)) & (Sa > 150) & (V > 70)
laranja = (H >= 6) & (H <= 16) & (Sa > 170) & (V > 200)
verde = (H > 30) & (H < 95) & (Sa > 60) & (V > 25)
def run(col, y0, y1, n):
    c = 0
    for y in range(y0, y1):
        c = c + 1 if col[y] else 0
        if c >= n: return y - n + 1
    return None
def fim(col, y, y1):
    while y < y1 and col[y]: y += 1
    return y
X = np.arange(w)

def tapar_buracos_pequenos(m, limite=400):
    inv = (1 - m).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    out = m.copy()
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < limite: out[lab == i] = 1
    return out
# curva branca de cima (fim do filete branco)
pts = []
for x in range(10, 980, 20):
    y0 = 380 if (x < 120 or x > 960) else 420
    a = run(branco[:, x], y0, 520, 4)
    if a: pts.append((x, fim(branco[:, x], a, 560)))
pts = np.array(pts); p = np.polyfit(pts[:,0], pts[:,1], 2)
res = np.abs(np.polyval(p, pts[:,0]) - pts[:,1]); pts = pts[res < 6]; p = np.polyfit(pts[:,0], pts[:,1], 2)
y_topo = np.polyval(p, X)
# fita: início do vermelho e fim do filete branco abaixo dela (fora do laço)
a1, a2 = [], []
for x in list(range(10, 440, 20)) + list(range(670, 1092, 20)):
    r = run(verm[:, x], 680, 900, 12)
    if not r: continue
    rf = fim(verm[:, x], r, 950); b = run(branco[:, x], rf, rf + 30, 2)
    a1.append((x, r)); 
    if b: a2.append((x, fim(branco[:, x], b, rf + 40)))
a1, a2 = np.array(a1), np.array(a2)
def robusto(pts, grau, tol=3):
    pts = np.array(pts, float)
    while True:   # tira um ponto por vez, sempre o pior, até todos ficarem dentro da tolerância
        c = np.polyfit(pts[:,0], pts[:,1], grau)
        r = np.abs(np.polyval(c, pts[:,0]) - pts[:,1])
        if r.max() <= tol or len(pts) < grau + 4: return c, len(pts)
        pts = np.delete(pts, np.argmax(r), 0)
c1, n1 = robusto(a1, 2, 3); c2, n2 = robusto(a2, 2, 3)
y_fita = np.polyval(c1, X); y_fita_fim = np.polyval(c2, X)
print('fita x=10/550/1090:', y_fita[[10,550,1090]].round(), 'fim:', y_fita_fim[[10,550,1090]].round(), 'pontos', n1, n2, 'de', len(a1), len(a2))
# base laranja (interpolada)
b = [(x, run(laranja[:, x], 1150, 1300, 4)) for x in range(70, 1092, 20)]
b = np.array([(x, y) for x, y in b if y])
y_base = np.interp(X, b[:,0], b[:,1])
# diagonal branca
d = []
for y in range(860, 1220, 20):
    for x in range(480, 640):
        if branco[y, x:x+5].all(): d.append((y, x + 5)); break
d = np.array(d); pd = np.polyfit(d[:,0], d[:,1], 1)
res = np.abs(np.polyval(pd, d[:,0]) - d[:,1]); d = d[res < 6]; pd = np.polyfit(d[:,0], d[:,1], 1)
print('topo', p.round(5), '| diag', pd.round(4))
Y = np.arange(h)[:, None]
x_diag = np.polyval(pd, np.arange(h))[:, None]   # centro aproximado da diagonal por linha
def suave(m): return cv2.GaussianBlur(m.astype(np.float32), (3, 3), 0)
cima = suave((Y >= y_topo[None, :] - 1) & (Y <= y_fita[None, :] + 2))
baixo = (Y >= y_fita_fim[None, :] - 2) & (Y <= y_base[None, :] + 1)
esq = suave(baixo & (X[None, :] <= x_diag - 6))
dir_ = suave(baixo & (X[None, :] >= x_diag + 5))
# laço (vermelho puro, maior componente na zona do laço) e pinheiros ficam por cima
estrito = (((H <= 5) | (H >= 172)) & (Sa > 140) & (V > 50)).astype(np.uint8)
zona = np.zeros((h, w), np.uint8); zona[690:900, 420:690] = 1
m = cv2.morphologyEx(estrito * zona, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
laco = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
laco = cv2.morphologyEx(laco, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
laco = tapar_buracos_pequenos(laco)
laco = suave(cv2.dilate(laco, np.ones((3, 3), np.uint8)))
zp = np.zeros((h, w), bool); zp[360:500, 940:] = True; zp[1180:, :90] = True; zp[1180:, 990:] = True
pinho = suave(cv2.dilate((verde & zp).astype(np.uint8), np.ones((3, 3), np.uint8)))
protege = np.maximum(laco, pinho)
out = orig.copy()
def foto(nome): return cv2.imread(F + '/' + nome).astype(np.float32)
def colar_regiao(f, centro, largura, x0, y0, x1, y1, alpha):
    global out
    rec = recorte_foto(f, centro, largura, (x1 - x0) / (y1 - y0))
    quad = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    out = colar_quad(out, f, rec, quad, alpha * (1 - protege))
# faixa de cima: 3 fotos separadas por filetes inclinados como a diagonal
inc = pd[0]
def linha(xc, y): return xc + inc * (y - 640)
sep = [362, 728]
col = [suave((X[None, :] < linha(sep[0], Y))), None, suave((X[None, :] > linha(sep[1], Y)))]
col[1] = suave((X[None, :] >= linha(sep[0], Y)) & (X[None, :] <= linha(sep[1], Y)))
yt0 = int(y_topo.min()) - 2
# (foto, centro do produto na foto 3024x4032, largura do recorte, faixa x)
colar_regiao(foto('IMG_9179.jpg'), (1512, 2020), 2500, 0, yt0, 400, 840, cima * col[0])
colar_regiao(foto('IMG_9177.jpg'), (1545, 2330), 2950, 330, yt0, 770, 810, cima * col[1])
colar_regiao(foto('IMG_9170.jpg'), (1384, 2163), 2947, 700, yt0, w, 770, cima * col[2])
for xc in sep:
    filete = np.zeros((h, w), np.uint8)
    p0 = (int(linha(xc, yt0)), yt0); p1 = (int(linha(xc, 860)), 860)
    cv2.line(filete, p0, p1, 255, 9, cv2.LINE_AA)
    a = (filete.astype(np.float32) / 255) * cima * (1 - protege)
    out = colar_cor(out, (255, 255, 255), a)
# embaixo: esquerda e direita da diagonal
colar_regiao(foto('IMG_9202.jpg'), (1540, 2150), 3024, 0, 790, 600, 1290, esq)
colar_regiao(foto('IMG_9191.jpg'), (1512, 1949), 3024, 480, 740, w, 1270, dir_)
cv2.imwrite(sys.argv[3], np.clip(out, 0, 255).astype(np.uint8))
print('ok')

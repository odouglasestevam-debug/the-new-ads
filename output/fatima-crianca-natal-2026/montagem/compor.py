# Funções de montagem: troca a foto dentro de uma área da arte mantendo o resto.
import cv2, numpy as np
SS = 4  # supersampling das máscaras

def mascara_poligono(shape, pts, raio=0):
    h, w = shape[:2]
    m = np.zeros((h*SS, w*SS), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts)*SS).astype(np.int32)], 255, lineType=cv2.LINE_AA)
    if raio:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*raio*SS+1, 2*raio*SS+1))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)/255

def recuo(quad, d):
    q = np.array(quad, np.float32); out = []
    for i in range(4):
        p, a, b = q[i], q[(i+1)%4], q[(i-1)%4]
        u = (a-p)/np.linalg.norm(a-p); v = (b-p)/np.linalg.norm(b-p)
        out.append(p + d*u + d*v)
    return np.array(out, np.float32)

def recorte_foto(foto, centro, largura, aspecto):
    """recorte retangular (x0,y0,x1,y1) com centro, largura e aspecto (l/a), limitado à foto"""
    H, W = foto.shape[:2]; a = largura/aspecto
    x0 = centro[0]-largura/2; y0 = centro[1]-a/2
    x0 = min(max(0, x0), W-largura); y0 = min(max(0, y0), H-a)
    return (x0, y0, x0+largura, y0+a)

def colar_quad(base, foto, rec, quad, alpha):
    x0,y0,x1,y1 = rec
    src = np.float32([[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
    M = cv2.getPerspectiveTransform(src, np.float32(quad))
    h, w = base.shape[:2]
    warp = cv2.warpPerspective(foto, M, (w, h), flags=cv2.INTER_AREA if (x1-x0) > 2*w else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    a = alpha[..., None]
    return (base*(1-a) + warp*a)

def colar_cor(base, cor, alpha):
    a = alpha[..., None]
    return base*(1-a) + np.array(cor, np.float32)*a

def preservar(base, original, mask):
    a = mask[..., None]
    return base*(1-a) + original*a

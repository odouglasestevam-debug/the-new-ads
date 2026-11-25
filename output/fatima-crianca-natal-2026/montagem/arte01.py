import sys, cv2, numpy as np
sys.path.insert(0, sys.argv[4]); from compor import *
orig = cv2.imread(sys.argv[1]).astype(np.float32); F = sys.argv[2]
out = orig.copy()
pinheiro = None
hsv = cv2.cvtColor(orig.astype(np.uint8), cv2.COLOR_BGR2HSV)
verde = ((hsv[:,:,0] > 30) & (hsv[:,:,0] < 95) & (hsv[:,:,1] > 60) & (hsv[:,:,2] > 25)).astype(np.float32)
zona = np.zeros_like(verde); zona[980:1220, 960:1122] = 1
pinheiro = cv2.GaussianBlur(verde*zona, (3,3), 0)

def impressao(quad, foto, centro, largura):
    global out
    moldura = mascara_poligono(out.shape, quad, raio=7)
    out = colar_cor(out, (255,255,255), moldura)
    interno = recuo(quad, 11)
    asp = np.linalg.norm(interno[1]-interno[0]) / np.linalg.norm(interno[3]-interno[0])
    f = cv2.imread(foto).astype(np.float32)
    rec = recorte_foto(f, centro, largura, asp)
    out = colar_quad(out, f, rec, interno, mascara_poligono(out.shape, interno, raio=3))

# esquerda: Barbie sereia (IMG_9148); direita: LEGO F1 (IMG_9144). Fotos 3024x4032.
impressao([(41,634),(542,603),(572,1138),(75,1168)], F+'/IMG_9148.jpg', (1462, 2078), 2280)
impressao([(553,663),(1090,715),(1047,1146),(514,1095)], F+'/IMG_9144.jpg', (1491, 2057), 2300)
out = preservar(out, orig, pinheiro)
cv2.imwrite(sys.argv[3], np.clip(out,0,255).astype(np.uint8))
print('ok')

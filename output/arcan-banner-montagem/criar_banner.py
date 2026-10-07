from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

ROOT = Path(__file__).absolute().parent
BASE = ROOT.parent / 'produtos-fontes' / 'candidatas'
S = 2
W, H = 2400, 800
canvas = Image.new('RGBA', (W*S,H*S), '#111315')
d = ImageDraw.Draw(canvas)
gold = '#EAC477'
white = '#F8F5ED'
muted = '#BDB9AD'
def box(rect): return tuple(round(v*S) for v in rect)
def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/'+('arialbd.ttf' if bold else 'arial.ttf'), round(size*S))
def text(x,y,value,size,color=white,bold=False):
    d.text((x*S,y*S),value,font=font(size,bold),fill=color,anchor='lt')
def line(points,fill,width=1):
    d.line([(round(x*S),round(y*S)) for x,y in points],fill=fill,width=round(width*S))

# Restrained charcoal gradient and warm illumination behind real products.
for y in range(H*S):
    t=y/(H*S)
    d.line((0,y,W*S,y), fill=(int(15+8*t),int(17+6*t),int(19+4*t),255))
glow=Image.new('RGBA',canvas.size)
gd=ImageDraw.Draw(glow)
gd.ellipse(box((1490,110,2460,1040)), fill=(184,132,43,40))
glow=glow.filter(ImageFilter.GaussianBlur(100*S))
canvas.alpha_composite(glow)
d=ImageDraw.Draw(canvas)
for inset,alpha in [(0,70),(35,30),(105,20)]:
    d.arc(box((1450-inset,-110-inset,2540+inset,980+inset)),115,310,fill=(220,177,93,alpha),width=2*S)
line([(60,45),(2340,45)], '#584931',1)
line([(60,755),(2340,755)], '#584931',1)
line([(60,45),(170,45)],gold,3)
line([(2230,755),(2340,755)],gold,3)
line([(435,150),(435,650)], '#494337',1)

# Extract the supplied monochrome emblem + wordmark without redrawing them.
logo_path = Path('C:/Users/odoug/OneDrive/Imagens/Capturas de tela/Captura de tela 2026-10-06 100819.png')
logo=Image.open(logo_path).convert('RGB')
mask=ImageOps.invert(ImageOps.grayscale(logo))
mask=mask.point(lambda p: 0 if p<12 else min(255,round(p*255/215)))
bounds=mask.getbbox()
mask=mask.crop(bounds)
lw=305*S
lh=round(mask.height*lw/mask.width)
mask=mask.resize((lw,lh),Image.Resampling.LANCZOS)
brand=Image.new('RGBA',(lw,lh),white)
brand.putalpha(mask)
canvas.alpha_composite(brand,(78*S,round(255*S)))
d=ImageDraw.Draw(canvas)
text(112,565,'PAIXÃO POR COLECIONAR',16,muted,True)

# Readable headline and commercial conditions supplied by the user.
text(510,139,'POKÉMON • ESTAMPAS ILUSTRADAS',23,gold,True)
text(505,204,'SUA JORNADA',69,white,True)
text(500,285,'POKÉMON',112,gold,True)
text(505,413,'COMEÇA AQUI.',67,white,True)

for rect in [(505,545,835,657),(853,545,1270,657)]:
    d.rounded_rectangle(box(rect),radius=14*S,fill='#202122',outline='#75613B',width=1*S)
# Credit-card pictogram.
d.rounded_rectangle(box((528,579,582,617)),radius=5*S,outline=gold,width=2*S)
line([(530,590),(580,590)],gold,4)
line([(538,607),(550,607)],gold,2)
text(601,561,'ATÉ 10X',35,gold,True)
text(602,608,'NO CARTÃO',23,white,True)
# Truck pictogram.
d.rectangle(box((878,580,920,609)),outline=gold,width=2*S)
line([(920,590),(934,590),(945,603),(945,612),(920,612)],gold,2)
for cx in (889,934): d.ellipse(box((cx-6,606,cx+6,618)),fill='#202122',outline=gold,width=2*S)
text(968,581,'FRETE GRÁTIS',35,gold,True)
text(505,681,'Consulte as regras no site',22,muted)

def product(filename, width, pos, angle):
    source=Image.open(BASE/filename).convert('RGBA')
    source=source.crop(source.getchannel('A').getbbox())
    height=round(width*source.height/source.width)
    source=source.resize((round(width*S),round(height*S)),Image.Resampling.LANCZOS)
    if angle: source=source.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    shadow=Image.new('RGBA',source.size,(0,0,0,0))
    shadow.putalpha(source.getchannel('A').point(lambda v: round(v*.55)))
    layer=Image.new('RGBA',canvas.size)
    layer.alpha_composite(shadow,(round((pos[0]+8)*S),round((pos[1]+20)*S)))
    layer=layer.filter(ImageFilter.GaussianBlur(13*S))
    canvas.alpha_composite(layer)
    canvas.alpha_composite(source,(round(pos[0]*S),round(pos[1]*S)))

# Actual downloaded product photographs; no fabricated card art or labels.
product('01-supertcg.webp',405,(1370,158),9)
product('03-supertcg.webp',464,(1820,121),-7)
product('02-supertcg.webp',400,(1630,332),0)

canvas.convert('RGB').save(ROOT/'banner-arcan-pokemon-4800x1600.png')
final=canvas.convert('RGB').resize((2400,800),Image.Resampling.LANCZOS)
final.save(ROOT/'banner-arcan-pokemon-2400x800.png')
final.save(ROOT/'banner-arcan-pokemon-2400x800.jpg',quality=96,subsampling=0)
final.resize((1500,500),Image.Resampling.LANCZOS).save(ROOT/'previa.jpg',quality=93)
for name in ('banner-arcan-pokemon-4800x1600.png','banner-arcan-pokemon-2400x800.png'):
    with Image.open(ROOT/name) as check: print(name,check.size)
(ROOT/'LEIA-ME.txt').write_text('Banner composto por edição convencional com Pillow, sem geração por IA.\nLogo fornecida pelo usuário; versão clara derivada da máscara do arquivo original, sem redesenhar o símbolo.\nFotografias dos produtos: https://supertcg.com.br/pokemon-30-anos/\nCondições comerciais fornecidas pelo usuário: até 10x no cartão, frete grátis, consulte as regras no site.\nArquivos PNG em 4800x1600 e 2400x800 e JPG em 2400x800.\n',encoding='utf-8')

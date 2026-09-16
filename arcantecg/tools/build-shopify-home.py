"""Build only the theme patch; preserve the original theme and local concept."""
from pathlib import Path
import json,re,shutil
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'shopify'/'baseline'
PATCH=ROOT/'shopify'/'patch'
for folder in ['assets','layout','sections','snippets','templates']:(PATCH/folder).mkdir(parents=True,exist_ok=True)
def read_json(p):return json.loads(re.sub(r'/\*[\s\S]*?\*/','',p.read_text(encoding='utf-8')))
def write(name,text):(PATCH/name).write_text(text,encoding='utf-8')

def scope_css(text):
    out=[];pos=0
    while pos<len(text):
        start=text.find('{',pos)
        if start<0:break
        head=text[pos:start].strip();level=1;end=start+1
        while level:
            if text[end]=='{':level+=1
            elif text[end]=='}':level-=1
            end+=1
        body=text[start+1:end-1]
        if head.startswith('@media'):
            out.append(head+'{'+scope_css(body)+'}')
        elif head.startswith('@'):
            out.append(head+'{'+body+'}')
        else:
            sels=[]
            for sel in head.split(','):
                sel=sel.strip()
                if sel in [':root','body']:sel='body.arcan-home'
                elif sel=='html':sel='html:has(body.arcan-home)'
                else:sel='.arcan-home '+sel
                sels.append(sel)
            out.append(','.join(sels)+'{'+body+'}')
        pos=end
    return '\n'.join(out)
css=(ROOT/'styles.css').read_text(encoding='utf-8')
css=re.sub(r'\.product(?![\w-])','.arcan-product',css)
write('assets/arcan-home.css',scope_css(css)+'''
/* Shopify integration: rules are scoped to this home only. */
.arcan-home slideshow-component .slideshow.banner--adapt_image::before{display:block!important}
@media(max-width:760px){.arcan-home .help-section>div{flex-basis:calc(100% - 55px)}.arcan-home .help-section>.button{width:100%}}
body.arcan-home{letter-spacing:normal;font-style:normal;font-weight:400;background:#fff;color:#252621}
.arcan-home h1,.arcan-home h2,.arcan-home h3{font-family:var(--body);font-style:normal;font-weight:700;color:var(--ink)}
.arcan-home .collection-copy h2{font-family:var(--display);color:#f8f7ef}.arcan-home .collection-display h3{color:#f8f7ef}
.arcan-home .button{min-width:0;box-shadow:none;letter-spacing:normal;line-height:1.6}.arcan-home .button::before,.arcan-home .button::after{display:none}
.arcan-home .site-header{background:#fff}.arcan-home .bag-button{margin:0}.arcan-home .brand{display:block}
.arcan-home .nav{gap:20px;flex-wrap:wrap}.arcan-home .nav>details{position:relative}.arcan-home .nav summary{cursor:pointer;min-height:48px;display:flex;align-items:center;gap:8px;list-style:none}.arcan-home .nav summary::after{content:'';width:6px;height:6px;border-right:1px solid;border-bottom:1px solid;transform:rotate(45deg)}
.arcan-home .nav summary::-webkit-details-marker{display:none}.arcan-home .nav ul{list-style:none;margin:0;padding:10px 18px;background:white}.arcan-home .nav>details>ul{position:absolute;top:100%;left:0;z-index:20;min-width:230px;max-height:65vh;overflow:auto;box-shadow:var(--shadow);border-radius:8px}.arcan-home .nav li a{min-height:40px;white-space:normal}.arcan-home .nav li summary{min-height:40px}.arcan-home .nav>details:last-child>ul{left:auto;right:0}
.arcan-home slideshow-component{width:min(1240px,calc(100% - 80px));margin:12px auto 0;border-radius:12px;overflow:hidden}.arcan-home slideshow-component .slideshow__controls{border:0;background:white}.arcan-home slideshow-component .slideshow__slide{border-radius:12px;overflow:hidden}.arcan-home slideshow-component .slideshow__media img{object-fit:contain}.arcan-home slideshow-component .slideshow__text-wrapper{display:none}
.arcan-home .arcan-product .product-picture>a{display:grid;place-items:center;width:100%;height:100%;padding:30px 20px 20px}.arcan-home .arcan-product .product-picture img{width:100%;object-fit:contain}.arcan-home .arcan-product h3 a{color:inherit}.arcan-home .arcan-product h3{font-weight:650}.arcan-home .price{color:var(--ink);line-height:1.3}.arcan-home .price small{font-size:11px}.arcan-home .compare-price{display:block;color:var(--muted);font-size:11px;line-height:1.5}.arcan-home .arcan-product .price-row{align-items:flex-end}.arcan-home .arcan-product form{margin:0}.arcan-home .arcan-product .add-button{min-width:44px;min-height:44px}
.arcan-home .filters a{display:inline-flex;align-items:center;justify-content:center;background:#fff;border:1px solid var(--line);border-radius:5px;min-height:44px;padding:8px 18px;font-size:12px;font-weight:650}.arcan-home .filters a[aria-current=true]{background:var(--dark);color:white;border-color:var(--dark)}
.arcan-home .collection-display>img{object-fit:contain}.arcan-home .collection-display .text-link{color:var(--lime)}.arcan-home .beginner-image img{object-fit:contain}.arcan-home .collection-section .button{color:var(--dark)}
.arcan-home .footer-main a{min-height:44px}.arcan-home .footer-bottom a{text-decoration:underline}.arcan-home .footer-bottom{flex-wrap:wrap}.arcan-home .footer-brand p{max-width:240px}.arcan-home .section-heading p{font-size:13px}.arcan-home .product-meta{font-size:11px}.arcan-home .arcan-product h3{font-size:14px;min-height:42px}.arcan-home .price-note{font-size:11px}.arcan-home .beginner-copy>p{font-size:14px}.arcan-home .beginner-options strong{font-size:14px}.arcan-home .beginner-options small{font-size:12px}.arcan-home .help-section p{font-size:13px}
@media(max-width:1050px){.arcan-home slideshow-component{width:calc(100% - 48px)}}
@media(max-width:760px){.arcan-home slideshow-component{width:calc(100% - 32px);margin-top:0}.arcan-home .nav{gap:0 24px}.arcan-home .nav>details{width:100%}.arcan-home .nav>details>ul{position:static;box-shadow:none;max-height:none;padding:0 15px}.arcan-home .bag-button{margin-left:auto}.arcan-home .arcan-product h3{font-size:13px}.arcan-home .filters a{padding:8px 12px;font-size:11px}.arcan-home .section-heading p{font-size:12px}.arcan-home .collection-display{gap:20px}.arcan-home .collection-display>img{max-width:45%}.arcan-home .beginner-options small{font-size:12px}.arcan-home .help-section .button{margin-left:0}}
''')
fonts=(ROOT/'assets/fonts.css').read_text(encoding='utf-8')
for p in (ROOT/'assets').glob('font-*.ttf'):
    shutil.copyfile(p,PATCH/'assets'/('arcan-'+p.name));fonts=fonts.replace(p.name,'arcan-'+p.name)
write('assets/arcan-fonts.css',fonts)
shutil.copyfile(ROOT/'logo.png',PATCH/'assets/arcan-logo.png')

layout=(BASE/'layout/theme.liquid').read_text(encoding='utf-8')
layout=layout.replace('</head>',"{% if request.page_type == 'index' %}\n{{ 'arcan-fonts.css' | asset_url | stylesheet_tag }}\n{{ 'arcan-home.css' | asset_url | stylesheet_tag }}\n<script src=\"{{ 'arcan-home.js' | asset_url }}\" defer></script>\n{% endif %}\n</head>")
layout=layout.replace('<body class="gradient','<body class="{% if request.page_type == \'index\' %}arcan-home {% endif %}gradient')
for group,part in [('header-group','header'),('footer-group','footer')]:
    layout=layout.replace("{% sections '"+group+"' %}","{% if request.page_type == 'index' %}{% render 'arcan-home-"+part+"' %}{% else %}{% sections '"+group+"' %}{% endif %}")
write('layout/theme.liquid',layout)

index=read_json(BASE/'templates/index.json')
hero=index['sections']['hero-slideshow']
hero['settings']['slide_height']='adapt_image'
hero['settings']['show_text_below']=False
hero['settings']['accessibility_info']='Destaques da Arcan TCG'
new={'sections':{'hero-slideshow':hero,'arcan-products':{'type':'arcan-home-products','settings':{'collection':'produtos-nacionais-e-importados','cards_collection':'full-arts','boosters_collection':'booster-box','kits_collection':'etb','title':'Os próximos favoritos da sua coleção.','caption':'Explore cartas, boosters e boxes para sua próxima descoberta.'}},'arcan-story':{'type':'arcan-home-story','settings':{'product':'vaporeon-ex-205-187-jp','collection':'full-arts'}},'arcan-discover':{'type':'arcan-home-products','settings':{'collection':'lancamentos','title':'Mais descobertas. Novas possibilidades.','caption':'Conheça os lançamentos da Arcan TCG.','show_filters':False}},'arcan-beginner':{'type':'arcan-home-beginner','settings':{'product':'box-colecao-escarlate-e-violeta-evolucoes-prismaticas-arco-iris'}}},'order':['hero-slideshow','arcan-products','arcan-story','arcan-discover','arcan-beginner']}
for key in index['order']:
    if key!='hero-slideshow' and index['sections'][key]['type']!='featured-collection':
        new['sections'][key]=index['sections'][key];new['order'].append(key)
new['sections']['arcan-products']['settings'].update({'collection':'box','cards_collection':'raras','boosters_collection':'blister-unitario','kits_collection':'etb'})
new['sections']['arcan-story']['settings'].update({'product':'vaporeon-022-131-evolucoes-prismaticas','collection':'raras'})
new['sections']['arcan-beginner']['settings']['product']='mini-bb-evolucoes-prismaticas-pt-br'
write('templates/index.json',json.dumps(new,ensure_ascii=False,indent=2)+'\n')

original=(ROOT/'index.html').read_text(encoding='utf-8')
icons=re.search(r'<svg class="icon-library"[\s\S]*?</svg>',original).group(0)
write('snippets/arcan-icons.liquid',icons.replace('id="','id="arcan-icon-'))
print('Built scoped CSS, fonts, layout patch and index. Both original banner image references retained.')

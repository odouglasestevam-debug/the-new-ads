"""Download public storefront assets for the local, unpublished design study."""
import json
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)

def get(url):
    response = requests.get(url, timeout=45)
    response.raise_for_status()
    return response

home = get('https://arcantcg.com.br/').text
(ASSETS / 'store-source.html').write_text(home, encoding='utf-8')
products = get('https://arcantcg.com.br/products.json?limit=250').json()['products']
terms = ['Glaceon ex', 'Jolteon ex', 'Umbreon ex', 'Vaporeon ex', 'Sylveon ex', 'Fogo Fantasmagórico', 'ETB Mega Evolução', 'Blister Unitário', 'ARCO-ÍRIS', 'Mega Charizard Y', 'MINI BB ESCURIDÃO', 'Mega Lucario ex']
selected = []
for term in terms:
    matches = [p for p in products if term.lower() in p['title'].lower() and p.get('images')]
    for p in matches[:1]:
        if p['id'] not in [x['id'] for x in selected]:
            selected.append(p)

def download(p):
    src = p['images'][0]['src']
    filename = str(p['id']) + Path(src.split('?')[0]).suffix
    (ASSETS / filename).write_bytes(get(src).content)
    v = p['variants'][0]
    return dict(id=p['id'], title=p['title'], image='assets/' + filename,
                price=v['price'], compare_at_price=v.get('compare_at_price'),
                available=v['available'], url='https://arcantcg.com.br/products/' + p['handle'], source_image=src)

with ThreadPoolExecutor(max_workers=5) as pool:
    catalog = list(pool.map(download, selected))
(ASSETS / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
(ASSETS / 'catalog.js').write_text('window.ARCAN_CATALOG = ' + json.dumps(catalog, ensure_ascii=False) + ';', encoding='utf-8')
print(json.dumps(catalog, ensure_ascii=True, indent=2))

font_css = get('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap').text
for i, url in enumerate(dict.fromkeys(re.findall(r'url\((https[^)]+)\)', font_css))):
    filename = f'font-{i}' + Path(url).suffix
    (ASSETS / filename).write_bytes(get(url).content)
    font_css = font_css.replace(url, filename)
(ASSETS / 'fonts.css').write_text(font_css, encoding='utf-8')
print('Downloaded product images and self-hosted fonts.')

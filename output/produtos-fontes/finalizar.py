import csv
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

ROOT = Path(__file__).absolute().parent
OUT = ROOT / 'entrega'
for folder in ('originais-baixados', 'png-fundo-branco-original', '1600-png', '1600-jpg'):
    (OUT / folder).mkdir(parents=True, exist_ok=True)

items = [
    ('01-blister-eevee-ptbr', '01-supertcg.webp', 'PT-BR', 'https://supertcg.com.br/pokemon-30-anos/'),
    ('02-blister-lucario-ptbr', '02-supertcg.webp', 'PT-BR', 'https://supertcg.com.br/pokemon-30-anos/'),
    ('03-colecao-poster-ptbr', '03-supertcg.webp', 'PT-BR', 'https://supertcg.com.br/pokemon-30-anos/'),
    ('04-binder-collection-en', '04-binder.jpg', 'Inglês', 'https://www.tcgradar.es/aniversario'),
    ('05-display-30th-jp', '05-display.jpg', 'Japonês', 'https://boosterbox.ch/products/pokemon-30th-celebration-display-jp'),
    ('06-premium-espeon-umbreon-jp', '06-thumb.webp', 'Japonês', 'https://www.30th.pokemon-card.com/product/mf?slide=modal'),
]
downloads = {Path(r['file']).name: r for r in json.loads((ROOT / 'busca2.results.json').read_text(encoding='utf-8')) if r['status'] == 'ok'}
rows = []
preview = Image.new('RGB', (1200, 870), 'white')
draw = ImageDraw.Draw(preview)
for index, (name, filename, language, page) in enumerate(items):
    source = ROOT / 'candidatas' / filename
    with Image.open(source) as decoded:
        source_format = decoded.format
        ext = {'AVIF': '.avif', 'WEBP': '.webp', 'JPEG': '.jpg', 'PNG': '.png'}[source_format]
        original_copy = OUT / 'originais-baixados' / (name + ext)
        shutil.copyfile(source, original_copy)
        assert hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(original_copy.read_bytes()).digest()
        rgba = decoded.convert('RGBA')
        white = Image.new('RGBA', rgba.size, 'white')
        white.alpha_composite(rgba)
        flat = white.convert('RGB')
        flat.save(OUT / 'png-fundo-branco-original' / (name + '.png'))
        # Ignore near-white compression noise only when choosing outer bounds.
        # No pixels inside the product photograph are retouched or regenerated.
        difference = ImageChops.difference(flat, Image.new('RGB', flat.size, 'white'))
        channels = difference.split()
        max_channel = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
        bbox = max_channel.point(lambda value: 255 if value > 18 else 0).getbbox()
        pad = 5
        bbox = (max(0, bbox[0]-pad), max(0, bbox[1]-pad), min(flat.width, bbox[2]+pad), min(flat.height, bbox[3]+pad))
        product = flat.crop(bbox)
        scale = min(1440/product.width, 1440/product.height)
        resized = product.resize((round(product.width*scale), round(product.height*scale)), Image.Resampling.LANCZOS)
        final = Image.new('RGB', (1600, 1600), 'white')
        final.paste(resized, ((1600-resized.width)//2, (1600-resized.height)//2))
        png = OUT / '1600-png' / (name + '.png')
        final.save(png)
        final.save(OUT / '1600-jpg' / (name + '.jpg'), quality=95, subsampling=0)
        with Image.open(png) as check:
            assert check.size == (1600, 1600)
            assert all(check.getpixel(p) == (255,255,255) for p in ((0,0),(1599,0),(0,1599),(1599,1599)))
        x, y = (index % 3)*400, (index//3)*435
        preview.paste(final.resize((400,400), Image.Resampling.LANCZOS), (x,y))
        draw.text((x+12,y+404), f'{index+1:02} | {language} | fonte: {flat.width} x {flat.height}', fill='black')
        rows.append({'arquivo': name, 'idioma': language, 'largura_original': flat.width, 'altura_original': flat.height, 'formato_original': source_format, 'recorte': list(bbox), 'escala_para_1600': round(scale,4), 'pagina_fonte': page, 'url_imagem': downloads[filename]['url']})

preview.save(OUT / 'previa.jpg', quality=93)
(OUT / 'fontes.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
with (OUT / 'fontes.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
lines = [
    '# Imagens dos seis produtos — fontes encontradas', '',
    'Arquivos baixados de páginas públicas, sem geração ou reconstrução por IA.',
    'As fotos correspondem aos mesmos produtos e idiomas identificados nas referências; podem ter diferenças de enquadramento, recorte e apresentação gráfica em relação às miniaturas do WhatsApp.', '',
    '- originais-baixados: bytes originais dos downloads, com extensão correspondente ao formato real.',
    '- png-fundo-branco-original: imagens decodificadas no tamanho original; transparência composta sobre branco.',
    '- 1600-png e 1600-jpg: produtos centralizados, com proporção preservada, em fundo branco de 1600 × 1600.',
    '- previa.jpg: visão geral das seis imagens.', '',
    'O tamanho de um arquivo não garante que o fornecedor não o tenha ampliado anteriormente. Não foi aplicada nitidez artificial nem redesenho de letras, cartas, embalagens ou logotipos.',
    'As imagens 3, 5 e 6 exigem ampliação para o enquadramento final. A imagem 6 tem 1760 pixels de largura no arquivo, mas boa parte é margem branca; a caixa ocupa uma área menor. Os arquivos de origem estão incluídos para preservar a melhor informação disponível.', '',
    '| Produto | Idioma | Resolução baixada | Fonte |', '|---|---|---|---|',
]
for row in rows:
    lines.append(f"| {row['arquivo']} | {row['idioma']} | {row['largura_original']} × {row['altura_original']} | [Página]({row['pagina_fonte']}) · [Imagem]({row['url_imagem']}) |")
(OUT / 'LEIA-ME.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
archive_path = ROOT / 'produtos-pokemon-fontes-e-1600.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(OUT.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(OUT))
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    assert len([x for x in archive.namelist() if x.startswith('1600-png/')]) == 6
print(json.dumps({'archive': str(archive_path), 'bytes': archive_path.stat().st_size, 'images': rows}, ensure_ascii=True))

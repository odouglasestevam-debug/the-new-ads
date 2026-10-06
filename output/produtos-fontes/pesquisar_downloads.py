import concurrent.futures
import io
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests
from PIL import Image

ROOT = Path(__file__).absolute().parent

def fetch(task):
    relative = Path(task['file'])
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Destination outside task directory')
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        response = requests.get(task['url'], timeout=35, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,image/png,image/jpeg,image/webp,*/*'})
        response.raise_for_status()
        target.write_bytes(response.content)
        result = dict(task, bytes=len(response.content), status='ok')
        if task.get('kind') == 'html':
            content = response.text
            candidates = set()
            for match in re.finditer(r'''(?:src|href|content|data-src|data-large_image|data-zoom-image)=["']([^"']+)["']''', content, re.I):
                value = match.group(1).replace('&amp;', '&')
                if re.search(r'\.(?:png|jpe?g|webp)(?:\?|$)', value, re.I):
                    candidates.add(urljoin(response.url, value))
            for value in re.findall(r'https?[^\s<>"\']+?\.(?:jpg|png|webp)', content):
                candidates.add(value.replace('\\/', '/'))
            result['images'] = sorted(candidates)
        else:
            with Image.open(io.BytesIO(response.content)) as image:
                result.update(width=image.width, height=image.height, format=image.format)
        return result
    except Exception as error:
        return dict(task, status='error', error=str(error))

if __name__ == '__main__':
    manifest = Path(sys.argv[1])
    tasks = json.loads(manifest.read_text(encoding='utf-8-sig'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fetch, tasks))
    result_path = manifest.with_suffix('.results.json')
    result_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    for result in results:
        print(json.dumps(result, ensure_ascii=True))

"""Build a reviewable GTM WEB reference without changing source exports."""
import copy
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/odoug/Downloads')
mine = json.loads((SOURCE / 'meu.json').read_text(encoding='utf-8-sig'))
arcan = json.loads((SOURCE / 'arcan.json').read_text(encoding='utf-8-sig'))
result = copy.deepcopy(mine)
original = mine['containerVersion']
container = result['containerVersion']
reference = next(t for t in arcan['containerVersion']['customTemplate'] if t['name'] == 'Meta Pixel')
changes = []

folder_names = {
    '4': '00 | Ferramentas',
    '5': '01 | GA4',
    '22': '02 | Meta Ads',
    '25': '03 | API',
    '50': '04 | Cookies',
}

def rename(kind, entity, new_name):
    changes.append({'tipo': kind, 'id': entity[kind + 'Id'], 'nome_anterior': entity['name'], 'nome_novo': new_name})
    entity['name'] = new_name

for folder in container['folder']:
    rename('folder', folder, folder_names[folder['folderId']])

# Keep the original gallery model, and add the reference as an independent
# local model. This permits changing one tag without replacing a shared model.
ids = [int(x[k + 'Id']) for k in ('tag', 'trigger', 'variable', 'folder') for x in container[k]]
ids += [int(t['templateId']) for t in container['customTemplate']]
local_id = str(max(ids) + 1)
local_type = 'cvt_' + container['containerId'] + '_' + local_id
local_name = 'Meta Pixel | Referencia Arcan 2.0.3'
template_data = reference['templateData']
start = template_data.index('___INFO___') + len('___INFO___')
end = template_data.index('___', start)
info = json.loads(template_data[start:end])
info['displayName'] = local_name
info['id'] = local_type
template_data = template_data[:start] + '\n\n' + json.dumps(info, ensure_ascii=False, indent=2) + '\n\n' + template_data[end:]
local_template = {
    'accountId': container['accountId'],
    'containerId': container['containerId'],
    'templateId': local_id,
    'name': local_name,
    'templateData': template_data,
}
container['customTemplate'].append(local_template)

utility_names = {
    '94': ('[Cookies] 00 | Dados do lead', '50'),
    '98': ('[GA4] 00 | Configuracao', '4'),
    '102': ('[Ferramentas] 00 | Persistencia de UTM', '4'),
    '124': ('[Ferramentas] 00 | Visitor API', '4'),
    '130': ('[Cookies] 00 | Geolocalizacao', '50'),
}
for tag in container['tag']:
    if tag['tagId'] in utility_names:
        name, folder = utility_names[tag['tagId']]
    else:
        sequence, channel, event = tag['name'].split(' | ', 2)
        name = '[' + {'FB': 'Meta Ads', 'GA4': 'GA4', 'API': 'API'}[channel] + '] ' + sequence + ' | ' + event
        folder = {'FB': '22', 'GA4': '5', 'API': '25'}[channel]
    rename('tag', tag, name)
    tag['parentFolderId'] = folder
    if tag['type'] == 'cvt_5RM3Q':
        tag['type'] = local_type

for trigger in container['trigger']:
    sequence, kind, detail = trigger['name'].split(' | ', 2)
    detail = detail.replace('All Pages + Cookie not exists', 'Todas as paginas | Cookie ausente').replace('All Pages', 'Todas as paginas')
    rename('trigger', trigger, '[' + {'CE': 'Evento', 'PV': 'Pagina'}[kind] + '] ' + sequence + ' | ' + detail)

result['exportTime'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

# Structural/invariance checks: no business logic, destinations, variables,
# conditions or firing frequencies are changed by this transformation.
for kind in ('tag', 'trigger', 'variable', 'folder'):
    assert len(container[kind]) == len(original[kind])
    assert len({e['name'] for e in container[kind]}) == len(container[kind])
    for before, after in zip(original[kind], container[kind]):
        expected = copy.deepcopy(after)
        expected['name'] = before['name']
        if kind == 'tag':
            expected['type'] = before['type']
            if 'parentFolderId' in before:
                expected['parentFolderId'] = before['parentFolderId']
            else:
                expected.pop('parentFolderId', None)
        assert expected == before, (kind, before['name'])
assert container['variable'] == original['variable']
assert container['customTemplate'][:-1] == original['customTemplate']

def section(text, name):
    return text.split('___' + name + '___', 1)[1].split('___', 1)[0]

for name in ('SANDBOXED_JS_FOR_WEB_TEMPLATE', 'WEB_PERMISSIONS', 'TEMPLATE_PARAMETERS'):
    assert section(template_data, name) == section(reference['templateData'], name), name

def refs(value):
    if isinstance(value, str):
        return set(re.findall(r'\{\{([^{}]+)\}\}', value))
    if isinstance(value, list):
        return set().union(*(refs(x) for x in value))
    if isinstance(value, dict):
        return set().union(*(refs(x) for x in value.values()))
    return set()

for kind in ('tag', 'trigger', 'variable'):
    assert refs(container[kind]) == refs(original[kind]), kind
trigger_ids = {t['triggerId'] for t in container['trigger']}
folder_ids = {f['folderId'] for f in container['folder']}
for tag in container['tag']:
    assert tag['parentFolderId'] in folder_ids
    for trigger_id in tag.get('firingTriggerId', []) + tag.get('blockingTriggerId', []):
        assert trigger_id in trigger_ids or int(trigger_id) >= 2147470000
types = set()
for template in container['customTemplate']:
    types.add('cvt_' + container['containerId'] + '_' + template['templateId'])
    gallery_id = template.get('galleryReference', {}).get('galleryTemplateId')
    if gallery_id:
        types.add('cvt_' + gallery_id)
for kind in ('tag', 'variable'):
    for entity in container[kind]:
        assert not entity['type'].startswith('cvt_') or entity['type'] in types, entity['name']

ROOT.mkdir(exist_ok=True)
output = ROOT / 'GTM-WEB-Arcan-com-eventos-Meu.json'
output.write_text(json.dumps(result, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
assert json.loads(output.read_text(encoding='utf-8')) == result
(ROOT / 'Meta-Pixel-Arcan-2.0.3.tpl').write_text(template_data, encoding='utf-8')
with (ROOT / 'mapa-de-nomes.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=['tipo', 'id', 'nome_anterior', 'nome_novo'], delimiter=';')
    writer.writeheader()
    writer.writerows(changes)
validation = {
    'validacao': 'OK - verificacao estatica; importacao no GTM e envio real nao executados',
    'quantidades': {k: len(container[k]) for k in ('tag', 'variable', 'trigger', 'folder', 'customTemplate')},
    'tags_meta_com_modelo_arcan': sum(t['type'] == local_type for t in container['tag']),
    'variaveis_parametros_condicoes_ids_e_referencias_preservados': True,
    'codigo_permissoes_e_campos_do_modelo_identicos_a_arcan': True,
    'fontes_sha256': {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in ('meu.json', 'arcan.json')},
    'saida_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
}
(ROOT / 'validacao.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(validation, ensure_ascii=False, indent=2))

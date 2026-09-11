"""Create a Stape variant while preserving each tag's explicit user data."""
import copy
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
source = ROOT / 'GTM-Arcan-adaptado-Thenewads.json'
source_bytes = source.read_bytes()
original = json.loads(source_bytes)
result = copy.deepcopy(original)
c = result['containerVersion']
template = next(t for t in c['customTemplate'] if t['name'] == 'Facebook Pixel by Stape')
stape_type = 'cvt_' + template['galleryReference']['galleryTemplateId']
schema = json.loads(template['templateData'].split('___TEMPLATE_PARAMETERS___')[1].split('___SANDBOXED_JS_FOR_WEB_TEMPLATE___')[0])

def fields(value):
    found = set()
    if isinstance(value, dict):
        if 'name' in value:
            found.add(value['name'])
        for child in value.values():
            found |= fields(child)
    elif isinstance(value, list):
        for child in value:
            found |= fields(child)
    return found

allowed = fields(schema)
def param(key, value, kind='BOOLEAN'):
    return {'type': kind, 'key': key, 'value': value}

changed = []
rows = []
for before, tag in zip(original['containerVersion']['tag'], c['tag']):
    if tag['type'] != 'cvt_5RM3Q':
        assert before == tag
        continue
    p = {v['key']: v for v in before['parameter']}
    assert p.get('enhancedEcommerce', {}).get('value', 'false') == 'false'
    assert p.get('useGA4Ecommerce', {}).get('value', 'false') == 'false'
    assert p['eventName']['value'] in ('standard', 'custom')
    event_kind = p['eventName']['value']
    event_key = 'customEventName' if event_kind == 'custom' else 'standardEventName'
    event = p[event_key]['value']
    new_params = []
    for old_key, new_key in [('pixelId', 'pixelIds'), ('eventId', 'eventId'),
                             ('advancedMatching', 'enableEdvancedMatching'),
                             ('consent', 'consent'), ('disablePushState', 'disablePushState'),
                             ('disableAutoConfig', 'disableAutoConfig'), ('dpoLDU', 'dpoLDU'),
                             ('dpoCountry', 'dpoCountry'), ('dpoState', 'dpoState'),
                             ('objectPropertiesFromVariable', 'objectPropertiesFromVariable'),
                             ('objectPropertyList', 'objectPropertiesList')]:
        if old_key in p:
            item = copy.deepcopy(p[old_key])
            item['key'] = new_key
            new_params.append(item)
    new_params += [
        param('inheritEventName', 'override', 'TEMPLATE'),
        param('eventName', event_kind, 'TEMPLATE'),
        param('eventNameCustom' if event_kind == 'custom' else 'eventNameStandard', event, 'TEMPLATE'),
        param('enableDataLayerMapping', 'false'),
        param('enableCurrentDataLayerOnly', 'false'),
        param('enableEventEnhancement', 'false'),
        param('storeUserDataHashed', 'false'),
        param('runInitOnce', 'false'),
        param('enableConsentMode', 'false'),
        param('userDataFromVariable', 'false'),
        param('dataLayerEventPush', 'false'),
        param('enableParamBuilderSdk', 'true'),
    ]
    matching = copy.deepcopy(p['advancedMatchingList'])
    matching['key'] = 'userDataList'
    for old_row, row in zip(p['advancedMatchingList']['list'], matching['list']):
        props = {v['key']: v for v in row['map']}
        old_props = {v['key']: v for v in old_row['map']}
        old_name = props['name']['value']
        if old_name == 'cn':
            props['name']['value'] = 'country'
        assert props['value'] == old_props['value']
        assert props['name']['value'] in ('em', 'ph', 'fn', 'ln', 'ct', 'st', 'country', 'external_id', 'ge', 'db', 'zp')
        rows.append([tag['name'], event, old_name, props['name']['value'], props['value']['value']])
    new_params.append(matching)
    assert len({v['key'] for v in new_params}) == len(new_params)
    assert {v['key'] for v in new_params} <= allowed
    tag['type'] = stape_type
    tag['parameter'] = new_params
    assert {k: v for k, v in before.items() if k not in ('type', 'parameter')} == {k: v for k, v in tag.items() if k not in ('type', 'parameter')}
    changed.append(tag['name'])

assert len(changed) == 7
for key in c:
    if key != 'tag':
        assert c[key] == original['containerVersion'][key], key
result['exportTime'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
target = ROOT / 'GTM-Arcan-adaptado-Thenewads-STAPE.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
assert json.loads(target.read_text(encoding='utf-8')) == result
assert source.read_bytes() == source_bytes
with (ROOT / 'stape-advanced-matching.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.writer(file, delimiter=';')
    writer.writerow(['tag', 'evento', 'campo_anterior', 'campo_stape', 'variavel_preservada'])
    writer.writerows(rows)
validation = {
    'status': 'OK - validacao estatica; importacao e envio real nao executados',
    'modelo': template['name'], 'versao_galeria': template['galleryReference']['version'],
    'tags_convertidas': changed, 'campos_user_data_preservados': len(rows),
    'ajuste_de_chave': 'cn -> country',
    'demais_tags_variaveis_acionadores_pastas_e_modelos_inalterados': True,
    'arquivo_original_preservado': True,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
}
(ROOT / 'validacao-stape.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(validation, ensure_ascii=False, indent=2))

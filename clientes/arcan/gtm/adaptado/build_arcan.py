"""Adapt the Arcan export in place: additions and project substitutions only."""
import copy
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent
SRC = Path('C:/Users/odoug/Downloads')
base = json.loads((SRC / 'arcan.json').read_text(encoding='utf-8-sig'))
mine = json.loads((SRC / 'meu.json').read_text(encoding='utf-8-sig'))['containerVersion']
result = copy.deepcopy(base)
c = result['containerVersion']
original = base['containerVersion']
changes = []
next_id = max(int(x[k + 'Id']) for k in ('tag', 'variable', 'folder', 'trigger') for x in c[k]) + 1

def new_id():
    global next_id
    value = str(next_id)
    next_id += 1
    return value

def by_name(kind, name, source=c):
    return next(x for x in source[kind] if x['name'] == name)

def by_id(kind, value):
    return next(x for x in c[kind] if x[kind + 'Id'] == value)

def params(entity):
    return {x['key']: x for x in entity.get('parameter', [])}

def set_param(entity, key, value, type='TEMPLATE'):
    p = params(entity)
    item = {'type': type, 'key': key, 'value': value}
    if key in p:
        entity['parameter'][entity['parameter'].index(p[key])] = item
    else:
        entity.setdefault('parameter', []).append(item)

mapping = {
    '0 | FB - Pixel': 'id-meta ads',
    '0 | GA4 - ID': 'id-ga4',
    '0 | Visitor API Project ID': 'Id-Visitor-api',
    '0 | transport_url': 'api-transport_url',
    'event_id': 'api-event_id',
    'cookie - LeadCity': 'Cookie LeadCity',
    'cookie - LeadCountry': 'Cookie LeadCountry',
    'cookie - LeadState': 'Cookie LeadState',
}

def translate(value):
    if isinstance(value, str):
        return re.sub(r'\{\{([^{}]+)\}\}', lambda m: '{{' + mapping.get(m[1], m[1]) + '}}', value)
    if isinstance(value, list):
        return [translate(x) for x in value]
    if isinstance(value, dict):
        return {k: translate(v) for k, v in value.items()}
    return value

def add(kind, source, name=None):
    entity = copy.deepcopy(source)
    entity[kind + 'Id'] = new_id()
    entity['accountId'] = c['accountId']
    entity['containerId'] = c['containerId']
    entity.pop('fingerprint', None)
    entity.pop('path', None)
    if name:
        entity['name'] = name
    c[kind].append(entity)
    return entity

# Substitute project variables in the existing Arcan slots. Keep its event-ID
# generator, UTM mechanism and input/cookie fallback variable architecture.
for source in mine['variable']:
    name = mapping.get(source['name'], source['name'])
    existing = next((v for v in c['variable'] if v['name'] == name), None)
    if existing:
        if source['name'] == 'event_id' or source['name'].startswith('utm_'):
            continue
        existing['type'] = source['type']
        if 'parameter' in source:
            existing['parameter'] = translate(copy.deepcopy(source['parameter']))
        if 'formatValue' in source:
            existing['formatValue'] = copy.deepcopy(source['formatValue'])
        changes.append(['variavel', name, 'Definicao/valor substituido pelo correspondente de meu.json'])
    else:
        entity = translate(add('variable', source, name))
        entity.pop('parentFolderId', None)
        c['variable'][-1] = entity
        changes.append(['variavel', name, 'Incluida de meu.json'])

# Both Arcan Meta ID slots must identify this project, including the legacy
# slot named "locacao". Names and dependencies remain unchanged.
pixel = params(by_name('variable', 'id-meta ads'))['value']['value']
set_param(by_name('variable', 'id-meta ads locação'), 'value', pixel)
fullname = by_name('variable', 'user-input-fullname')
fullname['parameter'] = translate(fullname['parameter'])
for p in fullname['parameter']:
    if p['key'] == 'javascript':
        p['value'] = p['value'].replace('inputNome', 'nome')
changes.append(['variavel', 'user-input-fullname', 'Seletor inputNome substituido por nome'])

# Use the original Arcan utilities in their existing positions and triggers.
# Replace just the project HTML with the supplied project's HTML and domains.
for arcan_id, my_name in [('70', '00 | setCookie DataUsers'), ('82', '00 | setCookie GeoLoc')]:
    target = by_id('tag', arcan_id)
    source = by_name('tag', my_name, mine)
    target['parameter'] = translate(copy.deepcopy(source['parameter']))
    for p in target['parameter']:
        if p['key'] == 'html':
            p['value'] = p['value'].replace('domain=.111.com.br', 'domain=.thenewads.com.br')
    changes.append(['html', target['name'], 'HTML de meu.json; cookies no dominio .thenewads.com.br'])

# Existing lead trigger is adapted to the target site's exact dataLayer name.
lead_trigger = by_id('trigger', '44')
for condition in lead_trigger['customEventFilter']:
    for p in condition['parameter']:
        if p['key'] == 'arg1':
            p['value'] = 'Lead'
changes.append(['acionador', lead_trigger['name'], 'Evento lead substituido por Lead (maiusculo), como no site de destino'])

# Clone Arcan's existing tags for missing funnel events. Existing PageView,
# Lead, initialization, Visitor API and UTM trigger structure stays in place.
events = [
    ('3', 'IniciouFormulario', 'ViewContent', 'form_start', '02 | API | form_start', '02 | FB | ViewContent'),
    ('4', 'CompletouFormulario', 'CompleteRegistration', 'form_submit', '04 | API | form_submit', '04 | FB | CompleteRegistration'),
    ('5', 'scheduler_view', 'SchedulerView', 'scheduler_view', '05 | API | scheduler_view', '05 | FB | SchedulerView'),
    ('6', 'scheduler_slot_selected', 'SlotSelected', 'slot_selected', '06 | API | slot_selected', '06 | FB | SlotSelected'),
    ('7', 'Schedule', 'Schedule', 'schedule', '07 | API | schedule', '07 | FB | Schedule'),
]
api_proto = copy.deepcopy(by_id('tag', '64'))
meta_proto = copy.deepcopy(by_id('tag', '67'))
ga_proto = copy.deepcopy(by_id('tag', '45'))
event_rows = [
    ['PageView', 'Inicializacao (Arcan)', 'page_view (automatico da tag Google)', 'PageView', 'PageView'],
    ['Lead', 'Lead', 'generate_lead', 'Lead', 'Lead'],
]
for seq, dl_event, meta_event, ga_event, api_name, fb_name in events:
    source_trigger = next(t for t in mine['trigger'] if any(p.get('value') == dl_event for f in t.get('customEventFilter', []) for p in f.get('parameter', []) if p['key'] == 'arg1'))
    trigger = add('trigger', source_trigger, 'Evento ' + dl_event)
    trigger.pop('parentFolderId', None)
    for channel, prototype in [('Meta Ads', meta_proto), ('API', api_proto), ('GA4', ga_proto)]:
        name_event = ga_event if channel == 'GA4' else meta_event
        tag = add('tag', prototype, '[' + channel + '] ' + seq + ' | ' + name_event)
        tag['firingTriggerId'] = [trigger['triggerId']]
        if channel == 'Meta Ads':
            is_custom = meta_event in ('SchedulerView', 'SlotSelected')
            set_param(tag, 'eventName', 'custom' if is_custom else 'standard')
            set_param(tag, 'standardEventName', meta_event if not is_custom else 'Lead')
            if is_custom:
                set_param(tag, 'customEventName', meta_event)
            source_matching = params(by_name('tag', fb_name, mine))['advancedMatchingList']
            tag['parameter'][tag['parameter'].index(params(tag)['advancedMatchingList'])] = translate(copy.deepcopy(source_matching))
        elif channel == 'API':
            set_param(tag, 'eventName', meta_event)
            # Preserve the API tag architecture while adapting its user-data
            # sources to each stage (inputs vs. stored cookies) from meu.json.
            source_settings = params(by_name('tag', api_name, mine))['eventSettingsTable']
            tag['parameter'][tag['parameter'].index(params(tag)['eventSettingsTable'])] = translate(copy.deepcopy(source_settings))
        else:
            set_param(tag, 'eventName', ga_event)
        changes.append(['tag', tag['name'], 'Criada por copia da tag ' + prototype['name'] + '; acionador ' + dl_event])
    event_rows.append([meta_event, dl_event, ga_event, meta_event, meta_event])

# Keep unrelated original entities, but do not send events or leads to the
# other project's Google Ads accounts or webhook when the copy is tested.
paused = []
for tag in c['tag']:
    if tag['type'] in ('awct', 'gclidw', 'sp') or tag['name'] == 'webhook' or tag['name'] == 'Tag do Google AW-18043780459':
        tag['paused'] = True
        paused.append(tag['name'])
        changes.append(['tag', tag['name'], 'Preservada e pausada: integracao sem equivalente em meu.json'])

result['exportTime'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

def refs(value):
    if isinstance(value, str):
        return set(re.findall(r'\{\{([^{}]+)\}\}', value))
    if isinstance(value, (list, dict)):
        values = value.values() if isinstance(value, dict) else value
        return set().union(*(refs(x) for x in values))
    return set()

# Verify that the base really is Arcan, rather than the previous adaptation.
assert c['folder'] == original['folder']
assert c['customTemplate'] == original['customTemplate']
assert c['builtInVariable'] == original['builtInVariable']
for kind in ('tag', 'variable', 'trigger'):
    old_ids = {e[kind + 'Id'] for e in original[kind]}
    assert old_ids <= {e[kind + 'Id'] for e in c[kind]}
    assert len({e[kind + 'Id'] for e in c[kind]}) == len(c[kind])
    assert len({e['name'] for e in c[kind]}) == len(c[kind])
    for before in original[kind]:
        after = by_id(kind, before[kind + 'Id'])
        assert after['name'] == before['name']
        assert after.get('parentFolderId') == before.get('parentFolderId')
        if kind == 'tag':
            assert after['type'] == before['type']
            assert after.get('firingTriggerId') == before.get('firingTriggerId')
            assert after.get('tagFiringOption') == before.get('tagFiringOption')
assert by_name('variable', 'api-event_id') == by_name('variable', 'api-event_id', original)
assert by_id('tag', '40') == by_name('tag', '[GA4] 1 | PageView', original)
assert by_id('tag', '79') == by_name('tag', 'Utm Persist', original)
for source in mine['variable']:
    assert mapping.get(source['name'], source['name']) in {v['name'] for v in c['variable']}
names = {v['name'] for v in c['variable']} | {v['name'] for v in c['builtInVariable']} | {'_event'}
unresolved = set().union(*(refs(c[k]) for k in ('tag', 'variable', 'trigger'))) - names
assert not unresolved, unresolved
trigger_ids = {t['triggerId'] for t in c['trigger']}
for tag in c['tag']:
    for tid in tag.get('firingTriggerId', []) + tag.get('blockingTriggerId', []):
        assert tid in trigger_ids or int(tid) >= 2147470000
for event in event_rows:
    meta_event = event[0]
    meta_tags = [t for t in c['tag'] if t['type'] == 'cvt_5RM3Q' and (params(t).get('customEventName', {}).get('value') or params(t).get('standardEventName', {}).get('value')) == meta_event]
    api_tags = [t for t in c['tag'] if t['name'].startswith('[API]') and params(t)['eventName']['value'] == meta_event]
    assert len(meta_tags) == len(api_tags) == 1, meta_event
    assert meta_tags[0]['firingTriggerId'] == api_tags[0]['firingTriggerId']
    assert params(meta_tags[0])['eventId']['value'] == '{{api-event_id}}'
    assert '{{api-event_id}}' in json.dumps(params(api_tags[0])['eventSettingsTable'])

# Presentation-only organization, requested after the Arcan adaptation.
# Snapshot first so every field except display name/folder can be verified.
before_organization = copy.deepcopy(c)
folder_names = {
    '38': '🆔 Identificacao', '37': '🟧 GA4', '8': '🧠 API',
    '9': '👤 User', '5': '🍪 Cookies',
    '35': '🔨 Tools', '47': '🎯 Google Ads',
}
name_map = []
def display_name(kind, entity, name):
    name_map.append([kind, entity[kind + 'Id'], entity['name'], name])
    entity['name'] = name

for folder in c['folder']:
    display_name('folder', folder, folder_names[folder['folderId']])
meta_folder = add('folder', {'name': '🟦 FB'})['folderId']
trigger_folder = add('folder', {'name': '⚡ Acionadores'})['folderId']
sequence = {'PageView': '01', 'page_view': '01', 'ViewContent': '02', 'form_start': '02',
            'Lead': '03', 'generate_lead': '03', 'CompleteRegistration': '04', 'form_submit': '04',
            'SchedulerView': '05', 'scheduler_view': '05', 'SlotSelected': '06', 'slot_selected': '06',
            'Schedule': '07', 'schedule': '07'}
utility = {
    '13': ('00 | Visitor API', '35'),
    '40': ('00 | Tag de Configuracao', '37'),
    '50': ('03 | Google Ads | Lead', '47'),
    '51': ('00 | Google Ads | Vinculador de conversoes', '47'),
    '58': ('01 | Google Ads | PageView', '47'),
    '69': ('00 | Webhook', '35'),
    '70': ('00 | setCookie DataUsers', '5'),
    '79': ('00 | UTM Persist', '35'),
    '80': ('00 | Google Ads | Configuracao', '47'),
    '82': ('00 | setCookie GeoLoc', '5'),
}
api_display = {'PageView': 'page_view', 'ViewContent': 'form_start', 'Lead': 'generate_lead',
               'CompleteRegistration': 'form_submit', 'SchedulerView': 'scheduler_view',
               'SlotSelected': 'slot_selected', 'Schedule': 'schedule'}
for tag in c['tag']:
    if tag['tagId'] in utility:
        name, folder = utility[tag['tagId']]
    else:
        p = params(tag)
        if tag['type'] == 'cvt_5RM3Q':
            channel, folder = 'FB', meta_folder
            event = p.get('customEventName', p.get('standardEventName'))['value']
        else:
            channel = 'API' if tag['name'].startswith('[API]') else 'GA4'
            folder = '8' if channel == 'API' else '37'
            event = p['eventName']['value']
        display_event = api_display[event] if channel == 'API' else event
        name = sequence[event] + ' | ' + channel + ' | ' + display_event
    display_name('tag', tag, name)
    tag['parentFolderId'] = folder
dl_sequence = {'IniciouFormulario': '02', 'Lead': '03', 'CompletouFormulario': '04',
               'scheduler_view': '05', 'scheduler_slot_selected': '06', 'Schedule': '07',
               'visitor-api-success': '00'}
for trigger in c['trigger']:
    event = next((p.get('value') for f in trigger.get('customEventFilter', []) for p in f.get('parameter', []) if p['key'] == 'arg1'), None)
    if event in dl_sequence:
        name = dl_sequence[event] + ' | CE | ' + event
    elif trigger['triggerId'] == '4':
        name = '00 | PV | All Pages + Cookie not exists'
    else:
        kind_code = {'CUSTOM_EVENT': 'CE', 'FORM_SUBMISSION': 'FS', 'CLICK': 'CL',
                     'LINK_CLICK': 'JL', 'YOU_TUBE_VIDEO': 'YT', 'SCROLL_DEPTH': 'SC'}[trigger['type']]
        name = '00 | ' + kind_code + ' | ' + trigger['name'] + ' (legado)'
    display_name('trigger', trigger, name)
    trigger['parentFolderId'] = trigger_folder
for variable in c['variable']:
    name = variable['name']
    if name in ('api-event_id', 'api-transport_url'):
        folder = '8'
    elif variable['type'] == 'c':
        folder = '38'
    elif variable['type'] == 'k' or name.startswith('cookie-'):
        folder = '5'
    elif name.startswith(('user-', 'user_')):
        folder = '9'
    else:
        folder = '35'
    variable['parentFolderId'] = folder
for kind in ('tag', 'variable', 'trigger'):
    assert len({x['name'] for x in c[kind]}) == len(c[kind])
    for before, after in zip(before_organization[kind], c[kind]):
        normalize = lambda x: {k: v for k, v in x.items() if k not in ('name', 'parentFolderId')}
        assert normalize(before) == normalize(after), after['name']
        assert after['parentFolderId'] in {f['folderId'] for f in c['folder']}
assert [v['name'] for v in c['variable']] == [v['name'] for v in before_organization['variable']]
paused = [t['name'] for t in c['tag'] if t.get('paused')]
OUT.mkdir(exist_ok=True)
with (OUT / 'mapa-de-nomes.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f, delimiter=';')
    writer.writerow(['tipo', 'id', 'nome_anterior', 'nome_padronizado'])
    writer.writerows(name_map)
target = OUT / 'GTM-Arcan-adaptado-Thenewads.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
assert json.loads(target.read_text(encoding='utf-8')) == result
with (OUT / 'alteracoes.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f, delimiter=';')
    writer.writerow(['tipo', 'item', 'alteracao'])
    writer.writerows(changes)
with (OUT / 'eventos.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f, delimiter=';')
    writer.writerow(['etapa', 'evento_dataLayer', 'evento_GA4', 'evento_API_ao_servidor', 'evento_Meta_navegador'])
    writer.writerows(event_rows)
validation = {
    'base': 'arcan.json',
    'status': 'OK - validacao estatica, sem importar/publicar ou disparar eventos',
    'quantidades': {k: len(c[k]) for k in ('tag', 'variable', 'trigger', 'folder', 'customTemplate')},
    'modelos_builtins_iguais_a_arcan': True,
    'todos_itens_originais_preservados': True,
    'tipos_disparos_das_tags_originais_preservados': True,
    'nomes_padronizados_e_todos_itens_em_pastas': True,
    'organizacao_alterou_apenas_nomes_e_pastas': True,
    'gerador_event_id_da_arcan_preservado': True,
    'referencias_nao_resolvidas': sorted(unresolved),
    'tags_pausadas_sem_equivalente': paused,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
}
(OUT / 'validacao.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(validation, ensure_ascii=False, indent=2))

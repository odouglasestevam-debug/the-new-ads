// Executes the embedded Stape template with mocked GTM APIs, without network.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const original = read('GTM-Arcan-adaptado-Thenewads.json').containerVersion;
const migrated = read('GTM-Arcan-adaptado-Thenewads-STAPE.json').containerVersion;
const model = migrated.customTemplate.find((t) => t.name === 'Facebook Pixel by Stape');
const code = model.templateData.split('___SANDBOXED_JS_FOR_WEB_TEMPLATE___')[1].split('___WEB_PERMISSIONS___')[0];
const execute = new Function('require', 'data', code);
const parameters = (t) => Object.fromEntries(t.parameter.map((p) => [p.key, p]));

function resolve(value, iteration) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([^{}]+)\}\}/g, (_, name) => {
    const variable = migrated.variable.find((v) => v.name === name);
    assert.ok(variable, 'Missing variable: ' + name);
    if (variable.type === 'c') return variable.parameter.find((p) => p.key === 'value').value;
    if (name === 'api-event_id') return 'test_event_' + iteration;
    // Synthetic values verify bindings rather than reading personal data/DOM.
    return 'sample_' + iteration + '_' + name;
  });
}

function decode(p, iteration) {
  if (p.type === 'BOOLEAN') return p.value === 'true';
  if (p.type === 'LIST') return p.list.map((item) => decode(item, iteration));
  if (p.type === 'MAP') return Object.fromEntries(p.map.map((item) => [item.key, decode(item, iteration)]));
  return resolve(p.value, iteration);
}

for (const key of Object.keys(original)) {
  if (key !== 'tag') assert.deepEqual(migrated[key], original[key], key);
}
assert.equal(migrated.tag.length, original.tag.length);

let checked = 0;
for (let index = 0; index < original.tag.length; index++) {
  const before = original.tag[index];
  const after = migrated.tag[index];
  if (before.type !== 'cvt_5RM3Q') {
    assert.deepEqual(after, before);
    continue;
  }
  assert.equal(after.type, 'cvt_KFNBV');
  const omitModel = ({ type, parameter, ...rest }) => rest;
  assert.deepEqual(omitModel(after), omitModel(before));
  const old = parameters(before);
  const globalState = {};
  const calls = [];
  globalState.fbq = (...args) => calls.push(args);
  let loads = 0;
  let successes = 0;
  const apis = {
    copyFromWindow: (key) => globalState[key],
    setInWindow: (key, value) => { globalState[key] = value; },
    makeNumber: Number,
    makeString: String,
    Math,
    Object,
    JSON,
    localStorage: { getItem() { throw Error('Unexpected localStorage read'); }, setItem() { throw Error('Unexpected localStorage write'); } },
    copyFromDataLayer() { throw Error('Unexpected automatic dataLayer mapping'); },
    getType: (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    makeTableMap: (rows, key, value) => Object.fromEntries(rows.map((row) => [row[key], row[value]])),
    injectScript: (url, success) => { loads++; success(); },
    templateStorage: {},
  };
  const requireMock = (name) => apis[name] || (() => { throw Error('Unexpected GTM API: ' + name); });
  for (const iteration of [1, 2]) {
    const data = Object.fromEntries(after.parameter.map((p) => [p.key, decode(p, iteration)]));
    data.gtmOnSuccess = () => { successes++; };
    data.gtmOnFailure = () => { throw Error('Stape template signalled failure'); };
    const expectedMatching = Object.fromEntries(old.advancedMatchingList.list.map((row) => {
      const decoded = decode(row, iteration);
      return [decoded.name === 'cn' ? 'country' : decoded.name, decoded.value];
    }));
    const previousCalls = calls.length;
    execute(requireMock, data);
    const currentCalls = calls.slice(previousCalls);
    const init = currentCalls.find((call) => call[0] === 'init');
    assert.ok(init, 'User data not initialized for iteration ' + iteration);
    assert.equal(init[1], resolve(old.pixelId.value, iteration));
    assert.deepEqual(init[2], expectedMatching, before.name + ' Advanced Matching');
    const hits = currentCalls.filter((call) => call[0] === 'trackSingle' || call[0] === 'trackSingleCustom');
    assert.equal(hits.length, 1);
    const event = old.eventName.value === 'custom' ? old.customEventName.value : old.standardEventName.value;
    assert.equal(hits[0][0], old.eventName.value === 'custom' ? 'trackSingleCustom' : 'trackSingle');
    assert.equal(hits[0][1], resolve(old.pixelId.value, iteration));
    assert.equal(hits[0][2], event);
    assert.deepEqual(hits[0][4], { eventID: resolve(old.eventId.value, iteration) });
  }
  assert.equal(successes, 2);
  assert.equal(loads, 4); // SDK + Parameter Builder for each invocation.
  checked++;
}
assert.equal(checked, 7);
console.log('OK: only the model/parameters of 7 FB tags changed.');
console.log('OK: 14 mocked executions preserved Pixel, event, event ID and all user-data bindings.');
console.log('No GTM import, browser execution or real network event was performed.');

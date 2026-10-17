'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { normalizeCoordinationBindings: normalize, coordinationCatalog, boundCoordinationView: view } = require('../.homeybuild/lib/coordinationBindings');
const { CoordinationWorkspace, createHomeyCoordinationReader } = require('../.homeybuild/lib/coordinationWorkspace');
const binding = (deviceId, capabilityId, unit, positiveMeans) => ({ deviceId, driverId: 'homey:app:synthetic:driver', capabilityId, unit, positiveMeans });
function bindings() { return { schemaVersion: 1, siteKey: 'home', reviewed: true, secondaryRole: 'none', sources: {
  grid: binding('grid-device', 'measure_power', 'W', 'import'),
  externalSoc: binding('external-device', 'measure_battery', '%', 'soc'),
  externalPower: binding('external-device', 'measure_power', 'kW', 'discharging'),
  streamPower: binding('stream-device', 'measure_power', 'W', 'charging'),
} }; }
const acks = { noManualOverride: true, noCompetingController: true, otherSourcesReviewed: true };
function devices(now = 100000) {
  const b = bindings(); const map = new Map();
  for (const [slot, binding] of Object.entries(b.sources)) {
    if (!map.has(binding.deviceId)) map.set(binding.deviceId, { id: binding.deviceId, driverId: binding.driverId,
      name: 'Synthetic device', available: true, settings: { token: 'PRIVATE_TOKEN' }, capabilitiesObj: {} });
    map.get(binding.deviceId).capabilitiesObj[binding.capabilityId] = { type: 'number', getable: true, units: binding.unit,
      title: slot, value: { grid: -300, externalSoc: 98, externalPower: 0, streamPower: 0 }[slot], lastUpdated: new Date(now).toISOString() };
  } return map;
}
test('bindings project known metadata only and reject invalid units, roles, aliases and mixed external batteries', () => {
  const b = bindings(); b.token = 'PRIVATE_TOKEN'; b.sources.grid.value = 999;
  assert.doesNotMatch(JSON.stringify(normalize(b)), /PRIVATE|999/);
  for (const mutate of [b => { b.reviewed = false; }, b => { b.secondaryRole = 'grid'; }, b => { b.sources.grid.unit = 'Wh'; },
    b => { b.sources.grid.positiveMeans = ''; }, b => { b.sources.grid.deviceId = '..'; },
    b => { b.sources.externalSoc.deviceId = 'other-battery'; }, b => { b.sources.streamPower.deviceId = 'external-device'; },
    b => { b.sources.secondary = b.sources.grid; }]) {
    const value = bindings(); mutate(value); assert.equal(normalize(value), null);
  }
});
test('picker returns bounded labels and numeric metadata, never settings, values or timestamps', () => {
  const map = devices(); map.get('grid-device').name = '<img src=x onerror=alert(1)>';
  const value = coordinationCatalog(Object.fromEntries(map));
  assert.equal(value.sources.length, 4); assert.doesNotMatch(JSON.stringify(value), /PRIVATE|lastUpdated|"value"|"settings"/);
  assert.equal(value.sources[0].name, '<img src=x onerror=alert(1)>', 'UI must render this as text');
  const cap = map.get('grid-device').capabilitiesObj.measure_power;
  cap.getable = false; assert.equal(coordinationCatalog(Object.fromEntries(map)).sources.length, 3);
  cap.getable = true; cap.type = 'string'; assert.equal(coordinationCatalog(Object.fromEntries(map)).sources.length, 3);
});
test('selected contracts normalize kW and battery polarity while keeping zero distinct from unknown', () => {
  assert.equal(view(bindings(), devices(), 100000, 'session', acks, null).state, 'waiting', 'new UI session has no prior decision');
  const map = devices(); map.get('external-device').capabilitiesObj.measure_power.value = -0.125;
  const result = view(bindings(), map, 100000, 'session', acks);
  assert.equal(result.reason, 'external_battery_still_charging');
  assert.equal(result.readings.find(r => r.slot === 'externalPower').value, 125);
  assert.equal(result.readings.find(r => r.slot === 'streamPower').value, 0);
  assert.equal(result.measurementFreshnessVerified, false); assert.equal(result.controlsEnabled, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|grid-device|external-device|homey:app/);
});
test('source lastUpdated never becomes request time; missing, exact-expiry and future timestamps block', () => {
  for (const [timestamp, reason] of [[undefined, 'timestamp_unknown'], [null, 'timestamp_unknown'],
    ['not a time', 'timestamp_unknown'], [new Date(40000).toISOString(), 'reading_stale'],
    [new Date(100001).toISOString(), 'timestamp_unknown']]) {
    const map = devices(); map.get('grid-device').capabilitiesObj.measure_power.lastUpdated = timestamp;
    const result = view(bindings(), map, 100000, 'session', acks);
    assert.equal(result.reason, reason); assert.equal(result.decision, null);
    assert.equal(result.readings.find(r => r.slot === 'grid').value, null);
  }
  const first = view(bindings(), devices(), 100000, 'session', acks);
  const repeated = view(bindings(), devices(), 102000, 'session', acks, first.decision);
  assert.equal(repeated.reason, 'unadvanced_power_readings');
  assert.equal(repeated.readings[0].at, 100000);
});
test('removed devices and changed driver, capability, type or unit invalidate the selected contract', () => {
  for (const mutate of [map => map.delete('grid-device'), map => { map.get('grid-device').available = false; },
    map => { map.get('grid-device').driverId = 'replacement'; }, map => { delete map.get('grid-device').capabilitiesObj.measure_power; },
    map => { map.get('grid-device').capabilitiesObj.measure_power.units = 'kW'; }, map => { map.get('grid-device').capabilitiesObj.measure_power.type = 'string'; }]) {
    const map = devices(); mutate(map); const result = view(bindings(), map, 100000, 'session', acks);
    assert.equal(result.state, 'blocked'); assert.equal(result.decision, null); assert.equal(result.controlsEnabled, false);
  }
});
test('whole binding changes reset advice, including changes to SOC capability and manual/live provenance', () => {
  let prior; for (const now of [100000, 130000, 160000]) prior = view(bindings(), devices(now), now, 'session', acks, prior?.decision);
  assert.equal(prior.state, 'review_candidate');
  const next = bindings(); next.sources.externalSoc.capabilityId = 'measure_battery.alternative';
  const map = devices(161000); map.get('external-device').capabilitiesObj['measure_battery.alternative'] = map.get('external-device').capabilitiesObj.measure_battery;
  assert.equal(view(next, map, 161000, 'session', acks, prior.decision).state, 'waiting');
  const manual = Object.fromEntries(prior.readings.map(row => [row.slot, { value: row.value, at: 161000 }]));
  assert.equal(view(bindings(), devices(161000), 161000, 'session', acks, prior.decision, 'manual', manual).state, 'waiting');
});
test('workspace has no reads before explicit consent; catalog excludes values and refresh reads only selected IDs', async () => {
  let now = 100000, opens = 0, lists = 0; const reads = []; let closes = 0;
  const workspace = new CoordinationWorkspace(async () => { opens++; return { list: async () => { lists++; return Object.fromEntries(devices(now)); },
    read: async id => { reads.push(id); return devices(now).get(id); }, close() { closes++; } }; }, () => now);
  assert.equal((await workspace.request({ action: 'open' })).reason, 'consent_required'); assert.equal(opens, 0);
  const opened = await workspace.request({ action: 'open', consent: true }); assert.equal(opens, 1); assert.equal(lists, 0);
  const request = extra => workspace.request({ token: opened.token, consent: true, ...extra });
  const catalog = await request({ action: 'catalog' }); assert.equal(lists, 1); assert.equal(catalog.sources.length, 4);
  assert.equal((await request({ action: 'evaluate', bindings: bindings() })).reason, 'rate_limited');
  now += 2000; const result = await request({ action: 'evaluate', bindings: bindings(), acknowledgements: acks });
  assert.equal(result.state, 'waiting'); assert.deepEqual(reads, ['grid-device', 'external-device', 'stream-device']);
  await request({ action: 'revoke' }); assert.equal(closes, 1);
  assert.equal((await request({ action: 'evaluate', bindings: bindings() })).reason, 'session_expired');
});
test('revoke, restart, lost consent and expired session prevent late results or reads', async () => {
  let now = 100000, finish; const workspace = new CoordinationWorkspace(async () => ({
    list: () => new Promise(resolve => { finish = resolve; }), read: async () => null, close() {},
  }), () => now);
  const open = await workspace.request({ action: 'open', consent: true });
  const pending = workspace.request({ action: 'catalog', consent: true, token: open.token });
  assert.equal((await workspace.request({ action: 'open', consent: true })).reason, 'busy');
  await workspace.request({ action: 'revoke', token: open.token }); finish(Object.fromEntries(devices()));
  assert.equal((await pending).reason, 'session_expired');
  const second = await workspace.request({ action: 'open', consent: true }); now += 600000;
  assert.equal((await workspace.request({ action: 'catalog', consent: true, token: second.token })).reason, 'session_expired');
  workspace.stop(); assert.equal((await workspace.request({ action: 'open', consent: true })).reason, 'session_expired');
});
test('old tabs cannot revoke newer sessions, and provider failures never disclose sensitive errors', async () => {
  const workspace = new CoordinationWorkspace(async () => ({ list: async () => { throw new Error('PRIVATE_TOKEN'); }, read: async () => null, close() {} }), () => 100000);
  const first = await workspace.request({ action: 'open', consent: true });
  const second = await workspace.request({ action: 'open', consent: true });
  assert.equal((await workspace.request({ action: 'revoke', token: first.token })).reason, 'session_expired');
  const result = await workspace.request({ action: 'catalog', consent: true, token: second.token });
  assert.equal(result.reason, 'read_failed'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});
test('opt-out cancels an opening reader before its session token exists', async () => {
  let finish, closes = 0;
  const workspace = new CoordinationWorkspace(() => new Promise(resolve => { finish = resolve; }), () => 100000);
  const pending = workspace.request({ action: 'open', consent: true, clientId: 'synthetic-page' });
  assert.equal((await workspace.request({ action: 'revoke', clientId: 'other-page' })).reason, 'session_expired');
  await workspace.request({ action: 'revoke', clientId: 'synthetic-page' });
  finish({ close() { closes++; } });
  assert.equal((await pending).reason, 'session_expired'); assert.equal(closes, 1); workspace.stop();
});
test('native Homey reader uses only fixed GET routes, rejects redirects/path traversal and aborts on close', async () => {
  const calls = []; let redirected = 0;
  const target = http.createServer((_req, res) => { redirected++; res.end('{}'); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const server = http.createServer((req, res) => {
    calls.push([req.method, req.url]);
    if (req.url.endsWith('/redirect')) { res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/` }); res.end(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id: 'synthetic' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const reader = await createHomeyCoordinationReader({ api: { async getOwnerApiToken() { return 'synthetic-token'; },
    async getLocalUrl() { return `http://127.0.0.1:${server.address().port}`; } } });
  try {
    await reader.list(); await reader.read('synthetic');
    await assert.rejects(reader.read('../settings')); await assert.rejects(reader.read('..')); await assert.rejects(reader.read('redirect'));
    assert.equal(redirected, 0); assert(calls.every(([verb]) => verb === 'GET'));
    assert.deepEqual(calls.slice(0, 2), [['GET', '/api/manager/devices/device/'], ['GET', '/api/manager/devices/device/synthetic']]);
    reader.close(); await assert.rejects(reader.read('synthetic'));
  } finally { reader.close(); server.closeAllConnections(); target.closeAllConnections(); await Promise.all([
    new Promise(resolve => server.close(resolve)), new Promise(resolve => target.close(resolve))]); }
});

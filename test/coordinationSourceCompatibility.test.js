'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { coordinationCatalog, coordinationSourceKind, normalizeCoordinationBindings, boundCoordinationView } = require('../.homeybuild/lib/coordinationBindings');
const { createHomeyCoordinationReader } = require('../.homeybuild/lib/coordinationWorkspace');

function fixture() {
  const now = 1000000;
  const row = (deviceId, capabilityId, unit, positiveMeans) => ({ deviceId, driverId: 'synthetic:review-only', capabilityId, unit, positiveMeans });
  const bindings = { schemaVersion: 1, siteKey: 'synthetic', reviewed: true, secondaryRole: 'none', sources: {
    grid: row('grid', 'measure_power', 'W', 'import'), externalSoc: row('external', 'measure_battery', '%', 'soc'),
    externalPower: row('external', 'measure_power', 'W', 'charging'), streamPower: row('stream', 'measure_power', 'W', 'charging'),
  } };
  const devices = new Map();
  for (const [slot, binding] of Object.entries(bindings.sources)) {
    if (!devices.has(binding.deviceId)) devices.set(binding.deviceId, { id: binding.deviceId, driverId: binding.driverId,
      available: true, name: 'Synthetic, not a commissioned vendor', capabilitiesObj: {} });
    devices.get(binding.deviceId).capabilitiesObj[binding.capabilityId] = { type: 'number', getable: true, units: binding.unit,
      value: { grid: -500, externalSoc: 98, externalPower: 0, streamPower: 0 }[slot], lastUpdated: new Date(now).toISOString() };
  }
  const view = () => boundCoordinationView(bindings, devices, now, 'synthetic-session',
    { noManualOverride: true, noCompetingController: true, otherSourcesReviewed: true });
  return { now, bindings, devices, view };
}

test('Fronius-shaped standard battery readings remain metadata-only, including estimated or zero-filled upstream values', () => {
  const h = fixture(); const battery = h.devices.get('external');
  battery.driverId = 'homey:app:com.thomashoussin.fronius:storage';
  h.bindings.sources.externalSoc.driverId = battery.driverId; h.bindings.sources.externalPower.driverId = battery.driverId;
  const result = h.view(); assert.equal(result.measurementFreshnessVerified, false);
  assert(result.readings.every(row => row.sourceKind === 'metadata_only'));
  assert.equal(result.controlsEnabled, false); assert.equal(result.readings.find(row => row.slot === 'externalPower').value, 0);
  battery.capabilitiesObj.measure_battery.lastUpdated = new Date(h.now - 60000).toISOString();
  assert.equal(h.view().reason, 'reading_stale', 'a 60-second upstream cadence is not silently granted an exemption');
});

test('Solis-shaped kW/sign normalization does not exempt five-minute cloud readings or invent a heartbeat', () => {
  const h = fixture(), cap = h.devices.get('external').capabilitiesObj.measure_power;
  h.bindings.sources.externalPower.unit = cap.units = 'kW'; h.bindings.sources.externalPower.positiveMeans = 'discharging'; cap.value = 0.3;
  assert.equal(h.view().readings.find(row => row.slot === 'externalPower').value, -300);
  cap.lastUpdated = new Date(h.now - 300000).toISOString();
  assert.equal(h.view().reason, 'reading_stale'); assert.equal(h.view().readings.find(row => row.slot === 'externalPower').value, null);
});

test('independent SOC/power devices and changed units require review, never inferred asset or unit conversion', () => {
  const h = fixture(); h.bindings.sources.externalSoc.deviceId = 'separate-soc';
  assert.equal(normalizeCoordinationBindings(h.bindings), null);
  h.bindings.sources.externalSoc.deviceId = 'external'; h.devices.get('grid').capabilitiesObj.measure_power.units = 'kW';
  const row = h.view().readings.find(value => value.slot === 'grid');
  assert.equal(row.status, 'capability_contract_changed'); assert.equal(row.expectedUnit, 'W'); assert.equal(row.observedUnit, 'kW');
  assert.equal(row.value, null);
});

test('known preview source classification is shared, explicit and cannot confer verified vendor status', () => {
  const h = fixture(), device = h.devices.get('grid');
  device.driverId = 'homey:app:uk.co.zarb.ecoflow:smartmeter_dual_ct_preview';
  const catalog = coordinationCatalog(Object.fromEntries(h.devices));
  assert.equal(catalog.sources.find(row => row.deviceId === 'grid').sourceKind, 'candidate_preview');
  assert.equal(coordinationSourceKind({ driverId: 'synthetic:driver', capabilityId: 'dual_ct_preview_power.a' }), 'candidate_preview');
  device.driverId = 'synthetic:review-only'; device.name = 'Fronius Solis P1 verified official';
  assert.equal(coordinationCatalog(Object.fromEntries(h.devices)).sources[0].sourceKind, 'metadata_only');
});

test('permission failure and cancelled token acquisition do not proceed to URL acquisition or HTTP reads', async () => {
  let urls = 0, release;
  const api = { getOwnerApiToken: () => new Promise(resolve => { release = resolve; }), getLocalUrl: async () => { urls++; return 'http://127.0.0.1'; } };
  const abort = new AbortController(); const pending = createHomeyCoordinationReader({ api }, abort.signal);
  abort.abort(); release('synthetic-token'); await assert.rejects(pending, /closed/); assert.equal(urls, 0);
  api.getOwnerApiToken = async () => { throw new Error('synthetic denied'); };
  await assert.rejects(createHomeyCoordinationReader({ api }), /denied/); assert.equal(urls, 0);
  await assert.rejects(createHomeyCoordinationReader({ api }, abort.signal), /closed/); assert.equal(urls, 0);
});

test('native read fence rejects malformed/oversized/denied responses and close prevents subsequent network access', async () => {
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls++;
    if (req.url.endsWith('/oversized')) { res.end('x'.repeat(4 * 1024 * 1024 + 1)); return; }
    if (req.url.endsWith('/denied')) { res.writeHead(403); res.end('{}'); return; }
    res.end('{invalid');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const reader = await createHomeyCoordinationReader({ api: { getOwnerApiToken: async () => 'synthetic-token',
    getLocalUrl: async () => `http://127.0.0.1:${server.address().port}` } });
  try {
    await assert.rejects(reader.read('malformed')); await assert.rejects(reader.read('oversized'), /too large/);
    await assert.rejects(reader.read('denied'), /unavailable/);
    const before = calls; reader.close(); await assert.rejects(reader.read('after-close'), /closed/); assert.equal(calls, before);
  } finally { reader.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

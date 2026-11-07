'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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

test('missing permission never causes token acquisition, URL lookup or network access', async () => {
  const api = new Proxy({}, { get() { assert.fail('broad API must not be accessed'); } });
  await assert.rejects(createHomeyCoordinationReader({ api }), /external_reader_required/);
});
test('cancelled external-reader request fails closed before consulting Homey', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(createHomeyCoordinationReader({}, abort.signal), /closed/);
});

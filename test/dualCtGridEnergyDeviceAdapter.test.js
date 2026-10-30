'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scalar, varint } = require('./helpers/dualCtSynthetic');
const { DualCtGridEnergySession } = require('../.homeybuild/lib/dualCtGridEnergySession');
const { DualCtGridEnergyDeviceAdapter } = require('../.homeybuild/lib/dualCtGridEnergyDeviceAdapter');
const { DualCtEnergyAuthority } = require('../.homeybuild/lib/dualCtEnergyAdoption');
const { dualCtGridBinding } = require('../.homeybuild/lib/dualCtGridEnergySource');
const scope = { account: 'synthetic', device: 'SYNTHETIC01', grid: 'property', session: 'one' };
const identity = { productType: 421, firmware: 'synthetic.1' };
const contract = { id: 'synthetic_contract', ...identity, channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive',
  timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
const msg = (f, b) => Buffer.concat([varint(f * 8 + 2), varint(b.length), b]);
const int = (f, n) => Buffer.concat([varint(f * 8), varint(n)]);
const payload = watts => msg(1, Buffer.concat([msg(1, Buffer.concat([[962, watts], [963, 0], [772, 0], [515, watts],
  [991, 900000], [992, 900000], [993, 900000]].map(([f, n]) => scalar(f, n)))), int(6, 0), int(8, 254), int(9, 21)]));
const topic = `/app/device/property/${scope.device}`;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness(defaultGate = false) {
  let now = 1000; let consent = true; let enabled = true; let saved = null; let storeWrites = 0;
  const events = []; const caps = new Map();
  const session = new DualCtGridEnergySession({ scope, identity, readIdentity: () => identity,
    storage: { read: async () => saved, write: async x => { storeWrites++; saved = { ...x }; } },
    authority: new DualCtEnergyAuthority(), now: () => now, resolveContract: () => contract,
    review: () => ({ explicitConsent: consent, target: 'new_energy_device', accounting: 'power', binding: dualCtGridBinding(scope, contract),
      grid: scope.grid, inventoryComplete: true, contributors: [], externalOverlapReviewed: true, contractQualified: true }) });
  const port = { setCapabilityValue: async (id, value) => { events.push(['cap', id, value]); caps.set(id, value); },
    setCapabilityOptions: async (...args) => { events.push(['options', ...args]); },
    setEnergy: async config => { events.push(['energy', config]); },
    setUnavailable: async status => { events.push(['unavailable', status]); },
    setAvailable: async () => { events.push(['available']); } };
  const adapter = defaultGate ? new DualCtGridEnergyDeviceAdapter(session, port, () => false) : new DualCtGridEnergyDeviceAdapter(session, port, () => enabled);
  return { adapter, session, port, events, caps, now: x => { now = x; }, revoke: () => { consent = false; },
    disable: () => { enabled = false; }, saved: () => saved, storeWrites: () => storeWrites,
    async sample(at, watts) { now = at; await adapter.observe(payload(watts), topic, at); } };
}

test('production runtime gate blocks before any Homey or storage write, even with an injected qualified session', async () => {
  const h = harness(true); await h.adapter.start(); await h.sample(1000, 3600); await h.adapter.refresh(); await h.adapter.close();
  assert.equal(h.storeWrites(), 0); assert.deepEqual(h.events, []);
});

test('real session persists CT1-only energy before projection, expires watts and retains cumulative totals', async () => {
  const h = harness(); await h.adapter.start();
  assert.equal(h.caps.get('measure_power'), null); assert(!h.events.some(x => x[0] === 'available'));
  await h.sample(1000, 3600); await h.sample(61000, 3600);
  assert.equal(h.caps.get('measure_power'), 3600);
  assert.equal(h.caps.get('meter_power.imported'), h.saved().importedWh / 1000);
  assert.equal(h.caps.get('meter_power.imported'), 0.06);
  assert.equal(h.caps.get('meter_power.exported'), 0);
  h.now(151000); await h.adapter.refresh();
  assert.equal(h.caps.get('measure_power'), null); assert.equal(h.caps.get('meter_power.imported'), 0.06);
  await h.sample(152000, -3600); // Gap reanchors, never integrates unseen time.
  assert.equal(h.caps.get('meter_power.imported'), 0.06);
  await h.sample(212000, -3600); assert.equal(h.caps.get('meter_power.exported'), 0.06);
  await h.adapter.close(); assert.equal(h.caps.get('measure_power'), null);
});

test('consent revoked during a slow SDK write prevents remaining projection and clears watts', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const released = deferred(); const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'meter_power.imported') { entered.resolve(); await released.promise; }
    return original(id, value);
  };
  const pending = h.sample(61000, 3600); await entered.promise;
  const index = h.events.length; h.revoke(); released.resolve(); await pending;
  assert.equal(h.caps.get('measure_power'), null);
  assert(!h.events.slice(index).some(x => x[0] === 'available'));
  assert.equal(h.adapter.diagnostics().active, false); assert.equal(h.saved().importedWh, 60);
  await h.adapter.close();
});

test('failed SDK projection preserves saved totals and never makes the device available', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  const index = h.events.length; const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => { if (id === 'meter_power.exported') throw new Error('synthetic IO'); return original(id, value); };
  await h.sample(61000, 3600);
  assert.equal(h.saved().importedWh, 60); assert.equal(h.caps.get('measure_power'), null);
  assert.equal(h.adapter.diagnostics().status, 'projection_failed');
  assert(!h.events.slice(index).some(x => x[0] === 'available')); await h.adapter.close();
});

test('close while SDK write is pending serializes a final clear and rejects later callbacks', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 100);
  const entered = deferred(); const released = deferred(); const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => { if (id === 'meter_power.imported') { entered.resolve(); await released.promise; } return original(id, value); };
  const pending = h.sample(2000, 200); await entered.promise;
  const close = h.adapter.close(); released.resolve(); await Promise.all([pending, close]);
  assert.equal(h.caps.get('measure_power'), null);
  const writes = h.events.length; await h.sample(3000, 999); assert.equal(h.events.length, writes);
});

test('runtime gate withdrawal during configuration clears power and stops all further configuration', async () => {
  const h = harness(); h.port.setCapabilityOptions = async () => { h.disable(); };
  await h.adapter.start(); assert.equal(h.adapter.diagnostics().status, 'runtime_blocked');
  assert.equal(h.caps.get('measure_power'), null); assert(!h.events.some(x => x[0] === 'energy'));
  await h.adapter.close();
});

test('consent revoked during configuration cannot apply an Energy declaration', async () => {
  const h = harness(); h.port.setCapabilityOptions = async () => { h.revoke(); };
  await h.adapter.start(); assert.equal(h.adapter.diagnostics().active, false);
  assert.equal(h.caps.get('measure_power'), null); assert(!h.events.some(x => x[0] === 'energy'));
  await h.adapter.close();
});

test('failed power clear remains pending and retries without resuming accounting or resetting totals', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  let failClear = true; const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'meter_power.exported') throw new Error('synthetic projection failure');
    if (id === 'measure_power' && value === null && failClear) { failClear = false; throw new Error('synthetic clear failure'); }
    return original(id, value);
  };
  await h.sample(61000, 3600);
  assert.equal(h.caps.get('measure_power'), 3600); assert.equal(h.adapter.diagnostics().active, false);
  const saved = h.saved(); await h.adapter.refresh();
  assert.equal(h.caps.get('measure_power'), null); assert.deepEqual(h.saved(), saved);
  await h.adapter.close();
});

test('consent revoked during setAvailable is rechecked and immediately clears the projected power', async () => {
  const h = harness(); await h.adapter.start(); h.port.setAvailable = async () => { h.revoke(); };
  await h.sample(1000, 3600); assert.equal(h.adapter.diagnostics().active, false);
  assert.equal(h.caps.get('measure_power'), null); await h.adapter.close();
});

test('expiry ticks coalesce behind slow SDK IO; newer checkpoint cannot be published as mixed totals', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const released = deferred(); const original = h.port.setCapabilityValue;
  let block = true;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'meter_power.imported') { block = false; entered.resolve(); await released.promise; }
    return original(id, value);
  };
  const pending = h.sample(2000, 3600); await entered.promise;
  const ticks = Array.from({ length: 100 }, () => h.adapter.refresh());
  assert(ticks.every(p => p === ticks[0]));
  h.now(3000); await h.session.observe(payload(7200), topic, 3000);
  released.resolve(); await Promise.all([pending, ...ticks]);
  assert.equal(h.caps.get('measure_power'), null); assert.equal(h.adapter.diagnostics().status, 'projection_superseded');
  await h.adapter.refresh(); assert.equal(h.caps.get('measure_power'), 7200);
  assert.equal(h.saved().importedWh, 2.5, 'checkpoint retains sub-Wh precision');
  assert.equal(h.caps.get('meter_power.imported'), 0.003, 'native projection uses three decimal kWh'); await h.adapter.close();
});

test('unrelated CT2/voltage packets preserve CT1 intervals without renewing power freshness; partial CT1 still breaks the anchor', async () => {
  const packet = rows => msg(1, Buffer.concat([msg(1, Buffer.concat(rows.map(([f, n]) => scalar(f, n)))), int(6, 0), int(8, 254), int(9, 21)]));
  for (const watts of [3600, -3600]) {
    const h = harness(); await h.adapter.start(); await h.sample(1000, watts);
    h.now(2000); await h.adapter.observe(packet([[991, 90000], [992, 90000], [993, 90000], [956, 230]]), topic, 2000);
    await h.sample(3000, watts);
    const cap = watts > 0 ? 'meter_power.imported' : 'meter_power.exported';
    assert.ok(Math.abs(h.caps.get(cap) - 0.002) < 1e-12, 'unrelated traffic must not discard the two-second CT1 interval');
    h.now(4000); await h.adapter.observe(packet([[962, watts]]), topic, 4000);
    await h.sample(5000, watts); assert.ok(Math.abs(h.caps.get(cap) - 0.002) < 1e-12, 'partial CT1 must not mix cached phases');
    h.now(95000); await h.adapter.observe(packet([[956, 230], [991, 1000]]), topic, 95000);
    assert.equal(h.caps.get('measure_power'), null, 'unrelated packets cannot keep old power fresh');
    await h.adapter.close();
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const source = 'MICROSYNTHETIC0001';
class FakeDevice {
  constructor() { this.store = {}; this.values = {}; this.writes = []; this.errors = []; this.storeWrites = []; this.data = Object.freeze({ sn: source }); }
  getData() { return this.data; }
  getStoreValue(k) { return this.store[k]; }
  getSetting() { return undefined; }
  hasCapability() { return true; }
  async addCapability() {}
  getCapabilityValue(k) { return this.values[k]; }
  async setCapabilityValue(k, value) { this.writes.push({ k, value }); this.values[k] = value; }
  async setStoreValue(k, value) { this.storeWrites.push(k); this.store[k] = value; }
  log() {}
  error(...args) { this.errors.push(args); }
}
class OfflineClient { async getQuota() { throw Error('Network forbidden'); } }
const originalLoad = Module._load;
let Micro;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice };
    if (request === './EcoFlowClient') return { EcoFlowClient: OfflineClient };
    return originalLoad.call(this, request, ...args);
  };
  Micro = require('../.homeybuild/drivers/stream_micro/device');
} finally { Module._load = originalLoad; }
function harness(store = {}, values = {}) {
  const device = new Micro(); Object.assign(device.store, store); Object.assign(device.values, values);
  const timers = new Map(); let n = 0;
  device.homey = {
    settings: { get: k => ['accessKey', 'secretKey'].includes(k) ? 'synthetic-offline' : undefined },
    app: { subscribeRealtime: async () => {}, unsubscribeRealtime() {} },
    setTimeout: fn => { timers.set(++n, fn); return n; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { timers.set(++n, fn); return n; }, clearInterval: id => timers.delete(id),
  };
  device.poll = async () => {}; device.setOnlineState = async () => {};
  return { device, timers };
}
const sample = (d, receivedAt, watts = 600) => d.applyQuota({ powGetPv: watts, powGetPv2: 0 }, { source: 'mqtt', sourceSn: source, receivedAt });

test('micro optional projection failures do not mask fresh required power and remain separately stale', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  for (const failStartup of [false, true]) {
    const { device } = harness();
    const write = device.setCapabilityValue.bind(device);
    let fail = failStartup; let available = false;
    device.setCapabilityValue = async (cap, value) => {
      if (fail && cap === 'stream_micro_power_grid_feed') throw Error('synthetic optional projection failure');
      await write(cap, value);
    };
    await device.onInit();
    device.getAvailable = () => available;
    device.setAvailable = async () => { available = true; };
    device.setUnavailable = async () => { available = false; };
    device.setOnlineState = Object.getPrototypeOf(Micro.prototype).setOnlineState.bind(device);
    fail = true;
    await device.applyQuota({ powGetPv: 300, powGetPv2: 300, gridConnectionPower: 500 },
      { source: 'mqtt', sourceSn: source, receivedAt: now });
    now++;
    await sample(device, now, 0);
    await device.setOnlineState(true);
    assert.equal(available, true, 'optional grid alias failure must not invalidate fresh required total power');
    assert.equal(device.getReadingDiagnostics().stream_micro_power_grid_feed.stale, true);
    fail = false; now++;
    await device.applyQuota({ gridConnectionPower: 0 }, { source: 'mqtt', sourceSn: source, receivedAt: now });
    assert.equal(device.getReadingDiagnostics().stream_micro_power_grid_feed.stale, false);
    await device.onUninit();
  }
});

test('micro failed partial-PV clear is diagnosed, retries and fresh zero recovers without bridging lost reports', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 });
  await device.onInit(); await sample(device, now);
  const write = device.setCapabilityValue.bind(device);
  let rejectClear = true;
  device.setCapabilityValue = async (cap, value) => {
    if (rejectClear && cap === 'measure_power' && value === null) throw Error('synthetic clear failure');
    await write(cap, value);
  };
  now += 1000;
  await device.applyQuota({ powGetPv: 0 }, { source: 'mqtt', sourceSn: source, receivedAt: now });
  assert.equal(device.getReadingDiagnostics().measure_power.applicationStatus, 'write_failed');
  rejectClear = false; await device.expireLiveReadings();
  assert.equal(device.values.measure_power, null);
  now += 60000;
  await device.applyQuota({ powGetPv: 600, powGetPv2: 0 },
    { source: 'mqtt', sourceSn: source, receivedAt: now, accountingDiscontinuity: true });
  assert.equal(device.values.meter_power, 1);
  now += 60000; await sample(device, now, 0);
  assert.equal(device.values.measure_power, 0);
  assert.equal(device.getReadingDiagnostics().measure_power.stale, false);
  await device.onUninit();
});

test('micro independent PV and grid expiry retains counters, rejects older field reports and clears persisted live tiles', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1, measure_power: 900 });
  await device.onInit();
  assert.equal(device.values.measure_power, null);
  await device.applyQuota({ powGetPv: 300, powGetPv2: 300, gridConnectionPower: 500 },
    { source: 'mqtt', sourceSn: source, receivedAt: now });
  now += 180001;
  await device.applyQuota({ gridConnectionPower: 0 }, { source: 'mqtt', sourceSn: source, receivedAt: now });
  await device.expireLiveReadings();
  assert.equal(device.values.measure_power, null);
  assert.equal(device.values['measure_power.pv1'], null);
  assert.equal(device.values['measure_power.pv2'], null);
  assert.equal(device.values['measure_power.grid'], 0);
  await device.applyQuota({ gridConnectionPower: 999 }, { source: 'mqtt', sourceSn: source, receivedAt: now - 1 });
  assert.equal(device.values['measure_power.grid'], 0);
  now++;
  await sample(device, now, 600);
  assert.equal(device.values.meter_power, 1, 'a stale power interval must not be integrated');
  await device.onUninit();
});

test('micro partial PV reports are unknown totals, break accounting continuity and distinguish explicit zero', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const { device } = harness(); await device.onInit();
  const deliver = quota => device.applyQuota(quota, { source: 'mqtt', sourceSn: source, receivedAt: now });
  await deliver({ powGetPv: 300, powGetPv2: 300 });
  now += 60000; await deliver({ powGetPv: 300 });
  assert.equal(device.values['measure_power.pv1'], 300);
  assert.equal(device.values.measure_power, null);
  assert.equal(device.values.stream_micro_power_solar, null);
  assert.equal(device.values.meter_power, 0, 'an omitted channel cannot authorize a guessed interval');
  now += 60000; await deliver({ powGetPv2: 300 });
  assert.equal(device.values.measure_power, null);
  now += 60000; await deliver({ powGetPv: 300, powGetPv2: 0 });
  assert.equal(device.values.measure_power, 300, 'explicit zero is a complete channel reading');
  assert.equal(device.values.meter_power, 0, 'recovery anchors without backfilling partial reports');
  now += 60000; await deliver({ powGetPv: 300, powGetPv2: 0 });
  assert.equal(device.values.meter_power, 0.005);
  await device.onUninit();
});

test('micro partial reports cannot erase accepted receipt order or revive an older accounting anchor', async t => {
  t.mock.method(Date, 'now', () => 2000000);
  for (const partialAt of [1030000, 1090000]) {
    const { device } = harness(); await device.onInit();
    await sample(device, 1000000); await sample(device, 1060000);
    await device.applyQuota({ powGetPv: 900 }, { source: 'mqtt', sourceSn: source, receivedAt: partialAt });
    await sample(device, 1000000);
    await sample(device, 1120000);
    const expected = partialAt < 1060000 ? 0.02 : 0.01;
    assert.equal(device.values.meter_power, expected, 'older receipts cannot revive an anchor cleared by partial PV');
    await sample(device, 1180000);
    assert.equal(device.values.meter_power, expected + 0.01);
    await device.onUninit();
  }
});

test('micro startup retains the higher same-device cumulative projection and persists it', async () => {
  const { device } = harness({ generatedWh: 123000 }, { meter_power: 123.004 });
  await device.onInit();
  assert.equal(device.values.meter_power, 123.004);
  await device.onUninit();
  assert.ok(Math.abs(device.store.generatedWh - 123004) < 1e-8);
  assert.equal(device.store.microEnergyState.sourceSn, source);
});

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const settle = () => new Promise(resolve => setImmediate(resolve));

test('micro restoration validates scalar/projection values and preserves fractional precision', async () => {
  for (const row of [
    { saved: 123000.6, projected: 123.001, precise: 123000.6 },
    { saved: 123006.125, projected: 123.004, precise: 123006.125 },
    { saved: 0, projected: 0, precise: 0 },
    ...[-1, NaN, Infinity, '123000', null, undefined].map(saved => ({ saved, projected: 123.004125, precise: 123004.125 })),
    ...[-1, NaN, Infinity, 'bad', null].map(projected => ({ saved: 123004.125, projected, precise: 123004.125 })),
  ]) {
    const { device } = harness({ generatedWh: row.saved }, { meter_power: row.projected });
    await device.onInit(); await device.onUninit();
    assert.ok(Math.abs(device.store.generatedWh - row.precise) < 1e-8);
    if (Number.isFinite(row.projected) && row.projected >= 0) assert.ok(device.values.meter_power >= row.projected);
  }
});

test('micro new device waits for a measured first anchor while corrupt history never restarts at zero', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const { device } = harness(); await device.onInit();
  assert.equal(device.values.meter_power, undefined);
  await sample(device, now, 0); assert.equal(device.values.meter_power, 0);
  now += 60000; await sample(device, now); assert.equal(device.values.meter_power, 0.01);
  await device.onUninit();
  for (const invalid of [-1, NaN, Infinity, '0']) {
    const { device: bad } = harness({ generatedWh: invalid }); await bad.onInit();
    await sample(bad, now); now += 60000; await sample(bad, now); await bad.onUninit();
    assert.equal(bad.values.meter_power, undefined);
    assert.equal(bad.storeWrites.length, 0);
    assert.equal(bad.values.measure_power, 600, 'counter failure must not hide valid live power');
  }
});

test('micro unknown formats and foreign source state survive unchanged without disabling live readings', async t => {
  t.mock.method(Date, 'now', () => 1060000);
  for (const store of [
    { generatedWh: { version: 2, Wh: 123000 } },
    { generatedWh: 900000, microEnergyState: { version: 2, sourceSn: source, generatedWh: 123000 } },
    { generatedWh: 900000, microEnergyState: { version: 1, sourceSn: 'OTHERINSTALLATION', generatedWh: 123000 } },
  ]) {
    const { device } = harness(structuredClone(store), { meter_power: 123.004 });
    await device.onInit(); await sample(device, 1000000); await sample(device, 1060000); await device.onUninit();
    assert.equal(device.values.meter_power, 123.004); assert.deepEqual(device.store, store);
    assert.equal(device.values.measure_power, 600); assert.equal(device.storeWrites.length, 0);
  }
});

test('micro coherent precision wins over stale mirror after either persistence key fails', async () => {
  for (const failedKey of ['microEnergyState', 'generatedWh']) {
    const { device, timers } = harness({ generatedWh: 900000, microEnergyState: { version: 1, sourceSn: source, generatedWh: Infinity } }, { meter_power: 123.004 });
    await device.onInit(); const write = device.setStoreValue.bind(device);
    device.setStoreValue = async (key, value) => { if (key === failedKey) throw Error('synthetic store failure'); return write(key, value); };
    await assert.rejects(device.onUninit(), /store failure/);
    const next = harness(structuredClone(device.store), { meter_power: 123.004 }).device;
    await next.onInit(); await next.onUninit();
    assert.ok(Math.abs(next.store.generatedWh - 123004) < 1e-8);
    assert.equal(next.values.meter_power, 123.004);
    assert.equal(timers.size, 0, 'failed teardown must leave no retired retry timer');
  }
});

test('micro failed checkpoint retry cannot overwrite a newly unsupported source record', async () => {
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1.004 });
  await device.onInit(); const write = device.setStoreValue.bind(device);
  device.setStoreValue = async () => { throw Error('synthetic failure'); };
  await assert.rejects(device.energyCheckpoint.flush(), /failure/);
  device.setStoreValue = write;
  const future = { version: 2, sourceSn: source, generatedWh: 5000 };
  device.store.microEnergyState = future;
  await assert.rejects(device.onUninit(), /ownership changed/);
  assert.deepEqual(device.store.microEnergyState, future);
});

test('micro uses receipt time across held SDK writes and does not integrate stopped time', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 }); await device.onInit();
  const hold = deferred(); const write = device.setCapabilityValue.bind(device); let first = true;
  device.setCapabilityValue = async (key, value) => { if (key === 'stream_micro_power_pv1' && first) { first = false; await hold.promise; } await write(key, value); };
  const applying = sample(device, now); await settle(); now += 30000; hold.resolve(); await applying;
  now = 1060000; await sample(device, now); assert.equal(device.values.meter_power, 1.01);
  await device.onUninit(); now += 60000; await device.onInit(); await sample(device, now);
  assert.equal(device.values.meter_power, 1.01, 'restart cannot integrate stopped time');
  now += 60000; await sample(device, now); assert.equal(device.values.meter_power, 1.02);
  await device.onUninit();
});

test('micro rejects old/duplicate/foreign receipts, recovers clock rollback and skips long gaps', async t => {
  let now = 1180000; t.mock.method(Date, 'now', () => now);
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 }); await device.onInit();
  await sample(device, 1000000); await sample(device, 1060000); assert.equal(device.values.meter_power, 1.01);
  await sample(device, 1060000, 1200); await sample(device, 1030000, 1200);
  assert.equal(device.values.measure_power, 600);
  await device.applyQuota({ powGetPv: 600 }, { source: 'mqtt', sourceSn: 'OTHERINSTALLATION', receivedAt: 1120000 });
  await sample(device, 1180000); assert.equal(device.values.meter_power, 1.01, 'foreign receipt resets anchor');
  now = 1000000; await sample(device, now, 1200); assert.equal(device.values.measure_power, 1200);
  now += 60000; await sample(device, now, 1200); assert.equal(device.values.meter_power, 1.03);
  now += 3600001; await sample(device, now); assert.equal(device.values.meter_power, 1.03);
  await device.onUninit();
});

test('micro pending startup SDK write is drained before teardown and reinitialisation', async () => {
  const { device, timers } = harness({ generatedWh: 1000 }, { meter_power: 0.9 });
  const hold = deferred(); const entered = deferred(); const write = device.setCapabilityValue.bind(device); let first = true;
  device.setCapabilityValue = async (key, value) => { if (key === 'meter_power' && first) { first = false; entered.resolve(); await hold.promise; } await write(key, value); };
  const starting = device.onInit(); await entered.promise;
  let stopped = false; const stopping = device.onUninit().then(() => { stopped = true; });
  await settle(); assert.equal(stopped, false); hold.resolve(); await Promise.all([starting, stopping]);
  assert.equal(timers.size, 0); const count = device.writes.length; await settle(); assert.equal(device.writes.length, count);
  await device.onInit(); assert.equal(device.values.meter_power, 1); await device.onUninit();
  assert.equal(device.getData().sn, source);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeDevice {
  constructor() {
    this.store = {};
    this.values = {};
    this.settings = {};
    this.writes = [];
    this.storeWrites = [];
    this.settingsWrites = [];
    this.errors = [];
    this.data = Object.freeze({ sn: 'BK61SOLARSYNTHETIC0001' });
  }
  getData() { return this.data; }
  getStoreValue(key) { return this.store[key]; }
  getSetting(key) { return this.settings[key]; }
  hasCapability(capability) { return ['measure_power', 'meter_power'].includes(capability); }
  getCapabilityValue(capability) { return this.values[capability]; }
  async setCapabilityValue(capability, value) {
    this.writes.push({ capability, value });
    this.values[capability] = value;
  }
  async setStoreValue(key, value) { this.storeWrites.push({ key, value }); this.store[key] = value; }
  async setSettings(settings) { this.settingsWrites.push(settings); Object.assign(this.settings, settings); }
  log() {}
  error(...args) { this.errors.push(args); }
}

class OfflineClient {
  async collectStreamUnits() { return OfflineClient.discover ? OfflineClient.discover() : []; }
  async getQuota() { throw new Error('Network forbidden in solar lifecycle tests'); }
}

const originalLoad = Module._load;
let SolarDevice;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice };
    if (request === './EcoFlowClient') return { EcoFlowClient: OfflineClient };
    if (request === '../../lib/streamPairing') {
      return { collectStreamUnits: client => client.collectStreamUnits() };
    }
    return originalLoad.call(this, request, ...args);
  };
  SolarDevice = require('../.homeybuild/drivers/stream_solar/device');
} finally {
  Module._load = originalLoad;
}

function harness(store = {}, values = {}) {
  const device = new SolarDevice();
  Object.assign(device.store, store);
  Object.assign(device.values, values);
  const timers = new Map();
  let nextTimer = 0;
  device.homey = {
    settings: { get: key => ['accessKey', 'secretKey'].includes(key) ? 'synthetic-offline' : undefined },
    app: { subscribeRealtime: async () => {}, unsubscribeRealtime() {} },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearInterval: id => timers.delete(id),
  };
  device.client = new OfflineClient();
  device.poll = async () => {};
  device.setOnlineState = async () => {};
  return { device, timers };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const source = 'BK61SOLARSYNTHETIC0001';
const context = receivedAt => ({ receivedAt, source: 'mqtt', sourceSn: source });
const sample = (device, receivedAt, power = 600) =>
  device.applyQuota({ powGetPvSum: power }, context(receivedAt));

test('solar startup retains the higher same-device projection instead of losing 4 Wh', async () => {
  const { device } = harness({ generatedWh: 123000 }, { meter_power: 123.004 });
  await device.onInit();
  assert.equal(device.values.meter_power, 123.004);
  await device.onUninit();
  assert.ok(Math.abs(device.store.generatedWh - 123004) < 1e-8);
  assert.equal(device.store.solarEnergyState.sourceSn, source);
  await device.onInit();
  await sample(device, 1000000);
  assert.equal(device.values.meter_power, 123.004);
  await device.onUninit();
});

test('solar restores validated totals, retaining zero and fractional Wh precision', async () => {
  const cases = [
    { stored: 123006.125, projected: 123.004, expected: 123.006125 },
    { stored: 0, projected: 0, expected: 0 },
    { stored: undefined, projected: 0.000000125, expected: 0.000000125 },
    ...[-1, NaN, Infinity, '123000', null].map(stored => ({
      stored, projected: 123.004125, expected: 123.004125,
    })),
    ...[undefined, null, NaN, Infinity, -1].map(projected => ({
      stored: 123004.125, projected, expected: 123.004125,
    })),
  ];
  for (const { stored, projected, expected } of cases) {
    const { device } = harness({ generatedWh: stored }, { meter_power: projected });
    await device.onInit();
    assert.equal(device.values.meter_power, expected);
    await device.onUninit();
    assert.ok(Math.abs(device.store.generatedWh - expected * 1000) < 1e-8);
  }
});

test('a new solar counter anchors at its first valid sample, not a missing startup reading', async () => {
  for (const stored of [undefined, null]) {
    const { device } = harness({ generatedWh: stored });
    await device.onInit();
    assert.equal(device.values.meter_power, undefined);
    assert.equal(device.storeWrites.length, 0);
    await sample(device, 1000000, 0);
    assert.equal(device.values.meter_power, 0);
    await sample(device, 1600000);
    assert.equal(device.values.meter_power, 0.1);
    await device.onUninit();
  }
});

test('solar preserves unrecoverable invalid history instead of silently starting over', async () => {
  for (const stored of [-1, NaN, Infinity, '0']) {
    const { device } = harness({ generatedWh: stored });
    await device.onInit();
    await sample(device, 1000000, 0);
    await sample(device, 1600000);
    await device.onUninit();
    assert.equal(device.values.meter_power, undefined);
    assert.equal(device.storeWrites.length, 0);
    assert.equal(device.store.generatedWh, stored);
  }
});

test('solar preserves unsupported formats, unrepresentable projections and unrelated source totals', async () => {
  const future = { version: 2, sourceSn: source, generatedWh: 900000 };
  const cases = [
    { store: { generatedWh: future }, projection: 123.004 },
    { store: { generatedWh: future, solarEnergyState: {
      version: 1, sourceSn: source, generatedWh: 123000,
    } }, projection: 123.004 },
    { store: { generatedWh: 900000, solarEnergyState: future }, projection: 123.004 },
    { store: { generatedWh: 900000, mainSn: 'BK61OTHERINSTALLATION' }, projection: 123.004 },
    { store: { generatedWh: 900000, mainSn: {} }, projection: 123.004 },
    { store: { generatedWh: 900000, solarEnergyState: {
      version: 1, sourceSn: 'BK61OTHERINSTALLATION', generatedWh: 900000,
    } }, projection: 123.004 },
    { store: { generatedWh: 123000 }, projection: Number.MAX_VALUE },
  ];
  for (const { store, projection } of cases) {
    const { device } = harness(store, { meter_power: projection });
    await device.onInit();
    await sample(device, 1000000);
    await sample(device, 1600000);
    await device.onUninit();
    assert.equal(device.values.meter_power, projection);
    assert.equal(device.storeWrites.length, 0);
    assert.deepEqual(device.store, store);
  }
});

test('solar recovers a malformed known-source checkpoint without losing its valid projection', async () => {
  const { device } = harness({
    generatedWh: 900000,
    solarEnergyState: { version: 1, sourceSn: source, generatedWh: Infinity },
  }, { meter_power: 123.004 });
  await device.onInit();
  await device.onUninit();
  assert.ok(Math.abs(device.store.solarEnergyState.generatedWh - 123004) < 1e-8);
});

test('solar retains fractional Wh across repeated restarts with a native rounded projection', async () => {
  const { device } = harness({ generatedWh: 123000.6 }, { meter_power: 123.001 });
  for (let restart = 0; restart < 3; restart += 1) {
    await device.onInit();
    assert.equal(device.values.meter_power, 123.001);
    await device.onUninit();
    assert.equal(device.store.generatedWh, 123000.6);
  }
});

test('solar rejects a queued old-source sample and re-anchors after binding changes', async () => {
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 });
  await device.onInit();
  await sample(device, 1000000);
  device.store.mainSn = 'BK61OTHERINSTALLATION';
  await sample(device, 1600000);
  device.store.mainSn = source;
  await device.applyQuota({ powGetPvSum: 600 }, { ...context(1700000), sourceSn: 'BK61OTHERINSTALLATION' });
  await sample(device, 1800000);
  assert.equal(device.values.meter_power, 1);
  await sample(device, 2400000);
  assert.equal(device.values.meter_power, 1.1);
  await device.onUninit();
});

test('solar does not backfill downtime, duplicate/out-of-order samples or excessive gaps', async () => {
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 });
  await device.onInit();
  await sample(device, 1000000);
  await device.onUninit();
  await device.onInit();
  await sample(device, 1600000);
  assert.equal(device.values.meter_power, 1);
  await sample(device, 1600000);
  await sample(device, 1500000);
  await sample(device, 2200000);
  assert.equal(device.values.meter_power, 1.1);
  await sample(device, 6200000);
  assert.equal(device.values.meter_power, 1.1);
  await sample(device, 6800000);
  assert.equal(device.values.meter_power, 1.2);
  await sample(device, NaN);
  await sample(device, Number.MAX_VALUE);
  await sample(device, 6900000);
  assert.equal(device.values.meter_power, 1.2);
  await device.onUninit();
  await device.onInit();
  await sample(device, 1000000);
  assert.equal(device.values.meter_power, 1.2);
  await device.onUninit();
});

test('solar re-anchors an actual clock rollback without freezing fresh power or adding downtime', async (t) => {
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 });
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  await device.onInit();
  await sample(device, now);
  now = 1060000;
  await sample(device, now);
  assert.equal(device.values.meter_power, 1.01);
  now = 460000;
  await sample(device, now, 1200);
  assert.equal(device.values.measure_power, 1200);
  assert.equal(device.values.meter_power, 1.01);
  now = 520000;
  await sample(device, now, 1200);
  assert.equal(device.values.meter_power, 1.03);
  await device.onUninit();
});

test('solar uses queued receipt times even when a power capability write is delayed', async (t) => {
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1 });
  await device.onInit();
  const hold = deferred();
  const entered = deferred();
  const write = device.setCapabilityValue.bind(device);
  device.setCapabilityValue = async (capability, value) => {
    if (capability === 'measure_power') { entered.resolve(); await hold.promise; }
    return write(capability, value);
  };
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  const first = device.queueQuota({ powGetPvSum: 600 }, 'mqtt');
  await entered.promise;
  now += 600000;
  const second = device.queueQuota({ powGetPvSum: 600 }, 'mqtt');
  now += 300000;
  hold.resolve();
  await Promise.all([first, second]);
  assert.equal(device.values.meter_power, 1.1);
  await device.onUninit();
});

test('solar retries a failed projection without losing its durable counter floor', async () => {
  const { device } = harness({ generatedWh: 123004 }, { meter_power: 123 });
  const write = device.setCapabilityValue.bind(device);
  device.setCapabilityValue = async (capability, value) => {
    if (capability === 'meter_power') throw new Error('SDK unavailable');
    return write(capability, value);
  };
  await device.onInit();
  await device.onUninit();
  assert.equal(device.store.generatedWh, 123004);
  device.setCapabilityValue = write;
  await device.onInit();
  assert.equal(device.values.meter_power, 123.004);
  await device.onUninit();
});

test('solar closes failed persistence without retired retries and reconciles before reinit', async () => {
  for (const failingKey of ['solarEnergyState', 'generatedWh']) {
    const { device, timers } = harness({ generatedWh: 123000 }, { meter_power: 123.004 });
    await device.onInit();
    const retiredTimers = [...timers.values()];
    const write = device.setStoreValue.bind(device);
    let fail = true;
    device.setStoreValue = async (key, value) => {
      if (key === failingKey && fail) throw new Error('store unavailable');
      return write(key, value);
    };
    await assert.rejects(device.onUninit(), /store unavailable/);
    assert.equal(timers.size, 0);
    const writes = device.storeWrites.length;
    retiredTimers.forEach(callback => callback());
    await settle();
    assert.equal(device.storeWrites.length, writes);
    fail = false;
    await device.onInit();
    assert.equal(device.values.meter_power, 123.004);
    await device.onUninit();
    assert.ok(Math.abs(device.store.generatedWh - 123004) < 1e-8);
  }
});

test('a fresh solar instance ignores a stale legacy mirror after partial checkpoint recovery', async () => {
  const { device } = harness({
    generatedWh: 900000,
    solarEnergyState: { version: 1, sourceSn: source, generatedWh: Infinity },
  }, { meter_power: 123.004 });
  await device.onInit();
  const write = device.setStoreValue.bind(device);
  device.setStoreValue = async (key, value) => {
    if (key === 'generatedWh') throw new Error('legacy mirror unavailable');
    return write(key, value);
  };
  await assert.rejects(device.onUninit(), /legacy mirror unavailable/);
  const { device: restarted } = harness(device.store, device.values);
  await restarted.onInit();
  assert.equal(restarted.values.meter_power, 123.004);
  await restarted.onUninit();
  assert.ok(Math.abs(restarted.store.generatedWh - 123004) < 1e-8);
});

test('solar cannot retry a retired checkpoint over a newly unsupported store format', async () => {
  const { device, timers } = harness({ generatedWh: 1000 }, { meter_power: 1.004 });
  await device.onInit();
  const write = device.setStoreValue.bind(device);
  device.setStoreValue = async (key, value) => {
    if (key === 'generatedWh') throw new Error('legacy mirror unavailable');
    return write(key, value);
  };
  await assert.rejects(device.onUninit(), /legacy mirror unavailable/);
  const future = { version: 2, sourceSn: source, generatedWh: 2000 };
  device.store.solarEnergyState = future;
  await assert.rejects(device.onInit(), /checkpoint ownership changed/);
  assert.strictEqual(device.store.solarEnergyState, future);
  await assert.rejects(device.onUninit(), /checkpoint ownership changed/);
  assert.equal(timers.size, 0);
});

test('solar drains slow checkpoints and newly accepted marks before allowing reinitialization', async () => {
  const { device } = harness({ generatedWh: 1000 }, { meter_power: 1.004 });
  await device.onInit();
  const hold = deferred();
  const entered = deferred();
  const write = device.setStoreValue.bind(device);
  let first = true;
  let active = 0;
  let maxActive = 0;
  device.setStoreValue = async (key, value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (first) { first = false; entered.resolve(); await hold.promise; }
    await write(key, value);
    active -= 1;
  };
  const checkpoint = device.energyCheckpoint.flush();
  await entered.promise;
  await sample(device, 1000000);
  await sample(device, 1600000);
  let restarted = false;
  const stopping = device.onUninit();
  const starting = device.onInit().then(() => { restarted = true; });
  await settle();
  assert.equal(restarted, false);
  hold.resolve();
  await Promise.all([checkpoint, stopping, starting]);
  assert.equal(maxActive, 1);
  assert.equal(device.values.meter_power, 1.104);
  await device.onUninit();
  assert.ok(Math.abs(device.store.generatedWh - 1104) < 1e-8);
});

test('solar teardown owns pending startup SDK and attribution work before a new lifecycle', async (t) => {
  t.after(() => { delete OfflineClient.discover; });
  for (const kind of ['projection', 'attribution']) {
    const { device, timers } = harness({ generatedWh: 123004 }, { meter_power: 123 });
    const hold = deferred();
    const entered = deferred();
    const write = device.setCapabilityValue.bind(device);
    let first = true;
    const block = async () => {
      if (first) { first = false; entered.resolve(); await hold.promise; }
    };
    if (kind === 'projection') {
      device.setCapabilityValue = async (capability, value) => {
        if (capability === 'meter_power') await block();
        return write(capability, value);
      };
    } else {
      OfflineClient.discover = async () => { await block(); return []; };
    }
    const oldStart = device.onInit();
    await entered.promise;
    const stopping = device.onUninit();
    let restarted = false;
    const newStart = device.onInit().then(() => { restarted = true; });
    await settle();
    assert.equal(restarted, false);
    hold.resolve();
    await Promise.all([oldStart, stopping, newStart]);
    assert.equal(device.settingsWrites.length, 1);
    assert.equal(timers.size, 3);
    await device.onUninit();
    assert.equal(timers.size, 0);
    delete OfflineClient.discover;
  }
});

test('solar attribution maintenance is coalesced and cannot publish after teardown', async () => {
  const { device, timers } = harness({ generatedWh: 0 }, { meter_power: 0 });
  await device.onInit();
  const hold = deferred();
  let calls = 0;
  device.client.collectStreamUnits = async () => { calls += 1; await hold.promise; return []; };
  const tick = timers.get(device.attributionTimer);
  tick();
  tick();
  tick();
  await settle();
  assert.equal(calls, 1);
  const stopping = device.onUninit();
  hold.resolve();
  await stopping;
  assert.equal(device.settingsWrites.length, 1);
  assert.equal(timers.size, 0);
});

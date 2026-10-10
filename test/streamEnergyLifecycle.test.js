'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeDevice {
  constructor() { this.store = {}; this.values = {}; this.timers = new Map(); this.nextTimer = 0; }
  getData() { return { sn: 'BK61TEST00000001' }; }
  getStoreValue(key) { return this.store[key]; }
  getSetting() { return false; }
  hasCapability(cap) { return ['measure_power', 'battery_charging_state', 'meter_power.charged', 'meter_power.discharged'].includes(cap); }
  getCapabilityValue(cap) { return this.values[cap]; }
  async setCapabilityValue(cap, value) { this.values[cap] = value; }
  async setStoreValue(key, value) { this.store[key] = value; }
  registerCapabilityListener() {}
  error(...args) { throw new Error(args.join(' ')); }
}

const originalLoad = Module._load;
let StreamDevice;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice };
    return originalLoad.call(this, request, ...args);
  };
  StreamDevice = require('../.homeybuild/drivers/stream/device');
} finally { Module._load = originalLoad; }

async function harness(store = {}) {
  const device = new StreamDevice();
  Object.assign(device.store, store);
  device.homey = {
    setTimeout: (fn) => { device.timers.set(++device.nextTimer, fn); return device.nextTimer; },
    clearTimeout: (id) => device.timers.delete(id),
    flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) },
  };
  await device.onReady();
  return device;
}

test('read-only reporter resolution is throttled and leaves identity, address and energy stores untouched', async (t) => {
  t.mock.method(Date, 'now', () => 1000000);
  const device = await harness({ chargedWh: 499775, dischargedWh: 474818, mainSn: 'BK61TEST00000001' });
  let reads = 0;
  device.client = { getMainSn: async (sn, options) => {
    reads++; assert.equal(sn, device.getData().sn); assert.equal(options.fresh, true); return 'ES22SYNTHETIC';
  } };
  const before = JSON.stringify(device.store);
  await Promise.all([device.refreshReporterDiagnostics(), device.refreshReporterDiagnostics()]);
  await device.refreshReporterDiagnostics();
  assert.equal(reads, 1);
  assert.equal(device.getReportingDiagnostics().mainResolution.status, 'changed');
  assert.equal(device.getReadSn(), device.getData().sn);
  assert.equal(JSON.stringify(device.store), before);
  assert.ok(!JSON.stringify(device.getReportingDiagnostics()).includes('SYNTHETIC'));
  assert.equal(device.getResolvedReporterEvidence().sn, 'ES22SYNTHETIC');
  await device.onTeardown();
  assert.equal(device.getResolvedReporterEvidence(), null);
  await device.onReady();
  assert.equal(device.getReportingDiagnostics().mainResolution, null);
  await device.onTeardown();
});

test('late reporter resolution and failures cannot repopulate evidence after teardown or reinitialization', async () => {
  for (const failure of [false, true]) {
    const device = await harness();
    let resolve; let reject;
    device.client = { getMainSn: () => new Promise((yes, no) => { resolve = yes; reject = no; }) };
    const pending = device.refreshReporterDiagnostics();
    await device.onTeardown();
    await device.onReady();
    if (failure) reject(new Error('PRIVATE_FAILURE'));
    else resolve('ES22SYNTHETIC');
    await pending;
    assert.equal(device.getResolvedReporterEvidence(), null);
    assert.equal(device.getReportingDiagnostics().mainResolution, null);
    await device.onTeardown();
  }
});

test('failed resolution clears an earlier private join key without touching accounting', async (t) => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const device = await harness({ chargedWh: 1234, dischargedWh: 5678 });
  device.client = { getMainSn: async () => 'ES22SYNTHETIC' };
  const before = JSON.stringify(device.store);
  await device.refreshReporterDiagnostics();
  now += 60001;
  device.client.getMainSn = async () => { throw new Error('PRIVATE_FAILURE'); };
  await device.refreshReporterDiagnostics();
  assert.equal(device.getResolvedReporterEvidence(), null);
  assert.equal(device.getReportingDiagnostics().mainResolution.status, 'failed');
  assert.equal(JSON.stringify(device.store), before);
  await device.onTeardown();
});

test('reporter check retries after clock rollback rather than treating a future result as fresh', async (t) => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const device = await harness();
  let reads = 0;
  device.client = { getMainSn: async () => { reads++; return 'ES22SYNTHETIC'; } };
  await device.refreshReporterDiagnostics();
  now -= 10000;
  await device.refreshReporterDiagnostics();
  assert.equal(reads, 2);
  assert.equal(device.getResolvedReporterEvidence().receivedAt, now);
  await device.onTeardown();
});

test('an address change during lookup cannot attach a result to a different read address', async () => {
  const device = await harness();
  let resolve;
  device.client = { getMainSn: () => new Promise((yes) => { resolve = yes; }) };
  const pending = device.refreshReporterDiagnostics();
  device.getData = () => ({ sn: 'BK31OTHER' });
  resolve('ES22SYNTHETIC');
  await pending;
  assert.equal(device.getResolvedReporterEvidence(), null);
  assert.equal(device.getReportingDiagnostics().mainResolution, null);
  await device.onTeardown();
});

test('aggregate reporting receipts survive unrelated deltas but reset on initialization', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const device = await harness({ mainSn: 'BK11OTHER000001' });
  await device.applyQuota({ cmsBattSoc: 0, powGetBpCms: -315 }, { receivedAt: 98000, source: 'mqtt' });
  await device.applyQuota({ cmsBattSoc: 98 }, { receivedAt: 97000, source: 'rest' });
  await device.applyQuota({ f32ShowSoc: 99, batteryTemp: 30 }, { receivedAt: 99000, source: 'mqtt' });
  const report = device.getReportingDiagnostics();
  assert.equal(report.readAddressMatchesSavedMain, false);
  assert.deepEqual(report.observations.measure_battery, { value: 0, receivedAt: 98000, source: 'mqtt' });
  assert.deepEqual(report.observations.measure_power, { value: -315, receivedAt: 98000, source: 'mqtt' });
  assert.equal(report.observations['measure_power.pv'], undefined);
  assert.ok(!JSON.stringify(report).includes('OTHER'));
  await device.onTeardown();
  await device.onReady();
  assert.deepEqual(device.getReportingDiagnostics().observations, {});
  await device.onTeardown();
});

test('cached main-address mismatch never silently reroutes the paired reporting address', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const device = await harness({ mainSn: 'BK11OTHER000001' });
  const paired = device.getData().sn;
  assert.equal(device.getReadSn(), paired);
  await device.applyQuota({ cmsBattSoc: 0, powGetBpCms: 0 }, { receivedAt: 99000, source: 'rest' });
  assert.equal(device.getReportingDiagnostics().readAddressMatchesSavedMain, false);
  assert.equal(device.getReadSn(), paired);
  await device.onTeardown();
  await device.onReady();
  assert.equal(device.getReadSn(), paired);
  assert.equal(device.getReportingDiagnostics().readAddressMatchesSavedMain, false);
  assert.deepEqual(device.getReportingDiagnostics().observations, {});
  await device.onTeardown();
});

test('individual SOC and future receipt time cannot manufacture aggregate reporting evidence', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const device = await harness();
  await device.applyQuota({ soc: 86, f32ShowSoc: 86 }, { receivedAt: 99000, source: 'mqtt' });
  assert.equal(device.getReportingDiagnostics().observations.measure_battery, undefined);
  await device.applyQuota({ cmsBattSoc: 86 }, { receivedAt: 101000, source: 'rest' });
  assert.equal(device.getReportingDiagnostics().observations.measure_battery, undefined);
  await device.applyQuota({ cmsBattSoc: 0 }, { receivedAt: 100000, source: 'rest' });
  assert.deepEqual(device.getReportingDiagnostics().observations.measure_battery,
    { value: 0, receivedAt: 100000, source: 'rest' });
  await device.onTeardown();
});

test('history response arriving after teardown cannot repopulate daily tiles', async () => {
  const device = await harness();
  device.homey.clock = { getTimezone: () => 'UTC' };
  let release;
  const reply = new Promise((resolve) => { release = resolve; });
  device.client = { getHistory: () => reply };
  let applied = false;
  device.applyDailyEnergy = async () => { applied = true; };
  const pending = device.refreshHistory();
  await device.onTeardown();
  release([{ indexValue: 100 }]);
  await pending;
  assert.equal(applied, false);
});

test('a new day clears unknown daily history rather than inventing zero consumption', async () => {
  const device = await harness();
  device.homey.clock = { getTimezone: () => 'UTC' };
  device.historyDay = '2000-01-01';
  device.values.energy_consumption_today = 1.2;
  device.hasCapability = (cap) => cap === 'energy_consumption_today';
  device.client = { getHistory: async () => [] };
  await device.refreshHistory();
  assert.equal(device.values.energy_consumption_today, null);
  await device.onTeardown();
});

test('BK first counter baseline survives restart even when it adds no energy', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const first = await harness();
  await first.applyQuota({ accuChgEnergy: 1000, accuDsgEnergy: 500 });
  assert.equal(first.getEnergyDiagnostics().checkpoint.pending, true);
  await first.onTeardown();
  assert.equal(first.store.chargedRawWh, 1000);
  assert.equal(first.store.dischargedRawWh, 500);
  assert.equal(first.store.countersAvailable, true);
  const restarted = await harness(first.store);
  await restarted.applyQuota({ powGetBpCms: 900 });
  assert.equal(restarted.getEnergyDiagnostics().source, 'device_counters');
  assert.equal(restarted.values['meter_power.charged'], 0);
  await restarted.applyQuota({ accuChgEnergy: 1100, accuDsgEnergy: 550 });
  assert.equal(restarted.values['meter_power.charged'], 0.1);
  assert.equal(restarted.values['meter_power.discharged'], 0.05);
  await restarted.onTeardown();
});

test('BK missing/negative counters cannot latch the source or anchor historical raw totals at zero', async () => {
  const device = await harness();
  await device.applyQuota({ accuChgEnergy: -1, accuDsgEnergy: '' });
  assert.equal(device.getEnergyDiagnostics().source, 'waiting');
  await device.applyQuota({ accuChgEnergy: 5000 });
  assert.equal(device.getEnergyDiagnostics().chargedCounterSeen, true);
  assert.equal(device.getEnergyDiagnostics().dischargedCounterSeen, false);
  assert.equal(device.values['meter_power.charged'], 0);
  await device.applyQuota({ accuChgEnergy: 5100 });
  assert.equal(device.values['meter_power.charged'], 0.1);
  await device.onTeardown();
});

test('invalid saved values cannot poison totals or pretend a raw counter was observed', async () => {
  const device = await harness({ chargedWh: -10, dischargedWh: Infinity, chargedRawWh: null, dischargedRawWh: -1 });
  assert.equal(device.values['meter_power.charged'], 0);
  assert.equal(device.values['meter_power.discharged'], 0);
  assert.equal(device.getEnergyDiagnostics().source, 'waiting');
  await device.applyQuota({ accuChgEnergy: 1000 });
  assert.equal(device.values['meter_power.charged'], 0);
  await device.onTeardown();
});

test('checkpoint captures matching totals and raw baselines before an asynchronous store write', async () => {
  const device = await harness();
  await device.applyQuota({ accuChgEnergy: 1000 });
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  device.setStoreValue = async (key, value) => {
    if (key === 'chargedWh' && !release) {
      started();
      await new Promise((resolve) => { release = resolve; });
    }
    device.store[key] = value;
  };
  const flush = device.energyCheckpoint.flush();
  await entered;
  await device.applyQuota({ accuChgEnergy: 1100 });
  release();
  await flush;
  assert.equal(device.store.chargedWh, 0);
  assert.equal(device.store.chargedRawWh, 1000, 'snapshot may not mix an older total with a newer raw baseline');
  await device.onTeardown();
  assert.equal(device.store.chargedWh, 100);
  assert.equal(device.store.chargedRawWh, 1100);
});

test('BK counter authority prevents power double counting, including partial counter frames', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const device = await harness();
  await device.applyQuota({ powGetBpCms: 600 });
  now += 60000;
  await device.applyQuota({ powGetBpCms: 600 });
  assert.equal(device.values['meter_power.charged'], 0.01);
  await device.applyQuota({ accuChgEnergy: 1000, powGetBpCms: 600 });
  now += 60000;
  await device.applyQuota({ powGetBpCms: 600 });
  assert.equal(device.values['meter_power.charged'], 0.01);
  await device.applyQuota({ accuChgEnergy: 1100 });
  await device.applyQuota({ accuDsgEnergy: 900 });
  await device.applyQuota({ accuDsgEnergy: 1000 });
  assert.equal(device.values['meter_power.charged'], 0.11);
  assert.equal(device.values['meter_power.discharged'], 0.1);
  assert.equal(device.getEnergyDiagnostics().skippedSamples, 1);
  await device.onTeardown();
});

test('BK observed counter decreases preserve monotonic totals and record reset evidence', async () => {
  const device = await harness({ chargedWh: 250, chargedRawWh: 1000, countersAvailable: true });
  await device.applyQuota({ accuChgEnergy: 1100 });
  await device.applyQuota({ accuChgEnergy: 20 });
  await device.applyQuota({ accuChgEnergy: 30 });
  assert.equal(device.values['meter_power.charged'], 0.38);
  assert.equal(device.getEnergyDiagnostics().counterResets, 1);
  await device.onTeardown();
});

test('BK power accounting uses receipt time, not delayed capability-write completion', async (t) => {
  t.mock.method(Date, 'now', () => 900000);
  const device = await harness();
  await device.applyQuota({ powGetBpCms: 600 }, { receivedAt: 100000, source: 'mqtt' });
  await device.applyQuota({ powGetBpCms: 600 }, { receivedAt: 160000, source: 'rest' });
  assert.equal(device.values['meter_power.charged'], 0.01);
  await device.applyQuota({ powGetBpCms: 600 }, { receivedAt: 160000, source: 'mqtt' });
  assert.equal(device.values['meter_power.charged'], 0.01);
  await device.applyQuota({ powGetBpCms: 600 }, { receivedAt: 8000000, source: 'mqtt' });
  assert.equal(device.values['meter_power.charged'], 0.01);
  assert.equal(device.getEnergyDiagnostics().ignoredGaps, 1);
  await device.onTeardown();
});

test('BK failed store writes stay pending and retry without changing baseline values', async () => {
  const device = await harness();
  await device.applyQuota({ accuChgEnergy: 1000 });
  let fail = true;
  device.setStoreValue = async (key, value) => {
    if (key === 'chargedRawWh' && fail) { fail = false; throw new Error('temporary store failure'); }
    device.store[key] = value;
  };
  await assert.rejects(device.onTeardown(), /temporary store failure/);
  assert.equal(device.getEnergyDiagnostics().checkpoint.pending, true);
  await device.onTeardown();
  assert.equal(device.store.chargedRawWh, 1000);
  assert.equal(device.store.countersAvailable, true);
  assert.equal(device.getEnergyDiagnostics().checkpoint.failures, 1);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('counter continuity follows original counter receipts without migrating or changing energy totals', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const device = await harness({ chargedWh: 50, dischargedWh: 60 });
  await device.applyQuota({ accuChgEnergy: 1000, accuDsgEnergy: 2000, powGetBpCms: -420 }, { receivedAt: now, source: 'mqtt' });
  for (let i = 0; i < 4; i++) {
    now += 100000;
    await device.applyQuota({ accuDsgEnergy: 2000, powGetBpCms: -420 }, { receivedAt: now, source: 'mqtt' });
  }
  const diagnostics = device.getCounterContinuityDiagnostics();
  assert.equal(diagnostics.fields.accuDsgEnergy.possibleStall, true);
  assert.equal(diagnostics.sourceMigrationAllowed, false);
  assert.equal(device.getEnergyDiagnostics().dischargedKWh, 0.06);
  now++;
  await device.applyQuota({ accuDsgEnergy: 2001 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(device.getCounterContinuityDiagnostics().fields.accuDsgEnergy.advanceObserved, true);
  assert.equal(device.getEnergyDiagnostics().dischargedKWh, 0.061);
  await device.onTeardown();
  assert.equal(device.getCounterContinuityDiagnostics().fields.accuDsgEnergy.status, 'missing');
});

class FakeDevice {
  log() {}
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

async function harness(store = {}, configure) {
  const device = new StreamDevice();
  Object.assign(device.store, store);
  device.homey = {
    setTimeout: (fn) => { device.timers.set(++device.nextTimer, fn); return device.nextTimer; },
    clearTimeout: (id) => device.timers.delete(id),
    setInterval: (fn) => { device.timers.set(++device.nextTimer, fn); return device.nextTimer; },
    clearInterval: (id) => device.timers.delete(id),
    flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) },
  };
  if (configure) configure(device);
  await device.onReady();
  return device;
}

test('Live STREAM counter-store upgrade/restart preserves totals, identity and unrelated settings with no power fallback', async t => {
  let now=100000; t.mock.method(Date,'now',()=>now);
  const identity=Object.freeze({sn:'BK61SYNTHETICUPGRADE'});
  const settings=Object.freeze({enable_history:false,solar_forecast:false,poll_interval:45,history_prefix:'Keep'});
  const baseline=require('./fixtures/live-v1.10.3-contract.json').drivers.find(d=>d.id==='stream');
  const configure=d=>{d.getData=()=>identity;d.getSetting=key=>settings[key];
    d.hasCapability=cap=>baseline.capabilities.includes(cap);};
  const saved={chargedWh:150000,dischargedWh:250000,chargedRawWh:10000,dischargedRawWh:20000,
    countersAvailable:true,mainSn:identity.sn,ownerMarker:'preserve'};
  const first=await harness(saved,configure);
  assert.equal(first.values['meter_power.charged'],150);assert.equal(first.values['meter_power.discharged'],250);
  await first.applyQuota({accuChgEnergy:10002,accuDsgEnergy:20003,powGetBpCms:900},{source:'mqtt',receivedAt:now});
  assert.equal(first.values['meter_power.charged'],150.002);assert.equal(first.values['meter_power.discharged'],250.003);
  now+=60000;await first.applyQuota({powGetBpCms:900},{source:'mqtt',receivedAt:now});
  assert.equal(first.values['meter_power.charged'],150.002,'counter source forbids concurrent power integration');
  await first.onTeardown();assert.equal(first.store.ownerMarker,'preserve');assert.equal(first.getData(),identity);
  now+=3600000;const restarted=await harness(structuredClone(first.store),configure);
  await restarted.applyQuota({powGetBpCms:-900,productType:421,773:{4:1e12}},{source:'mqtt',receivedAt:now});
  assert.equal(restarted.getEnergyDiagnostics().source,'device_counters');
  assert.equal(restarted.values['meter_power.charged'],150.002);assert.equal(restarted.values['meter_power.discharged'],250.003);
  now++;
  await restarted.applyQuota({accuChgEnergy:10005,accuDsgEnergy:20007},{source:'mqtt',receivedAt:now});
  assert.equal(restarted.values['meter_power.charged'],150.005);assert.equal(restarted.values['meter_power.discharged'],250.007);
  assert.equal(restarted.getReadSn(),identity.sn);assert.equal(restarted.getSetting('poll_interval'),45);
  await restarted.onTeardown();
  for(const key of ['chargedWh','dischargedWh','chargedRawWh','dischargedRawWh','countersAvailable','mainSn','ownerMarker'])assert.ok(Object.hasOwn(restarted.store,key));
});

// Exercise the real legacy onReady/refresh path with already-paired history tiles.
const historyCaps = ['energy_solar_today', 'energy_consumption_today', 'energy_grid_import_today',
  'energy_grid_export_today', 'energy_savings_today', 'co2_today', 'energy_independence'];
function historyHarnessOptions(device) {
  const capabilities = new Set(historyCaps);
  const removed = []; const added = []; const options = {};
  const originalHas = device.hasCapability.bind(device);
  device.hasCapability = cap => capabilities.has(cap) || originalHas(cap);
  device.removeCapability = async cap => { removed.push(cap); capabilities.delete(cap); delete device.values[cap]; };
  device.addCapability = async cap => { added.push(cap); capabilities.add(cap); };
  device.setCapabilityOptions = async (cap, value) => { options[cap] = value; };
  device.homey.clock = { getTimezone: () => 'UTC' };
  for (const cap of historyCaps) { device.values[cap] = null; options[cap] = { title: `Custom ${cap}` }; }
  return { capabilities, removed, added, options };
}

test('legacy startup/reinitialization preserves blank daily-history capabilities and custom titles with history on or off', async () => {
  for (const enabled of [false, true]) {
    let state; let starts = 0;
    const device = await harness({}, d => {
      state = historyHarnessOptions(d);
      d.getSetting = key => key === 'enable_history' && enabled;
      d.startHistory = () => { starts++; };
      d.values.energy_grid_import_today = 0;
      d.values.energy_savings_today = 1.25;
    });
    device.client = { getMainSn: async () => device.getData().sn };
    await device.beforeFirstPoll();
    const before = structuredClone(state.options);
    await device.onTeardown();
    await device.onReady();
    await device.beforeFirstPoll();
    assert.deepEqual([...state.capabilities], historyCaps);
    assert.deepEqual(state.removed, []);
    assert.deepEqual(state.added, []);
    assert.deepEqual(state.options, before);
    assert.equal(device.values.energy_solar_today, null, 'unknown must not become zero');
    assert.equal(device.values.energy_grid_import_today, 0, 'real zero survives');
    assert.equal(device.values.energy_savings_today, 1.25);
    assert.equal(starts, enabled ? 2 : 0);
    await device.onTeardown();
  }
});

test('legacy empty/rejected history and day rollover keep capability identities; fresh zero/data recover in place', async () => {
  let state;
  const device = await harness({}, d => { state = historyHarnessOptions(d); });
  device.client = { getHistory: async () => { throw new Error('synthetic unavailable history'); } };
  await device.refreshHistory();
  assert.ok(historyCaps.every(cap => device.values[cap] === null));
  device.values.energy_solar_today = 2;
  device.values.energy_savings_today = 3;
  device.historyDay = '2000-01-01';
  device.client.getHistory = async () => [];
  await device.refreshHistory();
  assert.ok(historyCaps.every(cap => device.values[cap] === null), 'yesterday clears to unknown, not zero or deleted tiles');
  await device.applyDailyEnergy({ solarWh: 0, consumptionWh: 1234, gridImportWh: 0, gridExportWh: 2000,
    savings: 0, co2g: 125, independencePct: 0 });
  assert.equal(device.values.energy_solar_today, 0);
  assert.equal(device.values.energy_consumption_today, 1.234);
  assert.equal(device.values.energy_grid_import_today, 0);
  assert.equal(device.values.energy_grid_export_today, 2);
  assert.equal(device.values.co2_today, 0.125);
  assert.equal(device.values.energy_independence, 0);
  assert.deepEqual(state.removed, []); assert.deepEqual(state.added, []);
  assert.deepEqual([...state.capabilities], historyCaps);
  assert.equal(state.options.energy_solar_today.title, 'Custom energy_solar_today');
  await device.onTeardown();
});

test('legacy missing history tiles remain opt-in by evidence rather than all being added empty', async () => {
  let state;
  const device = await harness({}, d => {
    state = historyHarnessOptions(d);
    state.capabilities.clear();
    for (const cap of historyCaps) delete d.values[cap];
  });
  await device.applyDailyEnergy({});
  assert.equal(state.capabilities.size, 0);
  await device.applyDailyEnergy({ solarWh: 0 });
  assert.deepEqual([...state.capabilities], ['energy_solar_today']);
  assert.deepEqual(state.added, ['energy_solar_today']);
  assert.equal(device.values.energy_solar_today, 0);
  assert.deepEqual(state.removed, []);
  await device.onTeardown();
});

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

test('real original STREAM driver opts into field reconciliation and preserves monotonic counters', async () => {
  const device = await harness({ chargedWh: 50, dischargedWh: 60 });
  await device.applyQuota({ accuChgEnergy: 1200, accuDsgEnergy: 2000, powGetBpCms: 0 });
  const rest = device.reconcileRestQuota({ accuChgEnergy: 1000, accuDsgEnergy: 1900,
    powGetBpCms: -300, cmsBattSoc: 75 }, new Set(['accuChgEnergy']));
  assert.deepEqual(rest, { cmsBattSoc: 75 });
  await device.applyQuota(rest);
  assert.equal(device.getEnergyDiagnostics().chargedKWh, 0.05);
  assert.equal(device.getEnergyDiagnostics().dischargedKWh, 0.06);
  await device.onTeardown();
});

test('relinked original aggregate reads and subscribes to verified main without changing paired identity or counters', async () => {
  const old = 'BK61TEST00000001', main = 'BK61NEWMAIN00001';
  const device = await harness({ mainSn: old, chargedWh: 12000, dischargedWh: 34000,
    chargedRawWh: 500, dischargedRawWh: 600, countersAvailable: true, ownerMarker: 'keep' });
  const paired = device.getData();
  device.client = { getMainSn: async (sn, options) => { assert.equal(sn, old);assert.equal(options.fresh,true);return main; } };
  await device.beforeFirstPoll();
  assert.equal(device.getReadSn(),main);assert.equal(device.getRealtimeSn(),main);
  assert.deepEqual(device.getData(),paired);assert.equal(device.store.mainSn,old);assert.equal(device.store.ownerMarker,'keep');
  await device.applyQuota({cmsBattSoc:39,powGetBpCms:-157,accuChgEnergy:90000,accuDsgEnergy:80000},{source:'mqtt',receivedAt:1000});
  assert.equal(device.getEnergyDiagnostics().chargedKWh,12);assert.equal(device.getEnergyDiagnostics().dischargedKWh,34);
  await device.applyQuota({accuChgEnergy:90002,accuDsgEnergy:80003},{source:'mqtt',receivedAt:2000});
  assert.equal(device.getEnergyDiagnostics().chargedKWh,12.002);assert.equal(device.getEnergyDiagnostics().dischargedKWh,34.003);
  await device.onTeardown();
  const restarted=await harness(structuredClone(device.store));restarted.client={getMainSn:async()=>main};await restarted.beforeFirstPoll();
  await restarted.applyQuota({accuChgEnergy:90005,accuDsgEnergy:80007},{source:'rest',receivedAt:3000});
  assert.equal(restarted.getEnergyDiagnostics().chargedKWh,12.005);assert.equal(restarted.getEnergyDiagnostics().dischargedKWh,34.007);
  await restarted.onTeardown();
});

test('aggregate lookup failure or foreign-family main suppresses old zeros without touching totals', async () => {
 for(const main of [null,'ES21SYNTHETIC','ES22SYNTHETIC','UNKNOWN']) {
  const device=await harness({chargedWh:12000,dischargedWh:34000});
  device.client={getMainSn:async()=>{if(main===null)throw Error('offline');return main;}};
  await device.beforeFirstPoll();
  await device.applyQuota({cmsBattSoc:0,accuChgEnergy:999999,powGetBpCms:0},{source:'mqtt',receivedAt:1000});
  assert.equal(device.getReportingDiagnostics().observations.measure_battery,undefined);
  assert.equal(device.getEnergyDiagnostics().chargedKWh,12);assert.equal(device.aggregateBound,false);
  await assert.rejects(device.flowSetFeedIn(false),/unverified/);await device.onTeardown();
 }
});

test('late aggregate binding cannot invalidate a newer initialized session', async () => {
 const d=await harness();let resolve;
 d.client={getMainSn:()=>new Promise(yes=>{resolve=yes;})};const pending=d.beforeFirstPoll();
 await d.onTeardown();await d.onReady();d.client={getMainSn:async()=> 'BK61NEWMAIN00001'};
 await d.beforeFirstPoll();resolve('BK61OLDMAIN00001');await pending;
 assert.equal(d.getReadSn(),'BK61NEWMAIN00001');assert.equal(d.aggregateBound,true);await d.onTeardown();
});

test('restart after source change before any new counter sample never imports lifetime energy', async () => {
 const d=await harness({mainSn:'BK61TEST00000001',chargedWh:12000,dischargedWh:34000,chargedRawWh:500,dischargedRawWh:600,countersAvailable:true});
 d.client={getMainSn:async()=> 'BK61NEWMAIN00001'};await d.beforeFirstPoll();await d.onTeardown();
 assert.equal(d.store.chargedRawWh,null);assert.equal(d.store.dischargedRawWh,null);
 const next=await harness(structuredClone(d.store));next.client={getMainSn:async()=> 'BK61NEWMAIN00001'};await next.beforeFirstPoll();
 await next.applyQuota({accuChgEnergy:999999,accuDsgEnergy:888888},{source:'mqtt',receivedAt:1000});
 assert.equal(next.getEnergyDiagnostics().chargedKWh,12);assert.equal(next.getEnergyDiagnostics().dischargedKWh,34);await next.onTeardown();
});

test('counter persistence snapshots the reporter identity with the raw baselines', async () => {
 const d=await harness({chargedWh:12000,dischargedWh:34000});d.energySourceSn='BK61SOURCEA00001';
 const save=d.setStoreValue.bind(d);let release;let entered;
 const started=new Promise(yes=>{entered=yes;});
 d.setStoreValue=async(key,value)=>{if(key==='chargedWh'){entered();await new Promise(yes=>{release=yes;});}await save(key,value);};
 const pending=d.persistBatteryStore();await started;d.energySourceSn='BK61SOURCEB00001';release();await pending;
 assert.equal(d.store.energySourceSn,'BK61SOURCEA00001');
 d.setStoreValue=save;await d.onTeardown();
});

function preparePolling(device) {
  let available = true;
  device.refreshClientCredentials = () => {};
  device.getAvailable = () => available;
  device.setAvailable = async () => { available = true; };
  device.setUnavailable = async () => { available = false; };
  device.error = () => {};
  device.fireTriggers = () => {};
}

test('original STREAM resumes the same verified main after a transient lookup failure without restart or counter reset', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const main = 'BK61TEST00000001'; let failing = false; let reads = 0;
  const d = await harness({ chargedWh: 12000, dischargedWh: 34000, chargedRawWh: 1000, dischargedRawWh: 2000,
    countersAvailable: true, ownerMarker: 'keep' });
  preparePolling(d);
  d.client = {
    getMainSn: async () => { if (failing) throw new Error('synthetic timeout'); return main; },
    getQuotaAll: async sn => { assert.equal(sn, main); reads++; return { cmsBattSoc: 50 + reads, powGetBpCms: -200,
      accuChgEnergy: 1000 + (reads - 1) * 100, accuDsgEnergy: 2000 }; },
  };
  try {
    await d.beforeFirstPoll(); await d.poll(); assert.equal(reads, 1);
    failing = true; now += 30000; await d.poll(); assert.equal(d.aggregateBound, false);
    assert.equal(d.getAvailable(), false);
    await d.setOnlineState(true); assert.equal(d.getAvailable(), false, 'MQTT availability must not bypass a blocked binding');
    await d.applyQuota({ accuChgEnergy: 999999, powGetBpCms: 900 }, { source: 'mqtt', receivedAt: now });
    assert.equal(d.getEnergyDiagnostics().chargedKWh, 12);
    failing = false;
    await assert.rejects(d.flowSetFeedIn(false), /unverified/, 'a control call cannot reopen telemetry or send a command');
    now += 30000; await d.poll();
    assert.equal(reads, 2, 'same-source verification must reopen telemetry polling');
    assert.equal(d.aggregateBound, true); assert.equal(d.getReadSn(), main);
    assert.equal(d.getEnergyDiagnostics().chargedKWh, 12.1); assert.equal(d.getEnergyDiagnostics().dischargedKWh, 34);
    assert.equal(d.store.ownerMarker, 'keep'); assert.notEqual(d.values.measure_power, null);
    assert.equal(d.getAvailable(), true); assert.equal(d.getReportingDiagnostics().aggregateRecovery.recoveries, 1);
  } finally { await d.onTeardown(); }
});

test('a changed aggregate main remains blocked even if a later lookup returns the old source', async () => {
  const d = await harness({ chargedWh: 12000, dischargedWh: 34000 }); preparePolling(d);
  let main = 'BK61TEST00000001'; let reads = 0;
  d.client = { getMainSn: async () => main, getQuotaAll: async () => { reads++; return { cmsBattSoc: 50, powGetBpCms: 0 }; } };
  try {
    await d.beforeFirstPoll(); main = 'BK61CHANGED00001'; await d.poll();
    main = 'BK61TEST00000001'; await d.poll();
    assert.equal(reads, 0); assert.equal(d.aggregateBound, false);
    assert.equal(d.getEnergyDiagnostics().chargedKWh, 12);
    await assert.rejects(d.flowSetFeedIn(false), /unverified/);
  } finally { await d.onTeardown(); }
});


test('original STREAM refreshes rotated credentials before its main lookup can block the base poll', async () => {
  const d = await harness(); preparePolling(d); let lookups = 0, reads = 0, refreshes = 0;
  const main = 'BK61TEST00000001';
  const current = { getMainSn: async () => { lookups++; return main; }, getQuotaAll: async () => { reads++; return {}; } };
  d.client = current; await d.beforeFirstPoll();
  d.client = { getMainSn: async () => { throw new Error('retired credentials'); } };
  d.refreshClientCredentials = () => { refreshes++; d.client = current; };
  try {
    await d.poll();
    assert.equal(reads, 1); assert.equal(lookups, 2); assert.ok(refreshes >= 1);
    assert.equal(d.aggregateBound, true);
  } finally { await d.onTeardown(); }
});

test('same-source recovery resumes power at a new anchor without integrating the verification outage', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now); let fail = false;
  const d = await harness({ chargedWh: 12000, dischargedWh: 34000 }); preparePolling(d);
  d.client = { getMainSn: async () => { if (fail) throw Error('synthetic'); return 'BK61TEST00000001'; },
    getQuotaAll: async () => ({ powGetBpCms: 3600 }) };
  try {
    await d.beforeFirstPoll(); await d.poll();
    const total = d.getEnergyDiagnostics().chargedKWh;
    now += 1000; fail = true; await d.poll();
    now += 60000; fail = false; await d.poll();
    assert.equal(d.getEnergyDiagnostics().chargedKWh, total, 'first resumed sample must not backfill the outage');
    now += 1000; await d.poll();
    assert.ok(d.getEnergyDiagnostics().chargedKWh > total);
  } finally { await d.onTeardown(); }
});

test('reporting recovery evidence excludes source identity and arbitrary fields', () => {
  const { reportingSnapshot } = require('../.homeybuild/lib/streamReportingDiagnostics');
  const snapshot = reportingSnapshot({ getReportingDiagnostics: () => ({ aggregateRecovery: {
    state: 'blocked', verificationFailures: 2, recoveries: 1, serial: 'PRIVATE', error: 'PRIVATE' }, observations: {} }) }, 1000);
  assert.deepEqual(snapshot.aggregateRecovery, { state: 'blocked', verificationFailures: 2, recoveries: 1 });
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE/);
});


test('an old pending identity lookup cannot mark a newly initialized session unavailable', async () => {
  const d = await harness(); preparePolling(d); const main = 'BK61TEST00000001'; let release;
  d.client = { getMainSn: async () => main }; await d.beforeFirstPoll();
  d.client.getMainSn = () => new Promise(resolve => { release = resolve; });
  const old = d.poll();
  await d.onTeardown(); await d.onReady();
  d.client = { getMainSn: async () => main }; await d.beforeFirstPoll();
  await d.setOnlineState(true); assert.equal(d.getAvailable(), true);
  release(main); await old;
  assert.equal(d.getAvailable(), true); assert.equal(d.aggregateBound, true);
  assert.equal(d.getReportingDiagnostics().aggregateRecovery.verificationFailures, 0);
  await d.onTeardown();
});

test('startup verification failure is distinguishable from a previously verified source interruption', async () => {
  const d = await harness({ chargedWh: 12000, dischargedWh: 34000 }); preparePolling(d);
  d.client = { getMainSn: async () => { throw Error('synthetic startup failure'); } };
  try {
    await d.beforeFirstPoll(); await d.poll();
    const { reportingSnapshot } = require('../.homeybuild/lib/streamReportingDiagnostics');
    assert.equal(reportingSnapshot(d, 1000).aggregateRecovery.state, 'startup_unverified');
    assert.equal(d.getEnergyDiagnostics().chargedKWh, 12);
    assert.equal(d.aggregateBound, false);
    await assert.rejects(d.flowSetFeedIn(false), /unverified/);
  } finally { await d.onTeardown(); }
});

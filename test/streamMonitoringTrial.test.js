'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectMonitoringReporter, monitoringTrialSnapshot } = require('../.homeybuild/lib/streamMonitoringTrial');
const { readMonitoringState } = require('../.homeybuild/lib/streamMonitoringTrial');
const { StreamReporterObservations } = require('../.homeybuild/lib/streamReporterEvidence');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');
const { Es22TopologyTracker } = require('../.homeybuild/lib/streamTopology');
const Module = require('node:module');

class FakeDevice {
  constructor() { this.store = {}; this.values = {}; this.settings = {}; this.available = true; this.timers = new Map(); this.nextTimer = 0; }
  getData() { return { sn: oldSn, id: 'existing-original-device' }; }
  getId() { return 'existing-original-device'; }
  getStoreValue(key) { return this.store[key]; }
  getSetting(key) { return this.settings[key] ?? false; }
  hasCapability(cap) { return ['measure_battery', 'measure_power', 'battery_charging_state', 'measure_power.pv',
    'measure_power.grid', 'measure_power.load', 'meter_power.charged', 'meter_power.discharged'].includes(cap); }
  getCapabilityValue(cap) { return this.values[cap]; }
  async setCapabilityValue(cap, value) { this.values[cap] = value; }
  async setStoreValue(key, value) { this.store[key] = value; }
  getAvailable() { return this.available; }
  async setAvailable() { this.available = true; }
  async setUnavailable(message) { this.available = false; this.unavailableMessage = message; }
  async setWarning(message) { this.warning = message; }
  registerCapabilityListener() {}
  error() {}
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

const now = 1000000;
const oldSn = 'BK11SYNTHETIC';
const targetSn = 'ES22SYNTHETIC';
function fixture() {
  const old = {
    getTopologyEvidence: () => ({ source: 'bk_main_address', addressSn: oldSn, peers: [] }),
    getResolvedReporterEvidence: () => ({ sn: targetSn, readSn: oldSn, currentReadSn: oldSn, receivedAt: now - 4000 }),
    getReportingDiagnostics: () => ({ observations: {
      measure_battery: { value: 0, receivedAt: now - 4000, source: 'mqtt' },
      measure_power: { value: 0, receivedAt: now - 4000, source: 'mqtt' },
    } }),
    getStoreValue: () => null,
  };
  const monitor = {
    getId: () => 'PRIVATE_HOMEY_ID',
    getTopologyEvidence: () => ({ source: 'es22_peer_records', addressSn: targetSn,
      peers: [{ sn: oldSn, seenAt: now - 2000 }], maxReportedRecordCount: 3 }),
    getSystemReporterDiagnostics: () => ({ socPct: { value: 53, ageSec: 0, stale: false },
      batteryW: { value: -291, ageSec: 0, stale: false } }),
    getConnectionDiagnostics: () => ({ subscriptionState: 'active' }),
  };
  const map = { stream: [old], stream_5000_unit: [monitor] };
  const homey = { drivers: { getDriver: id => ({ getDevices: () => map[id] || [] }) } };
  return { homey, old, monitor, map };
}

async function deviceHarness(t, store = {}, settings = {}) {
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  const f = fixture();
  const device = new StreamDevice();
  Object.assign(device.store, store);
  Object.assign(device.settings, settings);
  f.map.stream = [device];
  const triggers = [];
  Object.assign(f.homey, {
    setTimeout: (fn, interval) => { device.timers.set(++device.nextTimer, { fn, interval, kind: 'timeout' }); return device.nextTimer; },
    clearTimeout: id => device.timers.delete(id),
    setInterval: (fn, interval) => { device.timers.set(++device.nextTimer, { fn, interval, kind: 'interval' }); return device.nextTimer; },
    clearInterval: id => device.timers.delete(id),
    flow: { getDeviceTriggerCard: id => ({ trigger: async (_device, tokens) => { triggers.push({ id, tokens }); } }) },
  });
  device.homey = f.homey;
  let reads = 0;
  device.client = { getMainSn: async (sn, options) => {
    assert.equal(sn, oldSn); assert.equal(options.fresh, true); reads++; return targetSn;
  } };
  await device.onReady();
  return { ...f, device, triggers, reads: () => reads, setTime: value => { clock = value; },
    enable: async () => {
      await device.onSettingsChanged({ use_5000_reporter_trial: true }, ['use_5000_reporter_trial']);
      device.settings.use_5000_reporter_trial = true;
    },
    legacy: async (patch = {}) => device.applyQuota({ cmsBattSoc: 0, powGetBpCms: 0, ...patch }, { receivedAt: clock, source: 'mqtt' }),
  };
}

test('opt-in requires the exact fresh joined reporter and comparable fields; keeps private binding out of diagnostics', () => {
  const { homey, old } = fixture();
  const result = selectMonitoringReporter(homey, old, now, null, true);
  assert.equal(result.status, 'active');
  assert.deepEqual(result.values, { measure_battery: 53, measure_power: -291, battery_charging_state: 'discharging' });
  const projected = monitoringTrialSnapshot({ enabled: true, ...result, sn: targetSn, password: 'DO_NOT_EXPORT' });
  assert.equal(projected.enabled, true);
  assert.equal(projected.controlMigrationAllowed, false);
  assert.equal(projected.installationScopeVerified, false);
  assert.ok(!JSON.stringify(projected).match(/SYNTHETIC|PRIVATE|DO_NOT_EXPORT/));
  assert.equal(selectMonitoringReporter(homey, old, now, 'DIFFERENT_ID').status, 'selected_reporter_changed');
});

test('activation does not use cached physical SOC, stale fields or skewed comparisons', () => {
  for (const fields of [{}, { socPct: { value: 53, ageSec: 181, stale: true } },
    { socPct: { value: 53, ageSec: 40, stale: false }, batteryW: { value: -291, ageSec: 0, stale: false } }]) {
    const { homey, old, monitor } = fixture();
    monitor.getSystemReporterDiagnostics = () => fields;
    monitor.getCapabilityValue = () => 53;
    assert.equal(selectMonitoringReporter(homey, old, now, null, true).status, 'fresh_comparison_required');
  }
});

test('active trial independently clears missing power/state while retaining fresh SOC; explicit zero stays idle', () => {
  const { homey, old, monitor } = fixture();
  monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 0, ageSec: 0, stale: false },
    batteryW: { value: -291, ageSec: 181, stale: true } });
  let result = selectMonitoringReporter(homey, old, now, 'PRIVATE_HOMEY_ID');
  assert.equal(result.status, 'fields_missing_or_stale');
  assert.deepEqual(result.values, { measure_battery: 0, measure_power: null, battery_charging_state: null });
  monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 0, ageSec: 0, stale: false },
    batteryW: { value: 0, ageSec: 0, stale: false } });
  result = selectMonitoringReporter(homey, old, now, 'PRIVATE_HOMEY_ID');
  assert.equal(result.status, 'active');
  assert.equal(result.values.battery_charging_state, 'idle');
});

test('failed, stale, changed and foreign resolution never fall back to legacy zeros or a similarly named reporter', () => {
  for (const resolution of [null, { sn: targetSn, readSn: oldSn, currentReadSn: oldSn, receivedAt: now - 300001 },
    { sn: 'ES22OTHER', readSn: oldSn, currentReadSn: oldSn, receivedAt: now }]) {
    const { homey, old } = fixture();
    old.getResolvedReporterEvidence = () => resolution;
    const result = selectMonitoringReporter(homey, old, now, 'PRIVATE_HOMEY_ID');
    assert.notEqual(result.status, 'active');
    assert.equal(result.values.measure_battery, null);
    assert.equal(result.values.measure_power, null);
  }
});

test('duplicates and overlapping Energy devices block selection even without another fresh main lookup', () => {
  for (const variant of ['duplicate_monitor', 'same_original', 'other_linked_original', 'pinned_original', 'atomic_pin', 'second_energy']) {
    const { homey, old, monitor, map } = fixture();
    if (variant === 'duplicate_monitor') map.stream_5000_unit.push({ ...monitor });
    if (variant === 'same_original') map.stream.push({ ...old, getResolvedReporterEvidence: () => null });
    if (variant === 'other_linked_original') {
      const other = { ...old, getResolvedReporterEvidence: () => null,
        getTopologyEvidence: () => ({ source: 'bk_main_address', addressSn: 'BK31OTHER', peers: [] }) };
      map.stream.push(other);
      const evidence = monitor.getTopologyEvidence();
      monitor.getTopologyEvidence = () => ({ ...evidence, peers: [...evidence.peers, { sn: 'BK31OTHER', seenAt: now }] });
    }
    if (variant === 'pinned_original') map.stream.push({ ...old, getResolvedReporterEvidence: () => null,
      getTopologyEvidence: () => ({ source: 'bk_main_address', addressSn: 'BK31OTHER', peers: [] }),
      getStoreValue: key => key === 'monitoringReporterId' ? 'PRIVATE_HOMEY_ID' : undefined });
    if (variant === 'atomic_pin') map.stream.push({ ...old, getResolvedReporterEvidence: () => null,
      getTopologyEvidence: () => ({ source: 'bk_main_address', addressSn: 'BK31OTHER', peers: [] }),
      getStoreValue: key => key === 'monitoringTrialState'
        ? { version: 1, mode: 'trial', reporterId: 'PRIVATE_HOMEY_ID' } : undefined });
    if (variant === 'second_energy') map.stream_5000_system = [{ ...monitor }];
    const selected = selectMonitoringReporter(homey, old, now, null, true);
    assert.notEqual(selected.status, 'active', variant);
    assert.equal(selected.values.measure_power, null);
  }
});

test('removed, stopped, truncated and stale-peer reporters fail closed', () => {
  for (const variant of ['missing', 'stopped', 'truncated', 'old_peer']) {
    const { homey, old, monitor, map } = fixture();
    const evidence = monitor.getTopologyEvidence();
    if (variant === 'missing') map.stream_5000_unit = [];
    if (variant === 'stopped') monitor.getConnectionDiagnostics = () => ({ subscriptionState: 'stopped' });
    if (variant === 'truncated') monitor.getTopologyEvidence = () => ({ ...evidence, truncated: true });
    if (variant === 'old_peer') monitor.getTopologyEvidence = () => ({ ...evidence, peers: [{ sn: oldSn, seenAt: 1 }] });
    assert.notEqual(selectMonitoringReporter(homey, old, now, 'PRIVATE_HOMEY_ID').status, 'active', variant);
  }
});

test('ES21 reporter uses the same gates and needs reported system fields, not averaged peers', () => {
  const { homey, old, monitor } = fixture();
  old.getResolvedReporterEvidence = () => ({ sn: 'ES21SYNTHETIC', readSn: oldSn, currentReadSn: oldSn, receivedAt: now });
  const evidence = monitor.getTopologyEvidence();
  monitor.getTopologyEvidence = () => ({ ...evidence, source: 'es21_peer_records', addressSn: 'ES21SYNTHETIC' });
  assert.equal(selectMonitoringReporter(homey, old, now, null, true).status, 'active');
});

test('support snapshot exports anonymous trial state and never network-refreshes or applies it', (t) => {
  t.mock.method(Date, 'now', () => now);
  const { homey, old } = fixture();
  old.getMonitoringTrialDiagnostics = () => ({ enabled: true, status: 'active', reporterId: 'PRIVATE_HOMEY_ID',
    candidateDevice: { driverId: 'stream_5000_unit', deviceIndex: 0 }, serial: targetSn, password: 'DO_NOT_EXPORT' });
  old.refreshMonitoringTrial = () => { throw new Error('Unexpected mutation'); };
  const report = createSupportSnapshot(homey);
  assert.equal(report.schemaVersion, 10);
  assert.equal(report.drivers[0].monitoringTrial[0].status, 'active');
  assert.ok(!JSON.stringify(report).match(/SYNTHETIC|PRIVATE|DO_NOT_EXPORT/));
});

test('device opt-in switches only SOC/power/state, keeps original identity and accounts only original counters', async (t) => {
  const h = await deviceHarness(t, { chargedWh: 501000, dischargedWh: 475000,
    chargedRawWh: 1000, dischargedRawWh: 2000, countersAvailable: true });
  await h.legacy({ accuChgEnergy: 1000, accuDsgEnergy: 2000 });
  const initialData = JSON.stringify(h.device.getData());
  await h.enable();
  assert.equal(h.device.values.measure_battery, 53);
  assert.equal(h.device.values.measure_power, -291);
  assert.equal(h.device.values.battery_charging_state, 'discharging');
  assert.equal(h.device.values['measure_power.pv'], null);
  assert.equal(h.device.getReadSn(), oldSn);
  assert.equal(JSON.stringify(h.device.getData()), initialData);
  assert.equal(h.device.store.mainSn, undefined);
  assert.deepEqual(h.device.store.monitoringTrialState, { version: 1, mode: 'trial', reporterId: 'PRIVATE_HOMEY_ID' });
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 501);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 475);
  await h.legacy({ accuChgEnergy: 1100, accuDsgEnergy: 2100 });
  assert.equal(h.device.values.measure_power, -291, 'legacy zero cannot overwrite trial power');
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 501.1);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 475.1);
  assert.deepEqual(h.device.getReportingDiagnostics().observations.measure_battery, { value: 0, receivedAt: now, source: 'mqtt' });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 475.1, 'cached reporter polling cannot integrate energy');
  await assert.rejects(h.device.flowSetChargeLimit(80), /controls are disabled/);
  await h.device.onTeardown();
  assert.equal(h.device.timers.size, 0);
});

test('power fallback accounting continues unchanged on original watts, never candidate watts', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.enable();
  h.setTime(now + 60000);
  await h.legacy();
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 0);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 0);
  assert.equal(h.device.values.measure_power, -291);
  await h.device.onTeardown();
});

test('rollback clears trial values, resets trigger baselines and waits for fresh original readings', async (t) => {
  const h = await deviceHarness(t, { chargedWh: 123456, dischargedWh: 654321 });
  await h.legacy();
  await h.enable();
  h.triggers.length = 0;
  await h.device.onSettingsChanged({ use_5000_reporter_trial: false }, ['use_5000_reporter_trial']);
  h.device.settings.use_5000_reporter_trial = false;
  assert.equal(h.device.values.measure_battery, null);
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.getAvailable(), false);
  assert.deepEqual(h.device.store.monitoringTrialState, { version: 1, mode: 'rollback', reporterId: null });
  assert.equal(h.device.timers.size, 0);
  await h.legacy({ cmsBattSoc: 15, powGetBpCms: -100 });
  assert.equal(h.device.values.measure_battery, 15);
  assert.equal(h.device.values.measure_power, -100);
  assert.equal(h.triggers.filter(e => ['battery_level_crossed', 'discharging_started'].includes(e.id)).length, 0);
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 123.456);
  await h.device.onTeardown();
});

test('restart preserves opt-in binding/totals but clears cached trial values until fresh resolution and reporter receipts', async (t) => {
  const h = await deviceHarness(t, { chargedWh: 123456, dischargedWh: 654321, monitoringReporterId: 'PRIVATE_HOMEY_ID' },
    { use_5000_reporter_trial: true });
  assert.equal(h.device.values.measure_battery, null);
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.getMonitoringTrialDiagnostics().status, 'resolution_unavailable');
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_battery, 53);
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 123.456);
  assert.equal(h.reads(), 1);
  await h.device.onTeardown();
  await h.device.onReady();
  assert.equal(h.device.values.measure_power, null);
  await h.device.refreshMonitoringTrial();
  assert.equal(h.reads(), 2);
  assert.equal(h.device.values.measure_power, -291);
  await h.device.onTeardown();
});

test('missing pinned binding on startup cannot automatically select a new reporter', async (t) => {
  const h = await deviceHarness(t, {}, { use_5000_reporter_trial: true });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.getMonitoringTrialDiagnostics().status, 'waiting_for_validation');
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.store.monitoringReporterId, undefined);
  await h.device.onTeardown();
});

test('stale power clears independently and legacy online status cannot revive unavailable trial', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.enable();
  h.monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 53, ageSec: 0, stale: false },
    batteryW: { value: -291, ageSec: 181, stale: true } });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_battery, 53);
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.values.battery_charging_state, null);
  assert.equal(h.device.getAvailable(), false);
  await h.device.setOnlineState(true);
  assert.equal(h.device.getAvailable(), false);
  h.map.stream_5000_unit = [];
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_battery, null);
  assert.equal(h.device.values.measure_power, null);
  await h.device.onTeardown();
});

test('automatic identity recheck is bounded; failed lookup clears active values instead of retaining evidence', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.enable();
  for (let i = 0; i < 16; i++) { h.setTime(now + i * 15000); await h.device.refreshMonitoringTrial(); }
  assert.equal(h.reads(), 1);
  h.device.client.getMainSn = async () => { throw new Error('PRIVATE_API_FAILURE'); };
  h.setTime(now + 240000);
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.getMonitoringTrialDiagnostics().status, 'resolution_unavailable');
  assert.ok(!JSON.stringify(h.device.getMonitoringTrialDiagnostics()).includes('PRIVATE_API_FAILURE'));
  await h.device.onTeardown();
});

test('lookup finishing after teardown cannot restore trial values or source binding', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.enable();
  h.setTime(now + 240000);
  let resolve;
  let started;
  const readStarted = new Promise(yes => { started = yes; });
  h.device.client.getMainSn = () => new Promise(yes => { resolve = yes; started(); });
  const pending = h.device.refreshMonitoringTrial();
  await readStarted;
  await h.device.onTeardown();
  resolve(targetSn);
  await pending;
  assert.equal(h.device.getResolvedReporterEvidence(), null);
  assert.equal(h.device.getMonitoringTrialDiagnostics().status, 'waiting_for_validation');
  assert.equal(h.device.timers.size, 0);
});

test('activation with failed prerequisites or store write failure leaves trial off', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  h.map.stream_5000_system = [{ ...h.monitor }];
  await assert.rejects(h.enable(), /Run the read-only reporter check/);
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.equal(h.device.store.monitoringReporterId, undefined);
  h.map.stream_5000_system = [];
  h.device.setStoreValue = async () => { throw new Error('STORE_FAILURE'); };
  await assert.rejects(h.enable(), /STORE_FAILURE/);
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.equal(h.device.timers.size, 0);
  await h.device.onTeardown();
});

test('default remains passive and runtime charge/idle use selected system sign without counters', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.device.refreshMonitoringTrial();
  assert.equal(h.reads(), 0);
  assert.equal(h.device.timers.size, 0);
  await h.enable();
  h.monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 54, ageSec: 0, stale: false },
    batteryW: { value: 400, ageSec: 0, stale: false } });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.isCharging(), true);
  assert.equal(h.device.batterySocIs('above', 53), true);
  assert.equal(h.device.isChargingFromSolar(), false, 'old installation PV cannot prove the new system charging source');
  assert.equal(h.device.isExporting(), false);
  h.monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 0, ageSec: 0, stale: false },
    batteryW: { value: 0, ageSec: 0, stale: false } });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, 0);
  assert.equal(h.device.values.battery_charging_state, 'idle');
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 0);
  await h.device.onTeardown();
});

test('failed Homey capability updates fail closed, retry locally and do not undo a saved opt-in', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  const write = h.device.setCapabilityValue.bind(h.device);
  h.device.setWarning = async () => { throw new Error('PRIVATE_WARNING_FAILURE'); };
  let fail = true;
  h.device.setCapabilityValue = async (cap, value) => {
    if (fail && cap === 'measure_battery') throw new Error('PRIVATE_CAPABILITY_FAILURE');
    return write(cap, value);
  };
  await h.enable();
  assert.equal(h.device.getMonitoringTrialDiagnostics().status, 'application_failed');
  assert.equal(h.device.getAvailable(), false);
  assert.equal(h.device.isCharging(), false);
  assert.equal(h.device.batterySocIs('below', 100), false);
  assert.equal(h.device.getReadingDiagnostics().measure_battery.stale, true);
  assert.equal(h.device.timers.size, 1);
  assert.ok(!JSON.stringify(h.device.getMonitoringTrialDiagnostics()).includes('PRIVATE_CAPABILITY'));
  fail = false;
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_battery, 53);
  assert.equal(h.device.getAvailable(), true);
  await h.device.onTeardown();
});

test('rollback capability failure cannot revive cached trial readings, conditions or controls', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.enable();
  const write = h.device.setCapabilityValue.bind(h.device);
  let fail = true;
  h.device.setCapabilityValue = async (cap, value) => {
    if (fail && cap === 'measure_battery') throw new Error('WRITE_FAILURE');
    return write(cap, value);
  };
  await h.device.onSettingsChanged({ use_5000_reporter_trial: false }, ['use_5000_reporter_trial']);
  assert.equal(h.device.values.measure_battery, 53, 'SDK failure leaves cache but not a usable reading');
  await h.device.setOnlineState(true);
  assert.equal(h.device.getAvailable(), false);
  assert.equal(h.device.getReadingDiagnostics().measure_battery.stale, true);
  assert.equal(h.device.batterySocIs('above', 50), false);
  await assert.rejects(h.device.flowSetChargeLimit(80), /controls are disabled/);
  await h.legacy({ cmsBattSoc: 15, powGetBpCms: -100 });
  assert.equal(h.device.getReadingDiagnostics().measure_battery.stale, true);
  fail = false;
  await h.legacy({ cmsBattSoc: 15, powGetBpCms: -100 });
  assert.deepEqual(h.device.getReadingDiagnostics(), {});
  assert.equal(h.device.values.measure_battery, 15);
  await h.device.onTeardown();
});

test('enabling trial cancels an in-flight original control before it writes', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  let finishRead;
  let writes = 0;
  let started;
  const readStarted = new Promise(resolve => { started = resolve; });
  h.device.readControlQuota = () => new Promise(resolve => { finishRead = resolve; started(); });
  h.device.writeQuota = async () => { writes++; };
  const command = h.device.flowSetChargeLimit(80);
  const rejected = assert.rejects(command);
  await readStarted;
  assert.equal(typeof finishRead, 'function');
  await h.enable();
  finishRead({ maxChgSoc: 90, minDsgSoc: 5, backupReserveSoc: 10 });
  await rejected;
  assert.equal(writes, 0);
  await h.device.onTeardown();
});

test('late resolution after rollback cannot re-enable trial; backwards clock invalidates receipts', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  await h.enable();
  h.setTime(now - 10000);
  await h.device.refreshMonitoringTrial();
  assert.notEqual(h.device.getMonitoringTrialDiagnostics().status, 'active');
  assert.equal(h.device.values.measure_power, null);
  h.setTime(now + 240000);
  let finish; let started;
  const readStarted = new Promise(resolve => { started = resolve; });
  h.device.client.getMainSn = () => new Promise(resolve => { finish = resolve; started(); });
  const check = h.device.refreshMonitoringTrial();
  await readStarted;
  await h.device.onSettingsChanged({ use_5000_reporter_trial: false }, ['use_5000_reporter_trial']);
  finish(targetSn);
  await check;
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.timers.size, 0);
  await h.device.onTeardown();
});

test('rollback wait survives restart and requires fresh original core readings', async (t) => {
  const h = await deviceHarness(t, { monitoringRollbackPending: true });
  assert.equal(h.device.getAvailable(), false);
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.getMonitoringTrialDiagnostics().rollbackAwaitingFreshOriginal, true);
  await h.device.setOnlineState(true);
  assert.equal(h.device.getAvailable(), false);
  await h.legacy({ cmsBattSoc: 15, powGetBpCms: -100 });
  assert.deepEqual(h.device.store.monitoringTrialState, { version: 1, mode: 'original', reporterId: null });
  assert.equal(h.device.getMonitoringTrialDiagnostics().rollbackAwaitingFreshOriginal, false);
  await h.device.setOnlineState(true);
  assert.equal(h.device.getAvailable(), true);
  assert.equal(h.reads(), 0);
  await h.device.onTeardown();
});

test('Flow conditions and widgets reject expired, removed and changed donor readings before the next tick', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy(); await h.enable();
  h.monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 53, ageSec: 0, stale: false },
    batteryW: { value: 400, ageSec: 0, stale: false } });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.isCharging(), true);
  assert.equal(h.device.batterySocIs('above', 50), true);
  assert.doesNotThrow(() => h.device.assertMonitoringCondition('core'));
  assert.throws(() => h.device.assertMonitoringCondition('installation'), /conditions are unavailable/);
  h.monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 10, ageSec: 0, stale: false },
    batteryW: { value: 0, ageSec: 0, stale: false } });
  assert.equal(h.device.isCharging(), false, 'new donor receipt cannot bless an older cached power');
  assert.equal(h.device.batterySocIs('above', 50), false);
  assert.equal(h.device.getReadingDiagnostics().measure_power.stale, true);
  assert.throws(() => h.device.assertMonitoringCondition('core'), /Monitoring reporter/);
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, 0);
  assert.equal(h.device.batterySocIs('below', 50), true);
  h.monitor.getSystemReporterDiagnostics = () => ({ socPct: { value: 10, ageSec: 181, stale: true },
    batteryW: { value: 0, ageSec: 181, stale: true } });
  assert.equal(h.device.batterySocIs('below', 50), false);
  h.map.stream_5000_unit = [];
  assert.equal(h.device.isCharging(), false);
  assert.equal(h.device.batterySocIs('below', 50), false);
  await h.device.setOnlineState(true);
  assert.equal(h.device.getAvailable(), false);
  await h.device.onTeardown();
});

test('local expiry clearing continues through a hanging lookup; deadline cancels it and rejects late results', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy(); await h.enable();
  h.setTime(now + 240000);
  const topology = h.monitor.getTopologyEvidence();
  h.monitor.getTopologyEvidence = () => ({ ...topology, peers: [{ sn: oldSn, seenAt: Date.now() }] });
  let started; let finish; let signal; let lookups = 0;
  const readStarted = new Promise(resolve => { started = resolve; });
  h.device.client.getMainSn = (_sn, options) => new Promise(resolve => {
    finish = resolve; signal = options.signal; lookups++; started();
  });
  const check = h.device.refreshMonitoringTrial();
  await readStarted;
  assert.equal(h.device.values.measure_power, -291);
  h.setTime(now + 310000); // Even a broken transport cannot hold an expired identity active.
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.getAvailable(), false);
  assert.equal(lookups, 1);
  const deadline = [...h.device.timers.values()].find(timer => timer.interval === 20000);
  assert.ok(deadline); deadline.fn();
  await check;
  assert.equal(signal.aborted, true);
  assert.equal(h.device.getResolvedReporterEvidence(), null);
  finish(targetSn); await Promise.resolve();
  assert.equal(h.device.values.measure_power, null);
  assert.equal(h.device.timers.size, 1, 'only local monitoring interval remains');
  await h.device.onTeardown();
  assert.equal(h.device.timers.size, 0);
});

test('rapid setting changes are serialized and bounded; validation blocks commands before saving anything', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  let started; let finish;
  const readStarted = new Promise(resolve => { started = resolve; });
  h.device.client.getMainSn = () => new Promise(resolve => { finish = resolve; started(); });
  const enable = h.enable();
  await readStarted;
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  await assert.rejects(h.device.flowSetChargeLimit(80), /controls are disabled/);
  const off = Array.from({ length: 3 }, () => h.device.onSettingsChanged(
    { use_5000_reporter_trial: false }, ['use_5000_reporter_trial'],
  ));
  await assert.rejects(h.enable(), /Too many pending/);
  finish(targetSn);
  await assert.rejects(enable, /read-only reporter check first/);
  await Promise.all(off);
  h.device.settings.use_5000_reporter_trial = false;
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.deepEqual(h.device.store.monitoringTrialState, { version: 1, mode: 'rollback', reporterId: null });
  assert.equal(h.device.monitoringSettingsCount, 0);
  assert.equal(h.device.timers.size, 0);
  await h.device.onTeardown();
});

test('restart reconciles an atomic state saved before Homey committed the setting without promoting trial readings', async (t) => {
  const h = await deviceHarness(t, { chargedWh: 123456, dischargedWh: 654321 });
  await h.legacy();
  const write = h.device.setStoreValue.bind(h.device);
  h.device.setStoreValue = async (key, value) => {
    await write(key, value);
    if (key === 'monitoringTrialState') throw new Error('Simulated interruption after persistence');
  };
  await assert.rejects(h.enable(), /Simulated interruption/);
  assert.deepEqual(h.device.store.monitoringTrialState, { version: 1, mode: 'trial', reporterId: 'PRIVATE_HOMEY_ID' });
  h.device.setStoreValue = write;
  await h.device.onReady();
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.equal(h.device.getMonitoringTrialDiagnostics().rollbackAwaitingFreshOriginal, true);
  assert.equal(h.device.values.measure_battery, null);
  assert.equal(h.device.batterySocIs('above', 10), false);
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 123.456);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 654.321);
  await h.legacy();
  assert.deepEqual(h.device.store.monitoringTrialState, { version: 1, mode: 'original', reporterId: null });
  await h.device.onTeardown();
});

test('teardown during persistence cancels setting completion and restart reconciles the saved record', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  let persisted; let finish;
  const saved = new Promise(resolve => { persisted = resolve; });
  const write = h.device.setStoreValue.bind(h.device);
  h.device.setStoreValue = async (key, value) => {
    await write(key, value);
    if (key === 'monitoringTrialState') await new Promise(resolve => { finish = resolve; persisted(); });
  };
  const enable = h.enable();
  await saved;
  await h.device.onTeardown();
  finish();
  await assert.rejects(enable, /Monitoring change cancelled/);
  assert.equal(h.device.settings.use_5000_reporter_trial, undefined);
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.equal(h.device.monitoringSettingsCount, 0);
  assert.equal(h.device.timers.size, 0);
  h.device.setStoreValue = write;
  await h.device.onReady();
  assert.equal(h.device.getMonitoringTrialDiagnostics().rollbackAwaitingFreshOriginal, true);
  assert.equal(h.device.values.measure_battery, null);
  await h.device.onTeardown();
});

test('activation lookup deadline releases the setting guard without saving a binding or reviving late results', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  let started; let finish; let signal;
  const readStarted = new Promise(resolve => { started = resolve; });
  h.device.client.getMainSn = (_sn, opts) => new Promise(resolve => {
    signal = opts.signal; finish = resolve; started();
  });
  const enable = h.enable();
  await readStarted;
  const timer = [...h.device.timers.values()].find(entry => entry.interval === 20000);
  timer.fn();
  await assert.rejects(enable, /read-only reporter check first/);
  assert.equal(signal.aborted, true);
  assert.equal(h.device.monitoringSettingsCount, 0);
  assert.equal(h.device.store.monitoringTrialState, undefined);
  assert.equal(h.device.getMonitoringTrialDiagnostics().enabled, false);
  assert.equal(h.device.timers.size, 0);
  finish(targetSn); await Promise.resolve();
  assert.equal(h.device.getResolvedReporterEvidence(), null);
  await h.device.onTeardown();
});

test('automatic failed lookup cadence stays bounded while local expiry checks continue', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy(); await h.enable();
  let reads = 0;
  h.device.client.getMainSn = async () => { reads++; throw new Error('Synthetic rate limit'); };
  h.setTime(now + 240000);
  await h.device.refreshMonitoringTrial();
  assert.equal(reads, 1);
  assert.equal(h.device.values.measure_power, null);
  for (let tick = 1; tick < 16; tick++) {
    h.setTime(now + 240000 + tick * 15000);
    await h.device.refreshMonitoringTrial();
  }
  assert.equal(reads, 1);
  h.setTime(now + 480000);
  await h.device.refreshMonitoringTrial();
  assert.equal(reads, 2);
  await h.device.onTeardown();
});

test('expired and future original samples cannot repopulate core rollback readings or finish rollback', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy(); await h.enable();
  await h.device.onSettingsChanged({ use_5000_reporter_trial: false }, ['use_5000_reporter_trial']);
  for (const receivedAt of [now - 180001, now + 1, NaN]) {
    await h.device.applyQuota({ cmsBattSoc: 60, powGetBpCms: 300 }, { receivedAt, source: 'mqtt' });
    assert.equal(h.device.values.measure_battery, null);
    assert.equal(h.device.values.measure_power, null);
    assert.equal(h.device.getMonitoringTrialDiagnostics().rollbackAwaitingFreshOriginal, true);
    assert.equal(h.device.batterySocIs('above', 10), false);
  }
  await h.legacy({ cmsBattSoc: 60, powGetBpCms: 300 });
  assert.equal(h.device.values.measure_battery, 60);
  assert.equal(h.device.getMonitoringTrialDiagnostics().rollbackAwaitingFreshOriginal, false);
  await h.device.onTeardown();
});

test('a saved rollback with an uncommitted off setting never falls back to legacy pin or cached trial readings', async (t) => {
  const h = await deviceHarness(t, { monitoringTrialState: { version: 1, mode: 'rollback', reporterId: null },
    monitoringReporterId: 'PRIVATE_HOMEY_ID' }, { use_5000_reporter_trial: true });
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.getMonitoringTrialDiagnostics().status, 'waiting_for_validation');
  assert.equal(h.device.values.measure_power, null);
  await assert.rejects(h.device.flowSetChargeLimit(80), /controls are disabled/);
  await h.device.onTeardown();
});

test('rollback completion must be saved before conditions or availability recover', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy(); await h.enable();
  await h.device.onSettingsChanged({ use_5000_reporter_trial: false }, ['use_5000_reporter_trial']);
  const write = h.device.setStoreValue.bind(h.device);
  h.device.setStoreValue = async (key, value) => {
    if (key === 'monitoringTrialState') throw new Error('PRIVATE_STORE_FAILURE');
    return write(key, value);
  };
  await h.legacy({ cmsBattSoc: 15, powGetBpCms: 100 });
  assert.equal(h.device.values.measure_battery, 15);
  assert.equal(h.device.isCharging(), false);
  await h.device.setOnlineState(true);
  assert.equal(h.device.getAvailable(), false);
  h.device.setStoreValue = write;
  await h.legacy({ cmsBattSoc: 15, powGetBpCms: 100 });
  assert.equal(h.device.isCharging(), true);
  await h.device.onTeardown();
});

test('corrupt/version-unknown monitoring states fail closed and do not override or expose private data', async (t) => {
  for (const raw of [{ version: 2, mode: 'trial', reporterId: 'PRIVATE_HOMEY_ID' },
    { version: 1, mode: 'trial', reporterId: '' }, { version: 1, mode: 'original', reporterId: 'PRIVATE_HOMEY_ID' }]) {
    assert.equal(readMonitoringState(raw), null);
    const h = await deviceHarness(t, { monitoringTrialState: raw, monitoringReporterId: 'PRIVATE_HOMEY_ID' });
    assert.equal(h.device.getAvailable(), false);
    assert.equal(h.device.batterySocIs('above', 0), false);
    assert.equal(h.device.values.measure_power, null);
    assert.ok(!JSON.stringify(h.device.getMonitoringTrialDiagnostics()).includes('PRIVATE'));
    await h.device.onTeardown();
  }
  assert.deepEqual(readMonitoringState({ version: 1, mode: 'original', reporterId: null, secret: 'PRIVATE' }),
    { version: 1, mode: 'original', reporterId: null });
});

test('duplicate/delayed candidate frames cannot replace newer readings or alter original kWh accounting', async (t) => {
  const h = await deviceHarness(t, { chargedWh: 123000, dischargedWh: 456000,
    chargedRawWh: 100, dischargedRawWh: 200, countersAvailable: true });
  await h.legacy({ accuChgEnergy: 100, accuDsgEnergy: 200 });
  const tracker = new StreamReporterObservations();
  tracker.observe({ socPct: 53, battW: -291 }, targetSn, now);
  h.monitor.getSystemReporterDiagnostics = () => tracker.snapshot(Date.now());
  await h.enable();
  tracker.observe({ socPct: 0, battW: 9000 }, targetSn, now - 1000);
  tracker.observe({ socPct: 53, battW: -291 }, targetSn, now);
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_battery, 53);
  assert.equal(h.device.values.measure_power, -291);
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 123);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 456);
  await h.legacy({ accuChgEnergy: 110, accuDsgEnergy: 220 });
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 123.01);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 456.02);
  await h.device.onTeardown();
});

test('slow Homey writes coalesce ticks and cannot publish stale availability or trigger crossings', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy(); await h.enable();
  let fields = { socPct: { value: 53, ageSec: 0, stale: false }, batteryW: { value: 400, ageSec: 0, stale: false } };
  h.monitor.getSystemReporterDiagnostics = () => fields;
  let started; let finish; let writes = 0;
  const writing = new Promise(resolve => { started = resolve; });
  const write = h.device.setCapabilityValue.bind(h.device);
  h.device.setCapabilityValue = async (cap, value) => {
    if (cap === 'measure_power') { writes++; await new Promise(resolve => { finish = resolve; started(); }); }
    await write(cap, value);
  };
  const refresh = h.device.refreshMonitoringTrial();
  await writing;
  await Promise.all(Array.from({ length: 50 }, () => h.device.refreshMonitoringTrial()));
  assert.equal(writes, 1);
  assert.equal(h.device.getMonitoringTrialDiagnostics().coalescedLocalTicks, 50);
  const triggerCount = h.triggers.length;
  fields = { socPct: { value: 53, ageSec: 181, stale: true }, batteryW: { value: 400, ageSec: 181, stale: true } };
  finish(); await refresh;
  assert.equal(h.device.getAvailable(), false);
  assert.equal(h.triggers.length, triggerCount);
  assert.equal(h.device.isCharging(), false);
  h.device.setCapabilityValue = write;
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, null);
  await h.device.onTeardown();
});

test('readiness and session event history explain the trial without mutating the reporter or exposing identity', async (t) => {
  const h = await deviceHarness(t);
  await h.legacy();
  assert.equal(h.device.getMonitoringTrialDiagnostics().readiness.eligible, false);
  assert.equal(h.reads(), 0);
  await h.device.refreshReporterDiagnostics();
  assert.equal(h.device.getMonitoringTrialDiagnostics().readiness.eligible, true);
  await h.enable();
  let snap = h.device.getMonitoringTrialDiagnostics();
  assert.equal(snap.status, 'active'); assert.equal(snap.readiness.eligible, false);
  assert.equal(snap.readiness.eligibilityScope, 'activation_only');
  assert.ok(snap.timeline.events.some(event => event.event === 'trial_enabled'));
  assert.ok(!JSON.stringify(snap).match(/PRIVATE|SYNTHETIC/));
  await h.device.onSettingsChanged({ use_5000_reporter_trial: false }, ['use_5000_reporter_trial']);
  await h.legacy();
  snap = h.device.getMonitoringTrialDiagnostics();
  assert.ok(snap.timeline.events.some(event => event.event === 'rollback_started'));
  assert.ok(snap.timeline.events.some(event => event.event === 'rollback_complete'));
  await h.device.onTeardown();
});

test('mixed-generation zero legacy readings, two peers and disagreeing grid sources preserve trial boundaries across restart', async (t) => {
  const h = await deviceHarness(t, { chargedWh: 100000, dischargedWh: 200000,
    chargedRawWh: 1000, dischargedRawWh: 2000, countersAvailable: true });
  let topology = new Es22TopologyTracker(targetSn);
  let observations = new StreamReporterObservations();
  const receive = () => {
    const at = Date.now();
    topology.observe({ socPct: 61, unitRecordCount: 3, unitsBySn: {
      [oldSn]: { socPct: 61.2, batteryPowerRawW: -200 },
      BK31SYNTHETIC: { socPct: 60.2, batteryPowerRawW: 0 },
    } }, at);
    observations.observe({ socPct: 61, battW: -372, homeW: 343,
      batteryFlowEdges: { batteryToHomeW: 343, batteryToGridW: 29 },
      gridImportPowerW: 0, gridExportPowerW: 29 }, targetSn, at);
    observations.observe({ gridW: -5 }, targetSn, at);
  };
  h.monitor.getTopologyEvidence = () => topology.evidence();
  h.monitor.getSystemReporterDiagnostics = () => observations.snapshot(Date.now());
  h.monitor.getSystemFlowDiagnostics = () => observations.flowSnapshot(Date.now());
  receive();
  await h.legacy({ accuChgEnergy: 1000, accuDsgEnergy: 2000 });
  await h.enable();
  const report = createSupportSnapshot(h.homey);
  const original = report.drivers.find(d => d.id === 'stream');
  const donor = report.drivers.find(d => d.id === 'stream_5000_unit');
  assert.equal(original.reporting[0].observations.measure_power.value, 0);
  assert.equal(original.reporting[0].currentReadings.measure_power, -372);
  assert.equal(original.reporting[0].currentReadings.measure_battery, 61);
  for (const cap of ['measure_power.pv', 'measure_power.grid', 'measure_power.load']) {
    assert.equal(original.reporting[0].currentReadings[cap], null);
  }
  assert.equal(donor.topology[0].freshPeerCount, 2);
  assert.equal(donor.topology[0].peerVisibility[0].readings.batteryPowerRawW.value, -200);
  assert.equal(donor.systemFlow[0].fields.gridMeterW.value, -5);
  assert.equal(donor.systemFlow[0].fields.gridFlowNetW.value, -29);
  assert.equal(donor.systemFlow[0].meterMinusFlowW, 24);
  assert.equal(donor.systemFlow[0].accountingUsed, false);
  assert.equal(original.monitoringTrial[0].status, 'active');
  assert.equal(original.monitoringTrial[0].readiness.eligibilityScope, 'activation_only');
  await h.legacy({ accuChgEnergy: 1100, accuDsgEnergy: 2100 });
  assert.equal(h.device.getEnergyDiagnostics().chargedKWh, 100.1);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 200.1);
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 200.1);
  await assert.rejects(h.device.flowSetChargeLimit(80), /controls are disabled/);
  assert.ok(!JSON.stringify(report).match(/SYNTHETIC|PRIVATE/));
  await h.device.onTeardown();
  topology = new Es22TopologyTracker(targetSn);
  observations = new StreamReporterObservations();
  await h.device.onReady();
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, null, 'restart cannot restore cached donor data');
  assert.equal(h.device.getAvailable(), false);
  receive();
  await h.device.refreshMonitoringTrial();
  assert.equal(h.device.values.measure_power, -372);
  assert.equal(h.device.getEnergyDiagnostics().dischargedKWh, 200.1);
  assert.equal(h.device.getReadSn(), oldSn);
  await h.device.onTeardown();
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const legacyContract = require('./fixtures/legacy-flow-v1.10.54-contract.json');
const { LegacyFlowReadings, LEGACY_FLOW_TTL_MS } = require('../.homeybuild/lib/legacyFlowReadings');
const { ForecastFlowReadings, FORECAST_FLOW_TTL_MS, localForecastDay } = require('../.homeybuild/lib/forecastFlowReadings');
const weather = require('../.homeybuild/lib/solarForecast');

class FakeDevice {
  constructor() {
    this.values = {}; this.settings = { solar_forecast: false, solar_factor: 0.67, enable_history: false };
    this.store = { chargedWh: 120, dischargedWh: 340 }; this.available = true;
    this.caps = new Set(['measure_battery', 'measure_power', 'battery_charging_state', 'measure_power.pv', 'measure_power.grid',
      'measure_power.load', 'operating_mode', 'feed_in_control', 'meter_power.charged', 'meter_power.discharged']);
  }
  getData() { return { sn: 'BK61SYNTHETIC' }; }
  getSetting(key) { return this.settings[key]; }
  getStoreValue(key) { return this.store[key]; }
  async setStoreValue(key, value) { this.store[key] = value; }
  hasCapability(key) { return this.caps.has(key); }
  getCapabilityValue(key) { return this.values[key]; }
  async setCapabilityValue(key, value) { this.values[key] = value; }
  async addCapability(key) { this.caps.add(key); }
  async removeCapability(key) { this.caps.delete(key); delete this.values[key]; }
  getAvailable() { return this.available; }
  async setAvailable() { this.available = true; }
  async setUnavailable() { this.available = false; }
  registerCapabilityListener() {}
  error() {}
}
const load = Module._load; let StreamDevice, StreamDriver;
try {
  Module._load = function(request, ...args) { if (request === 'homey') return { Device: FakeDevice, Driver: class { log() {} } }; return load.call(this, request, ...args); };
  StreamDevice = require('../.homeybuild/drivers/stream/device'); StreamDriver = require('../.homeybuild/drivers/stream/driver');
} finally { Module._load = load; }

const baseQuota = { cmsBattSoc: 60, powGetBpCms: 100, powGetPvSum: 500, powGetSysLoad: 200, powGetSysGrid: -200,
  feedGridMode: 2, 'energyStrategyOperateMode.operateSelfPoweredOpen': true };
async function harness(t) {
  let now = Date.parse('2026-10-17T11:00:00Z'); t.mock.method(Date, 'now', () => now);
  let timeZone = 'Europe/London', latitude = 51.5;
  const device = new StreamDevice(), listeners = {}, timers = new Map(), events = []; let nextTimer = 0;
  const card = id => ({ registerRunListener: fn => { listeners[id] = fn; }, trigger: async (_device, tokens, state) => { events.push({ id, tokens, state }); } });
  const homey = { flow: { getConditionCard: card, getActionCard: card, getDeviceTriggerCard: card },
    clock: { getTimezone: () => timeZone }, geolocation: { getLatitude: () => latitude, getLongitude: () => -0.12 },
    setInterval: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearInterval: id => timers.delete(id),
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
  };
  device.homey = homey; await device.onReady(); const driver = new StreamDriver(); driver.homey = homey; await driver.onInit();
  return { device, listeners, timers, events, now: () => now, setTime: value => { now = value; }, setZone: value => { timeZone = value; },
    setLatitude: value => { latitude = value; },
    apply: quota => device.applyQuota(quota, { receivedAt: now, source: 'mqtt' }),
    evaluate: (id, extra = {}) => listeners[id]({ device, ...extra }),
    dated: (today = 10, tomorrow = 20) => ({ today, tomorrow, dates: [localForecastDay(now, timeZone), localForecastDay(now, timeZone, 1)], timeZone }),
  };
}

test('all original observation cards reject missing persisted values, including inverted conditions', async t => {
  const h = await harness(t);
  const cards = { is_charging: {}, is_exporting: {}, solar_power_above: { watts: 100 }, solar_power_below: { watts: 100 },
    charging_from_solar: {}, battery_soc: { direction: 'above', level: 50 }, operating_mode_is: { mode: 'self_powered' }, feed_in_enabled: {} };
  Object.assign(h.device.values, { measure_battery: 60, measure_power: 100, 'measure_power.pv': 500, 'measure_power.load': 200,
    'measure_power.grid': -200, operating_mode: 'self_powered', feed_in_control: true });
  for (const [id, args] of Object.entries(cards)) {
    assert.throws(() => h.evaluate(id, args), /readings/i, id); assert.throws(() => !h.evaluate(id, args), /readings/i, 'inverted ' + id);
  }
  await h.apply(baseQuota);
  for (const [id, args] of Object.entries(cards)) assert.equal(typeof h.evaluate(id, args), 'boolean', id);
  await h.device.onTeardown();
});

test('same-value receipts and true zero remain valid; unrelated packets never renew SOC, mode or grid', async t => {
  const h = await harness(t); await h.apply({ ...baseQuota, cmsBattSoc: 0, powGetBpCms: 0, powGetPvSum: 0, powGetSysGrid: 0 });
  assert.equal(h.evaluate('is_charging'), false); assert.equal(h.evaluate('is_exporting'), false);
  assert.equal(h.evaluate('battery_soc', { direction: 'below', level: 1 }), true);
  assert.equal(h.evaluate('solar_power_below', { watts: 1 }), true);
  h.setTime(h.now() + LEGACY_FLOW_TTL_MS - 1); await h.apply({ powGetPvSum: 0 });
  h.setTime(h.now() + 1);
  assert.equal(h.evaluate('solar_power_below', { watts: 1 }), true);
  for (const [id, args] of [['is_charging', {}], ['is_exporting', {}], ['battery_soc', { direction: 'below', level: 1 }],
    ['operating_mode_is', { mode: 'self_powered' }], ['feed_in_enabled', {}]]) assert.throws(() => h.evaluate(id, args), /readings/i);
  await h.device.onTeardown();
});

test('solar observation requires actual load and coherent timestamps and never manufactures zero', async t => {
  const h = await harness(t); const quota = { ...baseQuota }; delete quota.powGetSysLoad;
  await h.apply(quota); assert.throws(() => h.evaluate('charging_from_solar'), /readings/i);
  assert.equal(h.device.isChargingFromSolar(), false);
  h.setTime(h.now() + 5001); await h.apply({ powGetSysLoad: 0 });
  assert.throws(() => h.evaluate('charging_from_solar'), /coherent/i);
  await h.apply({ powGetBpCms: 100, powGetPvSum: 500, powGetSysLoad: 0 });
  assert.equal(h.evaluate('charging_from_solar'), true);
  await h.apply({ powGetBpCms: -100 }); assert.equal(h.evaluate('charging_from_solar'), false);
  await h.device.onTeardown();
});

test('failed capability application and SDK-only changes cannot qualify an old observation', async t => {
  const h = await harness(t); await h.apply(baseQuota);
  h.device.values.measure_battery = 90;
  assert.throws(() => h.evaluate('battery_soc', { direction: 'above', level: 50 }), /readings/i);
  const write = h.device.setCapabilityValue.bind(h.device);
  h.device.setCapabilityValue = async (cap, value) => { if (cap === 'measure_power') throw new Error('PRIVATE'); await write(cap, value); };
  await h.apply({ powGetBpCms: 200 }); assert.throws(() => h.evaluate('is_charging'), /readings/i);
  h.device.setCapabilityValue = write; await h.apply({ cmsBattSoc: 60, powGetBpCms: 100 });
  assert.equal(h.evaluate('is_charging'), true); await h.device.onTeardown();
});

test('offline/reconnect resets receipt and trigger baselines; teardown or clock rollback cannot reuse them', async t => {
  const h = await harness(t); await h.apply(baseQuota); h.events.length = 0;
  await h.device.setOnlineState(false); assert.throws(() => h.evaluate('is_charging'), /readings/i);
  await h.device.setOnlineState(true); assert.throws(() => h.evaluate('is_charging'), /readings/i);
  await h.apply({ ...baseQuota, powGetBpCms: -500, powGetSysGrid: 500, cmsBattSoc: 10,
    'energyStrategyOperateMode.operateSelfPoweredOpen': false, 'energyStrategyOperateMode.operateTouModeOpen': true });
  assert.equal(h.events.some(e => ['charging_started', 'discharging_started', 'grid_import_started', 'grid_export_started', 'battery_level_crossed', 'operating_mode_changed'].includes(e.id)), false);
  assert.equal(h.evaluate('is_charging'), false); h.setTime(h.now() - 1);
  assert.throws(() => h.evaluate('is_charging'), /readings/i); await h.device.onTeardown();
  assert.equal(h.timers.size, 0); assert.throws(() => h.evaluate('is_charging'), /readings/i);
});

test('legacy receipt helper rejects invalid, future, mismatched and out-of-order observations', () => {
  const fields = new LegacyFlowReadings(); let current = 50;
  fields.observe('measure_battery', current, current, 100000, 100000);
  fields.observe('measure_battery', 10, 10, 99999, 100000);
  fields.assert(['measure_battery'], () => current, false, 100001);
  for (const value of [NaN, Infinity, -1, 101, null, '50']) {
    fields.observe('measure_battery', value, value, 100001, 100001);
    assert.throws(() => fields.assert(['measure_battery'], () => value, false, 100001), /unavailable/);
  }
  fields.observe('measure_battery', 50, 50, 200000, 100001);
  assert.throws(() => fields.assert(['measure_battery'], () => current, false, 100001), /unavailable/);
});

const eventMode = mode => ({ [`energyStrategyOperateMode.${mode === 'tou' ? 'operateTouModeOpen' : 'operateSelfPoweredOpen'}`]: true });
const observationEvents = h => h.events.filter(e => ['battery_level_crossed', 'operating_mode_changed'].includes(e.id));

test('SOC/mode events: SDK rejection breaks only the rejected field and recovery is silent', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') });
  const write = h.device.setCapabilityValue.bind(h.device); let failed = 'measure_battery';
  h.device.setCapabilityValue = async (cap, value) => { if (cap === failed) throw new Error('synthetic rejection'); await write(cap, value); };
  h.events.length = 0; await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['operating_mode_changed']);
  failed = 'operating_mode'; h.events.length = 0;
  await h.apply({ cmsBattSoc: 70, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h), [], 'SOC recovery and failed mode are silent');
  h.device.setCapabilityValue = write;
  await h.apply({ cmsBattSoc: 80, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['battery_level_crossed']);
  h.events.length = 0; await h.apply({ cmsBattSoc: 90, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h).map(e => e.id).sort(), ['battery_level_crossed', 'operating_mode_changed']);
  await h.device.onTeardown();
});

test('SOC/mode events: successful but SDK-mismatching reports break continuity, including equal cached recovery', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  const write = h.device.setCapabilityValue.bind(h.device);
  h.device.setCapabilityValue = async () => {};
  await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h), []);
  h.device.setCapabilityValue = write;
  await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h), [], 'same cached successful report establishes recovery');
  await h.apply({ cmsBattSoc: 50, ...eventMode('tou') });
  assert.equal(observationEvents(h).length, 2);
  await h.device.onTeardown();
});

test('SOC/mode events: exact field TTL expires despite unrelated fresh power; recovery never infers a crossing', async t => {
  const h = await harness(t); await h.apply({ ...baseQuota, cmsBattSoc: 40 });
  h.events.length = 0; h.setTime(h.now() + LEGACY_FLOW_TTL_MS - 1);
  await h.apply({ powGetBpCms: 100, ...eventMode('self_powered') });
  h.setTime(h.now() + 1); await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['operating_mode_changed'], 'only renewed mode is continuous');
  h.events.length = 0; h.setTime(h.now() + LEGACY_FLOW_TTL_MS - 1);
  await h.apply({ powGetBpCms: 100, cmsBattSoc: 60 });
  h.setTime(h.now() + 1); await h.apply({ cmsBattSoc: 50, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['battery_level_crossed'], 'only renewed SOC is continuous');
  await h.device.onTeardown();
});

test('SOC/mode events: repeated successful values renew their own baseline without duplicate events', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  for (let i = 0; i < 3; i++) {
    h.setTime(h.now() + LEGACY_FLOW_TTL_MS - 1);
    await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') });
  }
  assert.deepEqual(observationEvents(h), []);
  h.setTime(h.now() + 1); await h.apply({ cmsBattSoc: 50, ...eventMode('tou') });
  await h.apply({ cmsBattSoc: 50, ...eventMode('tou') });
  const events = observationEvents(h);
  assert.equal(events.length, 2);
  assert.deepEqual(events.find(e => e.id === 'battery_level_crossed'), {
    id: 'battery_level_crossed', tokens: { battery: 50 }, state: { soc: 50, prevSoc: 40 },
  });
  assert.deepEqual(events.find(e => e.id === 'operating_mode_changed').tokens, { mode: 'tou' });
  await h.device.onTeardown();
});

test('SOC/mode events: stale, future and out-of-order reports break continuity without emission or replay', async t => {
  const h = await harness(t);
  for (const kind of ['stale', 'future', 'out_of_order']) {
    await h.device.setOnlineState(false); await h.device.setOnlineState(true);
    await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') });
    const baselineAt = h.now(); h.setTime(h.now() + 10); h.events.length = 0;
    const at = kind === 'stale' ? h.now() - LEGACY_FLOW_TTL_MS : kind === 'future' ? h.now() + 1 : baselineAt - 1;
    await h.device.applyQuota({ cmsBattSoc: 60, ...eventMode('tou') }, { receivedAt: at, source: 'mqtt' });
    assert.deepEqual(observationEvents(h), [], kind);
    await h.apply({ cmsBattSoc: 70, ...eventMode('tou') });
    assert.deepEqual(observationEvents(h), [], kind + ' silent recovery');
    await h.apply({ cmsBattSoc: 80, ...eventMode('self_powered') });
    assert.equal(observationEvents(h).length, 2, kind + ' continuous change');
  }
  await h.device.onTeardown();
});

test('SOC/mode events: malformed SOC and ambiguous mode break independent continuity', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  await h.apply({ cmsBattSoc: 'invalid', ...eventMode('tou') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['operating_mode_changed']);
  h.events.length = 0;
  await h.apply({ cmsBattSoc: 60, ...eventMode('self_powered'), ...eventMode('tou') });
  assert.deepEqual(observationEvents(h), []);
  await h.apply({ cmsBattSoc: 70, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['battery_level_crossed']);
  await h.device.onTeardown();
});

for (const field of ['SOC', 'mode']) {
  test(`SOC/mode events: malformed ${field} watermark prevents rollback from seeding a false recovery`, async t => {
    const h = await harness(t);
    const start = h.now();
    try {
      await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') });
      h.setTime(start + 100);
      await h.apply(field === 'SOC' ? { cmsBattSoc: 'invalid', ...eventMode('tou') }
        : { cmsBattSoc: 41, ...eventMode('self_powered'), ...eventMode('tou') });
      assert.deepEqual(observationEvents(h).map(e => e.id),
        [field === 'SOC' ? 'operating_mode_changed' : 'battery_level_crossed']);
      h.events.length = 0;
      h.setTime(start + 50);
      await h.apply(field === 'SOC' ? { cmsBattSoc: 60 } : eventMode('tou'));
      h.setTime(start + 101);
      await h.apply(field === 'SOC' ? { cmsBattSoc: 70 } : eventMode('self_powered'));
      assert.deepEqual(observationEvents(h), []);
      h.setTime(start + 102);
      await h.apply(field === 'SOC' ? { cmsBattSoc: 80 } : eventMode('tou'));
      assert.deepEqual(observationEvents(h).map(e => e.id),
        [field === 'SOC' ? 'battery_level_crossed' : 'operating_mode_changed']);
    } finally {
      await h.device.onTeardown();
    }
  });
}

test('SOC/mode events: foreign source reports break only their reported field', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  await h.device.applyQuota({ cmsBattSoc: 60 }, { receivedAt: h.now(), source: 'mqtt', sourceSn: 'SYNTHETIC_OTHER' });
  assert.deepEqual(observationEvents(h), []);
  await h.apply({ cmsBattSoc: 70, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h).map(e => e.id), ['operating_mode_changed']);
  await h.device.onTeardown();
});

test('SOC/mode events: session reset during SDK await cannot emit or seed the new session', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  const write = h.device.setCapabilityValue.bind(h.device); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.device.setCapabilityValue = async (cap, value) => {
    if (cap === 'measure_battery') { entered(); await new Promise(resolve => { release = resolve; }); }
    await write(cap, value);
  };
  const pending = h.apply({ cmsBattSoc: 60, ...eventMode('tou') }); await started;
  await h.device.setOnlineState(false); await h.device.setOnlineState(true);
  release(); await pending;
  assert.deepEqual(observationEvents(h), []);
  h.device.setCapabilityValue = write;
  await h.apply({ cmsBattSoc: 70, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h), []);
  await h.apply({ cmsBattSoc: 80, ...eventMode('tou') });
  assert.equal(observationEvents(h).length, 2);
  await h.device.onTeardown();
});

test('SOC/mode events: observation expiring during SDK await is silent and recovery is a baseline', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  const write = h.device.setCapabilityValue.bind(h.device); let advanced = false;
  h.device.setCapabilityValue = async (cap, value) => {
    if (!advanced && cap === 'measure_battery') { advanced = true; h.setTime(h.now() + LEGACY_FLOW_TTL_MS); }
    await write(cap, value);
  };
  await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h), []);
  h.device.setCapabilityValue = write; await h.apply({ cmsBattSoc: 70, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h), []);
  await h.apply({ cmsBattSoc: 80, ...eventMode('self_powered') });
  assert.equal(observationEvents(h).length, 2); await h.device.onTeardown();
});

test('SOC/mode events: genuine crossings keep exact equality and direction semantics', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  const matches = (event, direction, level) => h.listeners.battery_level_crossed({ direction, level }, event.state);
  await h.apply({ cmsBattSoc: 50 }); const up = observationEvents(h).at(-1);
  assert.equal(matches(up, 'above', 50), true); assert.equal(matches(up, 'below', 50), false);
  await h.apply({ cmsBattSoc: 60 }); const fromEqual = observationEvents(h).at(-1);
  assert.equal(matches(fromEqual, 'above', 50), false);
  await h.apply({ cmsBattSoc: 50 }); const down = observationEvents(h).at(-1);
  assert.equal(matches(down, 'below', 50), true); assert.equal(matches(down, 'above', 50), false);
  await h.apply({ cmsBattSoc: 40 }); assert.equal(matches(observationEvents(h).at(-1), 'below', 50), false);
  await h.device.onTeardown();
});

test('SOC/mode events: a superseded generation cannot renew an equal-value baseline during quota application', async t => {
  const h = await harness(t);
  for (const generation of ['lifecycleGeneration', 'monitoringSession', 'monitoringGeneration']) {
    await h.device.setOnlineState(false); await h.device.setOnlineState(true);
    await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
    const remaining = h.device.applyRemainingTime.bind(h.device); let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    h.device.applyRemainingTime = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
    const pending = h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); await started;
    h.device[generation] += 1; release(); await pending;
    assert.deepEqual(observationEvents(h), [], generation);
    h.device.applyRemainingTime = remaining;
    await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
    assert.deepEqual(observationEvents(h), [], generation + ' silent recovery');
    await h.apply({ cmsBattSoc: 70, ...eventMode('self_powered') });
    assert.equal(observationEvents(h).length, 2, generation + ' continuous change');
  }
  await h.device.onTeardown();
});

test('SOC/mode events: clock rollback breaks continuity and rejected replay cannot seed recovery', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  const original = h.now(); h.setTime(original - 1);
  await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
  await h.apply({ cmsBattSoc: 70, ...eventMode('self_powered') });
  assert.deepEqual(observationEvents(h), []);
  h.setTime(original + 1); await h.apply({ cmsBattSoc: 80, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h), []);
  await h.apply({ cmsBattSoc: 90, ...eventMode('self_powered') });
  assert.equal(observationEvents(h).length, 2); await h.device.onTeardown();
});

test('SOC/mode events: independent SDK-only cache changes cannot bridge an unobserved transition', async t => {
  const h = await harness(t); await h.apply({ cmsBattSoc: 40, ...eventMode('self_powered') }); h.events.length = 0;
  h.device.values.measure_battery = 90; h.device.values.operating_mode = 'tou';
  await h.apply({ cmsBattSoc: 60, ...eventMode('tou') });
  assert.deepEqual(observationEvents(h), []);
  await h.apply({ cmsBattSoc: 70, ...eventMode('self_powered') });
  assert.equal(observationEvents(h).length, 2); await h.device.onTeardown();
});

test('invalid comparison directions and non-finite or out-of-range thresholds reject rather than invert', async t => {
  const h = await harness(t); await h.apply(baseQuota);
  for (const [id, args] of [['battery_soc', { direction: 'sideways', level: 50 }], ['battery_soc', { direction: 'above', level: NaN }],
    ['battery_soc', { direction: 'below', level: 101 }], ['solar_power_above', { watts: '100' }], ['solar_power_below', { watts: -1 }], ['solar_power_above', { watts: 10001 }],
    ['operating_mode_is', { mode: 'unverified' }]]) assert.throws(() => h.evaluate(id, args), /supported comparison/i);
  await h.device.onTeardown();
});

test('ambiguous or invalid reported settings invalidate prior mode/feed observations without treating them as off', async t => {
  const h = await harness(t); await h.apply(baseQuota);
  assert.equal(h.evaluate('operating_mode_is', { mode: 'self_powered' }), true);
  assert.equal(h.evaluate('feed_in_enabled'), true);
  await h.apply({ 'energyStrategyOperateMode.operateSelfPoweredOpen': true, 'energyStrategyOperateMode.operateTouModeOpen': true, feedGridMode: 3 });
  assert.throws(() => !h.evaluate('operating_mode_is', { mode: 'self_powered' }), /readings/i);
  assert.throws(() => !h.evaluate('feed_in_enabled'), /readings/i);
  await h.apply({ 'energyStrategyOperateMode.operateSelfPoweredOpen': true, feedGridMode: 1 });
  assert.equal(h.evaluate('operating_mode_is', { mode: 'self_powered' }), true); assert.equal(h.evaluate('feed_in_enabled'), false);
  await h.device.onTeardown();
});

test('forecast provider dates/timezone are validated and Homey timezone is requested explicitly', async t => {
  const h = await harness(t); h.device.settings.solar_forecast = true; let calls = 0;
  t.mock.method(weather, 'fetchSolarRadiation', async (_lat, _lon, _json, zone) => { calls++; assert.equal(zone, 'Europe/London'); return h.dated(0, 20); });
  await h.device.refreshSolarForecast(); assert.equal(calls, 1);
  assert.equal(h.evaluate('solar_forecast_today', { direction: 'below', kwh: 1 }), true);
  assert.equal(h.evaluate('solar_forecast_tomorrow', { direction: 'above', kwh: 1 }), true);
  h.setTime(h.now() + FORECAST_FLOW_TTL_MS); assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.onTeardown();
});

test('forecast stale dates, missing days, malformed provider data and write failure cannot bless cache', async t => {
  const h = await harness(t); h.device.settings.solar_forecast = true; let response = h.dated();
  t.mock.method(weather, 'fetchSolarRadiation', async () => response);
  await h.device.refreshSolarForecast();
  for (const bad of [{ today: 10, tomorrow: 20 }, { ...h.dated(), timeZone: 'UTC' },
    { ...h.dated(), dates: ['2026-10-16', '2026-10-17'] }, { ...h.dated(), today: null }, { ...h.dated(), today: -1 }]) {
    response = bad; await h.device.refreshSolarForecast();
    assert.throws(() => !h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
    assert.equal(h.device.values.solar_forecast_today, null);
  }
  response = h.dated(); const write = h.device.setCapabilityValue.bind(h.device);
  h.device.setCapabilityValue = async (cap, value) => { if (cap === 'solar_forecast_today') throw new Error('PRIVATE'); await write(cap, value); };
  await h.device.refreshSolarForecast(); assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  h.device.setCapabilityValue = write; await h.device.onTeardown();
});

test('midnight, location/calibration/timezone changes and process restart cannot reuse yesterday forecasts', async t => {
  const h = await harness(t); h.device.settings.solar_forecast = true;
  t.mock.method(weather, 'fetchSolarRadiation', async () => h.dated());
  h.setTime(Date.parse('2026-10-17T22:59:50Z')); await h.device.refreshSolarForecast();
  assert.equal(h.evaluate('solar_forecast_tomorrow', { direction: 'above', kwh: 1 }), true);
  h.setTime(Date.parse('2026-10-17T23:00:00Z'));
  for (const id of ['solar_forecast_today', 'solar_forecast_tomorrow']) assert.throws(() => h.evaluate(id, { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.refreshSolarForecast(); h.device.settings.solar_factor = 1;
  assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.refreshSolarForecast(); h.setLatitude(52);
  assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.refreshSolarForecast(); h.setZone('UTC');
  assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.onTeardown(); assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
});

test('network failures do not renew forecast age; fetches coalesce and late results after disable are ignored', async t => {
  const h = await harness(t); h.device.settings.solar_forecast = true; let release, calls = 0;
  t.mock.method(weather, 'fetchSolarRadiation', () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const one = h.device.refreshSolarForecast(), two = h.device.refreshSolarForecast(); assert.equal(calls, 1);
  h.device.stopSolarForecast(true); release(h.dated()); await Promise.all([one, two]);
  assert.equal(h.device.hasCapability('solar_forecast_today'), false);
  assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  t.mock.method(weather, 'fetchSolarRadiation', async () => h.dated()); await h.device.refreshSolarForecast();
  h.setTime(h.now() + FORECAST_FLOW_TTL_MS);
  t.mock.method(weather, 'fetchSolarRadiation', async () => { throw new Error('PRIVATE'); });
  await assert.rejects(h.device.refreshSolarForecast());
  assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.onTeardown();
});

test('forecast configuration waits for SDK commit and never restarts after a later disable or teardown', async t => {
  const h = await harness(t); let calls = 0;
  t.mock.method(weather, 'fetchSolarRadiation', async () => { calls++; return h.dated(); });
  await h.device.onSettingsChanged({ solar_forecast: true, solar_factor: 1 }, ['solar_forecast', 'solar_factor']);
  const fire = () => { const id = h.device.forecastSettingsTimer; const timer = h.timers.get(id); h.timers.delete(id); timer.fn(); };
  fire(); assert.equal(calls, 0, 'old SDK settings must not initiate a fetch');
  h.device.settings.solar_forecast = true; h.device.settings.solar_factor = 1;
  fire(); await h.device.forecastPending;
  assert.equal(calls, 1); assert.equal(h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), true);
  await h.device.onSettingsChanged({ solar_forecast: true, solar_factor: 2 }, ['solar_factor']);
  assert.throws(() => h.evaluate('solar_forecast_today', { direction: 'above', kwh: 1 }), /forecast/i);
  await h.device.onSettingsChanged({ solar_forecast: false, solar_factor: 2 }, ['solar_forecast']);
  assert.equal(h.device.forecastSettingsTimer, null); assert.equal(calls, 1);
  await h.device.onTeardown(); assert.equal(h.timers.size, 0);
});

test('forecast calendar arithmetic follows Homey timezone over DST and handles a valid zero forecast', () => {
  assert.equal(localForecastDay(Date.parse('2026-10-24T23:30:00Z'), 'Europe/London'), '2026-10-25');
  assert.equal(localForecastDay(Date.parse('2026-10-24T23:30:00Z'), 'Europe/London', 1), '2026-10-26');
  const fields = new ForecastFlowReadings(), now = Date.parse('2026-10-25T12:00:00Z');
  fields.observe('solar_forecast_today', 0, 0, now, '2026-10-25', 'Europe/London', 'synthetic', now);
  fields.assert('solar_forecast_today', 0, 'Europe/London', 'synthetic', now);
  assert.throws(() => fields.assert('solar_forecast_today', 0, 'Europe/London', 'synthetic', now - 1), /unavailable/);
  assert.throws(() => fields.assert('solar_forecast_today', 0, 'Europe/London', 'other', now), /unavailable/);
});

test('legacy IDs, arguments and tokens are preserved, with only additive qualified CT1 eligibility', () => {
  const root = path.join(__dirname, '..');
  const before = legacyContract;
  const strip = card => Object.fromEntries(Object.entries(card).filter(([key]) => !['title', 'titleFormatted', 'hint'].includes(key)));
  for (const [kind, cards] of Object.entries(before.flow)) for (const old of cards) {
    const filename = path.join(root, '.homeycompose', 'flow', kind, old.id + '.json');
    assert.equal(fs.existsSync(filename), true, old.id);
    const current = JSON.parse(fs.readFileSync(filename));
    const expected = structuredClone(old);
    if (old.id === 'smartmeter_grid_power_above') expected.args[0].filter = 'driver_id=smartmeter|smartmeter_dual_ct_energy';
    assert.deepEqual(strip(current), strip(expected), old.id);
  }
});

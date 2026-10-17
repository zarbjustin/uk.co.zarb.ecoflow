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
  const card = id => ({ registerRunListener: fn => { listeners[id] = fn; }, trigger: async (_device, tokens) => { events.push({ id, tokens }); } });
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

test('wording changes preserve all legacy IDs, arguments, filters, dropdown values and tokens exactly', () => {
  const root = path.join(__dirname, '..');
  const before = legacyContract;
  const strip = card => Object.fromEntries(Object.entries(card).filter(([key]) => !['title', 'titleFormatted', 'hint'].includes(key)));
  for (const [kind, cards] of Object.entries(before.flow)) for (const old of cards) {
    const filename = path.join(root, '.homeycompose', 'flow', kind, old.id + '.json');
    assert.equal(fs.existsSync(filename), true, old.id);
    const current = JSON.parse(fs.readFileSync(filename)); assert.deepEqual(strip(current), strip(old), old.id);
  }
});

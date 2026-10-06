'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { StreamControlFailure } = require('../.homeybuild/lib/streamControls');
const { PRICE_MAX_AGE_MS } = require('../.homeybuild/lib/automationSafety');

const MAIN = 'BK61CONTROLMAIN1';
const MEMBER = 'BK61CONTROLMEMBER';
const normal = { cmsMaxChgSoc: 80, cmsMinDsgSoc: 10, backupReverseSoc: 20, feedGridMode: 1,
  'energyStrategyOperateMode.operateSelfPoweredOpen': true };
class FakeDevice {
  constructor() {
    this.store = { mainSn: MAIN };
    this.values = {};
    this.capabilities = new Set(['charge_limit', 'discharge_limit', 'backup_reserve_soc', 'feed_in_control', 'operating_mode',
      'meter_power.charged', 'meter_power.discharged']);
    this.listeners = {};
    this.timers = new Map();
    this.nextTimer = 0;
    this.autoWait = true;
    this.warnings = [];
  }
  getData() { return { sn: MEMBER }; }
  getSetting() { return false; }
  getStoreValue(key) { return this.store[key]; }
  hasCapability(key) { return this.capabilities.has(key); }
  getCapabilityValue(key) { return this.values[key]; }
  async setCapabilityValue(key, value) { this.values[key] = value; }
  async addCapability(key) { this.capabilities.add(key); }
  async setCapabilityOptions() {}
  async setStoreValue(key, value) { this.store[key] = value; }
  async setWarning(message) { this.warnings.push(message); }
  registerCapabilityListener(key, callback) { this.listeners[key] = callback; }
  error(...args) { throw new Error(args.join(' ')); }
}

const originalLoad = Module._load;
let StreamDevice;
let StreamDriver;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice, Driver: class { log() {} } };
    return originalLoad.call(this, request, ...args);
  };
  StreamDevice = require('../.homeybuild/drivers/stream/device');
  StreamDriver = require('../.homeybuild/drivers/stream/driver');
} finally { Module._load = originalLoad; }

test('registered price condition cards use session freshness and propagate stale-price errors', async () => {
  const listeners = {};
  const driver = new StreamDriver();
  const card = (id) => ({ registerRunListener: (callback) => { listeners[id] = callback; } });
  driver.homey = { flow: { getConditionCard: card, getActionCard: card, getDeviceTriggerCard: card } };
  await driver.onInit();
  const h = await harness();
  h.device.values.tariff_price_now = -5;
  assert.throws(() => listeners.electricity_price({ device: h.device, direction: 'below', price: 10 }), /price/i);
  assert.throws(() => listeners.electricity_price_negative({ device: h.device }), /price/i);
  await h.device.flowSetElectricityPrice(-5);
  assert.equal(listeners.electricity_price({ device: h.device, direction: 'below', price: 10 }), true);
  assert.equal(listeners.electricity_price_negative({ device: h.device }), true);
  h.device.priceUpdatedAt = Date.now() - PRICE_MAX_AGE_MS - 1;
  assert.throws(() => listeners.electricity_price({ device: h.device, direction: 'above', price: 10 }), /price/i);
  assert.throws(() => listeners.electricity_price_negative({ device: h.device }), /price/i);
  await h.device.onTeardown();
});

test('safety Flow metadata keeps installation filters and translated policy/freshness hints', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', '.homeycompose', 'flow');
  for (const [type, id] of [
    ['actions', 'prepare_for_cheap_import'], ['actions', 'prepare_for_peak_export'],
    ['actions', 'release_for_export'], ['actions', 'set_electricity_price'],
    ['conditions', 'electricity_price'], ['conditions', 'electricity_price_negative'],
  ]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, type, `${id}.json`), 'utf8'));
    assert.equal(data.args.find((arg) => arg.name === 'device').filter, 'driver_id=stream');
    for (const locale of ['en', 'de', 'nl']) assert.ok(data.hint[locale].length > 20);
    if (id.startsWith('electricity_price') || id === 'set_electricity_price') assert.match(data.hint.en, /90/);
  }
});

test('an old in-flight price action cannot reactivate conditions after re-init or a unit change', async () => {
  for (const change of ['reinit', 'unit']) {
    const h = await harness();
    let complete;
    let started;
    const entered = new Promise((resolve) => { started = resolve; });
    h.device.setCapabilityValue = async (key, value) => {
      if (key === 'tariff_price_now') {
        started();
        await new Promise((resolve) => { complete = resolve; });
      }
      h.device.values[key] = value;
    };
    const price = h.device.flowSetElectricityPrice(-5);
    await entered;
    if (change === 'reinit') {
      await h.device.onTeardown();
      await h.device.onReady();
    } else {
      h.device.getSetting = (key) => (key === 'price_unit' ? 'ct/kWh' : false);
      await h.device.onSettingsChanged({ price_unit: 'ct/kWh' }, ['price_unit']);
    }
    complete();
    await assert.rejects(price, /interrupted/);
    assert.throws(() => h.device.priceIsNegative(), /price/i);
    await h.device.onTeardown();
  }
});

async function harness() {
  const device = new StreamDevice();
  const reads = [];
  const writes = [];
  const state = { ...normal };
  device.homey = {
    settings: { get: (key) => ({ accessKey: 'test-access', secretKey: 'test-secret' }[key]) },
    setTimeout: (callback, ms) => {
      const timer = ++device.nextTimer;
      device.timers.set(timer, { callback, ms });
      if (ms === 1500 && device.autoWait) queueMicrotask(() => { device.timers.delete(timer); callback(); });
      return timer;
    },
    clearTimeout: (timer) => device.timers.delete(timer),
    flow: { getDeviceTriggerCard: () => ({ trigger: async () => {} }) },
  };
  device.clientCredentialsKey = 'test-access:test-secret:';
  device.client = {
    getQuotaAll: async (sn, options) => { reads.push({ sn, options }); return { ...state }; },
    setQuota: async (payload) => {
      writes.push(payload);
      const params = payload.params;
      if (params.cfgMaxChgSoc !== undefined) state.cmsMaxChgSoc = params.cfgMaxChgSoc;
      if (params.cfgMinDsgSoc !== undefined) state.cmsMinDsgSoc = params.cfgMinDsgSoc;
      if (params.cfgBackupReverseSoc !== undefined) state.backupReverseSoc = params.cfgBackupReverseSoc;
      if (params.cfgFeedGridMode !== undefined) state.feedGridMode = params.cfgFeedGridMode;
      if (params.cfgEnergyStrategyOperateMode) {
        for (const key of Object.keys(state).filter((value) => value.startsWith('energyStrategyOperateMode.'))) delete state[key];
        for (const [key, value] of Object.entries(params.cfgEnergyStrategyOperateMode)) state[`energyStrategyOperateMode.${key}`] = value;
      }
    },
  };
  await device.onReady();
  return { device, reads, writes, state };
}

test('all BK Flow controls and capability listeners use fresh main-target readback and normalized values', async () => {
  const h = await harness();
  await h.device.flowSetOperatingMode('tou');
  await h.device.flowSetFeedIn(true);
  await h.device.flowSetChargeLimit(120);
  await h.device.flowSetDischargeLimit(15);
  await h.device.flowSetBackupReserve(80);
  await h.device.listeners.charge_limit(85);
  await h.device.listeners.feed_in_control(false);
  assert.equal(h.device.values.operating_mode, 'tou');
  assert.equal(h.device.values.charge_limit, 85);
  assert.equal(h.device.values.feed_in_control, false);
  assert.ok(h.writes.every((payload) => payload.sn === MAIN));
  assert.ok(h.reads.every(({ sn, options }) => sn === MAIN && options.fresh === true));
  assert.equal(h.device.getEnergyDiagnostics().samples, 0, 'control snapshots never enter battery accounting');
  await h.device.onTeardown();
});

test('cached requested values cannot mask an accepted-but-unapplied write or a failed fresh read', async () => {
  const h = await harness();
  h.device.values.charge_limit = 100;
  h.device.client.setQuota = async (payload) => { h.writes.push(payload); };
  await assert.rejects(h.device.flowSetChargeLimit(100), StreamControlFailure);
  assert.equal(h.device.values.charge_limit, 80);
  assert.equal(h.reads.length, 4);
  assert.equal(h.writes.length, 1);
  assert.match(h.device.warnings.at(-1), /1 accepted, 0 read back/);
  assert.ok(!h.device.warnings.at(-1).includes(MAIN));
  h.device.client.getQuotaAll = async () => { throw new Error(`timeout ${MAIN} secret`); };
  await assert.rejects(h.device.flowSetChargeLimit(100), /no commands sent/);
  assert.equal(h.writes.length, 1);
  assert.ok(!h.device.warnings.at(-1).includes('secret'));
  await h.device.onTeardown();
});

test('cheap/peak helpers serialize full sequences and retain reported state after partial failure', async () => {
  const h = await harness();
  const write = h.device.client.setQuota;
  h.device.client.setQuota = async (payload) => {
    if (payload.params.cfgBackupReverseSoc !== undefined) {
      h.writes.push(payload);
      throw new Error('API rejected reserve');
    }
    return write(payload);
  };
  await assert.rejects(h.device.flowPrepareCheapImport(90), /incomplete/);
  assert.equal(h.device.values.charge_limit, 100);
  assert.equal(h.device.values.backup_reserve_soc, 20);
  assert.equal(h.writes.length, 2);
  assert.match(h.device.warnings.at(-1), /charge_limit=80/);
  h.device.client.setQuota = write;
  await h.device.flowReleaseForExport();
  assert.deepEqual(h.writes.slice(2).map((payload) => payload.params),
    [{ cfgMinDsgSoc: 0 }, { cfgBackupReverseSoc: 3 }, { cfgFeedGridMode: 2 }]);
  assert.equal(h.device.values.backup_reserve_soc, 3);
  assert.equal(h.device.values.discharge_limit, 0);
  assert.equal(h.device.warnings.at(-1), null, 'only the previous control warning is cleared');
  await h.device.onTeardown();
});

test('shutdown cancels a readback wait, clears timers and prevents another command or poll', async () => {
  const h = await harness();
  h.device.autoWait = false;
  const action = h.device.flowPrepareCheapImport(90);
  const outcome = assert.rejects(action, StreamControlFailure);
  for (let i = 0; i < 20 && !h.device.controlWaits.size; i += 1) await Promise.resolve();
  assert.equal(h.device.controlWaits.size, 1);
  await h.device.onUninit();
  await outcome;
  assert.equal(h.device.controlWaits.size, 0);
  assert.equal(h.device.timers.size, 0);
  assert.equal(h.writes.length, 1);
  assert.equal(h.reads.length, 1);
  assert.equal(h.device.warnings.length, 0, 'no SDK warning calls after teardown');
});

test('shutdown during an in-flight command cannot trigger readback or optimistic updates when it settles', async () => {
  const h = await harness();
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  h.device.client.setQuota = async (payload) => {
    h.writes.push(payload);
    entered();
    await new Promise((resolve) => { release = resolve; });
  };
  const action = h.device.flowPrepareCheapImport(90);
  const outcome = assert.rejects(action, StreamControlFailure);
  await started;
  await h.device.onUninit();
  // Re-init of the same object must not reactivate a previous session's command.
  await h.device.onReady();
  release();
  await outcome;
  assert.equal(h.reads.length, 1);
  assert.equal(h.writes.length, 1);
  assert.equal(h.device.values.charge_limit, 80);
  assert.equal(h.device.warnings.length, 0);
});

test('price conditions fail closed after expiry/restart and reject invalid updates', async (t) => {
  let now = 10000000;
  t.mock.method(Date, 'now', () => now);
  const h = await harness();
  h.device.values.tariff_price_now = -5;
  assert.throws(() => h.device.priceIsNegative(), /price missing/, 'a restored tile has no current-session timestamp');
  await h.device.flowSetElectricityPrice(-5);
  assert.equal(h.device.priceIsNegative(), true);
  assert.equal(h.device.priceIs('below', 0), true);
  assert.equal(h.device.priceIs('above', -10), true);
  now += PRICE_MAX_AGE_MS + 1;
  assert.throws(() => h.device.priceIsNegative(), /older than 90 minutes/);
  assert.throws(() => h.device.priceIs('below', 0), /older than 90 minutes/);
  await assert.rejects(h.device.flowSetElectricityPrice(Infinity), /finite/);
  assert.equal(h.device.values.tariff_price_now, -5);
  assert.throws(() => h.device.priceIsNegative(), /older than 90 minutes/);
  await h.device.flowSetElectricityPrice(0);
  assert.equal(h.device.priceIs('below', 10), true);
  assert.throws(() => h.device.priceIs('below', NaN), /finite threshold/);
  await h.device.onSettingsChanged({}, ['price_unit']);
  assert.throws(() => h.device.priceIsNegative(), /price missing/);
  await h.device.onTeardown();
});

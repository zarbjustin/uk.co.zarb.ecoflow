'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const captures = require('./fixtures/stream5000Telemetry.json');

// Homey's runtime exists on the hub, not in this test runner. Only replace the
// Device base class; use the real adapter, parser, role mapping and accounting.
class FakeDevice {
  constructor() {
    this.capabilities = new Set([
      'measure_battery', 'measure_power', 'battery_charging_state',
      'measure_power.load', 'measure_temperature', 'battery_soh',
      'meter_power.charged', 'meter_power.discharged',
    ]);
    this.values = {};
    this.settings = {};
    this.store = {};
    this.available = false;
    this.onlineTransitions = 0;
    this.logs = [];
    this.errors = [];
    this.options = {};
  }

  getData() { return { sn: this.sn || captures.pair.unit_a }; }
  getSetting(key) { return this.settings[key]; }
  getStoreValue(key) { return this.store[key]; }
  getCapabilityValue(key) { return this.values[key]; }
  getCapabilityOptions(key) { return this.options[key] || {}; }
  async setCapabilityOptions(key, options) { this.options[key] = options; }
  hasCapability(key) { return this.capabilities.has(key); }
  getAvailable() { return this.available; }
  async addCapability(key) { this.capabilities.add(key); }
  async removeCapability(key) { this.capabilities.delete(key); delete this.values[key]; }
  async setCapabilityValue(key, value) { this.values[key] = value; }
  async setStoreValue(key, value) { this.store[key] = value; }
  async setSettings(values) { Object.assign(this.settings, values); }
  async setAvailable() { this.available = true; this.onlineTransitions += 1; }
  async setUnavailable(message) { this.available = false; this.unavailableMessage = message; }
  async setWarning(message) { this.warning = message; }
  log(...args) { this.logs.push(args.join(' ')); }
  error(...args) { this.errors.push(args); }
}

const originalLoad = Module._load;
let classes;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice };
    return originalLoad.call(this, request, ...args);
  };
  classes = require('../.homeybuild/lib/Stream5000UnitDevice');
} finally {
  Module._load = originalLoad;
}

function varint(value) {
  let n = BigInt(value);
  const bytes = [];
  do {
    const byte = Number(n & 127n);
    n >>= 7n;
    bytes.push(byte | (n ? 128 : 0));
  } while (n);
  return Buffer.from(bytes);
}

test('failed live write never refreshes applied age, unrelated fields cannot restore availability, zero can recover', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device } = await harness(classes.Stream5000UnitDevice);
  await device.queueTelemetry({ 'measure_power.load': 42 }, now, true);
  const write = device.setCapabilityValue.bind(device);
  t.mock.method(device, 'setCapabilityValue', async (key, value) => {
    if (key === 'measure_power.load' && value === 100) throw new Error('synthetic SDK rejection');
    await write(key, value);
  });
  now += 10000;
  await device.queueTelemetry({ 'measure_power.load': 100, measure_temperature: 31 }, now, true);
  assert.equal(device.getAvailable(), false);
  assert.equal(device.values['measure_power.load'], null);
  assert.equal(device.values.measure_temperature, 31);
  assert.deepEqual(device.getReadingDiagnostics()['measure_power.load'], {
    ageSec: 10, receivedAgeSec: 0, stale: true, applicationStatus: 'write_failed',
  });
  assert.match(device.unavailableMessage, /could not be applied/);
  now += 1000;
  await device.queueTelemetry({ measure_temperature: 32 }, now, true);
  assert.equal(device.getAvailable(), false);
  await device.queueTelemetry({ 'measure_power.load': 0 }, now, true);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.values['measure_power.load'], 0);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].applicationStatus, 'applied');
  await device.onUninit();
});

test('failed expiry clear retains failure evidence, retries independently and does not invent a receipt', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device } = await harness(classes.Stream5000UnitDevice);
  await device.queueTelemetry({ measure_power: 100, 'measure_power.load': 42 }, now, true);
  const write = device.setCapabilityValue.bind(device);
  let reject = true;
  t.mock.method(device, 'setCapabilityValue', async (key, value) => {
    if (reject && key === 'measure_power.load' && value === null) throw new Error('synthetic clear rejection');
    await write(key, value);
  });
  now += 180001;
  await device.checkAvailability();
  assert.equal(device.values.measure_power, null, 'other expired fields still clear');
  assert.equal(device.values['measure_power.load'], 42);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].receivedAgeSec, 180);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].applicationStatus, 'write_failed');
  assert.equal(device.getAvailable(), false);
  reject = false;
  await device.checkAvailability();
  assert.equal(device.values['measure_power.load'], null);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].applicationStatus, 'write_failed', 'clearing is not new data');
  await device.queueTelemetry({ 'measure_power.load': 0 }, now, true);
  assert.equal(device.getAvailable(), true);
  await device.onUninit();
});

test('first-frame write failure explains application failure rather than a missing connection', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const { device } = await harness(classes.Stream5000UnitDevice);
  const write = device.setCapabilityValue.bind(device);
  t.mock.method(device, 'setCapabilityValue', async (key, value) => {
    if (key === 'measure_power.load' && value === 42) throw new Error('synthetic first write rejection');
    await write(key, value);
  });
  await device.queueTelemetry({ 'measure_power.load': 42 }, 100000, true);
  assert.equal(device.getAvailable(), false);
  assert.match(device.unavailableMessage, /could not be applied/);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].ageSec, null);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].receivedAgeSec, 0);
  await device.onUninit();
});

test('slow writes and delayed/future queued packets cannot revive expired readings', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device } = await harness(classes.Stream5000UnitDevice);
  const write = device.setCapabilityValue.bind(device);
  t.mock.method(device, 'setCapabilityValue', async (key, value) => {
    if (key === 'measure_power.load' && value === 100) now += 180001;
    await write(key, value);
  });
  await device.queueTelemetry({ 'measure_power.load': 100 }, now, true);
  assert.equal(device.values['measure_power.load'], null);
  assert.equal(device.getAvailable(), false);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].stale, true);
  await device.queueTelemetry({ 'measure_power.load': 0 }, now - 180001, true);
  await device.queueTelemetry({ 'measure_power.load': 0 }, now + 1, true);
  assert.equal(device.values['measure_power.load'], null);
  await device.queueTelemetry({ 'measure_power.load': 0 }, now, true);
  assert.equal(device.values['measure_power.load'], 0);
  assert.equal(device.getAvailable(), true);
  await device.onUninit();
});

test('accessory write/add failures stay visible and recover without Energy contribution', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device } = await harness(classes.Stream5000PhysicalUnitDevice);
  await device.queueTelemetry({ measure_battery: 50 }, now, true);
  const add = device.addCapability.bind(device);
  let reject = true;
  t.mock.method(device, 'addCapability', async key => {
    if (reject && key === 'stream_5000_socket_power') throw new Error('synthetic add rejection');
    await add(key);
  });
  await device.queueAccessories({ acSocketW: 20, directPv: { totalW: 10 } }, now);
  assert.equal(device.values.stream_5000_direct_pv, 10);
  assert.equal(device.getAvailable(), false);
  assert.equal(device.getReadingDiagnostics().stream_5000_socket_power.applicationStatus, 'write_failed');
  reject = false; now += 1000;
  await device.queueAccessories({ acSocketW: 20 }, now);
  await device.queueTelemetry({ measure_battery: 51 }, now, true);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.values.stream_5000_socket_power, 20);
  assert.equal(device.hasCapability('measure_power'), false);
  assert.equal(device.hasCapability('meter_power.discharged'), false);
  await device.onUninit();
});

test('deletion during a pending write cannot promote availability or schedule later writes', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const { device } = await harness(classes.Stream5000UnitDevice);
  const write = device.setCapabilityValue.bind(device);
  let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  t.mock.method(device, 'setCapabilityValue', async (key, value) => {
    if (key === 'measure_power.load' && value === 100) { entered(); await pending; }
    await write(key, value);
  });
  const apply = device.queueTelemetry({ 'measure_power.load': 100, measure_temperature: 32 }, 100000, true);
  await started;
  const teardown = device.onUninit();
  release();
  await Promise.all([apply, teardown]);
  assert.equal(device.getAvailable(), false);
  assert.equal(device.values.measure_temperature, null);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].ageSec, null);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].applicationStatus, 'unavailable');
});

test('old/future queued deltas do not replace a fresh reading or declare its connection lost', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const { device } = await harness(classes.Stream5000PhysicalUnitDevice);
  await device.queueTelemetry({ 'measure_power.load': 42 }, 100000, true);
  await device.queueTelemetry({ 'measure_power.load': 100 }, 99999, true);
  await device.queueTelemetry({ 'measure_power.load': 100 }, 100001, true);
  assert.equal(device.values['measure_power.load'], 42);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.getReadingDiagnostics()['measure_power.load'].applicationStatus, 'applied');
  await device.queueAccessories({ acSocketW: 100 }, -80001);
  assert.equal(device.hasCapability('stream_5000_socket_power'), false);
  await device.onUninit();
});

function group(number, payload) {
  return Buffer.concat([varint(number * 8 + 2), varint(payload.length), payload]);
}

function frame(pdata) {
  return group(1, Buffer.concat([group(1, pdata), varint(64), varint(254), varint(72), varint(39)]));
}

async function harness(DeviceClass, savedStore = {}, sn = captures.pair.unit_a, initialOptions = {}, configure) {
  const device = new DeviceClass();
  device.sn = sn;
  Object.assign(device.store, savedStore);
  Object.assign(device.options, initialOptions);
  let handler;
  let nextTimer = 0;
  const timers = new Set();
  const subscriptions = new Set();
  device.homey = {
    __: (key) => key,
    app: {
      subscribeAppRealtime: async (address, callback) => { subscriptions.add(address); handler = callback; return true; },
      unsubscribeAppRealtime: address => subscriptions.delete(address),
    },
    setInterval: () => { timers.add(++nextTimer); return nextTimer; },
    clearInterval: id => timers.delete(id),
    setTimeout: () => { timers.add(++nextTimer); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  };
  if (configure) configure(device);
  await device.onInit();
  return {
    device,
    resources: () => ({ timers: timers.size, subscriptions: subscriptions.size }),
    emit: async (payload) => {
      handler(payload, `/app/device/property/${sn}`);
      await device.applyChain;
    },
  };
}

test('5000 physical monitoring still starts when optional scope-title metadata cannot be read', async () => {
  const h = await harness(classes.Stream5000PhysicalUnitDevice, {}, captures.pair.unit_a, {}, device => {
    device.getCapabilityOptions = cap => { throw new Error(`Invalid Capability: ${cap}`); };
  });
  assert.equal(h.resources().subscriptions, 1);
  await h.emit(frame(Buffer.from(captures.pair.frames[2].pdata_hex, 'hex')));
  assert.equal(h.device.values.measure_battery, 87);
  assert.equal(h.device.hasCapability('measure_power'), false);
  await h.device.onUninit();
  assert.deepEqual(h.resources(), { timers: 0, subscriptions: 0 });
});

test('physical startup migrates legacy scope labels in place and preserves custom titles and units', async () => {
  const { device } = await harness(classes.Stream5000PhysicalUnitDevice, {}, captures.pair.unit_a, {
    'measure_power.load': { title: 'House consumption', units: 'W', decimals: 2 },
    measure_temperature: { title: 'My battery temperature', decimals: 1 },
  });
  assert.equal(device.options['measure_power.load'].title.en, 'System house consumption');
  assert.equal(device.options['measure_power.load'].units, 'W');
  assert.equal(device.options['measure_power.load'].decimals, 2);
  assert.equal(device.options.measure_temperature.title, 'My battery temperature');
  assert.equal(device.getData().sn, captures.pair.unit_a);
  assert.equal(device.hasCapability('measure_power'), false);
  await device.onUninit();
});

test('repeated physical monitor sessions release every timer and subscription', async () => {
  for (let session = 0; session < 100; session++) {
    const h = await harness(classes.Stream5000UnitDevice);
    assert.equal(h.resources().subscriptions, 1);
    assert.ok(h.resources().timers > 0 && h.resources().timers <= 4);
    assert.deepEqual(h.device.getTopologyEvidence().peers, []);
    await h.device.onUninit();
    assert.deepEqual(h.resources(), { timers: 0, subscriptions: 0 });
    await h.device.onUninit();
    assert.deepEqual(h.resources(), { timers: 0, subscriptions: 0 });
  }
});

test('socket discharge advances only aggregate energy and preserves totals across restart', async (t) => {
  const { decodeFrameHeaders } = require('../.homeybuild/lib/streamAc5000Protocol');
  const sample = require('./fixtures/stream5000ContractAudit.json').captures.es22SocketBattery.frames[0];
  const header = decodeFrameHeaders(Buffer.from(sample.hex, 'hex')).find((entry) => entry.cmdFunc === 254 && entry.cmdId === 39);
  const payload = frame(header.pdata); // public masked bytes, only outer test identity omitted
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice, { chargedWh: 10, dischargedWh: 20 });
  const unit = await harness(classes.Stream5000PhysicalUnitDevice);
  await system.emit(payload);
  await unit.emit(payload);
  assert.equal(system.device.values.measure_power, -44);
  assert.equal(unit.device.values.stream_5000_socket_power, 46);
  assert.equal(system.device.hasCapability('stream_5000_socket_power'), false);
  assert.equal(system.device.values.battery_charging_state, 'discharging');
  assert.equal(unit.device.values.stream_unit_power_battery_flow, null,
    'linked public capture cannot establish signed power for one physical unit');
  assert.match(unit.device.warning, /individual battery power and direction are not verified/);
  assert.equal(unit.device.getPhysicalPowerDiagnostics().status, 'linked_power_unverified');
  assert.equal(unit.device.getPhysicalPowerDiagnostics().energyContribution, false);
  now += 60000;
  await system.emit(payload);
  await unit.emit(payload);
  assert.equal(system.device.values['meter_power.charged'], 0.01);
  assert.ok(Math.abs(system.device.values['meter_power.discharged'] - (20 + 44 / 60) / 1000) < 1e-12);
  assert.equal(unit.device.values['meter_power.discharged'], undefined);
  await system.device.onUninit();
  await unit.device.onUninit();
  const restarted = await harness(classes.Stream5000UnitDevice, system.device.store);
  const previous = restarted.device.values['meter_power.discharged'];
  now += 3600000;
  await restarted.emit(payload);
  assert.equal(restarted.device.values['meter_power.discharged'], previous, 'first sample never backfills downtime');
  await restarted.device.onUninit();
});

test('serial-keyed self record reaches diagnostics without becoming signed physical power or Energy', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const sn = captures.pair.unit_a;
  const { device, emit } = await harness(classes.Stream5000PhysicalUnitDevice, {}, sn);
  const entry = (serial, soc, watts) => group(1, Buffer.concat([
    group(1, Buffer.from(serial)), varint(16), varint(soc), varint(32), varint(watts * 2),
  ]));
  await emit(frame(group(54, Buffer.concat([entry(sn, 70, 2260), entry('BK11SYNTHETIC', 68, 1030)]))));
  assert.equal(device.getOwnUnitDiagnostics().fields.socPct.value, 70);
  assert.equal(device.getOwnUnitDiagnostics().fields.batteryPowerRawW.value, 2260);
  assert.equal(device.getOwnUnitDiagnostics().rawBatteryPowerSignAndScaleVerified, false);
  assert.equal(device.values.stream_unit_power_battery_flow, null);
  assert.equal(device.values.battery_charging_state, null);
  assert.equal(device.getEnergyDiagnostics(), null);
  await device.onUninit();
});

test('configuration-only frames populate diagnostics without availability, power samples or Energy changes', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice, { dischargedWh: 20 });
  const config = frame(group(10, Buffer.concat([varint(16), varint(1800)])));
  await system.emit(config);
  assert.equal(system.device.getConfigurationDiagnostics().values.maxGridInputW.value, 1800);
  assert.equal(system.device.lastTelemetryAt, 0);
  assert.equal(system.device.getAvailable(), false);
  assert.equal(system.device.getEnergyDiagnostics().samples, 0);
  assert.equal(system.device.values['meter_power.discharged'], 0.02);
  now += 1200001;
  assert.equal(system.device.getConfigurationDiagnostics().values.maxGridInputW.stale, true);
  await system.device.onUninit();
});

test('ES21 raw core captures replay through both real roles, with aggregate-only persistent energy', async (t) => {
  const { decodeFrameHeaders } = require('../.homeybuild/lib/streamAc5000Protocol');
  const samples = require('./fixtures/stream5000Es21Core.json').frames;
  const sn = 'ES21TESTUNITAAAA';
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice, {}, sn);
  const unit = await harness(classes.Stream5000PhysicalUnitDevice, {}, sn);
  const replay = (index) => {
    const sample = samples.find((entry) => entry.index === index);
    const header = decodeFrameHeaders(Buffer.from(sample.hex, 'hex'))[0];
    // Only test identity is substituted. Core numerical payload is verbatim.
    const pdata = Buffer.from(header.pdata);
    const masked = Buffer.from('XXXXXXXXXXXXXXXX');
    let offset = pdata.indexOf(masked);
    while (offset !== -1) {
      Buffer.from(sn).copy(pdata, offset);
      offset = pdata.indexOf(masked, offset + masked.length);
    }
    return group(1, Buffer.concat([
      group(1, pdata), varint(64), varint(header.cmdFunc), varint(72), varint(header.cmdId), group(25, Buffer.from(sn)),
    ]));
  };
  for (const target of [system, unit]) {
    await target.emit(replay(0));
    await target.emit(replay(1));
    await target.emit(replay(3));
    assert.equal(target.device.settings.model, 'STREAM 5000');
    assert.equal(target.device.values.measure_battery, 74);
    assert.equal(target.device.values.measure_temperature, 45);
    assert.equal(target.device.values.battery_soh, 100);
    assert.equal(target.device.available, true);
  }
  assert.equal(system.device.values.measure_power, -630);
  assert.equal(unit.device.values.stream_unit_power_battery_flow, -630);
  assert.equal(unit.device.hasCapability('measure_power'), false);
  now += 60000;
  await system.emit(replay(3));
  await unit.emit(replay(3));
  assert.equal(system.device.values['meter_power.discharged'], 0.0105);
  assert.equal(unit.device.values['meter_power.discharged'], undefined);
  const usableAt = system.device.lastTelemetryAt;
  now += 1000;
  await system.emit(replay(4));
  assert.equal(system.device.lastTelemetryAt, usableAt, 'unknown 254/40 cannot renew availability');
  await system.device.onUninit();
  await unit.device.onUninit();
  const restarted = await harness(classes.Stream5000UnitDevice, system.device.store, sn);
  assert.equal(restarted.device.values['meter_power.discharged'], 0.0105);
  await restarted.emit(replay(3));
  assert.equal(restarted.device.values['meter_power.discharged'], 0.0105, 'restart does not integrate an outage');
  await restarted.device.onUninit();
});

test('5000 subscription completing after shutdown cannot restart watchdogs or retain a handler', async () => {
  const device = new classes.Stream5000PhysicalUnitDevice();
  let complete;
  let entered;
  const subscribed = new Promise((resolve) => { complete = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let intervals = 0;
  let unsubscribed = 0;
  const app = {
    subscribeAppRealtime: async () => { entered(); return subscribed; },
    unsubscribeAppRealtime: () => { unsubscribed += 1; },
  };
  device.homey = {
    __: (key) => key,
    app,
    setInterval: () => { intervals += 1; return intervals; },
    clearInterval() {},
  };
  const init = device.onInit();
  await started;
  await device.onUninit();
  Object.defineProperty(device.homey, 'app', { get() { throw new Error('app instance destroyed'); } });
  complete(true);
  await init;
  assert.equal(intervals, 0);
  assert.equal(device.subscriptionState, 'stopped');
  assert.equal(unsubscribed, 1);
});

test('ES21 linked records preserve system SOC and attribute physical SOC without copying aggregate power', async (t) => {
  const pv = require('./fixtures/stream5000PvResearch.json');
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice, {}, pv.unit_b);
  const unit = await harness(classes.Stream5000PhysicalUnitDevice, {}, pv.unit_b);
  const core = Buffer.from(require('./fixtures/stream5000Es21Core.json').frames[0].hex, 'hex');
  await system.emit(core);
  const systemAt = system.device.lastTelemetryAt;
  now += 1000;
  const linked = frame(Buffer.from(pv.frames[2].pdata_hex, 'hex'));
  await system.emit(linked);
  await unit.emit(linked);
  assert.equal(system.device.values.measure_battery, 74);
  assert.equal(system.device.lastTelemetryAt, systemAt, 'unit-only records cannot renew installation SOC');
  assert.equal(unit.device.values.measure_battery, 48);
  assert.equal(unit.device.values.stream_unit_power_battery_flow, null);
  assert.equal(unit.device.getTopologyEvidence().source, 'es21_peer_records');
  assert.equal(unit.device.hasCapability('meter_power.charged'), false);
  await system.device.onUninit();
  await unit.device.onUninit();
});

test('failed 5000 subscription completing after shutdown cannot start a retry timer', async () => {
  const device = new classes.Stream5000PhysicalUnitDevice();
  let complete;
  let entered;
  const subscribed = new Promise((resolve) => { complete = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let intervals = 0;
  device.homey = {
    __: (key) => key,
    app: { subscribeAppRealtime: async () => { entered(); return subscribed; } },
    setInterval: () => { intervals += 1; return intervals; },
    clearInterval() {},
  };
  const init = device.onInit();
  await started;
  await device.onUninit();
  complete(false);
  await init;
  assert.equal(intervals, 0);
  assert.equal(device.subscriptionState, 'stopped');
});

test('real lifecycle applies different system/unit readings and only the aggregate integrates energy', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice);
  const unit = await harness(classes.Stream5000PhysicalUnitDevice);
  const payload = frame(Buffer.from(captures.pair.frames[2].pdata_hex, 'hex'));
  await system.emit(payload);
  await unit.emit(payload);
  assert.equal(system.device.values.measure_battery, 76);
  assert.equal(unit.device.values.measure_battery, 87);
  assert.equal(system.device.values.measure_power, 461);
  assert.equal(unit.device.values.stream_unit_power_battery_flow, null, 'linked-unit direction is not verified');
  assert.equal(unit.device.values.battery_charging_state, null);
  assert.equal(unit.device.hasCapability('measure_power'), false);
  assert.equal(unit.device.hasCapability('meter_power.charged'), false);
  assert.equal(unit.device.hasCapability('meter_power.discharged'), false);
  now += 60000;
  await system.emit(payload);
  await unit.emit(payload);
  assert.ok(system.device.values['meter_power.charged'] > 0);
  assert.equal(unit.device.values['meter_power.charged'], undefined);
  await system.device.onUninit();
  await unit.device.onUninit();
  assert.ok(system.device.store.chargedWh > 0);
  assert.equal(unit.device.store.chargedWh, undefined);
});

test('parsed but unprojectable unit delta cannot mark Home Battery online or refresh its age', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice);
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(87);
  const unitOnly = frame(group(33, Buffer.concat([varint(6 * 8 + 5), buffer])));
  await system.emit(unitOnly);
  assert.equal(system.device.parsedFrames, 1);
  assert.equal(system.device.lastTelemetryAt, 0);
  assert.equal(system.device.onlineTransitions, 0);
  now += 1000;
  await system.emit(frame(Buffer.from(captures.pair.frames[2].pdata_hex, 'hex')));
  const usableAt = system.device.lastTelemetryAt;
  now += 1000;
  await system.emit(unitOnly);
  assert.equal(system.device.lastTelemetryAt, usableAt);
  assert.equal(system.device.values.measure_battery, 76);
  await system.device.onUninit();
});

test('observed direct PV adds physical-only tiles without keeping battery online or advancing Energy', async () => {
  const system = await harness(classes.Stream5000UnitDevice);
  const unit = await harness(classes.Stream5000PhysicalUnitDevice);
  const initialSystemValues = { ...system.device.values };
  const initialUnitValues = { ...unit.device.values };
  const f = (number, value) => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return Buffer.concat([varint(number * 8 + 5), bytes]);
  };
  const payload = frame(group(50, group(1, Buffer.concat([
    group(1, Buffer.from(captures.pair.unit_a)), f(3, 100), f(9, 100),
  ]))));
  await system.emit(payload);
  await unit.emit(payload);
  assert.equal(system.device.parsedFrames, 1);
  assert.equal(system.device.lastTelemetryAt, 0);
  assert.equal(unit.device.lastTelemetryAt, 0);
  assert.equal(system.device.onlineTransitions, 0);
  assert.equal(unit.device.onlineTransitions, 0);
  assert.deepEqual(system.device.values, initialSystemValues);
  assert.deepEqual(unit.device.values, { ...initialUnitValues, stream_5000_direct_pv: 100, stream_unit_power_pv1: 100 });
  assert.equal(unit.device.hasCapability('stream_unit_power_pv2'), false, 'absent string is not invented');
  const night = frame(group(50, group(1, Buffer.concat([
    group(1, Buffer.from(captures.pair.unit_a)), f(3, 0), f(9, 0),
  ]))));
  await unit.emit(night);
  assert.equal(unit.device.values.stream_5000_direct_pv, 0);
  assert.equal(unit.device.values.stream_unit_power_pv1, 0);
  assert.equal(unit.device.hasCapability('stream_unit_power_pv2'), false);
  assert.equal(unit.device.hasCapability('meter_power.charged'), false);
  assert.equal(system.device.hasCapability('stream_unit_power_pv1'), false);
  await system.device.onUninit();
  await unit.device.onUninit();
});

test('ES21 public linked capture exposes only this unit MPPT, not the peer or an aggregate Energy source', async () => {
  const samples = require('./fixtures/stream5000PvResearch.json');
  const { device, emit } = await harness(classes.Stream5000PhysicalUnitDevice, {}, samples.unit_b);
  const payload = frame(Buffer.from(samples.frames[2].pdata_hex, 'hex'));
  await emit(payload);
  assert.ok(Math.abs(device.values.stream_5000_direct_pv - 201.96947) < 0.001);
  assert.ok(Math.abs(device.values.stream_unit_power_pv1 - 62.68369) < 0.001);
  assert.notEqual(device.values.stream_5000_direct_pv, 216, 'never borrow peer total');
  assert.equal(device.hasCapability('measure_power'), false);
  assert.equal(device.hasCapability('meter_power.charged'), false);
  await device.onUninit();
});

test('independent reading expiry clears stale power despite fresh temperature and preserves cumulative totals', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device } = await harness(classes.Stream5000UnitDevice, { chargedWh: 100, dischargedWh: 200 });
  await device.queueTelemetry({ measure_power: 200, battery_charging_state: 'charging' }, now, true);
  now += 1200001;
  await device.queueTelemetry({ measure_temperature: 36 }, now, true);
  device.lastTelemetryAt = now; // Synthetic accepted-temperature delta, normally assigned by the frame handler.
  await device.checkAvailability();
  assert.equal(device.values.measure_power, null);
  assert.equal(device.values.battery_charging_state, null);
  assert.equal(device.values.measure_temperature, 36);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.values['meter_power.charged'], 0.1);
  assert.equal(device.values['meter_power.discharged'], 0.2);
  assert.equal(device.getReadingDiagnostics().measure_power.stale, true);
  await device.queueTelemetry({ measure_power: 400, battery_charging_state: 'charging' }, now + 1, true);
  assert.equal(device.values.measure_power, null, 'future packets must not overwrite displayed readings');
  assert.equal(device.values['meter_power.charged'], 0.1, 'returning positive power must not backfill stale interval');
  assert.equal(device.getReadingDiagnostics().measure_power.stale, true, 'future receipt fails closed until clock catches up');
  now += 1;
  await device.queueTelemetry({ measure_power: 400, battery_charging_state: 'charging' }, now, true);
  assert.equal(device.values.measure_power, 400);
  assert.equal(device.getReadingDiagnostics().measure_power.stale, false);
  assert.equal(device.getEnergyDiagnostics().ignoredGaps, 1);
  now += 60000;
  await device.queueTelemetry({ measure_power: 400 }, now, true);
  assert.ok(Math.abs(device.values['meter_power.charged'] - (0.1 + 400 / 60 / 1000)) < 1e-12);
  await device.onUninit();
});

test('physical watt tiles expire after three minutes without declaring a healthy temperature feed offline', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device } = await harness(classes.Stream5000PhysicalUnitDevice);
  await device.queueTelemetry({ measure_power: 200, battery_charging_state: 'charging', 'measure_power.load': 25 }, now, true);
  now += 181000;
  await device.queueTelemetry({ measure_temperature: 31 }, now, true);
  device.lastTelemetryAt = now;
  await device.checkAvailability();
  assert.equal(device.getAvailable(), true);
  assert.equal(device.values.stream_unit_power_battery_flow, null);
  assert.equal(device.values['measure_power.load'], null);
  assert.equal(device.values.battery_charging_state, null);
  assert.equal(device.values.measure_temperature, 31);
  assert.equal(device.hasCapability('measure_power'), false);
  assert.equal(device.getEnergyDiagnostics(), null);
  await device.onUninit();
});

test('configuration tiles and conditions use fresh readback, never make a configuration-only frame battery data', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { device, emit } = await harness(classes.Stream5000UnitDevice);
  await assert.rejects(device.configurationModeIs('custom'), /unavailable/);
  await assert.rejects(device.configurationReserveEnabled(), /unavailable/);
  await emit(frame(Buffer.concat([varint(200), varint(2), group(30, Buffer.concat([varint(8), varint(1), varint(16), varint(20)]))])));
  assert.equal(device.values.stream_5000_mode, 'custom');
  assert.equal(device.values.stream_5000_backup_reserve, 20);
  assert.equal(await device.configurationModeIs('custom'), true);
  assert.equal(await device.configurationModeIs('self_powered'), false);
  assert.equal(await device.configurationReserveEnabled(), true);
  assert.equal(device.lastTelemetryAt, 0);
  assert.equal(device.getEnergyDiagnostics().samples, 0);
  now += 1200001;
  await device.checkAvailability();
  assert.equal(device.values.stream_5000_mode, null);
  await assert.rejects(device.configurationModeIs('custom'), /unavailable/);
  await assert.rejects(device.configurationReserveEnabled(), /unavailable/);
  await device.onUninit();
});

test('real parsed peer frames feed private topology evidence without changing pairing, capability roles or persisted stores', async () => {
  const system = await harness(classes.Stream5000UnitDevice);
  const unit = await harness(classes.Stream5000PhysicalUnitDevice);
  const payload = frame(Buffer.from(captures.pair.frames[2].pdata_hex, 'hex'));
  const pairedBefore = system.device.getData();
  await system.emit(payload);
  await unit.emit(payload);
  const evidence = system.device.getTopologyEvidence();
  assert.equal(evidence.source, 'es22_peer_records');
  assert.equal(evidence.systemSocObserved, true);
  assert.ok(evidence.peers.length > 0);
  assert.deepEqual(system.device.getData(), pairedBefore);
  assert.equal(unit.device.hasCapability('meter_power.charged'), false);
  assert.equal(unit.device.getEnergyDiagnostics(), null);
  await system.device.onUninit();
  await unit.device.onUninit();
  assert.ok(!JSON.stringify(system.device.store).includes(captures.pair.unit_a), 'no serial membership is persisted');
  assert.ok(!JSON.stringify(unit.device.store).includes(captures.pair.unit_a));
});

test('aggregate restores saved kWh across restart without integrating downtime or duplicate samples', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const charging = frame(Buffer.from(captures.pair.frames[2].pdata_hex, 'hex'));
  const discharging = Buffer.from(captures.discharge.frames[0].hex, 'hex');
  const original = await harness(classes.Stream5000UnitDevice, { chargedWh: 1250, dischargedWh: 500 });
  assert.equal(original.device.values['meter_power.charged'], 1.25);
  assert.equal(original.device.values['meter_power.discharged'], 0.5);
  await original.emit(charging);
  assert.equal(original.device.values['meter_power.charged'], 1.25, 'first sample only anchors');
  now += 60000;
  await original.emit(charging);
  const chargedKWh = 1.25 + (461 / 60 / 1000);
  assert.ok(Math.abs(original.device.values['meter_power.charged'] - chargedKWh) < 1e-9);
  await original.device.onUninit();

  now += 15 * 60000;
  const restarted = await harness(classes.Stream5000UnitDevice, { ...original.device.store });
  assert.ok(Math.abs(restarted.device.values['meter_power.charged'] - chargedKWh) < 1e-9);
  assert.equal(restarted.device.values['meter_power.discharged'], 0.5);
  await restarted.emit(discharging);
  assert.equal(restarted.device.values['meter_power.discharged'], 0.5, 'restart cannot backfill downtime');
  now += 60000;
  await restarted.emit(discharging);
  const dischargeW = Math.abs(restarted.device.values.measure_power);
  assert.equal(dischargeW, 536);
  const dischargedKWh = 0.5 + (dischargeW / 60 / 1000);
  assert.ok(Math.abs(restarted.device.values['meter_power.discharged'] - dischargedKWh) < 1e-9);
  await restarted.emit(discharging);
  assert.ok(Math.abs(restarted.device.values['meter_power.discharged'] - dischargedKWh) < 1e-9,
    'same timestamp cannot accumulate twice');

  now += 2 * 60 * 60000;
  await restarted.emit(discharging);
  assert.ok(Math.abs(restarted.device.values['meter_power.discharged'] - dischargedKWh) < 1e-9,
    'an oversized reconnect gap cannot invent energy');
  assert.equal(restarted.device.getEnergyDiagnostics().ignoredGaps, 1);
  assert.equal(restarted.device.getEnergyDiagnostics().source, 'integrated_power');
  now += 60000;
  await restarted.emit(discharging);
  const resumedKWh = dischargedKWh + (dischargeW / 60 / 1000);
  assert.ok(Math.abs(restarted.device.values['meter_power.discharged'] - resumedKWh) < 1e-9);
  await restarted.device.onUninit();
  assert.ok(Math.abs(restarted.device.store.chargedWh / 1000 - chargedKWh) < 1e-9);
  assert.ok(Math.abs(restarted.device.store.dischargedWh / 1000 - resumedKWh) < 1e-9);
});

test('5000 aggregate retries failed energy persistence; physical monitor has no accounting report', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const system = await harness(classes.Stream5000UnitDevice);
  const unit = await harness(classes.Stream5000PhysicalUnitDevice);
  assert.equal(unit.device.getEnergyDiagnostics(), null);
  const payload = frame(Buffer.from(captures.pair.frames[2].pdata_hex, 'hex'));
  await system.emit(payload);
  now += 60000; await system.emit(payload);
  let fail = true;
  system.device.setStoreValue = async (key, value) => {
    if (fail) { fail = false; throw new Error('store unavailable'); }
    system.device.store[key] = value;
  };
  await assert.rejects(system.device.onUninit(), /store unavailable/);
  assert.equal(system.device.getEnergyDiagnostics().checkpoint.pending, true);
  await system.device.onUninit();
  assert.ok(system.device.store.chargedWh > 0);
  assert.equal(system.device.getEnergyDiagnostics().checkpoint.failures, 1);
  await unit.device.onUninit();
});

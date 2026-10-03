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
  }

  getData() { return { sn: captures.pair.unit_a }; }
  getSetting(key) { return this.settings[key]; }
  getStoreValue(key) { return this.store[key]; }
  getCapabilityValue(key) { return this.values[key]; }
  hasCapability(key) { return this.capabilities.has(key); }
  getAvailable() { return this.available; }
  async addCapability(key) { this.capabilities.add(key); }
  async removeCapability(key) { this.capabilities.delete(key); delete this.values[key]; }
  async setCapabilityValue(key, value) { this.values[key] = value; }
  async setStoreValue(key, value) { this.store[key] = value; }
  async setSettings(values) { Object.assign(this.settings, values); }
  async setAvailable() { this.available = true; this.onlineTransitions += 1; }
  async setUnavailable() { this.available = false; }
  log(...args) { this.logs.push(args.join(' ')); }
  error(...args) { throw new Error(args.join(' ')); }
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

function group(number, payload) {
  return Buffer.concat([varint(number * 8 + 2), varint(payload.length), payload]);
}

function frame(pdata) {
  return group(1, Buffer.concat([group(1, pdata), varint(64), varint(254), varint(72), varint(39)]));
}

async function harness(DeviceClass, savedStore = {}) {
  const device = new DeviceClass();
  Object.assign(device.store, savedStore);
  let handler;
  let nextTimer = 0;
  device.homey = {
    __: (key) => key,
    app: {
      subscribeAppRealtime: async (_sn, callback) => { handler = callback; return true; },
      unsubscribeAppRealtime: () => {},
    },
    setInterval: () => ++nextTimer,
    clearInterval: () => {},
    setTimeout: () => ++nextTimer,
    clearTimeout: () => {},
  };
  await device.onInit();
  return {
    device,
    emit: async (payload) => {
      handler(payload, `/app/device/property/${captures.pair.unit_a}`);
      await device.applyChain;
    },
  };
}

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

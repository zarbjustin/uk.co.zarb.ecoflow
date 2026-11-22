'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeDevice {
  constructor() {
    this.values = { onoff: true, measure_power: 500 }; this.data = { sn: 'BK61SYNTHETIC', outlet: 1 };
    this.homey = { setInterval: () => 1, clearInterval() {} };
    this.available = false;
  }
  getData() { return this.data; }
  getCapabilityValue(cap) { return this.values[cap]; }
  async setCapabilityValue(cap, value) { this.values[cap] = value; }
  registerCapabilityListener() {}
  hasCapability() { return true; }
  getAvailable() { return this.available; }
  async setAvailable() { this.available = true; }
  async setUnavailable() { this.available = false; }
  error() {}
}
const originalLoad = Module._load;
let Socket;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice };
    return originalLoad.call(this, request, ...args);
  };
  Socket = require('../.homeybuild/drivers/stream_socket/device');
} finally { Module._load = originalLoad; }

test('socket telemetry rejects missing and malformed power and non-binary relay values', async () => {
  for (const outlet of [1, 2]) {
    const d = new Socket(); d.data.outlet = outlet;
    await d.onReady();
    const relay = outlet === 1 ? 'relay2Onoff' : 'relay3Onoff';
    const power = outlet === 1 ? 'powGetSchuko1' : 'powGetSchuko2';
    await d.applyQuota({ [relay]: true, [power]: 500 });
    for (const value of [null, '', '  ', 'invalid', {}, [], NaN, Infinity]) {
      await d.applyQuota({ [relay]: value, [power]: value });
      assert.deepEqual(d.values, { onoff: true, measure_power: 500 });
    }
    d.values.onoff = false;
    for (const value of [-1, 2, 'invalid']) {
      await d.applyQuota({ [relay]: value });
      assert.equal(d.values.onoff, false);
    }
    for (const value of [true, 1, '1']) {
      await d.applyQuota({ [relay]: value, [power]: '42.5' });
      assert.equal(d.values.onoff, true);
      assert.equal(d.values.measure_power, 42.5);
    }
    for (const value of [false, 0, '0']) {
      await d.applyQuota({ [relay]: value, [power]: '0' });
      assert.deepEqual(d.values, { onoff: false, measure_power: 0 });
    }
  }
});

test('socket startup held in SDK clearing cannot register a retired listener and re-init owns one listener', async () => {
  const d = new Socket();
  let release; const wait = new Promise(resolve => { release = resolve; });
  const write = d.setCapabilityValue.bind(d);
  let held = false; let listeners = 0;
  d.registerCapabilityListener = () => { listeners++; };
  d.setCapabilityValue = async (cap, value) => {
    if (!held) { held = true; await wait; }
    await write(cap, value);
  };
  const startup = d.onReady();
  await new Promise(resolve => setImmediate(resolve));
  const retirement = d.onUninit();
  let retired = false;
  retirement.then(() => { retired = true; });
  await new Promise(resolve => setImmediate(resolve));
  const escapedDrain = retired;
  release();
  await Promise.all([startup, retirement]);
  assert.equal(escapedDrain, false, 'retirement must wait for the already-started SDK write');
  assert.equal(listeners, 0);
  d.stopping = false; d.lifecycleGeneration++;
  await d.onReady();
  assert.equal(listeners, 1);
  await d.applyQuota({ relay2Onoff: false, powGetSchuko1: 0 });
  assert.equal(d.values.measure_power, 0);
  assert.equal(d.getReadingDiagnostics().measure_power.stale, false);
  await d.onUninit();
});

test('socket relay and power expire independently, failures remain unknown, and explicit false/zero recover', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const d = new Socket();
  const timers = new Map(); let n = 0;
  d.homey = { setInterval: fn => { timers.set(++n, fn); return n; }, clearInterval: id => timers.delete(id) };
  await d.onReady();
  assert.equal(d.values.measure_power, null);
  assert.equal(d.values.onoff, null);
  const context = at => ({ source: 'mqtt', receivedAt: at });
  await d.applyQuota({ relay2Onoff: 1, powGetSchuko1: 50 }, context(now));
  now += 100000;
  await d.applyQuota({ relay2Onoff: 1 }, context(now));
  now += 80001;
  await d.expireLiveReadings();
  assert.equal(d.values.measure_power, null);
  assert.equal(d.values.onoff, true);
  const write = d.setCapabilityValue.bind(d);
  d.setCapabilityValue = async (cap, value) => {
    if (cap === 'measure_power' && value === 0) throw Error('synthetic SDK failure');
    await write(cap, value);
  };
  await d.applyQuota({ powGetSchuko1: 0 }, context(now));
  assert.equal(d.getReadingDiagnostics().measure_power.stale, true);
  await d.applyQuota({ maxCellTemp: 20 }, context(now));
  assert.equal(d.getReadingDiagnostics().measure_power.stale, true);
  d.setCapabilityValue = write;
  now++;
  await d.applyQuota({ relay2Onoff: false, powGetSchuko1: 0 }, context(now));
  assert.equal(d.values.onoff, false); assert.equal(d.values.measure_power, 0);
  await d.applyQuota({ relay2Onoff: true, powGetSchuko1: 100 }, context(now - 1));
  assert.equal(d.values.onoff, false); assert.equal(d.values.measure_power, 0);
  await d.onTeardown();
  assert.equal(timers.size, 0);
});

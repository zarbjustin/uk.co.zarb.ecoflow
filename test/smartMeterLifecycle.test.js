'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let Meter;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: class {} };
    return originalLoad.call(this, request, ...args);
  };
  Meter = require('../.homeybuild/drivers/smartmeter/device');
} finally { Module._load = originalLoad; }

class TestMeter extends Meter {
  constructor(source = 'grid') {
    super(); this.values = new Map(); this.store = { sourceSn: 'BK61HOST' };
    this.source = source; this.available = false; this.subscriptions = []; this.removed = [];
    this.timers = new Map(); let next = 0;
    this.homey = {
      settings: { get: key => ({ accessKey: 'test-key', secretKey: 'test-secret' })[key] },
      setInterval: callback => { this.timers.set(++next, callback); return next; },
      clearInterval: id => this.timers.delete(id),
      setTimeout: () => ++next, clearTimeout() {},
      app: {
        subscribeRealtime: async (sn, callback) => { this.subscriptions.push(sn); this.emit = callback; return true; },
        unsubscribeRealtime: sn => this.removed.push(sn),
      },
    };
  }
  getData() { return { sn: 'BK21METER' }; }
  getStoreValue(key) { return this.store[key]; }
  async setStoreValue(key, value) { this.store[key] = value; }
  getSetting(key) { return key === 'meter_source' ? this.source : 15; }
  hasCapability(key) { return this.values.has(key); }
  async addCapability(key) { this.values.set(key, null); }
  getCapabilityValue(key) { return this.values.get(key); }
  async setCapabilityValue(key, value) { this.values.set(key, value); }
  async setCapabilityOptions() {}
  getAvailable() { return this.available; }
  async setAvailable() { this.available = true; }
  async setUnavailable() { this.available = false; }
  log() {}
  error(...args) { throw new Error(args.join(' ')); }
  async onReady() { await super.onReady(); this.client = { getQuotaAll: async () => ({ powGetSysGrid: 10 }) }; }
}

test('meter subscribes to its own MQTT identity, keeps host REST, and releases timers/handler', async () => {
  const d = new TestMeter(); await d.onInit();
  assert.deepEqual(d.subscriptions, ['BK21METER']);
  assert.equal(d.getReadSn(), 'BK61HOST');
  d.emit({ gridConnectionVolL1: 240 }); await d.applyChain;
  assert.equal(d.getCapabilityValue('measure_voltage.l1'), 240);
  await d.onUninit();
  assert.deepEqual(d.removed, ['BK21METER']);
  assert.equal(d.timers.size, 0);
  d.emit({ gridConnectionVolL1: 111 }); await d.applyChain;
  assert.equal(d.getCapabilityValue('measure_voltage.l1'), 240);
});

test('home-load setting never replaces native grid power or import/export direction', async () => {
  const d = new TestMeter('load'); await d.onInit();
  await d.applyQuota({ powGetSysGrid: -100, powGetSysLoad: 500 });
  assert.equal(d.getCapabilityValue('measure_power'), -100);
  assert.equal(d.getCapabilityValue('smartmeter_power_grid'), -100);
  assert.equal(d.getCapabilityValue('smartmeter_power_export'), 100);
  assert.equal(d.getCapabilityValue('measure_power.home_load'), 500);
  await d.onUninit();
});

test('direct power wins over REST and source changes anchor without adding historical energy', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const d = new TestMeter(); await d.onInit();
  await d.applyQuota({ powGetSysGrid: 3600 }, { source: 'mqtt', receivedAt: now });
  now += 1000;
  await d.applyQuota({ powGetSysGrid: 3600 }, { source: 'mqtt', receivedAt: now });
  assert.equal(d.getCapabilityValue('meter_power.imported'), 0.001);
  await d.applyQuota({ powGetSysGrid: 9999 }, { source: 'rest', receivedAt: now });
  assert.equal(d.getCapabilityValue('measure_power'), 3600);
  now += 91000;
  await d.applyQuota({ powGetSysGrid: 100 }, { source: 'rest', receivedAt: now });
  assert.equal(d.getCapabilityValue('meter_power.imported'), 0.001);
  await d.onUninit();
  assert.equal(d.store.importWh, 1);
});

test('stale phase values become unknown and a fresh frame restores them', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const d = new TestMeter(); await d.onInit();
  await d.applyQuota({ gridConnectionVolL1: 240 }, { source: 'mqtt', receivedAt: now });
  now += 181000;
  [...d.timers.values()][0](); await d.applyChain;
  assert.equal(d.getCapabilityValue('measure_voltage.l1'), null);
  await d.applyQuota({ gridConnectionVolL1: 241 }, { source: 'mqtt', receivedAt: now });
  assert.equal(d.getCapabilityValue('measure_voltage.l1'), 241);
  await d.onUninit();
});

test('grid threshold uses fresh signed readings and stale values throw even for inverted conditions', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const d = new TestMeter(); await d.onInit();
  await d.applyQuota({ powGetSysGrid: -300 }, { source: 'mqtt', receivedAt: now });
  assert.equal(d.gridPowerAbove('export', 200), true);
  assert.equal(d.gridPowerAbove('import', 0), false);
  assert.throws(() => d.gridPowerAbove('invalid', 1), /Invalid/);
  now += 91000;
  assert.throws(() => d.gridPowerAbove('export', 200), /Fresh grid power unavailable/);
  await d.onUninit();
});

test('counter records do not migrate totals or add historical energy', async t => {
  const now = 100000; t.mock.method(Date, 'now', () => now);
  const d = new TestMeter(); d.store.importWh = 200; d.store.exportWh = 50;
  await d.onInit();
  await d.applyQuota({ gridConnectionDataRecord: { todayActive: 1000000, totalReactiveEnergy: 10000, totalActiveEnergy: 990000 } },
    { source: 'mqtt', receivedAt: now });
  assert.equal(d.getCapabilityValue('meter_power.imported'), 0.2);
  assert.equal(d.getCapabilityValue('meter_power.exported'), 0.05);
  assert.equal(d.getMeterDiagnostics().nativeCounterMigrationEnabled, false);
  await d.onUninit();
});

test('same-source outage does not integrate unobserved time and stale home load expires', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const d = new TestMeter('load'); await d.onInit();
  await d.applyQuota({ powGetSysGrid: 3600, powGetSysLoad: 500 }, { source: 'rest', receivedAt: now });
  now += 181000;
  await d.applyQuota({ powGetSysGrid: 3600 }, { source: 'rest', receivedAt: now });
  [...d.timers.values()][0](); await d.applyChain;
  assert.equal(d.getCapabilityValue('meter_power.imported'), 0);
  assert.equal(d.getCapabilityValue('measure_power.home_load'), null);
  await d.onUninit();
});

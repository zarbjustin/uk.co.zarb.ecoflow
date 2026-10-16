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

test('Live v1.10.3 meter upgrade/restart retains device identity, settings and totals without adopting Dual CT candidates', async t => {
  let now=100000; t.mock.method(Date,'now',()=>now);
  const baseline=require('./fixtures/live-v1.10.3-contract.json').drivers.find(d=>d.id==='smartmeter');
  const identity=Object.freeze({sn:'BK21SYNTHETICUPGRADE'});
  const first=new TestMeter('load');first.getData=()=>identity;
  for(const cap of baseline.capabilities)first.values.set(cap,null);
  Object.assign(first.store,{importWh:123456,exportWh:654321,sourceSn:'BK61SYNTHETICHOST',ownerMarker:'preserve'});
  const settings=()=>({meter_source:first.source,poll_interval:15});const savedSettings=settings();
  await first.onInit();
  assert.equal(first.getData(),identity);assert.deepEqual(first.subscriptions,[identity.sn]);
  assert.equal(first.values.get('meter_power.imported'),123.456);assert.equal(first.values.get('meter_power.exported'),654.321);
  await first.applyQuota({powGetSysGrid:3600,powGetSysLoad:9999},{source:'mqtt',receivedAt:now});
  now+=1000;
  await first.applyQuota({powGetSysGrid:3600},{source:'mqtt',receivedAt:now});
  assert.equal(first.values.get('meter_power.imported'),123.457);
  const before=first.values.get('meter_power.imported');
  await first.applyQuota({productType:421,515:1e6,773:{4:1e12}},{source:'mqtt',receivedAt:now});
  assert.equal(first.values.get('meter_power.imported'),before,'candidate record must never enter original accounting');
  assert.equal(first.getData(),identity);assert.deepEqual(settings(),savedSettings);
  await first.onUninit();assert.equal(first.timers.size,0);
  assert.equal(first.store.ownerMarker,'preserve');assert.equal(first.store.importWh,123457);
  now+=3600000;
  const restarted=new TestMeter('load');restarted.getData=()=>identity;restarted.store=structuredClone(first.store);
  for(const cap of baseline.capabilities)restarted.values.set(cap,first.values.get(cap));
  await restarted.onInit();
  await restarted.applyQuota({powGetSysGrid:7200},{source:'mqtt',receivedAt:now});
  assert.equal(restarted.values.get('meter_power.imported'),before,'no integration across app downtime');
  assert.equal(restarted.values.get('meter_power.exported'),654.321);
  assert.equal(restarted.getData(),identity);assert.equal(restarted.getReadSn(),'BK61SYNTHETICHOST');
  for(const cap of baseline.capabilities)assert.equal(restarted.hasCapability(cap),true,cap);
  await restarted.onUninit();assert.equal(restarted.timers.size,0);
});

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

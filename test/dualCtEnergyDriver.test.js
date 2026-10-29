'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { varint, scalar } = require('./helpers/dualCtSynthetic');
const { DualCtHomeyEnergyContext } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
const { makeDualCtEnergyCheckpoint, DUAL_CT_ENERGY_CHECKPOINT_KEY } = require('../.homeybuild/lib/dualCtEnergyCheckpoint');
const { dualCtGridBinding } = require('../.homeybuild/lib/dualCtGridEnergySource');
const { dualCtAccountBinding } = require('../.homeybuild/lib/dualCtPreviewPairing');
const sn = 'DUALCTSYNTHETIC01'; const account = { host: 'https://api.ecoflow.com', userId: 'synthetic' };
const identity = { productType: 421, firmware: 'synthetic.1' };
const contract = { id: 'synthetic_contract', ...identity, channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive',
  timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
const binding = dualCtGridBinding({ account: dualCtAccountBinding(account), device: sn, grid: 'homey_property_grid', session: 'one' }, contract);
const nested = (f, bytes) => Buffer.concat([varint(f * 8 + 2), varint(bytes.length), bytes]);
const int = (f, n) => Buffer.concat([varint(f * 8), varint(n)]);
const payload = watts => nested(1, Buffer.concat([nested(1, Buffer.concat([[962, watts], [963, 0], [772, 0], [515, watts],
  [991, 900000], [992, 900000], [993, 900000]].map(([f, n]) => scalar(f, n)))), int(6, 0), int(8, 254), int(9, 21)]));
class Device {
  constructor() {
    this.values = new Map([['measure_power', 99], ['meter_power.imported', null], ['meter_power.exported', null]]);
    this.store = new Map(Object.entries({ dualCtEnergyConsent: 1, dualCtEnergySourceBinding: binding,
      dualCtEnergyAccountBinding: dualCtAccountBinding(account), dualCtEnergyGrid: 'homey_property_grid' }));
    this.writes = []; this.timers = new Map(); this.subscriptions = []; this.detached = [];
    const settings = new EventEmitter(); settings.get = () => null;
    this.homey = { settings, __: () => 'Energy source unavailable',
      app: { subscribeAppRealtime: async (_sn, handler) => { this.subscriptions.push(handler); return true; },
        unsubscribeAppRealtime: (_sn, handler) => this.detached.push(handler) },
      setInterval: (fn, ms) => { const id = Symbol(); this.timers.set(id, { fn, ms, interval: true }); return id; },
      clearInterval: id => this.timers.delete(id), setTimeout: (fn, ms) => { const id = Symbol(); this.timers.set(id, { fn, ms, interval: false }); return id; },
      clearTimeout: id => this.timers.delete(id) };
  }
  getData() { return { sn }; }
  getCapabilityValue(key) { return this.values.get(key); }
  getStoreValue(key) { return this.store.get(key); }
  async setStoreValue(key, value) { this.writes.push(['store', key]); this.store.set(key, value); }
  async setCapabilityValue(id, value) { this.writes.push(['cap', id, value]); this.values.set(id, value); }
  async setCapabilityOptions() {}
  async setEnergy(value) { this.writes.push(['energy', value]); }
  async setUnavailable() { this.available = false; }
  async setAvailable() { this.available = true; }
}
const originalLoad = Module._load;
let Driver;
try { Module._load = function (name, ...args) { return name === 'homey' ? { Device } : originalLoad.call(this, name, ...args); };
  Driver = require('../.homeybuild/drivers/smartmeter_dual_ct_energy/device');
} finally { Module._load = originalLoad; }
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
function enabled(device) {
  device.energyDependencies = () => ({ enabled: () => true, resolve: () => contract,
    context: () => new DualCtHomeyEnergyContext({ homey: device.homey, sn, now: Date.now,
      client: () => ({ getSession: async () => account, getDeviceList: async () => [{ sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] }] }),
      readFirmware: async () => identity.firmware, reader: async () => ({ list: async () => ({}), close() {} }) }) });
}
test('registered Energy driver stays unavailable by default without auth, subscriptions, timers, store writes or resets', async () => {
  const d = new Driver(); d.values.set('meter_power.imported', 9); d.values.set('meter_power.exported', 8); await d.onInit();
  assert.equal(d.available, false); assert.equal(d.values.get('measure_power'), null);
  assert.equal(d.values.get('meter_power.imported'), 9); assert.equal(d.values.get('meter_power.exported'), 8);
  assert.equal(d.subscriptions.length, 0); assert.equal(d.timers.size, 0);
  assert.equal(d.writes.some(row => row[0] === 'store' || row[0] === 'energy'), false);
  await d.onUninit(); assert.equal(d.homey.settings.listenerCount('set'), 0);
});
test('real driver/session persists CT1-only totals, handles expiry, account changes and late callbacks', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d); await d.onInit();
  assert.equal(d.subscriptions.length, 1); const handler = d.subscriptions[0];
  handler(payload(3600), `/app/device/property/${sn}`); await settle();
  now = 2000; handler(payload(3600), `/app/device/property/${sn}`); await settle();
  assert.equal(d.available, true); assert.equal(d.values.get('measure_power'), 3600);
  assert.ok(Math.abs(d.values.get('meter_power.imported') - 0.001) < 1e-9);
  assert.equal(d.values.get('meter_power.exported'), 0);
  const persist = d.writes.findIndex(row => row[0] === 'store');
  const projection = d.writes.findIndex(row => row[0] === 'cap' && row[1] === 'meter_power.imported');
  assert.ok(persist < projection, 'persist before Homey projection');
  const total = d.values.get('meter_power.imported');
  now = 92000; d.timers.values().next().value.fn(); await settle();
  assert.equal(d.available, false); assert.equal(d.values.get('measure_power'), null);
  assert.equal(d.values.get('meter_power.imported'), total); assert.equal(d.detached.includes(handler), true);
  handler(payload(900000), `/app/device/property/${sn}`); await settle(); assert.equal(d.values.get('meter_power.imported'), total);
  await d.onUninit(); assert.equal(d.timers.size, 0);
});
test('one process authority blocks a second device and credential edits synchronously detach the first', async t => {
  t.mock.method(Date, 'now', () => 1000);
  const first = new Driver(); enabled(first); const second = new Driver(); enabled(second);
  try {
    await first.onInit(); await second.onInit();
    assert.equal(first.subscriptions.length, 1); assert.equal(second.subscriptions.length, 0);
    assert.equal(second.writes.some(row => row[0] === 'store'), false);
    first.homey.settings.emit('set', 'appAuthPassword');
    assert.equal(first.detached.length, 1); await settle(); assert.equal(first.available, false);
  } finally { await first.onUninit(); await second.onUninit(); }
});

test('missing or older native checkpoint cannot overwrite already projected cumulative energy', async t => {
  t.mock.method(Date, 'now', () => 1000);
  for (const existing of [false, true]) {
    const d = new Driver(); enabled(d); d.values.set('meter_power.imported', 9);
    if (existing) d.store.set(DUAL_CT_ENERGY_CHECKPOINT_KEY, makeDualCtEnergyCheckpoint(binding, contract.timing, 1, 8000, 0));
    await d.onInit();
    assert.equal(d.subscriptions.length, 0); assert.equal(d.values.get('meter_power.imported'), 9);
    assert.equal(d.writes.some(row => row[0] === 'store'), false);
    await d.onUninit();
  }
});
test('new runtime instance restores committed totals and establishes a new anchor without downtime backfill', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const first = new Driver(); enabled(first); await first.onInit();
  first.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  now = 2000; first.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  await first.onUninit();
  const second = new Driver(); enabled(second); second.store = new Map(first.store); second.values = new Map(first.values);
  now = 102000; await second.onInit(); assert.equal(second.subscriptions.length, 1);
  assert.equal(second.values.get('meter_power.imported'), first.values.get('meter_power.imported'));
  second.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  assert.ok(Math.abs(second.values.get('meter_power.imported') - 0.001) < 1e-9);
  now += 1000; second.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  assert.ok(Math.abs(second.values.get('meter_power.imported') - 0.002) < 1e-9);
  await second.onUninit();
});

test('a queued old expiry tick cannot call an adapter or reader after teardown', async t => {
  t.mock.method(Date, 'now', () => 1000);
  const d = new Driver(); enabled(d); await d.onInit();
  const tick = [...d.timers.values()].find(timer => timer.interval).fn;
  const adapter = d.adapter; await d.onUninit();
  let calls = 0; adapter.refresh = async () => { calls++; };
  tick(); await settle(); assert.equal(calls, 0); assert.equal(d.timers.size, 0);
});

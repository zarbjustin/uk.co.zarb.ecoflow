'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let BaseEcoFlowDevice;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: class {} };
    return originalLoad.call(this, request, ...args);
  };
  ({ BaseEcoFlowDevice } = require('../.homeybuild/lib/BaseEcoFlowDevice'));
} finally { Module._load = originalLoad; }

function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

class QueueDevice extends BaseEcoFlowDevice {
  constructor() {
    super(); this.applied = []; this.teardowns = 0; this.available = false;
    this.homey = {
      settings: { get: (key) => ({ accessKey: 'test-key', secretKey: 'test-secret' })[key] },
      setInterval: () => 1, clearInterval() {},
      app: { subscribeRealtime: async (_sn, callback) => { this.emit = callback; }, unsubscribeRealtime() {} },
    };
  }
  getReadSn() { return 'BK61TEST00000001'; }
  getSetting() { return 30; }
  getAvailable() { return this.available; }
  async setAvailable() { this.available = true; }
  async setUnavailable() { this.available = false; }
  log() {}
  error(...args) { throw new Error(args.join(' ')); }
  async onReady() { this.client = { getQuotaAll: async () => ({}) }; }
  async applyQuota(quota, context) {
    if (quota.hold) await quota.hold;
    this.applied.push({ quota, context });
  }
  async onTeardown() { this.teardowns += 1; }
}

test('write gate refreshes rotated credentials before using the client', async () => {
  const device = new QueueDevice(); await device.onInit();
  let refreshed = false;
  device.refreshClientCredentials = () => {
    refreshed = true; device.client = { setQuota: async (payload) => payload };
  };
  assert.deepEqual(await device.writeQuota({ sn: device.getReadSn() }), { sn: device.getReadSn() });
  assert.equal(refreshed, true);
  await device.onUninit();
});

test('socket readback uses uncached documented targeted quota reads, not aggregate GET', async () => {
  const device = new QueueDevice(); await device.onInit();
  const calls = [];
  device.refreshClientCredentials = () => {};
  device.client = {
    getQuota: async (sn, fields) => { calls.push({ sn, fields }); return { relay2Onoff: true }; },
    getQuotaAll: async () => { throw new Error('wrong aggregate route'); },
  };
  assert.deepEqual(await device.readControlQuota('BK31SOCKET', ['relay2Onoff']), { relay2Onoff: true });
  assert.deepEqual(calls, [{ sn: 'BK31SOCKET', fields: ['relay2Onoff'] }]);
  await device.onUninit();
});

test('new MQTT in the same millisecond supersedes an in-flight REST counter reply', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const device = new QueueDevice(); await device.onInit(); device.applied = [];
  const reply = deferred(); device.client.getQuotaAll = () => reply.promise;
  const poll = device.poll();
  device.emit({ accuChgEnergy: 1200 });
  reply.resolve({ accuChgEnergy: 1000 });
  await poll; await device.applyChain;
  assert.deepEqual(device.applied.map((s) => s.quota.accuChgEnergy), [1200]);
  await device.onUninit();
});

test('REST queued behind a slow apply is checked again when newer MQTT arrives', async (t) => {
  t.mock.method(Date, 'now', () => 100000);
  const device = new QueueDevice(); await device.onInit(); device.applied = [];
  const held = deferred();
  device.emit({ hold: held.promise, accuChgEnergy: 1000 });
  await Promise.resolve();
  device.client.getQuotaAll = async () => ({ accuChgEnergy: 1050 });
  const poll = device.poll();
  await Promise.resolve(); await Promise.resolve();
  device.emit({ accuChgEnergy: 1200 });
  held.resolve();
  await poll; await device.applyChain;
  assert.deepEqual(device.applied.map((s) => s.quota.accuChgEnergy), [1000, 1200]);
  await device.onUninit();
});

test('queued telemetry keeps its receipt timestamp and teardown waits before flushing', async (t) => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const device = new QueueDevice(); await device.onInit(); device.applied = [];
  const held = deferred(); device.emit({ hold: held.promise });
  now += 60000; device.emit({ powGetBpCms: 600 });
  const teardown = device.onUninit();
  await Promise.resolve(); assert.equal(device.teardowns, 0);
  now += 300000; held.resolve();
  await teardown;
  assert.equal(device.applied[1].context.receivedAt, 160000);
  assert.equal(device.applied[1].context.source, 'mqtt');
  assert.equal(device.teardowns, 1);
});

test('a REST reply arriving after teardown cannot change energy after the final flush', async () => {
  const device = new QueueDevice(); await device.onInit(); device.applied = [];
  const reply = deferred(); device.client.getQuotaAll = () => reply.promise;
  const poll = device.poll();
  await device.onUninit();
  reply.resolve({ accuChgEnergy: 2000 });
  await poll;
  device.emit({ accuChgEnergy: 2100 });
  await device.applyChain;
  assert.deepEqual(device.applied, []);
});

test('initial REST completion after shutdown cannot restart polling or access a destroyed app', async () => {
  const device = new QueueDevice();
  const reply = deferred();
  const entered = deferred();
  device.onReady = async () => {
    device.client = { getQuotaAll: () => { entered.resolve(); return reply.promise; } };
  };
  let intervals = 0;
  device.homey.setInterval = () => { intervals += 1; return intervals; };
  const init = device.onInit();
  await entered.promise;
  await device.onUninit();
  Object.defineProperty(device.homey, 'app', { get() { throw new Error('app instance destroyed'); } });
  reply.resolve({});
  await init;
  assert.equal(intervals, 0);
  assert.deepEqual(device.applied, []);
});

test('late BK subscription releases captured handlers without accessing a destroyed app', async () => {
  const device = new QueueDevice();
  const reply = deferred();
  const entered = deferred();
  let intervals = 0;
  let cleared = 0;
  let unsubscribed = 0;
  device.homey.setInterval = () => { intervals += 1; return intervals; };
  device.homey.clearInterval = () => { cleared += 1; };
  device.homey.app = {
    subscribeRealtime: async () => { entered.resolve(); return reply.promise; },
    unsubscribeRealtime: () => { unsubscribed += 1; },
  };
  const init = device.onInit();
  await entered.promise;
  await device.onUninit();
  Object.defineProperty(device.homey, 'app', { get() { throw new Error('app instance destroyed'); } });
  reply.resolve(true);
  await init;
  assert.equal(intervals, cleared);
  assert.equal(unsubscribed, 2, 'unsubscribe before and after the pending connection settles');
  let polls = 0;
  device.client.getQuotaAll = async () => { polls += 1; return {}; };
  await device.poll();
  assert.equal(polls, 0);
});

const { reconcileStreamQuota } = require('../.homeybuild/lib/streamQuotaReconciliation');
const { mapStreamQuota } = require('../.homeybuild/lib/streamMapping');
class StreamQueueDevice extends QueueDevice {
  reconcileRestQuota(quota, fields) { return reconcileStreamQuota(quota, fields); }
}

test('original STREAM temperature MQTT cannot starve repeated REST SOC/power polls', async t => {
  t.mock.method(Date, 'now', () => 100000);
  const device = new StreamQueueDevice(); await device.onInit(); device.applied = [];
  for (let n = 0; n < 4; n++) {
    const reply = deferred(); device.client.getQuotaAll = () => reply.promise;
    const poll = device.poll();
    device.emit({ maxCellTemp: 30 + n });
    reply.resolve({ temp: 20, cmsBattSoc: 70 + n, powGetBpCms: -200, accuDsgEnergy: 1000 + n });
    await poll; await device.applyChain;
  }
  const rest = device.applied.filter(s => s.context.source === 'rest');
  assert.deepEqual(rest.map(s => s.quota.cmsBattSoc), [70, 71, 72, 73]);
  assert.ok(rest.every(s => !('temp' in s.quota)));
  assert.deepEqual(rest.map(s => s.quota.accuDsgEnergy), [1000, 1001, 1002, 1003]);
  await device.onUninit();
});

test('queued original REST protects newer counter pair and derived power/state/time, preserving unrelated SOC', async t => {
  t.mock.method(Date, 'now', () => 100000);
  const device = new StreamQueueDevice(); await device.onInit(); device.applied = [];
  const held = deferred(); device.emit({ hold: held.promise }); await Promise.resolve();
  device.client.getQuotaAll = async () => ({ accuChgEnergy: 1000, accuDsgEnergy: 900,
    powGetBpCms: -300, cmsDsgRemTime: 60, cmsBattSoc: 75, maxCellTemp: 22 });
  const poll = device.poll(); await Promise.resolve(); await Promise.resolve();
  device.emit({ accuChgEnergy: 1200, powGetBpCms: 0 });
  held.resolve(); await poll; await device.applyChain;
  const rest = device.applied.find(s => s.context.source === 'rest').quota;
  assert.deepEqual(rest, { cmsBattSoc: 75, maxCellTemp: 22 });
  assert.equal(mapStreamQuota(rest).battery_charging_state, undefined);
  assert.equal(device.applied.at(-1).quota.accuChgEnergy, 1200);
  await device.onUninit();
});

test('original reconciliation withholds aliases and complete derived groups without merging partial samples', () => {
  const rest = { temp: 20, maxCellTemp: 21, soh: 95, cmsBattSoh: 96,
    powGetPvSum: 300, powGetPv: 100, plugInInfoPvAmp: 2, plugInInfoPvVol: 40,
    'energyStrategyOperateMode.operateSelfPoweredOpen': 1,
    'energyStrategyOperateMode.operateScheduledOpen': 0,
    powGetSysGrid: 50, cmsBattSoc: 80 };
  const result = reconcileStreamQuota(rest, new Set(['maxCellTemp', 'bmsBattSoh', 'plugInInfoPvAmp',
    'energyStrategyOperateMode.operateScheduledOpen', 'cmsBattSoc']));
  assert.deepEqual(result, { powGetSysGrid: 50 });
  assert.equal(mapStreamQuota(result)['measure_power.pv'], undefined);
  assert.equal(mapStreamQuota(result).operating_mode, undefined);
  assert.equal(rest.cmsBattSoc, 80, 'shared cached reply remains unchanged');
  assert.deepEqual(reconcileStreamQuota({ cmsBattSoc: 30 }, new Set(['cmsBattSoc'])), {});
});

test('obsolete REST zero and invalid MQTT fields do not revive older readings', async () => {
  const device = new StreamQueueDevice(); await device.onInit(); device.applied = [];
  const reply = deferred(); device.client.getQuotaAll = () => reply.promise;
  const poll = device.poll(); device.emit({ cmsBattSoc: null, powGetBpCms: 0 });
  reply.resolve({ cmsBattSoc: 40, powGetBpCms: -300, temp: 25 });
  await poll; await device.applyChain;
  assert.deepEqual(device.applied.find(s => s.context.source === 'rest').quota, { temp: 25 });
  assert.equal(device.applied[0].quota.powGetBpCms, 0);
  await device.onUninit();
});

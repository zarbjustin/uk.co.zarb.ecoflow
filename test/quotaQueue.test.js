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

function deferred() { let resolve; let reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }

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

test('REST and MQTT contexts retain their actual source when the current read target changes', async () => {
  const device = new QueueDevice();
  await device.onInit();
  device.applied = [];
  const original = device.getReadSn();
  let readSn = original;
  device.getReadSn = () => readSn;
  const reply = deferred();
  device.client.getQuotaAll = sn => { assert.equal(sn, original); return reply.promise; };
  const poll = device.poll();
  readSn = 'BK61NEWMAIN00001';
  reply.resolve({ marker: 'old-rest-target' });
  await poll;
  device.emit({ marker: 'old-subscription' });
  await device.applyChain;
  assert.deepEqual(device.applied.map(sample => sample.context.sourceSn), [original, original]);
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

for (const failedOldReply of [false, true]) {
  test(`same-instance reinitialization owns its poll and ignores retired ${failedOldReply ? 'errors' : 'responses'}`, async () => {
    const device = new QueueDevice();
    let readSn = 'BK61OLDSOURCE001';
    device.getReadSn = () => readSn;
    await device.onInit();
    device.applied = [];
    const retiredQuota = device.emit;
    const oldReply = deferred();
    device.client.getQuotaAll = () => oldReply.promise;
    const oldPoll = device.poll();
    await device.onUninit();
    readSn = 'BK61NEWSOURCE001';
    const newReply = deferred();
    const bound = deferred();
    const requests = [];
    device.onReady = async () => {
      device.available = false;
      device.client = { getQuotaAll: async sn => { requests.push(sn); return newReply.promise; } };
    };
    device.beforeFirstPoll = async () => { bound.resolve(); };
    const init = device.onInit().then(() => undefined, error => error);
    await bound.promise;
    await new Promise(setImmediate);
    const requestsBeforeOldReply = [...requests];
    if (failedOldReply) oldReply.reject({ code: 1006, message: 'synthetic retired API error' });
    else oldReply.resolve({ marker: 'retired-source' });
    await oldPoll;
    retiredQuota({ marker: 'retired-subscription' });
    await device.applyChain;
    assert.deepEqual(requestsBeforeOldReply, [readSn], 'new initialization must start its own source request');
    assert.equal(device.available, false, 'retired work cannot revive the newly bound device');
    assert.deepEqual(device.applied, [], 'retired callbacks cannot enter the new application session');
    const followingPoll = device.poll();
    await Promise.resolve();
    assert.deepEqual(requests, [readSn], 'old finally must not clear the new outstanding poll');
    newReply.resolve({ marker: 'current-source' });
    const [initError] = await Promise.all([init, followingPoll]);
    assert.equal(initError, undefined);
    assert.equal(device.available, true);
    assert.deepEqual(device.applied.map(sample => sample.quota.marker), ['current-source']);
    await device.onUninit();
  });
}

test('held realtime availability drains before reinitialization and coalesces repeated status callbacks', async () => {
  const device = new QueueDevice();
  device.handlesStatus = () => true;
  device.homey.app.subscribeRealtime = async (_sn, quota, status) => { device.emit = quota; device.emitStatus = status; };
  await device.onInit();
  device.available = false;
  const held = deferred();
  const entered = deferred();
  let availabilityWrites = 0;
  device.setAvailable = async () => { availabilityWrites++; entered.resolve(); await held.promise; device.available = true; };
  const retiredStatus = device.emitStatus;
  retiredStatus(true);
  await entered.promise;
  for (let n = 0; n < 1000; n++) retiredStatus(true);
  let stopped = false;
  const teardown = device.onUninit().then(() => { stopped = true; });
  const newReply = deferred();
  const newEntered = deferred();
  let newRequests = 0;
  device.getReadSn = () => 'BK61NEXTSOURCE01';
  device.onReady = async () => {
    device.available = false;
    device.setAvailable = async () => { device.available = true; };
    device.client = { getQuotaAll: async () => { newRequests++; newEntered.resolve(); return newReply.promise; } };
  };
  const init = device.onInit();
  await new Promise(setImmediate);
  const stoppedBeforeRelease = stopped;
  const requestsBeforeRelease = newRequests;
  held.resolve();
  await teardown;
  await newEntered.promise;
  assert.equal(stoppedBeforeRelease, false, 'teardown owns an already-started availability write');
  assert.equal(requestsBeforeRelease, 0, 'new initialization waits for teardown before rebinding');
  assert.equal(availabilityWrites, 1, 'repeated pending statuses are bounded and not replayed after shutdown');
  assert.equal(device.available, false, 'current lifecycle remains unavailable before its own response');
  retiredStatus(true);
  await device.applyChain;
  assert.equal(device.available, false);
  newReply.resolve({});
  await init;
  assert.equal(device.available, true);
  await device.onUninit();
});

for (const reason of ['missing credentials', 'known-model quarantine', 'runtime quarantine']) {
  test(`held ${reason} availability cannot escape teardown`, async () => {
    const device = new QueueDevice();
    device.error = () => {};
    if (reason === 'missing credentials') device.homey.settings.get = () => undefined;
    else if (reason === 'known-model quarantine') device.getReadSn = () => 'ES22SYNTHETIC001';
    else {
      await device.onInit();
      device.getReadSn = () => 'ZZ99SYNTHETIC001';
      device.client.getQuotaAll = async () => { throw { code: 1006 }; };
      await device.poll();
      await device.poll();
    }
    let release; let entered;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    device.setUnavailable = async () => { entered(); await held; device.available = false; };
    const operation = reason === 'runtime quarantine' ? device.poll() : device.onInit();
    await started;
    let stopped = false;
    const teardown = device.onUninit().then(() => { stopped = true; });
    await new Promise(setImmediate);
    const stoppedBeforeRelease = stopped;
    release();
    await Promise.all([operation, teardown]);
    assert.equal(stoppedBeforeRelease, false, 'initialization and quarantine writes belong to the lifecycle too');
  });
}

for (const online of [true, false]) {
  test(`held REST ${online ? 'online' : 'error/offline'} availability is owned by teardown`, async t => {
    t.mock.method(Date, 'now', () => 1000000000);
    const device = new QueueDevice();
    await device.onInit();
    device.available = !online;
    device.error = () => {};
    const held = deferred();
    const entered = deferred();
    const write = async () => { entered.resolve(); await held.promise; device.available = online; };
    if (online) device.setAvailable = write;
    else device.setUnavailable = write;
    device.client.getQuotaAll = async () => {
      if (!online) throw new Error('synthetic REST failure');
      return {};
    };
    const poll = device.poll();
    await entered.promise;
    let stopped = false;
    const teardown = device.onUninit().then(() => { stopped = true; });
    await new Promise(setImmediate);
    const stoppedBeforeRelease = stopped;
    held.resolve();
    await Promise.all([poll, teardown]);
    assert.equal(stoppedBeforeRelease, false, 'REST availability cannot outlive teardown');
  });
}

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

test('poll after newer MQTT cannot replay a shared cached REST counter or power value', async t => {
  const { EcoFlowClient } = require('../.homeybuild/lib/EcoFlowClient');
  EcoFlowClient.responseCache.clear();
  t.after(() => EcoFlowClient.responseCache.clear());
  t.mock.method(Date, 'now', () => 100000);
  const device = new StreamQueueDevice();
  await device.onInit();
  device.applied = [];
  device.refreshClientCredentials = () => {};
  const client = new EcoFlowClient({ accessKey: 'cache-regression', secretKey: 'synthetic' });
  let reads = 0;
  client.request = async () => (++reads === 1
    ? { accuChgEnergy: 1000, powGetBpCms: 600 }
    : { accuChgEnergy: 1200, powGetBpCms: -600 });
  device.client = client;
  await client.getQuotaAll(device.getReadSn());
  device.emit({ accuChgEnergy: 1200, powGetBpCms: -600 });
  await device.applyChain;
  await device.poll();
  assert.deepEqual(device.applied.map(s => s.quota.accuChgEnergy), [1200, 1200]);
  assert.ok(device.applied.every(s => s.quota.powGetBpCms === -600));
  assert.equal(reads, 2, 'an accounting poll must obtain its own current response');
  await device.onUninit();
});

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
  assert.deepEqual(result, { powGetPvSum: 300, powGetSysGrid: 50 });
  assert.equal(mapStreamQuota(result)['measure_power.pv'], 300);
  assert.equal(mapStreamQuota(result).operating_mode, undefined);
  assert.equal(rest.cmsBattSoc, 80, 'shared cached reply remains unchanged');
  assert.deepEqual(reconcileStreamQuota({ cmsBattSoc: 30 }, new Set(['cmsBattSoc'])), {});
});

test('unit-only MQTT cannot starve REST system PV, but newer system PV remains authoritative', async () => {
  const device = new StreamQueueDevice(); await device.onInit(); device.applied = [];
  for (let n = 0; n < 3; n += 1) {
    const reply = deferred(); device.client.getQuotaAll = () => reply.promise;
    const poll = device.poll();
    device.emit({ powGetPv: 400 });
    reply.resolve({ powGetPvSum: 1200, powGetPv: 300 });
    await poll; await device.applyChain;
    assert.deepEqual(device.applied.at(-1).quota, { powGetPvSum: 1200 });
  }
  const reply = deferred(); device.client.getQuotaAll = () => reply.promise;
  const poll = device.poll();
  device.emit({ powGetPvSum: 0 });
  reply.resolve({ powGetPvSum: 1200 });
  await poll; await device.applyChain;
  assert.deepEqual(device.applied.at(-1).quota, { powGetPvSum: 0 });
  await device.onUninit();
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

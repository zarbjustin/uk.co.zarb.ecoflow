'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { listenSolar, offerSolarFrame, SolarGeneration, solarStoredWh } = require('../.homeybuild/lib/stream5000Solar');
const captures = require('./fixtures/stream5000PvResearch.json');
const auth = require('../.homeybuild/lib/appAuthPairing');
const { unit_a: A, unit_b: B } = captures;
const session = { host: 'https://api-e.ecoflow.com', userId: 'solar-test' };

function vi(value) {
  const bytes = [];
  do { bytes.push((value & 127) + (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return Buffer.from(bytes);
}
function bytes(key, data) {
  return Buffer.concat([vi(key * 8 + 2), vi(data.length), Buffer.from(data)]);
}
function float(key, watts) {
  const encoded = Buffer.alloc(4);
  encoded.writeFloatLE(watts);
  return Buffer.concat([vi(key * 8 + 5), encoded]);
}
function entry(sn, ...fields) {
  return bytes(1, Buffer.concat([bytes(1, sn), ...fields]));
}
function frame(sn, data) {
  return bytes(1, Buffer.concat([bytes(1, data), vi(64), vi(254), vi(72), vi(39), bytes(25, sn)]));
}
const report = (sn, ...entries) => frame(sn, bytes(50, Buffer.concat(entries)));
const receipt = (at, extras = {}) => ({
  retained: false, duplicate: false, receivedAt: at, receivedMonoMs: at,
  connectionEpoch: 1, isCurrent: () => true, ...extras,
});
const topic = sn => '/app/device/property/' + sn;
const send = (homey, sn, data, at, extras) => offerSolarFrame(homey, data, topic(sn), receipt(at, extras));

test('linked ES21 sources count their explicit MPPT totals once across two live reporter topics', () => {
  const homey = {};
  const meters = [A, B].map(sn => {
    const meter = new SolarGeneration(0);
    listenSolar(homey, sn, (reporter, w, r) => meter.observe(reporter, w, r, r.receivedAt));
    return meter;
  });
  const data = Buffer.from(captures.frames[2].pdata_hex, 'hex');
  for (const at of [1000, 61000]) {
    send(homey, B, frame(B, data), at);
    send(homey, A, frame(A, data), at + 1);
  }
  const [a, b] = meters;
  assert.equal(a.power(61001), 216);
  assert.ok(Math.abs(b.power(61001) - 201.96947) < 0.001);
  assert.ok(Math.abs(a.wh + b.wh - (216 + 201.96947) / 60) < 0.0001);
  assert.throws(() => listenSolar(homey, A, () => {}), /Duplicate/);
});

test('the MQTT router offers one solar frame per transport delivery even with multiple drivers subscribed', () => {
  const { EcoFlowAppMqtt } = require('../.homeybuild/lib/EcoFlowAppMqtt');
  const app = {}; const observed = [];
  listenSolar(app, A, (_, watts) => observed.push(watts));
  const mqtt = new EcoFlowAppMqtt({ client: {}, observeSolar: (...args) => offerSolarFrame(app, ...args) });
  mqtt.client = { connected: true }; mqtt.connectionEpoch = 1;
  mqtt.handlers.set(B, new Set([() => {}, () => {}]));
  const data = report(B, entry(A, float(3, 216)));
  const delivery = { retain: false, dup: false };
  mqtt.onMessage(topic(B), data, delivery);
  mqtt.onMessage(topic(B), data, { ...delivery, dup: true });
  mqtt.onMessage(topic(B), data, { ...delivery, retain: true });
  mqtt.handlers.delete(B);
  mqtt.onMessage(topic(B), data, delivery);
  assert.deepEqual(observed, [216]);
});

test('unrelated, duplicate, retained, wrong-topic and retired deliveries cannot renew solar generation', () => {
  const homey = {}; const readings = [];
  const off = listenSolar(homey, A, (_, w) => readings.push(w));
  const data = report(A, entry(A, float(3, 100)));
  send(homey, A, data, 1000);
  for (const extras of [{ duplicate: true }, { retained: true }, { isCurrent: () => false }, { connectionEpoch: undefined }]) {
    send(homey, A, data, 2000, extras);
  }
  offerSolarFrame(homey, data, '/app/user/' + A + '/thing/property/get_reply', receipt(2000));
  send(homey, B, data, 2000); // Foreign header
  send(homey, A, report(A, entry(B, float(3, 500))), 2000);
  send(homey, A, frame(A, bytes(11, float(9, 900))), 2000); // system solar node
  assert.deepEqual(readings, [100]);
  send(homey, A, report(A, entry(A, float(9, 120))), 3000);
  send(homey, A, report(A, entry(A)), 4000);
  send(homey, A, report(A, entry(A, float(3, -1))), 5000);
  send(homey, A, report(A, entry(A, float(3, 50)), entry(A, float(3, 40))), 6000);
  send(homey, A, report(A, entry(A, float(3, 0))), 7000);
  assert.deepEqual(readings, [100, null, null, null, null, 0]);
  off(); send(homey, A, data, 8000); assert.equal(readings.length, 6);
});

test('expiry, failover, reconnect and invalid readings re-anchor without downtime fill', () => {
  const g = new SolarGeneration(2);
  const obs = (src, w, t, epoch = 1) => g.observe(src, w, receipt(t, { connectionEpoch: epoch }), t);
  obs(B, 600, 1000); obs(B, 600, 61000); assert.equal(g.wh, 12);
  obs(A, 1200, 91000); assert.equal(g.wh, 12);
  obs(B, 900, 50000); assert.equal(g.power(91000), 600);
  assert.equal(g.power(241000), null);
  obs(A, 1200, 241000); assert.equal(g.wh, 12);
  obs(A, 1200, 242000, 2); assert.equal(g.wh, 12);
  obs(A, null, 243000, 2); obs(A, 0, 244000, 2);
  assert.equal(g.wh, 12); assert.equal(g.power(244000), 0);
  assert.equal(g.power(240000), null);
  assert.equal(g.power(244001), null, 'a clock correction cannot resurrect an invalidated anchor');
});

test('solar restart restores a precise same-unit counter and protects unsupported history', () => {
  assert.equal(solarStoredWh({ version: 1, sn: A, wh: 1000.6 }, 1.001, A), 1000.6);
  assert.equal(solarStoredWh({ version: 1, sn: A, wh: 1000.6 }, 1.005, A), 1.005 * 1000);
  assert.equal(solarStoredWh({ version: 1, sn: A, wh: 0 }, 1, B), null);
  assert.equal(solarStoredWh({ version: 2, sn: A, wh: 0 }, 1, A), null);
  assert.equal(solarStoredWh(null, -1, A), null);
  assert.equal(solarStoredWh(null, null, A), 0);
});

function loadDriver(name) {
  const load = Module._load;
  try {
    Module._load = function(request, ...args) {
      if (request === 'homey') return { Device: class {}, Driver: class {} };
      return load.call(this, request, ...args);
    };
    return require('../.homeybuild/drivers/stream_5000_solar/' + name);
  } finally { Module._load = load; }
}

test('pairing separates original/AC/shared devices and binds add to a listed physical ES21', async t => {
  const Driver = loadDriver('driver'); const driver = new Driver(); const handlers = new Map();
  const client = { getSession: async () => session, getDeviceList: async () =>
    [A, B, 'ES22TESTAC5000', 'BK61TESTULTRA', 'ES21TESTSHARED'].map(sn => ({ sn, shared: sn.endsWith('SHARED') })) };
  driver.homey = { __: key => key }; driver.getDevices = () => [{ getData: () => ({ sn: A }) }];
  let beforeAdd;
  t.mock.method(auth, 'registerAppAuthHandlers', (_, __, options) => {
    beforeAdd = options.beforeAdd; return { getClient: () => client };
  });
  await driver.onPair({ setHandler: (key, fn) => handlers.set(key, fn) });
  const list = await handlers.get('list_devices')();
  assert.deepEqual(list.map(d => d.data), [{ sn: B }]);
  assert.throws(() => beforeAdd({ ...list[0], data: { sn: A } }));
  assert.throws(() => beforeAdd({ ...list[0], store: { solarAccountBinding: 'wrong' } }));
  assert.throws(() => beforeAdd({ ...list[0], store: { ...list[0].store, solarGeneration: { version: 1, sn: B, wh: 99999 } } }));
  beforeAdd(list[0]); assert.throws(() => beforeAdd(list[0]));
});

test('real solar device projects native W/kWh, expires live power and preserves totals across restart', async t => {
  const Device = loadDriver('device'); let now = 100000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(auth, 'appAuthClientFromSettings', () => ({ getSession: async () => session, getDeviceList: async () => [{ sn: A, shared: false }] }));
  const settings = new EventEmitter(); const intervals = new Set(); const subscribed = new Set();
  settings.get = () => undefined;
  const homey = { settings, __: key => key, setInterval: fn => { intervals.add(fn); return fn; },
    clearInterval: fn => intervals.delete(fn), setTimeout: () => 1, clearTimeout: () => {},
    app: { subscribeAppRealtime: async (_, fn) => { subscribed.add(fn); return true; },
      unsubscribeAppRealtime: (_, fn) => subscribed.delete(fn) } };
  const values = { measure_power: 999, meter_power: 1.001 };
  const store = { solarAccountBinding: auth.appAccountBinding(session), solarGeneration: { version: 1, sn: A, wh: 1000.6 } };
  const start = async () => {
    const d = new Device();
    Object.assign(d, { homey, getData: () => ({ sn: A }), getStoreValue: key => store[key],
      setStoreValue: async (key, v) => { store[key] = v; }, getCapabilityValue: key => values[key],
      setCapabilityValue: async (key, v) => { values[key] = v; }, getAvailable: () => d.available,
      setAvailable: async () => { d.available = true; }, setUnavailable: async () => { d.available = false; },
      error: assert.fail });
    await d.onInit(); return d;
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const snapshot = report(A, entry(A, float(3, 600)), entry(B, float(3, 900)));
  let d = await start();
  send(homey.app, A, snapshot, now); now += 60000; send(homey.app, A, snapshot, now); await flush();
  assert.equal(values.measure_power, 600); assert.equal(d.available, true);
  assert.equal(values.meter_power, 1.0106);
  now += 180000; for (const fn of intervals) fn(); await flush();
  assert.equal(values.measure_power, null); assert.equal(d.available, false); assert.equal(values.meter_power, 1.0106);
  await d.onUninit(); assert.equal(store.solarGeneration.wh, 1010.6);
  assert.equal(subscribed.size, 0); assert.equal(intervals.size, 0);
  d = await start(); now += 600000; send(homey.app, A, snapshot, now); await flush();
  assert.equal(values.meter_power, 1.0106);
  settings.emit('set', 'appAuthEmail');
  send(homey.app, A, snapshot, now + 1000); await flush();
  assert.equal(values.measure_power, null); assert.equal(subscribed.size, 0);
  await d.onUninit(); assert.equal(settings.listenerCount('set'), 0);
});

const C = 'ES21TESTNEWMAIN';

async function solarRig(t, { keys = true, peers = [A, B, C] } = {}) {
  const { EcoFlowAppMqtt } = require('../.homeybuild/lib/EcoFlowAppMqtt');
  const pairing = require('../.homeybuild/lib/pairing');
  const Device = loadDriver('device');
  let now = 100000;
  const rig = { main: B, lookups: 0, warnings: [], inventory: peers.map(sn => ({ sn, shared: false })) };
  t.mock.method(Date, 'now', () => now);
  t.mock.method(auth, 'appAuthClientFromSettings', () => ({
    getSession: async () => session, getDeviceList: async () => rig.inventory,
  }));
  t.mock.method(pairing, 'clientFromSettings', () => ({
    getMainSn: async (sn, options) => {
      assert.equal(sn, A); assert.equal(options.fresh, true);
      rig.lookups++;
      if (rig.pending) return rig.pending;
      if (rig.failure) throw Error('test lookup unavailable');
      return rig.main;
    },
  }));
  const settings = new EventEmitter();
  settings.get = key => keys && ['accessKey', 'secretKey'].includes(key) ? 'synthetic' : undefined;
  const mqtt = new EcoFlowAppMqtt({ client: {}, observeSolar: (data, address, r) =>
    offerSolarFrame(app, data, address, { ...r, receivedMonoMs: now }) });
  mqtt.connectionEpoch = 1; mqtt.client = { connected: true };
  // Keep the actual broker router and its per-consumer handler sets, skip network I/O.
  mqtt.subscribeTopics = () => {};
  mqtt.subscribeTopic = () => {};
  const app = {
    subscribeAppRealtime: async (sn, owner, active) => {
      if (!active()) return false;
      mqtt.subscribe(sn, owner);
      return true;
    },
    unsubscribeAppRealtime: (sn, owner) => mqtt.unsubscribe(sn, owner),
  };
  const timers = new Set();
  const homey = { app, settings, __: key => key, setInterval: fn => { timers.add(fn); return fn; },
    clearInterval: fn => timers.delete(fn), setTimeout: () => 1, clearTimeout: () => {} };
  const device = new Device(); const values = {};
  const store = { solarAccountBinding: auth.appAccountBinding(session) };
  Object.assign(device, { homey, getData: () => ({ sn: A }), getStoreValue: k => store[k],
    setStoreValue: async (k,v) => { store[k] = v; }, getCapabilityValue: k => values[k],
    setCapabilityValue: async (k,v) => { values[k] = v; }, getAvailable: () => device.available,
    setAvailable: async () => { device.available = true; }, setUnavailable: async () => { device.available = false; },
    error: msg => rig.warnings.push(msg) });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await device.onInit();
  t.after(() => device.onUninit());
  return Object.assign(rig, { mqtt, values, store, device, settings,
    advance: ms => { now += ms; },
    tick: async () => { for (const fn of timers) fn(); await flush(); },
    send: async (reporter, unit = A, watts = 240) => {
      mqtt.onMessage(topic(reporter), report(reporter, entry(unit, float(3, watts))), { retain:false, dup:false });
      await flush();
    } });
}

test('a member Solar tile alone subscribes to its verified main and counts repeated direct and relay reports once across reconnect', async t => {
  const r = await solarRig(t);
  assert.deepEqual([...r.mqtt.handlers.keys()].sort(), [A,B].sort());
  await r.send(B, B, 990); assert.equal(r.values.measure_power, null);
  await r.send(B);
  r.advance(5000); await r.send(A);
  r.advance(55000); await r.tick(); await r.send(B);
  r.advance(1000); await r.send(A);
  assert.equal(r.values.measure_power, 240); assert.equal(r.values.meter_power, 0.004);
  r.mqtt.client.connected = false; await r.tick(); assert.equal(r.device.available, false);
  r.mqtt.client = { connected:true }; r.mqtt.connectionEpoch++;
  r.advance(30000); await r.send(B); assert.equal(r.values.meter_power, 0.004);
  r.advance(60000); await r.tick(); await r.send(B); assert.equal(r.values.meter_power, 0.008);
  assert.equal(r.device.available, true);
});

test('relink drops old relay even when another consumer keeps it subscribed, and restarts the interval', async t => {
  const r = await solarRig(t);
  const other = () => {}; r.mqtt.subscribe(B, other);
  await r.send(B); r.advance(30000); await r.send(B);
  assert.equal(r.values.meter_power, 0.002);
  r.main = C; r.advance(30000); await r.tick();
  assert.deepEqual([...r.mqtt.handlers.get(B)], [other]);
  assert.equal(r.values.measure_power, null);
  await r.send(B, A, 1000); assert.equal(r.values.measure_power, null);
  await r.send(C); assert.equal(r.values.meter_power, 0.002);
  r.advance(60000); await r.tick(); await r.send(C); assert.equal(r.values.meter_power, 0.006);
  r.failure = true; r.advance(60000); await r.tick();
  assert.equal(r.mqtt.handlers.has(C), false);
  await r.send(B); assert.equal(r.values.measure_power, null);
  await r.send(A); assert.equal(r.values.meter_power, 0.006);
  await r.device.onUninit(); assert.deepEqual([...r.mqtt.handlers.keys()], [B]);
});

test('app-sign-in-only member can receive its sole owned peer; ambiguous or shared peers cannot supply it', async t => {
  const r = await solarRig(t, { keys:false, peers:[A,B] });
  await r.send(B, B); assert.equal(r.values.measure_power, null);
  await r.send(B); assert.equal(r.values.measure_power, 240);
  r.inventory.push({ sn:C, shared:false }); r.advance(60000); await r.tick();
  assert.equal(r.mqtt.handlers.has(B), false); assert.equal(r.mqtt.handlers.has(C), false);
  r.inventory = [{ sn:A,shared:false },{ sn:C,shared:true }];
  r.advance(60000); await r.tick(); assert.deepEqual([...r.mqtt.handlers.keys()], [A]);
  assert.equal(r.lookups, 0);
});

test('expired or cancelled main lookup cannot keep or recreate an old relay', async t => {
  const r = await solarRig(t); let finish;
  await r.send(B);
  r.pending = new Promise(resolve => { finish = resolve; });
  r.advance(60000); await r.tick();
  r.advance(60000); await r.tick();
  assert.equal(r.mqtt.handlers.has(B), false); assert.equal(r.values.measure_power, null);
  r.settings.emit('unset', 'appAuthEmail');
  finish(C); await r.tick();
  assert.equal(r.mqtt.handlers.size, 0);
});

test('official lookup cannot attach a shared or unrelated main and resumes on the next verified mapping', async t => {
  const r = await solarRig(t);
  await r.send(B);
  r.inventory = [{ sn: A, shared: false }, { sn: B, shared: true }, { sn: C, shared: false }];
  r.advance(60000); await r.tick();
  assert.deepEqual([...r.mqtt.handlers.keys()], [A]);
  r.main = 'ES21OUTSIDEACCOUNT'; r.advance(60000); await r.tick();
  assert.deepEqual([...r.mqtt.handlers.keys()], [A]);
  r.main = C; r.advance(60000); await r.tick();
  await r.send(C); assert.equal(r.values.measure_power, 240); assert.equal(r.values.meter_power, 0);
  r.main = A; r.advance(60000); await r.tick();
  assert.deepEqual([...r.mqtt.handlers.keys()], [A]);
  await r.send(A); assert.equal(r.values.meter_power, 0);
});

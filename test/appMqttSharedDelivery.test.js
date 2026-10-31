'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const clients = [];
let subscribeHook;
let autoConnect = true;
class Client extends EventEmitter {
  constructor() {
    super(); this.connected = false; this.subscribed = []; this.unsubscribed = [];
  }
  subscribe(topic, _options, callback) {
    this.subscribed.push(topic);
    if (subscribeHook) subscribeHook(this, topic, callback);
    else callback?.(null, [{ topic, qos: 0 }]);
  }
  unsubscribe(topic) { this.unsubscribed.push(topic); }
  end(_force, options, callback) {
    this.connected = false; (typeof options === 'function' ? options : callback)?.();
  }
}
const originalLoad = Module._load;
let EcoFlowAppMqtt;
try {
  Module._load = function (request, ...args) {
    if (request === 'mqtt') return { connect() {
      const client = new Client(); clients.push(client);
      if (autoConnect) queueMicrotask(() => { client.connected = true; client.emit('connect'); });
      return client;
    } };
    return originalLoad.call(this, request, ...args);
  };
  EcoFlowAppMqtt = require('../.homeybuild/lib/EcoFlowAppMqtt').EcoFlowAppMqtt;
} finally { Module._load = originalLoad; }
const auth = {
  getSession: async () => ({ userId: 'synthetic' }),
  getMqttCredentials: async () => ({ account: 'synthetic', password: 'synthetic', url: 'mqtt-e.ecoflow.com' }),
};
const sn = 'SYNTHETICCT01';
const topic = '/app/device/property/' + sn;

test('shared same-meter consumers subscribe once, detach independently and resubscribe together', async () => {
  const mqtt = new EcoFlowAppMqtt({ client: auth });
  const preview = []; const energy = [];
  const p = (_payload, _topic, delivery) => preview.push(delivery);
  const e = (_payload, _topic, delivery) => energy.push(delivery);
  try {
    await mqtt.connect(); const client = clients.at(-1);
    mqtt.subscribe(sn, p); mqtt.subscribe(sn, e); mqtt.subscribe(sn, e);
    assert.deepEqual(client.subscribed, [topic, '/app/synthetic/' + sn + '/thing/property/get_reply']);
    client.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(preview.length, 1); assert.equal(energy.length, 1);
    assert.equal(preview[0], energy[0], 'both consumers receive the same immutable receipt');
    assert.ok(Object.isFrozen(preview[0]));
    assert.equal(preview[0].connectionEpoch, 1);
    client.emit('message', topic, Buffer.from('retained'), { retain: true, dup: true });
    assert.equal(energy[1].retained, true); assert.equal(energy[1].duplicate, true);
    mqtt.unsubscribe(sn, e); assert.equal(client.unsubscribed.length, 0);
    client.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(preview.length, 3); assert.equal(energy.length, 2);
    mqtt.subscribe(sn, e); await mqtt.reconnect(); const next = clients.at(-1);
    assert.equal(next.subscribed.length, 2);
    next.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(preview.length, 4); assert.equal(energy.length, 3);
    assert.equal(energy[2].connectionEpoch, 2, 'new socket gives both existing consumers a new epoch');
    assert.equal(preview[3], energy[2]);
    mqtt.unsubscribe(sn, p); assert.equal(next.unsubscribed.length, 0);
    mqtt.unsubscribe(sn, e); assert.equal(next.unsubscribed.length, 2);
    mqtt.subscribe(sn, e); assert.equal(next.subscribed.length, 4, 'first returning listener reopens topics');
  } finally { await mqtt.end(); }
});

test('late frames and disconnect callbacks from a replaced socket cannot affect current listeners', async () => {
  const mqtt = new EcoFlowAppMqtt({ client: auth }); const frames = [];
  mqtt.subscribe(sn, () => frames.push('preview')); mqtt.subscribe(sn, () => frames.push('energy'));
  try {
    await mqtt.connect(); const old = clients.at(-1);
    const queued = old.listeners('message')[0];
    const oldClose = old.listeners('close')[0]; const oldOffline = old.listeners('offline')[0];
    await mqtt.reconnect(); const current = clients.at(-1);
    queued(topic, Buffer.from('old'), { retain: false, dup: false });
    oldClose(); oldOffline();
    assert.deepEqual(frames, []); assert.equal(mqtt.connected, true);
    current.emit('message', topic, Buffer.from('current'), { retain: false, dup: false });
    assert.deepEqual(frames, ['preview', 'energy']);
    const afterEnd = current.listeners('message')[0]; await mqtt.end();
    afterEnd(topic, Buffer.from('late'), { retain: false, dup: false });
    assert.equal(frames.length, 2); assert.equal(current.listenerCount('message'), 0);
  } finally { await mqtt.end(); }
});


test('a second consumer waits for the shared connection handshake rather than mistaking a pending socket for readiness', async () => {
  autoConnect = false;
  const mqtt = new EcoFlowAppMqtt({ client: auth });
  try {
    const first = mqtt.connect();
    await new Promise(resolve => setImmediate(resolve));
    let ready = false;
    const second = mqtt.connect().then(() => { ready = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ready, false);
    const client = clients.at(-1); client.connected = true; client.emit('connect');
    await Promise.all([first, second]); assert.equal(ready, true);
  } finally {
    autoConnect = true;
    const client = clients.at(-1);
    if (!client.connected) { client.connected = true; client.emit('connect'); }
    await mqtt.end();
  }
});

test('a queued connect callback from a replaced socket cannot change the current delivery epoch or subscriptions', async () => {
  autoConnect = false;
  const mqtt = new EcoFlowAppMqtt({ client: auth }); const frames = [];
  try {
    const connecting = mqtt.connect(); await new Promise(setImmediate);
    const old = clients.at(-1); const queuedConnect = old.listeners('connect')[0];
    old.connected = true; old.emit('connect'); await connecting;
    mqtt.subscribe(sn, (_bytes, _topic, delivery) => frames.push(delivery));
    autoConnect = true; await mqtt.reconnect(); const current = clients.at(-1);
    queuedConnect();
    current.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(frames[0].connectionEpoch, 2); assert.equal(current.subscribed.length, 2);
  } finally { autoConnect = true; await mqtt.end(); }
});

function fakeTimers(t) {
  const timers = new Set();
  t.mock.method(global, 'setTimeout', (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; });
  t.mock.method(global, 'clearTimeout', timer => timers.delete(timer));
  return { timers, run(ms) { const timer = [...timers].find(x => x.ms === ms); assert.ok(timer, 'expected timer '+ms); timers.delete(timer); timer.fn(); } };
}

test('denied topic retries alone and recovers on the shared socket without interrupting both consumers', async t => {
  const clock = fakeTimers(t); const logs = []; let pendingAck; let received = 0;
  subscribeHook = (_client, route, callback) => {
    if (route === topic && !pendingAck) { pendingAck = callback; callback(null, [{ topic: route, qos: 128 }]); }
    else callback(null, [{ topic: route, qos: 0 }]);
  };
  const mqtt = new EcoFlowAppMqtt({ client: auth, log: (...args) => logs.push(args) });
  try {
    await mqtt.connect(); const client = clients.at(-1);
    mqtt.subscribe(sn, () => { received++; }); mqtt.subscribe(sn, () => { received++; });
    assert.equal(client.subscribed.length, 2);
    clock.run(5000);
    assert.equal(clients.at(-1), client); assert.equal(client.subscribed.length, 3);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 2);
    pendingAck(new Error('private topic '+topic), []); // late failed callback must not poison the successful retry.
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 2);
    client.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(received, 2); assert.equal(mqtt.getDeliveryDiagnostics(sn).receivedFrames, 1);
    assert.doesNotMatch(JSON.stringify(logs), /SYNTHETIC|private|\/app/);
    assert.equal(clock.timers.size, 0);
  } finally { subscribeHook = undefined; await mqtt.end(); }
});

test('missing SUBACK retries are bounded, late callbacks fenced and last detach/end cancels owned timers', async t => {
  const clock = fakeTimers(t); const callbacks = [];
  subscribeHook = (_client, route, callback) => { if (route === topic) callbacks.push(callback); else callback(null, [{ topic: route, qos: 0 }]); };
  const mqtt = new EcoFlowAppMqtt({ client: auth }); const preview = () => {}, energy = () => {};
  try {
    await mqtt.connect(); const client = clients.at(-1);
    mqtt.subscribe(sn, preview); mqtt.subscribe(sn, energy);
    clock.run(10000); assert.equal(mqtt.getDeliveryDiagnostics(sn).timedOutTopics, 1);
    clock.run(5000); callbacks[0](null, [{ topic, qos: 0 }]);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).pendingTopics, 1, 'old SUBACK cannot accept a replacement attempt');
    clock.run(10000); clock.run(10000); // deadline, then second retry backoff.
    clock.run(10000); // final deadline: no further retries.
    assert.equal(client.subscribed.length, 4); assert.equal(clock.timers.size, 0);
    mqtt.unsubscribe(sn, preview); assert.equal(client.unsubscribed.length, 0);
    mqtt.unsubscribe(sn, energy); assert.equal(client.unsubscribed.length, 2);
    mqtt.subscribe(sn, energy); assert.equal(clock.timers.size, 1);
    await mqtt.end(); assert.equal(clock.timers.size, 0);
    callbacks.at(-1)(null, [{ topic, qos: 0 }]);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 0);
  } finally { subscribeHook = undefined; await mqtt.end(); }
});

test('foreign and malformed topic routes cannot reach same-serial consumers or renew delivery evidence', async () => {
  const mqtt = new EcoFlowAppMqtt({ client: auth }); let calls = 0;
  try {
    await mqtt.connect(); mqtt.subscribe(sn, () => calls++); const client = clients.at(-1);
    for (const route of ['/app/foreign/'+sn+'/thing/property/get_reply',topic+'/extra','/app/device/wrong/'+sn]) {
      client.emit('message', route, Buffer.from('synthetic'), { retain: false, dup: false });
    }
    assert.equal(calls, 0); assert.equal(mqtt.getDeliveryDiagnostics(sn).receivedFrames, 0);
  } finally { await mqtt.end(); }
});


test('subscription errors and synchronous failures recover; old-socket SUBACKs cannot change replacement state', async t => {
  const clock = fakeTimers(t); const callbacks = []; let failures = 2; const logs = [];
  subscribeHook = (_client, route, callback) => {
    callbacks.push({ route, callback });
    if (route === topic && failures-- > 0) {
      if (failures === 1) throw new Error('private broker data');
      callback(new Error('private broker data')); return;
    }
    callback(null, [{ topic: route, qos: 0 }]);
  };
  const mqtt = new EcoFlowAppMqtt({ client: auth, log: (...args) => logs.push(args) });
  try {
    await mqtt.connect(); mqtt.subscribe(sn, () => {});
    assert.equal(mqtt.getDeliveryDiagnostics(sn).rejectedTopics, 1);
    clock.run(5000); clock.run(10000);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 2);
    const old = callbacks[0];
    await mqtt.reconnect();
    old.callback(new Error('private broker data'));
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 2);
    assert.equal(clock.timers.size, 0);
    assert.doesNotMatch(JSON.stringify(logs), /private|broker data/);
  } finally { subscribeHook = undefined; await mqtt.end(); }
});


test('a failing app listener cannot interrupt peers or disclose exception contents', async () => {
  const logs = []; let received = 0;
  const mqtt = new EcoFlowAppMqtt({ client: auth, log: (...args) => logs.push(args) });
  try {
    await mqtt.connect();
    mqtt.subscribe(sn, () => { throw new Error('PRIVATE raw household payload'); });
    mqtt.subscribe(sn, () => { received++; });
    clients.at(-1).emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(received, 1);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|household|payload/);
  } finally { await mqtt.end(); }
});

test('ending a pending handshake settles all consumers without waiting for CONNACK', async () => {
  autoConnect = false;
  const mqtt = new EcoFlowAppMqtt({ client: auth });
  const results = [];
  try {
    const first = mqtt.connect().then(() => results.push('ready'), () => results.push('failed'));
    const second = mqtt.connect().then(() => results.push('ready'), () => results.push('failed'));
    await new Promise(setImmediate);
    let ended = false;
    const ending = mqtt.end().then(() => { ended = true; });
    await new Promise(setImmediate);
    assert.equal(ended, true, 'shutdown must cancel a pending handshake');
    await Promise.all([first, second, ending]);
    assert.deepEqual(results, ['failed', 'failed']);
    assert.equal(mqtt.connected, false);
  } finally {
    // Release the old implementation too so a failing regression cannot hang.
    clients.at(-1).emit('error', new Error('synthetic cleanup'));
    autoConnect = true; await mqtt.end();
  }
});

test('one silent serial cannot interrupt delivery to another serial on the shared connection', async () => {
  const mqtt = new EcoFlowAppMqtt({ client: auth }); let received = 0;
  const quiet = () => {}; const active = () => { received++; };
  try {
    await mqtt.connect(); const client = clients.at(-1);
    mqtt.subscribe(sn, quiet); mqtt.subscribe('SYNTHETICBATTERY', active);
    client.emit('message', '/app/device/property/SYNTHETICBATTERY', Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(mqtt.getDeliveryDiagnostics(sn).receivedFrames, 0);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).lastFrameAgeSec, null);
    mqtt.unsubscribe(sn, quiet);
    client.emit('message', '/app/device/property/SYNTHETICBATTERY', Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(received, 2); assert.equal(mqtt.connected, true);
    assert.equal(mqtt.getDeliveryDiagnostics('SYNTHETICBATTERY').activeTopics, 2);
  } finally { await mqtt.end(); }
});

test('repeated failed handshakes and successful mixed-serial recovery leave no owned timers', async t => {
  const clock = fakeTimers(t); const logs = [];
  const mqtt = new EcoFlowAppMqtt({ client: auth, log: (...args) => logs.push(args) });
  let meter = 0, battery = 0;
  mqtt.subscribe(sn, () => meter++); mqtt.subscribe('SYNTHETICBATTERY', () => battery++);
  try {
    for (let cycle = 0; cycle < 30; cycle++) {
      autoConnect = false;
      const failed = mqtt.connect(); const rejected = assert.rejects(failed);
      await new Promise(setImmediate);
      const old = clients.at(-1);
      old.emit('error', new Error('PRIVATE broker context'));
      await rejected;
      assert.equal(clock.timers.size, 1, 'one managed retry, independent of consumer count');
      autoConnect = true; await mqtt.connect();
      const current = clients.at(-1);
      assert.equal(current.subscribed.length, 4);
      assert.equal(clock.timers.size, 0);
      old.emit('message', topic, Buffer.from('late'), { retain: false, dup: false });
      current.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
      current.emit('message', '/app/device/property/SYNTHETICBATTERY', Buffer.from('synthetic'), { retain: false, dup: false });
      assert.equal(meter, cycle + 1); assert.equal(battery, cycle + 1);
      current.connected = false; current.emit('close');
    }
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|broker context/);
  } finally { autoConnect = true; await mqtt.end(); }
  assert.equal(clock.timers.size, 0);
});

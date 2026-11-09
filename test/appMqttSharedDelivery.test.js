'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const nativeMqtt = require('mqtt');
const nativeAck = require(require('node:path').join(require.resolve('mqtt'), '..', 'lib/handlers/ack.js')).default;

const clients = [];
let subscribeHook;
let autoConnect = true;
let nativeFactory;
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
let EcoFlowMqtt;
try {
  Module._load = function (request, ...args) {
    if (request === 'mqtt') return { connect(_url, options) {
      if (nativeFactory) return nativeFactory(options);
      const client = new Client(); clients.push(client);
      if (autoConnect) queueMicrotask(() => { client.connected = true; client.emit('connect'); });
      return client;
    } };
    return originalLoad.call(this, request, ...args);
  };
  EcoFlowAppMqtt = require('../.homeybuild/lib/EcoFlowAppMqtt').EcoFlowAppMqtt;
  EcoFlowMqtt = require('../.homeybuild/lib/EcoFlowMqtt').EcoFlowMqtt;
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
    assert.equal(preview[0].isCurrent(), true);
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
    assert.equal(preview[0].isCurrent(), false);
    assert.equal(energy[2].isCurrent(), true);
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
    clock.run(10000); // The fast wave ends, but owned low-rate recovery continues.
    assert.equal(client.subscribed.length, 4); assert.equal(clock.timers.size, 1);
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

test('existing consumers recover exhausted shared topics without churn or fabricated frames', async t => {
  const clock = fakeTimers(t);
  for (const failure of ['denied', 'timeout']) {
    let fail = true; let frames = 0;
    subscribeHook = (_client, route, callback) => {
      if (route === topic && fail) {
        if (failure === 'denied') callback(null, [{topic:route,qos:128}]);
        return;
      }
      callback(null, [{topic:route,qos:0}]);
    };
    const mqtt = new EcoFlowAppMqtt({client:auth}); const preview=()=>{frames++;}, energy=()=>{frames++;};
    try {
      await mqtt.connect(); const client=clients.at(-1); mqtt.subscribe(sn,preview);
      if (failure==='timeout') clock.run(10000);
      clock.run(5000);
      if (failure==='timeout') clock.run(10000);
      clock.run(10000);
      if (failure==='timeout') clock.run(10000);
      assert.equal(clock.timers.size,1);
      const before=client.subscribed.length; fail=false;
      mqtt.subscribe(sn,energy);
      assert.equal(client.subscribed.length,before,'new listeners do not accelerate scheduled recovery');
      clock.run(30000);
      assert.equal(client.subscribed.length,before+1,'only exhausted topic retried');
      assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics,2);
      assert.equal(frames,0,'SUBACK is not telemetry');
      assert.equal(mqtt.getDeliveryDiagnostics(sn).receivedFrames,0);
      mqtt.subscribe(sn,energy); assert.equal(client.subscribed.length,before+1);
      client.emit('message',topic,Buffer.from('synthetic'),{retain:false,dup:false});assert.equal(frames,2);
      mqtt.unsubscribe(sn,energy);assert.equal(client.unsubscribed.length,0);
    } finally { subscribeHook=undefined;await mqtt.end(); }
  }
});

test('permanent topic denial has capped ongoing recovery and last detach fences every old attempt', async t => {
  const clock = fakeTimers(t); const callbacks = [];
  subscribeHook = (_client, route, callback) => {
    if (route === topic) { callbacks.push(callback); callback(null, [{ topic: route, qos: 128 }]); }
    else callback(null, [{ topic: route, qos: 0 }]);
  };
  const mqtt = new EcoFlowAppMqtt({ client: auth }); let peer = 0;
  const listener = () => {};
  try {
    await mqtt.connect(); const client = clients.at(-1);
    mqtt.subscribe(sn, listener);
    mqtt.subscribe('HEALTHY_SYNTHETIC', () => peer++);
    clock.run(5000); clock.run(10000);
    for (let cycle = 0; cycle < 40; cycle++) {
      const delay = Math.min(30000 * 2 ** cycle, 300000);
      assert.equal(clock.timers.size, 1);
      clock.run(delay);
      client.emit('message', '/app/device/property/HEALTHY_SYNTHETIC', Buffer.from('peer'), { retain: false, dup: false });
      assert.equal(mqtt.getDeliveryDiagnostics(sn).receivedFrames, 0);
      assert.equal(mqtt.subscriptions.size, 4, 'one fixed state record per topic');
    }
    assert.equal(peer, 40);
    assert.equal(client.subscribed.filter(route => route.includes('HEALTHY_SYNTHETIC')).length, 2);
    assert.equal(clients.at(-1), client, 'topic denial never replaces the socket');
    const old = callbacks[0];
    mqtt.unsubscribe(sn, listener); assert.equal(clock.timers.size, 0);
    old(null, [{ topic, qos: 0 }]);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 0);
    assert.equal(mqtt.getDeliveryDiagnostics('HEALTHY_SYNTHETIC').activeTopics, 2);
  } finally { subscribeHook = undefined; await mqtt.end(); }
});

test('consumer churn cannot multiply scheduled subscription retries or touch a healthy topic', async t => {
 const clock=fakeTimers(t);subscribeHook=(_c,route,cb)=>{if(route===topic)cb(null,[{topic:route,qos:128}]);else cb(null,[{topic:route,qos:0}]);};
 const mqtt=new EcoFlowAppMqtt({client:auth});
 try{await mqtt.connect();const client=clients.at(-1);mqtt.subscribe(sn,()=>{});
  for(let cycle=0;cycle<20;cycle++){const listener=()=>{};mqtt.subscribe(sn,listener);mqtt.unsubscribe(sn,listener);}
  assert.equal(client.subscribed.length,2);assert.equal(clock.timers.size,1);
  clock.run(5000);assert.equal(client.subscribed.length,3);assert.equal(clock.timers.size,1);
  await mqtt.end();assert.equal(clock.timers.size,0);
 }finally{subscribeHook=undefined;await mqtt.end();}
});

test('support distinguishes acknowledged silent topics from socket traffic discarded before device routing', async () => {
 const mqtt = new EcoFlowAppMqtt({client:auth});let delivered=0;
 try {
  await mqtt.connect();mqtt.subscribe(sn,()=>delivered++);const client=clients.at(-1);
  let d=mqtt.getDeliveryDiagnostics(sn);
  assert.equal(d.activeTopics,2);assert.equal(d.socketReceivedFrames,0);assert.equal(d.receivedFrames,0);
  client.emit('message','/app/foreign/'+sn+'/thing/property/get_reply',Buffer.from('PRIVATE'),{retain:false,dup:false});
  d=mqtt.getDeliveryDiagnostics(sn);assert.equal(d.socketReceivedFrames,1);assert.equal(d.socketRouteRejectedFrames,1);
  assert.equal(d.receivedFrames,0);assert.equal(delivered,0);
  client.emit('message',topic,Buffer.from('synthetic'),{retain:false,dup:false});
  d=mqtt.getDeliveryDiagnostics(sn);assert.equal(d.socketReceivedFrames,2);assert.equal(d.receivedFrames,1);assert.equal(delivered,1);
  client.emit('packetreceive',{cmd:'pingresp',secret:'PRIVATE'});
  assert.equal(mqtt.getDeliveryDiagnostics(sn).socketPingResponses,1);
  assert.doesNotMatch(JSON.stringify(mqtt.getDeliveryDiagnostics(sn)),/PRIVATE|synthetic|\/app\//);
  const old=client.listeners('message')[0];await mqtt.reconnect();old(topic,Buffer.from('late'));
  d=mqtt.getDeliveryDiagnostics(sn);assert.equal(d.socketReceivedFrames,0);assert.equal(d.socketPingResponses,0);
 }finally{await mqtt.end();}
});

test('busy other-device traffic does not renew sparse Dual CT receipts or resubscribe either consumer', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const mqtt = new EcoFlowAppMqtt({ client: auth }); const preview = []; const energy = [];
  try {
    await mqtt.connect(); const client = clients.at(-1);
    mqtt.subscribe(sn, (_p, _t, receipt) => preview.push(receipt));
    mqtt.subscribe(sn, (_p, _t, receipt) => energy.push(receipt));
    mqtt.subscribe('OTHER_SYNTHETIC', () => {});
    const subscribed = [...client.subscribed];
    client.emit('message', topic, Buffer.from('unrelated synthetic message'), { retain: false, dup: false });
    now = 17000;
    client.emit('message', topic, Buffer.from('synthetic power envelope'), { retain: false, dup: false });
    for (let i = 0; i < 1205; i++) {
      now = 17001 + i;
      client.emit('message', '/app/device/property/OTHER_SYNTHETIC', Buffer.from('other'), { retain: false, dup: false });
    }
    now = 76600;
    client.emit('packetreceive', { cmd: 'pingresp' });
    const report = mqtt.getDeliveryDiagnostics(sn);
    assert.equal(report.socketReceivedFrames, 1207); assert.equal(report.socketRouteRejectedFrames, 0);
    assert.equal(report.receivedFrames, 2); assert.equal(report.lastFrameAgeSec, 59.6);
    assert.equal(preview.length, 2); assert.equal(energy.length, 2);
    assert.equal(preview[1], energy[1]); assert.equal(preview[1].receivedAt, 17000);
    assert.deepEqual(client.subscribed, subscribed); assert.equal(client.unsubscribed.length, 0);
  } finally { await mqtt.end(); }
});

const nativeSettle = async () => { for (let n = 0; n < 4; n++) await new Promise(setImmediate); };

async function nativeHarness(t) {
  assert.equal(nativeMqtt.MqttClient.VERSION, '5.15.1', 'private bookkeeping fixture is version-specific');
  const clock = fakeTimers(t);
  const fixture = { packets: [], callbacks: [], clients: [], blockWrites: false, pauseAll: false, hangEnd: false };
  nativeFactory = options => {
    const client = new nativeMqtt.MqttClient(() => { throw new Error('network prohibited'); },
      { ...options, manualConnect: true, keepalive: 0 });
    client.stream = new Writable({ highWaterMark: 16384, write(_bytes, _encoding, done) {
      if (fixture.blockWrites) fixture.releaseWrite = () => { fixture.releaseWrite = undefined; done(); };
      else done();
    } });
    client.on('packetsend', packet => {
      fixture.packets.push({ client, ...packet });
      if (packet.cmd === 'subscribe' && packet.subscriptions[0].topic !== topic && !fixture.pauseAll) {
        queueMicrotask(() => nativeAck(client, { cmd: 'suback', messageId: packet.messageId, granted: [0] }));
      }
    });
    const subscribe = client.subscribe.bind(client);
    client.subscribe = (route, opts, callback) => {
      fixture.callbacks.push({ client, route, callback });
      return subscribe(route, opts, callback);
    };
    client._cleanUp = (_force, done) => {
      fixture.endCallback = done;
      if (!fixture.hangEnd) { client.connected = false; client.stream.destroy(); done?.(); }
    };
    fixture.clients.push(client);
    queueMicrotask(() => { client.connected = true; client.emit('connect'); });
    return client;
  };
  const app = new EcoFlowAppMqtt({ client: auth });
  await app.connect();
  const client = fixture.clients.at(-1);
  const listener = () => {};
  let peers = 0;
  app.subscribe(sn, listener);
  app.subscribe('HEALTHY_SYNTHETIC', () => peers++);
  await nativeSettle();
  for (let n = 0; n < 10; n++) {
    const waiting = [...app.subscriptions].find(([route, item]) => route !== topic && item.timer);
    if (!waiting) break;
    clock.timers.delete(waiting[1].timer); waiting[1].timer.fn(); await nativeSettle();
  }
  assert.equal(app.getDeliveryDiagnostics('HEALTHY_SYNTHETIC').activeTopics, 2);
  const targets = () => fixture.packets.filter(p => p.client === client && p.cmd === 'subscribe' && p.subscriptions[0].topic === topic);
  const retry = async () => {
    const timer = [...clock.timers][0]; assert.ok(timer, 'owned topic timer');
    clock.run(timer.ms); await nativeSettle();
  };
  const clean = async () => {
    nativeFactory = undefined; fixture.hangEnd = false;
    fixture.releaseWrite?.(); fixture.endCallback?.();
    for (const c of fixture.clients) {
      c._storeProcessing = false; c._storeProcessingQueue.length = 0;
      c.end = (_force, opts, callback) => { c.stream.destroy(); (typeof opts === 'function' ? opts : callback)?.(); return c; };
    }
    const ending = app.end(); await nativeSettle();
    fixture.endCallback?.();
    const nativeFinish = [...clock.timers].find(timer => timer.ms === 10);
    if (nativeFinish) clock.run(10);
    await ending;
  };
  return { app, client, fixture, clock, targets, retry, clean, listener, peers: () => peers };
}

test('native F4 thousands of missing SUBACK retries keep one immutable owner transaction and healthy peers', async t => {
  const h = await nativeHarness(t);
  try {
    for (let n = 0; n < 2000; n++) {
      await h.retry();
      h.client.emit('message', '/app/device/property/HEALTHY_SYNTHETIC', Buffer.from('synthetic'), { retain: false, dup: false });
    }
    assert.ok(h.targets().length > 900);
    assert.equal(new Set(h.targets().map(packet => packet.messageId)).size, 1, 'one ID for the entire owner lifetime');
    assert.equal(Object.keys(h.client.outgoing).length, 1, 'one current native callback graph');
    assert.equal(Object.keys(h.client.messageIdToTopic).length, 1, 'one native topic mapping');
    assert.equal(h.client._storeProcessingQueue.length, 0);
    assert.equal(h.client.stream.writableLength, 0);
    assert.equal(h.clock.timers.size, 1);
    assert.equal(h.peers(), 2000);
    assert.equal(h.app.getDeliveryDiagnostics(sn).receivedFrames, 0, 'retry is not telemetry');
    const bytes = require('mqtt-packet').generate(h.targets()[0], { protocolVersion: 5 });
    assert.ok(h.targets().every(packet => require('mqtt-packet').generate(packet, { protocolVersion: 5 }).equals(bytes)));
  } finally { await h.clean(); }
});

for (const [first, second] of [[0, 0], [128, 0], [0, 128], [145, 0]]) {
  test(`native F4 repeated SUBACK ${first}/${second} settles only the current identical owner intent`, async t => {
    const h = await nativeHarness(t);
    try {
      const original = h.targets()[0];
      const oldCallback = h.fixture.callbacks.find(row => row.route === topic).callback;
      await h.retry(); await h.retry();
      const pending = h.app.subscriptions.get(topic);
      oldCallback(null, [{ topic, qos: 0 }]); oldCallback(new Error('old callback')); oldCallback(null, [{ topic, qos: 128 }]);
      assert.equal(pending.state, 'pending', 'old callback objects cannot settle a newer pending attempt');
      assert.equal(h.targets().at(-1).messageId, original.messageId);
      nativeAck(h.client, { cmd: 'suback', messageId: original.messageId, granted: [first] });
      await nativeSettle();
      assert.equal(pending.state, first === 0 ? 'active' : 'rejected');
      if (first === 0) h.app.subscribeTopic(sn, topic);
      else await h.retry();
      await nativeSettle();
      const current = h.app.subscriptions.get(topic);
      assert.equal(h.targets().at(-1).messageId, original.messageId, 'settlement does not free the owner ID');
      h.fixture.pauseAll = true;
      h.app.subscribe('OTHER_NATIVE_OWNER', () => {});
      const other = h.fixture.packets.find(packet => packet.cmd === 'subscribe' && packet.subscriptions[0].topic === '/app/device/property/OTHER_NATIVE_OWNER');
      assert.notEqual(other.messageId, original.messageId);
      nativeAck(h.client, { cmd: 'suback', messageId: original.messageId, granted: [second] });
      await nativeSettle();
      assert.equal(current.state, second === 0 ? 'active' : 'rejected', 'matching older wire ACK may settle this same intent, not latest-wire authorization');
      assert.equal(h.app.getDeliveryDiagnostics('OTHER_NATIVE_OWNER').activeTopics, 0);
      assert.equal(h.app.getDeliveryDiagnostics(sn).receivedFrames, 0);
    } finally { await h.clean(); }
  });
}

test('native F4 settled detach retires IDs across allocator wrap and cleans unacknowledged UNSUB bookkeeping', async t => {
  const h = await nativeHarness(t);
  try {
    const id = h.targets()[0].messageId;
    nativeAck(h.client, { cmd: 'suback', messageId: id, granted: [0] }); await nativeSettle();
    h.app.unsubscribe(sn, h.listener);
    await nativeSettle();
    assert.equal(Object.keys(h.client.outgoing).length, 0, 'detach must not wait for UNSUBACK');
    assert.equal(Object.keys(h.client.messageIdToTopic).length, 0);
    const predecessor = id === 1 ? 65535 : id - 1;
    for (let n = 0; h.client.messageIdProvider.getLastAllocated() !== predecessor; n++) {
      assert.ok(n < 65535);
      const allocated = h.client.messageIdProvider.allocate(); assert.notEqual(allocated, 0);
      h.client.messageIdProvider.deallocate(allocated);
    }
    h.app.subscribe(sn, h.listener);
    const current = h.targets().at(-1);
    assert.notEqual(current.messageId, id, 'settled old lifetime never aliases returning ownership');
    nativeAck(h.client, { cmd: 'suback', messageId: id, granted: [0] }); await nativeSettle();
    assert.equal(h.app.getDeliveryDiagnostics(sn).pendingTopics, 1);
    assert.equal(h.app.getDeliveryDiagnostics('HEALTHY_SYNTHETIC').activeTopics, 2);
  } finally { await h.clean(); }
});

test('native F4 exhausted unified namespace still retries existing owners and rejects new work before busy SDK queues', async t => {
  const h = await nativeHarness(t);
  try {
    const id = h.targets()[0].messageId;
    for (let candidate = 1; candidate <= 65535; candidate++) h.client.messageIdProvider.register(candidate);
    h.client.messageIdProvider.clear(); // Native lifecycle clear must not reset this connection's owner/tombstone ledger.
    await h.retry(); await h.retry();
    assert.equal(h.targets().at(-1).messageId, id);
    h.client._storeProcessing = true;
    const sends = h.fixture.packets.length;
    h.app.subscribe('NAMESPACE_FULL', () => {});
    assert.equal(h.fixture.packets.length, sends);
    assert.equal(h.client._storeProcessingQueue.length, 0, 'exhaustion is checked before SDK can enqueue without allocating');
    h.client._storeProcessing = false;
    h.app.subscribe('NAMESPACE_FULL_2', () => {});
    assert.equal(h.fixture.packets.length, sends);
    assert.equal(h.client._storeProcessingQueue.length, 0);
    assert.equal(h.client.messageIdProvider.allocate(), null);
    assert.equal(h.fixture.clients.length, 1, 'no silent namespace-reset reconnect');
  } finally { await h.clean(); }
});

test('native F4 busy native processing coalesces retry and detach without appending deferred SDK operations', async t => {
  const h = await nativeHarness(t);
  try {
    h.client._storeProcessing = true;
    for (let n = 0; n < 300; n++) await h.retry();
    assert.equal(h.client._storeProcessingQueue.length, 0);
    h.app.unsubscribe(sn, h.listener);
    assert.equal(h.client._storeProcessingQueue.length, 0, 'busy unsubscribe is skipped, not deferred');
    h.client._storeProcessing = false;
    h.client._storeProcessingQueue.push({ invoke: () => false, callback: () => {} });
    h.app.subscribe(sn, h.listener);
    assert.equal(h.client._storeProcessingQueue.length, 1, 'existing foreign queue is not appended or flushed');
    h.app.unsubscribe(sn, h.listener);
    assert.equal(h.client._storeProcessingQueue.length, 1);
  } finally { await h.clean(); }
});

test('native F4 non-draining memory stream cannot grow retry bytes or drain listeners', async t => {
  const h = await nativeHarness(t);
  try {
    h.fixture.blockWrites = true;
    h.client.stream._writableState.highWaterMark = 1;
    await h.retry(); await h.retry();
    const debt = h.client.stream.writableLength;
    const drains = h.client.stream.listenerCount('drain');
    assert.ok(debt > 0);
    for (let n = 0; n < 2000; n++) await h.retry();
    assert.equal(h.client.stream.writableLength, debt, 'one blocked write, no appended retry debt');
    assert.equal(h.client.stream.listenerCount('drain'), drains);
    assert.equal(h.client._storeProcessingQueue.length, 0);
    h.fixture.blockWrites = false; h.fixture.releaseWrite(); await nativeSettle();
    for (let n = 0; h.targets().length < 3 && n < 3; n++) await h.retry();
    assert.equal(h.targets().length, 3, 'late drain only permits the next owned retry');
    h.client.stream.destroy();
    const sent = h.fixture.packets.length;
    for (let n = 0; n < 3; n++) await h.retry();
    assert.equal(h.fixture.packets.length, sent, 'destroyed transport cannot resurrect writes');
  } finally { await h.clean(); }
});

test('native F4 cancellation owns only its callback/mapping and tombstones before reentrant allocation', async t => {
  const h = await nativeHarness(t);
  try {
    const id = h.targets()[0].messageId;
    const foreign = { volatile: true, cb: () => assert.fail('foreign outgoing cancelled') };
    h.client.outgoing[60000] = foreign;
    h.client.messageIdToTopic[60000] = ['foreign'];
    h.client.messageIdProvider.register(60000);
    const remove = h.client.removeOutgoingMessage.bind(h.client);
    const cancelled = [];
    h.client.removeOutgoingMessage = removed => {
      cancelled.push(removed);
      assert.equal(h.app.subscriptions.has(topic), false);
      const next = h.client.messageIdProvider.allocate();
      assert.notEqual(next, id); h.client.messageIdProvider.deallocate(next);
      return remove(removed);
    };
    h.app.unsubscribe(sn, h.listener); await nativeSettle();
    assert.ok(cancelled.includes(id));
    assert.equal(h.client.outgoing[60000], foreign);
    assert.deepEqual(h.client.messageIdToTopic[60000], ['foreign']);
    assert.equal(Object.keys(h.client.outgoing).length, 1, 'owned unsubscribe callbacks are cancelled immediately');
    delete h.client.outgoing[60000]; delete h.client.messageIdToTopic[60000];
  } finally { await h.clean(); }
});

test('native F4 unified allocation preserves an ordinary QoS publish reentering owned unsubscribe', async t => {
  const h = await nativeHarness(t);
  try {
    let published = false;
    h.client.once('packetsend', packet => {
      assert.equal(packet.cmd, 'unsubscribe');
      h.client.publish('/synthetic/ordinary', Buffer.from('synthetic'), { qos: 1 }, error => {
        assert.ifError(error); published = true;
      });
    });
    h.app.unsubscribe(sn, h.listener); await nativeSettle();
    const unsub = h.fixture.packets.find(packet => packet.cmd === 'unsubscribe');
    const publish = h.fixture.packets.find(packet => packet.cmd === 'publish');
    assert.ok(unsub && publish);
    assert.notEqual(unsub.messageId, publish.messageId, 'temporary selector was consumed only by its native unsubscribe');
    assert.ok(h.client.outgoing[publish.messageId]);
    assert.equal(h.client.outgoing[unsub.messageId], undefined);
    assert.equal(published, false);
    nativeAck(h.client, { cmd: 'puback', messageId: publish.messageId, reasonCode: 0 }); await nativeSettle();
    assert.equal(published, true);
    assert.equal(h.client.messageIdProvider.register(publish.messageId), true, 'ordinary settled publish ID is reusable');
    h.client.messageIdProvider.deallocate(publish.messageId);
    assert.equal(h.client.messageIdProvider.register(unsub.messageId), false, 'retired unsubscribe ID remains fenced');
    assert.equal(h.client.messageIdProvider.register(h.targets()[0].messageId), false, 'retired owner ID remains fenced');
  } finally { await h.clean(); }
});

test('native F4 late callbacks from detached and replaced clients cannot settle new owners', async t => {
  const h = await nativeHarness(t);
  try {
    const old = h.fixture.callbacks.find(row => row.route === topic).callback;
    const oldId = h.targets()[0].messageId;
    h.app.unsubscribe(sn, h.listener); await nativeSettle(); h.app.subscribe(sn, h.listener); await nativeSettle();
    old(null, [{ topic, qos: 0 }]);
    assert.equal(h.app.getDeliveryDiagnostics(sn).pendingTopics, 1);
    await h.app.reconnect(); await nativeSettle();
    const next = h.fixture.clients.at(-1);
    const waiting = h.app.subscriptions.get(topic);
    if (waiting.state === 'timed_out') {
      h.clock.timers.delete(waiting.timer); waiting.timer.fn(); await nativeSettle();
    }
    old(null, [{ topic, qos: 0 }]);
    nativeAck(h.client, { cmd: 'suback', messageId: oldId, granted: [0] }); await nativeSettle();
    assert.equal(h.app.getDeliveryDiagnostics(sn).pendingTopics, 1);
    assert.equal(h.app.client, next);
    assert.equal(Object.keys(h.client.outgoing).length, 0);
  } finally { await h.clean(); }
});

test('native F4 graceful shutdown is bounded and double/late completion cannot close a newer client', async t => {
  const h = await nativeHarness(t);
  try {
    h.fixture.hangEnd = true;
    let ended = false;
    const ending = h.app.end().then(() => { ended = true; });
    const double = h.app.end();
    await nativeSettle();
    assert.equal(ended, false);
    assert.ok([...h.clock.timers].some(timer => timer.ms === 1000), 'owned end deadline independent of native callback');
    h.clock.run(1000); await Promise.all([ending, double]);
    assert.equal(h.client.stream.destroyed, true);
    assert.equal(h.clock.timers.size, 0);
    assert.equal(h.client.listenerCount('packetsend'), 1, 'only fixture instrumentation remains');
    const late = h.fixture.endCallback;
    h.fixture.hangEnd = false; await h.app.connect();
    const next = h.fixture.clients.at(-1);
    late?.(); late?.(); await nativeSettle();
    assert.equal(h.app.client, next); assert.equal(h.app.connected, true);
  } finally { await h.clean(); }
});

test('Developer quota receipts cannot keep a per-unit alert current across socket replacement', async t => {
  const { EcoFlowClient } = require('../.homeybuild/lib/EcoFlowClient');
  t.mock.method(EcoFlowClient.prototype, 'getCertification', async () => ({
    protocol: 'mqtts', url: 'broker.invalid', port: 8883,
    certificateAccount: 'synthetic', certificatePassword: 'synthetic',
  }));
  const mqtt = new EcoFlowMqtt({ accessKey: 'synthetic', secretKey: 'synthetic' });
  const readings = [];
  mqtt.subscribe(sn, (quota, delivery) => readings.push({ quota, delivery }));
  const topic = `/open/synthetic/${sn}/quota`;
  const payload = Buffer.from('{"f32ShowSoc":20}');
  try {
    await mqtt.connect();
    const old = clients.at(-1);
    const queued = old.listeners('message')[0];
    old.emit('message', topic, payload, { retain: true, dup: true });
    assert.deepEqual(readings[0].quota, { f32ShowSoc: 20 });
    assert.equal(readings[0].delivery.retained, true);
    assert.equal(readings[0].delivery.duplicate, true);
    assert.equal(readings[0].delivery.isCurrent(), true);
    await mqtt.reconnect();
    assert.equal(readings[0].delivery.isCurrent(), false);
    queued(topic, payload, { retain: false, dup: false });
    assert.equal(readings.length, 1);
    clients.at(-1).emit('message', topic, payload, { retain: false, dup: false });
    assert.equal(readings[1].delivery.connectionEpoch, readings[0].delivery.connectionEpoch + 1);
    assert.equal(readings[1].delivery.isCurrent(), true);
  } finally { await mqtt.end(); }
  assert.equal(readings[1].delivery.isCurrent(), false);
});

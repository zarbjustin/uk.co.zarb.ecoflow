'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const clients = [];
const original = Module._load;
let EcoFlowMqtt;
try {
  Module._load = function (name, ...args) {
    if (name === 'mqtt') return { connect() {
      const c = new EventEmitter(); c.connected = true; c.topics = [];
      c.subscribe = topic => c.topics.push(topic); c.unsubscribe = () => {};
      c.end = (_force, _options, done) => done?.();
      clients.push(c); queueMicrotask(() => c.emit('connect')); return c;
    } };
    if (name === './EcoFlowClient') return { EcoFlowClient: class {
      async getCertification() { return { certificateAccount: 'synthetic', certificatePassword: 'fake', protocol: 'mqtts', url: 'example.invalid', port: 8883 }; }
    } };
    return original.call(this, name, ...args);
  };
  EcoFlowMqtt = require('../.homeybuild/lib/EcoFlowMqtt').EcoFlowMqtt;
} finally { Module._load = original; }

test('original STREAM shares topics and isolates failing listeners; replaced sockets cannot interrupt current delivery', async () => {
  const mqtt = new EcoFlowMqtt({ accessKey: 'synthetic', secretKey: 'synthetic' });
  let received = 0; const handler = () => received++;
  try {
    await mqtt.connect(); const old = clients.at(-1);
    mqtt.subscribe('SYNTHETIC', () => { throw new Error('synthetic'); });
    mqtt.subscribe('SYNTHETIC', handler); mqtt.subscribe('SYNTHETIC', handler);
    assert.equal(old.topics.length, 2);
    const lateMessage = old.listeners('message')[0], lateClose = old.listeners('close')[0];
    old.emit('message', '/open/synthetic/SYNTHETIC/quota', Buffer.from('{"power":10}'));
    assert.equal(received, 1, 'one failed consumer must not stop the other');
    await mqtt.reconnect(); const current = clients.at(-1);
    lateClose(); lateMessage('/open/synthetic/SYNTHETIC/quota', Buffer.from('{"power":99}'));
    assert.equal(received, 1);
    current.emit('message', '/open/synthetic/SYNTHETIC/quota', Buffer.from('{"power":20}'));
    assert.equal(received, 2); assert.equal(current.topics.length, 2);
  } finally { await mqtt.end(); }
});


test('original STREAM retains status-only consumers when reconnecting', async () => {
  const mqtt = new EcoFlowMqtt({ accessKey: 'synthetic', secretKey: 'synthetic' });
  const quota = () => {}; let online;
  try {
    await mqtt.connect();
    mqtt.subscribe('STATUS_ONLY', quota, value => { online = value; });
    mqtt.unsubscribe('STATUS_ONLY', quota);
    await mqtt.reconnect();
    const current = clients.at(-1);
    assert.equal(current.topics.length, 2);
    current.emit('message', '/open/synthetic/STATUS_ONLY/status', Buffer.from('{"status":1}'));
    assert.equal(online, true);
  } finally { await mqtt.end(); }
});

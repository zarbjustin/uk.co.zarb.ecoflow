'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const clients = [];
class Client extends EventEmitter {
  constructor() {
    super(); this.connected = false; this.subscribed = []; this.unsubscribed = [];
  }
  subscribe(topic, _options, callback) { this.subscribed.push(topic); callback?.(null); }
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
      queueMicrotask(() => { client.connected = true; client.emit('connect'); });
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
    client.emit('message', topic, Buffer.from('retained'), { retain: true, dup: true });
    assert.equal(energy[1].retained, true); assert.equal(energy[1].duplicate, true);
    mqtt.unsubscribe(sn, e); assert.equal(client.unsubscribed.length, 0);
    client.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(preview.length, 3); assert.equal(energy.length, 2);
    mqtt.subscribe(sn, e); await mqtt.reconnect(); const next = clients.at(-1);
    assert.equal(next.subscribed.length, 2);
    next.emit('message', topic, Buffer.from('synthetic'), { retain: false, dup: false });
    assert.equal(preview.length, 4); assert.equal(energy.length, 3);
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

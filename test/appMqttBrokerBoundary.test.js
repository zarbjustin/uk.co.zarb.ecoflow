'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { Duplex } = require('node:stream');
const mqtt = require('mqtt');
const packets = require('mqtt-packet');
const routes = [];
let wire; let denied = false;
const original = Module._load;
let EcoFlowAppMqtt;
try {
  Module._load = function (name, ...args) {
    if (name === 'mqtt') return { connect(_url, options) {
      const parser = packets.parser({ protocolVersion: 5 });
      wire = new Duplex({ read() {}, write(chunk, _encoding, done) { parser.parse(chunk); done(); } });
      const reply = packet => queueMicrotask(() => { if (!wire.destroyed) wire.push(packets.generate(packet, { protocolVersion: 5 })); });
      parser.on('packet', packet => {
        if (packet.cmd === 'connect') reply({ cmd: 'connack', reasonCode: 0, sessionPresent: false });
        if (packet.cmd === 'subscribe') {
          const topic = packet.subscriptions[0].topic; routes.push(topic);
          const fail = topic === '/app/device/property/SYNTHETIC' && !denied;
          if (fail) denied = true;
          reply({ cmd: 'suback', messageId: packet.messageId, granted: [fail ? 0x87 : 0] });
        }
        if (packet.cmd === 'disconnect') wire.push(null);
      });
      return new mqtt.MqttClient(() => wire, options);
    } };
    return original.call(this, name, ...args);
  };
  EcoFlowAppMqtt = require('../.homeybuild/lib/EcoFlowAppMqtt').EcoFlowAppMqtt;
} finally { Module._load = original; }
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

test('locked MQTT.js v5 broker denial triggers an actual wire retry and resumes both listeners', async t => {
  const realTimeout = global.setTimeout, realClear = global.clearTimeout; const owned = new Set();
  t.mock.method(global, 'setTimeout', (fn, ms, ...args) => {
    if (ms !== 5000 && ms !== 10000) return realTimeout(fn, ms, ...args);
    const timer = { fn, ms }; owned.add(timer); return timer;
  });
  t.mock.method(global, 'clearTimeout', timer => { if (!owned.delete(timer)) realClear(timer); });
  const app = new EcoFlowAppMqtt({ client: {
    getSession: async () => ({ userId: 'synthetic' }),
    getMqttCredentials: async () => ({ account: 'synthetic', password: 'fake', url: 'mqtt-e.ecoflow.com' }),
  } });
  let count = 0;
  try {
    await app.connect(); app.subscribe('SYNTHETIC', () => count++); app.subscribe('SYNTHETIC', () => count++);
    await settle(); assert.equal(app.getDeliveryDiagnostics('SYNTHETIC').rejectedTopics, 1);
    const retry = [...owned].find(timer => timer.ms === 5000); assert.ok(retry); owned.delete(retry); retry.fn();
    await settle();
    assert.equal(routes.filter(route => route === '/app/device/property/SYNTHETIC').length, 2, 'real SUBSCRIBE sent again');
    assert.equal(app.getDeliveryDiagnostics('SYNTHETIC').activeTopics, 2);
    wire.push(packets.generate({ cmd: 'publish', topic: '/app/device/property/SYNTHETIC', qos: 0, retain: false,
      dup: false, payload: Buffer.from('synthetic') }, { protocolVersion: 5 }));
    await settle(); assert.equal(count, 2); assert.equal(owned.size, 0);
  } finally { await app.end(); wire.destroy(); }
});

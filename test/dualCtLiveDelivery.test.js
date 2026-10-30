'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { DualCtLiveDelivery } = require('../.homeybuild/lib/dualCtLiveDelivery');
const { EcoFlowAppMqtt } = require('../.homeybuild/lib/EcoFlowAppMqtt');
const { varint, scalar } = require('./helpers/dualCtSynthetic');
const nest = (id, bytes) => Buffer.concat([varint(id * 8 + 2), varint(bytes.length), bytes]);
const integer = (id, n) => Buffer.concat([varint(id * 8), varint(n)]);
const topic = '/app/device/property/SYNTHETICCT01';
const frame = (seq, extra = []) => nest(1, Buffer.concat([nest(1, scalar(962, 3600)), integer(8, 254), integer(9, 21),
  ...(seq === null ? [] : [integer(14, seq)]), ...extra]));
const metadata = (at, overrides = {}) => ({ receivedAt: at, receivedMonoMs: at, retained: false, duplicate: false, ...overrides });
const inspect = (g, bytes, meta, now = meta?.receivedAt || 1000) => g.inspect(bytes, topic, topic, meta, now);
test('MQTT transport forwards immutable delivery facts without changing two-argument consumers or guessing missing flags', async () => {
  const mqtt = new EcoFlowAppMqtt({ client: {} }); const received = []; const legacy = [];
  mqtt.subscribe('SYNTHETICCT01', (bytes, t, meta) => received.push({ bytes, t, meta }));
  mqtt.subscribe('SYNTHETICCT01', (bytes, t) => legacy.push([bytes, t]));
  const bytes = frame(1); mqtt.onMessage(topic, bytes, { retain: true, dup: false });
  assert.deepEqual(legacy[0], [bytes, topic]); assert.equal(received[0].meta.retained, true);
  assert.equal(received[0].meta.duplicate, false); assert.equal(Object.isFrozen(received[0].meta), true);
  assert.ok(Number.isFinite(received[0].meta.receivedMonoMs));
  mqtt.onMessage(topic, bytes); assert.equal(received[1].meta, undefined);
  await mqtt.end();
});
test('constant values in new sequence deliveries stay live; duplicate, reordered and ambiguous sequences cannot renew them', () => {
  const g = new DualCtLiveDelivery();
  assert.equal(inspect(g, frame(10), metadata(1000)).accepted, true);
  assert.equal(inspect(g, frame(11), metadata(2000)).accepted, true);
  assert.equal(inspect(g, frame(11), metadata(2100)).status, 'sequence_duplicate');
  assert.equal(inspect(g, frame(9), metadata(2200)).restartAnchor, true);
  assert.equal(inspect(g, frame(null), metadata(2300)).status, 'sequence_required');
  assert.equal(inspect(g, frame(12, [integer(14, 12)]), metadata(2400)).status, 'sequence_required');
  assert.equal(inspect(g, frame(0x100000000), metadata(2500)).status, 'sequence_required');
  assert.equal(inspect(g, frame(12), metadata(3000)).accepted, true);
});
test('retained, dup, absent metadata, late queue and foreign deliveries are rejected before creating an anchor', () => {
  for (const data of [undefined, metadata(1000, { retained: true }), metadata(1000, { duplicate: true }),
    metadata(1000, { retained: undefined }), metadata(1000, { receivedMonoMs: NaN })]) {
    const g = new DualCtLiveDelivery(); assert.equal(inspect(g, frame(100), data).accepted, false);
    assert.equal(inspect(g, frame(1), metadata(2000)).accepted, true, 'rejected delivery must not poison a new sequence');
  }
  const g = new DualCtLiveDelivery(); assert.equal(inspect(g, frame(1), metadata(1000), 6000).accepted, false);
  assert.equal(g.inspect(frame(1), topic + '/get_reply', topic, metadata(1000), 1000).accepted, false);
});
test('a five-second receipt gap, wall clock jump and sequence wrap/reset require a new accounting epoch', () => {
  for (const later of [metadata(6000), metadata(30000, { receivedMonoMs: 2000 }), metadata(500, { receivedMonoMs: 2000 })]) {
    const g = new DualCtLiveDelivery(); assert.equal(inspect(g, frame(1), metadata(1000)).accepted, true);
    assert.equal(inspect(g, frame(2), later).restartAnchor, true);
  }
  const g = new DualCtLiveDelivery(); inspect(g, frame(0xffffffff), metadata(1000));
  assert.equal(inspect(g, frame(0), metadata(2000)).restartAnchor, true);
  assert.equal(inspect(new DualCtLiveDelivery(), frame(0), metadata(2000)).accepted, true);
});

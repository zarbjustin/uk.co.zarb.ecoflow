'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  describeEs22Frame,
  es22FrameShape,
  Es22SampleGate,
  es22TopicKind,
  formatEs22CapabilitySnapshot,
} = require('../.homeybuild/lib/streamAc5000Diagnostics.js');

test('describeEs22Frame caps samples and removes the full serial', () => {
  const sn = 'ES22ZEB1ABCD0001';
  const payload = Buffer.concat([
    Buffer.from('prefix:', 'utf8'),
    Buffer.from(sn, 'utf8'),
    Buffer.alloc(300, 0x41),
  ]);

  const diagnostic = describeEs22Frame(payload, sn);
  const sample = Buffer.from(diagnostic.sampleBase64, 'base64').toString('utf8');

  assert.strictEqual(diagnostic.bytes, payload.length);
  assert.strictEqual(diagnostic.sha256.length, 16);
  assert.strictEqual(diagnostic.truncated, true);
  assert.ok(Buffer.from(diagnostic.sampleBase64, 'base64').length <= 192);
  assert.ok(!sample.includes(sn));
  assert.ok(sample.includes('*'.repeat(sn.length)));
});

test('describeEs22Frame reports malformed input without throwing', () => {
  const diagnostic = describeEs22Frame(Buffer.from([0xff, 0xff, 0xff]), 'ES22SECRET');
  assert.deepStrictEqual(diagnostic.commands, []);
  assert.ok(diagnostic.sampleBase64);
});

test('es22TopicKind removes account and serial details', () => {
  assert.strictEqual(es22TopicKind('/app/device/property/ES22SECRET'), 'device_property');
  assert.strictEqual(
    es22TopicKind('/app/private-user/ES22SECRET/thing/property/get_reply'),
    'get_reply',
  );
  assert.strictEqual(es22TopicKind('/unexpected/private-user/ES22SECRET'), 'other');
});

test('es22FrameShape groups nearby sizes without including changing values', () => {
  assert.strictEqual(es22FrameShape({ bytes: 128, commands: ['254/39'] }), '254/39@128');
  assert.strictEqual(es22FrameShape({ bytes: 131, commands: ['254/39'] }), '254/39@128');
  assert.strictEqual(es22FrameShape({ bytes: 137, commands: ['254/40'] }), '254/40@128');
  assert.strictEqual(es22FrameShape({ bytes: 1, commands: [] }), 'none@32');
});

test('capability snapshots are ordered, compact and explicitly allow-listed', () => {
  assert.strictEqual(formatEs22CapabilitySnapshot({
    'measure_power.grid_export': 1,
    measure_battery: 81,
    measure_power: -381,
    battery_charging_state: 'discharging',
    serial_number: 'ES22SECRET',
    token: 'SECRET',
  }), 'battery_pct=81,state=discharging,battery_w=-381,grid_export_w=1');
  assert.strictEqual(formatEs22CapabilitySnapshot({ measure_power: Number.NaN }), 'none');
});

test('sample gate refreshes changing shapes while enforcing its session budget', () => {
  const gate = new Es22SampleGate(2, 3, 1000);
  const first = { bytes: 128, commands: ['254/39'], sha256: 'a', sampleBase64: '', truncated: false };
  const changed = { ...first, sha256: 'b' };
  const other = { ...first, commands: ['254/40'], sha256: 'c' };
  const thirdShape = { ...first, commands: ['50/2'], sha256: 'd' };

  assert.strictEqual(gate.shouldCapture(first, 0), true);
  assert.strictEqual(gate.shouldCapture(first, 2000), false, 'identical payload is never repeated');
  assert.strictEqual(gate.shouldCapture(changed, 500), false, 'shape refresh is rate-limited');
  assert.strictEqual(gate.shouldCapture(changed, 1000), true);
  assert.strictEqual(gate.shouldCapture(other, 1100), true);
  assert.strictEqual(gate.shouldCapture(thirdShape, 3000), false, 'budget is a hard cap');
});

test('sample gate rolls old shape slots when a new command family appears', () => {
  const gate = new Es22SampleGate(1, 3, 0);
  const sample = (commands, sha256) => ({
    bytes: 128, commands, sha256, sampleBase64: '', truncated: false,
  });
  assert.strictEqual(gate.shouldCapture(sample(['254/39'], 'a'), 1), true);
  assert.strictEqual(gate.shouldCapture(sample(['254/40'], 'b'), 2), true);
  assert.strictEqual(gate.shouldCapture(sample(['254/39'], 'c'), 3), true);
});

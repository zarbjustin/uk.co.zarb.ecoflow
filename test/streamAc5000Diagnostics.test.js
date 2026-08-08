'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  describeEs22Frame,
  es22TopicKind,
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

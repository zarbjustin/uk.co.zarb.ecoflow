'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  classifyDevice, isStreamUnit, isSmartMeter, quotaIsStreamUnit,
} = require('../.homeybuild/lib/ecoflowDevices.js');

test('classifies real STREAM serial prefixes', () => {
  assert.strictEqual(classifyDevice({ sn: 'BK01Z11ACH4P0489', deviceName: 'STREAM Microinverter-0489' }), 'microinverter');
  assert.strictEqual(classifyDevice({ sn: 'BK21Z1BB7H414289', deviceName: 'Smart Meter' }), 'smart_meter');
  assert.strictEqual(classifyDevice({ sn: 'BK31ZK1A4H4R0186', deviceName: 'STREAM AC Pro 1.2' }), 'stream_unit');
  assert.strictEqual(classifyDevice({ sn: 'BK61ZK1B2H720041', deviceName: 'STREAM Ultra X Right' }), 'stream_unit');
  // Other documented STREAM models.
  assert.strictEqual(classifyDevice({ sn: 'BK11AAAA' }), 'stream_unit'); // Ultra
  assert.strictEqual(classifyDevice({ sn: 'BK12AAAA' }), 'stream_unit'); // Pro
  assert.strictEqual(classifyDevice({ sn: 'BK41AAAA' }), 'stream_unit'); // Max
  assert.strictEqual(classifyDevice({ sn: 'BK51AAAA' }), 'stream_unit'); // AC
});

test('PowerStream and unknown devices are classified as other', () => {
  assert.strictEqual(classifyDevice({ sn: 'HW51ZOABEC', deviceName: 'PowerStream' }), 'other');
  assert.strictEqual(classifyDevice({ sn: 'ZZ99UNKNOWN' }), 'other');
});

test('falls back to device/product name when the prefix is unknown', () => {
  assert.strictEqual(classifyDevice({ sn: 'ZZ99AAAA', deviceName: 'Kitchen Smart Meter' }), 'smart_meter');
  assert.strictEqual(classifyDevice({ sn: 'ZZ99AAAA', productName: 'Stream Ultra' }), 'stream_unit');
  assert.strictEqual(classifyDevice({ sn: 'ZZ99AAAA', deviceName: 'Garden Microinverter' }), 'microinverter');
});

test('uses a rich STREAM quota as an authoritative fallback', () => {
  const quota = { cmsBattSoc: 20, powGetSysLoad: 3969, relay2Onoff: true };
  assert.strictEqual(quotaIsStreamUnit(quota), true);
  assert.strictEqual(quotaIsStreamUnit({}), false);
  assert.strictEqual(classifyDevice({ sn: 'ZZ99AAAA' }, quota), 'stream_unit');
  // An empty quota does not promote an unknown device to a STREAM unit.
  assert.strictEqual(classifyDevice({ sn: 'ZZ99AAAA' }, {}), 'other');
});

test('isStreamUnit / isSmartMeter helpers', () => {
  assert.strictEqual(isStreamUnit({ sn: 'BK61ZK1B2H720041' }), true);
  assert.strictEqual(isSmartMeter({ sn: 'BK21Z1BB7H414289' }), true);
  assert.strictEqual(isStreamUnit({ sn: 'BK21Z1BB7H414289' }), false);
});

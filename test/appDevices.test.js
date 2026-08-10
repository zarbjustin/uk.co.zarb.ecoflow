'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeAppDeviceList, streamAc5000Devices, stream5000Devices, isStreamAc5000Sn, streamAc5000Name,
  STREAM_AC5000_MODEL,
} = require('../.homeybuild/lib/appDevices.js');

test('isStreamAc5000Sn only matches the ES22 prefix', () => {
  assert.strictEqual(isStreamAc5000Sn('ES22ZEB1ABCD0001'), true);
  assert.strictEqual(isStreamAc5000Sn('es22zeb1abcd0001'), true);
  assert.strictEqual(isStreamAc5000Sn('BK61ZK1B2H720041'), false);
  assert.strictEqual(isStreamAc5000Sn('BK51AAAA'), false);
  assert.strictEqual(isStreamAc5000Sn(''), false);
  assert.strictEqual(isStreamAc5000Sn(undefined), false);
});

test('streamAc5000Name falls back to model + serial tail', () => {
  assert.strictEqual(streamAc5000Name('ES22ZEB1ABCD0001'), `${STREAM_AC5000_MODEL} (0001)`);
  assert.strictEqual(streamAc5000Name('ES22ZEB1ABCDXYZW'), STREAM_AC5000_MODEL);
  assert.strictEqual(streamAc5000Name('ES22ZEB1ABCD0001', 'STREAM AC 5000'), 'STREAM AC 5000');
  assert.strictEqual(streamAc5000Name('ES22ZEB1ABCD0001', '', 'Garage battery'), 'Garage battery');
});

test('normalizeAppDeviceList flattens the SN-keyed bound/share map', () => {
  const devices = normalizeAppDeviceList({
    bound: {
      ES22ZEB1ABCD0001: { deviceName: '', productName: '', online: 1 },
      BK61ZK1B2H720041: { deviceName: 'STREAM Ultra X Right', online: 1 },
    },
    share: {
      ES22ZEB1ABCD0002: { deviceName: 'Shared AC 5000', online: 0 },
    },
  });
  assert.deepStrictEqual(devices, [
    {
      sn: 'ES22ZEB1ABCD0001', name: `${STREAM_AC5000_MODEL} (0001)`, productName: '', online: 1, shared: false,
    },
    {
      sn: 'BK61ZK1B2H720041', name: 'STREAM Ultra X Right', productName: '', online: 1, shared: false,
    },
    {
      sn: 'ES22ZEB1ABCD0002', name: 'Shared AC 5000', productName: '', online: 0, shared: true,
    },
  ]);
});

test('normalizeAppDeviceList handles the list-valued group format', () => {
  const devices = normalizeAppDeviceList({
    bound: {
      groupA: [
        { sn: 'ES22ZEB1ABCD0001', online: 1 },
        { sn: 'HW51ZOABEC', productName: 'PowerStream', online: 1 },
      ],
    },
  });
  assert.deepStrictEqual(devices.map((d) => d.sn), ['ES22ZEB1ABCD0001', 'HW51ZOABEC']);
  assert.strictEqual(devices[1].name, 'PowerStream');
});

test('normalizeAppDeviceList deduplicates across bound and share', () => {
  const devices = normalizeAppDeviceList({
    bound: { ES22ZEB1ABCD0001: { online: 1 } },
    share: { ES22ZEB1ABCD0001: { online: 0 } },
  });
  assert.strictEqual(devices.length, 1);
  assert.strictEqual(devices[0].shared, false);
});

test('normalizeAppDeviceList tolerates junk input', () => {
  assert.deepStrictEqual(normalizeAppDeviceList(undefined), []);
  assert.deepStrictEqual(normalizeAppDeviceList(null), []);
  assert.deepStrictEqual(normalizeAppDeviceList('nope'), []);
  assert.deepStrictEqual(normalizeAppDeviceList({ bound: 'nope' }), []);
  assert.deepStrictEqual(normalizeAppDeviceList({ bound: { X: null } }), []);
  assert.deepStrictEqual(normalizeAppDeviceList({ bound: { '': {} } }), []);
});

test('normalizeAppDeviceList maps online flags of any shape', () => {
  const devices = normalizeAppDeviceList({
    bound: {
      ES22ZEB1ABCD0001: { online: true },
      ES22ZEB1ABCD0002: { online: '1' },
      ES22ZEB1ABCD0003: { online: 0 },
      ES22ZEB1ABCD0004: {},
    },
  });
  assert.deepStrictEqual(devices.map((d) => d.online), [1, 1, 0, 0]);
});

test('streamAc5000Devices keeps only ES22 units, sorted by serial', () => {
  const devices = normalizeAppDeviceList({
    bound: {
      ES22ZEB1ABCD0002: { online: 1 },
      BK61ZK1B2H720041: { deviceName: 'STREAM Ultra X', online: 1 },
      BK21Z1BB7H414289: { deviceName: 'Smart Meter', online: 1 },
      ES22ZEB1ABCD0001: { online: 1 },
      HW51ZOABEC: { productName: 'PowerStream', online: 1 },
    },
  });
  assert.deepStrictEqual(
    streamAc5000Devices(devices).map((d) => d.sn),
    ['ES22ZEB1ABCD0001', 'ES22ZEB1ABCD0002'],
  );
  assert.deepStrictEqual(
    stream5000Devices(devices).map((d) => d.sn),
    ['ES22ZEB1ABCD0001', 'ES22ZEB1ABCD0002'],
  );
});

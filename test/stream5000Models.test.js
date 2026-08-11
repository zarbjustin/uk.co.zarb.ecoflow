'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  isSupportedStream5000Sn,
  STREAM_AC5000_MODEL,
  STREAM_AC5000_MODEL_ID,
  STREAM_5000_DRIVER_IDS,
  STREAM_5000_SYSTEM_DRIVER_IDS,
  STREAM_5000_UNIT_DRIVER_IDS,
  stream5000DeviceName,
  stream5000ModelFromSn,
  supportedStream5000Models,
} = require('../.homeybuild/lib/stream5000Models.js');

test('the registry enables only verified STREAM 5000-family serial prefixes', () => {
  assert.strictEqual(isSupportedStream5000Sn('ES22ZEB1ABCD0001'), true);
  assert.strictEqual(isSupportedStream5000Sn('es22zeb1abcd0001'), true);
  assert.strictEqual(isSupportedStream5000Sn('BK61ZK1B2H720041'), false);
  assert.strictEqual(isSupportedStream5000Sn('ES23UNVERIFIED'), false);
  assert.strictEqual(isSupportedStream5000Sn(undefined), false);
});

test('the verified model chooses an explicit telemetry adapter', () => {
  const model = stream5000ModelFromSn('ES22ZEB1ABCD0001');
  assert.strictEqual(model.id, STREAM_AC5000_MODEL_ID);
  assert.strictEqual(model.name, STREAM_AC5000_MODEL);
  assert.strictEqual(model.telemetryAdapter, 'es22');
  assert.strictEqual(model.monitoringOnly, true);
  assert.deepStrictEqual(supportedStream5000Models().map((candidate) => candidate.id), [STREAM_AC5000_MODEL_ID]);
});

test('the family driver namespace separates aggregate and physical-unit identities', () => {
  assert.deepStrictEqual([...STREAM_5000_SYSTEM_DRIVER_IDS], ['stream_5000_system']);
  assert.deepStrictEqual([...STREAM_5000_UNIT_DRIVER_IDS], ['stream_5000_unit', 'stream_ac5000']);
  assert.deepStrictEqual(
    [...STREAM_5000_DRIVER_IDS],
    ['stream_5000_system', 'stream_5000_unit', 'stream_ac5000'],
  );
});

test('family naming prefers EcoFlow names and has a safe model fallback', () => {
  assert.strictEqual(stream5000DeviceName('ES22ZEB1ABCD0001'), 'STREAM AC 5000 (0001)');
  assert.strictEqual(stream5000DeviceName('ES22ZEB1ABCD0001', 'AC 5000 product'), 'AC 5000 product');
  assert.strictEqual(stream5000DeviceName('ES22ZEB1ABCD0001', '', 'Garage battery'), 'Garage battery');
  assert.strictEqual(stream5000DeviceName('ES23UNVERIFIED'), 'ES23UNVERIFIED');
});

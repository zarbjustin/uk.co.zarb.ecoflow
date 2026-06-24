'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { streamModelFromSn } = require('../.homeybuild/lib/streamModels.js');

test('STREAM Ultra X (BK61) is a solar unit with PV inputs', () => {
  const spec = streamModelFromSn('BK61ZK1B2H720041');
  assert.strictEqual(spec.model, 'STREAM Ultra X');
  assert.strictEqual(spec.acCoupled, false);
  assert.ok(spec.solarInputs > 0);
});

test('STREAM AC Pro (BK31) is AC-coupled with no PV inputs', () => {
  const spec = streamModelFromSn('BK31ZK1A4H4R0186');
  assert.strictEqual(spec.model, 'STREAM AC Pro');
  assert.strictEqual(spec.acCoupled, true);
  assert.strictEqual(spec.solarInputs, 0);
});

test('unknown / missing serials fall back to a generic STREAM Unit', () => {
  assert.strictEqual(streamModelFromSn('ZZ99XXXX').model, 'STREAM Unit');
  assert.strictEqual(streamModelFromSn(undefined).model, 'STREAM Unit');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { streamModelFromSn } = require('../.homeybuild/lib/streamModels.js');

test('STREAM Ultra X (BK61) is a solar unit with PV inputs', () => {
  const spec = streamModelFromSn('BK61ZK1B2H720041');
  assert.strictEqual(spec.model, 'STREAM Ultra X');
  assert.strictEqual(spec.acCoupled, false);
  assert.ok(spec.solarInputs > 0);
  assert.strictEqual(spec.icon, '/stream-ultra-x.svg');
});

test('STREAM AC Pro (BK31) is AC-coupled with no PV inputs', () => {
  const spec = streamModelFromSn('BK31ZK1A4H4R0186');
  assert.strictEqual(spec.model, 'STREAM AC Pro');
  assert.strictEqual(spec.acCoupled, true);
  assert.strictEqual(spec.solarInputs, 0);
  assert.strictEqual(spec.icon, '/stream-standard.svg');
});

test('STREAM Ultra (BK11) exposes 4 MPPT inputs and an AC-output rating', () => {
  const spec = streamModelFromSn('BK11ZK1A4H4R0001');
  assert.strictEqual(spec.model, 'STREAM Ultra');
  assert.strictEqual(spec.acCoupled, false);
  assert.strictEqual(spec.solarInputs, 4);
  assert.match(spec.acOutput, /paired/);
  assert.strictEqual(spec.icon, '/stream-standard.svg');
});

test('STREAM Pro (BK12) exposes 3 MPPT inputs', () => {
  const spec = streamModelFromSn('BK12ZK1A4H4R0001');
  assert.strictEqual(spec.model, 'STREAM Pro');
  assert.strictEqual(spec.solarInputs, 3);
  assert.strictEqual(spec.icon, '/stream-standard.svg');
});

test('STREAM Max (BK41) uses the standard STREAM enclosure icon', () => {
  const spec = streamModelFromSn('BK41ZK1A4H4R0001');
  assert.strictEqual(spec.model, 'STREAM Max');
  assert.strictEqual(spec.solarInputs, 2);
  assert.strictEqual(spec.icon, '/stream-standard.svg');
});

test('unknown / missing serials fall back to a generic STREAM Unit', () => {
  const unknown = streamModelFromSn('ZZ99XXXX');
  assert.strictEqual(unknown.model, 'STREAM Unit');
  assert.strictEqual(unknown.icon, undefined);
  assert.strictEqual(streamModelFromSn(undefined).model, 'STREAM Unit');
});

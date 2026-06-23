'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { integrateSignedPower, integratePositivePower } = require('../.homeybuild/lib/energyIntegration.js');

test('integrateSignedPower splits charge/import (pos) and discharge/export (neg)', () => {
  let s = { posWh: 0, negWh: 0 };
  s = integrateSignedPower(s, 3600, 1000); // 1 Wh charge
  assert.ok(Math.abs(s.posWh - 1) < 1e-9);
  assert.strictEqual(s.negWh, 0);
  s = integrateSignedPower(s, -3600, 1000); // 1 Wh discharge
  assert.ok(Math.abs(s.posWh - 1) < 1e-9);
  assert.ok(Math.abs(s.negWh - 1) < 1e-9);
});

test('integrateSignedPower rejects invalid/oversized intervals', () => {
  const base = { posWh: 5, negWh: 2 };
  assert.deepStrictEqual(integrateSignedPower(base, 1000, 0), base);
  assert.deepStrictEqual(integrateSignedPower(base, 1000, -1), base);
  assert.deepStrictEqual(integrateSignedPower(base, 1000, 2 * 60 * 60 * 1000), base);
  assert.deepStrictEqual(integrateSignedPower(base, NaN, 1000), base);
});

test('integratePositivePower only accumulates positive power', () => {
  assert.ok(Math.abs(integratePositivePower(0, 3600, 1000) - 1) < 1e-9);
  assert.strictEqual(integratePositivePower(5, 0, 1000), 5);
  assert.strictEqual(integratePositivePower(5, -100, 1000), 5);
  assert.strictEqual(integratePositivePower(5, 1000, 0), 5);
});

test('integration is monotonic over a sequence', () => {
  let gen = 0;
  let prev = gen;
  for (const p of [0, 500, 1500, 0, 2000, -10]) {
    gen = integratePositivePower(gen, p, 1000);
    assert.ok(gen >= prev, 'generated energy never decreases');
    prev = gen;
  }
});

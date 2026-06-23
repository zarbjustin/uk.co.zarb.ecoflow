'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { toFiniteNumber } = require('../.homeybuild/lib/quota.js');

test('toFiniteNumber treats empty string / null / undefined as absent', () => {
  assert.strictEqual(toFiniteNumber(''), undefined);
  assert.strictEqual(toFiniteNumber('   '), undefined);
  assert.strictEqual(toFiniteNumber(null), undefined);
  assert.strictEqual(toFiniteNumber(undefined), undefined);
  assert.strictEqual(toFiniteNumber(NaN), undefined);
  assert.strictEqual(toFiniteNumber('abc'), undefined);
});

test('toFiniteNumber parses real numbers and numeric strings', () => {
  assert.strictEqual(toFiniteNumber(0), 0);
  assert.strictEqual(toFiniteNumber(1234.5), 1234.5);
  assert.strictEqual(toFiniteNumber('2769'), 2769);
  assert.strictEqual(toFiniteNumber('-500.5'), -500.5);
});

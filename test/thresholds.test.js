'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { aboveBelow } = require('../.homeybuild/lib/thresholds.js');

test('aboveBelow compares finite values in both directions', () => {
  assert.strictEqual(aboveBelow(10, 'above', 5), true);
  assert.strictEqual(aboveBelow(10, 'below', 5), false);
  assert.strictEqual(aboveBelow(3, 'below', 5), true);
  assert.strictEqual(aboveBelow(5, 'above', 5), false); // strict >
});

test('aboveBelow handles negative prices', () => {
  assert.strictEqual(aboveBelow(-2.5, 'below', 0), true);
  assert.strictEqual(aboveBelow(-2.5, 'above', 0), false);
});

test('aboveBelow is false for unset / non-finite values', () => {
  assert.strictEqual(aboveBelow(null, 'above', 5), false);
  assert.strictEqual(aboveBelow(undefined, 'below', 5), false);
  assert.strictEqual(aboveBelow(NaN, 'above', 5), false);
  assert.strictEqual(aboveBelow('10', 'above', 5), false);
});

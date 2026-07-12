'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { powerDirection, startedDirection } = require('../.homeybuild/lib/flowStates');

test('powerDirection applies a symmetric idle deadband', () => {
  assert.equal(powerDirection(6), 1);
  assert.equal(powerDirection(5), 0);
  assert.equal(powerDirection(-5), 0);
  assert.equal(powerDirection(-6), -1);
});

test('startedDirection detects starts from idle and direction reversals', () => {
  assert.equal(startedDirection(undefined, 1), null);
  assert.equal(startedDirection(0, 1), 1);
  assert.equal(startedDirection(0, -1), -1);
  assert.equal(startedDirection(-1, 0), null);
  assert.equal(startedDirection(-1, 1), 1);
});

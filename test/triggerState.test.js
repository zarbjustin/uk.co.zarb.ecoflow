'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { powerState, startedTrigger } = require('../.homeybuild/lib/triggerState.js');

test('powerState classifies with a ±5 W dead-band', () => {
  assert.strictEqual(powerState(100), 'pos');
  assert.strictEqual(powerState(-100), 'neg');
  assert.strictEqual(powerState(0), 'idle');
  assert.strictEqual(powerState(3), 'idle');
  assert.strictEqual(powerState(-4), 'idle');
});

test('first sample only anchors state (no trigger)', () => {
  assert.strictEqual(startedTrigger(undefined, 'pos', 'import', 'export'), null);
});

test('idle -> active fires the started trigger (fixes missed idle->charging)', () => {
  assert.strictEqual(startedTrigger('idle', 'pos', 'charging', 'discharging'), 'charging');
  assert.strictEqual(startedTrigger('idle', 'neg', 'charging', 'discharging'), 'discharging');
});

test('export(neg) -> idle does NOT fire import started (fixes false positive)', () => {
  assert.strictEqual(startedTrigger('neg', 'idle', 'import', 'export'), null);
});

test('active -> opposite active fires the new state trigger', () => {
  assert.strictEqual(startedTrigger('neg', 'pos', 'import', 'export'), 'import');
  assert.strictEqual(startedTrigger('pos', 'neg', 'import', 'export'), 'export');
});

test('staying in the same state fires nothing', () => {
  assert.strictEqual(startedTrigger('pos', 'pos', 'import', 'export'), null);
});

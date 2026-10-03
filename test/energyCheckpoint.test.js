'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EnergyCheckpoint } = require('../.homeybuild/lib/EnergyCheckpoint');

function harness(persist) {
  const timers = new Map();
  let next = 0;
  const checkpoint = new EnergyCheckpoint({
    setTimeout: (fn) => { timers.set(++next, fn); return next; },
    clearTimeout: (id) => timers.delete(id),
  }, persist);
  return { checkpoint, timers };
}

test('checkpoint coalesces samples and an explicit flush clears the timer', async () => {
  let writes = 0;
  const { checkpoint, timers } = harness(async () => { writes += 1; });
  checkpoint.mark();
  checkpoint.mark();
  assert.equal(timers.size, 1);
  await checkpoint.flush();
  assert.equal(writes, 1);
  assert.equal(timers.size, 0);
  assert.deepEqual(checkpoint.diagnostics(), { pending: false, writing: false, failures: 0 });
});

test('a failed checkpoint stays dirty and schedules a bounded retry', async () => {
  let writes = 0;
  const { checkpoint, timers } = harness(async () => {
    writes += 1;
    if (writes === 1) throw new Error('store unavailable');
  });
  checkpoint.mark();
  await assert.rejects(checkpoint.flush(), /store unavailable/);
  assert.equal(timers.size, 1);
  assert.deepEqual(checkpoint.diagnostics(), { pending: true, writing: false, failures: 1 });
  await checkpoint.flush();
  assert.equal(writes, 2);
  assert.equal(timers.size, 0);
  assert.equal(checkpoint.diagnostics().pending, false);
});

test('concurrent flushes cannot overlap writes and retain marks arriving during persistence', async () => {
  let release;
  let writes = 0;
  let active = 0;
  let maxActive = 0;
  const { checkpoint } = harness(async () => {
    writes += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (writes === 1) await new Promise((resolve) => { release = resolve; });
    active -= 1;
  });
  checkpoint.mark();
  const first = checkpoint.flush();
  await Promise.resolve();
  checkpoint.mark();
  const second = checkpoint.flush();
  release();
  await Promise.all([first, second]);
  assert.equal(writes, 2);
  assert.equal(maxActive, 1);
  assert.equal(checkpoint.diagnostics().pending, false);
});

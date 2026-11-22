'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamPowerHistory, powerHistorySnapshot, copyPowerHistory } = require('../.homeybuild/lib/streamPowerHistory');
const { CoalescedTelemetryQueue } = require('../.homeybuild/lib/coalescedTelemetryQueue');

test('power histories are bounded, session-only, fixed-field and retain receipt versus application delay', () => {
  const history = new StreamPowerHistory();
  for (let i = 0; i < 100; i++) history.observe('bmsBatteryW', -400 - i, 100000 + i * 1000, 100100 + i * 1000);
  history.observe('PRIVATE', 123, 199000, 199100);
  history.observe('gridPortW', 0, 199000, 199100);
  const snapshot = history.snapshot(200000);
  assert.equal(snapshot.fields.bmsBatteryW.length, 16);
  assert.equal(snapshot.fields.bmsBatteryW.at(-1).valueW, -499);
  assert.equal(snapshot.fields.bmsBatteryW.at(-1).queueDelaySec, 0.1);
  assert.equal(snapshot.fields.gridPortW[0].valueW, 0);
  assert.equal(snapshot.ordering, 'local_receipt_not_device_time');
  assert.equal(snapshot.accountingUsed, false);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
  assert.equal(history.snapshot(380000).fields.bmsBatteryW.at(-1).stale, true);
  assert.deepEqual(history.snapshot(500001).fields, {});
});

test('history rejects invalid and out-of-order receipts, replaces duplicate timestamps, resets after clock rollback', () => {
  const h = new StreamPowerHistory();
  h.observe('bmsBatteryW', -500, 100000, 100100);
  h.observe('bmsBatteryW', -600, 100000, 100101);
  h.observe('bmsBatteryW', -100, 99000, 100101);
  for (const [value, at, applied] of [[NaN, 100100, 100100], [Infinity, 100100, 100100],
    [100001, 100100, 100100], [1, 100101, 100100], [1, 0, 100100], [1, 1, 200000]]) h.observe('bmsBatteryW', value, at, applied);
  assert.deepEqual(h.snapshot(100101).fields.bmsBatteryW.map(s => s.valueW), [-600]);
  h.observe('gridPortW', 200, 50000, 50000);
  assert.equal(h.snapshot(50000).fields.bmsBatteryW, undefined);
  assert.equal(h.snapshot(50000).fields.gridPortW[0].valueW, 200);
});

test('hostile history projection never forwards IDs, extra fields or corrupt samples', () => {
  const input = { sn: 'PRIVATE', fields: { secret: [{ value: 'PRIVATE' }], bmsBatteryW: [
    { value: -300, receivedAt: 1000, appliedAt: 1010, secret: 'PRIVATE' },
    { value: NaN, receivedAt: 1000, appliedAt: 1010 },
    { value: 300, receivedAt: 1002, appliedAt: 999 },
  ] } };
  const result = powerHistorySnapshot(copyPowerHistory(input), 1100);
  assert.equal(result.fields.bmsBatteryW.length, 1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  const hostile = { get fields() { throw new Error('PRIVATE'); } };
  assert.deepEqual(powerHistorySnapshot(hostile, 1000).fields, {});
  assert.deepEqual(copyPowerHistory(hostile).fields, {});
});

test('telemetry queue keeps one merged pending batch behind a blocked write and preserves field receipt times', async () => {
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const seen = [];
  const queue = new CoalescedTelemetryQueue((old, next) => ({ ...old, ...next }), async batch => {
    seen.push(batch); if (seen.length === 1) await blocked;
  });
  const done = queue.submit({ first: { value: 1, at: 1000 } });
  await Promise.resolve();
  for (let i = 0; i < 1000; i++) queue.submit({ latest: { value: i, at: 2000 + i } });
  queue.submit({ other: { value: 5, at: 5000 } });
  assert.equal(queue.snapshot().pending, true); assert.equal(queue.snapshot().maxPendingBatches, 1);
  release(); await done;
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1], { latest: { value: 999, at: 2999 }, other: { value: 5, at: 5000 } });
  assert.equal(queue.snapshot().coalesced, 1000);
  assert.equal(queue.snapshot().pending, false);
  await queue.submit({ final: 1 }); assert.equal(seen.length, 3);
});

test('telemetry queue isolates failures and teardown discards pending work without cancelling in-flight SDK writes', async () => {
  const seen = [];
  const failed = new CoalescedTelemetryQueue((old, next) => next, async v => { seen.push(v); throw new Error('PRIVATE'); });
  await failed.submit(1); await failed.submit(2); assert.deepEqual(seen, [1, 2]);
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const queue = new CoalescedTelemetryQueue((old, next) => next, async v => { seen.push(v); await blocked; });
  const done = queue.submit(3); await Promise.resolve(); queue.submit(4); queue.stop();
  release(); await done; await queue.submit(5);
  assert.deepEqual(seen, [1, 2, 3]); assert.equal(queue.snapshot().pending, false);
});

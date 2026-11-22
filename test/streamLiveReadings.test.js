'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamLiveReadings, STREAM_LIVE_TTL_MS } = require('../.homeybuild/lib/StreamLiveReadings');

test('live watts use field receipts, including unchanged and zero, never empty/unrelated updates', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const fields = new StreamLiveReadings(['measure_power', 'measure_power.grid']);
  const values = {}; const active = () => true;
  const put = (cap, value, at = now) => fields.apply(cap, value, at, async v => { values[cap] = v; }, active);
  await put('measure_power', -320); await put('measure_power.grid', 0);
  now += 100000; await put('measure_power', -320);
  now += 81000;
  await fields.expire(async cap => { values[cap] = null; }, active);
  assert.equal(values.measure_power, -320); assert.equal(values['measure_power.grid'], null);
  assert.equal(fields.snapshot()['measure_power.grid'].stale, true);
  assert.equal(fields.snapshot().measure_power.ageSec, 81);
  assert.equal(await put('PRIVATE', 20), false);
  await put('measure_power.grid', 0);
  assert.equal(values['measure_power.grid'], 0);
  assert.equal(fields.snapshot()['measure_power.grid'].stale, false);
});

test('failed or delayed writes cannot manufacture live receipts; clearing failures retry', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const fields = new StreamLiveReadings(['measure_power']);
  let clears = 0;
  assert.equal(await fields.apply('measure_power', 20, now, async () => { throw new Error('PRIVATE'); }, () => true), false);
  assert.equal(fields.snapshot().measure_power.applicationStatus, 'write_failed');
  await fields.expire(async () => { clears++; }, () => true);
  assert.equal(clears, 1);
  assert.equal(fields.snapshot().measure_power.stale, true);
  const values = [];
  await fields.apply('measure_power', 20, now, async v => { values.push(v); if (v !== null) now += STREAM_LIVE_TTL_MS + 1; }, () => true);
  assert.deepEqual(values, [20, null]);
  assert.equal(fields.snapshot().measure_power.stale, true);
  await fields.apply('measure_power', 0, now, async () => {}, () => true);
  assert.equal(fields.snapshot().measure_power.applicationStatus, 'applied');
});

test('invalid, future, out-of-order samples and teardown are fail closed; clock rollback can recover', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const fields = new StreamLiveReadings(['measure_power', 'battery_charging_state']);
  const writes = []; const writer = async v => { writes.push(v); };
  await fields.apply('measure_power', 50, now, writer, () => true);
  for (const at of [now - 1, now + 1, NaN, 0, now - STREAM_LIVE_TTL_MS - 1]) {
    assert.equal(await fields.apply('measure_power', 60, at, writer, () => true), false);
  }
  assert.deepEqual(writes, [50]);
  assert.equal(await fields.apply('measure_power', 60, now, writer, () => false), false);
  await fields.expire(writer, () => false); assert.deepEqual(writes, [50]);
  now--; assert.equal(fields.snapshot().measure_power.stale, true);
  await fields.apply('measure_power', 0, now, writer, () => true);
  assert.equal(fields.snapshot().measure_power.stale, false);
  await fields.apply('battery_charging_state', 'PRIVATE', now, writer, () => true);
  assert.equal(writes.at(-1), null);
  fields.reset(); assert.equal(fields.snapshot().measure_power.stale, true);
});

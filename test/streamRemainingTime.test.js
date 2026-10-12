'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamRemainingTime } = require('../.homeybuild/lib/StreamRemainingTime');

function harness(t) {
  let now = 1000000; let active = true;
  t.mock.method(Date, 'now', () => now);
  const tracker = new StreamRemainingTime(); const values = {}; const writes = [];
  tracker.observePower(-400, now);
  const write = async (cap, value) => { values[cap] = value; writes.push([cap, value]); };
  const live = () => active;
  return { tracker, values, writes, write, live, time: value => { now = value; }, stop: () => { active = false; },
    apply: (q, at = now, scope = 'unit', writer = write) => tracker.apply(q, scope, at, 'mqtt', writer, live) };
}

test('independent scoped estimates retain long durations and zero; absent packets cannot refresh them', async t => {
  const h = harness(t);
  await h.apply({ bmsChgRemTime: 5939, bmsDsgRemTime: '207', cmsDsgRemTime: 20 });
  assert.deepEqual(h.values, { charge_remaining: null, discharge_remaining: 207 });
  assert.equal(h.tracker.snapshot().charge_remaining.reportedMinutes, 5939);
  assert.equal(h.tracker.snapshot().charge_remaining.displayReason, 'inactive_direction');
  h.time(1180001);
  await h.apply({ temp: 37, gridConnectionPower: 500 });
  assert.equal(h.tracker.snapshot().discharge_remaining.stale, true);
  assert.equal(h.values.discharge_remaining, null);
  await h.apply({ bmsDsgRemTime: 0 });
  h.tracker.observePower(-400, 1180001); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.discharge_remaining, 0);
  assert.equal(h.values.charge_remaining, null);
  assert.equal(h.tracker.snapshot().discharge_remaining.source, 'unit_bms_mqtt');
});

test('system estimates cannot consume BMS or ambiguous legacy time fields', async t => {
  const h = harness(t);
  await h.apply({ bmsDsgRemTime: 207, dsgRemainTime: 400 }, undefined, 'system');
  assert.deepEqual(h.values, {});
  await h.apply({ cmsDsgRemTime: 140 }, undefined, 'system');
  assert.equal(h.values.discharge_remaining, 140);
  assert.equal(h.tracker.snapshot().discharge_remaining.source, 'system_cms_mqtt');
});

test('malformed estimates clear instead of displaying negative, infinite or coerced values', async t => {
  const h = harness(t);
  for (const raw of [-1, Infinity, NaN, null, false, {}, '', 'invalid']) {
    await h.apply({ bmsDsgRemTime: 200 });
    await h.apply({ bmsDsgRemTime: raw });
    assert.equal(h.values.discharge_remaining, null);
    assert.equal(h.tracker.snapshot().discharge_remaining.stale, true);
  }
});

test('future, expired and out-of-order receipts cannot overwrite current estimates', async t => {
  const h = harness(t);
  await h.apply({ bmsDsgRemTime: 207 });
  for (const at of [1000001, 999999, 1, NaN]) await h.apply({ bmsDsgRemTime: 5 }, at);
  assert.equal(h.values.discharge_remaining, 207);
  assert.equal(h.tracker.snapshot().discharge_remaining.ageSec, 0);
});

test('failed SDK writes cannot renew freshness; clearing retries and recovery requires that field', async t => {
  const h = harness(t);
  await h.apply({ bmsDsgRemTime: 207 });
  h.time(1000100);
  await h.apply({ bmsDsgRemTime: 208, bmsChgRemTime: 5939 }, undefined, 'unit', async (cap, value) => {
    if (cap === 'discharge_remaining') throw new Error('private SDK failure');
    await h.write(cap, value);
  });
  assert.equal(h.tracker.snapshot().discharge_remaining.applicationStatus, 'write_failed');
  assert.equal(h.tracker.snapshot().discharge_remaining.ageSec, null);
  assert.equal(h.values.charge_remaining, null);
  await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.discharge_remaining, null);
  await h.apply({ temp: 38 });
  assert.equal(h.tracker.snapshot().discharge_remaining.applicationStatus, 'write_failed');
  await h.apply({ bmsDsgRemTime: 210 });
  assert.equal(h.tracker.snapshot().discharge_remaining.applicationStatus, 'applied');
});

test('slow writes, clock rollback, reset and shutdown never bless an old estimate', async t => {
  const h = harness(t);
  await h.apply({ bmsDsgRemTime: 207 }, undefined, 'unit', async (cap, value) => {
    await h.write(cap, value); h.time(1180001);
  });
  assert.equal(h.values.discharge_remaining, null);
  await h.apply({ bmsDsgRemTime: 208 });
  h.tracker.observePower(-400, 1180001); await h.tracker.expire(h.write, h.live);
  h.time(1170000);
  await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.discharge_remaining, null);
  h.tracker.observePower(-400, 1170000);
  await h.apply({ bmsDsgRemTime: 211 });
  assert.equal(h.values.discharge_remaining, 211, 'a new current receipt can recover after clock rollback');
  h.tracker.reset();
  assert.equal(h.tracker.snapshot().discharge_remaining.source, 'unobserved');
  h.stop();
  const count = h.writes.length;
  await h.apply({ bmsDsgRemTime: 3 });
  assert.equal(h.writes.length, count);
});

test('direction, not port watts or the estimate magnitude, selects the remaining-time tile', async t => {
  const h = harness(t);
  await h.apply({ bmsChgRemTime: 5939, bmsDsgRemTime: 168, gridConnectionPower: 403.42 });
  assert.equal(h.values.charge_remaining, null); assert.equal(h.values.discharge_remaining, 168);
  h.tracker.observePower(300, 1000000); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.charge_remaining, 5939); assert.equal(h.values.discharge_remaining, null);
  h.tracker.observePower(0, 1000000); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.charge_remaining, null); assert.equal(h.values.discharge_remaining, null);
  h.tracker.observePower(null, 1000000); await h.tracker.expire(h.write, h.live);
  assert.equal(h.tracker.snapshot().charge_remaining.displayReason, 'direction_unavailable');
  assert.equal(h.tracker.snapshot().charge_remaining.reportedMinutes, 5939);
});

test('fresh estimates cannot extend stale power direction; power cannot extend stale estimates', async t => {
  const h = harness(t);
  await h.apply({ bmsDsgRemTime: 168 }); h.time(1180001);
  await h.apply({ bmsDsgRemTime: 167 }); assert.equal(h.values.discharge_remaining, null);
  h.tracker.observePower(-400, 1180001); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.discharge_remaining, 167);
  h.time(1360002); h.tracker.observePower(-400, 1360002); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.discharge_remaining, null);
  h.tracker.observePower(400, 1180001); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.charge_remaining ?? null, null);
});

test('a direction change waits for a fresh matching estimate, not the old inactive duration', async t => {
  const h = harness(t);
  await h.apply({ bmsChgRemTime: 5939, bmsDsgRemTime: 168 });
  h.time(1001000); h.tracker.observePower(400, 1001000); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.charge_remaining, null); assert.equal(h.values.discharge_remaining, null);
  assert.equal(h.tracker.snapshot().charge_remaining.displayReason, 'fresh_estimate_required');
  await h.apply({ bmsChgRemTime: 100 }); assert.equal(h.values.charge_remaining, 100);
  h.time(1002000); h.tracker.observePower(401, 1002000); await h.tracker.expire(h.write, h.live);
  assert.equal(h.values.charge_remaining, 100, 'same-direction updates do not continually suppress estimates');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStream5000Configuration: parse, Stream5000ConfigurationTracker: Tracker,
  stream5000ConfigurationSnapshot: project } = require('../.homeybuild/lib/stream5000Configuration');
const { decodeFrameHeaders } = require('../.homeybuild/lib/streamAc5000Protocol');
const { taskLists } = require('./helpers/stream5000ContractAudit');
const captures = require('./fixtures/stream5000ContractAudit.json').captures;
const SN = 'ES22TESTUNITAAAA';

test('clock rollback makes configuration stale rather than apparently newly received', () => {
  const tracker = new Tracker(SN);
  tracker.observe(frame(group(10, scalar(2, 1800))), 2000);
  assert.equal(tracker.snapshot(1999).values.maxGridInputW.stale, true);
  assert.equal(project(tracker.snapshot(1999)).values.maxGridInputW.stale, true);
});

function varint(value) {
  let n = BigInt(value);
  const bytes = [];
  do { bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n);
  return Buffer.from(bytes);
}
const scalar = (number, value) => Buffer.concat([varint(number * 8), varint(value)]);
const group = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
function frame(pdata, cmdFunc = 254, cmdId = 39, sn = SN) {
  return group(1, Buffer.concat([group(1, pdata), scalar(8, cmdFunc), scalar(9, cmdId), group(25, Buffer.from(sn))]));
}
function replay(sample, sn = SN) {
  return Buffer.concat(decodeFrameHeaders(Buffer.from(sample.hex, 'hex'))
    .map((header) => frame(header.pdata, header.cmdFunc, header.cmdId, sn)));
}

test('ES22 input/output readback follows independent public capture; writes are never readback', () => {
  const result = parse(replay(captures.es22GridInputReadback.frames[0]), SN).find((entry) => entry.maxGridInputW !== undefined);
  assert.equal(result.maxGridOutputW, 800);
  assert.equal(result.maxGridInputW, 1800);
  assert.equal(result.outputCeilingObservedW, 800);
  assert.equal(result.mode, 'custom');
  assert.equal(result.backupSocketEnabled, true);
  assert.equal(result.backupReserveEnabled, true);
  assert.equal(result.backupReservePct, 0);
  for (const sample of captures.es22GridInputWrites.frames) assert.deepEqual(parse(replay(sample), SN), []);
});

test('ES21 output readback is admitted without assuming ES21 input control', () => {
  const sn = 'ES21TESTUNITAAAA';
  const [result] = parse(replay(captures.es21OutputWrites.frames[2], sn), sn);
  assert.equal(result.maxGridOutputW, 1000);
  assert.equal(result.maxGridInputW, undefined);
});

test('both schedule captures match independent inspection including overnight windows and explicit zero', () => {
  for (const sample of captures.es22Tasks.frames) {
    const result = parse(replay(sample), SN).find((entry) => entry.tasks !== undefined);
    assert.deepEqual(result.tasks, taskLists(sample)[0]);
  }
});

test('whole task list replaces removed tasks; absent delta preserves it; explicit empty clears', () => {
  const tracker = new Tracker(SN);
  const byRole = (role) => captures.es22TaskDeletion.frames.find((sample) => sample.role === role);
  tracker.observe(replay(byRole('both_tasks_push')), 1000);
  assert.equal(tracker.snapshot(1000).values.tasks.value.length, 2);
  tracker.observe(replay(byRole('after_delete_push')), 2000);
  assert.equal(tracker.snapshot(2000).values.tasks.value.length, 1);
  tracker.observe(replay(byRole('no_task_list_push')), 3000);
  assert.equal(tracker.snapshot(3000).values.tasks.ageSec, 1);
  tracker.observe(frame(group(40, Buffer.alloc(0))), 4000);
  assert.deepEqual(tracker.snapshot(4000).values.tasks.value, []);
});

test('known mode/reserve/socket and authoritative 32/2 SOC limits decode independently', () => {
  const pdata = Buffer.concat([scalar(25, 1), group(19, scalar(1, 1)),
    group(30, Buffer.concat([scalar(1, 1), scalar(2, 25)]))]);
  assert.deepEqual(parse(frame(pdata), SN), [{ mode: 'intelligent_plus', backupSocketEnabled: true,
    backupReserveEnabled: true, backupReservePct: 25 }]);
  assert.deepEqual(parse(frame(group(1, Buffer.concat([scalar(7, 95), scalar(21, 10)])), 32, 2), SN),
    [{ maxChargeSocPct: 95, minDischargeSocPct: 10 }]);
  assert.deepEqual(parse(frame(Buffer.concat([scalar(25, 99), group(19, Buffer.alloc(0)), group(30, Buffer.alloc(0))])), SN),
    [{ mode: null, backupSocketEnabled: false, backupReserveEnabled: false }]);
});

test('configuration deltas preserve unrelated fields and age per field; restart has no restored settings', () => {
  const tracker = new Tracker(SN);
  tracker.observe(frame(group(10, scalar(2, 1800))), 1000);
  tracker.observe(frame(scalar(25, 2)), 3000);
  tracker.observe(frame(group(10, scalar(2, 0))), 500);
  const snapshot = tracker.snapshot(1202000);
  assert.equal(snapshot.values.maxGridInputW.value, 1800);
  assert.equal(snapshot.values.maxGridInputW.stale, true);
  assert.equal(snapshot.values.mode.stale, false);
  assert.equal(snapshot.ordering, 'receipt_only');
  assert.deepEqual(new Tracker(SN).snapshot().values, {});
  snapshot.values.maxGridInputW.value = 999;
  assert.equal(tracker.snapshot().values.maxGridInputW.value, 1800);
});

test('foreign serials, unknown models, malformed frames and out-of-range fields cannot change settings', () => {
  const good = group(10, scalar(2, 1800));
  assert.deepEqual(parse(frame(good, 254, 39, 'ES22FOREIGNAAAA'), SN), []);
  assert.deepEqual(parse(frame(good), 'ES23TESTUNITAAAA'), []);
  for (const bad of [Buffer.from([255]), group(10, scalar(2, 100001)), group(19, scalar(1, 2)),
    group(30, scalar(2, 101)), group(40, group(1, scalar(2, 1)))]) {
    assert.deepEqual(parse(frame(bad), SN), []);
  }
  assert.deepEqual(parse(Buffer.alloc(256 * 1024 + 1), SN), []);
  assert.deepEqual(parse(Buffer.concat([frame(Buffer.from([255])), frame(good)]), SN), [{ maxGridInputW: 1800 }]);
});

test('unknown/malformed task kinds never erase a known task list', () => {
  const tracker = new Tracker(SN);
  tracker.observe(replay(captures.es22Tasks.frames[0]), 1000);
  tracker.observe(frame(group(40, group(1, group(10, scalar(1, 2))))), 2000);
  assert.equal(tracker.snapshot(2000).values.tasks.value.length, 2);
  assert.equal(tracker.snapshot(2000).values.tasks.ageSec, 1);
});

test('privacy projection excludes arbitrary identifiers and nested secrets; malformed values are rejected', () => {
  const input = { source: 'captured_app_protocol', sn: 'PRIVATE', values: {
    maxGridInputW: { value: 1800, ageSec: 2, password: 'PRIVATE' },
    mode: { value: 'PRIVATE', ageSec: 0 },
    tasks: { ageSec: 0, value: [{ enabled: true, chargeW: 0, name: 'PRIVATE', sn: 'PRIVATE' }] },
    unknown: { value: 'PRIVATE', ageSec: 0 },
  } };
  const snapshot = project(input);
  assert.equal(snapshot.values.maxGridInputW.value, 1800);
  assert.equal(snapshot.values.mode, undefined);
  assert.deepEqual(snapshot.values.tasks.value, [{ enabled: true, chargeW: 0 }]);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
  input.values.tasks.value[0].chargeW = Infinity;
  assert.equal(project(input).values.tasks, undefined);
});

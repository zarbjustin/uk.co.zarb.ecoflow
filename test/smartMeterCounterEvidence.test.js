'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SmartMeterCounterEvidence, previewMeterCounterContinuity } = require('../.homeybuild/lib/smartMeterCounterEvidence');
const record = (i, e) => ({ todayActive: i, totalReactiveEnergy: e, totalActiveEnergy: i - e });

test('candidate relationship and directional advances never authorise migration', () => {
  const t = new SmartMeterCounterEvidence();
  t.observe(record(100, 20), 1000, 1000);
  t.observe(record(105, 20), 2000, 2000);
  t.observe(record(105, 30), 3000, 3000);
  const s = t.snapshot(4000);
  assert.equal(s.status, 'consistent');
  assert.equal(s.validRecords, 3);
  assert.equal(s.importAdvanceObserved, true);
  assert.equal(s.exportAdvanceObserved, true);
  assert.equal(s.migrationAllowed, false);
  assert.equal(s.midnightBehaviourVerified, false);
  assert.equal(s.unitsVerified, false);
});

test('partial records cannot combine into a valid candidate or manufacture missing export', () => {
  const t = new SmartMeterCounterEvidence();
  t.observe({ todayActive: 100 }, 1000, 1000);
  t.observe({ totalReactiveEnergy: 20, totalActiveEnergy: 80 }, 2000, 2000);
  assert.equal(t.snapshot(2000).status, 'incomplete');
  assert.equal(t.snapshot(2000).validRecords, 0);
});

test('explicit zero export and negative net are valid candidates, not daily counters', () => {
  const t = new SmartMeterCounterEvidence();
  t.observe(record(0, 20), 1000, 1000);
  assert.equal(t.snapshot(1000).status, 'consistent');
  const second = new SmartMeterCounterEvidence();
  second.observe(record(100, 0), 1000, 1000);
  assert.equal(second.snapshot(1000).status, 'consistent');
});

test('malformed, non-finite and inconsistent candidates are never valid records', () => {
  for (const value of [record(-10, 0), { ...record(100, 20), totalActiveEnergy: 12 },
    { ...record(100, 20), todayActive: NaN }, { ...record(100, 20), totalReactiveEnergy: '' }]) {
    const t = new SmartMeterCounterEvidence(); t.observe(value, 1000, 1000);
    assert.equal(t.snapshot(1000).validRecords, 0);
    assert.equal(t.snapshot(1000).migrationAllowed, false);
  }
});

test('counter decreases are visible; old/future samples cannot reset the latest evidence', () => {
  const t = new SmartMeterCounterEvidence();
  t.observe(record(100, 20), 1000, 1000);
  t.observe(record(0, 0), 2000, 2000);
  assert.equal(t.snapshot(2000).counterDecreaseObserved, true);
  t.observe(record(200, 20), 1500, 2000);
  t.observe(record(200, 20), 3000, 2000);
  assert.equal(t.snapshot(2000).status, 'counter_decrease');
  assert.equal(t.snapshot(200000).stale, true);
  assert.equal(t.snapshot(500).stale, true);
});

test('restart loses receipt evidence rather than treating previous counters as observed', () => {
  const t = new SmartMeterCounterEvidence();
  assert.equal(t.snapshot(1000).status, 'waiting');
  assert.equal(t.snapshot(1000).lastRecordAgeSec, null);
  assert.equal(t.snapshot(1000).stale, true);
});

test('preview anchors to the existing total, adds only new delta and blocks regressions', () => {
  assert.equal(previewMeterCounterContinuity(250, 1000000, 1000000), 250);
  assert.equal(previewMeterCounterContinuity(250, 1000000, 1000005), 255);
  assert.equal(previewMeterCounterContinuity(255, 1000005, 0), null);
  assert.equal(previewMeterCounterContinuity(255, 0, 0), 255);
  assert.equal(previewMeterCounterContinuity(-1, 0, 1), null);
  assert.equal(previewMeterCounterContinuity(1, 0, Infinity), null);
  assert.equal(previewMeterCounterContinuity(1, 1e16, 1e16), 1);
});

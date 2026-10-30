'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { reviewDualCtThreePhasePacket: review } = require('../.homeybuild/lib/dualCtThreePhaseReview');
const { scalar, context } = require('./helpers/dualCtSynthetic');
const bytes = rows => Buffer.concat(rows.map(([field, value]) => scalar(field, value)));
const phases = (p, extra = []) => bytes([[962, p[0]], [963, p[1]], [772, p[2]], [515, p.reduce((a, b) => a + b, 0)], ...extra]);
const at = context(1000);
function blocked(result) {
  assert.equal(result.energyEligible, false); assert.equal(result.hardwareValidated, false);
  assert.equal(result.phaseOrderVerified, false); assert.equal(result.measurementTimestampKnown, false);
  assert.equal(result.accountingPolicy, 'unverified');
}
for (const [name, p, net, gross] of [
  ['balanced import', [1000, 1000, 1000], [3000, 0], [3000, 0]],
  ['unbalanced import', [1700, 200, 100], [2000, 0], [2000, 0]],
  ['all-phase export', [-1000, -200, -300], [0, 1500], [0, 1500]],
  ['mixed import/export', [2000, -1500, -1000], [0, 500], [2000, 2500]],
  ['zero net with opposed phases', [1000, -500, -500], [0, 0], [1000, 1000]],
  ['explicit idle phase', [0, 500, -100], [400, 0], [500, 100]],
  ['all phases zero', [-0, 0, 0], [0, 0], [0, 0]],
]) test(`offline three-phase review: ${name}; never qualifies Energy`, () => {
  const r = review(phases(p), at); blocked(r); assert.equal(r.status, 'candidate_for_hardware_review');
  assert.deepEqual(r.candidate.netted, { importW: net[0], exportW: net[1] });
  assert.deepEqual(r.candidate.perPhase, { importW: gross[0], exportW: gross[1] });
});
test('CT2, voltage/current and raw vendor counters cannot change CT1 candidates', () => {
  const a = review(phases([100, 200, 300]), at);
  const b = review(phases([100, 200, 300], [[991, 50000], [992, -50000], [993, 20000], [998, 20000], [956, 230], [988, 10]]), at);
  assert.deepEqual(a.candidate, b.candidate); blocked(b);
});
test('no missing-phase filling, mixed-packet cache or missing total is admitted to review', () => {
  for (const rows of [[[962, 100], [963, 200], [515, 300]], [[772, 300], [515, 300]],
    [[962, 100], [963, 200], [772, 300]]]) {
    const r = review(bytes(rows), at); blocked(r); assert.equal(r.candidate, null);
  }
});
test('contradictory, duplicate, nonfinite and out-of-range phases stay blocked', () => {
  for (const input of [bytes([[962, 1], [963, 2], [772, 3], [515, 99]]), phases([1, 2, 3], [[962, 1]]),
    phases([NaN, 2, 3]), phases([100001, -100001, 0])]) {
    const r = review(input, at); blocked(r); assert.equal(r.candidate, null);
  }
});
test('wrong model, wrong packet route, unsupported encoding and stale receipt are rejected', () => {
  for (const c of [{...at, productType: 1}, {...at, cmdId: 39}, {...at, encoding: 'xor'}, {...at, now: 91000}]) {
    const r = review(phases([1, 2, 3]), c); blocked(r); assert.equal(r.candidate, null);
  }
});

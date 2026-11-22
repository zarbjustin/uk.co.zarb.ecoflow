'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeStreamLimits: decode, StreamLimitObservations } = require('../.homeybuild/lib/streamLimitDiagnostics');
function vi(n) { const bytes = []; do { bytes.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(bytes); }
function int(n, v) { return Buffer.concat([vi(n * 8), vi(v)]); }
function msg(n, b) { return Buffer.concat([vi(n * 8 + 2), vi(b.length), b]); }
function frame(data, sn = 'BK61SYNTHETIC', id = 21) { return msg(1, Buffer.concat([msg(1, data), int(8, 254), int(9, id), msg(25, Buffer.from(sn))])); }

test('original limit decoding admits read-only property fields, not write fields or available battery power', () => {
  const values = decode(frame(Buffer.concat([int(521, 1200), int(1495, 7200), int(727, 1500), int(1543, 1600),
    int(169, 99), int(579, 99), int(1383, 999)])), 'BK61SYNTHETIC');
  assert.deepEqual(values, { feedGridModePowLimit: 1200, sysGridInPwrLimit: 7200,
    feedGridModePowMax: 1500, feedGridSafetyPowMax: 1600 });
  assert.deepEqual(decode(frame(int(521, 0), 'BK31SYNTHETIC'), 'BK31SYNTHETIC'), { feedGridModePowLimit: 0 });
  for (const sn of ['ES22SYNTHETIC', 'BK99SYNTHETIC', 'BK61OTHER']) assert.deepEqual(decode(frame(int(521, 5)), sn), {});
  assert.deepEqual(decode(frame(int(521, 5), 'BK61SYNTHETIC', 17), 'BK61SYNTHETIC'), {});
});

test('malformed and wrong wire telemetry cannot decode a usable limit', () => {
  for (const data of [Buffer.alloc(65537), Buffer.from([255]), frame(Buffer.from([0])),
    frame(Buffer.concat([int(521, 1200), Buffer.from([255])])), frame(msg(521, Buffer.from('PRIVATE')))]) {
    assert.deepEqual(decode(data, 'BK61SYNTHETIC'), {});
  }
  assert.deepEqual(decode(frame(int(521, 100001)), 'BK61SYNTHETIC'), {});
});

test('limit observations are independent, bounded, expire and never enable control or verify scope', () => {
  const obs = new StreamLimitObservations();
  obs.observe({ feedGridModePowLimit: 1200, PRIVATE: 99 }, 1000000, 'app_property', 1000000);
  obs.observe({ sysGridInPwrLimit: 7200 }, 1100000, 'developer_quota', 1100000);
  obs.observe({ feedGridModePowLimit: 30 }, 999999, 'developer_quota', 1100000);
  obs.observe({ feedGridModePowLimit: 30 }, 1200000, 'developer_quota', 1100000);
  const fresh = obs.snapshot(1100000);
  assert.equal(fresh.feedGridModePowLimit.value, 1200);
  assert.equal(fresh.feedGridModePowLimit.scopeVerified, false);
  assert.equal(fresh.sysGridInPwrLimit.controlEnabled, false);
  assert.equal(fresh.feedGridModePowMax.value, null);
  const expired = obs.snapshot(1180001);
  assert.equal(expired.feedGridModePowLimit.value, null);
  assert.equal(expired.sysGridInPwrLimit.value, 7200);
  assert.equal(obs.snapshot(999999).feedGridModePowLimit.stale, true);
  assert.ok(!JSON.stringify(fresh).includes('PRIVATE'));
});

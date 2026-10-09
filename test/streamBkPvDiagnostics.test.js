'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeBkPvDiagnostics: decode, BkPvReceipts, BK_PV_STALE_MS } = require('../.homeybuild/lib/streamBkPvDiagnostics');

function vi(n) { const bytes = []; do { bytes.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(bytes); }
function int(n, value) { return Buffer.concat([vi(n * 8), vi(value)]); }
function msg(n, b) { return Buffer.concat([vi(n * 8 + 2), vi(b.length), b]); }
function float(n, value) { const b = Buffer.alloc(4); b.writeFloatLE(value); return Buffer.concat([vi(n * 8 + 5), b]); }
function frame(data, source, id = 21) {
  return msg(1, Buffer.concat([msg(1, data), int(8, 254), int(9, id), ...(source ? [msg(25, Buffer.from(source))] : [])]));
}
const sn = 'BK61SYNTHETIC0001';

test('BK 254/21 PV diagnostics decode only finite observed components and never power/energy', () => {
  const values = decode(frame(Buffer.concat([float(998, 32.5), float(999, 0.65), float(1000, 30.4), float(1001, 1.29), float(996, 21), float(518, 900)]), sn), sn);
  assert.deepEqual(values, { stream_unit_pv3_voltage: 32.5, stream_unit_pv3_current: Math.fround(0.65),
    stream_unit_pv4_voltage: Math.fround(30.4), stream_unit_pv4_current: Math.fround(1.29) });
  assert.ok(!Object.keys(values).some(k => /power|energy|battery/.test(k)));
});

test('PV3/4 obey model ports, envelope and source attribution rather than broad BK admission', () => {
  const data = Buffer.concat([float(998, 32), float(1000, 30)]);
  assert.deepEqual(decode(frame(data), 'BK12SYNTHETIC0001'), { stream_unit_pv3_voltage: 32 });
  for (const model of ['BK31', 'BK41', 'BK51', 'BK99', 'ES22']) assert.deepEqual(decode(frame(data), `${model}SYNTHETIC0001`), {});
  assert.deepEqual(decode(frame(data, 'BK61OTHER0001'), sn), {});
  assert.deepEqual(decode(frame(data, sn, 39), sn), {});
});

test('missing component stays absent, explicit zero remains zero and idle voltage is not generation', () => {
  assert.deepEqual(decode(frame(float(998, 2.6)), sn), { stream_unit_pv3_voltage: Math.fround(2.6) });
  assert.deepEqual(decode(frame(float(999, 0)), sn), { stream_unit_pv3_current: 0 });
});

test('malformed, oversized, wrong wire and nonphysical diagnostic values fail closed', () => {
  for (const data of [Buffer.from([255]), Buffer.alloc(65537), frame(Buffer.from([0]))]) assert.deepEqual(decode(data, sn), {});
  for (const value of [NaN, Infinity, -1, 101]) assert.deepEqual(decode(frame(float(998, value)), sn), {});
  assert.deepEqual(decode(frame(float(999, 31)), sn), {});
  assert.deepEqual(decode(frame(int(998, 20)), sn), {});
});

test('component freshness is independent and rejects backwards or future receipts', () => {
  const tracker = new BkPvReceipts();
  assert.equal(tracker.observe('stream_unit_pv3_voltage', 1000, 1000), true);
  assert.equal(tracker.observe('stream_unit_pv3_voltage', 999, 1000), false);
  assert.equal(tracker.observe('stream_unit_pv4_voltage', 1001, 1000), false);
  assert.equal(tracker.observe('PRIVATE', 1000, 1000), false);
  tracker.observe('stream_unit_pv3_current', 2000, 2000);
  assert.deepEqual(tracker.expired(1001 + BK_PV_STALE_MS), ['stream_unit_pv3_voltage']);
  assert.deepEqual(tracker.expired(999), ['stream_unit_pv3_voltage', 'stream_unit_pv3_current']);
  tracker.forget('stream_unit_pv3_voltage');
  assert.equal(tracker.snapshot(2000).stream_unit_pv3_voltage, undefined);
  assert.deepEqual(new BkPvReceipts().snapshot(2000), {});
});


'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeBkBatteryPower: decode } = require('../.homeybuild/lib/streamBkBatteryTelemetry');
function vi(n) { const out = []; do { out.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(out); }
function int(n, v) { return Buffer.concat([vi(n * 8), vi(v)]); }
function msg(n, b) { return Buffer.concat([vi(n * 8 + 2), vi(b.length), b]); }
function frame(data, source, func = 32, id = 50) {
  return msg(1, Buffer.concat([msg(1, data), int(8, func), int(9, id), ...(source ? [msg(25, Buffer.from(source))] : [])]));
}
const sn = 'BK31SYNTHETIC0001';

test('BMS detail exposes paired charge/discharge components without changing net scale or sign', () => {
  const { decodeBkBatteryReading } = require('../.homeybuild/lib/streamBkBatteryTelemetry');
  assert.deepEqual(decodeBkBatteryReading(frame(Buffer.concat([int(26, 0), int(27, 450)])), sn),
    { chargeW: 0, dischargeW: 450, powerW: -450 });
  assert.deepEqual(decodeBkBatteryReading(frame(Buffer.concat([int(26, 450), int(27, 0)])), sn),
    { chargeW: 450, dischargeW: 0, powerW: 450 });
  assert.equal(decodeBkBatteryReading(frame(Buffer.concat([int(26, 1), int(27, 450)])), sn), undefined);
  assert.equal(decodeBkBatteryReading(frame(Buffer.concat([int(26, 0), int(26, 0), int(27, 450)])), sn), undefined);
});

test('pinned public masked group BMS captures reproduce DC discharge, charge and idle', () => {
  for (const sample of require('./fixtures/streamBkBatteryPublic.json').frames) {
    assert.equal(decode(frame(Buffer.from(sample.pdataHex, 'hex')), 'BK11SYNTHETIC0001'), sample.expectedPowerW, sample.label);
  }
});

test('original battery charge/discharge DC watts require both BMS fields in one packet', () => {
  for (const prefix of ['BK11', 'BK12', 'BK31', 'BK41', 'BK51', 'BK61']) {
    assert.equal(decode(frame(Buffer.concat([int(26, 0), int(27, 404)])), `${prefix}SYNTHETIC0001`), -404);
  }
  assert.equal(decode(frame(Buffer.concat([int(26, 400), int(27, 0)])), sn), 400);
  assert.equal(decode(frame(Buffer.concat([int(26, 0), int(27, 0)])), sn), 0);
  assert.equal(decode(frame(int(26, 400)), sn), undefined);
  assert.equal(decode(Buffer.concat([frame(int(26, 400)), frame(int(27, 0))]), sn), undefined);
  assert.equal(decode(frame(Buffer.concat([int(26, 10), int(27, 20)])), sn), undefined);
});

test('BMS attribution, frame bounds and scalar types fail closed, never use grid or aggregate', () => {
  const data = Buffer.concat([int(26, 0), int(27, 404)]);
  assert.equal(decode(frame(data, 'BK31OTHER0001'), sn), undefined);
  for (const prefix of ['ES22', 'BK01', 'BK99']) assert.equal(decode(frame(data), `${prefix}SYNTHETIC0001`), undefined);
  assert.equal(decode(frame(data, sn, 254, 21), sn), undefined);
  assert.equal(decode(frame(Buffer.concat([int(518, 404), int(616, 403)])), sn), undefined);
  for (const bad of [Buffer.alloc(65537), frame(Buffer.from([0])), frame(Buffer.from([0xd0, 1, 0x80])),
    frame(Buffer.concat([int(26, 100001), int(27, 0)])), frame(Buffer.concat([data, int(27, 1)])),
    frame(Buffer.concat([msg(26, Buffer.from([1])), int(27, 0)]))]) assert.equal(decode(bad, sn), undefined);
});


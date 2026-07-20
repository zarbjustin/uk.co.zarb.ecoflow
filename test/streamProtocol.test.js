'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { StreamCmd } = require('../.homeybuild/lib/streamProtocol.js');

test('backup reserve supports 3-100% and clamps out-of-range values', () => {
  assert.strictEqual(StreamCmd.backupReserve('SN', 2).params.cfgBackupReverseSoc, 3);
  assert.strictEqual(StreamCmd.backupReserve('SN', 100).params.cfgBackupReverseSoc, 100);
  assert.strictEqual(StreamCmd.backupReserve('SN', 101).params.cfgBackupReverseSoc, 100);
});

test('charge and discharge limits retain their supported boundaries', () => {
  assert.strictEqual(StreamCmd.chargeLimit('SN', 0).params.cfgMaxChgSoc, 50);
  assert.strictEqual(StreamCmd.chargeLimit('SN', 100).params.cfgMaxChgSoc, 100);
  assert.strictEqual(StreamCmd.dischargeLimit('SN', 0).params.cfgMinDsgSoc, 0);
  assert.strictEqual(StreamCmd.dischargeLimit('SN', 100).params.cfgMinDsgSoc, 30);
});

const { backupReserveSequence, RESERVE_OVER_DISCHARGE_MARGIN } = require('../.homeybuild/lib/streamProtocol.js');

test('reserve well above the discharge limit sends only the reserve command', () => {
  const seq = backupReserveSequence('SN', 80, 10);
  assert.strictEqual(seq.reserve, 80);
  assert.strictEqual(seq.newDischargeLimit, undefined);
  assert.strictEqual(seq.commands.length, 1);
  assert.strictEqual(seq.commands[0].params.cfgBackupReverseSoc, 80);
});

test('reserve within the margin lowers the discharge limit FIRST, then sets reserve (8524 fix)', () => {
  const seq = backupReserveSequence('SN', 5, 10);
  assert.strictEqual(seq.reserve, 5);
  assert.strictEqual(seq.newDischargeLimit, 5 - RESERVE_OVER_DISCHARGE_MARGIN);
  assert.strictEqual(seq.commands.length, 2);
  assert.strictEqual(seq.commands[0].params.cfgMinDsgSoc, 2);
  assert.strictEqual(seq.commands[1].params.cfgBackupReverseSoc, 5);
});

test('a very low reserve clamps the new discharge limit to 0', () => {
  const seq = backupReserveSequence('SN', 3, 10);
  assert.strictEqual(seq.newDischargeLimit, 0);
  assert.strictEqual(seq.commands[0].params.cfgMinDsgSoc, 0);
});

test('an unknown current discharge limit does not touch the limit', () => {
  const seq = backupReserveSequence('SN', 5, undefined);
  assert.strictEqual(seq.newDischargeLimit, undefined);
  assert.strictEqual(seq.commands.length, 1);
});

test('reserve is clamped to 3..100', () => {
  assert.strictEqual(backupReserveSequence('SN', 200, 0).reserve, 100);
  assert.strictEqual(backupReserveSequence('SN', 1, undefined).reserve, 3);
});

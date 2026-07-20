'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { backupReserveSequence, RESERVE_OVER_DISCHARGE_MARGIN } = require('../.homeybuild/lib/streamProtocol.js');

function paramsOf(cmd) {
  return cmd.params;
}

test('reserve well above the discharge limit sends only the reserve command', () => {
  const seq = backupReserveSequence('BK11SN', 80, 10);
  assert.strictEqual(seq.reserve, 80);
  assert.strictEqual(seq.newDischargeLimit, undefined);
  assert.strictEqual(seq.commands.length, 1);
  assert.strictEqual(paramsOf(seq.commands[0]).cfgBackupReverseSoc, 80);
});

test('reserve within the margin lowers the discharge limit FIRST, then sets reserve (error 8524 fix)', () => {
  const seq = backupReserveSequence('BK11SN', 5, 10);
  // 5 <= 10 + 3 → must lower the discharge limit first.
  assert.strictEqual(seq.reserve, 5);
  assert.strictEqual(seq.newDischargeLimit, 5 - RESERVE_OVER_DISCHARGE_MARGIN);
  assert.strictEqual(seq.commands.length, 2);
  // Ordering matters: discharge limit before reserve.
  assert.strictEqual(paramsOf(seq.commands[0]).cfgMinDsgSoc, 2);
  assert.strictEqual(paramsOf(seq.commands[1]).cfgBackupReverseSoc, 5);
});

test('a very low reserve clamps the new discharge limit to 0', () => {
  const seq = backupReserveSequence('BK11SN', 3, 10);
  assert.strictEqual(seq.reserve, 3);
  assert.strictEqual(seq.newDischargeLimit, 0); // max(0, 3-3)
  assert.strictEqual(paramsOf(seq.commands[0]).cfgMinDsgSoc, 0);
});

test('an unknown current discharge limit does not touch the limit', () => {
  const seq = backupReserveSequence('BK11SN', 5, undefined);
  assert.strictEqual(seq.newDischargeLimit, undefined);
  assert.strictEqual(seq.commands.length, 1);
  assert.strictEqual(paramsOf(seq.commands[0]).cfgBackupReverseSoc, 5);
});

test('reserve is clamped to the 3..95 range', () => {
  assert.strictEqual(backupReserveSequence('BK11SN', 200, 0).reserve, 95);
  assert.strictEqual(backupReserveSequence('BK11SN', 1, undefined).reserve, 3);
});

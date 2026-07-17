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

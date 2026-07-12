'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  collectStreamUnits, groupByMainSn, mapWithConcurrency, systemName,
} = require('../.homeybuild/lib/streamPairing.js');

const MAIN = 'BK61ZK1B2H720041';

function stubClient() {
  return {
    async getDeviceList() {
      return [
        { sn: 'BK61ZK1B2H720041', deviceName: 'STREAM Ultra X Right' },
        { sn: 'BK61ZK1B2H720035', deviceName: 'STREAM Ultra X Left' },
        { sn: 'BK31ZK1A4H4R0186', deviceName: 'STREAM AC Pro 1.2' },
        { sn: 'BK21Z1BB7H414289', deviceName: 'Smart Meter' },
        { sn: 'BK01Z11ACH4P0489', deviceName: 'STREAM Microinverter' },
      ];
    },
    async getQuotaAll() { return {}; },
    async getMainSn() { return MAIN; },
  };
}

test('collectStreamUnits keeps only STREAM units and resolves the main SN', async () => {
  const units = await collectStreamUnits(stubClient());
  const sns = units.map((u) => u.device.sn).sort();
  assert.deepStrictEqual(sns, ['BK31ZK1A4H4R0186', 'BK61ZK1B2H720035', 'BK61ZK1B2H720041']);
  // Smart Meter (BK21) and Microinverter (BK01) excluded.
  assert.ok(!sns.includes('BK21Z1BB7H414289'));
  assert.ok(!sns.includes('BK01Z11ACH4P0489'));
  for (const u of units) {
    assert.strictEqual(u.mainSn, MAIN);
    assert.ok(u.quota && typeof u.quota === 'object');
  }
});

test('groupByMainSn groups all units of a system together', async () => {
  const units = await collectStreamUnits(stubClient());
  const groups = groupByMainSn(units);
  assert.strictEqual(groups.size, 1);
  assert.strictEqual(groups.get(MAIN).length, 3);
});

test('systemName prefers the main unit name', async () => {
  const units = await collectStreamUnits(stubClient());
  assert.strictEqual(systemName(units, MAIN), 'STREAM Ultra X Right');
  assert.strictEqual(systemName(units, 'UNKNOWN'), 'STREAM Ultra X Right'); // falls back to first
  assert.strictEqual(systemName([], MAIN), 'EcoFlow STREAM');
});

test('mapWithConcurrency preserves result order and respects its limit', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });
  assert.deepStrictEqual(result, [2, 4, 6, 8, 10]);
  assert.strictEqual(peak, 2);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  collectStreamUnits, groupByMainSn, householdBatteryName, mapWithConcurrency, systemName,
} = require('../.homeybuild/lib/streamPairing.js');
const { EcoFlowApiError } = require('../.homeybuild/lib/EcoFlowClient.js');

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
        { sn: 'ES22ZE1B2J6W0110', deviceName: 'STREAM AC 5000', productName: 'STREAM AC 5000' },
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
  // The STREAM AC 5000 (ES22) is a different product line and protocol; it is
  // served by the experimental stream_ac5000 driver, never by these.
  assert.ok(!sns.includes('ES22ZE1B2J6W0110'));
  for (const u of units) {
    assert.strictEqual(u.mainSn, MAIN);
    assert.ok(u.quota && typeof u.quota === 'object');
  }
});

test('an ES22 is never probed for a quota during BK-series pairing', async () => {
  const probed = [];
  const resolved = [];
  const client = {
    ...stubClient(),
    async getQuotaAll(sn) {
      probed.push(sn);
      return {};
    },
    async getMainSn(sn) {
      resolved.push(sn);
      return MAIN;
    },
  };
  await collectStreamUnits(client);
  assert.ok(probed.length > 0);
  assert.ok(!probed.includes('ES22ZE1B2J6W0110'));
  assert.ok(!resolved.includes('ES22ZE1B2J6W0110'));
});

test('STREAM AC 5000 and STREAM 5000 names are rejected before API probing', async () => {
  let probes = 0;
  const client = {
    async getDeviceList() {
      return [
        { sn: 'ZZ990001', productName: 'STREAM AC 5000' },
        { sn: 'ZZ990002', deviceName: 'EcoFlow STREAM 5000' },
      ];
    },
    async getQuotaAll() {
      probes += 1;
      throw new Error('must not be called');
    },
    async getMainSn() {
      throw new Error('must not be called');
    },
  };

  assert.deepStrictEqual(await collectStreamUnits(client), []);
  assert.strictEqual(probes, 0);
});

test('an unknown generic STREAM candidate is not paired fail-open on API 1006', async () => {
  let mainSnCalls = 0;
  const client = {
    async getDeviceList() {
      return [{ sn: 'ZZ99FUTURE', productName: 'STREAM Future Battery' }];
    },
    async getQuotaAll() {
      throw new EcoFlowApiError('1006', 'device is not supported');
    },
    async getMainSn() {
      mainSnCalls += 1;
      return 'ZZ99FUTURE';
    },
  };

  assert.deepStrictEqual(await collectStreamUnits(client), []);
  assert.strictEqual(mainSnCalls, 0);
});

test('known BK units remain pairable through transient quota failures', async () => {
  const client = {
    async getDeviceList() {
      return [{ sn: 'BK51KNOWN', deviceName: 'STREAM AC' }];
    },
    async getQuotaAll() {
      throw new Error('temporary network failure');
    },
    async getMainSn() {
      return 'BK51KNOWN';
    },
  };

  const units = await collectStreamUnits(client);
  assert.strictEqual(units.length, 1);
  assert.strictEqual(units[0].device.sn, 'BK51KNOWN');
});

test('an unknown prefix with positive STREAM quota evidence remains discoverable', async () => {
  const client = {
    async getDeviceList() {
      return [{ sn: 'ZZ99VERIFIED', deviceName: 'STREAM Future Battery' }];
    },
    async getQuotaAll() {
      return { cmsBattSoc: 73, powGetSysLoad: 350 };
    },
    async getMainSn(sn) {
      return sn;
    },
  };

  const units = await collectStreamUnits(client);
  assert.strictEqual(units.length, 1);
  assert.strictEqual(units[0].device.sn, 'ZZ99VERIFIED');
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

test('householdBatteryName identifies the aggregate home battery', () => {
  const units = [{
    device: { sn: MAIN, deviceName: 'STREAM Ultra X Right' },
    mainSn: MAIN,
    quota: {},
  }];
  assert.strictEqual(householdBatteryName(units, MAIN), 'STREAM Home Battery');
  assert.strictEqual(
    householdBatteryName(units, MAIN, true),
    'STREAM Home Battery (STREAM Ultra X Right)',
  );
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

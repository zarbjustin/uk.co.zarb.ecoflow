'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  pairedStream5000Serials,
  stream5000HomeBatteryPairingOptions,
  stream5000PairingDevices,
} = require('../.homeybuild/lib/stream5000Pairing.js');

const device = (sn) => ({ getData: () => ({ sn }) });

test('physical-unit pairing suppresses serials under active and compatibility unit drivers', () => {
  const current = {
    getDevices: () => [device('ES22CURRENT0001')],
  };
  const legacy = {
    getDevices: () => [device('ES22LEGACY0002')],
  };
  current.homey = {
    drivers: {
      getDriver(id) {
        if (id === 'stream_5000_unit') return current;
        if (id === 'stream_ac5000') return legacy;
        throw new Error('unknown driver');
      },
    },
  };

  assert.deepStrictEqual(
    [...pairedStream5000Serials(current)].sort(),
    ['ES22CURRENT0001', 'ES22LEGACY0002'],
  );
});

test('unified Home Battery pairing shares its aggregate namespace only with the legacy test driver', () => {
  const system = { getDevices: () => [device('ES22SYSTEM0001')] };
  const legacySystem = { getDevices: () => [device('ES22LEGACYSYSTEM0002')] };
  const unit = { getDevices: () => [device('ES22UNIT0001')] };
  system.homey = {
    drivers: {
      getDriver(id) {
        if (id === 'stream') return system;
        if (id === 'stream_5000_system') return legacySystem;
        if (id === 'stream_5000_unit') return unit;
        throw new Error('unknown driver');
      },
    },
  };

  assert.deepStrictEqual(
    [...pairedStream5000Serials(system, ['stream', 'stream_5000_system'])].sort(),
    ['ES22LEGACYSYSTEM0002', 'ES22SYSTEM0001'],
  );
  assert.ok(!pairedStream5000Serials(system, ['stream', 'stream_5000_system']).has('ES22UNIT0001'));
});

test('5000 Home Battery pairing records select the shared driver runtime and capability profile', () => {
  const driver = {
    getDevices: () => [],
    homey: { drivers: { getDriver: () => { throw new Error('not installed'); } } },
  };
  const paired = stream5000PairingDevices(driver, [{
    sn: 'ES22ZEB1ABCD0001',
    name: 'STREAM AC 5000',
    productName: 'STREAM AC 5000',
    online: 1,
    shared: false,
  }], stream5000HomeBatteryPairingOptions());

  assert.strictEqual(paired.length, 1);
  assert.strictEqual(paired[0].name, 'STREAM Home Battery');
  assert.strictEqual(paired[0].store.streamProfile, 'stream_5000');
  assert.strictEqual(paired[0].store.stream5000Role, 'home_battery');
  assert.strictEqual(paired[0].store.stream5000TelemetryAdapter, 'es22');
  assert.ok(paired[0].capabilities.includes('measure_power'));
  assert.ok(paired[0].capabilities.includes('meter_power.charged'));
  assert.ok(!paired[0].capabilities.includes('operating_mode'));
});

test('cross-driver duplicate detection tolerates missing and malformed drivers', () => {
  const driver = {
    getDevices: () => [device('ES22VALID0001'), { getData: () => { throw new Error('bad device'); } }],
    homey: { drivers: { getDriver: () => { throw new Error('not installed'); } } },
  };
  assert.deepStrictEqual([...pairedStream5000Serials(driver)], ['ES22VALID0001']);
});

test('family duplicate detection ignores BK devices in the unified stream driver', () => {
  const driver = {
    getDevices: () => [device('BK61EXISTING0001'), device('ES22VALID0001')],
    homey: { drivers: { getDriver: () => { throw new Error('not installed'); } } },
  };
  assert.deepStrictEqual([...pairedStream5000Serials(driver)], ['ES22VALID0001']);
});

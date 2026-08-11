'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { pairedStream5000Serials } = require('../.homeybuild/lib/stream5000Pairing.js');

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

test('aggregate pairing has an independent serial namespace from physical-unit monitors', () => {
  const system = { getDevices: () => [device('ES22SYSTEM0001')] };
  const unit = { getDevices: () => [device('ES22UNIT0001')] };
  system.homey = {
    drivers: {
      getDriver(id) {
        if (id === 'stream_5000_system') return system;
        if (id === 'stream_5000_unit') return unit;
        throw new Error('unknown driver');
      },
    },
  };

  assert.deepStrictEqual(
    [...pairedStream5000Serials(system, ['stream_5000_system'])],
    ['ES22SYSTEM0001'],
  );
  assert.ok(!pairedStream5000Serials(system, ['stream_5000_system']).has('ES22UNIT0001'));
});

test('cross-driver duplicate detection tolerates missing and malformed drivers', () => {
  const driver = {
    getDevices: () => [device('ES22VALID0001'), { getData: () => { throw new Error('bad device'); } }],
    homey: { drivers: { getDriver: () => { throw new Error('not installed'); } } },
  };
  assert.deepStrictEqual([...pairedStream5000Serials(driver)], ['ES22VALID0001']);
});

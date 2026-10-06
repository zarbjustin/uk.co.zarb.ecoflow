'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { pairedStream5000Serials, registerStream5000Pairing } = require('../.homeybuild/lib/stream5000Pairing.js');
const { EcoFlowAppAuthClient } = require('../.homeybuild/lib/EcoFlowAppAuthClient.js');
const { normalizeAppDeviceList, streamAc5000Devices } = require('../.homeybuild/lib/appDevices.js');
const {
  isStream5000BetaEnabled,
  requireStream5000BetaAccess,
  STREAM_5000_BETA_DISABLED_MESSAGE,
} = require('../.homeybuild/lib/stream5000Beta.js');

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

test('STREAM 5000 beta access is opt-in and only explicit true enables it', () => {
  const homey = { settings: { get: () => undefined } };
  assert.strictEqual(isStream5000BetaEnabled(homey), false);
  homey.settings.get = () => 'true';
  assert.strictEqual(isStream5000BetaEnabled(homey), false);
  homey.settings.get = () => true;
  assert.strictEqual(isStream5000BetaEnabled(homey), true);
});

test('the shared pairing gate gives actionable guidance when beta access is off', () => {
  const homey = { settings: { get: () => false } };
  assert.throws(
    () => requireStream5000BetaAccess(homey),
    (err) => err.message === STREAM_5000_BETA_DISABLED_MESSAGE,
  );
  homey.settings.get = () => true;
  assert.doesNotThrow(() => requireStream5000BetaAccess(homey));
});

test('ES21 pairs into both beta roles with explicit model metadata, never the legacy AC driver', async (t) => {
  let discoveries = 0;
  const accountDevices = normalizeAppDeviceList({ bound: {
    ES21TESTUNITAAAA: { productName: '', online: 1 },
    ES22TESTUNITBBBB: { online: 1 },
    ES23UNVERIFIED: { productName: 'STREAM 5000', online: 1 },
  } });
  t.mock.method(EcoFlowAppAuthClient.prototype, 'getDeviceList', async () => { discoveries += 1; return accountDevices; });
  let beta = false;
  const system = { getDevices: () => [] };
  const unit = { getDevices: () => [device('ES21TESTUNITAAAA')] };
  const homey = {
    settings: { get: (key) => ({ appAuthEmail: 'tester@example.invalid', appAuthPassword: 'fake-password', stream5000BetaEnabled: beta }[key]) },
    drivers: { getDriver: (id) => ({ stream_5000_system: system, stream_5000_unit: unit }[id]) },
  };
  const observations = [];
  homey.app = { beginStreamDiscoveryObservation: () => (devices) => observations.push(devices) };
  const register = (driver, options) => {
    driver.homey = homey;
    const handlers = {};
    registerStream5000Pairing(driver, { setHandler: (name, handler) => { handlers[name] = handler; } }, options);
    return handlers;
  };
  const systemHandlers = register(system, { duplicateDriverIds: ['stream_5000_system'] });
  await assert.rejects(systemHandlers.list_devices(), /beta access is disabled/);
  assert.strictEqual(discoveries, 0);
  assert.strictEqual(observations.length, 0);
  beta = true;
  const systems = await systemHandlers.list_devices();
  assert.strictEqual(discoveries, 1, 'inventory must not fetch an extra list');
  assert.strictEqual(observations[0], accountDevices, 'observe before unknown devices and paired duplicates are filtered');
  assert.deepStrictEqual(systems[0], {
    name: 'STREAM 5000', data: { sn: 'ES21TESTUNITAAAA' },
    store: { stream5000ModelId: 'stream_5000', stream5000TelemetryAdapter: 'es21' },
  });
  assert.strictEqual(systems.length, 2, 'unknown prefix is not admitted by name');
  const units = await register(unit).list_devices();
  assert.deepStrictEqual(units.map((entry) => entry.data.sn), ['ES22TESTUNITBBBB'], 'same-role ES21 duplicate is hidden');
  unit.getDevices = () => [];
  assert.strictEqual((await register(unit).list_devices())[0].store.stream5000TelemetryAdapter, 'es21');
  const legacy = await register({ getDevices: () => [] }, { selectDevices: streamAc5000Devices }).list_devices();
  assert.deepStrictEqual(legacy.map((entry) => entry.data.sn), ['ES22TESTUNITBBBB']);
});

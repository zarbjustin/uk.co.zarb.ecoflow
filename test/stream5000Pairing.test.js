'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { pairedStream5000Serials, registerStream5000Pairing } = require('../.homeybuild/lib/stream5000Pairing.js');
const { EcoFlowAppAuthClient } = require('../.homeybuild/lib/EcoFlowAppAuthClient.js');
const { normalizeAppDeviceList, streamAc5000Devices } = require('../.homeybuild/lib/appDevices.js');
const {
  isStream5000AggregatePairingEnabled,
  requireStream5000PairingAccess,
  stream5000PairingRole,
  STREAM_5000_AGGREGATE_DISABLED_MESSAGE,
} = require('../.homeybuild/lib/stream5000PairingAccess.js');

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

test('aggregate Energy pairing is default-off and only explicit true enables it', () => {
  const homey = { settings: { get: () => undefined } };
  assert.strictEqual(isStream5000AggregatePairingEnabled(homey), false);
  homey.settings.get = () => 'true';
  assert.strictEqual(isStream5000AggregatePairingEnabled(homey), false);
  homey.settings.get = () => true;
  assert.strictEqual(isStream5000AggregatePairingEnabled(homey), true);
});

test('only aggregate pairing needs an opt-in; unknown roles fail closed', () => {
  const homey = { settings: { get: () => false } };
  assert.throws(
    () => requireStream5000PairingAccess('system', homey),
    (err) => err.message === STREAM_5000_AGGREGATE_DISABLED_MESSAGE,
  );
  homey.settings.get = () => true;
  assert.doesNotThrow(() => requireStream5000PairingAccess('system', homey));
  assert.doesNotThrow(() => requireStream5000PairingAccess('unit', { settings: { get: () => { throw Error('must not read a gate'); } } }));
  assert.throws(() => requireStream5000PairingAccess('unknown', homey));
  assert.equal(stream5000PairingRole('stream_5000_system'), 'system');
  assert.equal(stream5000PairingRole('stream_5000_unit'), 'unit');
  assert.equal(stream5000PairingRole('stream_ac5000'), 'unit');
  assert.throws(() => stream5000PairingRole('stream'));
});

test('ES21/ES22 unit discovery is independent from the default-off aggregate gate', async (t) => {
  let discoveries = 0;
  const accountDevices = normalizeAppDeviceList({ bound: {
    ES21TESTUNITAAAA: { productName: '', online: 1 },
    ES22TESTUNITBBBB: { online: 1 },
    ES23UNVERIFIED: { productName: 'STREAM 5000', online: 1 },
  } });
  t.mock.method(EcoFlowAppAuthClient.prototype, 'getDeviceList', async () => { discoveries += 1; return accountDevices; });
  let aggregate = false;
  const system = { id: 'stream_5000_system', getDevices: () => [] };
  const unit = { id: 'stream_5000_unit', getDevices: () => [device('ES21TESTUNITAAAA')] };
  const homey = {
    settings: { get: (key) => ({ appAuthEmail: 'tester@example.invalid', appAuthPassword: 'fake-password', stream5000BetaEnabled: true, stream5000AggregatePairingEnabled: aggregate }[key]) },
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
  await assert.rejects(systemHandlers.list_devices(), /Home Battery pairing is disabled/);
  await assert.rejects(systemHandlers.add_device(), /Home Battery pairing is disabled/);
  assert.strictEqual(discoveries, 0);
  assert.strictEqual(observations.length, 0);
  const unitHandlers = register(unit);
  assert.equal(unitHandlers.check_stream_5000_aggregate_access, undefined);
  const initialUnits = await unitHandlers.list_devices();
  assert.deepStrictEqual(initialUnits.map(entry => entry.data.sn), ['ES22TESTUNITBBBB']);
  aggregate = true;
  const systems = await systemHandlers.list_devices();
  assert.strictEqual(discoveries, 2, 'one inventory fetch per allowed discovery');
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
  const legacy = await register({ id: 'stream_ac5000', getDevices: () => [] }, { selectDevices: streamAc5000Devices }).list_devices();
  assert.deepStrictEqual(legacy.map((entry) => entry.data.sn), ['ES22TESTUNITBBBB']);
});

test('the retired flag cannot grant Energy access and no admission check writes settings', () => {
  for (const oldValue of [undefined, false, true]) {
    const read = [];
    const homey = { settings: { get: key => { read.push(key); return key === 'stream5000BetaEnabled' ? oldValue : undefined; },
      set: () => assert.fail('must not migrate/write settings'), unset: () => assert.fail('must not delete settings') } };
    assert.equal(isStream5000AggregatePairingEnabled(homey), false);
    assert.doesNotThrow(() => requireStream5000PairingAccess('unit', homey));
    assert.throws(() => requireStream5000PairingAccess('system', homey));
    assert.ok(read.every(key => key === 'stream5000AggregatePairingEnabled'));
  }
});

test('aggregate opt-out during discovery rejects the late list and subsequent add', async (t) => {
  let resolve;
  t.mock.method(EcoFlowAppAuthClient.prototype, 'getDeviceList', () => new Promise(done => { resolve = done; }));
  let enabled = true; let observations = 0; let writes = 0;
  const driver = { id: 'stream_5000_system', getDevices: () => [], homey: {
    settings: { get: key => ({ appAuthEmail: 'tester@example.invalid', appAuthPassword: 'fake-password', stream5000AggregatePairingEnabled: enabled }[key]),
      set: () => { writes += 1; } },
    app: { beginStreamDiscoveryObservation: () => () => { observations += 1; } },
  } };
  const handlers = {};
  registerStream5000Pairing(driver, { setHandler: (name, handler) => { handlers[name] = handler; } });
  const pending = handlers.list_devices();
  enabled = false;
  resolve(normalizeAppDeviceList({ bound: { ES22TESTUNITBBBB: { online: 1 } } }));
  await assert.rejects(pending, /Home Battery pairing is disabled/);
  await assert.rejects(handlers.add_device(), /Home Battery pairing is disabled/);
  assert.equal(observations, 0); assert.equal(writes, 0);
});

test('unknown pairing drivers fail before reading credentials or registering handlers', () => {
  const driver = { id: 'stream_unknown', homey: { settings: { get: () => assert.fail('no credentials read') } } };
  assert.throws(() => registerStream5000Pairing(driver, { setHandler: () => assert.fail('no handler') }), /Unsupported/);
});

test('revoked aggregate consent cannot commit a newly entered account, but unit pairing still can', async (t) => {
  t.mock.method(EcoFlowAppAuthClient.prototype, 'getSession', async () => ({ host: 'https://api-e.ecoflow.com' }));
  for (const id of ['stream_5000_system', 'stream_5000_unit']) {
    const store = new Map([['stream5000AggregatePairingEnabled', true], ['stream5000BetaEnabled', true]]);
    const driver = { id, getDevices: () => [], homey: { settings: {
      get: key => store.get(key), set: (key, value) => store.set(key, value),
    } } };
    const handlers = {};
    registerStream5000Pairing(driver, { setHandler: (name, handler) => { handlers[name] = handler; } });
    await handlers.app_login({ email: 'tester@example.invalid', password: 'synthetic-password' });
    store.set('stream5000AggregatePairingEnabled', false);
    if (id === 'stream_5000_system') {
      await assert.rejects(handlers.add_device(), /Home Battery pairing is disabled/);
      assert.equal(store.has('appAuthPassword'), false);
    } else {
      await handlers.add_device();
      assert.equal(store.get('appAuthPassword'), 'synthetic-password');
    }
    assert.equal(store.get('stream5000BetaEnabled'), true);
  }
});

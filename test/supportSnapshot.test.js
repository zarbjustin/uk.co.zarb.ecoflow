'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');
const api = require('../.homeybuild/api');
const manifest = require('../.homeycompose/app.json');

function homey() {
  return {
    version: '13.5.0', platform: 'local',
    manifest: { version: '1.10.17', drivers: [{ id: 'stream_5000_system' }, { id: 'stream_5000_unit' }] },
    settings: { get: (key) => {
      assert.equal(key, 'stream5000BetaEnabled', 'report must not read credentials');
      return true;
    } },
    drivers: { getDriver: () => { throw new Error('private serial ES22PRIVATE000001'); } },
  };
}

test('support report distinguishes packaged drivers from runtime registration', () => {
  const snapshot = createSupportSnapshot(homey());
  assert.equal(snapshot.appVersion, '1.10.17');
  assert.equal(snapshot.homeyVersion, '13.5.0');
  assert.equal(snapshot.betaPairingEnabled, true);
  const driver = snapshot.drivers.find((item) => item.id === 'stream_5000_system');
  assert.equal(driver.packaged, true);
  assert.equal(driver.registered, false);
  assert.equal(driver.pairedCount, 0);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
});

test('support accounting projection drops unexpected fields and non-finite readings', () => {
  const instance = homey();
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream_5000_system' ? [{
    getData: () => { throw new Error('identity must not be read'); },
    getName: () => { throw new Error('name must not be read'); },
    getEnergyDiagnostics: () => ({
      source: 'integrated_power', samples: 5, chargedKWh: 1.25, dischargedKWh: Infinity,
      password: 'secret-password', sn: 'ES22PRIVATE000001',
      checkpoint: { failures: 2, pending: true, secret: 'secret-password' },
    }),
  }] : [] });
  const snapshot = createSupportSnapshot(instance);
  const driver = snapshot.drivers.find((item) => item.id === 'stream_5000_system');
  assert.equal(driver.registered, true);
  assert.equal(driver.pairedCount, 1);
  assert.equal(driver.accounting[0].source, 'integrated_power');
  assert.equal(driver.accounting[0].chargedKWh, 1.25);
  assert.equal(driver.accounting[0].dischargedKWh, null);
  assert.equal(driver.accounting[0].checkpoint.failures, 2);
  assert.ok(!JSON.stringify(snapshot).includes('secret-password'));
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
});

test('support API is a read-only GET with no credential validation or cloud call', async () => {
  assert.deepEqual(manifest.api.supportSnapshot, { method: 'GET', path: '/support-snapshot' });
  const report = await api.supportSnapshot({ homey: homey() });
  assert.equal(report.schemaVersion, 1);
});

test('old runtime omissions remain explicit rather than inventing a version/platform', () => {
  const report = createSupportSnapshot({});
  assert.equal(report.appVersion, null);
  assert.equal(report.homeyVersion, null);
  assert.equal(report.platform, 'unknown');
  assert.equal(report.betaPairingEnabled, false);
});

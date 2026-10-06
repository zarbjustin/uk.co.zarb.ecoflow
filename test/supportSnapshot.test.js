'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');
const api = require('../.homeybuild/api');
const manifest = require('../.homeycompose/app.json');

test('per-reading freshness projection excludes identities and catches nested getter failures', () => {
  const instance = homey();
  let malicious = false;
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream_5000_unit' ? [{
    getReadingDiagnostics: () => malicious ? { get measure_power() { throw new Error('PRIVATE'); } }
      : { measure_power: { ageSec: 12, stale: false, sn: 'PRIVATE' }, 'PRIVATE': { ageSec: 2 } },
  }] : [] });
  const report = createSupportSnapshot(instance);
  assert.deepEqual(report.drivers.find(d => d.id === 'stream_5000_unit').readingFreshness[0].readings,
    { measure_power: { ageSec: 12, stale: false } });
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  malicious = true;
  assert.ok(!JSON.stringify(createSupportSnapshot(instance)).includes('PRIVATE'));
});

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

test('support report projects anonymous read-only configuration with receipt age and no private fields', () => {
  const instance = homey();
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream_5000_unit' ? [{
    getConfigurationDiagnostics: () => ({ source: 'captured_app_protocol', sn: 'PRIVATE', values: {
      maxGridInputW: { value: 1800, ageSec: 1201, token: 'PRIVATE' },
      tasks: { value: [{ enabled: true, dischargeW: 0, sn: 'PRIVATE' }], ageSec: 2 },
    } }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const observation = report.drivers.find((item) => item.id === 'stream_5000_unit').configuration[0];
  assert.equal(observation.deviceIndex, 0);
  assert.equal(observation.values.maxGridInputW.stale, true);
  assert.equal(observation.controlsEnabled, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

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
  assert.equal(report.schemaVersion, 5);
});

test('support report re-projects cached discovery without network or identity access', () => {
  const instance = homey();
  const observedAt = Date.now() - 1000;
  instance.app = { getStreamDiscoveryEvidence: () => ({ observedAt, token: 'PRIVATE', groups: [
    { prefix: 'ZZ11', verifiedModel: 'unverified', productHint: 'expansion_5000', count: 1,
      onlineCount: 1, sharedCount: 0, sn: 'PRIVATE' },
  ] }) };
  const report = createSupportSnapshot(instance);
  assert.equal(report.streamDiscovery.groups[0].productHint, 'expansion_5000');
  assert.equal(report.streamDiscovery.membership, 'unverified');
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  instance.app.getStreamDiscoveryEvidence = () => { throw new Error('PRIVATE'); };
  assert.equal(createSupportSnapshot(instance).streamDiscovery.source, 'unavailable');
});

test('old runtime omissions remain explicit rather than inventing a version/platform', () => {
  const report = createSupportSnapshot({});
  assert.equal(report.appVersion, null);
  assert.equal(report.homeyVersion, null);
  assert.equal(report.platform, 'unknown');
  assert.equal(report.betaPairingEnabled, false);
});

test('topology report flags aggregate overlap anonymously and ignores optional physical monitor duplication', () => {
  const instance = homey();
  const bk = 'BK11SYNTHETIC0001';
  const es = 'ES22SYNTHETIC0001';
  const device = (source, addressSn, peers = []) => ({
    getData() { throw new Error('support must use cached evidence, not identity access'); },
    getTopologyEvidence: () => ({ source, addressSn, peers, lastPeerRecordAt: Date.now(),
      systemSocObserved: true, maxReportedRecordCount: 2, password: 'PRIVATEPASSWORD' }),
  });
  const linked = device('es22_peer_records', es, [{ sn: bk, seenAt: Date.now() }]);
  const devices = { stream: [device('bk_main_address', bk)], stream_5000_system: [linked], stream_5000_unit: [linked] };
  instance.drivers.getDriver = (id) => ({ getDevices: () => devices[id] || [] });
  const report = createSupportSnapshot(instance);
  assert.equal(report.installationTopology.aggregateCount, 2);
  assert.equal(report.installationTopology.potentialOverlapPairs.length, 1);
  assert.equal(report.drivers.find((item) => item.id === 'stream_5000_unit').topology[0].observedPeerCount, 1);
  assert.equal(report.installationTopology.autoGroupingEnabled, false);
  const output = JSON.stringify(report);
  assert.ok(!output.includes('SYNTHETIC'));
  assert.ok(!output.includes('PRIVATE'));
});

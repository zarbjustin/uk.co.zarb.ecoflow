'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');
const api = require('../.homeybuild/api');
const manifest = require('../.homeycompose/app.json');

test('passive timer research is not reflected into support reports or promoted to legacy remaining-time readings', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_5000_unit' ? [{
    getTimeObserverDiagnostics: () => ({ status: 'collecting', samples: [{ receivedAt: 100000,
      fields: [{ path: 'f33.10', value: 1234, serial: 'PRIVATE_TIMER' }] }] }),
    getRemainingTimeDiagnostics: () => ({ discharge_remaining: { reportedMinutes: 1234, source: 'PRIVATE_TIMER' } }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const unit = report.drivers.find(driver => driver.id === 'stream_5000_unit');
  assert.deepEqual(unit.remainingTime, []);
  assert.equal(unit.timeObserver, undefined);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_TIMER|f33\.10|1234/);
  assert.equal(Object.values(manifest.api).some(route => /time-observer|timer-research/.test(route.path)), false);
});

test('recent power and queue diagnostics use bounded fixed projections and isolate hostile getters', t => {
  const now = 100000; t.mock.method(Date, 'now', () => now);
  const instance = homey();
  const sample = { value: -450, receivedAt: now - 1000, appliedAt: now - 500, sn: 'PRIVATE' };
  const devices = [{ getPowerHistoryDiagnostics: () => ({ fields: { bmsBatteryW: Array(100).fill(sample),
    secret: [{ value: 'PRIVATE' }], gridPortW: [{ value: NaN, receivedAt: now, appliedAt: now }] } }),
  getTelemetryQueueDiagnostics: () => ({ running: true, pending: true, coalesced: 200, batches: 2,
    payload: 'PRIVATE', maxPendingBatches: 999 }),
  }, { getPowerHistoryDiagnostics() { throw new Error('PRIVATE'); },
    getTelemetryQueueDiagnostics: () => ({ get running() { throw new Error('PRIVATE'); } }) }];
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_unit' ? devices : [] });
  const report = createSupportSnapshot(instance);
  const unit = report.drivers.find(d => d.id === 'stream_unit');
  assert.equal(unit.recentPower[0].fields.bmsBatteryW.length, 16);
  assert.equal(unit.recentPower[0].fields.bmsBatteryW[0].queueDelaySec, 0.5);
  assert.equal(unit.recentPower[0].fields.gridPortW, undefined);
  assert.deepEqual(unit.recentPower[1].fields, {});
  assert.equal(unit.telemetryQueue[0].maxPendingBatches, 1);
  assert.equal(unit.telemetryQueue[0].coalesced, 200);
  assert.equal(unit.telemetryQueue[1].coalesced, 0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('optional history failure does not lose an otherwise valid peer identity comparison', () => {
  const now = Date.now(); const instance = homey(); const sn = 'BK31PRIVATE000001';
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_unit' ? [{
    getData: () => ({ sn }), getUnitCorrelationDiagnostics: () => ({ bmsBatteryW: { value: -450, ageSec: 0, stale: false } }),
    getPowerHistoryDiagnostics() { throw new Error('PRIVATE'); },
  }] : id === 'stream_5000_unit' ? [{ getTopologyEvidence: () => ({ source: 'es22_peer_records', addressSn: 'ES22PRIVATE000001',
    peers: [{ sn, seenAt: now, readings: { batteryPowerRawW: { value: 280, receivedAt: now } } }] }) }] : [] });
  const result = createSupportSnapshot(instance);
  assert.equal(result.peerCorrelation[0].peers[0].status, 'exact_identity_match');
  assert.equal(result.peerCorrelation[0].peers[0].comparisons.rawPowerVersusBms.magnitudeDifferenceW, -170);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('original live freshness and limit projection are fixed, anonymous and read-only', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_unit' ? [{
    getReadingDiagnostics: () => ({ stream_unit_power_grid: { ageSec: 0, receivedAgeSec: 0,
      stale: false, applicationStatus: 'applied', secret: 'PRIVATE' }, PRIVATE: {} }),
    getLimitDiagnostics: () => ({ feedGridModePowLimit: { value: 1200, ageSec: 0, stale: false,
      source: 'app_property', scopeVerified: true, controlEnabled: true, secret: 'PRIVATE' },
    sysGridInPwrLimit: { value: 7200, ageSec: 181, stale: false, source: 'PRIVATE' } }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const driver = report.drivers.find(d => d.id === 'stream_unit');
  assert.equal(driver.readingFreshness[0].readings.stream_unit_power_grid.applicationStatus, 'applied');
  const limits = driver.originalLimits[0].fields;
  assert.equal(limits.feedGridModePowLimit.value, 1200);
  assert.equal(limits.feedGridModePowLimit.controlEnabled, false);
  assert.equal(limits.feedGridModePowLimit.scopeVerified, false);
  assert.equal(limits.sysGridInPwrLimit.value, null);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('counter projection isolates nested getters and rejects unsupported stall claims', () => {
  const instance = homey();
  const bad = { get powerComparisonScope() { throw new Error('PRIVATE'); } };
  const input = { fields: {
    get accuChgEnergy() { throw new Error('PRIVATE'); },
    accuDsgEnergy: { status: 'invalid', ageSec: 1, unchangedSec: 900, possibleStall: true },
  } };
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream' ? [bad, input].map(data => ({
    getCounterContinuityDiagnostics: () => data,
  })) : [] });
  const report = createSupportSnapshot(instance);
  const counters = report.drivers.find(d => d.id === 'stream').counterContinuity;
  assert.equal(counters[0].fields.accuDsgEnergy.status, 'missing');
  assert.equal(counters[1].fields.accuChgEnergy.status, 'missing');
  assert.equal(counters[1].fields.accuDsgEnergy.possibleStall, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('support report anonymously correlates exact paired peers, with no migration or private getter leakage', () => {
  const now = Date.now(); const instance = homey();
  const sn = 'BK31PRIVATE000001';
  const devices = {
    stream_unit: [{ getData: () => ({ sn }),
      getUnitCorrelationDiagnostics: () => ({ gridPortW: { value: 421, ageSec: 0, stale: false, secret: 'PRIVATE' } }) }],
    stream_5000_unit: [{ getTopologyEvidence: () => ({ source: 'es22_peer_records', addressSn: 'ES22PRIVATE000001',
      peers: [{ sn, seenAt: now, readings: { batteryPowerRawW: { value: 419, receivedAt: now } } }] }) }],
    stream: [{ getCounterContinuityDiagnostics: () => ({ secret: 'PRIVATE', sourceMigrationAllowed: true,
      powerComparisonScope: 'PRIVATE', fields: { accuDsgEnergy: { status: 'PRIVATE', ageSec: 181,
        possibleStall: true, stallVerified: true, raw: 'PRIVATE' } } }) }],
  };
  instance.drivers.getDriver = id => ({ getDevices: () => devices[id] || [] });
  const report = createSupportSnapshot(instance);
  const match = report.peerCorrelation[0].peers[0];
  assert.deepEqual(match.pairedDevice, { driverId: 'stream_unit', deviceIndex: 0 });
  assert.equal(match.comparisons.rawPowerVersusPort.peerMinusUnit, -2);
  assert.equal(match.accountingUsed, false);
  const counters = report.drivers.find(d => d.id === 'stream').counterContinuity[0];
  assert.equal(counters.fields.accuDsgEnergy.possibleStall, false);
  assert.equal(counters.fields.accuDsgEnergy.stallVerified, false);
  assert.equal(counters.sourceMigrationAllowed, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('remaining-time diagnostics export only scoped source and application ages, never private payloads', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream' ? [{
    getRemainingTimeDiagnostics: () => ({
      discharge_remaining: { source: 'system_cms_mqtt', ageSec: 0, receivedAgeSec: 0,
        stale: false, applicationStatus: 'write_failed', value: 207, sn: 'PRIVATE', raw: 'PRIVATE' },
      charge_remaining: { source: 'PRIVATE', ageSec: -1, receivedAgeSec: NaN,
        stale: false, applicationStatus: 'PRIVATE' },
      secret: 'PRIVATE',
    }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const readings = report.drivers.find(d => d.id === 'stream').remainingTime[0].readings;
  assert.equal(readings.discharge_remaining.stale, true);
  assert.equal(readings.discharge_remaining.applicationStatus, 'write_failed');
  assert.equal(readings.charge_remaining.source, 'unobserved');
  assert.equal(readings.charge_remaining.ageSec, null);
  assert.equal(Object.keys(readings).length, 2);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('original BMS power and suppressed durations expose only finite anonymous scoped diagnostics', () => {
  const instance = homey();
  const device = {
    getReadingDiagnostics: () => ({ stream_unit_power_battery_flow: { ageSec: 1, stale: false, applicationStatus: 'applied' } }),
    getCapabilityValue: () => -404,
    getRemainingTimeDiagnostics: () => ({ charge_remaining: { source: 'unit_bms_mqtt', receivedAgeSec: 2,
      ageSec: null, stale: true, applicationStatus: 'unavailable', displayReason: 'inactive_direction',
      reportedMinutes: 5939, serial: 'PRIVATE', raw: 'PRIVATE' } }),
  };
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_unit' ? [device] : [] });
  let driver = createSupportSnapshot(instance).drivers.find(d => d.id === 'stream_unit');
  assert.equal(driver.originalUnitBattery[0].valueW, -404); assert.equal(driver.originalUnitBattery[0].energyContribution, false);
  assert.equal(driver.originalUnitBattery[0].measurementSide, 'dc_pack');
  assert.equal(driver.remainingTime[0].readings.charge_remaining.reportedMinutes, 5939);
  assert.equal(driver.remainingTime[0].readings.charge_remaining.displayReason, 'inactive_direction');
  assert.ok(!JSON.stringify(driver).includes('PRIVATE'));
  device.getCapabilityValue = () => Infinity;
  driver = createSupportSnapshot(instance).drivers.find(d => d.id === 'stream_unit');
  assert.equal(driver.originalUnitBattery[0].valueW, null); assert.equal(driver.originalUnitBattery[0].stale, true);
});

test('active meter source projection is private and rejects stale or malformed readings', () => {
  for (const ageSec of [0, 91, -1, null, NaN]) {
    const instance = homey();
    instance.drivers.getDriver = id => ({ getDevices: () => id === 'smartmeter' ? [{
      getMeterDiagnostics: () => ({ activeGrid: { source: 'linked_installation', value: -10, ageSec,
        stale: false, sn: 'PRIVATE', secret: 'PRIVATE' } }),
    }] : [] });
    const report = createSupportSnapshot(instance);
    const grid = report.smartMeters[0].evidence.activeGrid;
    assert.equal(grid.value, ageSec === 0 ? -10 : null);
    assert.equal(grid.stale, ageSec !== 0);
    assert.equal(grid.source, 'linked_installation');
    assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  }
});

test('counter support projection cannot promote native migration or malformed freshness', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'smartmeter' ? [{
    getMeterDiagnostics: () => ({ counterEvidence: { status: 'consistent', stale: false,
      lastRecordAgeSec: -1, migrationAllowed: true, unitsVerified: true, midnightBehaviourVerified: true,
      secret: 'PRIVATE' } }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const evidence = report.smartMeters[0].evidence.counterEvidence;
  assert.equal(evidence.stale, true);
  assert.equal(evidence.migrationAllowed, false);
  assert.equal(evidence.unitsVerified, false);
  assert.equal(evidence.midnightBehaviourVerified, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('original-meter support evidence retains signed values but never forwards private fields', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'smartmeter' ? [{
    getMeterDiagnostics: () => ({ samples: 2, directGridFresh: true, sn: 'PRIVATE',
      readings: { measure_power: { value: -100, ageSec: 1, stale: false, token: 'PRIVATE' }, PRIVATE: {} },
      counterCandidates: { todayActive: { value: 500, ageSec: 2, stale: false }, PRIVATE: {} },
      nativeCounterMigrationEnabled: true }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const evidence = report.smartMeters[0].evidence;
  assert.equal(evidence.readings.measure_power.value, -100);
  assert.equal(evidence.counterCandidates.todayActive.value, 500);
  assert.equal(evidence.nativeCounterMigrationEnabled, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('BK PV freshness support fields are fixed-list and never forward identities or power', () => {
  const instance = homey();
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream_unit' ? [{
    getReadingDiagnostics: () => ({ stream_unit_pv3_voltage: { ageSec: 3, stale: false, sn: 'PRIVATE' },
      stream_unit_pv4_current: { ageSec: 2000, stale: true }, PRIVATE: { ageSec: 0 },
      measure_power: { ageSec: 0, stale: false } }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const readings = report.drivers.find(d => d.id === 'stream_unit').readingFreshness[0].readings;
  assert.deepEqual(readings, { stream_unit_pv3_voltage: { ageSec: 3, stale: false },
    stream_unit_pv4_current: { ageSec: 2000, stale: true } });
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('cached SOC after restart is not a fresh receipt or proof of a current installation reporter', () => {
  const instance = homey();
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream' ? [{
    getCapabilityValue: (key) => key === 'measure_battery' ? 86 : null,
    getReportingDiagnostics: () => ({ readAddressMatchesSavedMain: true, observations: {} }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const entry = report.drivers.find(d => d.id === 'stream').reporting[0];
  assert.equal(entry.currentReadings.measure_battery, 86);
  assert.deepEqual(entry.observations, {});
  assert.equal(entry.currentInstallationReporterVerified, false);
});

test('support projection preserves cached versus observed SOC disagreement without promoting either', () => {
  const instance = homey();
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream' ? [{
    getData() { throw new Error('PRIVATE'); },
    getCapabilityValue: (key) => key === 'measure_battery' ? 0 : null,
    getReportingDiagnostics: () => ({ readAddressMatchesSavedMain: false,
      observations: { measure_battery: { value: 10, receivedAt: Date.now() - 1000, source: 'mqtt' } } }),
  }] : [] });
  const entry = createSupportSnapshot(instance).drivers.find(d => d.id === 'stream').reporting[0];
  assert.equal(entry.currentReadings.measure_battery, 0);
  assert.equal(entry.observations.measure_battery.value, 10);
  assert.equal(entry.readAddressMatchesSavedMain, false);
  assert.equal(entry.currentInstallationReporterVerified, false);
});

test('reporting projection distinguishes reported zero, missing values and signed flow without identity reads', () => {
  const instance = homey();
  const now = Date.now();
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream' ? [{
    getData() { throw new Error('PRIVATE'); },
    getCapabilityValue: (key) => ({ measure_battery: 0, measure_power: -315, 'measure_power.pv': NaN })[key],
    getReportingDiagnostics: () => ({ readAddressMatchesSavedMain: true, sn: 'PRIVATE', observations: {
      measure_battery: { value: 0, receivedAt: now - 2000, source: 'mqtt', token: 'PRIVATE' },
      measure_power: { value: -315, receivedAt: now - 1000, source: 'rest' },
      'measure_power.pv': { value: 12, receivedAt: now + 60000, source: 'mqtt' },
      'PRIVATE': { value: 0, receivedAt: now, source: 'mqtt' },
    } }),
  }] : [] });
  const report = createSupportSnapshot(instance);
  const entry = report.drivers.find(d => d.id === 'stream').reporting[0];
  assert.equal(entry.currentReadings.measure_battery, 0);
  assert.equal(entry.currentReadings.measure_power, -315);
  assert.equal(entry.currentReadings['measure_power.pv'], null);
  assert.equal(entry.currentReadings['measure_power.grid'], null);
  assert.equal(entry.observations.measure_battery.value, 0);
  assert.equal(entry.observations.measure_battery.source, 'mqtt');
  assert.ok(entry.observations.measure_battery.ageSec >= 2);
  assert.equal(entry.observations['measure_power.pv'], undefined);
  assert.equal(entry.readAddressMatchesSavedMain, true);
  assert.equal(entry.currentInstallationReporterVerified, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('reporting failures stay anonymous and absent receipt evidence stays unknown', () => {
  const instance = homey();
  instance.drivers.getDriver = () => ({ getDevices: () => [{
    getCapabilityValue() { throw new Error('PRIVATE'); },
    getReportingDiagnostics: () => ({ observations: { get measure_battery() { throw new Error('PRIVATE'); } } }),
  }] });
  const report = createSupportSnapshot(instance);
  const entry = report.drivers[0].reporting[0];
  assert.equal(entry.readAddressMatchesSavedMain, null);
  assert.deepEqual(entry.observations, {});
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('control diagnostics project only safe reasons, actions and counts', () => {
  const instance = homey();
  instance.drivers.getDriver = () => ({ getDevices: () => [{
    getReportingDiagnostics: () => ({ lastControlFailure: {
      reason: 'preflight_rejected', requestedAction: 'mode', attempted: 0, accepted: 0, verified: 0,
      raw: 'PRIVATE',
    } }),
  }, {
    getReportingDiagnostics: () => ({ lastControlFailure: {
      reason: 'PRIVATE', requestedAction: 'PRIVATE', attempted: 'PRIVATE', accepted: -1, verified: Infinity,
    } }),
  }] });
  const report = createSupportSnapshot(instance);
  assert.deepEqual(report.drivers[0].reporting[0].lastControlFailure, {
    reason: 'preflight_rejected', requestedAction: 'mode', attempted: 0, accepted: 0, verified: 0,
  });
  assert.deepEqual(report.drivers[0].reporting[1].lastControlFailure, {
    reason: 'unknown', requestedAction: 'unknown', attempted: null, accepted: null, verified: null,
  });
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('per-reading freshness projection excludes identities and catches nested getter failures', () => {
  const instance = homey();
  let malicious = false;
  instance.drivers.getDriver = (id) => ({ getDevices: () => id === 'stream_5000_unit' ? [{
    getReadingDiagnostics: () => malicious ? { get measure_power() { throw new Error('PRIVATE'); } }
      : { measure_power: { ageSec: 12, stale: false, sn: 'PRIVATE' }, 'PRIVATE': { ageSec: 2 } },
  }] : [] });
  const report = createSupportSnapshot(instance);
  assert.deepEqual(report.drivers.find(d => d.id === 'stream_5000_unit').readingFreshness[0].readings,
    { measure_power: { ageSec: 12, receivedAgeSec: null, stale: false, applicationStatus: 'unknown' } });
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  malicious = true;
  assert.ok(!JSON.stringify(createSupportSnapshot(instance)).includes('PRIVATE'));
});

function homey() {
  return {
    version: '13.5.0', platform: 'local',
    manifest: { version: '1.10.17', drivers: [{ id: 'stream_5000_system' }, { id: 'stream_5000_unit' }] },
    settings: { get: (key) => {
      assert.equal(key, 'stream5000AggregatePairingEnabled', 'report must not read credentials or retired settings');
      return true;
    } },
    drivers: { getDriver: () => { throw new Error('private serial ES22PRIVATE000001'); } },
  };
}

test('failed application projection separates receipt from applied freshness with fixed vocabulary', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_5000_unit' ? [{
    getReadingDiagnostics: () => ({
      'measure_power.load': { ageSec: 10, receivedAgeSec: 0, stale: false, applicationStatus: 'write_failed', error: 'PRIVATE' },
      measure_temperature: { ageSec: null, receivedAgeSec: -1, stale: false, applicationStatus: 'PRIVATE' },
    }),
  }] : [] });
  const readings = createSupportSnapshot(instance).drivers.find(driver => driver.id === 'stream_5000_unit').readingFreshness[0].readings;
  assert.deepEqual(readings['measure_power.load'], { ageSec: 10, receivedAgeSec: 0, stale: true, applicationStatus: 'write_failed' });
  assert.equal(readings.measure_temperature.stale, true);
  assert.equal(readings.measure_temperature.applicationStatus, 'unknown');
  assert.equal(readings.measure_temperature.receivedAgeSec, null);
  assert.ok(!JSON.stringify(readings).includes('PRIVATE'));
});

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
  assert.equal(snapshot.betaPairingEnabled, false);
  assert.deepEqual(snapshot.stream5000Pairing, { unitMonitoringRequiresOptIn: false, aggregateEnergyOptInEnabled: true });
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
  assert.equal(report.schemaVersion, 19);
});

test('self observations and linked-power explanation are re-projected without private fields or authority', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_5000_unit' ? [{
    getOwnUnitDiagnostics: () => ({ fields: { batteryPowerRawW: { value: 2260, ageSec: 1, stale: false, sn: 'PRIVATE' } },
      accountingUsed: true, rawBatteryPowerSignAndScaleVerified: true }),
    getPhysicalPowerDiagnostics: () => ({ status: 'linked_power_unverified', secret: 'PRIVATE', energyContribution: true }),
  }] : [] });
  const driver = createSupportSnapshot(instance).drivers.find(d => d.id === 'stream_5000_unit');
  assert.equal(driver.ownUnit[0].fields.batteryPowerRawW.value, 2260);
  assert.equal(driver.ownUnit[0].accountingUsed, false);
  assert.equal(driver.ownUnit[0].rawBatteryPowerSignAndScaleVerified, false);
  assert.equal(driver.physicalPower[0].status, 'linked_power_unverified');
  assert.equal(driver.physicalPower[0].energyContribution, false);
  assert.ok(!JSON.stringify(driver).includes('PRIVATE'));
});

test('last standby report is bounded, anonymous and cannot claim live readings or Energy use', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_5000_unit' ? [
    { getBatteryReadingStatusDiagnostics: () => ({ status: 'last_reported_standby', lastStandbyAgeSec: 420.4,
      live: true, energyUsed: true, value: 1234567, sn: 'PRIVATE' }) },
    { getBatteryReadingStatusDiagnostics: () => ({ status: 'last_reported_standby', lastStandbyAgeSec: Infinity }) },
    { getBatteryReadingStatusDiagnostics: () => ({ status: 'last_reported_standby', lastStandbyAgeSec: 1201 }) },
    { getBatteryReadingStatusDiagnostics: () => ({ status: 'PRIVATE', lastStandbyAgeSec: 1 }) },
    { getBatteryReadingStatusDiagnostics: () => ({ get status() { throw new Error('PRIVATE'); } }) },
  ] : [] });
  const entries = createSupportSnapshot(instance).drivers.find(d => d.id === 'stream_5000_unit').batteryReadingStatus;
  assert.deepEqual(entries[0], { deviceIndex: 0, status: 'last_reported_standby', live: false,
    energyUsed: false, lastStandbyAgeSec: 420 });
  assert.deepEqual(entries.slice(1).map(e => e.status), ['expired', 'expired', 'waiting', 'waiting']);
  assert.equal(entries.every(e => e.energyUsed === false), true);
  assert.doesNotMatch(JSON.stringify(entries), /PRIVATE|1234567/);
});

test('physical reading availability is a fixed privacy projection, never scope or Energy authority', () => {
  const instance = homey();
  instance.drivers.getDriver = id => ({ getDevices: () => id === 'stream_5000_unit' ? [
    { getPhysicalPowerDiagnostics: () => ({ status: 'unit_reading_available', physicalScopeVerified: true,
      energyContribution: true, linkedSystemPowerCopiedToUnit: true, secret: 'PRIVATE' }) },
    { getPhysicalPowerDiagnostics: () => ({ status: 'PRIVATE' }) },
    { getPhysicalPowerDiagnostics: () => { throw new Error('PRIVATE'); } },
  ] : [] });
  const driver = createSupportSnapshot(instance).drivers.find(d => d.id === 'stream_5000_unit');
  assert.equal(driver.physicalPower[0].status, 'unit_reading_available');
  assert.equal(driver.physicalPower[1].status, 'waiting_for_unit_evidence');
  assert.equal(driver.physicalPower[2].status, 'waiting_for_unit_evidence');
  driver.physicalPower.forEach(entry => {
    assert.equal(entry.physicalScopeVerified, false);
    assert.equal(entry.energyContribution, false);
    assert.equal(entry.linkedSystemPowerCopiedToUnit, false);
  });
  assert.doesNotMatch(JSON.stringify(driver), /PRIVATE/);
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

test('official system SOC provenance is bounded, excludes private identifiers and never claims a hardware timestamp', () => {
  const h = homey();
  h.drivers.getDriver = id => ({ getDevices: () => id === 'stream_5000_system' ? [{
    getOfficialSocDiagnostics: () => ({ source: 'developer_api', basis: 'cloud_latest_report',
      hardwareReportedAt: null, receiptAgeSec: 2, requestDurationMs: 60, stale: false,
      serial: 'PRIVATE_SOC', accessKey: 'PRIVATE_SOC', rawQuota: 'PRIVATE_SOC' }),
  }, { getOfficialSocDiagnostics() { throw new Error('PRIVATE_SOC'); } }] : [] });
  const report = createSupportSnapshot(h); const system = report.drivers.find(d => d.id === 'stream_5000_system');
  assert.deepEqual(system.officialSoc, [{ deviceIndex: 0, source: 'developer_api', basis: 'cloud_latest_report',
    hardwareReportedAt: null, receiptAgeSec: 2, requestDurationMs: 60, stale: false }]);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_SOC'));
});

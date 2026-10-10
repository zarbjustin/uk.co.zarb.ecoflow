'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { reporterShadowSnapshot } = require('../.homeybuild/lib/streamReporterShadow');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');

const now = 1000000;
function fixture() {
  const aggregate = {
    driverId: 'stream', deviceIndex: 0, addressSn: 'BK11SYNTHETIC',
    resolution: { sn: 'ES22SYNTHETIC', readSn: 'BK11SYNTHETIC', currentReadSn: 'BK11SYNTHETIC', receivedAt: now - 4000 },
    reporting: { observations: {
      measure_battery: { value: 0, ageSec: 2, source: 'mqtt' },
      measure_power: { value: 0, ageSec: 2, source: 'mqtt' },
    }, currentReadings: { measure_battery: 99, measure_power: 123 } },
  };
  const reporter = {
    driverId: 'stream_5000_unit', deviceIndex: 0,
    evidence: { addressSn: 'ES22SYNTHETIC', peers: [{ sn: aggregate.addressSn, seenAt: now - 1000 }] },
    system: { socPct: { value: 80, ageSec: 1, stale: false }, batteryW: { value: -600, ageSec: 1, stale: false } },
  };
  return { aggregate, reporter };
}

test('shadow compares exact resolved reporter and fresh legacy receipts, without mutation or identity leakage', () => {
  const { aggregate, reporter } = fixture();
  const before = JSON.stringify({ aggregate, reporter });
  const [result] = reporterShadowSnapshot([aggregate], [reporter], now);
  assert.equal(result.status, 'comparison_ready');
  assert.equal(result.comparisons.socPct.candidateMinusLegacy, 80);
  assert.equal(result.comparisons.batteryW.candidateMinusLegacy, -600);
  assert.equal(result.comparisons.socPct.legacy.value, 0); // Not the cached capability's 99.
  assert.equal(result.comparisons.batteryW.candidateSource, 'derived_app_protocol_flow_matrix');
  assert.equal(result.energyAccountingUnchanged, true);
  assert.equal(result.repairAllowed, false);
  assert.equal(result.controlMigrationAllowed, false);
  assert.equal(result.installationScopeVerified, false);
  assert.equal(result.deviceTimestampsVerified, false);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC'));
  assert.equal(JSON.stringify({ aggregate, reporter }), before);
});

test('equal model family and peer membership alone cannot select a reporter', () => {
  const { aggregate, reporter } = fixture();
  reporter.evidence.addressSn = 'ES22OTHER';
  assert.equal(reporterShadowSnapshot([aggregate], [reporter], now)[0].status, 'resolved_reporter_not_paired');
});

test('resolution must be fresh, exact, changed and consistent with the current legacy read address', () => {
  for (const [patch, expected] of [
    [null, 'resolution_unavailable'],
    [{ receivedAt: now + 1 }, 'resolution_stale'],
    [{ receivedAt: now - 300001 }, 'resolution_stale'],
    [{ receivedAt: NaN }, 'resolution_stale'],
    [{ currentReadSn: 'BK31OTHER' }, 'legacy_address_mismatch'],
    [{ readSn: 'BK31OTHER' }, 'legacy_address_mismatch'],
    [{ sn: 'BK11SYNTHETIC' }, 'reporter_unchanged'],
    [{ sn: 'PRIVATE?INVALID' }, 'resolution_unavailable'],
  ]) {
    const { aggregate, reporter } = fixture();
    aggregate.resolution = patch === null ? null : { ...aggregate.resolution, ...patch };
    const [result] = reporterShadowSnapshot([aggregate], [reporter], now);
    assert.equal(result.status, expected);
    assert.equal(result.comparisons.socPct.candidate.value, null);
    assert.equal(result.repairAllowed, false);
  }
});

test('duplicate physical/system representations or duplicate legacy aggregates are ambiguous', () => {
  const { aggregate, reporter } = fixture();
  const secondReporter = { ...reporter, driverId: 'stream_5000_system' };
  assert.equal(reporterShadowSnapshot([aggregate], [reporter, secondReporter], now)[0].status, 'ambiguous_representations');
  const results = reporterShadowSnapshot([aggregate, { ...aggregate, deviceIndex: 1 }], [reporter], now);
  assert.ok(results.every(result => result.status === 'ambiguous_representations'));
});

test('missing, stale, invalid, future or unrelated peer receipts block the comparison', () => {
  for (const peers of [[], [{ sn: 'BK31OTHER', seenAt: now }],
    [{ sn: 'BK11SYNTHETIC', seenAt: now + 1 }], [{ sn: 'BK11SYNTHETIC', seenAt: now - 180001 }],
    [{ sn: 'BK11SYNTHETIC', seenAt: NaN }]]) {
    const { aggregate, reporter } = fixture();
    reporter.evidence.peers = peers;
    assert.equal(reporterShadowSnapshot([aggregate], [reporter], now)[0].status, 'fresh_peer_correlation_missing');
  }
});

test('SOC and battery power age independently; stale values do not fall back to capabilities', () => {
  const { aggregate, reporter } = fixture();
  aggregate.reporting.observations.measure_power.ageSec = 181;
  reporter.system.socPct.ageSec = 181;
  const { comparisons } = reporterShadowSnapshot([aggregate], [reporter], now)[0];
  assert.equal(comparisons.socPct.candidate.value, null);
  assert.equal(comparisons.batteryW.legacy.value, null);
  assert.equal(comparisons.socPct.candidateMinusLegacy, null);
  assert.equal(comparisons.batteryW.candidateMinusLegacy, null);
});

test('missing, invalid and explicit stale fields cannot manufacture deltas', () => {
  for (const field of [undefined, { value: 101, ageSec: 0 }, { value: Infinity, ageSec: 0 },
    { value: 80, ageSec: -1 }, { value: 80, ageSec: NaN }, { value: 80, ageSec: 0, stale: true }]) {
    const { aggregate, reporter } = fixture();
    reporter.system.socPct = field;
    const comparison = reporterShadowSnapshot([aggregate], [reporter], now)[0].comparisons.socPct;
    assert.equal(comparison.candidate.value, null);
    assert.equal(comparison.candidateMinusLegacy, null);
  }
});

test('receipt skew is explicit and genuine zero remains comparable at the boundary', () => {
  const { aggregate, reporter } = fixture();
  reporter.system.batteryW.value = 0;
  reporter.system.batteryW.ageSec = 32;
  let comparison = reporterShadowSnapshot([aggregate], [reporter], now)[0].comparisons.batteryW;
  assert.equal(comparison.candidateMinusLegacy, 0);
  reporter.system.batteryW.ageSec = 33;
  comparison = reporterShadowSnapshot([aggregate], [reporter], now)[0].comparisons.batteryW;
  assert.equal(comparison.status, 'receipt_skew_exceeded');
  assert.equal(comparison.candidateMinusLegacy, null);
});

test('identity normalization allows casing differences without exposing serials', () => {
  const { aggregate, reporter } = fixture();
  aggregate.resolution.sn = aggregate.resolution.sn.toLowerCase();
  reporter.evidence.peers[0].sn = reporter.evidence.peers[0].sn.toLowerCase();
  assert.equal(reporterShadowSnapshot([aggregate], [reporter], now)[0].status, 'comparison_ready');
});

test('ES21 exact reporter correlation uses the same evidence gates, without AC 5000-only selection', () => {
  const { aggregate, reporter } = fixture();
  aggregate.resolution.sn = 'ES21SYNTHETIC';
  reporter.evidence.addressSn = 'ES21SYNTHETIC';
  const [result] = reporterShadowSnapshot([aggregate], [reporter], now);
  assert.equal(result.status, 'comparison_ready');
  assert.equal(result.installationScopeVerified, false);
});

test('support report uses a fixed projection and UTC capture time; no writes or network calls', (t) => {
  t.mock.method(Date, 'now', () => now);
  const { aggregate, reporter } = fixture();
  const legacy = {
    getTopologyEvidence: () => ({ source: 'bk_main_address', addressSn: aggregate.addressSn, peers: [] }),
    getResolvedReporterEvidence: () => ({ ...aggregate.resolution, password: 'DO_NOT_EXPORT' }),
    getReportingDiagnostics: () => ({ observations: {
      measure_battery: { value: 0, receivedAt: now - 2000, source: 'mqtt' },
      measure_power: { value: 0, receivedAt: now - 2000, source: 'mqtt' },
    } }),
    setCapabilityValue: () => { throw new Error('unexpected write'); },
    refreshReporterDiagnostics: () => { throw new Error('unexpected API call'); },
  };
  const monitor = {
    getTopologyEvidence: () => ({ ...reporter.evidence, source: 'es22_peer_records', maxReportedRecordCount: 2 }),
    getSystemReporterDiagnostics: () => reporter.system,
  };
  const homey = { drivers: { getDriver: id => ({ getDevices: () => id === 'stream' ? [legacy] : id === 'stream_5000_unit' ? [monitor] : [] }) } };
  const report = createSupportSnapshot(homey);
  assert.equal(report.schemaVersion, 8);
  assert.equal(report.capturedAt, new Date(now).toISOString());
  assert.equal(report.reporterShadow[0].status, 'comparison_ready');
  assert.equal(report.reporterShadow[0].comparisons.socPct.candidate.value, 80);
  assert.ok(!JSON.stringify(report).includes('DO_NOT_EXPORT'));
  assert.ok(!JSON.stringify(report).includes('SYNTHETIC'));
  legacy.getResolvedReporterEvidence = () => { throw new Error('DO_NOT_EXPORT'); };
  assert.equal(createSupportSnapshot(homey).reporterShadow[0].status, 'resolution_unavailable');
});

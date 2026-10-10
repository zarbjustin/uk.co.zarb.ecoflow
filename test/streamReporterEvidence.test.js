'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamReporterObservations, mainResolutionSnapshot, systemReporterSnapshot, reporterRepairPreview } = require('../.homeybuild/lib/streamReporterEvidence');
const { mapStreamQuota } = require('../.homeybuild/lib/streamMapping');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');

test('system-only receipts preserve genuine zero, reject unit fallback and age fields independently', (t) => {
  t.mock.method(Date, 'now', () => 1000000);
  const tracker = new StreamReporterObservations();
  tracker.observe({ socPct: 0, battW: 0 }, 'ES22SYNTHETIC', 990000);
  tracker.observe({ socPct: 80 }, 'ES22SYNTHETIC', 980000); // Older receipt cannot replace newer zero.
  tracker.observe({ socPrecisePct: 10, battW: 500, sourceSn: 'ES22OTHER' }, 'ES22SYNTHETIC', 999000);
  tracker.observe({ socPct: 10, battW: Infinity }, 'ES22SYNTHETIC', 1000001);
  assert.equal(tracker.snapshot(1000000).socPct.value, 0);
  assert.equal(tracker.snapshot(1000000).batteryW.value, 0);
  assert.equal(tracker.snapshot(1000000).socPct.source, 'app_protocol_system_soc');
  assert.equal(tracker.snapshot(1000000).batteryW.source, 'derived_app_protocol_flow_matrix');
  tracker.observe({ socPct: 10 }, 'ES22SYNTHETIC', 1000000);
  const aged = tracker.snapshot(1185000);
  assert.equal(aged.socPct.stale, true);
  assert.equal(aged.batteryW.stale, true);
  assert.deepEqual(new StreamReporterObservations().snapshot(1000000), {});
});

test('fixed projection drops private fields and malformed values; API match is not scope proof', () => {
  const system = systemReporterSnapshot({ socPct: { value: 10, ageSec: 1, stale: false, sn: 'PRIVATE' },
    batteryW: { value: NaN, ageSec: 1 }, PRIVATE: { value: 123 } });
  assert.deepEqual(Object.keys(system), ['socPct']);
  assert.ok(!JSON.stringify(system).includes('PRIVATE'));
  assert.equal(mainResolutionSnapshot({ status: 'matched', receivedAt: 99000, family: 'original_stream', sn: 'PRIVATE' }, 100000).installationScopeVerified, false);
  assert.equal(mainResolutionSnapshot({ status: 'changed', receivedAt: 101000 }, 100000).status, 'not_checked');
  assert.equal(mainResolutionSnapshot({ status: 'changed', receivedAt: 1 }, 1000000).stale, true);
});

test('mixed-generation transition correlates addresses privately but never enables repair or averages SOC', (t) => {
  t.mock.method(Date, 'now', () => 1000000);
  const old = 'BK11SYNTHETIC';
  const aggregate = { getTopologyEvidence: () => ({ source: 'bk_main_address', addressSn: old, peers: [],
    maxReportedRecordCount: 0, lastPeerRecordAt: null, systemSocObserved: false, truncated: false }),
    getCapabilityValue: key => mapStreamQuota({ cmsBattSoc: 0, powGetBpCms: 0 })[key],
    getReportingDiagnostics: () => ({ observations: { measure_battery: { value: 0, receivedAt: 990000, source: 'rest' } } }) };
  const monitor = { getTopologyEvidence: () => ({ source: 'es22_peer_records', addressSn: 'ES22SYNTHETIC',
    peers: [{ sn: old, seenAt: 999000 }, { sn: 'BK31SYNTHETIC', seenAt: 999000 }],
    maxReportedRecordCount: 3, lastPeerRecordAt: 999000, systemSocObserved: true, truncated: false }),
    getSystemReporterDiagnostics: () => ({ socPct: { value: 10, ageSec: 5, stale: false }, batteryW: { value: -315, ageSec: 1, stale: false } }) };
  const homey = { drivers: { getDriver: id => ({ getDevices: () => id === 'stream' ? [aggregate] : id === 'stream_5000_unit' ? [monitor] : [] }) } };
  const report = createSupportSnapshot(homey);
  const candidate = report.reporterRepair[0];
  assert.equal(candidate.status, 'candidate_requires_validation');
  assert.equal(candidate.freshSystemSoc, true);
  assert.equal(candidate.repairAllowed, false);
  assert.deepEqual(candidate.correlatedAggregates, [{ driverId: 'stream', deviceIndex: 0 }]);
  assert.equal(report.drivers[0].reporting[0].currentReadings.measure_battery, 0);
  assert.ok(!JSON.stringify(report).includes('SYNTHETIC'));
  monitor.getTopologyEvidence = () => ({ source: 'es22_peer_records', addressSn: 'ES22SYNTHETIC', peers: [{ sn: old, seenAt: 1 }], maxReportedRecordCount: 3, lastPeerRecordAt: 1, systemSocObserved: true, truncated: false });
  assert.equal(createSupportSnapshot(homey).reporterRepair[0].matchedAggregateCount, 0);
});

test('repair preview remains blocked for fresh, empty, missing or stale system evidence', () => {
  for (const fields of [{}, { socPct: { value: 0, stale: false } }, { socPct: { value: 10, stale: true } }]) {
    const preview = reporterRepairPreview(fields, 1);
    assert.equal(preview.repairAllowed, false);
    assert.equal(preview.controlMigrationAllowed, false);
    assert.ok(preview.blockers.includes('counter_source_transition_unverified'));
  }
});

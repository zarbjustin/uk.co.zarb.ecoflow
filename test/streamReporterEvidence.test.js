'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamReporterObservations, mainResolutionSnapshot, systemReporterSnapshot, reporterRepairPreview, reporterFlowSnapshot } = require('../.homeybuild/lib/streamReporterEvidence');
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

test('wall-clock rollback clears future system/flow receipts and accepts fresh partial observations', (t) => {
  let clock = 5000; t.mock.method(Date, 'now', () => clock);
  const tracker = new StreamReporterObservations();
  tracker.observe({ socPct: 60, battW: -123, gridW: -5 }, 'ES22SYNTHETIC', clock);
  clock = 2000;
  tracker.observe({ socPct: 61 }, 'ES22SYNTHETIC', clock);
  assert.equal(tracker.snapshot(clock).socPct.value, 61);
  assert.equal(tracker.snapshot(clock).batteryW, undefined);
  assert.deepEqual(tracker.flowSnapshot(clock).fields, {});
  tracker.observe({ battW: 0, gridW: 0 }, 'ES22SYNTHETIC', clock);
  assert.equal(tracker.snapshot(clock).batteryW.value, 0);
  assert.equal(tracker.flowSnapshot(clock).fields.gridMeterW.value, 0);
  tracker.observe({ socPct: 10 }, 'ES22SYNTHETIC', 1000);
  assert.equal(tracker.snapshot(clock).socPct.value, 61);
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

test('flow diagnostics retain independent receipts, omit private/invalid data and never become accounting', (t) => {
  t.mock.method(Date, 'now', () => 1000000);
  const tracker = new StreamReporterObservations();
  tracker.observe({ batteryFlowEdges: { batteryToHomeW: 300, batteryToGridW: 0, PRIVATE: 123 },
    battW: -300, gridImportPowerW: 0, gridExportPowerW: 5 }, 'ES22SYNTHETIC', 990000);
  tracker.observe({ gridW: -10, homeW: 300 }, 'ES22SYNTHETIC', 995000);
  tracker.observe({ gridW: 99, sourceSn: 'ES22OTHER' }, 'ES22SYNTHETIC', 999000);
  tracker.observe({ gridW: 999 }, 'ES22SYNTHETIC', 980000);
  tracker.observe({ gridW: 999 }, 'ES22SYNTHETIC', 1000001);
  const report = tracker.flowSnapshot(1000000);
  assert.equal(report.fields.gridMeterW.value, -10);
  assert.equal(report.fields.gridFlowNetW.value, -5);
  assert.equal(report.gridReceiptSkewSec, 5);
  assert.equal(report.meterMinusFlowW, -5);
  assert.equal(report.fields.batteryDerivedW.value, -300);
  assert.equal(report.fields.batteryToHomeW.ageSec, 10);
  assert.equal(report.accountingUsed, false);
  assert.equal(report.deviceTimestampsVerified, false);
  assert.equal(report.sourceContract.gridMeterW, 'reported_grid_meter');
  assert.equal(report.sourceContract.gridFlowNetW, 'derived_app_protocol_flow_matrix');
  assert.equal(report.sourceContract.differenceIsVerifiedLoss, false);
  assert.ok(!JSON.stringify(report).match(/PRIVATE|SYNTHETIC/));
  assert.equal(tracker.flowSnapshot(1180001).meterMinusFlowW, null);
  assert.deepEqual(tracker.flowSnapshot(900000).fields, {});
  tracker.observe({ gridW: 0 }, 'ES22SYNTHETIC', 1000000);
  assert.equal(tracker.flowSnapshot(1040000).fields.gridFlowNetW.ageSec, 50, 'partial meter update must not refresh flow edges');
});

test('flow comparisons fail closed for absent, stale, skewed and malformed fields', () => {
  const field = (value, ageSec = 0) => ({ value, ageSec, stale: false, secret: 'PRIVATE' });
  for (const input of [ {}, { fields: { gridMeterW: field(0) } },
    { fields: { gridMeterW: field(0, 31), gridFlowNetW: field(0) } },
    { fields: { gridMeterW: field(0, 181), gridFlowNetW: field(0, 181) } } ]) {
    assert.equal(reporterFlowSnapshot(input).meterMinusFlowW, null);
  }
  const projection = reporterFlowSnapshot({ fields: { gridMeterW: field(0), gridFlowNetW: field(0),
    batteryToHomeW: field(-1), homeW: field(Infinity), solarToGridW: field(1, -1),
    PRIVATE: field(123), batteryDerivedW: field(-100001) }, password: 'PRIVATE' });
  assert.equal(projection.meterMinusFlowW, 0);
  assert.deepEqual(Object.keys(projection.fields), ['gridMeterW', 'gridFlowNetW']);
  assert.ok(!JSON.stringify(projection).includes('PRIVATE'));
});

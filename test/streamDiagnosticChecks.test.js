'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamCounterContinuity, StreamUnitComparison, correlateStreamPeers, streamReadingExplanations } = require('../.homeybuild/lib/streamDiagnosticChecks');
const { Es22TopologyTracker } = require('../.homeybuild/lib/streamTopology');
const { StreamOwnUnitObservations, systemReporterSnapshot } = require('../.homeybuild/lib/streamReporterEvidence');

test('mixed discharge replay separates idle self/Ultra, active AC Pro and combined system', () => {
  const sn = 'ES22SYNTHETIC0001'; const ultra = 'BK11SYNTHETIC0002'; const pro = 'BK31SYNTHETIC0003';
  const input = { sourceSn: sn, socPct: 80, batteryW: -420,
    unitsBySn: { [sn]: { socPct: 82, batteryPowerRawW: 0 },
      [ultra]: { socPct: 81, batteryPowerRawW: 0 }, [pro]: { socPct: 79, batteryPowerRawW: 419 } } };
  const own = new StreamOwnUnitObservations(); own.observe(input, sn, 1000, 1000);
  const peers = new Es22TopologyTracker(sn); peers.observe(input, 1000, 1000);
  assert.equal(own.snapshot(1001).fields.batteryPowerRawW.value, 0);
  assert.equal(peers.evidence().peers.find(p => p.sn === pro).readings.batteryPowerRawW.value, 419);
  assert.equal(systemReporterSnapshot({ batteryW: { value: -420, ageSec: 0, stale: false } }).batteryW.value, -420);
  assert.equal(own.snapshot(1001).accountingUsed, false);
  const result = correlateStreamPeers(peers.evidence(), [
    { sn: ultra, driverId: 'stream_unit', deviceIndex: 0, readings: { socPct: { value: 81, ageSec: 0, stale: false } } },
    { sn: pro, driverId: 'stream_unit', deviceIndex: 1,
      readings: { gridPortW: { value: 421, ageSec: 0, stale: false } } },
  ], 1001);
  assert.equal(result[1].status, 'exact_identity_match');
  assert.equal(result[1].comparisons.rawPowerVersusPort.peerMinusUnit, -2);
  assert.equal(result[1].comparisons.rawPowerVersusPort.sameMeasurementVerified, false);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC'));
});

test('peer matching rejects prefix similarity, duplicates, stale/future receipts and skew', () => {
  const peer = { sn: 'BK31SYNTHETIC0001', seenAt: 1000, readings: { batteryPowerRawW: { value: 500, receivedAt: 1000 } } };
  const evidence = { peers: [peer] };
  const unit = { driverId: 'stream_unit', deviceIndex: 0, sn: peer.sn,
    readings: { gridPortW: { value: 500, ageSec: 31, stale: false } } };
  assert.equal(correlateStreamPeers(evidence, [{ ...unit, sn: 'BK31SYNTHETIC0002' }], 1000)[0].status, 'not_paired');
  assert.equal(correlateStreamPeers(evidence, [unit, unit], 1000)[0].status, 'ambiguous');
  assert.equal(correlateStreamPeers(evidence, [unit], 181001)[0].status, 'stale_peer');
  assert.equal(correlateStreamPeers(evidence, [unit], 999)[0].status, 'stale_peer');
  assert.equal(correlateStreamPeers(evidence, [unit], 1000)[0].comparisons.rawPowerVersusPort.peerMinusUnit, null);
});

test('unit comparison requires applied receipts and expires independently of other fields', () => {
  const c = new StreamUnitComparison(); c.observe('measure_battery', 81, 1000, 1000);
  c.observe('stream_unit_power_grid', 0, 1000, 1000);
  c.observe('temperature', 20, 10000, 10000);
  assert.equal(c.snapshot(181001).gridPortW.stale, true);
  c.failed('measure_battery'); assert.equal(c.snapshot(1000).socPct, undefined);
  c.observe('stream_unit_power_grid', 10, 999, 1000); assert.equal(c.snapshot(1000).gridPortW.value, 0);
  c.observe('stream_unit_power_grid', 15, 1001, 1000); assert.equal(c.snapshot(1000).gridPortW.value, 0);
  c.observe('stream_unit_power_grid', 3, 500, 500); assert.equal(c.snapshot(500).gridPortW.value, 3);
});

test('counter continuity observes missing, unchanged, advances, resets and invalid data without changing totals', () => {
  const c = new StreamCounterContinuity();
  assert.equal(c.snapshot(1000).fields.accuDsgEnergy.status, 'missing');
  c.observe({ accuChgEnergy: null }, 1000, 1000);
  assert.equal(c.snapshot(1000).fields.accuChgEnergy.status, 'invalid');
  c.observe({ accuDsgEnergy: 100 }, 1000, 1000);
  assert.equal(c.snapshot(1000).fields.accuDsgEnergy.status, 'baseline_only');
  for (let i = 1; i <= 4; i++) c.observe({ accuDsgEnergy: 100 }, 1000 + i * 100000, 1000 + i * 100000);
  assert.equal(c.snapshot(401000, -500).fields.accuDsgEnergy.possibleStall, true);
  assert.equal(c.snapshot(401000, 500).fields.accuDsgEnergy.possibleStall, false);
  assert.equal(c.snapshot(401000).fields.accuDsgEnergy.possibleStall, false);
  c.observe({ accuDsgEnergy: 101 }, 401001, 401001);
  assert.equal(c.snapshot(401001, -500).fields.accuDsgEnergy.status, 'advance_observed');
  assert.equal(c.snapshot(401001, -500).fields.accuDsgEnergy.possibleStall, false);
  c.observe({ accuDsgEnergy: 0 }, 401002, 401002);
  assert.equal(c.snapshot(401002).fields.accuDsgEnergy.resetCount, 1);
  c.observe({ accuDsgEnergy: NaN }, 401003, 401003);
  assert.equal(c.snapshot(401003).fields.accuDsgEnergy.status, 'invalid');
  c.observe({}, 500000, 500000);
  assert.equal(c.snapshot(600000, -500).fields.accuDsgEnergy.possibleStall, false);
  c.observe({ accuDsgEnergy: 300 }, 999, 600000);
  assert.equal(c.snapshot(600000).fields.accuDsgEnergy.resetCount, 1);
  c.observe({ accuDsgEnergy: 10 }, 500, 500);
  assert.equal(c.snapshot(500).fields.accuDsgEnergy.status, 'baseline_only');
  assert.equal(c.snapshot(500).sourceMigrationAllowed, false);
});

test('counter gaps re-anchor suspicion and valid numeric strings stay observational', () => {
  const c = new StreamCounterContinuity();
  c.observe({ accuDsgEnergy: '100' }, 1000, 1000);
  c.observe({ accuDsgEnergy: 100 }, 400000, 400000);
  assert.equal(c.snapshot(400000, -500).fields.accuDsgEnergy.unchangedSec, 0);
  assert.equal(c.snapshot(400000, -500).fields.accuDsgEnergy.possibleStall, false);
  c.observe({ accuDsgEnergy: '' }, 400001, 400001);
  assert.equal(c.snapshot(400001).fields.accuDsgEnergy.status, 'invalid');
  c.observe({ accuDsgEnergy: 0 }, 399999, 400001);
  assert.equal(c.snapshot(400001).fields.accuDsgEnergy.resetCount, 0);
  c.observe({ accuDsgEnergy: 100 }, 400002, 400002);
  assert.equal(c.snapshot(400002, -500).fields.accuDsgEnergy.unchangedSec, 0, 'invalid intervals cannot imply continuity');
});

test('peer comparison isolates unavailable optional getters without leaking private errors', () => {
  const peer = { sn: 'BK31SYNTHETIC0001', seenAt: 1000,
    readings: { batteryPowerRawW: { value: 500, receivedAt: 1000 } } };
  const readings = { get gridPortW() { throw new Error('PRIVATE'); } };
  const result = correlateStreamPeers({ peers: [peer] }, [{ sn: peer.sn, driverId: 'stream_unit', deviceIndex: 0, readings }], 1000);
  assert.equal(result[0].status, 'exact_identity_match');
  assert.equal(result[0].comparisons.rawPowerVersusPort.peerMinusUnit, null);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('blank reading reasons separate scope, expiry, write failure and missing input', () => {
  const device = { hasCapability: () => true, getCapabilityValue: () => null };
  const reasons = streamReadingExplanations('stream_5000_unit', device, {
    'measure_power.load': { stale: true }, 'measure_power.grid': { stale: true, applicationStatus: 'write_failed' } });
  assert.equal(reasons.stream_unit_power_battery_flow, 'individual_flow_unverified');
  assert.equal(reasons['measure_power.load'], 'expired');
  assert.equal(reasons['measure_power.grid'], 'write_failed');
  assert.equal(streamReadingExplanations('stream', device, {})['measure_power.grid'], 'not_reported');
  device.getCapabilityValue = () => 0;
  assert.equal(streamReadingExplanations('stream', device, {})['measure_power.grid'], 'available');
});

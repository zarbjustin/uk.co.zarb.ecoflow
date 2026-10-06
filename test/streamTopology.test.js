'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Es22TopologyTracker, readStreamTopologyEvidence, streamTopologySnapshot,
  streamAggregateOverlapSnapshot, TOPOLOGY_STALE_AFTER_MS, MAX_OBSERVED_PEERS,
} = require('../.homeybuild/lib/streamTopology');

const ES = 'ES22SYNTHETIC0001';
const BK = 'BK11SYNTHETIC0001';
const OTHER = 'ES22SYNTHETIC0002';

function aggregate(driverId, deviceIndex, evidence) {
  return { driverId, deviceIndex, evidence };
}

function bkEvidence(addressSn = BK) {
  return {
    source: 'bk_main_address', addressSn, peers: [], maxReportedRecordCount: 0,
    lastPeerRecordAt: null, systemSocObserved: false, truncated: false,
  };
}

test('mixed peer observations are a review hint, never a complete grouping contract', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ sourceSn: ES, socPct: 76, unitRecordCount: 2,
    unitsBySn: { [ES]: { socPct: 87 }, [BK]: { socPct: 65 } } }, 1000);
  const evidence = tracker.evidence();
  const snapshot = streamTopologySnapshot(evidence, 2000);
  assert.equal(snapshot.observedPeerCount, 1);
  assert.equal(snapshot.peerFamilies.original_stream, 1);
  assert.equal(snapshot.systemSocObserved, true);
  assert.equal(snapshot.membership, 'unverified');
  const report = streamAggregateOverlapSnapshot([
    aggregate('stream', 0, bkEvidence()), aggregate('stream_5000_system', 0, evidence),
  ], 2000);
  assert.equal(report.autoGroupingEnabled, false);
  assert.equal(report.stableMembershipVerified, false);
  assert.equal(report.potentialOverlapPairs.length, 1);
  assert.equal(report.potentialOverlapPairs[0].basis, 'shared_observed_serial');
  assert.equal(report.potentialOverlapPairs[0].freshEvidence, true);
  assert.equal(report.potentialOverlapPairs[0].action, 'review_only');
  assert.ok(!JSON.stringify({ snapshot, report }).includes('SYNTHETIC'));
});

test('coexisting account devices and matching percentages do not create a grouping', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ socPct: 50, unitRecordCount: 1, unitsBySn: { [ES]: { socPct: 50 } } }, 1000);
  const report = streamAggregateOverlapSnapshot([
    aggregate('stream', 0, bkEvidence()), aggregate('stream_5000_system', 0, tracker.evidence()),
    aggregate('stream_5000_system', 1, new Es22TopologyTracker(OTHER).evidence()),
  ], 2000);
  assert.deepEqual(report.potentialOverlapPairs, []);
  assert.equal(report.aggregateCount, 3);
  assert.equal(report.stableMembershipVerified, false, 'no overlap is not proof of independence');
});

test('partial deltas preserve historical peers but cannot refresh their timestamps', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ unitRecordCount: 2, unitsBySn: { [BK]: {} } }, 1000);
  tracker.observe({ socPct: 76, unitsBySn: { [ES]: { socPct: 87 } } }, 5000);
  const now = 1001 + TOPOLOGY_STALE_AFTER_MS;
  const snapshot = streamTopologySnapshot(tracker.evidence(), now);
  assert.equal(snapshot.observedPeerCount, 1);
  assert.equal(snapshot.freshPeerCount, 0);
  assert.equal(snapshot.peerEvidenceStale, true);
  const report = streamAggregateOverlapSnapshot([
    aggregate('stream', 0, bkEvidence()), aggregate('stream_5000_system', 0, tracker.evidence()),
  ], now);
  assert.equal(report.potentialOverlapPairs[0].freshEvidence, false);
  tracker.observe({ unitsBySn: { [BK]: {} } }, now);
  assert.equal(streamTopologySnapshot(tracker.evidence(), now).freshPeerCount, 1);
});

test('record count without attributable serials cannot fabricate peers or missing members', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ unitRecordCount: 3, singleUnitSocPct: 50 }, 1000);
  const snapshot = streamTopologySnapshot(tracker.evidence(), 1000);
  assert.equal(snapshot.observedPeerCount, 0);
  assert.equal(snapshot.maxReportedRecordCount, 3);
  assert.equal(snapshot.systemSocObserved, false);
  assert.equal(snapshot.membership, 'unverified');
});

test('foreign source, invalid time, malformed serials and invalid system SOC add no evidence', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ sourceSn: OTHER, socPct: 70, unitsBySn: { [BK]: {} } }, 1000);
  tracker.observe({ socPct: 70, unitsBySn: { [BK]: {} } }, NaN);
  tracker.observe({ socPct: Infinity, unitsBySn: { 'private@example.com': {}, bad: {} } }, 1000);
  const snapshot = streamTopologySnapshot(tracker.evidence(), 1000);
  assert.equal(snapshot.systemSocObserved, false);
  assert.equal(snapshot.observedPeerCount, 0);
});

test('unknown prefixes stay unknown and future timestamps are not fresh evidence', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ unitsBySn: { BK99SYNTHETIC0001: {}, ES21SYNTHETIC0001: {} } }, 2000);
  const snapshot = streamTopologySnapshot(tracker.evidence(), 1000);
  assert.equal(snapshot.peerFamilies.original_stream, 0);
  assert.equal(snapshot.peerFamilies.unknown, 1);
  assert.equal(snapshot.peerFamilies.stream_5000, 1, 'a prefix observation is not pairing admission');
  assert.equal(snapshot.freshPeerCount, 0);
  assert.equal(snapshot.peerEvidenceStale, true);
});

test('case normalization, duplicate records and out-of-order updates do not inflate peers', () => {
  const tracker = new Es22TopologyTracker(ES.toLowerCase());
  tracker.observe({ sourceSn: ES, unitsBySn: { [BK.toLowerCase()]: {}, [BK]: {}, [ES]: {} } }, 5000);
  tracker.observe({ unitsBySn: { [BK]: {} } }, 1000);
  const evidence = tracker.evidence();
  assert.equal(evidence.peers.length, 1);
  assert.equal(evidence.peers[0].seenAt, 5000);
  assert.equal(evidence.lastPeerRecordAt, 5000);
});

test('tracker has bounded memory and resets at a new runtime session', () => {
  const tracker = new Es22TopologyTracker(ES);
  const peers = Object.fromEntries(Array.from({ length: MAX_OBSERVED_PEERS + 5 }, (_, i) => [`BK11TEST${i}`, {}]));
  tracker.observe({ unitsBySn: peers }, 1000);
  assert.equal(tracker.evidence().peers.length, MAX_OBSERVED_PEERS);
  assert.equal(tracker.evidence().truncated, true);
  assert.equal(new Es22TopologyTracker(ES).evidence().peers.length, 0);
  const returned = tracker.evidence();
  returned.peers.length = 0;
  assert.equal(tracker.evidence().peers.length, MAX_OBSERVED_PEERS, 'callers cannot mutate the tracker');
});

test('untrusted diagnostic getter is re-projected, bounded and exceptions stay private', () => {
  assert.equal(readStreamTopologyEvidence({ getTopologyEvidence() { throw new Error(BK); } }), null);
  assert.equal(readStreamTopologyEvidence({ getTopologyEvidence: () => ({ source: 'account_list', addressSn: ES }) }), null);
  const evidence = readStreamTopologyEvidence({ getTopologyEvidence: () => ({
    ...bkEvidence(), peers: [{ sn: ES, seenAt: 1000 }], password: 'private-password',
    systemSocObserved: true, lastPeerRecordAt: 1000,
  }) });
  assert.deepEqual(evidence.peers, [], 'a BK paired address must not be misrepresented as observed peer membership');
  assert.equal(evidence.systemSocObserved, false);
  assert.equal(evidence.lastPeerRecordAt, null);
  assert.ok(!JSON.stringify(evidence).includes('password'));
});

test('a shared historical peer between two ES sources is flagged without choosing an authority', () => {
  const a = new Es22TopologyTracker(ES);
  const b = new Es22TopologyTracker(OTHER);
  a.observe({ unitsBySn: { [BK]: {} } }, 1000);
  b.observe({ unitsBySn: { [BK]: {} } }, 1000);
  const report = streamAggregateOverlapSnapshot([
    aggregate('stream_5000_system', 0, a.evidence()), aggregate('stream_5000_system', 1, b.evidence()),
  ], 1000);
  assert.equal(report.potentialOverlapPairs.length, 1);
  assert.equal(report.stableMembershipVerified, false);
  const same = streamAggregateOverlapSnapshot([
    aggregate('stream', 0, bkEvidence()), aggregate('stream', 1, bkEvidence()),
  ], 1000);
  assert.equal(same.potentialOverlapPairs[0].basis, 'same_paired_address');
  assert.equal(same.potentialOverlapPairs[0].freshEvidence, null, 'paired-address equality does not prove fresh telemetry');
  assert.deepEqual(streamTopologySnapshot(null, 1000), { source: 'unavailable', membership: 'unverified' });
});
// The internal historical tracker class is shared; evidence labels remain model-specific.
test('ES21 topology evidence survives the privacy projection with its own source label', () => {
  const tracker = new Es22TopologyTracker('ES21SYNTHETIC0001');
  tracker.observe({ sourceSn: 'ES21SYNTHETIC0001', unitsBySn: { ES22SYNTHETIC0002: {}, BK61SYNTHETIC0003: {} } }, 1000);
  const evidence = readStreamTopologyEvidence({ getTopologyEvidence: () => tracker.evidence() });
  const snapshot = streamTopologySnapshot(evidence, 1000);
  assert.equal(snapshot.source, 'es21_peer_records');
  assert.equal(snapshot.pairedAddressFamily, 'stream_5000');
  assert.equal(snapshot.peerFamilies.original_stream, 1);
  assert.equal(snapshot.peerFamilies.ac_5000, 1);
  assert.equal(snapshot.membership, 'unverified');
  assert.ok(!JSON.stringify(snapshot).includes('SYNTHETIC'));
});

test('anonymous peer visibility never infers expansion count, capacity or telemetry freshness from session flags', () => {
  const tracker = new Es22TopologyTracker(ES);
  const unknown = 'ZZ11PRIVATE0001';
  tracker.observe({ unitsBySn: { [unknown]: { socPct: 75, batteryPowerRawW: 10, pv: { totalW: 0 } } }, unitRecordCount: 4 }, 1000);
  tracker.observe({ unitsBySn: { [unknown]: {} } }, 2000);
  const report = streamTopologySnapshot(readStreamTopologyEvidence({ getTopologyEvidence: () => tracker.evidence() }), 2000);
  assert.deepEqual(report.peerVisibility[0], { observationIndex: 0, prefix: 'ZZ11', family: 'unknown', entityRole: 'unverified', fresh: true,
    fieldsSeenThisSession: { soc: true, rawBatteryPower: true, pv: true } });
  assert.equal(report.expansionPackCount, null);
  assert.equal(report.installedCapacityKWh, null);
  assert.equal(report.maxReportedRecordCount, 4, 'record count is not pack count');
  assert.equal(streamTopologySnapshot(tracker.evidence(), 2000 + TOPOLOGY_STALE_AFTER_MS + 1).peerVisibility[0].fresh, false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.deepEqual(new Es22TopologyTracker(ES).evidence().peers, []);
});

test('invalid SOC/power/PV fields and arbitrary peer getter fields are not exported', () => {
  const tracker = new Es22TopologyTracker(ES);
  tracker.observe({ unitsBySn: { [BK]: { socPct: 120, batteryPowerRawW: NaN, pv: { totalW: -1, string1W: Infinity } } } }, 1000);
  const report = streamTopologySnapshot(tracker.evidence(), 1000);
  assert.deepEqual(report.peerVisibility[0].fieldsSeenThisSession, { soc: false, rawBatteryPower: false, pv: false });
  const projected = readStreamTopologyEvidence({ getTopologyEvidence: () => ({ ...tracker.evidence(),
    peers: [{ sn: BK, seenAt: 1000, socObserved: 'yes', rawBatteryPowerObserved: true, token: 'PRIVATE' }] }) });
  assert.equal(projected.peers[0].socObserved, false);
  assert.equal(projected.peers[0].rawBatteryPowerObserved, true);
  assert.ok(!JSON.stringify(projected).includes('PRIVATE'));
});

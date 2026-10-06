'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stream5000Assessment } = require('../.homeybuild/lib/stream5000Assessment');
const { streamDiscoverySnapshot } = require('../.homeybuild/lib/streamDiscovery');
const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');

const now = 2000000;
const evidence = { source: 'es22_peer_records', addressSn: 'ES22PRIVATE0001',
  peers: [{ sn: 'BK11PRIVATE0001', seenAt: now }], truncated: false };

test('fresh mixed-family evidence is a review hint only; stale and future peers do not count', () => {
  const result = stream5000Assessment(evidence, null, now);
  assert.equal(result.topology.status, 'mixed_family_peer_evidence_for_review');
  assert.equal(result.topology.autoMergeAllowed, false);
  assert.equal(result.gridInput.modelWriteEvidence, 'offline_es22_payload_replay');
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  for (const seenAt of [now + 1, now - 1200001]) {
    assert.equal(stream5000Assessment({ ...evidence, peers: [{ sn: 'BK11PRIVATE0001', seenAt }] }, null, now).topology.freshPeerCount, 0);
  }
  assert.equal(stream5000Assessment({ ...evidence, truncated: true }, null, now).topology.status, 'truncated_evidence');
  assert.equal(stream5000Assessment(null, null, now).gridInput.modelWriteEvidence, 'unverified');
  assert.equal(stream5000Assessment({ ...evidence, addressSn: 'ES21PRIVATE0001' }, null, now).gridInput.modelWriteEvidence, 'unverified');
});

test('support report integrates assessments even without configuration, and never enables controls', () => {
  const homey = { settings: { get: () => false }, drivers: { getDriver: (id) => ({ getDevices: () => id === 'stream_5000_unit'
    ? [{ getTopologyEvidence: () => ({ ...evidence, peers: [], maxReportedRecordCount: 0, lastPeerRecordAt: null }) }] : [] }) } };
  const report = createSupportSnapshot(homey);
  const assessment = report.drivers.find((driver) => driver.id === 'stream_5000_unit').assessment[0];
  assert.equal(assessment.controlsEnabled, false);
  assert.equal(assessment.gridInput.observation, 'missing_or_stale');
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('configuration receipts and enabled tasks are observations, not scheduler authority', () => {
  const configuration = { values: { maxGridInputW: { value: 1800, stale: false },
    tasks: { stale: false, value: [{ enabled: true }, { enabled: false }] } } };
  const result = stream5000Assessment(evidence, configuration, now);
  assert.equal(result.gridInput.observation, 'recent_receipt_not_verified_application');
  assert.equal(result.scheduling.observedEnabledTaskCount, 1);
  assert.equal(result.scheduling.controllerOwnership, 'unverified');
  assert.equal(result.scheduling.replacementAllowed, false);
  configuration.values.tasks.stale = true;
  configuration.values.maxGridInputW.stale = true;
  const stale = stream5000Assessment(evidence, configuration, now);
  assert.equal(stale.gridInput.observation, 'missing_or_stale');
  assert.equal(stale.scheduling.observedEnabledTaskCount, null);
});

test('product hints produce specific evidence requirements, not pairing authority', () => {
  const result = streamDiscoverySnapshot({ observedAt: now, groups: [
    { prefix: 'ZZZZ', verifiedModel: 'unverified', productHint: 'expansion_5000', count: 1, token: 'PRIVATE' },
    { prefix: 'YYYY', verifiedModel: 'unverified', productHint: 'gateway', count: 1 },
  ] }, now);
  assert.deepEqual(result.productResearch[0].requiredEvidence.slice(2, 4), ['host_inclusion', 'capacity_units']);
  assert.ok(result.productResearch[1].requiredEvidence.includes('measurement_scope'));
  assert.ok(result.productResearch.every((product) => !product.pairingEnabled && !product.contributesToEnergy));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

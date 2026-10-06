'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamDiscoveryInventory, streamDiscoverySnapshot, MAX_DISCOVERY_DEVICES,
  DISCOVERY_STALE_AFTER_MS } = require('../.homeybuild/lib/streamDiscovery');

const device = (sn, productName = '', extra = {}) => ({ sn, productName, name: 'PRIVATE NAME', online: 1, shared: false, ...extra });

test('inventory reports known models and unverified catalogue hints without admitting them', () => {
  const inventory = new StreamDiscoveryInventory();
  inventory.beginObservation()([
    device('ES21PRIVATE0001'), device('ES22PRIVATE0002'), device('BK61PRIVATE0003'),
    device('ZZ11PRIVATE0004', 'EcoFlow STREAM Expansion Battery 5000'),
    device('ZZ12PRIVATE0005', 'STREAM Expansion Battery 3000'),
    device('ZZ13PRIVATE0006', 'STREAM 3000'), device('ZZ14PRIVATE0007', 'STREAM Gateway'),
    device('ZZ15PRIVATE0008', 'EcoFlow Smart Meter Dual CT', { shared: true, online: 0 }),
  ], 1000);
  const report = streamDiscoverySnapshot(inventory.evidenceSnapshot(), 2000);
  assert.equal(report.observedDeviceCount, 8);
  assert.equal(report.scope, 'account_not_installation');
  assert.equal(report.membership, 'unverified');
  assert.equal(report.expansionCapacity, 'unverified');
  assert.deepEqual(report.groups.map((g) => g.verifiedModel),
    ['original_stream', 'stream_5000', 'stream_ac_5000', ...Array(5).fill('unverified')]);
  assert.deepEqual(report.groups.slice(3).map((g) => g.productHint),
    ['expansion_5000', 'expansion_3000', 'stream_3000', 'gateway', 'dual_ct_meter']);
  assert.equal(report.groups.at(-1).sharedCount, 1);
  assert.equal(report.groups.at(-1).onlineCount, 0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.ok(!JSON.stringify(inventory.evidenceSnapshot()).includes('PRIVATE'));
});

test('names, unrelated products and misleading names do not become model identities', () => {
  const inventory = new StreamDiscoveryInventory();
  inventory.beginObservation()([
    device('ZZ11PRIVATE0001', '', { name: 'STREAM Expansion Battery 5000' }),
    device('ZZ12PRIVATE0002', 'PRIVATE STREAM Gateway'),
    device('ES23PRIVATE0003', 'STREAM 5000'),
    device('HW51PRIVATE0004', 'PowerStream'),
  ], 1000);
  const report = streamDiscoverySnapshot(inventory.evidenceSnapshot(), 1000);
  assert.ok(report.groups.every((g) => g.verifiedModel === 'unverified' && g.productHint === 'none'));
});

test('inventory deduplicates case variants, bounds retention and rejects malformed identities', () => {
  const inventory = new StreamDiscoveryInventory();
  inventory.beginObservation()([device('ES22PRIVATE0001'), device('es22private0001'),
    device('private@example.com'), device(''), device('ES22' + 'A'.repeat(65))], 1000);
  let report = streamDiscoverySnapshot(inventory.evidenceSnapshot(), 1000);
  assert.equal(report.observedDeviceCount, 1);
  assert.equal(report.invalidRecordCount, 3);
  inventory.beginObservation()(Array.from({ length: MAX_DISCOVERY_DEVICES + 10 }, (_, i) => device(`ZZ11TEST${i}`)), 2000);
  report = streamDiscoverySnapshot(inventory.evidenceSnapshot(), 2000);
  assert.equal(report.observedDeviceCount, MAX_DISCOVERY_DEVICES);
  assert.equal(report.truncated, true);
});

test('old-account and out-of-order requests cannot overwrite the session inventory', () => {
  const inventory = new StreamDiscoveryInventory();
  const old = inventory.beginObservation();
  inventory.clear();
  old([device('ES22PRIVATE0001')], 1000);
  assert.equal(inventory.evidenceSnapshot(), null);
  const slow = inventory.beginObservation();
  inventory.beginObservation()([device('ES21PRIVATE0002')], 2000);
  slow([device('ES22PRIVATE0001')], 3000);
  const evidence = inventory.evidenceSnapshot();
  assert.equal(evidence.groups[0].prefix, 'ES21');
  evidence.groups[0].prefix = 'LEAK';
  assert.equal(inventory.evidenceSnapshot().groups[0].prefix, 'ES21');
});

test('unavailable, stale, future and hostile diagnostic projections remain explicit and private', () => {
  const inventory = new StreamDiscoveryInventory();
  assert.equal(streamDiscoverySnapshot(null, 1000).source, 'unavailable');
  inventory.beginObservation()([device('ES21PRIVATE0001')], 1000);
  assert.equal(streamDiscoverySnapshot(inventory.evidenceSnapshot(), 1000 + DISCOVERY_STALE_AFTER_MS + 1).stale, true);
  assert.equal(streamDiscoverySnapshot(inventory.evidenceSnapshot(), 999).source, 'unavailable');
  const report = streamDiscoverySnapshot({ observedAt: 1000, password: 'PRIVATE', groups: [
    { prefix: 'ES22PRIVATE', verifiedModel: 'stream_ac_5000', productHint: 'none', count: 1 },
    { prefix: 'ES22', verifiedModel: 'PRIVATE', productHint: 'none', count: 1 },
    { prefix: 'ES21', verifiedModel: 'stream_5000', productHint: 'none', count: 1, onlineCount: Infinity, sharedCount: 50, sn: 'PRIVATE' },
    { prefix: 'ZZ11', verifiedModel: 'stream_5000', productHint: 'expansion_5000', count: 1 },
  ] }, 1000);
  assert.equal(report.observedDeviceCount, 2);
  assert.equal(report.groups[0].onlineCount, 0);
  assert.equal(report.groups[0].sharedCount, 1);
  assert.equal(report.groups[1].verifiedModel, 'unverified', 'a getter cannot confer a verified model on an unknown prefix');
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

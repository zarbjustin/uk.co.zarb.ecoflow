'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamOwnUnitObservations, ownUnitSnapshot } = require('../.homeybuild/lib/streamReporterEvidence');

const sn = 'ES22SYNTHETIC';
test('self record never uses peer power or combined SOC/power; receipts age independently', () => {
  const tracker = new StreamOwnUnitObservations();
  tracker.observe({ sourceSn: sn, socPct: 15, battW: 3500, socPrecisePct: 16,
    unitsBySn: { [sn]: { socPct: 16, batteryPowerRawW: 2000 }, BK11SYNTHETIC: { socPct: 15, batteryPowerRawW: 1000 } } }, sn, 1000, 1000);
  tracker.observe({ socPct: 69, battW: 4400, socPrecisePct: 70 }, sn, 182000, 182000);
  const snapshot = tracker.snapshot(182000);
  assert.equal(snapshot.fields.socPrecisePct.value, 70);
  assert.equal(snapshot.fields.batteryPowerRawW.value, 2000);
  assert.equal(snapshot.fields.batteryPowerRawW.stale, true);
  assert.equal(snapshot.rawBatteryPowerSignAndScaleVerified, false);
  assert.equal(snapshot.accountingUsed, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC|3500|4400/);
});

test('foreign, delayed, invalid and future receipts cannot promote self power; clock rollback resets session values', () => {
  const tracker = new StreamOwnUnitObservations();
  const input = { unitsBySn: { [sn]: { socPct: 10, batteryPowerRawW: 100 } } };
  tracker.observe(input, sn, 2000, 2000);
  tracker.observe({ unitsBySn: { [sn]: { socPct: 90, batteryPowerRawW: 900 } } }, sn, 1000, 2100);
  tracker.observe({ ...input, sourceSn: 'ES22FOREIGN' }, sn, 2500, 2500);
  tracker.observe({ unitsBySn: { [sn]: { socPct: 101, batteryPowerRawW: Infinity } } }, sn, 2600, 2600);
  tracker.observe(input, sn, 3000, 2900);
  assert.equal(tracker.snapshot(2900).fields.batteryPowerRawW.value, 100);
  assert.equal(tracker.snapshot(2900).fields.batteryPowerRawW.ageSec, 0);
  tracker.observe({ socPrecisePct: 20 }, sn, 1500, 1500);
  assert.equal(tracker.snapshot(1500).fields.batteryPowerRawW, undefined);
  assert.equal(tracker.snapshot(1500).fields.socPrecisePct.value, 20);
  assert.deepEqual(new StreamOwnUnitObservations().snapshot(1500).fields, {});
});

test('fixed self projection rejects secrets and malformed fields; zero remains a real observation', () => {
  const snapshot = ownUnitSnapshot({ fields: { batteryPowerRawW: { value: 0, ageSec: 0, stale: false, sn },
    socPct: { value: 99, ageSec: -1, stale: false }, PRIVATE: { value: 9, ageSec: 0 } }, password: 'PRIVATE' });
  assert.equal(snapshot.fields.batteryPowerRawW.value, 0);
  assert.equal(snapshot.fields.socPct, undefined);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|SYNTHETIC|password/);
});

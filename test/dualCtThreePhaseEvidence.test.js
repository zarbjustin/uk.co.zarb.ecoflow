'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const review = async value => (await import('../scripts/review-dual-ct-three-phase-evidence.mjs')).reviewThreePhaseEvidence(value);
const rows = [[515, 100], [962, 400], [963, -200], [772, -100], [998, 900], [991, 100], [992, 300], [993, 500]];
const report = (extra = {}) => ({ reportType: 'dual_ct_candidate_snapshot', schemaVersion: 4,
  historical: true, notLive: true, devices: [{ deviceIndex: 0,
    readings: rows.map(([field, value]) => ({ field, value, receivedAgeSec: 20, ...extra })) }] });
const safe = r => { assert.equal(r.energyEligible, false); assert.equal(r.hardwareValidated, false);
  assert.equal(r.firmwareQualified, false); assert.equal(r.intervalCoverage, null); assert.equal(r.intervalAccuracy, null);
  assert.equal(r.referencePolicyVerified, false); };
test('snapshot arithmetic and equal receipt ages cannot establish a single payload or Energy acceptance', async () => {
  const r = await review(report()); safe(r); const [a,b] = r.devices[0].banks;
  assert.equal(a.arithmetic, 'consistent'); assert.equal(a.opposingPhases, true);
  assert.equal(a.receiptAssociation, 'equal_receipt_ages_only'); assert.equal(a.packetAssociation, 'unavailable');
  assert.equal(b.arithmetic, 'consistent'); assert.equal(a.measurementCoherenceVerified, false);
});
test('a reported packet index is recorded as a claim, never measurement timing or reference accuracy', async () => {
  const input = report({ packetIndex: 4 }); input.hardwareValidated = true; input.measurementTimestampKnown = true;
  const r = await review({ reportType: 'dual_ct_comparison', candidateSnapshot: input }); safe(r);
  assert.equal(r.devices[0].banks[0].packetAssociation, 'same_reported_packet');
  input.devices[0].readings[1].packetIndex = 5;
  assert.equal((await review(input)).devices[0].banks[0].packetAssociation, 'different_reported_packets');
});
test('pruned CT1 cannot be completed from CT2, other reports, bank-check summaries or zero filling', async () => {
  const input = report({ packetIndex: 4 }); input.devices[0].readings = input.devices[0].readings.filter(r => ![962,772].includes(r.field));
  input.bankChecks = [{bank:'A',status:'consistent'}];
  const r = await review(input); safe(r); const [a,b] = r.devices[0].banks;
  assert.deepEqual(a.missingFields, [962,772]); assert.equal(a.arithmetic, 'incomplete');
  assert.equal(a.packetAssociation, 'unavailable'); assert.equal(b.arithmetic, 'consistent');
});
test('decoded zero, mismatch, missing and malformed fields remain distinct without proving encoding', async () => {
  const zero = report(); zero.devices[0].readings.filter(r => [515,962,963,772].includes(r.field)).forEach(r => r.value=0);
  assert.equal((await review(zero)).devices[0].banks[0].decodedZeroPresent, true);
  const mismatch = report(); mismatch.devices[0].readings[0].value=999;
  assert.equal((await review(mismatch)).devices[0].banks[0].arithmetic, 'mismatch');
  for(const change of [r=>r.devices[0].readings.push({...r.devices[0].readings[0]}),
    r=>r.devices[0].readings[0].value=NaN,r=>r.devices[0].readings[0].value='100',r=>r.devices.push(r.devices[0])]) {
    const r=report(); change(r); assert.equal((await review(r)).status,'malformed_snapshot');
  }
  assert.equal((await review({acceptedPackets:1000})).status,'unsupported_snapshot');
});
test('assessment emits no household values, unknown metadata, IDs, firmware claims or vendor counters', async () => {
  const input = report(); input.deviceId='PRIVATE'; input.firmware='PRIVATE'; input.counterRecords=[{value:1234567}];
  input.devices[0].serial='PRIVATE'; input.devices[0].readings.forEach(r => r.raw='PRIVATE');
  const result = await review(input); safe(result); const text=JSON.stringify(result);
  assert.doesNotMatch(text,/PRIVATE|1234567|receivedAgeSec|value|serial|counterRecords/);
  assert.deepEqual(await review({...input,schemaVersion:3}),result);
});

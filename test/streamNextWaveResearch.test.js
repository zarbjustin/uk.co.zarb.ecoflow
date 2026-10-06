'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gridInputPayload, inspectGridInputWrite, controlReview, topologyReview, productReview } = require('./helpers/streamNextWaveResearch');
const captures = require('./fixtures/stream5000ContractAudit.json');
const { prioritySimulation } = require('./helpers/streamNextWaveResearch');

test('4A ES22 grid-input payload reproduces all four pinned app writes without output companions', () => {
  const writes = captures.captures.es22GridInputWrites.frames.filter(f => f.topic === 'set');
  assert.equal(writes.length, 4);
  const values = writes.map(f => inspectGridInputWrite(f.hex));
  assert.deepEqual(values.map(v => v.watts), [1200, 2200, 2600, 2500]);
  for (const v of values) assert.equal(gridInputPayload(v.watts).toString('hex'), v.payloadHex);
  // 2600 W is reproduced as evidence, NEVER declared an approved electrical bound.
  assert.equal(controlReview('ES22', 'max_grid_input').controlsEnabled, false);
});

test('4A malformed, negative, non-integer payload inputs and acknowledgements are rejected', () => {
  for (const watts of [-1, NaN, Infinity, 1.1, '1800', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => gridInputPayload(watts));
  }
  for (const f of captures.captures.es22GridInputWrites.frames.filter(f => f.topic === 'set_reply')) {
    assert.throws(() => inspectGridInputWrite(f.hex));
  }
  assert.throws(() => inspectGridInputWrite('0a')); // truncated
  assert.equal(gridInputPayload(0).toString('hex'), '080a52021000');
});

test('4A evidence does not admit ES21 input, total charge caps or schedule actuation', () => {
  assert.equal(controlReview('ES21', 'max_grid_input').offlinePayloadEvidence, false);
  assert.equal(controlReview('ES22', 'total_charge').offlinePayloadEvidence, false);
  const schedule = controlReview('ES22', 'scheduled_charge');
  assert.ok(schedule.blockingReasons.includes('stored_setpoint_can_differ_from_measured_power'));
  assert.equal(schedule.readbackMeaning, 'stored_setting_not_physical_response');
});

const now = 2000000;
function record(addressSn, reportedSystemId = 'SYSTEMA', memberSns = ['ES22HOST', 'BK31PEER']) {
  return { addressSn, reportedSystemId, memberSns, memberListComplete: true, observedAt: now };
}
test('5 consistent explicit mixed-model group is reviewable, never automatically merged or summed', () => {
  const result = topologyReview([record('ES22HOST'), record('BK31PEER', 'SYSTEMA', ['BK31PEER', 'ES22HOST'])], now);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].status, 'reported_group_for_review');
  for (const key of ['autoMergeAllowed', 'capacitySummationAllowed', 'socAveragingAllowed']) {
    assert.equal(result.groups[0][key], false);
  }
  const output = JSON.stringify(result);
  assert.ok(!output.includes('ES22HOST') && !output.includes('SYSTEMA'));
});

test('5 account proximity, matching SOC and an unnamed member list do not group devices', () => {
  const result = topologyReview([{ ...record('ES22HOST', null), soc: 80 }, { ...record('BK31PEER', null), soc: 80 }], now);
  assert.equal(result.groups.length, 2);
  assert.ok(result.groups.every(g => g.reasons.includes('explicit_system_identity_missing')));
});

test('5 stale/future evidence and incomplete/conflicting lists fail closed', () => {
  for (const observedAt of [now + 1, now - 1200001, NaN, -1]) {
    assert.ok(topologyReview([{ ...record('ES22HOST'), observedAt }], now).groups[0].reasons.includes('stale_or_future_evidence'));
  }
  assert.ok(topologyReview([{ ...record('ES22HOST'), memberListComplete: false }], now).groups[0].reasons.includes('membership_incomplete'));
  assert.ok(topologyReview([record('ES22HOST'), record('BK31PEER', 'SYSTEMA', ['BK31PEER'])], now).groups[0].reasons.includes('conflicting_member_lists'));
});

test('5 independent systems stay separate; overlapping records require review', () => {
  const separate = topologyReview([record('ES22HOST'), record('ES21HOST', 'SYSTEMB', ['ES21HOST'])], now);
  assert.equal(separate.groups.length, 2);
  assert.ok(separate.groups.every(g => g.status === 'reported_group_for_review'));
  const overlap = topologyReview([record('ES22HOST'), record('BK31PEER', 'SYSTEMB', ['BK31PEER'])], now);
  assert.ok(overlap.groups.every(g => g.reasons.includes('cross_system_overlap')));
});

test('5 invalid members, duplicate addresses and truncation cannot certify membership', () => {
  assert.ok(topologyReview([record('ES22HOST', 'SYSTEMA', ['ES22HOST', 'bad serial!'])], now).groups[0].reasons.includes('membership_incomplete'));
  assert.ok(topologyReview([record('ES22HOST'), record('ES22HOST')], now).groups[0].reasons.includes('duplicate_address'));
  assert.ok(topologyReview(Array.from({ length: 65 }, () => record('ES22HOST')), now).groups[0].reasons.includes('truncated_evidence'));
  assert.throws(() => topologyReview([], NaN));
});

test('6 every new product needs model-specific evidence; hints never admit pairing', () => {
  for (const product of ['expansion_5000', 'expansion_3000', 'stream_3000', 'gateway', 'dual_ct_meter']) {
    const result = productReview(product, { productName: 'official looking', prefix: 'ES99' });
    assert.equal(result.status, 'evidence_pending');
    assert.equal(result.pairingEnabled, false);
    assert.equal(result.contributesToEnergy, false);
  }
  assert.ok(productReview('expansion_5000').missing.includes('hostInclusion'));
  assert.ok(productReview('gateway').missing.includes('measurementScope'));
  assert.ok(productReview('stream_3000').missing.includes('modelSpecificAdapter'));
  assert.throws(() => productReview('unknown'));
});

test('6 even complete evidence allows only manual review, not new Energy sources', () => {
  const evidence = { identityContract: true, maskedCapture: true, fieldAttribution: true,
    hardwareValidation: true, hostInclusion: true, capacityUnits: true };
  const result = productReview('expansion_5000', evidence);
  assert.equal(result.status, 'ready_for_manual_admission_review');
  assert.equal(result.contributesToEnergy, false);
  assert.equal(result.pairingEnabled, false);
  assert.ok(productReview('expansion_5000', { ...evidence, hardwareValidation: 'true' }).missing.includes('hardwareValidation'));
});

function policyInput(time, soc = 98, byd = 0, stream = 0) {
  return { now: time, bydSoc: { value: soc, at: time }, bydBatteryW: { value: byd, at: time },
    streamBatteryW: { value: stream, at: time }, manualOverride: false, controllerConflict: false };
}
test('4B priority simulation needs stable SOC and cooldown, never sends commands', () => {
  const first = prioritySimulation(policyInput(1000));
  assert.equal(first.state, 'waiting');
  const ready = prioritySimulation(policyInput(61000), first);
  assert.equal(ready.state, 'permission_candidate');
  assert.equal(ready.commandWrites, 0);
  assert.equal(prioritySimulation(policyInput(62000, 97.5), ready).state, 'permission_candidate');
  assert.equal(prioritySimulation(policyInput(63000, 97), ready).state, 'waiting');
  assert.equal(prioritySimulation(policyInput(64000, 98), ready, { startSoc: 99, stopSoc: 98 }).state, 'waiting');
});
test('4B missing, future and stale inputs revoke permission immediately', () => {
  for (const key of ['bydSoc', 'bydBatteryW', 'streamBatteryW']) {
    for (const reading of [null, { value: 98, at: 0 }, { value: 98, at: 70001 }, { value: NaN, at: 70000 }]) {
      const result = prioritySimulation({ ...policyInput(70000), [key]: reading }, { state: 'permission_candidate', lastTransitionAt: 1000 });
      assert.equal(result.state, 'blocked');
      assert.equal(result.candidateSince, null);
    }
  }
});
test('4B opposing flows block both directions without pretending to idle either battery', () => {
  for (const [byd, stream] of [[-100, 100], [100, -100]]) {
    const result = prioritySimulation(policyInput(1000, 99, byd, stream));
    assert.equal(result.reason, 'opposing_battery_flows');
    assert.equal(result.commandWrites, 0);
  }
  assert.equal(prioritySimulation(policyInput(1000, 99, -100, 0)).reason, 'byd_discharging');
});
test('4B manual ownership, invalid settings and clock resets cannot grant permission', () => {
  assert.equal(prioritySimulation({ ...policyInput(1000), manualOverride: true }).state, 'blocked');
  assert.equal(prioritySimulation({ ...policyInput(1000), controllerConflict: undefined }).state, 'blocked');
  assert.equal(prioritySimulation(policyInput(1000), {}, { stopSoc: 99 }).reason, 'invalid_policy');
  assert.equal(prioritySimulation(policyInput(1000), { lastTransitionAt: 2000 }).reason, 'invalid_prior_clock');
  assert.equal(prioritySimulation(policyInput(1000, 101)).reason, 'invalid_reading');
});

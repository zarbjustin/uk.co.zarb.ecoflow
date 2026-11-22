'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000ReservePilot } = require('../.homeybuild/lib/stream5000ReservePilot');
const { Stream5000InstallationOperationOwner } = require('../.homeybuild/lib/stream5000ControlContract');

function fixture() {
  const target = { targetKey: 'synthetic-unit', installationKey: 'synthetic-installation',
    model: 'STREAM_5000_AC', firmware: 'synthetic-firmware', scope: 'unit', generation: 1,
    routing: 'qualified_unit', commandTargetSn: 'ES22SYNTHETICTARGET' };
  const qualification = { ...target, action: 'backup_reserve_percent', source: 'official_native',
    routingEvidenceRef: 'synthetic-scope-and-routing-not-device-evidence',
    evidenceRef: 'synthetic-test-only-not-hardware-evidence' };
  const owner = new Stream5000InstallationOperationOwner();
  const pilot = new Stream5000ReservePilot([qualification], owner);
  const context = (now, reservePercent = 50, receivedAt = now) => ({
    now, target: { ...target },
    authority: { revision: 1, exclusive: true, nativeAiCoordinated: true },
    configuration: { source: 'official_native', generation: 1, receivedAt,
      commandTargetSn: target.commandTargetSn,
      reserveEnabled: true, reservePercent, companionSnapshotId: 'synthetic-companions' },
  });
  const approval = { operationId: 'synthetic-operation', forwardApproved: true,
    restoreApproved: true, reservePercent: 51 };
  const ack = { kind: 'ack', operationId: approval.operationId, code: 0 };
  const readback = (at, operationId = approval.operationId, reservePercent = 51) => ({
    kind: 'configuration', operationId, receivedAt: at, independent: true,
    source: 'official_native_selective', queryId: `synthetic-query-${at}`, queriedAt: at,
    reserveEnabled: true, reservePercent,
  });
  const outcome = (at) => ({
    kind: 'outcome', operationId: approval.operationId, independentPhysicalObservation: true,
    observedAt: at, targetKey: target.targetKey, generation: target.generation, scope: target.scope,
    source: 'independent_native_policy', evidenceRef: 'synthetic-independent-outcome',
  });
  return { pilot, owner, target, qualification, context, approval, ack, readback, outcome };
}

test('empty real qualification registry admits no target; supported family is not firmware/scope proof', () => {
  const { context, approval } = fixture();
  assert.throws(() => new Stream5000ReservePilot().begin(context(1000), approval), /blocked/);
  for (const change of ['model', 'firmware', 'scope', 'installationKey', 'targetKey']) {
    const { pilot, context: fresh } = fixture(); const ctx = fresh(1000);
    ctx.target[change] = 'unqualified-or-linked';
    assert.throws(() => pilot.begin(ctx, approval), /blocked/);
  }
});

test('preflight rejects missing approval, uncoordinated AI, stale/unknown native data and unsafe delta', () => {
  for (const change of ['approval', 'ai', 'exclusive', 'stale', 'future', 'clock', 'enabled', 'baseline', 'delta', 'source']) {
    const { pilot, context, approval } = fixture(); const ctx = context(10000);
    if (change === 'approval') approval.forwardApproved = false;
    else if (change === 'ai') ctx.authority.nativeAiCoordinated = false;
    else if (change === 'exclusive') ctx.authority.exclusive = false;
    else if (change === 'stale') ctx.configuration.receivedAt = 5000;
    else if (change === 'future') ctx.configuration.receivedAt = 10001;
    else if (change === 'clock') ctx.now = NaN;
    else if (change === 'enabled') ctx.configuration.reserveEnabled = false;
    else if (change === 'baseline') ctx.configuration.reservePercent = 49;
    else if (change === 'delta') approval.reservePercent = 51.5;
    else ctx.configuration.source = 'captured_app_protocol';
    assert.throws(() => pilot.begin(ctx, approval), /blocked/);
  }
});

test('one forward intent, correlated ACK, independent applied configuration and physical outcome stay separate', () => {
  const { pilot, context, approval, ack, readback, outcome } = fixture();
  assert.deepEqual(pilot.begin(context(1000), approval), { operationId: approval.operationId, reservePercent: 51 });
  assert.throws(() => pilot.begin(context(1000), approval), /no queue/);
  assert.equal(pilot.step(context(1001), { ...ack, operationId: 'foreign' }), 'awaiting_ack');
  assert.equal(pilot.step(context(1002), ack), 'awaiting_configuration');
  assert.equal(pilot.step(context(1002), ack), 'awaiting_configuration');
  assert.equal(pilot.step(context(1003, 51), readback(1003)), 'observing');
  assert.equal(pilot.step(context(1004, 51), { ...outcome(1004),
    independentPhysicalObservation: false }), 'observing');
  assert.equal(pilot.step(context(1005, 51), outcome(1005)), 'observed');
});

for (const restoring of [false, true]) {
  test(`contradictory correlated ${restoring ? 'restoration' : 'forward'} ACK retains unknown instead of accepting later configuration`, () => {
    const { pilot, owner, target, context, approval, ack, readback } = fixture();
    pilot.begin(context(1000), approval);
    pilot.step(context(1001), ack);
    let operationId = approval.operationId; let at = 1001; let percent = 50;
    if (restoring) {
      pilot.step(context(1002, 51), readback(1002));
      operationId = pilot.prepareRestore(context(1003, 51)).operationId;
      at = 1004; percent = 51;
      pilot.step(context(at, percent), { ...ack, operationId });
    }
    const expected = restoring ? 'awaiting_restore_configuration' : 'awaiting_configuration';
    assert.equal(pilot.step(context(at, percent), { ...ack, operationId: 'foreign', code: 1 }), expected);
    assert.equal(pilot.step(context(at, percent), { ...ack, operationId }), expected);
    assert.equal(pilot.step(context(at, percent), { ...ack, operationId, code: 1 }), 'unknown');
    assert.equal(owner.snapshot(target.installationKey).status, 'unknown');
    assert.equal(pilot.step(context(at + 1, restoring ? 50 : 51),
      readback(at + 1, operationId, restoring ? 50 : 51)), 'unknown');
    assert.throws(() => pilot.prepareRestore(context(at + 2, 51)), /blocked/);
  });
}

test('authority, generation, scope, companion drift and clock rollback revoke an in-flight operation', () => {
  for (const change of ['authority', 'generation', 'scope', 'companions', 'rollback']) {
    const { pilot, context, approval, ack } = fixture();
    pilot.begin(context(1000), approval); const ctx = context(1001);
    if (change === 'authority') ctx.authority.revision++;
    else if (change === 'generation') { ctx.target.generation++; ctx.configuration.generation++; }
    else if (change === 'scope') ctx.target.scope = 'system';
    else if (change === 'companions') ctx.configuration.companionSnapshotId = 'drift';
    else { ctx.now = 999; ctx.configuration.receivedAt = 999; }
    assert.equal(pilot.step(ctx, ack), 'unknown');
    assert.equal(pilot.step(context(1002), ack), 'unknown');
    assert.throws(() => pilot.prepareRestore(context(1003, 51)), /blocked/);
  }
});

test('exact ACK/readback/outcome deadlines are terminal and late callbacks do not resend or restore', () => {
  for (const phase of ['ack', 'configuration', 'outcome']) {
    const { pilot, context, approval, ack, readback } = fixture();
    pilot.begin(context(1000), approval);
    let deadline = 11000;
    if (phase !== 'ack') { pilot.step(context(1001), ack); deadline = 31001; }
    if (phase === 'outcome') { pilot.step(context(1002, 51), readback(1002)); deadline = 121002; }
    assert.equal(pilot.step(context(deadline, phase === 'outcome' ? 51 : 50), { kind: 'tick' }), 'unknown');
    assert.equal(pilot.step(context(deadline + 1, 51), readback(deadline + 1)), 'unknown');
    assert.throws(() => pilot.begin(context(deadline + 2), approval), /no queue/);
  }
});

test('stale, mismatching, SDK-only and uncorrelated configuration cannot prove application', () => {
  for (const change of ['old', 'value', 'independent', 'cloud']) {
    const { pilot, context, approval, ack, readback } = fixture();
    pilot.begin(context(1000), approval); pilot.step(context(1001), ack);
    const ctx = context(1002, 51); const event = readback(1002);
    if (change === 'old') { event.receivedAt = 1000; ctx.configuration.receivedAt = 1000; }
    else if (change === 'value') event.reservePercent = 50;
    else if (change === 'independent') event.independent = false;
    else ctx.configuration.source = 'cloud_latest';
    assert.equal(pilot.step(ctx, event), 'unknown');
  }
});

test('restoration is separate, conditional, single-shot and has its own ACK/readback', () => {
  const { pilot, context, approval, ack, readback } = fixture();
  pilot.begin(context(1000), approval); pilot.step(context(1001), ack);
  pilot.step(context(1002, 51), readback(1002));
  const restore = pilot.prepareRestore(context(1003, 51));
  assert.deepEqual(restore, { operationId: `${approval.operationId}:restore`, reservePercent: 50 });
  assert.equal(pilot.step(context(1004, 51), { ...ack, operationId: restore.operationId }), 'awaiting_restore_configuration');
  assert.equal(pilot.step(context(1005), readback(1005, restore.operationId, 50)), 'restored');
  assert.throws(() => pilot.prepareRestore(context(1006)), /blocked/);
});

test('missing restore approval or third-party drift does not generate a compensating mutation', () => {
  for (const change of ['approval', 'value', 'switch', 'companions']) {
    const { pilot, context, approval, ack, readback } = fixture();
    if (change === 'approval') approval.restoreApproved = false;
    pilot.begin(context(1000), approval); pilot.step(context(1001), ack);
    pilot.step(context(1002, 51), readback(1002)); const ctx = context(1003, 51);
    if (change === 'value') ctx.configuration.reservePercent = 52;
    else if (change === 'switch') ctx.configuration.reserveEnabled = false;
    else if (change === 'companions') ctx.configuration.companionSnapshotId = 'new-settings';
    assert.throws(() => pilot.prepareRestore(ctx), /manual reconciliation/);
    assert.equal(pilot.status, 'unknown');
  }
});

test('accepted native configuration receipt is a frontier, not just a recent-enough restore snapshot', () => {
  for (const older of [true, false]) {
    const { pilot, context, approval, ack, readback } = fixture();
    pilot.begin(context(1000), approval); pilot.step(context(1001), ack);
    pilot.step(context(1100, 51), readback(1100)); const ctx = context(1200, 51);
    ctx.configuration.receivedAt = older ? 999 : 1100;
    if (older) assert.throws(() => pilot.prepareRestore(ctx), /blocked/);
    else assert.equal(pilot.prepareRestore(ctx).reservePercent, 50);
  }
});

test('physical outcome requires its own post-configuration source, target, scope, generation and age', () => {
  for (const change of ['old', 'future', 'stale', 'target', 'generation', 'scope', 'source', 'reference']) {
    const { pilot, context, approval, ack, readback, outcome } = fixture();
    pilot.begin(context(1000), approval); pilot.step(context(1001), ack);
    pilot.step(context(1100, 51), readback(1100));
    const event = outcome(1200); const ctx = context(1200, 51);
    if (change === 'old') event.observedAt = 999;
    else if (change === 'future') event.observedAt = 1201;
    else if (change === 'stale') ctx.now = ctx.configuration.receivedAt = 6200;
    else if (change === 'target') event.targetKey = 'foreign-unit';
    else if (change === 'generation') event.generation = 2;
    else if (change === 'scope') event.scope = 'system';
    else if (change === 'source') event.source = 'grid_watts_inference';
    else event.evidenceRef = [];
    assert.equal(pilot.step(ctx, event), 'observing');
  }
});

test('qualification references and records must have a bounded explicit string shape', () => {
  const { qualification, context, approval } = fixture();
  for (const invalid of [[], ['synthetic'], '', ' ', 'x'.repeat(1025), null]) {
    assert.throws(() => new Stream5000ReservePilot([{ ...qualification, evidenceRef: invalid }])
      .begin(context(1000), approval), /Invalid native qualification|blocked/);
  }
  assert.throws(() => new Stream5000ReservePilot([null]), /Invalid native qualification/);
});

test('qualification registry is an immutable reviewed snapshot, not caller-owned mutable authority', () => {
  const { qualification, context, approval } = fixture();
  const empty = []; const unqualified = new Stream5000ReservePilot(empty);
  empty.push(qualification);
  assert.throws(() => unqualified.begin(context(1000), approval), /blocked/);
  const mutable = [{ ...qualification }]; const qualified = new Stream5000ReservePilot(mutable,
    new Stream5000InstallationOperationOwner());
  mutable[0].firmware = 'changed-after-construction';
  assert.equal(qualified.begin(context(1000), approval).reservePercent, 51);
});

test('companion references reject whitespace and oversized retained strings', () => {
  for (const value of [' ', 'x'.repeat(1025)]) {
    const { pilot, context, approval } = fixture(); const ctx = context(1000);
    ctx.configuration.companionSnapshotId = value;
    assert.throws(() => pilot.begin(ctx, approval), /blocked/);
  }
});

test('operation references reject whitespace-only correlation identifiers', () => {
  const { pilot, context, approval } = fixture();
  approval.operationId = ' ';
  assert.throws(() => pilot.begin(context(1000), approval), /blocked/);
});

test('forward approval must leave room for the bounded derived restoration identifier', () => {
  const { pilot, context, approval } = fixture();
  approval.operationId = 'x'.repeat(121);
  assert.throws(() => pilot.begin(context(1000), approval), /blocked/);
  const valid = fixture(); valid.approval.operationId = 'x'.repeat(120);
  valid.pilot.begin(valid.context(1000), valid.approval);
  valid.pilot.step(valid.context(1001), { ...valid.ack, operationId: valid.approval.operationId });
  valid.pilot.step(valid.context(1002, 51), valid.readback(1002, valid.approval.operationId));
  assert.equal(valid.pilot.prepareRestore(valid.context(1003, 51)).operationId.length, 128);
});

for (const restoring of [false, true]) {
  for (const acknowledged of [false, true]) {
    test(`${restoring ? 'restore' : 'forward'} target reversal ${acknowledged ? 'after' : 'before'} ACK latches unknown`, () => {
      const { pilot, context, approval, ack, readback } = fixture();
      pilot.begin(context(1000), approval);
      let operationId = approval.operationId;
      const target = restoring ? 50 : 51;
      if (restoring) {
        pilot.step(context(1001), ack);
        pilot.step(context(1002, 51), readback(1002));
        operationId = pilot.prepareRestore(context(1003, 51)).operationId;
      }
      assert.equal(pilot.step(context(1010, target), { kind: 'tick' }),
        restoring ? 'awaiting_restore_ack' : 'awaiting_ack');
      if (acknowledged) pilot.step(context(1011, target), { ...ack, operationId });
      assert.equal(pilot.step(context(1012, restoring ? 51 : 50), { kind: 'tick' }), 'unknown');
      assert.equal(pilot.step(context(1013, target), { ...ack, operationId }), 'unknown');
      assert.equal(pilot.step(context(1014, target), readback(1014, operationId, target)), 'unknown');
      assert.throws(() => pilot.prepareRestore(context(1015, 51)), /blocked/);
    });
  }
}

test('legitimate application before ACK remains independently confirmable in both phases', () => {
  const { pilot, context, approval, ack, readback } = fixture();
  pilot.begin(context(1000), approval);
  assert.equal(pilot.step(context(1001, 51), { kind: 'tick' }), 'awaiting_ack');
  assert.equal(pilot.step(context(1002, 51), ack), 'awaiting_configuration');
  assert.equal(pilot.step(context(1003, 51), readback(1003)), 'observing');
  const restore = pilot.prepareRestore(context(1004, 51));
  assert.equal(pilot.step(context(1005, 50), { kind: 'tick' }), 'awaiting_restore_ack');
  assert.equal(pilot.step(context(1006, 50), { ...ack, operationId: restore.operationId }), 'awaiting_restore_configuration');
  assert.equal(pilot.step(context(1007, 50), readback(1007, restore.operationId, 50)), 'restored');
});

for (const restoring of [false, true]) {
  test(`${restoring ? 'restore' : 'forward'} progress uses the native frontier even at the dispatch millisecond`, () => {
    const { pilot, context, approval, ack, readback } = fixture();
    const baseline = context(1000); baseline.configuration.receivedAt = 999;
    pilot.begin(baseline, approval);
    let dispatchedAt = 1000;
    if (restoring) {
      pilot.step(context(1001), ack);
      pilot.step(context(1002, 51), readback(1002));
      const restoreContext = context(1003, 51); restoreContext.configuration.receivedAt = 1002;
      pilot.prepareRestore(restoreContext);
      dispatchedAt = 1003;
    }
    pilot.step(context(dispatchedAt, restoring ? 50 : 51), { kind: 'tick' });
    assert.equal(pilot.step(context(dispatchedAt + 1, restoring ? 51 : 50), { kind: 'tick' }), 'unknown');
  });
}

for (const restoring of [false, true]) {
  for (const acknowledged of [false, true]) {
    test(`${restoring ? 'restore' : 'forward'} equal-receipt contradictions ${acknowledged ? 'after' : 'before'} ACK retain unknown ownership`, () => {
      for (const origin of ['baseline', 'progress']) {
        const { pilot, owner, target, context, approval, ack, readback } = fixture();
        pilot.begin(context(1000), approval);
        let operationId = approval.operationId;
        let baselineAt = 1000;
        const phaseTarget = restoring ? 50 : 51;
        const phaseBaseline = restoring ? 51 : 50;
        if (restoring) {
          pilot.step(context(1001), ack);
          pilot.step(context(1002, 51), readback(1002));
          operationId = pilot.prepareRestore(context(1003, 51)).operationId;
          baselineAt = 1003;
        }
        let acceptedContext;
        if (origin === 'progress') {
          acceptedContext = context(1010, phaseTarget);
          pilot.step(acceptedContext, { kind: 'tick' });
          if (acknowledged) pilot.step(context(1011, phaseTarget, 1010), { ...ack, operationId });
        } else {
          if (acknowledged) {
            baselineAt++;
            pilot.step(context(baselineAt, phaseBaseline), { ...ack, operationId });
          }
          acceptedContext = context(1010, phaseTarget, baselineAt);
        }
        acceptedContext.now = 1012;
        if (origin === 'progress') acceptedContext.configuration.reservePercent = phaseBaseline;
        assert.equal(pilot.step(acceptedContext, { kind: 'tick' }), 'unknown', origin);
        assert.equal(owner.snapshot(target.installationKey).status, 'unknown');
        assert.equal(pilot.step(context(1013, phaseTarget), { ...ack, operationId }), 'unknown');
        assert.equal(pilot.step(context(1014, phaseTarget), readback(1014, operationId, phaseTarget)), 'unknown');
        assert.throws(() => pilot.prepareRestore(context(1015, 51)), /blocked/);
        assert.throws(() => pilot.begin(context(1016), approval), /no queue/);
        assert.equal(owner.snapshot(target.installationKey).status, 'unknown');
      }
    });
  }
}

test('identical receipt/value repeats remain harmless and selective confirmation has its own acceptance boundary', () => {
  const { pilot, owner, target, context, approval, ack, readback } = fixture();
  const baseline = context(1000);
  pilot.begin(baseline, approval);
  assert.equal(pilot.step(baseline, { kind: 'tick' }), 'awaiting_ack');
  const applied = context(1001, 51);
  assert.equal(pilot.step(applied, { kind: 'tick' }), 'awaiting_ack');
  assert.equal(pilot.step(applied, { kind: 'tick' }), 'awaiting_ack');
  const acknowledged = context(1002, 51, 1001);
  assert.equal(pilot.step(acknowledged, ack), 'awaiting_configuration');
  assert.equal(pilot.step(acknowledged, ack), 'awaiting_configuration');
  const confirmation = context(1003, 51);
  assert.equal(pilot.step(confirmation, { kind: 'tick' }), 'awaiting_configuration');
  assert.equal(pilot.step(confirmation, readback(1003)), 'observing');
  const restoreBaseline = context(1004, 51, 1003);
  const restore = pilot.prepareRestore(restoreBaseline);
  assert.equal(pilot.step(restoreBaseline, { kind: 'tick' }), 'awaiting_restore_ack');
  const restored = context(1005, 50);
  assert.equal(pilot.step(restored, { kind: 'tick' }), 'awaiting_restore_ack');
  assert.equal(pilot.step(restored, { kind: 'tick' }), 'awaiting_restore_ack');
  const restoreAck = { ...ack, operationId: restore.operationId };
  assert.equal(pilot.step(context(1006, 50, 1005), restoreAck), 'awaiting_restore_configuration');
  const restoreConfirmation = context(1007, 50);
  assert.equal(pilot.step(restoreConfirmation, { kind: 'tick' }), 'awaiting_restore_configuration');
  assert.equal(pilot.step(restoreConfirmation, readback(1007, restore.operationId, 50)), 'restored');
  assert.equal(owner.snapshot(target.installationKey), null);
});

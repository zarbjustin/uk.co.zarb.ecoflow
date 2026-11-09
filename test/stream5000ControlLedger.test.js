'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000ControlLedger: Ledger } = require(
  process.env.STREAM_5000_CONTROL_LEDGER_BUILD || '../.homeybuild/lib/stream5000ControlLedger',
);
const { Stream5000InstallationOperationOwner: LegacyOwner } = require('../.homeybuild/lib/stream5000ControlContract');

test('known native revision exhaustion blocks admission before forward or restoration dispatch', () => {
  for (const fieldRevision of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]) {
    const f = fixture();
    assert.throws(() => f.ledger.begin(f.context(), f.approval, { ...f.baseline, fieldRevision }), /headroom/);
    assert.equal(f.ledger.journal().active, null);
    assert.equal(f.ledger.journal().nextClaimId, 0);
  }
  const f = fixture(); f.start(); f.ledger.dispatchPossible(1);
  f.ledger.terminal(f.context(51), 1, { ...f.forward, fieldRevision: Number.MAX_SAFE_INTEGER });
  assert.throws(() => f.ledger.restoreIntent(f.context(51), f.restore), /headroom/);
  assert.equal(f.ledger.journal().active.phase, 'forward_terminal');
  const recovered = new Ledger({ ...f.config, journal: f.ledger.journal() });
  assert.equal(recovered.journal().active.held, true);
});

test('last representable two-step lineage can close but cannot start another reserve operation', () => {
  const f = fixture();
  f.ledger.begin(f.context(), f.approval, { ...f.baseline, fieldRevision: Number.MAX_SAFE_INTEGER - 2 });
  f.ledger.dispatchPossible(1);
  f.ledger.terminal(f.context(51), 1, { ...f.forward, fieldRevision: Number.MAX_SAFE_INTEGER - 1 });
  f.ledger.restoreIntent(f.context(51), f.restore); f.ledger.dispatchPossible(1);
  f.ledger.terminal(f.context(), 1, { ...f.reverse, fieldRevision: Number.MAX_SAFE_INTEGER });
  f.ledger.close(f.context(), 1, { ...f.closure, fieldRevision: Number.MAX_SAFE_INTEGER,
    terminalThroughRevision: Number.MAX_SAFE_INTEGER });
  assert.throws(() => f.ledger.begin(f.context(), { ...f.approval, claimId: 2, operationId: 'synthetic-next' },
    { ...f.baseline, fieldRevision: Number.MAX_SAFE_INTEGER }), /headroom/);
  assert.equal(f.ledger.journal().frontier.fieldRevision, Number.MAX_SAFE_INTEGER);
});

function fixture(options = {}) {
  const target = {
    targetKey: 'synthetic-unit', installationKey: 'synthetic-installation',
    model: 'STREAM_5000_AC', firmware: 'synthetic-only',
    scope: 'system', routing: 'qualified_system_main', commandTargetSn: 'SYNTHETIC_MAIN', generation: 1,
  };
  const qualification = {
    ...target, action: 'backup_reserve_percent', source: 'official_native',
    evidenceRef: 'synthetic-only-not-vendor-proof', routingEvidenceRef: 'synthetic-only-not-real-scope',
  };
  const config = {
    enabled: true, installationKey: target.installationKey, qualifications: [qualification],
    verifyEvidence: evidence => evidence.nativeEpoch === 'synthetic-epoch',
    ...options,
  };
  const ledger = new Ledger(config);
  const context = (percent = 50, change = {}) => ({
    now: 1000, target: { ...target },
    authority: { revision: 1, exclusive: true, nativeAiCoordinated: true },
    configuration: {
      source: 'official_native', generation: 1, commandTargetSn: target.commandTargetSn,
      receivedAt: 999, reserveEnabled: true, reservePercent: percent,
      companionSnapshotId: 'synthetic-companions',
    },
    ...change,
  });
  const approval = { claimId: 1, operationId: 'synthetic-pilot', forwardApproved: true, restoreApproved: false, reservePercent: 51 };
  const restore = { ...approval, forwardApproved: false, restoreApproved: true, reservePercent: 50 };
  const baseline = { kind: 'baseline', nativeEpoch: 'synthetic-epoch', fieldRevision: 10, reservePercent: 50 };
  const forward = {
    kind: 'command_terminal', nativeEpoch: baseline.nativeEpoch, fieldRevision: 11,
    reservePercent: 51, commandId: 'reserve-1:forward', terminal: true,
  };
  const reverse = { ...forward, fieldRevision: 12, reservePercent: 50, commandId: 'reserve-1:restore' };
  const closure = {
    kind: 'closure', nativeEpoch: baseline.nativeEpoch, fieldRevision: 12, reservePercent: 50, terminal: true,
    forwardCommandId: forward.commandId, restoreCommandId: reverse.commandId, terminalThroughRevision: 12,
  };
  const start = () => ledger.begin(context(), approval, baseline);
  const forwardTerminal = () => {
    start(); ledger.dispatchPossible(1); ledger.terminal(context(51), 1, forward);
  };
  const restored = () => {
    forwardTerminal(); ledger.restoreIntent(context(51), restore);
    ledger.dispatchPossible(1); ledger.terminal(context(), 1, reverse);
  };
  return { ledger, config, target, qualification, context, approval, restore, baseline, forward, reverse, closure,
    start, forwardTerminal, restored };
}

test('planner is default disabled; qualification records without native verifier do not admit work', () => {
  for (const options of [{ enabled: undefined }, { qualifications: [] }, { verifyEvidence: undefined }]) {
    const f = fixture(options);
    assert.throws(f.start, /disabled|context|provider/);
    assert.equal(f.ledger.journal().nextClaimId, 0);
  }
});

test('durable intents and both possible-dispatch phases remain distinguishable across restart', () => {
  const f = fixture();
  const snapshots = [f.start(), f.ledger.dispatchPossible(1), f.ledger.terminal(f.context(51), 1, f.forward),
    f.ledger.restoreIntent(f.context(51), f.restore), f.ledger.dispatchPossible(1),
    f.ledger.terminal(f.context(), 1, f.reverse)];
  assert.deepEqual(snapshots.map(j => j.active.phase),
    ['intent', 'forward_possible', 'forward_terminal', 'restore_intent', 'restore_possible', 'restore_terminal']);
  for (const snapshot of snapshots) {
    const restarted = new Ledger({ ...f.config, journal: snapshot });
    assert.equal(restarted.journal().active.phase, snapshot.active.phase);
    assert.equal(restarted.journal().active.held, true);
    assert.throws(() => restarted.begin(f.context(), f.approval, f.baseline), /held/);
    assert.throws(() => restarted.dispatchPossible(1), /unavailable/);
  }
});

test('closure preserves terminal frontier instead of an empty old-style ownership journal', () => {
  const f = fixture(); f.restored();
  const closed = f.ledger.close(f.context(), 1, f.closure);
  assert.equal(closed.active, null);
  assert.equal(closed.frontier.claimId, 1);
  assert.equal(closed.frontier.fieldRevision, 12);
  assert.equal(closed.frontier.restoreCommandId, 'reserve-1:restore');
  const legacy = new LegacyOwner();
  const claim = legacy.claim(f.target, 1, f.approval.operationId);
  legacy.complete(f.target.installationKey, claim);
  const old = legacy.journal();
  assert.equal(old.operations.length, 0);
  assert.equal(old.nextClaimId, 1);
  const recovered = new Ledger({ ...f.config, journal: old });
  assert.ok(recovered.journal().legacy, 'old deletion cannot be interpreted as qualified terminal closure');
  assert.throws(() => recovered.begin(f.context(), f.approval, f.baseline), /held/);
});

test('fresh qualified successor keeps native frontier and uses a new monotonic local command reference', () => {
  const f = fixture(); f.restored();
  const closed = f.ledger.close(f.context(), 1, f.closure);
  const recovered = new Ledger({ ...f.config, journal: closed });
  const next = recovered.begin(f.context(), { ...f.approval, claimId: 2, operationId: 'synthetic-next' },
    { ...f.baseline, fieldRevision: 12 });
  assert.equal(next.active.claimId, 2);
  assert.equal(next.active.forwardCommandId, 'reserve-2:forward');
  assert.equal(next.frontier.claimId, 1);
});

test('positive native terminal evidence can reconcile held restoration without replaying a writer', () => {
  const f = fixture(); f.restored();
  const recovered = new Ledger({ ...f.config, journal: f.ledger.journal() });
  assert.equal(recovered.journal().active.held, true);
  const result = recovered.close(f.context(), 1, f.closure);
  assert.equal(result.active, null);
  assert.equal(result.frontier.fieldRevision, 12);
});

test('manual references, ACKs, repeated revisions, wrong IDs and reordered phase evidence do not advance', () => {
  const f = fixture(); f.start();
  assert.throws(() => f.ledger.terminal(f.context(51), 1, f.forward), /phase/);
  f.ledger.dispatchPossible(1);
  const before = f.ledger.journal();
  for (const evidence of [
    { manuallyApproved: true, evidenceRef: 'synthetic-ref' },
    { ...f.forward, kind: 'ack', code: '0' },
    { ...f.forward, terminal: false },
    { ...f.forward, commandId: 'reserve-1:restore' },
    { ...f.forward, nativeEpoch: 'different' },
    { ...f.forward, fieldRevision: 10 },
    { ...f.forward, fieldRevision: NaN },
    { ...f.forward, reservePercent: 50 },
  ]) {
    assert.throws(() => f.ledger.terminal(f.context(51), 1, evidence), /evidence/);
    assert.deepEqual(f.ledger.journal(), before);
  }
  f.ledger.terminal(f.context(51), 1, f.forward);
  assert.throws(() => f.ledger.terminal(f.context(51), 1, f.forward), /phase/);
});

test('restoration needs separate exact approval; no dispatch retry, wrong claim or counter reuse', () => {
  const f = fixture(); f.forwardTerminal();
  for (const approval of [f.approval, { ...f.restore, reservePercent: 51 }, { ...f.restore, operationId: 'other' }]) {
    assert.throws(() => f.ledger.restoreIntent(f.context(51), approval), /approval/);
  }
  f.ledger.restoreIntent(f.context(51), f.restore);
  assert.throws(() => f.ledger.dispatchPossible(2), /unavailable/);
  f.ledger.dispatchPossible(1);
  assert.throws(() => f.ledger.dispatchPossible(1), /unavailable/);
  assert.throws(f.start, /held/);
});

test('cached, expired, disabled, unrelated or mismatching native context cannot qualify any phase', () => {
  const f = fixture(); f.start(); f.ledger.dispatchPossible(1);
  const good = f.context(51);
  for (const change of [
    { now: good.configuration.receivedAt + 5000 },
    { configuration: { ...good.configuration, source: 'cloud_latest' } },
    { configuration: { ...good.configuration, reserveEnabled: false } },
    { configuration: { ...good.configuration, companionSnapshotId: 'changed' } },
    { configuration: { ...good.configuration, reservePercent: 50 } },
    { target: { ...good.target, generation: 2 } },
    { target: { ...good.target, firmware: 'other' } },
    { authority: { ...good.authority, revision: 2 } },
    { authority: { ...good.authority, nativeAiCoordinated: false } },
  ]) assert.throws(() => f.ledger.terminal(f.context(51, change), 1, f.forward), /context/);
  assert.equal(f.ledger.journal().active.phase, 'forward_possible');
});

test('closure needs both command IDs and a qualified no-late barrier beyond restored revision', () => {
  const f = fixture(); f.restored();
  for (const change of [
    { kind: 'command_terminal' }, { forwardCommandId: 'other' }, { restoreCommandId: 'other' },
    { nativeEpoch: 'other' }, { terminal: false }, { terminalThroughRevision: 11 },
    { terminalThroughRevision: 13 }, { fieldRevision: 11 }, { reservePercent: 51 },
  ]) {
    assert.throws(() => f.ledger.close(f.context(), 1, { ...f.closure, ...change }), /barrier/);
    assert.ok(f.ledger.journal().active);
  }
  assert.throws(() => f.ledger.close(f.context(), 2, f.closure), /phase/);
});

test('old, changed-generation, changed-native-epoch and duplicate successor intents stay fenced', () => {
  const f = fixture(); f.restored();
  const closed = f.ledger.close(f.context(), 1, f.closure);
  for (const [context, approval, baseline] of [
    [f.context(), { ...f.approval, claimId: 2 }, { ...f.baseline, fieldRevision: 12 }],
    [f.context(), { ...f.approval, claimId: 2, operationId: 'next' }, f.baseline],
    [f.context(), { ...f.approval, claimId: 2, operationId: 'next' }, { ...f.baseline, nativeEpoch: 'new', fieldRevision: 12 }],
    [f.context(50, { target: { ...f.target, generation: 2 },
      configuration: { ...f.context().configuration, generation: 2 } }),
    { ...f.approval, claimId: 2, operationId: 'next' }, { ...f.baseline, fieldRevision: 12 }],
  ]) {
    const recovered = new Ledger({ ...f.config, journal: closed });
    assert.throws(() => recovered.begin(context, approval, baseline), /frontier/);
    assert.equal(recovered.journal().active, null);
  }
});

test('legacy nonempty obligations preserve every installation and cannot be manually laundered', () => {
  const f = fixture(); const old = new LegacyOwner();
  old.claim(f.target, 1, f.approval.operationId);
  old.claim({ ...f.target, targetKey: 'synthetic-second', installationKey: 'synthetic-other',
    commandTargetSn: 'SYNTHETIC_OTHER' }, 2, 'synthetic-second-operation');
  const recovered = new Ledger({ ...f.config, journal: old.journal() });
  assert.equal(recovered.journal().legacy.operations.length, 2);
  assert.ok(recovered.journal().legacy.operations.every(op => op.status === 'unknown'));
  assert.throws(() => recovered.begin(f.context(), f.approval, f.baseline), /held/);
  assert.deepEqual(new Ledger({ ...f.config, journal: recovered.journal() }).journal(), recovered.journal());
  const virgin = new Ledger({ ...f.config, journal: { version: 1, nextClaimId: 0, operations: [] } });
  assert.equal(virgin.begin(f.context(), f.approval, f.baseline).active.claimId, 1);
});

test('malformed, gapped and cross-installation journals are rejected instead of silently emptying', () => {
  const f = fixture(); f.restored(); const active = f.ledger.journal();
  const closed = f.ledger.close(f.context(), 1, f.closure);
  for (const bad of [
    null, {}, { ...active, version: 3 }, { ...active, installationKey: 'other' },
    { ...active, nextClaimId: 2 }, { ...closed, frontier: null },
    { ...active, active: { ...active.active, forwardRevision: null } },
    { ...active, active: { ...active.active, restoreRevision: 11 } },
    { ...active, active: { ...active.active, target: { ...active.active.target, installationKey: 'other' } } },
    { ...closed, frontier: { ...closed.frontier, restoreCommandId: 'wrong' } },
    { ...active, active: { ...active.active, held: 'false' } },
  ]) assert.throws(() => new Ledger({ ...f.config, journal: bad }), /journal|frontier|operation|installation/);
});

test('snapshot, provider arguments and qualification copies cannot alias or mutate ledger state', () => {
  let f;
  f = fixture({ verifyEvidence: (evidence, context) => {
    assert.ok(Object.isFrozen(evidence));
    assert.ok(Object.isFrozen(context.target));
    f.baseline.fieldRevision = 0;
    f.approval.operationId = 'mutated-original';
    return true;
  } });
  f.qualification.firmware = 'caller-mutated';
  const result = f.start();
  assert.equal(result.active.baselineRevision, 10);
  assert.equal(result.active.operationId, 'synthetic-pilot');
  assert.ok(Object.isFrozen(result.active.target));
  assert.throws(() => { result.active.target.generation = 100; }, TypeError);
});

test('provider failure or reentrant withdrawal cannot erase an obligation at closure', () => {
  for (const behavior of ['throw', 'deny', 'hold']) {
    let closing = false; let f;
    f = fixture({ verifyEvidence: () => {
      if (!closing) return true;
      if (behavior === 'throw') throw new Error('synthetic-native-provider-unavailable');
      if (behavior === 'hold') f.ledger.hold();
      return behavior !== 'deny';
    } });
    f.restored(); closing = true;
    assert.throws(() => f.ledger.close(f.context(), 1, f.closure), /provider|unqualified|withdrawn/);
    assert.ok(f.ledger.journal().active);
    assert.equal(f.ledger.journal().frontier, null);
  }
});

test('withdrawal during input serialization preserves hold and aborts restoration or closure', () => {
  for (const phase of ['restore', 'close']) {
    const f = fixture();
    if (phase === 'restore') f.forwardTerminal(); else f.restored();
    const supplied = { toJSON() { f.ledger.hold(); return f.context(phase === 'restore' ? 51 : 50); } };
    assert.throws(() => phase === 'restore'
      ? f.ledger.restoreIntent(supplied, f.restore) : f.ledger.close(supplied, 1, f.closure), /withdrawn/);
    assert.equal(f.ledger.journal().active.held, true);
    assert.equal(f.ledger.journal().active.phase, phase === 'restore' ? 'forward_terminal' : 'restore_terminal');
    assert.throws(() => f.ledger.dispatchPossible(1), /unavailable/);
  }
});

test('nested input admission cannot overwrite the first unresolved intent or create a journal gap', () => {
  const f = fixture();
  const supplied = { toJSON() {
    f.ledger.begin(f.context(), { ...f.approval, operationId: 'inner' }, f.baseline);
    return f.context();
  } };
  assert.throws(() => f.ledger.begin(supplied, f.approval, f.baseline), /validating/);
  assert.equal(f.ledger.journal().nextClaimId, 0);
  const started = f.start();
  assert.equal(started.active.claimId, 1);
  assert.equal(new Ledger({ ...f.config, journal: started }).journal().active.held, true);
});

test('consumed claim-bound approval cannot replay after another completed cycle and restart', () => {
  const f = fixture(); f.restored();
  f.ledger.close(f.context(), 1, f.closure);
  const second = { ...f.approval, claimId: 2, operationId: 'synthetic-second' };
  f.ledger.begin(f.context(), second, { ...f.baseline, fieldRevision: 12 });
  f.ledger.dispatchPossible(2);
  f.ledger.terminal(f.context(51), 2, { ...f.forward, commandId: 'reserve-2:forward', fieldRevision: 13 });
  f.ledger.restoreIntent(f.context(51), { ...second, restoreApproved: true, reservePercent: 50 });
  f.ledger.dispatchPossible(2);
  f.ledger.terminal(f.context(), 2, { ...f.reverse, commandId: 'reserve-2:restore', fieldRevision: 14 });
  const closed = f.ledger.close(f.context(), 2, { ...f.closure,
    forwardCommandId: 'reserve-2:forward', restoreCommandId: 'reserve-2:restore',
    fieldRevision: 14, terminalThroughRevision: 14 });
  const recovered = new Ledger({ ...f.config, journal: closed });
  assert.throws(() => recovered.begin(f.context(), f.approval, { ...f.baseline, fieldRevision: 14 }), /intent/);
  assert.equal(recovered.journal().active, null);
  assert.equal(recovered.journal().nextClaimId, 2);
});

test('unreachable duplicate active identity and regressed completed causal frontier cannot deserialize', () => {
  const f = fixture(); f.restored();
  const closed = f.ledger.close(f.context(), 1, f.closure);
  const next = f.ledger.begin(f.context(), { ...f.approval, claimId: 2, operationId: 'synthetic-second' },
    { ...f.baseline, fieldRevision: 12 });
  for (const bad of [
    { ...next, active: { ...next.active, operationId: closed.frontier.operationId } },
    { ...closed, frontier: { ...closed.frontier, fieldRevision: 0 } },
    { ...closed, frontier: { ...closed.frontier, forwardRevision: 10 } },
    { ...closed, frontier: { ...closed.frontier, restoreRevision: 11 } },
  ]) assert.throws(() => new Ledger({ ...f.config, journal: bad }), /frontier/);
});

test('cumulative native revision minimum cannot regress after multiple completed claims', () => {
  const f = fixture(); f.restored();
  const closed = f.ledger.close(f.context(), 1, f.closure);
  const impossible = { ...closed, nextClaimId: 2, frontier: { ...closed.frontier,
    claimId: 2, operationId: 'synthetic-second',
    forwardCommandId: 'reserve-2:forward', restoreCommandId: 'reserve-2:restore',
    baselineRevision: 0, forwardRevision: 1, restoreRevision: 2, fieldRevision: 2 } };
  assert.throws(() => new Ledger({ ...f.config, journal: impossible }), /frontier/);
  assert.throws(() => new Ledger({ ...f.config, journal: { ...impossible,
    nextClaimId: Number.MAX_SAFE_INTEGER, frontier: { ...impossible.frontier,
      claimId: Number.MAX_SAFE_INTEGER,
      forwardCommandId: `reserve-${Number.MAX_SAFE_INTEGER}:forward`,
      restoreCommandId: `reserve-${Number.MAX_SAFE_INTEGER}:restore`,
      baselineRevision: Number.MAX_SAFE_INTEGER - 2, forwardRevision: Number.MAX_SAFE_INTEGER - 1,
      restoreRevision: Number.MAX_SAFE_INTEGER, fieldRevision: Number.MAX_SAFE_INTEGER } } }), /frontier/);
});

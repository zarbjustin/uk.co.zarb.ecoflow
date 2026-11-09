'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000ControlEngine: Engine } = require('../.homeybuild/lib/stream5000ControlEngine');
const { Stream5000ControlLedger: Ledger } = require('../.homeybuild/lib/stream5000ControlLedger');

const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function laboratory(overrides = {}) {
  const target = {
    targetKey: 'synthetic-unit', installationKey: 'synthetic-installation',
    model: 'STREAM_5000_AC', firmware: 'synthetic-only', scope: 'system',
    routing: 'qualified_system_main', commandTargetSn: 'NOT_A_REAL_SERIAL', generation: 1,
  };
  const ledgerOptions = {
    installationKey: target.installationKey, enabled: true,
    qualifications: [{ ...target, action: 'backup_reserve_percent', source: 'official_native',
      evidenceRef: 'SYNTHETIC_NOT_NATIVE_PROOF', routingEvidenceRef: 'SYNTHETIC_NOT_SCOPE_PROOF' }],
    verifyEvidence: () => true,
  };
  let context = {
    now: 1000, nativeEpoch: 'synthetic-epoch', fieldRevision: 10, target,
    authority: { revision: 1, exclusive: true, nativeAiCoordinated: true },
    configuration: { source: 'official_native', generation: 1, commandTargetSn: target.commandTargetSn,
      receivedAt: 999, reserveEnabled: true, reservePercent: 50, companionSnapshotId: 'synthetic-companions' },
  };
  const events = [];
  let now = 1000;
  const binding = { valid: true };
  let row = { installationKey: target.installationKey, incarnation: 'synthetic-incarnation', revision: 0,
    journal: new Ledger(ledgerOptions).journal() };
  const hooks = {};
  const store = {
    async load() {
      await hooks.load?.();
      return clone(row);
    },
    async compareAndSwap(key, expected, journal, signal) {
      events.push(`cas:${journal.active?.phase || 'closed'}`);
      await hooks.before?.(journal, signal);
      assert.equal(key, row.installationKey);
      assert.equal(expected.incarnation, row.incarnation, 'synthetic CAS incarnation conflict');
      assert.equal(expected.revision, row.revision, 'synthetic CAS revision conflict');
      row = { installationKey: key, incarnation: row.incarnation, revision: expected.revision + 1, journal: clone(journal) };
      await hooks.after?.(journal, signal);
      return clone(row);
    },
  };
  const options = { ...ledgerOptions, store, readContext: () => context, now: () => now,
    bindingsQualified: () => binding.valid,
    dispatch: async request => { events.push(`dispatch:${request.commandId}`); await hooks.dispatch?.(request); },
    ...overrides };
  const engine = new Engine(options);
  const approval = { claimId: 1, operationId: 'synthetic-pilot', forwardApproved: true, restoreApproved: false, reservePercent: 51 };
  const restore = { ...approval, forwardApproved: false, restoreApproved: true, reservePercent: 50 };
  const baseline = { kind: 'baseline', nativeEpoch: 'synthetic-epoch', fieldRevision: 10, reservePercent: 50 };
  const forward = { kind: 'command_terminal', nativeEpoch: 'synthetic-epoch', fieldRevision: 11,
    reservePercent: 51, commandId: 'reserve-1:forward', terminal: true };
  const reverse = { ...forward, fieldRevision: 12, reservePercent: 50, commandId: 'reserve-1:restore' };
  const closure = { kind: 'closure', nativeEpoch: 'synthetic-epoch', fieldRevision: 12,
    reservePercent: 50, terminal: true, terminalThroughRevision: 12,
    forwardCommandId: forward.commandId, restoreCommandId: reverse.commandId };
  const fresh = percent => { context = { ...context, fieldRevision: percent === 51 ? 11 : 12,
    configuration: { ...context.configuration, reservePercent: percent } }; };
  return { engine, options, hooks, events, approval, restore, baseline, forward, reverse, closure,
    binding, advance: value => { now = value; },
    row: () => clone(row), setRow: value => { row = value; }, context: () => context,
    change: value => { context = value; }, fresh,
    begin: async () => { await engine.open(); await engine.begin(approval, baseline); },
    forwardTerminal: async () => { await engine.open(); await engine.begin(approval, baseline);
      await engine.dispatch(1); fresh(51); await engine.terminal(1, forward); },
  };
}

test('engine is disabled without explicit qualified binding and does not persist or dispatch', async () => {
  for (const overrides of [{ enabled: undefined }, { bindingsQualified: undefined }, { dispatch: undefined }]) {
    const f = laboratory(overrides);
    await f.engine.open();
    await assert.rejects(f.engine.begin(f.approval, f.baseline), /disabled|unqualified/);
    assert.deepEqual(f.events, []);
    assert.equal(f.row().revision, 0);
  }
});

test('intent and possible dispatch are committed before native invocation; ACK never advances terminal phase', async () => {
  const f = laboratory();
  await f.begin();
  const gate = deferred(); f.hooks.before = () => gate.promise;
  const pending = f.engine.dispatch(1);
  assert.deepEqual(f.events, ['cas:intent', 'cas:forward_possible']);
  assert.equal(f.engine.snapshot().durableJournal.active.phase, 'intent');
  gate.resolve(); const completed = await pending;
  assert.equal(completed.busy, false);
  assert.deepEqual(f.events, ['cas:intent', 'cas:forward_possible', 'dispatch:reserve-1:forward']);
  assert.equal(f.row().journal.active.phase, 'forward_possible');
});

test('complete forward/restoration and durable closure precede a new claim', async () => {
  const f = laboratory(); await f.forwardTerminal();
  await f.engine.restore(f.restore); await f.engine.dispatch(1);
  f.fresh(50); await f.engine.terminal(1, f.reverse);
  const gate = deferred(); f.hooks.before = journal => journal.active ? undefined : gate.promise;
  const closing = f.engine.close(1, f.closure);
  await assert.rejects(f.engine.begin({ ...f.approval, claimId: 2 }, f.baseline), /busy/);
  assert.equal(f.row().journal.active.phase, 'restore_terminal');
  gate.resolve(); await closing;
  await f.engine.begin({ ...f.approval, claimId: 2, operationId: 'synthetic-next' }, { ...f.baseline, fieldRevision: 12 });
  assert.equal(f.row().journal.active.claimId, 2);
  assert.equal(f.row().journal.frontier.claimId, 1);
});

test('ambiguous commit retains quarantine and restart holds the actually committed phase without replay', async () => {
  const f = laboratory(); await f.begin();
  f.hooks.after = () => { throw new Error('synthetic acknowledgement lost after commit'); };
  await assert.rejects(f.engine.dispatch(1), /acknowledgement lost/);
  assert.equal(f.engine.snapshot().held, true);
  assert.equal(f.engine.snapshot().storageUncertain, true);
  assert.equal(f.row().journal.active.phase, 'forward_possible');
  assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
  f.hooks.after = undefined;
  const restarted = new Engine(f.options); await restarted.open();
  await assert.rejects(restarted.dispatch(1), /unavailable/);
  assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
});

test('failed intent commit cannot leave its in-memory draft dispatchable', async () => {
  const f = laboratory(); await f.engine.open();
  f.hooks.before = () => { throw new Error('synthetic disk failure'); };
  await assert.rejects(f.engine.begin(f.approval, f.baseline), /disk failure/);
  assert.equal(f.row().journal.active, null);
  await assert.rejects(f.engine.dispatch(1), /held/);
  assert.equal(f.engine.snapshot().durableJournal.active, null);
});

test('field expiry, authority, generation and companion changes across CAS suppress dispatch', async () => {
  for (const change of [
    c => ({ ...c, now: c.configuration.receivedAt + 5000 }),
    c => ({ ...c, authority: { ...c.authority, revision: 2 } }),
    c => ({ ...c, target: { ...c.target, generation: 2 } }),
    c => ({ ...c, configuration: { ...c.configuration, companionSnapshotId: 'other-companions' } }),
    c => ({ ...c, fieldRevision: c.fieldRevision + 1 }),
    c => ({ ...c, nativeEpoch: 'other-native-epoch' }),
  ]) {
    const f = laboratory(); await f.begin();
    f.hooks.after = () => {
      const next = change(f.context());
      if (next.now !== f.context().now) f.advance(next.now);
      else f.change(next);
    };
    await assert.rejects(f.engine.dispatch(1), /changed|expired/);
    assert.equal(f.row().journal.active.phase, 'forward_possible');
    assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
    assert.equal(f.engine.snapshot().held, true);
  }
});

test('clock rollback or invalid time across CAS retains the claim without dispatch', async () => {
  for (const reversed of [1000, NaN, Infinity, -1]) {
    const f = laboratory(); await f.begin();
    f.advance(4000);
    f.hooks.after = () => f.advance(reversed);
    await assert.rejects(f.engine.dispatch(1), /clock.*invalid|clock.*reversed/i);
    assert.equal(f.row().journal.active.phase, 'forward_possible');
    assert.equal(f.engine.snapshot().held, true);
    assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
  }
});

test('shutdown releases caller waiting for never-resolving CAS; late commit cannot dispatch', async () => {
  const f = laboratory(); await f.begin();
  const gate = deferred(); f.hooks.before = () => gate.promise;
  const pending = f.engine.dispatch(1); f.engine.stop();
  await assert.rejects(pending, /withdrawn|held/);
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.row().journal.active.phase, 'forward_possible');
  assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
  assert.equal(f.engine.snapshot().held, true);
});

test('shutdown during native IO retains possible ownership and never restores or retries', async () => {
  const f = laboratory(); await f.begin();
  const entered = deferred(); const gate = deferred();
  f.hooks.dispatch = () => { entered.resolve(); return gate.promise; };
  const pending = f.engine.dispatch(1); await entered.promise;
  f.engine.stop(); await assert.rejects(pending, /withdrawn/);
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.row().journal.active.phase, 'forward_possible');
  assert.equal(f.events.filter(value => value.startsWith('dispatch:')).length, 1);
  await assert.rejects(f.engine.restore(f.restore), /held/);
});

test('two aliases cannot both durably claim the same installation at one revision', async () => {
  const f = laboratory(); const second = new Engine(f.options);
  await Promise.all([f.engine.open(), second.open()]);
  await f.engine.begin(f.approval, f.baseline);
  await assert.rejects(second.begin(f.approval, f.baseline), /revision conflict/);
  assert.equal(second.snapshot().held, true);
  assert.equal(f.row().journal.nextClaimId, 1);
  assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
});

test('store mismatch and revision exhaustion fail closed rather than dispatching an advanced draft', async () => {
  for (const kind of ['mismatch', 'exhaustion']) {
    const f = laboratory();
    if (kind === 'exhaustion') f.setRow({ ...f.row(), revision: Number.MAX_SAFE_INTEGER });
    else {
      f.hooks.after = () => f.setRow({ ...f.row(), revision: f.row().revision + 1 });
    }
    await f.engine.open();
    await assert.rejects(f.engine.begin(f.approval, f.baseline), /mismatch|exhausted/);
    assert.equal(f.engine.snapshot().held, true);
    assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
  }
});

test('binding revocation or shutdown from synchronous dispatch preparation cannot invoke a native port', async () => {
  for (const kind of ['qualification', 'context']) {
    const f = laboratory(); await f.begin();
    f.hooks.after = () => {
      if (kind === 'qualification') f.binding.valid = false;
      else f.engine.stop();
    };
    await assert.rejects(f.engine.dispatch(1), /withdrawn|held|unqualified/);
    assert.equal(f.events.some(value => value.startsWith('dispatch:')), false);
  }
});

test('serialization withdrawal and concurrent reentry cannot commit or erase another operation', async () => {
  const f = laboratory(); await f.engine.open();
  const approval = { ...f.approval, toJSON() { f.engine.stop(); return f.approval; } };
  await assert.rejects(f.engine.begin(approval, f.baseline), /withdrawn|held/);
  assert.equal(f.row().journal.active, null);
  assert.deepEqual(f.events, []);
});

test('restart may close proven terminal restoration but never dispatches a recovered phase', async () => {
  const f = laboratory(); await f.forwardTerminal();
  await f.engine.restore(f.restore); await f.engine.dispatch(1); f.fresh(50);
  await f.engine.terminal(1, f.reverse);
  const restarted = new Engine(f.options); await restarted.open();
  await restarted.close(1, f.closure);
  assert.equal(f.row().journal.active, null);
  assert.equal(f.row().journal.frontier.claimId, 1);
});

test('closure context drift cannot report usable idle execution after a committed frontier', async () => {
  const f = laboratory(); await f.forwardTerminal();
  await f.engine.restore(f.restore); await f.engine.dispatch(1); f.fresh(50);
  await f.engine.terminal(1, f.reverse);
  f.hooks.after = () => f.change({ ...f.context(), authority: { ...f.context().authority, revision: 2 } });
  await assert.rejects(f.engine.close(1, f.closure), /changed/);
  assert.equal(f.row().journal.active, null);
  assert.equal(f.row().journal.frontier.claimId, 1);
  assert.equal(f.engine.snapshot().held, true);
  await assert.rejects(f.engine.begin({ ...f.approval, claimId: 2 }, f.baseline), /held/);
});

test('newer current closure observation succeeds in active and recovered engines', async () => {
  for (const recovered of [false, true]) {
    const f = laboratory(); await f.forwardTerminal();
    await f.engine.restore(f.restore); await f.engine.dispatch(1); f.fresh(50);
    await f.engine.terminal(1, f.reverse);
    const engine = recovered ? new Engine(f.options) : f.engine;
    if (recovered) await engine.open();
    f.change({ ...f.context(), fieldRevision: 13 });
    const result = await engine.close(1, { ...f.closure, fieldRevision: 13, terminalThroughRevision: 13 });
    assert.equal(result.held, false);
    assert.equal(result.busy, false);
    assert.equal(result.durableJournal.active, null);
    assert.equal(result.durableJournal.frontier.fieldRevision, 13);
    await engine.begin({ ...f.approval, claimId: 2, operationId: 'synthetic-next' }, { ...f.baseline, fieldRevision: 13 });
    assert.equal(f.row().journal.active.claimId, 2);
  }
});

test('revision drift beyond a committed newer closure still holds the engine', async () => {
  const f = laboratory(); await f.forwardTerminal();
  await f.engine.restore(f.restore); await f.engine.dispatch(1); f.fresh(50);
  await f.engine.terminal(1, f.reverse);
  f.change({ ...f.context(), fieldRevision: 13 });
  f.hooks.after = () => f.change({ ...f.context(), fieldRevision: 14 });
  await assert.rejects(f.engine.close(1, { ...f.closure, fieldRevision: 13, terminalThroughRevision: 13 }), /changed/);
  assert.equal(f.engine.snapshot().durableJournal.frontier.fieldRevision, 13);
  assert.equal(f.engine.snapshot().storageUncertain, false);
  assert.equal(f.engine.snapshot().held, true);
  await assert.rejects(f.engine.begin({ ...f.approval, claimId: 2 }, { ...f.baseline, fieldRevision: 14 }), /held/);
});

test('namespace incarnation mismatch does not bless a commit or reset revision ownership', async () => {
  const f = laboratory(); await f.engine.open();
  f.hooks.after = () => f.setRow({ ...f.row(), incarnation: 'other-incarnation' });
  await assert.rejects(f.engine.begin(f.approval, f.baseline), /mismatch/);
  assert.equal(f.engine.snapshot().storageUncertain, true);
  assert.equal(f.engine.snapshot().held, true);
});

test('delete/recreate with the same revision cannot accept an old-incarnation write', async () => {
  const f = laboratory(); await f.engine.open();
  f.setRow({ ...f.row(), incarnation: 'synthetic-new-namespace' });
  await assert.rejects(f.engine.begin(f.approval, f.baseline), /incarnation conflict/);
  assert.equal(f.row().journal.active, null);
});

test('mismatching own-field evidence emits no terminal storage transition', async () => {
  const f = laboratory(); await f.begin(); await f.engine.dispatch(1); f.fresh(51);
  await assert.rejects(f.engine.terminal(1, { ...f.forward, fieldRevision: 12 }), /own-field/);
  assert.equal(f.row().journal.active.phase, 'forward_possible');
  assert.equal(f.events.includes('cas:forward_terminal'), false);
});

test('shutdown interrupts a hung startup read and late completion cannot initialize or admit work', async () => {
  const f = laboratory(); const gate = deferred();
  f.hooks.load = () => gate.promise;
  const pending = f.engine.open(); f.engine.stop();
  await assert.rejects(pending, /withdrawn/);
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.engine.snapshot().opened, false);
  assert.equal(f.engine.snapshot().storageUncertain, true);
  await assert.rejects(f.engine.begin(f.approval, f.baseline), /held/);
  assert.deepEqual(f.events, []);
});

test('synchronous native invocation failure retains possible ownership with no inverse or retry', async () => {
  const f = laboratory(); let invocations = 0;
  const engine = new Engine({ ...f.options, dispatch: () => { invocations += 1; throw new Error('synthetic send outcome unknown'); } });
  await engine.open(); await engine.begin(f.approval, f.baseline);
  await assert.rejects(engine.dispatch(1), /outcome unknown/);
  assert.equal(f.row().journal.active.phase, 'forward_possible');
  assert.equal(invocations, 1);
  await assert.rejects(engine.dispatch(1), /held/);
  await assert.rejects(engine.restore(f.restore), /held/);
  assert.equal(invocations, 1);
});

test('lost closure acknowledgement cannot admit a local successor from the cleared draft', async () => {
  const f = laboratory(); await f.forwardTerminal();
  await f.engine.restore(f.restore); await f.engine.dispatch(1); f.fresh(50);
  await f.engine.terminal(1, f.reverse);
  f.hooks.after = journal => { if (!journal.active) throw new Error('synthetic closure acknowledgement lost'); };
  await assert.rejects(f.engine.close(1, f.closure), /acknowledgement lost/);
  assert.equal(f.row().journal.active, null);
  assert.equal(f.engine.snapshot().durableJournal.active.phase, 'restore_terminal');
  assert.equal(f.engine.snapshot().storageUncertain, true);
  await assert.rejects(f.engine.begin({ ...f.approval, claimId: 2 }, f.baseline), /held/);
  f.hooks.after = undefined;
  const restarted = new Engine(f.options); await restarted.open();
  await restarted.begin({ ...f.approval, claimId: 2, operationId: 'synthetic-next' }, { ...f.baseline, fieldRevision: 12 });
  assert.equal(f.row().journal.active.claimId, 2);
});

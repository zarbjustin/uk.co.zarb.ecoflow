'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000ReserveRuntime: Runtime } = require(
  process.env.STREAM_5000_RESERVE_RUNTIME_BUILD || '../.homeybuild/lib/stream5000ReserveRuntime',
);

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

function fakeClock() {
  let now = 1000; let sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(callback, milliseconds) {
      const id = ++sequence;
      timers.set(id, { at: now + milliseconds, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    tick(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) timer.callback();
      }
    },
    timers,
  };
}

function fixture(options = {}) {
  const clock = fakeClock();
  const target = {
    targetKey: 'synthetic-unit', installationKey: 'synthetic-installation',
    model: 'STREAM_5000_AC', firmware: 'synthetic-unqualified-firmware',
    scope: 'unit', routing: 'qualified_unit', commandTargetSn: 'ES22SYNTHETIC', generation: 1,
  };
  const qualification = {
    ...target, action: 'backup_reserve_percent', source: 'official_native',
    evidenceRef: 'synthetic-only-not-native-authority',
    routingEvidenceRef: 'synthetic-only-not-real-action-scope',
  };
  const state = {
    reservePercent: 50, reserveEnabled: true, receivedAt: clock.now(), revision: 1,
    nativeAiCoordinated: true, companions: 'synthetic-companions',
  };
  const events = []; const signals = [];
  let revision = 0;
  let journal = { version: 1, nextClaimId: 0, operations: [] };
  const makeStore = () => ({
    async load(signal) { events.push('load'); signals.push(signal); return { revision, journal: structuredClone(journal) }; },
    async compareAndSwap(expected, next, signal) {
      events.push('CAS'); signals.push(signal);
      assert.equal(expected, revision);
      journal = structuredClone(next); revision++;
      return revision;
    },
  });
  const store = makeStore();
  const readContext = async (_targetKey, signal) => {
    events.push('context'); signals.push(signal);
    return {
      now: clock.now(), target: { ...target },
      authority: { revision: state.revision, exclusive: true, nativeAiCoordinated: state.nativeAiCoordinated },
      configuration: {
        source: 'official_native', generation: target.generation, commandTargetSn: target.commandTargetSn,
        receivedAt: state.receivedAt, reserveEnabled: state.reserveEnabled, reservePercent: state.reservePercent,
        companionSnapshotId: state.companions,
      },
    };
  };
  const transport = {
    async set(payload, request) {
      events.push(`PUT:${payload.params.bpBackupConfig.backupSoc}`); signals.push(request.signal);
      assert.equal(payload.params.bpBackupConfig.backupSocOnOff, undefined);
      assert.ok(request.timeoutMs > 0 && request.timeoutMs <= 15000);
      clock.tick(1);
      state.receivedAt = clock.now();
      state.reservePercent = payload.params.bpBackupConfig.backupSoc;
      return { code: '0', data: {} };
    },
    async get(sn, quotas, request) {
      events.push('GET'); signals.push(request.signal);
      assert.equal(sn, target.commandTargetSn);
      assert.deepEqual(quotas, ['bpBackupConfig-backupSocOnOff', 'bpBackupConfig-backupSoc']);
      assert.ok(request.timeoutMs > 0 && request.timeoutMs <= 15000);
      return {
        code: '0',
        data: { 'bpBackupConfig-backupSocOnOff': state.reserveEnabled, 'bpBackupConfig-backupSoc': state.reservePercent },
      };
    },
  };
  const contextProvider = { read: readContext };
  const config = {
    enabled: true, installationKey: target.installationKey, qualifications: [qualification],
    readContext: (...args) => contextProvider.read(...args), transport, journal: store, clock, ...options,
  };
  const runtime = new Runtime(config);
  const approval = { operationId: 'synthetic-operation', forwardApproved: true, restoreApproved: true, reservePercent: 51 };
  const restore = { operationId: approval.operationId, restoreApproved: true, reservePercent: 50 };
  return {
    runtime, config, target, qualification, state, events, signals, clock, store, transport, readContext, approval, restore,
    contextProvider, makeStore, stored: () => structuredClone(journal),
    forward: () => runtime.execute(target.targetKey, approval),
  };
}

async function assertRestartHeld(f) {
  const recovered = new Runtime({ ...f.config, journal: f.makeStore(), readContext: f.readContext });
  assert.equal(await recovered.initialize(), 'unknown');
  assert.equal(f.stored().operations.length, 1);
  assert.equal(f.stored().operations[0].status, 'unknown');
  assert.equal(recovered.storageBlocked, false, 'recovery uses durable state, not an adapter-identity fence');
  await assert.rejects(recovered.execute(f.target.targetKey, f.approval), /held/);
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51', 'PUT:50']);
  assert.equal(f.clock.timers.size, 0);
}

test('default disabled makes zero dependency calls; empty qualification is not permission', async () => {
  const f = fixture({ enabled: undefined });
  await assert.rejects(f.runtime.initialize(), /disabled/);
  await assert.rejects(f.forward(), /disabled/);
  assert.deepEqual(f.events, []);
  const unqualified = fixture({ qualifications: [] });
  await assert.rejects(unqualified.runtime.initialize(), /unbound/);
  assert.equal(unqualified.runtime.status, 'unknown');
  assert.deepEqual(unqualified.events, []);
});

test('qualification registry is snapshotted; conflicting installation and native alias mappings reject', async () => {
  const f = fixture();
  f.qualification.firmware = 'caller-mutated';
  await f.runtime.initialize();
  await f.forward();
  f.runtime.shutdown();
  const g = fixture();
  for (const change of [{ installationKey: 'other' }, { firmware: 'conflicting' }]) {
    assert.throws(() => new Runtime({
      ...g.config, qualifications: [g.qualification, { ...g.qualification, ...change }],
    }), /Conflicting/);
  }
});

test('initialized v1 journal is mandatory; restored active and unknown records block every alias without replay', async () => {
  for (const journal of [undefined, null, {}, { version: 2 }, { version: 1, nextClaimId: 0, operations: 'bad' }]) {
    const f = fixture();
    f.store.load = async () => ({ revision: 0, journal });
    await assert.rejects(f.runtime.initialize());
    assert.equal(f.runtime.status, 'unknown');
    assert.equal(f.events.includes('CAS'), false);
  }
  for (const status of ['active', 'unknown']) {
    const f = fixture();
    f.store.load = async () => ({
      revision: 1, journal: {
        version: 1, nextClaimId: 1,
        operations: [{ claimId: 1, operationId: 'interrupted', target: f.target, authorityRevision: 1, status }],
      },
    });
    assert.equal(await f.runtime.initialize(), 'unknown');
    await assert.rejects(f.runtime.execute('synthetic-other-alias', f.approval), /held/);
    assert.equal(f.events.some(event => event.startsWith('PUT')), false);
  }
});

test('hanging load has an owned exact deadline and aborts without initializing admission', async () => {
  const f = fixture(); let signal;
  f.store.load = (value) => { signal = value; return new Promise(() => {}); };
  const pending = f.runtime.initialize();
  const rejected = assert.rejects(pending, /deadline/);
  f.clock.tick(4999); await flush();
  assert.equal(f.runtime.status, 'initializing');
  f.clock.tick(1); await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(f.runtime.storageBlocked, true);
  assert.equal(f.clock.timers.size, 0);
});

test('hanging authoritative preflight settles at five seconds with no journal mutation or transport', async () => {
  const f = fixture(); let signal;
  const runtime = new Runtime({
    ...f.config,
    readContext: (_targetKey, value) => { signal = value; return new Promise(() => {}); },
  });
  await runtime.initialize();
  const pending = runtime.execute(f.target.targetKey, f.approval);
  const rejected = assert.rejects(pending, /deadline/);
  f.clock.tick(5000); await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(runtime.status, 'unknown');
  assert.deepEqual(f.events, ['load']);
  assert.equal(f.clock.timers.size, 0);
});

test('runtime reserves synchronously and awaits durable unknown intent before exactly one PUT', async () => {
  const f = fixture(); const commit = deferred(); let proposed;
  await f.runtime.initialize();
  const original = f.store.compareAndSwap;
  f.store.compareAndSwap = async (expected, journal, signal) => {
    proposed = journal;
    await commit.promise;
    return original(expected, journal, signal);
  };
  const pending = f.forward(); await flush();
  await assert.rejects(f.forward(), /busy/);
  assert.equal(proposed.operations[0].status, 'unknown');
  assert.equal(Object.isFrozen(proposed.operations), true);
  assert.equal(f.events.some(event => event.startsWith('PUT')), false);
  commit.resolve();
  const result = await pending;
  assert.equal(result.status, 'observing');
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51']);
  assert.ok(f.events.indexOf('CAS') < f.events.indexOf('PUT:51'));
  assert.equal(f.stored().operations[0].status, 'unknown');
  f.runtime.shutdown();
});

test('rejected, conflicting and hanging CAS never dispatch and leave a global runtime storage fence', async () => {
  for (const mode of ['reject', 'conflict', 'hang']) {
    const f = fixture(); let signal; const late = deferred();
    await f.runtime.initialize();
    f.store.compareAndSwap = (_expected, _journal, value) => {
      signal = value;
      if (mode === 'reject') return Promise.reject(new Error('store rejected'));
      if (mode === 'conflict') return Promise.resolve(0);
      return late.promise;
    };
    const pending = f.forward();
    const rejected = assert.rejects(pending);
    await flush();
    if (mode === 'hang') { f.clock.tick(5000); await rejected; late.resolve(1); await flush(); }
    else await rejected;
    assert.equal(f.runtime.status, 'unknown');
    assert.equal(f.runtime.storageBlocked, true);
    if (mode === 'hang') assert.equal(signal.aborted, true);
    assert.equal(f.events.some(event => event.startsWith('PUT')), false);
    await assert.rejects(f.forward(), /held/);
    const replacement = new Runtime(f.config);
    await assert.rejects(replacement.initialize(), /fenced/);
    assert.equal(replacement.storageBlocked, true);
  }
});

test('authority drift after CAS prevents PUT while the durable intent remains held', async () => {
  const f = fixture(); const original = f.store.compareAndSwap;
  await f.runtime.initialize();
  f.store.compareAndSwap = async (...args) => {
    f.state.revision++;
    return original(...args);
  };
  await assert.rejects(f.forward(), /drift/);
  assert.equal(f.stored().operations.length, 1);
  assert.equal(f.events.some(event => event.startsWith('PUT')), false);
});

test('caller-owned context and approval mutations during persistence cannot rewrite the captured operation', async () => {
  const f = fixture(); const initial = await f.readContext(f.target.targetKey, new AbortController().signal);
  const original = f.store.compareAndSwap;
  let reads = 0;
  const runtime = new Runtime({
    ...f.config,
    readContext: (...args) => (++reads === 1 ? Promise.resolve(initial) : f.readContext(...args)),
  });
  await runtime.initialize();
  f.store.compareAndSwap = async (...args) => {
    initial.target.generation = 42;
    initial.authority.revision = 42;
    initial.configuration.companionSnapshotId = 'caller-mutated';
    f.approval.operationId = 'caller-mutated';
    f.approval.reservePercent = 100;
    return original(...args);
  };
  const result = await runtime.execute(f.target.targetKey, f.approval);
  assert.equal(result.operationId, 'synthetic-operation');
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51']);
  assert.equal(f.stored().operations[0].target.generation, 1);
  runtime.shutdown();
});

test('real baseline other than enabled native 50 and missing firmware evidence never reach persistence', async () => {
  for (const change of ['percent', 'switch', 'firmware']) {
    const f = fixture(); await f.runtime.initialize();
    if (change === 'percent') f.state.reservePercent = 49;
    else if (change === 'switch') f.state.reserveEnabled = false;
    else f.target.firmware = '';
    await assert.rejects(f.forward(), /baseline|qualification/);
    assert.equal(f.events.includes('CAS'), false);
    assert.equal(f.events.some(event => event.startsWith('PUT')), false);
  }
});

test('never-resolving ACK rejects at exact 10 seconds, aborts and ignores a late success without readback', async () => {
  const f = fixture(); const ack = deferred(); let signal;
  await f.runtime.initialize();
  f.transport.set = (_payload, options) => { f.events.push('PUT:51'); signal = options.signal; return ack.promise; };
  const pending = f.forward();
  const rejected = assert.rejects(pending, /deadline/);
  await flush();
  f.clock.tick(9999); await flush();
  assert.equal(f.runtime.status, 'awaiting_ack');
  f.clock.tick(1); await rejected;
  assert.equal(signal.aborted, true);
  ack.resolve({ code: '0', data: {} }); await flush();
  assert.equal(f.runtime.status, 'unknown');
  assert.equal(f.events.includes('GET'), false);
  assert.equal(f.stored().operations.length, 1);
  assert.equal(f.clock.timers.size, 0);
});

test('never-resolving selective query has its own exact 30-second budget and no resend', async () => {
  const f = fixture(); const query = deferred(); let signal;
  await f.runtime.initialize();
  f.transport.get = (_sn, _quotas, options) => { f.events.push('GET'); signal = options.signal; return query.promise; };
  const pending = f.forward(); const rejected = assert.rejects(pending, /deadline/);
  await flush();
  f.clock.tick(29999); await flush();
  assert.equal(f.runtime.status, 'awaiting_configuration');
  f.clock.tick(1); await rejected;
  assert.equal(signal.aborted, true);
  query.resolve({ code: '0', data: {} }); await flush();
  assert.equal(f.runtime.status, 'unknown');
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51']);
  assert.equal(f.stored().operations.length, 1);
});

test('strict ACK precedes the independent selective query even in the same millisecond', async () => {
  const f = fixture(); await f.runtime.initialize();
  const ack = deferred(); const original = f.transport.set;
  f.transport.set = async (...args) => { const result = await original(...args); await ack.promise; return result; };
  const pending = f.forward(); await flush();
  assert.equal(f.events.includes('GET'), false);
  const atAck = f.clock.now();
  ack.resolve();
  const result = await pending;
  assert.equal(f.clock.now(), atAck);
  assert.equal(result.queryId, 'reserve-query-1');
  assert.equal(result.status, 'observing');
  f.runtime.shutdown();
});

test('numeric ACK, negative ACK, echoed or partial readback do not produce configuration acceptance', async () => {
  for (const mode of ['numeric', 'negative', 'echo', 'partial']) {
    const f = fixture(); await f.runtime.initialize();
    if (mode === 'numeric' || mode === 'negative') {
      f.transport.set = async () => ({ code: mode === 'numeric' ? 0 : '1', data: {} });
    } else {
      f.transport.get = async () => ({
        code: '0', data: mode === 'echo' ? { bpBackupConfig: { backupSoc: 51 } }
          : { 'bpBackupConfig-backupSoc': 51 },
      });
    }
    await assert.rejects(f.forward(), /ACK|configuration/);
    assert.equal(f.runtime.status, 'unknown');
    assert.equal(f.stored().operations.length, 1);
    if (mode === 'numeric' || mode === 'negative') assert.equal(f.events.includes('GET'), false);
  }
});

test('explicit withdrawal and shutdown abort owned callbacks; late completions never clear ownership', async () => {
  for (const method of ['revoke', 'shutdown']) {
    const f = fixture(); const ack = deferred(); let signal;
    await f.runtime.initialize();
    f.transport.set = (_payload, options) => { signal = options.signal; return ack.promise; };
    const pending = f.forward(); const rejected = assert.rejects(pending, /withdrawn|stopped/);
    await flush();
    f.runtime[method](); await rejected;
    ack.resolve({ code: '0', data: {} }); await flush();
    assert.equal(signal.aborted, true);
    assert.equal(f.runtime.status, method === 'shutdown' ? 'stopped' : 'unknown');
    assert.equal(f.events.includes('GET'), false);
    assert.equal(f.stored().operations.length, 1);
  }
});

test('explicit authoritative observations catch same-receipt contradictions and authority withdrawal', async () => {
  for (const mode of ['same-receipt', 'authority']) {
    const f = fixture(); await f.runtime.initialize(); await f.forward();
    if (mode === 'same-receipt') f.state.reservePercent = 50;
    else f.state.nativeAiCoordinated = false;
    await assert.rejects(f.runtime.revalidate(), /drift|qualification/);
    assert.equal(f.runtime.status, 'unknown');
    await assert.rejects(f.runtime.restore(f.restore), /unavailable/);
    assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51']);
  }
});

test('configuration acceptance is not physical success and 120-second observation expiry never restores', async () => {
  const f = fixture(); await f.runtime.initialize();
  const result = await f.forward();
  assert.equal(result.status, 'observing');
  f.clock.tick(119999);
  assert.equal(f.runtime.status, 'observing');
  f.clock.tick(1);
  assert.equal(f.runtime.status, 'unknown');
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51']);
  assert.equal(f.stored().operations.length, 1);
});

test('restoration requires distinct approval, a new intent CAS, exact ACK and post-ACK readback', async () => {
  const f = fixture(); await f.runtime.initialize(); await f.forward();
  for (const approval of [undefined, { ...f.restore, restoreApproved: false }, { ...f.restore, operationId: 'other' }]) {
    await assert.rejects(f.runtime.restore(approval), /approval/);
  }
  const result = await f.runtime.restore(f.restore);
  assert.equal(result.status, 'restored');
  assert.equal(result.recoveryObligation, 'held');
  assert.equal(f.runtime.storageBlocked, false, 'healthy storage does not remove the recovery obligation');
  assert.equal(result.operationId, `${f.approval.operationId}:restore`);
  assert.equal(result.queryId, 'reserve-query-2');
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51', 'PUT:50']);
  assert.equal(f.events.filter(event => event === 'CAS').length, 3);
  await assertRestartHeld(f);
  assert.equal(f.clock.timers.size, 0);
  await assert.rejects(f.forward(), /held/, 'confirmed restoration retains its durable recovery obligation');
});

test('restoration finalization checkpoint failure stays sticky without releasing its recovery claim', async () => {
  const f = fixture(); await f.runtime.initialize(); await f.forward();
  const original = f.store.compareAndSwap;
  f.store.compareAndSwap = async (expected, journal, signal) => {
    if (expected === 2) throw new Error('completion persistence failed');
    return original(expected, journal, signal);
  };
  await assert.rejects(f.runtime.restore(f.restore), /persistence/);
  assert.equal(f.runtime.status, 'unknown');
  assert.equal(f.runtime.storageBlocked, true);
  assert.equal(f.stored().operations.length, 1);
  await assertRestartHeld(f);
  await assert.rejects(f.forward(), /held/);
  await assert.rejects(f.runtime.restore(f.restore), /unavailable/);
});

test('late finalization CAS acknowledgement after an honest durable commit cannot reopen restart admission', async () => {
  const f = fixture(); const completion = deferred(); let signal;
  await f.runtime.initialize(); await f.forward();
  const original = f.store.compareAndSwap;
  f.store.compareAndSwap = async (expected, journal, value) => {
    if (expected === 2) {
      signal = value;
      const revision = await original(expected, journal, value);
      await completion.promise;
      return revision;
    }
    return original(expected, journal, value);
  };
  const pending = f.runtime.restore(f.restore);
  const rejected = assert.rejects(pending, /deadline/);
  await flush();
  f.clock.tick(5000); await rejected;
  assert.equal(signal.aborted, true);
  completion.resolve(3); await flush();
  assert.equal(f.runtime.status, 'unknown');
  assert.equal(f.runtime.storageBlocked, true);
  await assertRestartHeld(f);
  await assert.rejects(f.forward(), /held/);
  await assert.rejects(new Runtime(f.config).initialize(), /fenced/);
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51', 'PUT:50']);
});

test('rejected final context after acknowledged finalization remains durable unknown across adapter recreation', async () => {
  const f = fixture(); await f.runtime.initialize(); await f.forward();
  let signal;
  f.contextProvider.read = (...args) => {
    if (f.events.filter(event => event === 'CAS').length === 3) {
      [, signal] = args;
      return Promise.reject(new Error('final context rejected'));
    }
    return f.readContext(...args);
  };
  await assert.rejects(f.runtime.restore(f.restore), /final context rejected/);
  assert.equal(f.runtime.status, 'unknown');
  assert.equal(f.runtime.storageBlocked, true);
  assert.equal(signal.aborted, true);
  await assertRestartHeld(f);
});

test('never-settling final context expires at exactly five seconds and late success cannot erase the restart hold', async () => {
  const f = fixture(); const completion = deferred(); let signal;
  await f.runtime.initialize(); await f.forward();
  f.contextProvider.read = (...args) => {
    if (f.events.filter(event => event === 'CAS').length === 3) {
      [, signal] = args;
      return completion.promise;
    }
    return f.readContext(...args);
  };
  const pending = f.runtime.restore(f.restore);
  const rejected = assert.rejects(pending, /deadline/);
  await flush();
  f.clock.tick(4999); await flush();
  assert.equal(f.runtime.status, 'persisting');
  assert.equal(signal.aborted, false);
  f.clock.tick(1); await rejected;
  assert.equal(signal.aborted, true);
  completion.resolve(await f.readContext(f.target.targetKey, new AbortController().signal));
  await flush();
  assert.equal(f.runtime.status, 'unknown');
  assert.equal(f.runtime.storageBlocked, true);
  await assertRestartHeld(f);
});

test('withdrawal and shutdown at the final context boundary retain durable ownership despite late provider success', async () => {
  for (const method of ['revoke', 'shutdown']) {
    const f = fixture(); const completion = deferred(); let signal;
    await f.runtime.initialize(); await f.forward();
    f.contextProvider.read = (...args) => {
      if (f.events.filter(event => event === 'CAS').length === 3) {
        [, signal] = args;
        return completion.promise;
      }
      return f.readContext(...args);
    };
    const pending = f.runtime.restore(f.restore);
    const rejected = assert.rejects(pending, /withdrawn|stopped/);
    await flush(); f.runtime[method](); await rejected;
    assert.equal(signal.aborted, true);
    completion.resolve(await f.readContext(f.target.targetKey, new AbortController().signal));
    await flush();
    assert.equal(f.runtime.status, method === 'shutdown' ? 'stopped' : 'unknown');
    assert.equal(f.runtime.storageBlocked, true);
    await assertRestartHeld(f);
  }
});

test('authority contradiction at final context completion cannot erase a correctly committed restart obligation', async () => {
  const f = fixture(); await f.runtime.initialize(); await f.forward();
  f.contextProvider.read = (...args) => {
    if (f.events.filter(event => event === 'CAS').length === 3) f.state.revision++;
    return f.readContext(...args);
  };
  await assert.rejects(f.runtime.restore(f.restore), /drift/);
  assert.equal(f.runtime.status, 'unknown');
  assert.equal(f.runtime.storageBlocked, true);
  await assertRestartHeld(f);
});

test('authority drift during restoration persistence prevents the conditional PUT', async () => {
  const f = fixture(); await f.runtime.initialize(); await f.forward();
  const original = f.store.compareAndSwap;
  f.store.compareAndSwap = async (...args) => { f.state.companions = 'changed'; return original(...args); };
  await assert.rejects(f.runtime.restore(f.restore), /drift/);
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51']);
  assert.equal(f.stored().operations.length, 1);
});

test('authoritative terminal observation fences the runtime without replaying a retired command', async () => {
  const f = fixture(); await f.runtime.initialize(); await f.forward(); await f.runtime.restore(f.restore);
  f.state.reservePercent = 51;
  await assert.rejects(f.runtime.revalidate(), /drift/);
  assert.equal(f.runtime.status, 'unknown');
  assert.deepEqual(f.events.filter(event => event.startsWith('PUT')), ['PUT:51', 'PUT:50']);
  await assert.rejects(f.forward(), /held/);
});

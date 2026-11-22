'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Stream5000SqliteControlStore: Store } = require('../.homeybuild/lib/stream5000SqliteControlStore');
const { Stream5000ControlLedger: Ledger } = require('../.homeybuild/lib/stream5000ControlLedger');
const { Stream5000ControlEngine: Engine } = require('../.homeybuild/lib/stream5000ControlEngine');
const signal = () => new AbortController().signal;
const empty = key => new Ledger({ installationKey: key }).journal();
async function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ecoflow-synthetic-cas-')));
  fs.chmodSync(directory, 0o700);
  const options = { databasePath: path.join(directory, 'synthetic.sqlite'),
    installationKey: 'synthetic-installation', incarnation: 'synthetic-incarnation', minimumRevision: 0 };
  const stores = [];
  t.after(async () => {
    await Promise.all(stores.map(store => store.close()));
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  return { directory, options, open(extra = {}) {
    const store = new Store({ ...options, ...extra }); stores.push(store); return store;
  }, async provision() { await Store.provision(options, empty(options.installationKey)); } };
}
const cas = (store, options, revision, journal = empty(options.installationKey)) =>
  store.compareAndSwap(options.installationKey, { incarnation: options.incarnation, revision }, journal, signal());

test('normal load never creates a missing database; provisioning is explicit and cannot overwrite', async t => {
  const f = await fixture(t);
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
  assert.equal(fs.existsSync(f.options.databasePath), false);
  await f.provision();
  await assert.rejects(f.provision(), /failed|unknown/);
  assert.equal((await f.open().load(f.options.installationKey, signal())).revision, 0);
});

test('independent workers contend on real conditional SQLite commits, with exactly one winner', async t => {
  const f = await fixture(t); await f.provision();
  const first = f.open(); const second = f.open();
  await Promise.all([first.load(f.options.installationKey, signal()), second.load(f.options.installationKey, signal())]);
  const results = await Promise.allSettled([cas(first, f.options, 0), cas(second, f.options, 0)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  const external = new DatabaseSync(f.options.databasePath);
  try { assert.equal(external.prepare('SELECT revision FROM control_record').get().revision, 1); }
  finally { external.close(); }
  assert.equal((await f.open({ minimumRevision: 1 }).load(f.options.installationKey, signal())).revision, 1);
});

test('immutable incarnation, singleton identity and independent revision floor fail closed', async t => {
  const f = await fixture(t); await f.provision();
  for (const extra of [{ incarnation: 'wrong' }, { minimumRevision: 1 }, { minimumRevision: undefined },
    { minimumRevision: -1 }, { minimumRevision: NaN }, { minimumRevision: Number.MAX_SAFE_INTEGER + 1 }]) {
    await assert.rejects(f.open(extra).load(f.options.installationKey, signal()), /held/);
  }
  const external = new DatabaseSync(f.options.databasePath);
  try { external.prepare('INSERT INTO control_record VALUES (?, ?, 0, ?)').run('other-installation', 'other-incarnation', JSON.stringify(empty('other-installation'))); }
  finally { external.close(); }
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
});

test('an observed high-water mark rejects local rollback rather than accepting a stale caller floor', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  await cas(store, f.options, 0);
  const external = new DatabaseSync(f.options.databasePath);
  try { external.exec('UPDATE control_record SET revision = 0'); } finally { external.close(); }
  await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
  await assert.rejects(f.open({ minimumRevision: 1 }).load(f.options.installationKey, signal()), /held/);
});

test('valid active journals are acknowledged exactly; engine recovery holds without any native binding', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  const target = { targetKey: 'synthetic-unit', installationKey: f.options.installationKey,
    model: 'STREAM_5000_AC', firmware: 'synthetic-only', scope: 'system',
    routing: 'qualified_system_main', commandTargetSn: 'NOT_A_REAL_SERIAL', generation: 1 };
  const qualifications = [{ ...target, action: 'backup_reserve_percent', source: 'official_native',
    evidenceRef: 'SYNTHETIC_ONLY', routingEvidenceRef: 'SYNTHETIC_SCOPE_ONLY' }];
  const context = { now: 1000, nativeEpoch: 'synthetic-epoch', fieldRevision: 10, target,
    authority: { revision: 1, exclusive: true, nativeAiCoordinated: true },
    configuration: { source: 'official_native', generation: 1, commandTargetSn: target.commandTargetSn,
      receivedAt: 999, reserveEnabled: true, reservePercent: 50, companionSnapshotId: 'synthetic-companions' } };
  const ledger = new Ledger({ installationKey: f.options.installationKey, enabled: true,
    qualifications, verifyEvidence: () => true });
  const approval = { claimId: 1, operationId: 'synthetic-pilot', forwardApproved: true,
    restoreApproved: false, reservePercent: 51 };
  const baseline = { kind: 'baseline', nativeEpoch: context.nativeEpoch, fieldRevision: 10, reservePercent: 50 };
  ledger.begin(context, approval, baseline);
  const journal = ledger.journal();
  assert.equal(journal.active.held, false);
  const committed = await cas(store, f.options, 0, journal);
  assert.deepEqual(committed.journal, journal);
  await store.close();
  const recovered = f.open({ minimumRevision: 1 });
  assert.equal((await recovered.load(f.options.installationKey, signal())).journal.active.held, false);
  const engine = new Engine({ installationKey: f.options.installationKey, store: recovered,
    readContext: () => context, now: () => 1000 });
  await engine.open();
  await assert.rejects(engine.dispatch(1), /held|disabled|unqualified/);
});

test('database lock waits occur off the main loop; overload rejects instead of queuing', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  await store.load(f.options.installationKey, signal());
  const blocker = new DatabaseSync(f.options.databasePath); blocker.exec('BEGIN IMMEDIATE');
  const pending = cas(store, f.options, 0);
  await assert.rejects(store.load(f.options.installationKey, signal()), /busy/);
  await new Promise(resolve => setTimeout(resolve, 30));
  blocker.exec('ROLLBACK'); blocker.close();
  assert.equal((await pending).revision, 1);
});

test('abort before request does not submit; abort during blocked SQL holds and cannot revive on a late reply', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  await store.load(f.options.installationKey, signal());
  const before = new AbortController(); before.abort();
  await assert.rejects(store.compareAndSwap(f.options.installationKey,
    { incarnation: f.options.incarnation, revision: 0 }, empty(f.options.installationKey), before.signal), /before submission/);
  assert.equal((await store.load(f.options.installationKey, signal())).revision, 0);
  const blocker = new DatabaseSync(f.options.databasePath); blocker.exec('BEGIN IMMEDIATE');
  const controller = new AbortController();
  const pending = store.compareAndSwap(f.options.installationKey,
    { incarnation: f.options.incarnation, revision: 0 }, empty(f.options.installationKey), controller.signal);
  const rejected = assert.rejects(pending, /held/);
  await new Promise(resolve => setTimeout(resolve, 30)); controller.abort();
  blocker.exec('ROLLBACK'); blocker.close();
  await rejected;
  await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
  await Promise.all([store.close(), store.close()]);
});

test('unsafe paths, symlinks and file replacement are rejected without permission repair', async t => {
  const f = await fixture(t); await f.provision();
  fs.chmodSync(f.options.databasePath, 0o644);
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
  assert.equal(fs.statSync(f.options.databasePath).mode & 0o777, 0o644);
  fs.chmodSync(f.options.databasePath, 0o600);
  const store = f.open(); await store.load(f.options.installationKey, signal());
  fs.renameSync(f.options.databasePath, `${f.options.databasePath}.old`);
  fs.copyFileSync(`${f.options.databasePath}.old`, f.options.databasePath); fs.chmodSync(f.options.databasePath, 0o600);
  await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
  fs.unlinkSync(f.options.databasePath); fs.symlinkSync(`${f.options.databasePath}.old`, f.options.databasePath);
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
});

test('malformed, oversized and accessor journals fail before submission; unsafe revision exhaustion does not write', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  const journal = empty(f.options.installationKey);
  const accessor = { ...journal }; Object.defineProperty(accessor, 'raw', { enumerable: true, get() { throw new Error('must not run'); } });
  for (const value of [{ ...journal, raw: 'unexpected' }, { ...journal, raw: '界'.repeat(65536) },
    accessor, { ...journal, nextClaimId: 1 }, { ...journal, version: 1 },
    { ...journal, raw: new Array(4294967295) }, { ...journal, [Symbol('hidden')]: true }]) {
    await assert.rejects(async () => cas(store, f.options, 0, value));
  }
  assert.equal((await store.load(f.options.installationKey, signal())).revision, 0);
  const external = new DatabaseSync(f.options.databasePath);
  try { external.prepare('UPDATE control_record SET revision = ?').run(Number.MAX_SAFE_INTEGER); }
  finally { external.close(); }
  await assert.rejects(cas(store, f.options, Number.MAX_SAFE_INTEGER), /held/);
});

test('lost acknowledgement after a real COMMIT holds; fresh recovery observes exactly one increment', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  await store.load(f.options.installationKey, signal());
  const controller = new AbortController();
  store.worker.prependListener('message', message => {
    if (message.type === 'result' && message.record?.revision === 1) controller.abort();
  });
  const pending = store.compareAndSwap(f.options.installationKey,
    { incarnation: f.options.incarnation, revision: 0 }, empty(f.options.installationKey), controller.signal);
  await assert.rejects(pending, /held/);
  await store.close();
  const recovery = f.open({ minimumRevision: 1 });
  assert.equal((await recovery.load(f.options.installationKey, signal())).revision, 1);
  await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
});

test('duplicate ready and unsolicited responses permanently hold rather than reset pending ownership', async t => {
  const f = await fixture(t); await f.provision();
  for (const message of [{ type: 'ready' }, { type: 'result', id: 999 }, { type: 'unexpected' }, null]) {
    const store = f.open(); await store.load(f.options.installationKey, signal());
    store.worker.emit('message', message);
    await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
  }
});

test('module import inside an unrelated worker neither starts SQLite nor closes that worker port', async () => {
  const { Worker } = require('node:worker_threads');
  const modulePath = require.resolve('../.homeybuild/lib/stream5000SqliteControlStore');
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    require(${JSON.stringify(modulePath)});
    parentPort.postMessage({ loaded: true });
  `, { eval: true, workerData: { type: 'unrelated-synthetic-worker' } });
  const messages = [];
  await new Promise((resolve, reject) => {
    worker.on('message', message => messages.push(message));
    worker.on('error', reject);
    worker.on('exit', code => code === 0 ? resolve() : reject(new Error('worker failed')));
  });
  assert.deepEqual(messages, [{ loaded: true }]);
});

test('empty database, altered schema, extra trigger and oversized stored text are not repaired', async t => {
  const f = await fixture(t); await f.provision();
  const mutate = sql => {
    const external = new DatabaseSync(f.options.databasePath);
    try { external.exec(sql); } finally { external.close(); }
  };
  mutate("UPDATE control_record SET journal = printf('%100000s', 'x')");
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
  const external = new DatabaseSync(f.options.databasePath);
  try { external.prepare('UPDATE control_record SET journal = ?').run(JSON.stringify(empty(f.options.installationKey))); }
  finally { external.close(); }
  mutate('CREATE TRIGGER sqliteXunexpected AFTER UPDATE ON control_record BEGIN SELECT 1; END');
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
  mutate('DROP TRIGGER sqliteXunexpected; CREATE TRIGGER unexpected AFTER UPDATE ON control_record BEGIN SELECT 1; END');
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
  mutate('DROP TRIGGER unexpected; DROP TABLE control_record');
  await assert.rejects(f.open().load(f.options.installationKey, signal()), /held/);
  const check = new DatabaseSync(f.options.databasePath);
  try { assert.equal(check.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get().count, 0); }
  finally { check.close(); }
});

test('an actual SQLite lock timeout holds without retry; the committed revision remains unchanged', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  await store.load(f.options.installationKey, signal());
  const blocker = new DatabaseSync(f.options.databasePath); blocker.exec('BEGIN IMMEDIATE');
  try { await assert.rejects(cas(store, f.options, 0), /held/); }
  finally { blocker.exec('ROLLBACK'); blocker.close(); }
  await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
  assert.equal((await f.open().load(f.options.installationKey, signal())).revision, 0);
});

test('a never-returning owned transport reaches its deadline and holds without submitting or replaying', async t => {
  const f = await fixture(t); await f.provision(); const store = f.open();
  await store.load(f.options.installationKey, signal());
  store.worker.postMessage = () => {};
  await assert.rejects(cas(store, f.options, 0), /held/);
  await assert.rejects(store.load(f.options.installationKey, signal()), /held/);
  await store.close();
  assert.equal((await f.open().load(f.options.installationKey, signal())).revision, 0);
});

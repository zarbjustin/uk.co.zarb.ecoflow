'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { scalar, varint } = require('./helpers/dualCtSynthetic');
const { adaptDualCtGridEnergyPacket: adapt, dualCtGridBinding: binding, resolveDualCtGridEnergyContract: resolve,
  DUAL_CT_ENERGY_RUNTIME_ENABLED } = require('../.homeybuild/lib/dualCtGridEnergySource');
const { makeDualCtEnergyCheckpoint: checkpoint, readDualCtEnergyCheckpoint: readCheckpoint,
  dualCtEnergyHomeyStorage, DUAL_CT_ENERGY_CHECKPOINT_KEY } = require('../.homeybuild/lib/dualCtEnergyCheckpoint');
const { DualCtGridEnergySession } = require('../.homeybuild/lib/dualCtGridEnergySession');
const { planDualCtEnergyAdoption: plan, DualCtEnergyAuthority, DUAL_CT_ENERGY_PROPOSAL } = require('../.homeybuild/lib/dualCtEnergyAdoption');
const scope = { account: 'synthetic_account', device: 'SYNTHETICDUALCT01', session: 'session_one', grid: 'synthetic_home' };
const identity = { productType: 421, firmware: 'synthetic.1.0' };
const contract = { id: 'synthetic_contract', productType: 421, firmware: identity.firmware, channel: 'ct1', bank: 'A', unit: 'W',
  importSign: 'positive', timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
const topic = `/app/device/property/${scope.device}`;
const int = (field, n) => Buffer.concat([varint(field * 8), varint(n)]);
const nested = (field, bytes) => Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes]);
const rows = entries => Buffer.concat(entries.map(([field, n]) => scalar(field, n)));
const frame = (bytes, options = {}) => nested(1, Buffer.concat([nested(1, bytes),
  ...(options.omitted ? [] : [int(6, options.encoding || 0)]), int(8, 254), int(9, 21),
  ...(options.sn ? [nested(25, Buffer.from(options.sn))] : [])]));
const payload = (watts = 3600) => frame(rows([[962, watts / 2], [963, watts / 4], [772, watts / 4], [515, watts],
  [991, -900], [992, -800], [993, -700], [998, -2400]]));
const request = changes => ({ explicitConsent: true, target: 'new_energy_device', accounting: 'power',
  binding: binding(scope, contract), grid: scope.grid, inventoryComplete: true, contributors: [], externalOverlapReviewed: true,
  contractQualified: true, ...changes });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function memory(initial) {
  return { data: clone(initial), writes: [], reads: 0,
    async read() { this.reads++; return clone(this.data); },
    async write(value) { this.writes.push(clone(value)); this.data = clone(value); } };
}
function harness(options = {}) {
  let now = 1000; let review = request(); let selected = contract;
  const storage = options.storage || memory(); const authority = options.authority || new DualCtEnergyAuthority();
  const session = new DualCtGridEnergySession({ scope: { ...scope, ...options.scope }, identity: { ...identity, ...options.identity },
    readIdentity: () => ({ ...identity, ...options.identity }), storage, authority, review: () => review, resolveContract: () => selected, now: () => now, ...options });
  return { session, storage, authority, at: value => { now = value; }, review: value => { review = value; },
    contract: value => { selected = value; },
    async sample(at, watts = 3600, measuredAt = null) { now = at; await session.observe(payload(watts), topic, at, measuredAt); return session.view(); } };
}

test('no contract is registered; ordinary candidate flags cannot start storage, Energy or existing-device adoption', async () => {
  assert.equal(resolve({ ...identity, verified: true, ct1_role: 'grid' }), null);
  const storage = memory();
  const session = new DualCtGridEnergySession({ scope, identity, readIdentity: () => identity, storage, authority: new DualCtEnergyAuthority(), review: () => request() });
  await session.start(); assert.equal(session.view().status, 'contract_blocked');
  assert.equal(storage.reads, 0); assert.equal(storage.writes.length, 0);
  assert.equal(DUAL_CT_ENERGY_RUNTIME_ENABLED, false); assert.equal(session.view().contributesToEnergy, false);
  assert.equal(plan(request({ target: 'existing_preview' })).status, 'existing_device_conversion_blocked');
  await session.close();
});

test('wire adapter nets all three CT1 phases, normalises only the developer-confirmed sign and never adds CT2', () => {
  const mixed = frame(rows([[962, 800], [963, -1200], [772, 100], [515, -300], [991, -1000], [992, -1000], [993, -1000]]));
  assert.equal(adapt(scope, identity, contract, mixed, topic, 1000, null, 1000).observation.signedImportW, -300);
  assert.equal(adapt(scope, identity, { ...contract, importSign: 'negative' }, mixed, topic, 1000, null, 1000).observation.signedImportW, 300);
  assert.equal(adapt(scope, identity, contract, payload(0), topic, 1000, null, 1000).observation.signedImportW, 0);
  for (const changed of [{ bank: 'B' }, { channel: 'ct2' }, { unit: 'kW' }, { firmware: 'other' }, { liveFreshnessValidated: false }]) {
    assert.equal(adapt(scope, identity, { ...contract, ...changed }, payload(), topic, 1000, null, 1000).observation, null);
  }
});

test('partial, contradictory, foreign, ambiguous, oversized and wrong-encoding frames cannot create grid observations', () => {
  const bad = [frame(rows([[962, 100], [963, 200]])), frame(rows([[962, 1], [963, 2], [772, 3], [515, 900]])),
    frame(rows([[962, NaN], [963, 2], [772, 3]])), frame(rows([[962, 1], [963, 2], [772, 3], [962, 1]])),
    frame(rows([[991, 1], [992, 2], [993, 3]])), payload().subarray(0, 7), Buffer.concat([payload(), payload()]),
    frame(rows([[962, 1], [963, 2], [772, 3]]), { encoding: 1 }), frame(rows([[962, 1], [963, 2], [772, 3]]), { omitted: true }),
    frame(rows([[962, 1], [963, 2], [772, 3]]), { sn: 'FOREIGNSYNTHETIC01' }), Buffer.alloc(65537)];
  for (const bytes of bad) assert.equal(adapt(scope, identity, contract, bytes, topic, 1000, null, 1000).observation, null);
  assert.equal(adapt(scope, identity, contract, payload(), topic + '/get_reply', 1000, null, 1000).observation, null);
  assert.equal(adapt(scope, identity, contract, payload(), topic, 1000, null, 91000).observation, null);
});

test('device time and receipt-estimate time are explicit alternatives; no invented measurement timestamps', () => {
  const strict = { ...contract, timing: 'device_measurement' };
  assert.equal(adapt(scope, identity, strict, payload(), topic, 1000, null, 1000).status, 'measurement_time_required');
  for (const time of [0, NaN, 1001]) assert.equal(adapt(scope, identity, strict, payload(), topic, 1000, time, 1000).observation, null);
  const measured = adapt(scope, identity, strict, payload(), topic, 1000, 900, 1000).observation;
  assert.equal(measured.measuredAt, 900); assert.equal(measured.timing, 'device_measurement');
  const estimate = adapt(scope, identity, contract, payload(), topic, 1000, null, 1000).observation;
  assert.equal(estimate.measuredAt, null); assert.equal(estimate.timing, 'verified_live_receipt_estimate');
  assert.equal(adapt(scope, identity, contract, payload(), topic, 1000, 1000, 1000).status, 'timing_basis_conflict');
});

test('binding is session-independent but account/meter/grid/contract/firmware/direction/timing/encoding-bound', () => {
  const original = binding(scope, contract);
  assert.equal(binding({ ...scope, session: 'session_two' }, contract), original);
  for (const key of ['account', 'device', 'grid']) assert.notEqual(binding({ ...scope, [key]: 'different' }, contract), original);
  for (const change of [{ id: 'new_contract' }, { firmware: 'synthetic.2' }, { importSign: 'negative' },
    { timing: 'device_measurement' }, { encoding: 'omitted_zero_candidate' }]) assert.notEqual(binding(scope, { ...contract, ...change }), original);
  assert.equal(binding({ ...scope, device: 'invalid/topic' }, contract), null);
});

test('adoption fails closed for missing consent/inventory, overlap, existing previews and simultaneous counter paths', () => {
  for (const [change, status] of [[{ explicitConsent: false }, 'consent_required'], [{ inventoryComplete: false }, 'inventory_unknown'],
    [{ contributors: [{}] }, 'inventory_unknown'], [{ externalOverlapReviewed: false }, 'external_overlap_review_required'],
    [{ contributors: [{ id: 'p1_meter', grid: scope.grid, contributes: true }] }, 'grid_source_overlap'],
    [{ target: 'existing_preview' }, 'existing_device_conversion_blocked'], [{ accounting: 'counter' }, 'counter_path_blocked']]) {
    assert.equal(plan(request(change)).status, status);
  }
  assert.equal(plan(request({ contributors: [{ id: 'other_scope', grid: 'another_home', contributes: true }] })).preparationAllowed, true);
  assert.equal(plan(request()).contributesToEnergy, false); assert.equal(plan(request()).existingDevicesChanged, false);
});

test('single-process authority prevents two sessions adopting one grid, including duplicate source aliases', async () => {
  const authority = new DualCtEnergyAuthority(); const storage = memory(); const a = harness({ authority, storage }); const b = harness({ authority, storage });
  await Promise.all([a.session.start(), b.session.start()]);
  assert.equal(a.session.view().status, 'waiting_for_anchor'); assert.equal(b.session.view().status, 'authority_conflict');
  await a.session.close(); await b.session.start(); assert.equal(b.session.view().status, 'waiting_for_anchor');
  await b.session.close();
});

test('checkpoint stores only source-bound totals/revision, rejects corruption, future schemas and extra raw data', () => {
  const key = binding(scope, contract); const state = checkpoint(key, contract.timing, 4, 100, 50);
  assert.deepEqual(readCheckpoint(clone(state), key, contract.timing), state);
  for (const bad of [{ ...state, importedWh: 200 }, { ...state, schema: 2 }, { ...state, revision: -1 },
    { ...state, sourceSn: 'PRIVATE' }, {}, null, []]) assert.equal(readCheckpoint(bad, key, contract.timing), null);
  assert.equal(readCheckpoint(state, binding({ ...scope, account: 'other' }, contract), contract.timing), null);
  assert.equal(readCheckpoint(state, key, 'device_measurement'), null);
  assert.doesNotMatch(JSON.stringify(state), /SYNTHETIC|synthetic_account|session_one|baseline|signedImportW/);
});

test('Homey storage adapter uses one dedicated private key without touching other stores/settings/capabilities', async () => {
  const values = new Map([['existingEnergy', 123]]); const written = [];
  const store = dualCtEnergyHomeyStorage({ getStoreValue: key => values.get(key), setStoreValue: async (key, value) => { written.push(key); values.set(key, value); } });
  const state = checkpoint(binding(scope, contract), contract.timing); await store.write(state);
  assert.deepEqual(await store.read(), state); assert.deepEqual(written, [DUAL_CT_ENERGY_CHECKPOINT_KEY]);
  assert.equal(values.get('existingEnergy'), 123);
});

test('power accounting persists before projection and separates time-direction crossings after phase netting', async () => {
  const h = harness(); await h.session.start();
  assert.equal((await h.sample(1000)).candidateCapabilities['meter_power.imported'], 0);
  let view = await h.sample(2000, -7200);
  near(view.candidateCapabilities['meter_power.imported'], (1 / 6) / 1000);
  near(view.candidateCapabilities['meter_power.exported'], (2 / 3) / 1000);
  assert.equal(view.candidateCapabilities.measure_power, -7200);
  assert.equal(view.measurementTimestampKnown, false); assert.equal(view.approximation, true);
  assert.equal(h.storage.data.revision, 1); assert.equal(view.contributesToEnergy, false);
  view = await h.sample(3000, 0); near(view.candidateCapabilities['meter_power.exported'], (2 / 3 + 1) / 1000);
  await h.session.close();
});

test('restart/new session restores totals without vendor seeding, old anchors or downtime integration', async () => {
  const storage = memory(); const a = harness({ storage }); await a.session.start(); await a.sample(1000); await a.sample(2000);
  assert.equal(storage.data.importedWh, 1); await a.session.close();
  const b = harness({ storage, scope: { ...scope, session: 'new_session' } }); b.at(500000); await b.session.start();
  assert.equal(b.session.view().candidateCapabilities.measure_power, null);
  await b.sample(500000); assert.equal(storage.data.importedWh, 1);
  await b.sample(501000); assert.equal(storage.data.importedWh, 2);
  await b.session.close();
});

test('exact gaps, invalid packets, reordered clocks and rollback never backfill missed energy', async () => {
  const h = harness(); await h.session.start(); await h.sample(1000);
  assert.equal(h.session.view(91000).candidateCapabilities.measure_power, null);
  await h.sample(91000); assert.equal(h.storage.data.importedWh, 0);
  await h.sample(92000); assert.equal(h.storage.data.importedWh, 1);
  await h.sample(92000); assert.equal(h.storage.data.importedWh, 1);
  h.at(93000); await h.session.observe(frame(rows([[962, 10]])), topic, 93000);
  assert.equal(h.session.view().candidateCapabilities.measure_power, null);
  await h.sample(94000); assert.equal(h.storage.data.importedWh, 1);
  await h.sample(500); assert.equal(h.session.view().status, 'clock_reset');
  await h.sample(1000); assert.equal(h.storage.data.importedWh, 1);
  await h.session.close();
});

test('strict timestamp accounting uses measured elapsed time rather than network-arrival spacing', async () => {
  const h = harness(); const strict = { ...contract, timing: 'device_measurement' };
  h.contract(strict); h.review(request({ binding: binding(scope, strict) })); await h.session.start();
  await h.sample(2000, 3600, 1000); await h.sample(4000, 3600, 2000);
  assert.equal(h.storage.data.importedWh, 1); assert.equal(h.session.view().approximation, false);
  assert.equal(h.session.view().measurementTimestampKnown, true);
  await h.sample(5000, 3600, null); assert.equal(h.session.view().status, 'measurement_time_required');
  assert.equal(h.storage.data.importedWh, 1); await h.session.close();
});

test('storage failure before commit stops projection; explicit resume reads actual disk and starts a new anchor', async () => {
  const h = harness(); await h.session.start(); await h.sample(1000);
  const write = h.storage.write; h.storage.write = async () => { throw new Error('synthetic storage failure'); };
  await h.sample(2000); assert.equal(h.session.view().status, 'storage_failed'); assert.equal(h.storage.data.importedWh, 0);
  assert.equal(h.session.view().candidateCapabilities['meter_power.imported'], null);
  h.storage.write = write; await h.session.start(); await h.sample(3000);
  assert.equal(h.storage.data.importedWh, 0); await h.sample(4000); assert.equal(h.storage.data.importedWh, 1);
  await h.session.close();
});

test('unknown write outcome after commit recovers saved totals exactly once, with no old interval replay', async () => {
  const h = harness(); await h.session.start(); await h.sample(1000);
  const write = h.storage.write;
  h.storage.write = async function (value) { await write.call(this, value); throw new Error('acknowledgement lost'); };
  await h.sample(2000); assert.equal(h.storage.data.importedWh, 1); assert.equal(h.session.view().status, 'storage_failed');
  h.storage.write = write; await h.session.start(); await h.sample(3000); assert.equal(h.storage.data.importedWh, 1);
  await h.sample(4000); assert.equal(h.storage.data.importedWh, 2); await h.session.close();
});

test('corrupt, mismatched, missing-after-start and rolled-back checkpoints are never silently reset or overwritten', async () => {
  for (const bad of [{ schema: 9 }, checkpoint(binding({ ...scope, account: 'other' }, contract), contract.timing)]) {
    const h = harness({ storage: memory(bad) }); await h.session.start(); assert.equal(h.session.view().status, 'checkpoint_invalid');
    assert.equal(h.storage.writes.length, 0); await h.session.close();
  }
  const h = harness(); await h.session.start(); const initial = clone(h.storage.data); await h.sample(1000); await h.sample(2000);
  h.storage.data = initial; await h.session.start(); assert.equal(h.session.view().status, 'checkpoint_rollback');
  h.storage.data = null; await h.session.start(); assert.equal(h.session.view().status, 'checkpoint_missing');
  assert.equal(h.storage.writes.length, 2); await h.session.close();
});

test('fresh inventory and external-overlap review are rechecked; changing labels alone never grants adoption', async () => {
  const h = harness(); await h.session.start(); await h.sample(1000);
  h.review(request({ contributors: [{ id: 'new_meter', grid: scope.grid, contributes: true }] }));
  assert.equal(h.session.view().status, 'grid_source_overlap'); assert.equal(h.session.view().candidateCapabilities.measure_power, null);
  await h.sample(2000); assert.equal(h.storage.data.importedWh, 0);
  h.review(request()); await h.session.start(); await h.sample(3000); assert.equal(h.storage.data.importedWh, 0);
  const changed = { ...contract, id: 'changed_contract' };
  h.contract(changed); assert.equal(h.session.view().status, 'source_selection_mismatch');
  h.review(request({ binding: binding(scope, changed) }));
  await h.session.start(); assert.equal(h.session.view().status, 'source_change_requires_migration');
  await h.session.close();
});

test('delayed writes are not exposed early; close waits before handing authority to another session', async () => {
  const authority = new DualCtEnergyAuthority(); const storage = memory(); const h = harness({ authority, storage });
  await h.session.start(); await h.sample(1000); const write = storage.write; let release;
  storage.write = async function (value) { await new Promise(resolve => { release = resolve; }); await write.call(this, value); };
  const pending = h.sample(2000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.session.view().candidateCapabilities['meter_power.imported'], 0);
  const closing = h.session.close(); const other = harness({ authority, storage }); await other.session.start();
  assert.equal(other.session.view().status, 'authority_conflict');
  release(); await Promise.all([pending, closing]);
  assert.equal(h.session.view().candidateCapabilities.measure_power, null); storage.write = write;
  await other.session.start(); assert.equal(other.session.view().candidateCapabilities['meter_power.imported'], 0.001);
  await other.session.close();
});

test('consent revocation during pending IO cannot release authority early or expose a late saved projection', async () => {
  const authority = new DualCtEnergyAuthority(); const storage = memory(); const h = harness({ authority, storage });
  await h.session.start(); await h.sample(1000); const write = storage.write; let release;
  storage.write = async function (value) { await new Promise(resolve => { release = resolve; }); await write.call(this, value); };
  const pending = h.sample(2000); await new Promise(resolve => setImmediate(resolve));
  h.review(request({ explicitConsent: false })); assert.equal(h.session.view().status, 'consent_required');
  const other = harness({ authority, storage }); await other.session.start(); assert.equal(other.session.view().status, 'authority_conflict');
  release(); await pending; await h.session.close(); storage.write = write;
  assert.equal(h.session.view().candidateCapabilities['meter_power.imported'], null);
  await other.session.start(); assert.equal(other.session.view().candidateCapabilities['meter_power.imported'], 0.001);
  await other.session.close();
});

test('overloaded storage queue is bounded and fails closed rather than retaining unlimited packet history', async () => {
  const h = harness(); await h.session.start(); await h.sample(1000); const write = h.storage.write; let release;
  h.storage.write = async function (value) { await new Promise(resolve => { release = resolve; }); await write.call(this, value); };
  h.at(2000); const pending = h.session.observe(payload(), topic, 2000); await new Promise(resolve => setImmediate(resolve));
  const burst = Array.from({ length: 100 }, (_, n) => h.session.observe(payload(), topic, 2001 + n));
  assert.equal(h.session.view().status, 'backpressure'); assert.ok(h.session.pendingPackets <= 8);
  release(); await Promise.all([pending, ...burst]); assert.equal(h.session.view().candidateCapabilities.measure_power, null);
  h.storage.write = write; await h.session.start(); await h.sample(4000); assert.equal(h.storage.data.importedWh, 1);
  await h.session.close();
});

test('Homey projection uses kWh cumulative import/export proposal, remains unwired and cannot change preview manifests', () => {
  assert.deepEqual(DUAL_CT_ENERGY_PROPOSAL.energy, { cumulative: true,
    cumulativeImportedCapability: 'meter_power.imported', cumulativeExportedCapability: 'meter_power.exported' });
  const preview = require('../drivers/smartmeter_dual_ct_preview/driver.compose.json');
  assert.equal(preview.energy, undefined); assert.ok(preview.capabilities.every(id => id.startsWith('dual_ct_preview_')));
  const root = path.join(__dirname, '..');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of [...walk(path.join(root, 'drivers')).filter(f => f.endsWith('.ts')), path.join(root, 'app.ts'), path.join(root, 'lib/dualCtMonitor.ts')]) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /dualCtGridEnergyDeviceAdapter|dualCtGridEnergySession|dualCtGridEnergySource|dualCtEnergyAdoption|dualCtEnergyCheckpoint/);
  }
});

test('source-specific consent and fresh firmware readback cannot be reused for another identity or changed firmware', async () => {
  const wrong = harness(); wrong.review(request({ binding: binding({ ...scope, account: 'other' }, contract) }));
  await wrong.session.start(); assert.equal(wrong.session.view().status, 'source_selection_mismatch');
  assert.equal(wrong.storage.reads, 0); await wrong.session.close();
  let liveIdentity = identity; const h = harness({ readIdentity: () => liveIdentity });
  await h.session.start(); await h.sample(1000); liveIdentity = { ...identity, firmware: 'synthetic.2.0' };
  assert.equal(h.session.view().status, 'model_firmware_changed');
  assert.equal(h.session.view().candidateCapabilities.measure_power, null);
  await h.sample(2000); assert.equal(h.storage.data.importedWh, 0); await h.session.close();
});

test('storage read failure, changed readback and an external writer all stop rather than zero or overwrite totals', async () => {
  const failed = harness({ storage: { read: async () => { throw new Error('synthetic unavailable'); }, write: async () => assert.fail('no write after failed read') } });
  await failed.session.start(); assert.equal(failed.session.view().status, 'storage_failed'); await failed.session.close();
  const h = harness(); await h.session.start(); await h.sample(1000);
  h.storage.data = checkpoint(binding(scope, contract), contract.timing, 4, 10, 0);
  await h.sample(2000); assert.equal(h.session.view().status, 'checkpoint_conflict');
  assert.equal(h.storage.writes.length, 1); assert.equal(h.storage.data.importedWh, 10); await h.session.close();
  const stale = harness(); await stale.session.start(); await stale.sample(1000);
  stale.storage.write = async () => {}; // write was acknowledged, but not reflected in readback
  await stale.sample(2000); assert.equal(stale.session.view().status, 'checkpoint_readback_failed');
  assert.equal(stale.session.view().candidateCapabilities['meter_power.imported'], null); await stale.session.close();
});

test('restart rejects future schemas and source/timing changes without deleting stored data', async () => {
  for (const changed of [{ firmware: 'synthetic.2.0' }, { importSign: 'negative' }, { timing: 'device_measurement' }]) {
    const storage = memory(checkpoint(binding(scope, contract), contract.timing, 10, 100, 200));
    const nextContract = { ...contract, ...changed };
    const h = harness({ storage, identity: { ...identity, firmware: nextContract.firmware } });
    h.contract(nextContract); h.review(request({ binding: binding(scope, nextContract) }));
    await h.session.start(); assert.equal(h.session.view().status, 'checkpoint_invalid');
    assert.equal(storage.writes.length, 0); assert.equal(storage.data.importedWh, 100); await h.session.close();
  }
});

test('numeric vendor counters never seed or replace the single power-accounting path', async () => {
  const h = harness(); await h.session.start(); h.at(1000);
  const packet = watts => frame(Buffer.concat([rows([[962, watts / 2], [963, watts / 4], [772, watts / 4], [515, watts]]),
    nested(773, rows([[4, 999000], [6, 555000], [7, 444000]]))]));
  await h.session.observe(packet(3600), topic, 1000); h.at(2000); await h.session.observe(packet(3600), topic, 2000);
  assert.equal(h.storage.data.importedWh, 1); assert.equal(h.storage.data.exportedWh, 0); await h.session.close();
});

test('queued payload bytes are copied; delayed processing rechecks freshness instead of using capture-time now', async () => {
  const h = harness(); await h.session.start();
  const bytes = payload(); const pending = h.session.observe(bytes, topic, 1000); bytes.fill(0); await pending;
  assert.equal(h.session.view().candidateCapabilities.measure_power, 3600, 'caller mutation cannot replace queued wire values');
  const delayed = h.session.observe(payload(), topic, 2000); h.at(92000); await delayed;
  assert.equal(h.session.view().status, 'transport_rejected'); assert.equal(h.storage.data.importedWh, 0); await h.session.close();
});

test('72-hour preparation replay keeps both totals monotonic through gaps, restart, duplicate and DST-independent UTC time', async () => {
  const h = harness(); await h.session.start(); let imported = 0; let exported = 0;
  const base = Date.UTC(2026, 9, 24, 12);
  for (let n = 0; n < 72 * 60; n++) {
    const at = base + n * 60000;
    if (n % 97 === 0) { h.at(at); await h.session.start(); }
    const view = await h.sample(at, n % 2 ? 1800 : -3600);
    assert.ok(h.storage.data.importedWh >= imported); assert.ok(h.storage.data.exportedWh >= exported);
    assert.equal(view.contributesToEnergy, false); assert.equal(view.totalsEstimated, true);
    if (n % 71 === 0) { await h.sample(at); assert.equal(h.storage.data.importedWh, h.session.checkpoint.importedWh); }
    if (n % 83 === 0) { h.at(at + 1000); await h.session.observe(Buffer.from('{}'), topic, at + 1000); }
    imported = h.storage.data.importedWh; exported = h.storage.data.exportedWh;
  }
  assert.ok(imported > 0 && exported > 0); await h.session.close();
});

test('overflow and unexpected lower acknowledged totals cannot corrupt the persisted monotonic ledger', async () => {
  const key = binding(scope, contract); const storage = memory(checkpoint(key, contract.timing, 0, 1e12, 100));
  const h = harness({ storage }); await h.session.start(); await h.sample(1000); await h.sample(2000);
  assert.equal(h.session.view().status, 'accounting_overflow'); assert.equal(storage.writes.length, 0);
  assert.equal(storage.data.importedWh, 1e12); await h.session.close();
});

test('consent is rechecked after delayed startup storage and teardown cannot be overwritten by a late startup readback', async () => {
  const storage = memory(); const read = storage.read; let release;
  storage.read = async function () { await new Promise(resolve => { release = resolve; }); return read.call(this); };
  const h = harness({ storage }); const starting = h.session.start(); await new Promise(resolve => setImmediate(resolve));
  h.review(request({ explicitConsent: false })); release(); await starting;
  assert.equal(h.session.view().status, 'consent_required'); assert.equal(storage.writes.length, 0); await h.session.close();
  const otherStore = memory(); const originalRead = otherStore.read; let secondRelease;
  otherStore.read = async function () {
    if (this.reads === 1) await new Promise(resolve => { secondRelease = resolve; });
    return originalRead.call(this);
  };
  const other = harness({ storage: otherStore }); const init = other.session.start(); await new Promise(resolve => setImmediate(resolve));
  const closing = other.session.close(); secondRelease(); await Promise.all([init, closing]);
  assert.equal(other.session.view().status, 'closed'); assert.equal(other.session.view().candidateCapabilities.measure_power, null);
});

test('clock rollback observed while a write is pending cannot restore an active late projection', async () => {
  const h = harness(); await h.session.start(); await h.sample(1000); const write = h.storage.write; let release;
  h.storage.write = async function (value) { await new Promise(resolve => { release = resolve; }); await write.call(this, value); };
  const pending = h.sample(2000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.session.view(500).status, 'clock_reset');
  release(); await pending;
  assert.equal(h.session.view().candidateCapabilities.measure_power, null);
  assert.equal(h.session.view().candidateCapabilities['meter_power.imported'], null);
  h.storage.write = write; await h.session.start(); await h.sample(3000); assert.equal(h.storage.data.importedWh, 1);
  await h.session.close();
});

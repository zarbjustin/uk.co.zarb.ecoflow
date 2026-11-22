'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { DualCtSourceQualifier } = require('../.homeybuild/lib/dualCtSourceQualification');
const { dualCtGridBinding: binding, dualCtGridContractValid: valid, resolveDualCtGridEnergyContract: legacy,
  adaptDualCtGridEnergyPacket: adapt } = require('../.homeybuild/lib/dualCtGridEnergySource');
const { DualCtGridEnergySession } = require('../.homeybuild/lib/dualCtGridEnergySession');
const { DualCtEnergyAuthority } = require('../.homeybuild/lib/dualCtEnergyAdoption');
const { makeDualCtEnergyCheckpoint, readDualCtEnergyCheckpoint } = require('../.homeybuild/lib/dualCtEnergyCheckpoint');
const { scalar, varint } = require('./helpers/dualCtSynthetic');
const scope = { account: 'synthetic_account', device: 'SYNTHETICDUALCT01', grid: 'synthetic_home', session: 'one' };
const identity = { productType: 421, firmware: 'synthetic.three.1' };
const selection = { wiring: 'three_phase', nettingPolicy: 'signed_phase_sum' };
const profile = { id: 'synthetic_three_v1', ...identity, channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive',
  timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true,
  freshnessMs: 5000, ...selection };
const readback = now => ({ account: scope.account, device: scope.device, grid: scope.grid, owned: true,
  identity: { ...identity }, observedAt: now, ...selection, wiringBasis: 'reviewed_installation' });
const make = (entries, omitted = false) => { const pdata = Buffer.concat(entries.map(([f, n]) => scalar(f, n)));
  const nested = (f, b) => Buffer.concat([varint(f * 8 + 2), varint(b.length), b]);
  const v = (f, n) => Buffer.concat([varint(f * 8), varint(n)]);
  return nested(1, Buffer.concat([nested(1, pdata), ...(omitted ? [] : [v(6, 0)]), v(8, 254), v(9, 21)])); };
const mixed = make([[962, 1800], [963, -600], [772, -600], [515, 600], [991, 90000], [992, 90000], [993, 90000], [998, 270000]]);
function lab(options = {}) {
  let now = 1000; let row = readback(now);
  const q = new DualCtSourceQualifier({ readOwnedSource: async () => row, profiles: [profile], now: () => now, ...options });
  return { q, at: value => { now = value; }, row: value => { row = value; } };
}
async function qualified(h) { const result = await h.q.prepare(selection); assert.equal(result.status, 'qualified_for_preparation');
  const contract = h.q.resolve(identity, result.qualification); assert.ok(contract); return { token: result.qualification, contract }; }

test('production single-phase profile and exact pre-change binding stay frozen; checkpoints still restore', () => {
  const c = legacy({ productType: 421, firmware: '1.0.0.41' });
  const before = 'bd4e03e428bf9c92c26fb4db006cc975b51aceaa45e4ab735422aed6513f6d2b';
  assert.equal(c.singlePhaseOnly, true); assert.equal(c.wiring, undefined);
  assert.equal(binding(scope, c), before); assert.equal(binding({ ...scope, session: 'after_restart' }, c), before);
  const saved = makeDualCtEnergyCheckpoint(before, c.timing, 31, 135.123456, 0.765432);
  assert.deepEqual(readDualCtEnergyCheckpoint(saved, binding(scope, c), c.timing), saved);
  assert.equal(adapt(scope, { productType: 421, firmware: '1.0.0.41' }, c,
    make([[962, 10], [963, 20], [772, -5], [515, 25]]), `/app/device/property/${scope.device}`, 1000, null, 1000).observation, null);
});
test('empty real registry blocks three-phase even with fresh owned/wiring data; verification flags cannot issue authority', async () => {
  let reads = 0; const q = new DualCtSourceQualifier({ readOwnedSource: async () => { reads++; return readback(1000); }, now: () => 1000 });
  assert.equal((await q.prepare(selection)).status, 'profile_unqualified');
  for (const s of [{ ...selection, verified: true }, { ...selection, firmware: identity.firmware },
    { wiring: 'three_phase', nettingPolicy: 'per_phase_gross' }, { ...selection, account: scope.account }]) {
    assert.equal((await q.prepare(s)).status, 'selection_blocked');
  }
  assert.equal(reads, 1); assert.equal(q.resolve(identity, { kind: 'dual_ct_source_qualification' }), null);
});
test('three-phase contract requires opaque authority; JSON copies and contradictory wiring are rejected', async () => {
  assert.equal(valid(profile, identity), false); assert.equal(binding(scope, profile), null);
  const h = lab(); const { token, contract } = await qualified(h);
  assert.equal(valid(contract, identity), true); assert.equal(valid({ ...contract }, identity), true, 'internal session spread retains authority');
  assert.equal(valid(JSON.parse(JSON.stringify(contract)), identity), false);
  assert.equal(valid({ ...contract, singlePhaseOnly: true }, identity), false);
  assert.equal(valid({ ...contract, nettingPolicy: 'per_phase_gross' }, identity), false);
  assert.equal(valid({ ...contract, id: 'changed' }, identity), false);
  assert.equal(valid(contract, { ...identity, firmware: 'other' }), false);
  assert.equal(legacy(identity), null, 'lab qualification cannot register a production profile');
  assert.equal(lab().q.resolve(identity, token), null, 'qualification belongs to its reader');
  h.q.cancel(); assert.equal(valid(contract, identity), false);
});
test('versioned binding is stable across fresh qualifications/session restart and isolates source/contract changes', async () => {
  const h = lab(); const a = await qualified(h); const key = binding(scope, a.contract);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, binding(scope, { ...profile, wiring: undefined, nettingPolicy: undefined }));
  assert.equal(binding({ ...scope, session: 'new_session' }, a.contract), key);
  for (const field of ['account', 'device', 'grid']) {
    assert.equal(binding({ ...scope, [field]: 'different' }, a.contract), null);
    assert.equal(adapt({ ...scope, [field]: 'different' }, identity, a.contract, mixed,
      `/app/device/property/${scope.device}`, 1000, null, 1000).observation, null);
  }
  h.at(2000); h.row(readback(2000)); const b = await qualified(h);
  assert.equal(binding(scope, b.contract), key); assert.equal(valid(a.contract, identity), false, 'requalification revokes old authority');
  const changed = lab({ profiles: [{ ...profile, id: 'synthetic_three_v2' }] });
  assert.notEqual(binding(scope, (await qualified(changed)).contract), key);
  const sourceChange = lab(); sourceChange.row({ ...readback(1000), account: 'new_account' });
  const c = await qualified(sourceChange); assert.equal(binding(scope, c.contract), null);
  assert.notEqual(binding({ ...scope, account: 'new_account' }, c.contract), key);
});
test('stale, future, unknown, unowned or unreviewed sources fail closed', async () => {
  for (const change of [{ observedAt: -1 }, { observedAt: 1001 }, { observedAt: NaN }, { owned: false },
    { identity: { ...identity, firmware: 'unknown' } }, { wiring: 'single_phase' }, { wiringBasis: 'customer_verified' },
    { nettingPolicy: 'per_phase_gross' }, { device: '' }]) {
    const h = lab(); h.row({ ...readback(1000), ...change }); assert.equal((await h.q.prepare(selection)).qualification, null);
  }
  const stale = lab(); stale.at(91000); assert.equal((await stale.q.prepare(selection)).status, 'source_stale');
  const duplicate = lab({ profiles: [profile, { ...profile }] }); assert.equal((await duplicate.q.prepare(selection)).status, 'profile_unqualified');
});
test('expiry and backward clock revoke qualified bindings without affecting legacy binding', async () => {
  for (const expiredAt of [91000, 999]) {
    const h = lab(); const { contract } = await qualified(h); h.at(expiredAt);
    assert.equal(valid(contract, identity), false); assert.equal(binding(scope, contract), null);
    assert.ok(binding(scope, legacy({ productType: 421, firmware: '1.0.0.41' })));
  }
});
test('late reads, cancellation and failed requalification cannot resurrect older source authority', async () => {
  let finish; const h = lab({ readOwnedSource: () => new Promise(resolve => { finish = resolve; }) });
  const pending = h.q.prepare(selection); h.q.cancel(); finish(readback(1000));
  assert.equal((await pending).status, 'qualification_cancelled');
  const good = lab(); const { contract } = await qualified(good); good.row(null);
  assert.equal((await good.q.prepare(selection)).qualification, null); assert.equal(valid(contract, identity), false);
});
test('profile and readback snapshots cannot be broadened by caller mutation', async () => {
  const profiles = [{ ...profile }], row = readback(1000);
  const h = lab({ profiles, readOwnedSource: async () => row }); profiles[0].firmware = 'changed';
  const { contract } = await qualified(h); row.account = 'changed'; row.identity.firmware = 'changed';
  assert.ok(binding(scope, contract)); assert.equal(valid({ ...contract, freshnessMs: 90000 }, identity), false);
});
function session(h, storage, reviewChanges = {}) {
  return new DualCtGridEnergySession({ scope, identity, readIdentity: () => identity, storage, authority: new DualCtEnergyAuthority(),
    now: () => h.now, resolveContract: () => h.q.resolve(identity, h.token), review: () => ({
      explicitConsent: true, target: 'new_energy_device', accounting: 'power', binding: h.binding,
      grid: scope.grid, inventoryComplete: true, contributors: [], externalOverlapReviewed: true, contractQualified: true, ...reviewChanges }) });
}
async function activeSource(now = 1000) {
  const state = { now }; state.q = new DualCtSourceQualifier({ profiles: [profile], now: () => state.now,
    readOwnedSource: async () => readback(state.now) });
  state.token = (await state.q.prepare(selection)).qualification;
  state.binding = binding(scope, state.q.resolve(identity, state.token)); return state;
}
function memory(initial) { let data = initial; return { writes: 0, read: async () => data,
  async write(value) { this.writes++; data = structuredClone(value); } }; }

test('real preparation session preserves V2 scope across restore, integrates only net CT1 and never backfills gaps', async () => {
  const h = await activeSource(); const storage = memory(); const a = session(h, storage);
  await a.start(); await a.observe(mixed, `/app/device/property/${scope.device}`, 1000, null);
  h.now = 2000; await a.observe(mixed, `/app/device/property/${scope.device}`, 2000, null);
  const saved = await storage.read(); assert.ok(Math.abs(saved.importedWh - 1 / 6) < 1e-9); assert.equal(saved.exportedWh, 0);
  await a.close(); const restored = await activeSource(102000); assert.equal(restored.binding, h.binding);
  const b = session(restored, storage); await b.start(); assert.equal(b.view().candidateCapabilities['meter_power.imported'], saved.importedWh / 1000);
  await b.observe(mixed, `/app/device/property/${scope.device}`, 102000, null);
  assert.deepEqual(await storage.read(), saved, 'restored first sample is only an anchor');
  restored.now += 1000; await b.observe(mixed, `/app/device/property/${scope.device}`, restored.now, null);
  assert.ok((await storage.read()).importedWh > saved.importedWh); restored.q.cancel();
  assert.equal(b.view().candidateCapabilities.measure_power, null); await b.close();
});
test('three-phase path retains overlap/consent protections and cannot migrate a single-phase checkpoint', async () => {
  for (const change of [{ explicitConsent: false }, { contributors: [{ id: 'other_meter', grid: scope.grid, contributes: true }] }]) {
    const h = await activeSource(); const storage = memory(); const s = session(h, storage, change);
    await s.start(); assert.equal(storage.writes, 0); assert.equal(s.view().candidateCapabilities['meter_power.imported'], null); await s.close();
  }
  const old = legacy({ productType: 421, firmware: '1.0.0.41' });
  const checkpoint = makeDualCtEnergyCheckpoint(binding(scope, old), old.timing, 7, 135.123456, 0.765432);
  const h = await activeSource(); const storage = memory(checkpoint); const s = session(h, storage);
  await s.start(); assert.equal(s.view().status, 'checkpoint_invalid'); assert.deepEqual(await storage.read(), checkpoint);
  assert.equal(storage.writes, 0); await s.close();
});
test('qualified three-phase packets require complete phases and total; single-phase constraints are not relaxed', async () => {
  const h = lab(); const { contract } = await qualified(h);
  assert.equal(adapt(scope, identity, contract, mixed, `/app/device/property/${scope.device}`, 1000, null, 1000).observation.signedImportW, 600);
  for (const entries of [[[962, 1], [963, 2], [772, 3]], [[962, 1], [963, 2], [515, 3]],
    [[962, 1], [963, 2], [772, 3], [515, 99]]]) {
    assert.equal(adapt(scope, identity, contract, make(entries), `/app/device/property/${scope.device}`, 1000, null, 1000).observation, null);
  }
});

test('real production single-phase session resumes an existing checkpoint unchanged without any qualification token', async () => {
  const id = { productType: 421, firmware: '1.0.0.41' }, c = legacy(id), key = binding(scope, c);
  let now = 1000;
  const saved = makeDualCtEnergyCheckpoint(key, c.timing, 40, 135.123456, 0.765432), storage = memory(saved);
  const build = () => new DualCtGridEnergySession({ scope, identity: id, readIdentity: () => id, storage,
    authority: new DualCtEnergyAuthority(), now: () => now, review: () => ({ explicitConsent: true,
      target: 'new_energy_device', accounting: 'power', binding: key, grid: scope.grid, inventoryComplete: true,
      contributors: [], externalOverlapReviewed: true, contractQualified: true }) });
  const packet = make([[962, 600], [963, 0], [772, 0], [515, 600]], true);
  const first = build(); await first.start();
  assert.equal(storage.writes, 0); assert.equal(first.view().candidateCapabilities['meter_power.imported'], saved.importedWh / 1000);
  await first.observe(packet, `/app/device/property/${scope.device}`, now, null);
  now += 1000; await first.observe(packet, `/app/device/property/${scope.device}`, now, null);
  const after = await storage.read(); assert.ok(after.importedWh > saved.importedWh); assert.equal(after.exportedWh, saved.exportedWh);
  await first.close(); now = 102000;
  const second = build(); await second.start();
  assert.deepEqual(await storage.read(), after); assert.equal(second.view().candidateCapabilities['meter_power.imported'], after.importedWh / 1000);
  await second.observe(packet, `/app/device/property/${scope.device}`, now, null); assert.deepEqual(await storage.read(), after);
  await second.close();
});
test('an older late read cannot replace a newer qualification, and a clock failure cannot retain authority', async () => {
  let finish; let reads = 0;
  const h = lab({ readOwnedSource: () => ++reads === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(readback(1000)) });
  const old = h.q.prepare(selection); const newer = await h.q.prepare(selection); finish(readback(1000));
  assert.equal((await old).qualification, null); assert.ok(h.q.resolve(identity, newer.qualification));
  let fail = false; const good = lab({ now: () => { if (fail) throw Error('synthetic clock'); return 1000; } });
  const { contract } = await qualified(good); fail = true; assert.equal(valid(contract, identity), false);
});

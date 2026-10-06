'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readStreamControlState, planStreamControl, planStreamControlRestore,
  executeStreamControl, StreamControlFailure,
} = require('../.homeybuild/lib/streamControls');
const { EcoFlowClient } = require('../.homeybuild/lib/EcoFlowClient');
const { currentPriceIsFresh, PRICE_MAX_AGE_MS } = require('../.homeybuild/lib/automationSafety');
const { StreamCmd } = require('../.homeybuild/lib/streamProtocol');

const SN = 'BK61TESTCONTROL01';
const baseline = { charge_limit: 80, discharge_limit: 10, backup_reserve_soc: 20, feed_in_control: false, operating_mode: 'self_powered' };
function ioHarness(options = {}) {
  let state = { ...baseline, ...options.state };
  const writes = [];
  const observations = [];
  let reads = 0;
  let active = true;
  const io = {
    active: () => active,
    wait: async () => {},
    observed: async (value) => { observations.push({ ...value }); },
    read: async () => { reads += 1; return { ...state }; },
    write: async (payload) => {
      writes.push(payload);
      const params = payload.params;
      if (params.cfgMaxChgSoc !== undefined) state.charge_limit = params.cfgMaxChgSoc;
      if (params.cfgMinDsgSoc !== undefined) state.discharge_limit = params.cfgMinDsgSoc;
      if (params.cfgBackupReverseSoc !== undefined) state.backup_reserve_soc = params.cfgBackupReverseSoc;
      if (params.cfgFeedGridMode !== undefined) state.feed_in_control = params.cfgFeedGridMode === 2;
    },
  };
  return { io, writes, observations, reads: () => reads, state: () => state, stop: () => { active = false; } };
}

test('reported controls require supported values and one unambiguous operating mode', () => {
  assert.deepEqual(readStreamControlState({ cmsMaxChgSoc: '80', cmsMinDsgSoc: 10, backupReverseSoc: 20, feedGridMode: 1,
    'energyStrategyOperateMode.operateSelfPoweredOpen': true }), baseline);
  assert.deepEqual(readStreamControlState({ cmsMaxChgSoc: 0, cmsMinDsgSoc: -1, backupReverseSoc: NaN, feedGridMode: 0,
    'energyStrategyOperateMode.operateSelfPoweredOpen': true, 'energyStrategyOperateMode.operateTouModeOpen': 1 }), {});
  assert.deepEqual(readStreamControlState({ cmsMinDsgSoc: '', cmsMaxChgSoc: null, backupReverseSoc: 20.5 }), {});
});

test('invalid numbers, switches and modes cannot produce command payloads', () => {
  for (const value of [NaN, Infinity, -Infinity, '20', null]) {
    assert.throws(() => StreamCmd.backupReserve(SN, value));
    assert.throws(() => StreamCmd.chargeLimit(SN, value));
    assert.throws(() => StreamCmd.dischargeLimit(SN, value));
  }
  assert.throws(() => StreamCmd.feedIn(SN, 'false'));
  assert.throws(() => StreamCmd.operatingMode(SN, 'unknown'));
  assert.throws(() => StreamCmd.operatingMode(SN, '__proto__'));
});

test('plans use normalized setpoints, require restorable baselines and omit already applied commands', () => {
  assert.equal(planStreamControl(SN, { kind: 'charge', value: 120 }, baseline).steps[0].value, 100);
  assert.deepEqual(planStreamControl(SN, { kind: 'charge', value: 80 }, baseline).steps, []);
  assert.throws(() => planStreamControl(SN, { kind: 'reserve', value: 20 }, {}));
  assert.throws(() => planStreamControl(SN, { kind: 'cheap_import', value: 80 }, { discharge_limit: 10, backup_reserve_soc: 20 }));
  const plan = planStreamControl(SN, { kind: 'peak_export', value: 3 }, baseline);
  assert.deepEqual(plan.steps.map(({ key, value }) => [key, value]),
    [['discharge_limit', 0], ['backup_reserve_soc', 3], ['feed_in_control', true]]);
});

test('each cheap-import command is read back before the next and identical requests send no new writes', async () => {
  const h = ioHarness();
  const result = await executeStreamControl(SN, { kind: 'cheap_import', value: 90 }, h.io);
  assert.equal(result.accepted, 2);
  assert.equal(result.verified, 2);
  assert.equal(h.reads(), 3);
  assert.equal(h.observations[1].charge_limit, 100);
  assert.equal(h.observations[1].backup_reserve_soc, 20);
  assert.equal(h.observations[2].backup_reserve_soc, 90);
  const duplicate = await executeStreamControl(SN, { kind: 'cheap_import', value: 90 }, h.io);
  assert.equal(duplicate.accepted, 0);
  assert.equal(h.writes.length, 2);
  assert.equal(h.reads(), 4, 'a cached tile alone never suppresses a command');
});

test('accepted but unapplied commands fail after bounded fresh readbacks, without optimistic values or write retries', async () => {
  const h = ioHarness();
  h.io.write = async (payload) => { h.writes.push(payload); };
  await assert.rejects(executeStreamControl(SN, { kind: 'charge', value: 100 }, h.io), (error) => {
    assert.ok(error instanceof StreamControlFailure);
    assert.equal(error.accepted, 1);
    assert.equal(error.verified, 0);
    assert.equal(error.before.charge_limit, 80);
    return true;
  });
  assert.equal(h.reads(), 4);
  assert.equal(h.writes.length, 1);
  assert.equal(h.observations.at(-1).charge_limit, 80);
});

test('poll failures or absent readback fields cannot confirm a command using matching cached state', async () => {
  const h = ioHarness({ state: { charge_limit: 100 } });
  h.io.read = async () => { throw new Error(`server error for ${SN}: secret`); };
  await assert.rejects(executeStreamControl(SN, { kind: 'charge', value: 100 }, h.io), (error) => {
    assert.equal(error.attempted, 0);
    assert.ok(!error.message.includes(SN));
    assert.ok(!error.message.includes('secret'));
    return true;
  });
  assert.equal(h.writes.length, 0);
  let reads = 0;
  h.io.read = async () => (++reads === 1 ? baseline : {});
  await assert.rejects(executeStreamControl(SN, { kind: 'charge', value: 100 }, h.io), /incomplete/);
  assert.equal(h.writes.length, 1);
});

test('partial rejection retains previous settings, reports accepted versus verified and never auto-rolls back', async () => {
  const h = ioHarness();
  const write = h.io.write;
  h.io.write = async (payload) => {
    if (payload.params.cfgBackupReverseSoc !== undefined) {
      h.writes.push(payload);
      throw new Error('possibly applied before connection failed');
    }
    await write(payload);
  };
  await assert.rejects(executeStreamControl(SN, { kind: 'cheap_import', value: 90 }, h.io), (error) => {
    assert.equal(error.attempted, 2);
    assert.equal(error.accepted, 1);
    assert.equal(error.verified, 1);
    assert.deepEqual(error.before, baseline);
    assert.match(error.message, /may have changed/);
    assert.match(error.message, /No automatic rollback/);
    return true;
  });
  assert.equal(h.writes.length, 2);
  assert.equal(h.state().charge_limit, 100, 'not silently restored to 80');
  // A rejected operation must not poison subsequent queue work.
  assert.equal((await executeStreamControl(SN, { kind: 'charge', value: 80 }, h.io)).verified, 1);
});

test('a conflicting watched setting stops the rest of a multi-command operation', async () => {
  const h = ioHarness();
  const write = h.io.write;
  h.io.write = async (payload) => { await write(payload); h.state().backup_reserve_soc = 50; };
  await assert.rejects(executeStreamControl(SN, { kind: 'cheap_import', value: 90 }, h.io), /incomplete/);
  assert.equal(h.writes.length, 1, 'does not fight the new reserve authority');
  assert.equal(h.state().backup_reserve_soc, 50);
});

test('same-target callers serialize including readback; unrelated targets are independent', async () => {
  const a = ioHarness();
  const b = ioHarness();
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  a.io.wait = async () => { entered(); await new Promise((resolve) => { release = resolve; }); };
  const first = executeStreamControl(SN, { kind: 'charge', value: 100 }, a.io);
  await started;
  const second = executeStreamControl(SN.toLowerCase(), { kind: 'charge', value: 90 }, b.io);
  await Promise.resolve();
  assert.equal(b.reads(), 0);
  const other = ioHarness();
  assert.equal((await executeStreamControl('BK61OTHERCONTROL', { kind: 'charge', value: 90 }, other.io)).verified, 1);
  release();
  await first;
  await second;
  assert.equal(b.writes.length, 1);
});

test('queue is bounded, releases rejected callers and does not send after shutdown', async () => {
  const h = ioHarness();
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  h.io.wait = async () => { entered(); await new Promise((resolve) => { release = resolve; }); };
  const pending = [executeStreamControl(SN, { kind: 'charge', value: 100 }, h.io)];
  await started;
  for (let i = 0; i < 7; i += 1) pending.push(executeStreamControl(SN, { kind: 'charge', value: 90 }, h.io));
  const settled = Promise.allSettled(pending);
  await assert.rejects(executeStreamControl(SN, { kind: 'charge', value: 90 }, h.io), /Too many pending/);
  h.stop();
  release();
  assert.ok((await settled).every((result) => result.status === 'rejected'));
  assert.equal(h.writes.length, 1, 'the in-flight write may have applied, but no queued write starts');
  assert.equal((await executeStreamControl(SN, { kind: 'charge', value: 80 }, ioHarness().io)).accepted, 0);
});

test('manual restore planning includes discharge limit and uses safe reserve ordering, without executing it', () => {
  const current = { ...baseline, charge_limit: 100, discharge_limit: 0, backup_reserve_soc: 3, feed_in_control: true };
  const restore = planStreamControlRestore(SN, baseline, current,
    ['charge_limit', 'discharge_limit', 'backup_reserve_soc', 'feed_in_control']);
  assert.deepEqual(restore.map(({ key, value }) => [key, value]),
    [['feed_in_control', false], ['charge_limit', 80], ['backup_reserve_soc', 20], ['discharge_limit', 10]]);
  assert.deepEqual(current, { ...baseline, charge_limit: 100, discharge_limit: 0, backup_reserve_soc: 3, feed_in_control: true });
  const highLimit = planStreamControlRestore(SN, baseline, { ...current, discharge_limit: 30 }, ['backup_reserve_soc', 'discharge_limit']);
  assert.deepEqual(highLimit.map(({ key, value }) => [key, value]),
    [['discharge_limit', 17], ['backup_reserve_soc', 20], ['discharge_limit', 10]]);
  assert.throws(() => planStreamControlRestore(SN, { ...baseline, backup_reserve_soc: 3 }, current, ['backup_reserve_soc']));
  assert.throws(() => planStreamControlRestore(SN, baseline, {}, ['charge_limit']));
});

test('fresh control reads bypass both normal cached snapshots and pre-command in-flight polls', async () => {
  const client = new EcoFlowClient({ accessKey: 'test-sprint4-cache', secretKey: 'test-only-secret' });
  let calls = 0;
  client.request = async () => ({ sequence: ++calls });
  assert.equal((await client.getQuotaAll(SN)).sequence, 1);
  assert.equal((await client.getQuotaAll(SN)).sequence, 1);
  assert.equal((await client.getQuotaAll(SN, { fresh: true })).sequence, 2);
  let release;
  client.request = async () => (++calls === 3 ? new Promise((resolve) => { release = resolve; }) : { sequence: calls });
  const old = client.getQuotaAll('BK61PENDINGREAD');
  assert.equal((await client.getQuotaAll('BK61PENDINGREAD', { fresh: true })).sequence, 4);
  release({ sequence: 3 });
  assert.equal((await old).sequence, 3);
});

test('price validity rejects stale, missing, future and invalid inputs without rejecting fresh negative prices', () => {
  const now = 10000000;
  assert.equal(currentPriceIsFresh(-5, now - 1000, now), true);
  assert.equal(currentPriceIsFresh(0, now - PRICE_MAX_AGE_MS, now), true);
  assert.equal(currentPriceIsFresh(-5, now - PRICE_MAX_AGE_MS - 1, now), false);
  assert.equal(currentPriceIsFresh(-5, 0, now), false);
  assert.equal(currentPriceIsFresh(-5, now + 1, now), false);
  for (const price of [undefined, null, '', '10', NaN, Infinity]) assert.equal(currentPriceIsFresh(price, now, now), false);
});

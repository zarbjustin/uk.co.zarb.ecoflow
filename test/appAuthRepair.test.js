'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const auth = require('../.homeybuild/lib/appAuthPairing');
const { registerAppAuthRepair } = require('../.homeybuild/lib/appAuthRepair');
const { dualCtAccountBinding } = require('../.homeybuild/lib/dualCtPreviewPairing');
const sessionInfo = { host: 'https://api.ecoflow.com', userId: 'synthetic' };
const input = { email: 'synthetic@example.invalid', password: 'synthetic-password', host: sessionInfo.host };
function harness(t, options = {}) {
  let now = 1000, commits = 0, account = sessionInfo, rows = null, resumes = 0;
  const settings = new Map([['appAuthEmail', 'old@example.invalid'], ['appAuthPassword', 'old-synthetic-password'], ['appAuthHost', sessionInfo.host]]);
  const baseline = [...settings];
  const current = { getData: () => ({ sn: 'DUALCTSYNTHETIC01' }), getStoreValue: key => key === 'dualCtAccountBinding' ? dualCtAccountBinding(sessionInfo) : undefined,
    resumeAppAccountAfterRepair: async () => { resumes++; } };
  const others = [];
  const homey = { __: () => 'Safe account repair failure', drivers: { getDriver: id => id === 'smartmeter_dual_ct_preview' ? { getDevices: () => [current, ...others] } : { getDevices: () => [] } },
    settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, value), unset: key => settings.delete(key) } };
  t.mock.method(auth, 'registerAppAuthHandlers', (_driver, pairing) => {
    pairing.setHandler('app_login', async () => true);
    return { getClient: () => ({ getSession: async () => account, getDeviceList: async () => rows || [current, ...others].map(d => ({ sn: d.getData().sn, shared: false })) }),
      commit() { commits++; homey.settings.set('appAuthEmail', input.email);
        if (options.partialFailure) throw new Error('PRIVATE_PASSWORD');
        if (options.silentFailure) return;
        homey.settings.set('appAuthPassword', input.password); homey.settings.set('appAuthHost', sessionInfo.host); }, dispose() {} };
  });
  const handlers = new Map(); registerAppAuthRepair({ homey }, { setHandler: (name, handler) => handlers.set(name, handler) }, current, () => now);
  return { homey, call: (name, data) => handlers.get(name)(data), counters: () => ({ commits, resumes }), settings, baseline, others,
    now: n => { now = n; }, account: a => { account = a; }, rows: r => { rows = r; } };
}
test('repair saves only after source-bound confirmation, reads back credentials and preserves device definitions', async t => {
  const h = harness(t); const review = await h.call('app_account_repair_login', input);
  assert.equal(review.affectedDevices, 1); assert.deepEqual([...h.settings], h.baseline); assert.equal(h.counters().commits, 0);
  const result = await h.call('app_account_repair_confirm', { token: review.token, accepted: true });
  assert.deepEqual(result, { saved: true, resumeRequestsCompleted: true, existingDevicesChanged: false, energyActivated: false });
  assert.equal(h.settings.get('appAuthPassword'), input.password); assert.equal(h.counters().resumes, 1);
  await assert.rejects(h.call('app_account_repair_confirm', { token: review.token, accepted: true })); assert.equal(h.counters().commits, 1);
});
test('shared or changed account ownership cannot replace the existing sign-in', async t => {
  for (const mode of ['shared', 'account']) {
    const h = harness(t);
    if (mode === 'shared') h.rows([{ sn: 'DUALCTSYNTHETIC01', shared: true }]);
    else h.account({ ...sessionInfo, userId: 'other-synthetic' });
    await assert.rejects(h.call('app_account_repair_login', input), /Safe account repair/);
    assert.deepEqual([...h.settings], h.baseline); assert.equal(h.counters().commits, 0);
  }
});
test('expired, cancelled or changed device/settings review cannot commit late credentials', async t => {
  for (const mode of ['expired', 'cancelled', 'inventory', 'settings']) {
    const h = harness(t); const review = await h.call('app_account_repair_login', input);
    if (mode === 'expired') h.now(91000);
    if (mode === 'cancelled') await h.call('disconnect');
    if (mode === 'inventory') h.others.push({ getData: () => ({ sn: 'OTHERSYNTHETIC01' }) });
    if (mode === 'settings') h.settings.set('appAuthPassword', 'another-owner-edit');
    await assert.rejects(h.call('app_account_repair_confirm', { token: review.token, accepted: true })); assert.equal(h.counters().commits, 0, mode);
  }
});
test('partial or silent credential-write failure is detected, rolled back where possible and never reported as saved', async t => {
  for (const options of [{ partialFailure: true }, { silentFailure: true }]) {
    const h = harness(t, options); const review = await h.call('app_account_repair_login', input);
    await assert.rejects(h.call('app_account_repair_confirm', { token: review.token, accepted: true }), error => {
      assert.doesNotMatch(error.message, /PRIVATE_PASSWORD/); return /Safe account repair/.test(error.message);
    });
    assert.deepEqual([...h.settings], h.baseline); assert.equal(h.counters().resumes, 0);
  }
});

test('unreadable driver inventory fails closed instead of silently overlooking another account consumer', async t => {
  const h = harness(t); h.homey.drivers.getDriver = () => { throw new Error('PRIVATE'); };
  await assert.rejects(h.call('app_account_repair_login', input), /Safe account repair failure/);
  assert.equal(h.counters().commits, 0);
});

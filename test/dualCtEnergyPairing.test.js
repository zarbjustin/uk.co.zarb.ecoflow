'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const auth = require('../.homeybuild/lib/appAuthPairing');
const { registerDualCtEnergyPairing } = require('../.homeybuild/lib/dualCtEnergyPairing');
const { DualCtHomeyEnergyContext } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
const sn = 'DUALCTSYNTHETIC01'; const identity = { productType: 421, firmware: 'synthetic.1' };
const contract = { id: 'synthetic_contract', ...identity, channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive',
  timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
function harness(t, production = false, community = false) {
  let committed = 0, network = 0, disposed = 0, now = 1000, firmware = community ? '1.0.0.41' : 'synthetic.1', enabled = true, devices = {};
  const handlers = new Map(); const session = { setHandler: (name, fn) => handlers.set(name, fn) };
  const client = { getSession: async () => ({ host: 'https://api.ecoflow.com', userId: 'synthetic' }),
    getDeviceList: async () => { network++; return [{ sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] }]; } };
  t.mock.method(auth, 'registerAppAuthHandlers', (_driver, pairing) => {
    pairing.setHandler('app_login', async () => { network++; return true; });
    pairing.setHandler('check_app_credentials', async () => true);
    return { getClient: () => client, commit() { committed++; }, dispose() { disposed++; } };
  });
  const driver = { homey: { __: () => 'Source unavailable' }, getDevices: () => [] };
  const dependencies = { enabled: () => enabled, resolve: () => contract, now: () => now,
    context: (selected, getClient, communityThreePhase) => new DualCtHomeyEnergyContext({ homey: {}, sn: selected, client: getClient, communityThreePhase, now: () => now,
      readFirmware: async () => firmware, reader: async () => ({ list: async () => devices, close() {} }) }) };
  if (production) registerDualCtEnergyPairing(driver, session); else registerDualCtEnergyPairing(driver, session, dependencies);
  const call = (name, input) => handlers.get(name)(input);
  return { call, counters: () => ({ committed, network, disposed }), now: n => { now = n; }, firmware: f => { firmware = f; },
    disable: () => { enabled = false; }, devices: d => { devices = d; }, async review() {
      await call('dual_ct_energy_candidates'); return call('dual_ct_energy_review', { sn });
    }, async prepared() { const review = await this.review(); await call('dual_ct_energy_approve', { token: review.token, consent: true, externalOverlapReviewed: true }); return (await call('list_devices'))[0]; } };
}
test('withdrawn entry blocks login/discovery/adoption before any network request or credential commit', async t => {
  const h = harness(t); h.disable(); assert.deepEqual(await h.call('dual_ct_energy_access'), { enabled: false });
  for (const event of ['app_login', 'dual_ct_energy_candidates', 'dual_ct_energy_review', 'list_devices', 'add_device']) await assert.rejects(h.call(event, { sn }), /unavailable/);
  assert.deepEqual(h.counters(), { committed: 0, network: 0, disposed: 0 });
});
test('actual pairing workflow returns a source-bound row and commits credentials only on one native Add', async t => {
  const h = harness(t); const row = await h.prepared();
  assert.equal(row.data.sn, sn); assert.equal(row.store.dualCtEnergyConsent, 1); assert.equal(h.counters().committed, 0);
  await h.call('add_device', row); assert.equal(h.counters().committed, 1);
  await assert.rejects(h.call('add_device', row)); assert.equal(h.counters().committed, 1);
});
test('changed overlap, firmware, expired review, forged binding or activation withdrawal cannot commit at final Add', async t => {
  for (const change of ['overlap', 'firmware', 'expired', 'forged', 'disabled']) {
    const h = harness(t); const row = await h.prepared();
    if (change === 'overlap') h.devices({ other: { id: 'other', capabilities: ['measure_power'], energyObj: { cumulative: true }, settings: {} } });
    if (change === 'firmware') h.firmware('synthetic.2');
    if (change === 'expired') h.now(91000);
    if (change === 'forged') row.store.dualCtEnergySourceBinding = 'b'.repeat(64);
    if (change === 'disabled') h.disable();
    await assert.rejects(h.call('add_device', row), /unavailable/); assert.equal(h.counters().committed, 0, change);
  }
});
test('cancellation and pending sign-in changes discard the review and never save credentials', async t => {
  const h = harness(t); const review = await h.review(); await h.call('dual_ct_energy_cancel');
  await assert.rejects(h.call('dual_ct_energy_approve', { token: review.token, consent: true, externalOverlapReviewed: true }));
  await h.review(); await h.call('app_login'); await assert.rejects(h.call('list_devices'));
  await h.call('disconnect'); assert.equal(h.counters().committed, 0); assert.equal(h.counters().disposed, 1);
});

test('community pairing uses current owned firmware, explicit consent and native mode-bound Add', async t => {
  const h=harness(t,false,true);await h.call('dual_ct_energy_candidates');
  await assert.rejects(h.call('dual_ct_energy_review',{sn,mode:'three_phase_community'}));
  const review=await h.call('dual_ct_energy_review',{sn,mode:'three_phase_community',communityConsent:true});
  assert.equal(review.communityTrial,true);
  await h.call('dual_ct_energy_approve',{token:review.token,consent:true,externalOverlapReviewed:true});
  const row=(await h.call('list_devices'))[0];assert.equal(row.store.dualCtEnergyMode,'three_phase_community');
  assert.match(row.name,/three-phase trial/);await h.call('add_device',row);assert.equal(h.counters().committed,1);
});
test('legacy pairing cannot inject trial mode; trial firmware drift cannot commit a stale native Add',async t=>{
  const legacy=harness(t);const row=await legacy.prepared();row.store.dualCtEnergyMode='three_phase_community';
  await assert.rejects(legacy.call('add_device',row));assert.equal(legacy.counters().committed,0);
  const h=harness(t,false,true);await h.call('dual_ct_energy_candidates');
  const review=await h.call('dual_ct_energy_review',{sn,mode:'three_phase_community',communityConsent:true});
  await h.call('dual_ct_energy_approve',{token:review.token,consent:true,externalOverlapReviewed:true});
  const trial=(await h.call('list_devices'))[0];h.firmware('unknown');await assert.rejects(h.call('add_device',trial));
  assert.equal(h.counters().committed,0);
});

test('review failures expose only bounded source and overlap classifications', async t => {
  const h=harness(t,false,true);await h.call('dual_ct_energy_candidates');h.firmware('unsupported.1');
  await assert.rejects(h.call('dual_ct_energy_review',{sn,mode:'three_phase_community',communityConsent:true}),/^Error: DUAL_CT_REVIEW:contract_blocked$/);
  h.firmware('1.0.0.41');h.devices({other:{id:'other',capabilities:['measure_power'],energyObj:{cumulative:true},settings:{}}});
  await assert.rejects(h.call('dual_ct_energy_review',{sn,mode:'three_phase_community',communityConsent:true}),/^Error: DUAL_CT_REVIEW:grid_source_overlap$/);
  assert.equal(h.counters().committed,0);
});

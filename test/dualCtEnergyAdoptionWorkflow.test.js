'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { DualCtEnergyAdoptionWorkflow } = require('../.homeybuild/lib/dualCtEnergyAdoptionWorkflow');
const contract = { id: 'synthetic_contract', productType: 421, firmware: 'synthetic.1', channel: 'ct1', bank: 'A', unit: 'W',
  importSign: 'positive', timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
const clone = x => JSON.parse(JSON.stringify(x));
function harness(options = {}) {
  let now = 1000; let gate = true;
  const selected = { account: 'synthetic_account', device: 'SYNTHETICDUALCT01', grid: 'property', owned: true,
    identity: { productType: 421, firmware: 'synthetic.1' }, identityObservedAt: 1000 };
  const inventory = { account: selected.account, observedAt: 1000, complete: true,
    contributors: [{ id: 'office_submeter', grid: 'property', contributes: false }] };
  let reads = 0;
  const workflow = new DualCtEnergyAdoptionWorkflow({ readSelection: async () => { reads++; return clone(selected); },
    readInventory: async () => clone(inventory), resolveContract: () => contract, runtimeEnabled: () => gate, now: () => now, ...options });
  return { workflow, selected, inventory, reads: () => reads, time: x => { now = x; }, disable: () => { gate = false; },
    async confirm(review) { return workflow.confirm({ token: review.token, consent: true, externalOverlapReviewed: true }); } };
}

test('default registry blocks preparation; explicit labels/firmware text cannot register a source', async () => {
  const h = harness({ resolveContract: undefined }); await assert.rejects(h.workflow.prepare(), /contract_blocked/);
});
test('source-specific review returns no identity or readings; one confirmed Add uses only server selection', async () => {
  const h = harness(); const review = await h.workflow.prepare();
  assert.doesNotMatch(JSON.stringify(review), /synthetic_account|SYNTHETICDUAL|property.*grid|watts|password/);
  const result = await h.confirm(review); assert.equal(result.data.sn, h.selected.device);
  assert.equal(result.store.dualCtEnergyConsent, 1); assert.match(result.store.dualCtEnergySourceBinding, /^[a-f0-9]{64}$/);
  await assert.rejects(h.confirm(review), /review_consent_required/);
});
test('confirmation requires all consents and cannot convert an existing preview or trust supplied data', async () => {
  const h = harness(); const review = await h.workflow.prepare();
  await assert.rejects(h.workflow.confirm({ token: review.token, consent: true, externalOverlapReviewed: false }), /review_consent_required/);
  const fresh = await h.workflow.prepare();
  const result = await h.workflow.confirm({ token: fresh.token, consent: true, externalOverlapReviewed: true,
    data: { sn: 'FOREIGN' }, store: { verified: true }, target: 'existing_preview' });
  assert.equal(result.data.sn, h.selected.device); assert.equal(result.store.verified, undefined);
});
test('withdrawn runtime gate rejects confirmation before repeating discovery', async () => {
  const h = harness({ runtimeEnabled: () => false }); const review = await h.workflow.prepare(); const reads = h.reads();
  await assert.rejects(h.confirm(review), /runtime_blocked/); assert.equal(h.reads(), reads);
});
test('review age is bounded and clock reversal cannot confirm an old selection', async () => {
  for (const at of [999, 91000]) {
    const h = harness(); const review = await h.workflow.prepare(); h.time(at);
    await assert.rejects(h.confirm(review), /review_expired/);
  }
});
test('fresh inventory and firmware are required; included office/property meter blocks adoption', async () => {
  for (const change of ['identity', 'inventory', 'incomplete', 'overlap', 'duplicate', 'foreign', 'unowned']) {
    const h = harness();
    if (change === 'identity') h.selected.identityObservedAt = 1;
    if (change === 'inventory') h.inventory.observedAt = 1;
    if (change === 'incomplete') h.inventory.complete = false;
    if (change === 'overlap') h.inventory.contributors[0].contributes = true;
    if (change === 'duplicate') h.inventory.contributors.push({ ...h.inventory.contributors[0] });
    if (change === 'foreign') h.inventory.account = 'other';
    if (change === 'unowned') h.selected.owned = false;
    if (['identity', 'inventory'].includes(change)) h.time(90001);
    await assert.rejects(h.workflow.prepare());
  }
});
test('source, firmware, account or contributor changes require another review, including newly added excluded devices', async () => {
  for (const change of ['source', 'firmware', 'account', 'inventory']) {
    const h = harness(); const review = await h.workflow.prepare();
    if (change === 'source') h.selected.device = 'SYNTHETICOTHER01';
    if (change === 'firmware') h.selected.identity.firmware = 'synthetic.2';
    if (change === 'account') { h.selected.account = 'other'; h.inventory.account = 'other'; }
    if (change === 'inventory') h.inventory.contributors.push({ id: 'second', grid: 'property', contributes: false });
    await assert.rejects(h.confirm(review), /review_changed|contract_blocked/);
  }
});
test('cancellation and activation withdrawal fence late asynchronous confirmation', async () => {
  for (const cancel of [true, false]) {
    let block = false; let release; let entered;
    const pending = new Promise(r => { entered = r; });
    const h = harness({ readInventory: async () => { if (block) { entered(); await new Promise(r => { release = r; }); } return clone(h.inventory); } });
    const review = await h.workflow.prepare(); block = true;
    const confirmed = h.confirm(review); await pending;
    if (cancel) h.workflow.cancel(); else h.disable(); release();
    await assert.rejects(confirmed, /review_cancelled|runtime_blocked/);
  }
});
test('concurrent confirmations cannot consume the same reviewed source twice', async () => {
  const h = harness(); const review = await h.workflow.prepare();
  const outcomes = await Promise.allSettled([h.confirm(review), h.confirm(review)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
});
test('errors from discovery/inventory are scrubbed before reaching a pairing UI', async () => {
  for (const key of ['readSelection', 'readInventory']) {
    const h = harness({ [key]: async () => { throw new Error('PRIVATE_TOKEN'); } });
    await assert.rejects(h.workflow.prepare(), error => !error.message.includes('PRIVATE_TOKEN'));
  }
});

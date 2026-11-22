'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('../settings/dual-ct-contract');
const { DUAL_CT_BANKS, dualCtBankCandidate } = require('../.homeybuild/lib/dualCtBanks');
const { DUAL_CT_FIELD_DEFINITIONS, dualCtReadingTime } = require('../.homeybuild/lib/dualCtContract');
const { decodeDualCtCandidates } = require('../.homeybuild/lib/dualCtDecoder');
const { DualCtChannels } = require('../.homeybuild/lib/dualCtChannels');
const { bankCandidate } = require('../settings/dual-ct-status');

test('browser and compiled backend consume the same frozen research profile with unique field definitions', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../settings/dual-ct-contract.js'), 'utf8'), sandbox);
  assert.equal(JSON.stringify(sandbox.EcoFlowDualCtContract.banks), JSON.stringify(DUAL_CT_BANKS));
  assert.deepEqual(DUAL_CT_FIELD_DEFINITIONS, contract.fields);
  assert.equal(new Set(contract.fields.map(row => row.field)).size, 20);
  assert.equal(Object.isFrozen(contract.banks[0].power), true);
  assert.equal(Object.isFrozen(contract.fields[0]), true);
  assert.throws(() => { contract.banks[0].power[0] = 9; });
  for (const row of contract.fields) assert.deepEqual(bankCandidate(row.field), dualCtBankCandidate(row.field));
  for (const flag of ['mappingVerified', 'unitsVerified', 'directionVerified']) assert.equal(contract[flag], false);
});

test('expiry is strictly less than 90 seconds across profile, decoder and normalized adapter', () => {
  // Two synthetic float32 fields, explicit plaintext. No customer capture.
  const payload = Buffer.from([0x9d,0x20,0,0,0x80,0x3f,0x95,0x3c,0,0,0x80,0x3f]);
  for (const age of [0, 89999, 90000, 90001]) {
    const fresh = age < 90000;
    assert.equal(contract.isFreshAge(age), fresh);
    assert.equal(dualCtReadingTime(1000, 1000, 1000 + age).valid, fresh);
    assert.equal(Boolean(decodeDualCtCandidates(payload, {productType:421,cmdFunc:254,cmdId:21,
      source:'app_mqtt',encoding:'plain',receivedAt:1000,now:1000+age})), fresh);
    const state = new DualCtChannels();
    state.configure({ct1:{role:'unknown',source:'app_live',importSign:null},ct2:{role:'unknown',source:null,importSign:null}});
    assert.equal(state.observe('ct1','powerW',1,'W','app_live',1000,1000,1000+age),fresh);
    const snapshot = state.snapshot(1000+age);
    assert.equal(snapshot.channels[0].metrics.powerW.value, fresh ? 1 : null);
  }
  for (const age of [-1, Infinity, NaN]) assert.equal(contract.isFreshAge(age), false);
});

test('unknown measurement timestamp remains receipt-only and cannot be used for snapshot freshness or direction', () => {
  const state = new DualCtChannels();
  state.configure({ct1:{role:'grid',source:'app_live',importSign:'positive'},ct2:{role:'unknown',source:'device_snapshot',importSign:null}});
  assert.equal(state.observe('ct1','powerW',-30,'W','app_live',1000,null,1000),true);
  const first = state.snapshot(1000).channels[0];
  assert.equal(first.metrics.powerW.status,'recent_receipt');
  assert.equal(first.metrics.powerW.measurementAgeSec,null);
  assert.equal(first.metrics.powerW.timeBasis,'receipt_only');
  assert.equal(first.gridImportW,null); assert.equal(first.gridExportW,null);
  assert.equal(state.observe('ct2','powerW',30,'W','device_snapshot',1000,null,1000),false);
  assert.equal(state.observe('ct1','powerW',30,'W','app_live',1000,null,1000),false);
  assert.equal(state.snapshot(91000).channels[0].metrics.powerW.value,null);
});

test('unknown time, invalid clock and rollback never resurrect a prior measurement', () => {
  for (const clock of [NaN, Infinity, -1, 999]) {
    const state = new DualCtChannels();
    state.configure({ct1:{role:'grid',source:'app_live',importSign:'positive'},ct2:{role:'unknown',source:null,importSign:null}});
    state.observe('ct1','powerW',30,'W','app_live',1000,1000,1000);
    state.snapshot(clock);
    assert.equal(state.snapshot(1001).channels[0].metrics.powerW.value,null);
  }
  assert.equal(dualCtReadingTime(1000, undefined, 1000).valid,false);
  assert.equal(dualCtReadingTime(1000, 1001, 1001).valid,false);
});

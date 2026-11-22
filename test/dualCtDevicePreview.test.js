'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DualCtDevicePreview}=require('../.homeybuild/lib/dualCtDevicePreview');
const {scalar,packet,context}=require('./helpers/dualCtSynthetic');
const scope={account:'synthetic-account',device:'synthetic-meter-a',session:'synthetic-session'};
const value=(snapshot,field)=>snapshot.banks.flatMap(bank=>bank.readings).find(row=>row.field===field);

test('disabled adapter exposes separate bank/phase candidates without CT-port, direction, Energy or capability assignment',()=>{
  const adapter=new DualCtDevicePreview(scope);assert.equal(adapter.observe(scope,packet(),context(1000)),true);
  const view=adapter.snapshot(1000);assert.equal(view.banks.length,2);assert.equal(view.proposedMetrics.length,20);
  assert.equal(view.availability,'recent_receipts_only');assert.deepEqual(view.appliedCapabilities,[]);
  assert.equal(value(view,515).status,'recent_receipt');assert.equal(value(view,515).measurementAgeSec,null);
  assert.equal(value(view,515).timeBasis,'receipt_only');assert.equal(value(view,772).value,-1);
  assert.equal(value(view,991).phase,1);assert.equal(value(view,985).suggestedUnit,'V');
  assert.ok(view.banks.every(bank=>bank.role==='unverified'&&bank.physicalCtPort===null));
  for(const key of ['hardwareValidated','pairingEnabled','contributesToEnergy','controlsEnabled','bankToPortMappingVerified','directionVerified'])assert.equal(view[key],false);
  assert.equal(view.combinedGridW,null);assert.doesNotMatch(JSON.stringify(view),/synthetic-|ct1|ct2/);
  view.banks[0].readings[0].value=999;assert.notEqual(value(adapter.snapshot(1000),515).value,999);
});

test('unwired adapter preserves per-phase ages, exact expiry and packet-only coherence',()=>{
  const adapter=new DualCtDevicePreview(scope);adapter.observe(scope,packet(),context(1000));
  const partial=Buffer.concat([scalar(956,240),scalar(957,241)]);
  adapter.observe(scope,partial,context(90000));const view=adapter.snapshot(91000);
  assert.equal(value(view,515).value,null);assert.equal(value(view,515).status,'stale');
  assert.equal(value(view,956).value,240);assert.equal(value(view,956).receiptAgeSec,1);
  assert.equal(view.banks[0].latestPacketCheck,'partial');assert.equal(view.banks[1].latestPacketCheck,'partial');
  assert.equal(adapter.snapshot(180000).availability,'stale');
  assert.equal(adapter.observe(scope,packet(2),context(180000,90000)),false);
});

test('runtime identity scope prevents anonymous index reuse, stale sessions and foreign-meter clock resets',()=>{
  const adapter=new DualCtDevicePreview(scope);adapter.observe(scope,packet(),context(1000));
  for(const key of ['account','device','session'])assert.equal(adapter.observe({...scope,[key]:'different'},packet(5),context(1)),false);
  assert.equal(value(adapter.snapshot(1000),515).value,2);
  const other={...scope,device:'synthetic-meter-b'};adapter.replaceScope(other);
  assert.equal(adapter.snapshot(1001).availability,'disconnected');
  assert.equal(adapter.observe(scope,packet(),context(1002)),false);
  assert.equal(adapter.observe(other,packet(3),context(1002)),true);
  assert.equal(value(adapter.snapshot(1002),515).value,4);
  assert.equal(adapter.replaceScope({...scope,account:''}),false);
  assert.equal(adapter.observe(other,packet(),context(1003)),false);
});

test('duplicates, malformed headers, stale transport, disconnect and clock failures cannot restore old readings',()=>{
  const adapter=new DualCtDevicePreview(scope);adapter.observe(scope,packet(),context(1000));
  for(const ctx of [context(1000),context(2000,999),context(2000,3000),context(2000,2000,{source:'developer_rest'}),
    context(2000,2000,{productType:211}),context(2000,2000,{encoding:'masked'})])assert.equal(adapter.observe(scope,packet(9),ctx),false);
  assert.equal(value(adapter.snapshot(2000),962).value,1);
  adapter.disconnect();assert.equal(adapter.snapshot(2001).availability,'disconnected');
  adapter.observe(scope,packet(),context(3000));adapter.snapshot(2999);
  assert.equal(adapter.snapshot(3001).availability,'disconnected');
  adapter.observe(scope,packet(),context(4000));adapter.snapshot(NaN);
  assert.equal(adapter.snapshot(4001).availability,'disconnected');
});

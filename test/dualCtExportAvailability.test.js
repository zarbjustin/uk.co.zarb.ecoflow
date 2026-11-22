'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {candidateExportAvailability:state}=require('../settings/dual-ct-status');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
const {packet,context}=require('./helpers/dualCtSynthetic');
const id='11111111-1111-4111-8111-111111111111';
test('export availability distinguishes missing capture, missing samples, rejected payloads and unavailable snapshots',()=>{
  for(const [input,expected] of [[null,'not_loaded'],[{enabled:false},'numeric_disabled'],
    [{enabled:true,reason:'disabled'},'numeric_disabled'],[{reason:'no_samples'},'no_samples'],
    [{reason:'no_eligible_meter'},'no_eligible_meter'],[{reason:'model_unverified'},'no_eligible_meter'],
    [{enabled:true,reason:'ready'},'capture_missing'],[{captureId:id,enabled:true},'no_snapshot'],
    [{captureId:id,enabled:true,diagnosticSnapshot:{}},'snapshot_invalid']])assert.equal(state(input,false,false),expected);
  for(const reason of ['missing_encoding','unsupported_encoding','invalid_header','no_supported_candidates','omitted_encoding_rejected']){
    assert.equal(state({captureId:id,reason},false,false),'decode_blocked');
  }
});
test('sharing availability depends on validated data, not format selection; stale live readings can still have retained historical evidence',()=>{
  for(const reason of ['ready','expired']){
    assert.equal(state({captureId:id,reason},true,true),'ready');
    assert.equal(state({captureId:id,reason},true,false),'scalar_only');
  }
  assert.equal(state({captureId:'invalid'},true,true),'capture_missing');
  assert.equal(state({captureId:id,reason:'expired',diagnosticSnapshot:{retentionRemainingSec:0}},false,false),'expired');
  assert.equal(state({captureId:id,diagnosticSnapshot:{retainedForSec:900}},false,false),'expired');
});
test('known lifecycle/transport failures yield fixed safe explanations without raw exception details',()=>{
  for(const reason of ['stopped','account_changed','capture_unavailable','request_failed']){
    assert.equal(state({reason,error:'PRIVATE',device:'PRIVATE'},false,false),reason);
  }
  for(const language of ['en','de','nl']){
    const translations=require(`../locales/${language}.json`).settings.dual_ct;
    for(const code of ['not_loaded','refreshing','starting','ready','scalar_only','numeric_disabled','no_samples',
      'no_eligible_meter','decode_blocked','capture_missing','snapshot_invalid','no_snapshot','expired','stopped',
      'account_changed','capture_unavailable','request_failed','clock_changed'])assert.equal(typeof translations['export_'+code],'string',language+': '+code);
  }
});

test('real preview expiry distinguishes expired live fields from a removed historical snapshot on later refresh',()=>{
  const preview=new DualCtPreview(true,true);
  try{
    preview.observe(0,packet(),context(1000));
    const historical={...preview.snapshot(91000),captureId:id};
    assert.equal(historical.reason,'expired');assert.ok(historical.diagnosticSnapshot);
    assert.equal(state(historical,true,true),'ready','90-second live expiry is not historical expiry');
    const expired={...preview.snapshot(901000),captureId:id};
    assert.equal(expired.reason,'expired');assert.equal(expired.diagnosticSnapshot,null);
    assert.equal(state(expired,false,false),'expired','later refresh must explain that retention ended');
  }finally{preview.clear();}
});

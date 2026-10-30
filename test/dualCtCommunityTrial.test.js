'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DualCtCommunityTrial}=require('../.homeybuild/lib/dualCtCommunityTrial');
const {DualCtCommunityFeedback}=require('../.homeybuild/lib/dualCtCommunityFeedback');
const {dualCtGridBinding:binding,resolveDualCtGridEnergyContract:legacy,dualCtGridContractValid:valid}=require('../.homeybuild/lib/dualCtGridEnergySource');
const {DualCtGridEnergySession}=require('../.homeybuild/lib/dualCtGridEnergySession');
const {DualCtEnergyAuthority}=require('../.homeybuild/lib/dualCtEnergyAdoption');
const {varint,scalar}=require('./helpers/dualCtSynthetic');
const scope={account:'synthetic_account',device:'SYNTHETICDUALCT01',session:'one',grid:'synthetic_home'};
const identity={productType:421,firmware:'1.0.0.41'};
const source=at=>({...scope,owned:true,identity:{...identity},identityObservedAt:at});
const frame=rows=>{const nested=(f,b)=>Buffer.concat([varint(f*8+2),varint(b.length),b]);
  return nested(1,Buffer.concat([nested(1,Buffer.concat(rows.map(([f,v])=>scalar(f,v)))),varint(8*8),varint(254),varint(9*8),varint(21)]));};
const packet=(p=[2000,-1500,-1000])=>frame([[962,p[0]],[963,p[1]],[772,p[2]],[515,p.reduce((a,b)=>a+b,0)],
  [991,10000],[992,10000],[993,10000],[998,30000]]);
test('community authority cannot alter legacy resolution, forge qualification or migrate the single-phase binding',()=>{
  let now=1000;const trial=new DualCtCommunityTrial(()=>now);trial.refresh(source(now));const c=trial.resolve(identity);
  assert.equal(c.communityTrial,true);assert.equal(valid(c,identity),true);
  assert.equal(valid(JSON.parse(JSON.stringify(c)),identity),false);
  assert.equal(valid({...c,communityTrial:undefined},identity),false);
  assert.equal(valid({...c,singlePhaseOnly:true},identity),false);
  assert.equal(legacy(identity).singlePhaseOnly,true);assert.equal(legacy(identity).communityTrial,undefined);
  assert.equal(binding(scope,legacy(identity)),'bd4e03e428bf9c92c26fb4db006cc975b51aceaa45e4ab735422aed6513f6d2b');
  const key=binding(scope,c);assert.notEqual(key,binding(scope,legacy(identity)));
  assert.equal(binding({...scope,account:'different'},c),null);
  now=2000;trial.refresh(source(now));assert.equal(valid(c,identity),false);assert.equal(binding(scope,trial.resolve(identity)),key);
  now=92000;assert.equal(trial.resolve(identity),null);assert.ok(binding(scope,legacy(identity)));
});
test('unowned, stale, future, unknown firmware and canceled trial sources stay blocked',()=>{
  for(const change of [{owned:false},{identityObservedAt:0},{identityObservedAt:1001},{identity:{...identity,firmware:'unknown'}},{device:''}]){
    const t=new DualCtCommunityTrial(()=>1000);t.refresh({...source(1000),...change});assert.equal(t.resolve(identity),null);
  }
  let now=1000;const t=new DualCtCommunityTrial(()=>now);t.refresh(source(now));now=999;assert.equal(t.resolve(identity),null);
  now=1000;t.refresh(source(now));t.cancel();assert.equal(t.resolve(identity),null);
});
test('community session handles three-phase netting, renewal, CT2 isolation, gaps and precise restore without legacy migration',async()=>{
  let now=1000;let saved;const trial=new DualCtCommunityTrial(()=>now);trial.refresh(source(now));const key=binding(scope,trial.resolve(identity));
  const storage={read:async()=>saved,write:async v=>{saved=structuredClone(v);}};const feedback=new DualCtCommunityFeedback();
  const build=()=>new DualCtGridEnergySession({scope,identity,readIdentity:()=>identity,resolveContract:()=>trial.resolve(identity),
    storage,authority:new DualCtEnergyAuthority(),now:()=>now,observeEvidence:(s,ms)=>feedback.record(s,ms),review:()=>({
      explicitConsent:true,target:'new_energy_device',accounting:'power',binding:key,grid:scope.grid,inventoryComplete:true,
      contributors:[],externalOverlapReviewed:true,contractQualified:true})});
  const s=build();await s.start();await s.observe(packet(),`/app/device/property/${scope.device}`,now,null);
  now+=1000;await s.observe(packet(),`/app/device/property/${scope.device}`,now,null);
  assert.equal(saved.importedWh,0);assert.ok(Math.abs(saved.exportedWh-500/3600)<1e-9);
  now+=1000;await s.observe(frame([[991,40000],[992,40000],[993,40000],[998,120000]]),`/app/device/property/${scope.device}`,now,null);
  assert.equal(s.view().candidateCapabilities.measure_power,-500);assert.equal(feedback.snapshot().eligibleIntervalMs,1000);
  trial.refresh(source(now));now+=1000;await s.observe(packet(),`/app/device/property/${scope.device}`,now,null);
  assert.equal(s.view().status,'advanced','renewal must replace the old opaque contract without losing its stable binding');
  const before=structuredClone(saved);await s.close();now+=100000;trial.refresh(source(now));const b=build();await b.start();
  assert.deepEqual(saved,before);await b.observe(packet(),`/app/device/property/${scope.device}`,now,null);assert.deepEqual(saved,before);
  now+=6000;await b.observe(packet(),`/app/device/property/${scope.device}`,now,null);assert.deepEqual(saved,before);
  assert.equal(feedback.snapshot().counts.gap,1);assert.equal(feedback.snapshot().rejectedGapMs,6000);
  trial.cancel();assert.equal(b.view().candidateCapabilities.measure_power,null);await b.close();
});
test('feedback is bounded and classification-only, never an accuracy or coverage pass',()=>{
  const f=new DualCtCommunityFeedback();f.record('eligible_interval',1000);f.record('gap',6000);f.record('PRIVATE-SECRET');
  const r=f.snapshot();assert.equal(r.hardwareValidated,false);assert.equal(r.coveragePercent,null);assert.equal(r.referenceAccuracy,null);
  assert.equal(r.uploadedAutomatically,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE-SECRET|serial|signedImportW/);
  r.counts.gap=999;assert.equal(f.snapshot().counts.gap,1);
});

test('sanitized feedback rejects arbitrary getter metadata and cannot claim hardware acceptance',()=>{
  const {dualCtCommunityFeedbackSnapshot:clean}=require('../.homeybuild/lib/dualCtCommunityFeedback');
  const r=clean({scope:'three_phase_community_trial',counts:{anchor:5,PRIVATE:4,recovery:'secret'},deviceId:'PRIVATE',
    eligibleIntervalMs:NaN,rejectedGapMs:-4,hardwareValidated:true,coveragePercent:100});
  assert.deepEqual(r.counts,{anchor:5});assert.equal(r.hardwareValidated,false);assert.equal(r.coveragePercent,null);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE|secret/);assert.equal(r.eligibleIntervalMs,0);assert.equal(r.rejectedGapMs,0);
});

test('community source cannot consume or rewrite an existing single-phase checkpoint',async()=>{
  const {makeDualCtEnergyCheckpoint}=require('../.homeybuild/lib/dualCtEnergyCheckpoint');
  const t=new DualCtCommunityTrial(()=>1000);t.refresh(source(1000));const key=binding(scope,t.resolve(identity));
  const saved=makeDualCtEnergyCheckpoint(binding(scope,legacy(identity)),legacy(identity).timing,12,135.123456,0.765432);let writes=0;
  const s=new DualCtGridEnergySession({scope,identity,readIdentity:()=>identity,resolveContract:()=>t.resolve(identity),
    storage:{read:async()=>saved,write:async()=>{writes++;}},authority:new DualCtEnergyAuthority(),now:()=>1000,
    review:()=>({explicitConsent:true,target:'new_energy_device',accounting:'power',binding:key,grid:scope.grid,
      inventoryComplete:true,contributors:[],externalOverlapReviewed:true,contractQualified:true})});
  await s.start();assert.equal(s.view().status,'checkpoint_invalid');assert.equal(writes,0);await s.close();
});

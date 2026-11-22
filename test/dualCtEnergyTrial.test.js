'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {initialDualCtEnergyTrial:initial,restoreDualCtEnergyTrial:restore,previewDualCtEnergyTransition:step}=require('../.homeybuild/lib/dualCtEnergyTrial');
const {dualCtReleaseReadiness}=require('../.homeybuild/lib/dualCtReadiness');
const {verifiedDualCtContract}=require('../.homeybuild/lib/dualCtChannels');
const {classifyDevice}=require('../.homeybuild/lib/ecoflowDevices');
const sample=(at,i=1000,e=500,source='source-a')=>({source,unit:'Wh',importedWh:i,exportedWh:e,measuredAt:at,receivedAt:at});

test('laboratory counter adoption anchors vendor lifetime values without changing existing totals',()=>{
  const s=initial(100,50);const r=step(s,sample(1000),1000);
  assert.equal(r.status,'anchored');assert.equal(r.state.importedWh,100);assert.equal(r.state.exportedWh,50);
  assert.equal(r.contributesToEnergy,false);assert.equal(r.migrationAllowed,false);
  const next=step(r.state,sample(2000,1005,502),2000);
  assert.equal(next.status,'advanced');assert.equal(next.state.importedWh,105);assert.equal(next.state.exportedWh,52);
  assert.equal(s.baseline,null);r.state.baseline.importedWh=999;assert.equal(next.state.baseline.importedWh,1005);
});

test('decrease/reset/wrap ambiguity anchors conservatively; never adds the new raw reading from zero',()=>{
  let s=step(initial(100,50),sample(1000),1000).state;
  let r=step(s,sample(2000,10,2),2000);assert.equal(r.status,'decrease_anchor');
  assert.equal(r.state.importedWh,100);assert.equal(r.state.exportedWh,50);
  r=step(r.state,sample(3000,12,3),3000);assert.equal(r.state.importedWh,102);assert.equal(r.state.exportedWh,51);
  r=step(r.state,sample(4000,11,100),4000);assert.equal(r.status,'decrease_anchor');assert.equal(r.state.exportedWh,51);
});

test('restart/upgrade restore retains totals but discards receipt baseline; unknown rollback schema is rejected',()=>{
  let s=step(initial(100,50),sample(1000),1000).state;
  s=step(s,sample(2000,1005,502),2000).state;
  const restored=restore(JSON.parse(JSON.stringify(s)));assert.equal(restored.source,null);assert.equal(restored.baseline,null);
  const r=step(restored,sample(100000,9000,8000),100000);
  assert.equal(r.state.importedWh,105);assert.equal(r.state.exportedWh,52);
  for(const bad of [null,{}, {...s,version:2},{...s,importedWh:NaN},{...s,exportedWh:-1}])assert.equal(restore(bad),null);
  assert.equal(step({...s,version:0},sample(3000),3000).status,'invalid_state');
});

test('one source and one counter path: alternate sources, power fallback and gaps cannot double-count',()=>{
  let s=step(initial(100,50),sample(1000),1000).state;
  for(const [at,source] of [[2000,'source-b'],[3000,'source-a'],[4000,'source-b']]){
    const r=step(s,sample(at,10000,20000,source),at);assert.equal(r.status,'source_changed_anchor');s=r.state;
    assert.equal(s.importedWh,100);assert.equal(s.exportedWh,50);
  }
  const blocked=step(s,sample(5000,10005,20005,'source-b'),5000,'power');
  assert.equal(blocked.status,'power_path_blocked');assert.deepEqual(blocked.state,s);
  const gap=step(s,sample(94000,20000,30000,'source-b'),94000);assert.equal(gap.status,'gap_anchor');
  assert.equal(gap.state.importedWh,100);assert.equal(gap.state.exportedWh,50);
});

test('wrong units, signed net counters, missing/future/stale/cached/nonfinite and overflow fail closed',()=>{
  const s=step(initial(100,50),sample(1000),1000).state;
  for(const changes of [{unit:'kWh'},{unit:null},{importedWh:-1},{exportedWh:NaN},{importedWh:undefined},{measuredAt:3000},{receivedAt:3000},{measuredAt:1},{source:''}]){
    const now=changes.measuredAt===1?100001:2000;
    const r=step(s,{...sample(2000),...changes},now);assert.equal(r.status,'invalid_sample');assert.deepEqual(r.state,s);
  }
  for(const at of [500,1000])assert.equal(step(s,sample(at),2000).status,'out_of_order');
  assert.equal(step(s,sample(500,1000,500,'source-b'),2000).status,'out_of_order');
  assert.equal(step({...s,source:42},sample(2000),2000).status,'invalid_state');
  const badBaseline={...s,baseline:{...s.baseline,measuredAt:3000}};
  assert.equal(step(badBaseline,sample(2000),2000).status,'invalid_baseline');
  assert.equal(step(s,sample(1000),100000).status,'invalid_sample','new HTTP receipt is not a new measurement');
  assert.equal(initial(-1,0),null);assert.equal(initial(0,Infinity),null);
  const large=step(initial(1e12,1e12),sample(1000),1000).state;
  assert.equal(step(large,sample(2000,1001,501),2000).status,'overflow');
});

test('monotonic laboratory totals hold across a long synthetic reconnect/reset/source sequence, without authorising adoption',()=>{
  let s=initial(100,50);let i=1000;let e=500;
  for(let n=1;n<=300;n++){
    if(n%23===0){i=0;e=0;}else{i+=n%5;e+=n%3;}
    if(n%37===0)s=restore(s);
    const before={...s};const r=step(s,sample(n*1000,i,e,n%31===0?'source-b':'source-a'),n*1000);
    assert.ok(r.state.importedWh>=before.importedWh);assert.ok(r.state.exportedWh>=before.exportedWh);
    assert.equal(r.contributesToEnergy,false);assert.equal(r.migrationAllowed,false);s=r.state;
  }
});

test('release readiness is developer-owned and cannot be unlocked by names, research annotations or plausible counters',()=>{
  const expected=dualCtReleaseReadiness();assert.equal(expected.contractRegistered,false);
  for(const forged of [{productType:421,verified:true},{bank:'A',observation:'looks_like_grid',unitsVerified:true},sample(1000)]){
    assert.equal(verifiedDualCtContract(forged),null);assert.deepEqual(dualCtReleaseReadiness(forged),expected);
  }
  assert.equal(expected.devicePreview.status,'blocked');assert.equal(expected.energyAdoption.status,'blocked');
  assert.equal(expected.pairingEnabled,false);assert.equal(expected.contributesToEnergy,false);assert.equal(expected.controlsEnabled,false);
  expected.devicePreview.missingEvidence.length=0;assert.ok(dualCtReleaseReadiness().devicePreview.missingEvidence.length);
});

test('release fence preserves original meter identity, pairing manifest and research isolation from device accounting',()=>{
  assert.equal(classifyDevice({sn:'BK21SYNTHETIC',productName:'Smart Meter'}),'smart_meter');
  assert.equal(classifyDevice({sn:'BK21SYNTHETIC',productName:'Smart Meter Dual CT'}),'unsupported_stream_5000');
  const root=path.join(__dirname,'..');const driver=JSON.parse(fs.readFileSync(path.join(root,'drivers/smartmeter/driver.compose.json'),'utf8'));
  assert.equal(driver.energy.cumulativeImportedCapability,'meter_power.imported');assert.equal(driver.energy.cumulativeExportedCapability,'meter_power.exported');
  assert.deepEqual(driver.capabilities,['measure_power','smartmeter_power_grid','smartmeter_power_import','smartmeter_power_export','meter_power.imported','meter_power.exported']);
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  for(const file of walk(path.join(root,'drivers')).filter(f=>f.endsWith('.ts'))){
    if(file.includes(path.join('drivers','smartmeter_dual_ct_preview')))continue; // Isolated opt-in raw preview, asserted separately.
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/dualCt(?:Preview|DevicePreview|Continuity|Counters|EnergyTrial)|previewDualCtEnergyTransition/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root,'app.ts'),'utf8'),/dualCtDevicePreview|dualCtEnergyTrial|previewDualCtEnergyTransition/);
});

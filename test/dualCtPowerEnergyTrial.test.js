'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initialDualCtPowerEnergyTrial: initial, restoreDualCtPowerEnergyTrial: restore,
  previewDualCtPowerEnergyTransition: step, dualCtPowerEnergyView: view } = require('../.homeybuild/lib/dualCtPowerEnergyTrial');
const { dualCtReleaseReadiness } = require('../.homeybuild/lib/dualCtReadiness');
const source = 'synthetic_account_meter_grid_session';
const sample = (at, watts = 3600, changes = {}) => ({ source, signedImportW: watts, unit: 'W', measuredAt: at, receivedAt: at, ...changes });
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);

test('power path anchors existing totals, integrates independently of native counters and preserves zeros', () => {
  const original = initial(source, 100, 50);
  let r = step(original, sample(1000), 1000);
  assert.equal(r.status, 'anchored'); assert.equal(r.state.importedWh, 100);
  r = step(r.state, sample(2000), 2000); close(r.state.importedWh, 101);
  r = step(r.state, sample(3000, 0), 3000); close(r.state.importedWh, 101.5);
  assert.equal(r.view.signedImportW, 0); assert.equal(r.view.importW, 0); assert.equal(r.view.exportW, 0);
  assert.equal(r.view.totalsBasis, 'derived_from_power'); assert.equal(original.baseline, null);
  assert.equal(r.contributesToEnergy, false); assert.equal(r.migrationAllowed, false);
});

test('direction reversals split import/export at the crossing rather than netting them away', () => {
  for (const direction of [1, -1]) {
    let s = step(initial(source), sample(1000, direction*3600), 1000).state;
    const r = step(s, sample(2000, -direction*7200), 2000);
    close(r.state.importedWh, direction > 0 ? 1/6 : 2/3);
    close(r.state.exportedWh, direction > 0 ? 2/3 : 1/6);
  }
});

test('bad samples, foreign source and clock rollback break the anchor without inventing downtime energy', () => {
  const s = step(initial(source, 100, 50), sample(1000), 1000).state;
  for (const changes of [{unit:'kW'}, {signedImportW:NaN}, {signedImportW:100001}, {measuredAt:null},
    {measuredAt:3000}, {receivedAt:3000}, {source:'foreign_session'}, {measuredAt:0}, {signedImportW:undefined}]) {
    const r = step(s, sample(2000,3600,changes), 2000);
    assert.equal(r.state.baseline, null); assert.equal(r.state.importedWh,100); assert.equal(r.view.signedImportW,null);
    assert.equal(step(r.state, sample(3000),3000).status,'anchored');
  }
  const rollback=step(s,sample(500),500); assert.equal(rollback.status,'clock_reset'); assert.equal(rollback.state.baseline,null);
  const invalid=step(s,sample(2000),NaN); assert.equal(invalid.state.baseline,null);
});

test('duplicate/reordered readings do not advance and exact expiry/gap boundaries reject stale power', () => {
  const s=step(initial(source),sample(1000),1000).state;
  for (const at of [500,1000]) {
    const r=step(s,sample(at),2000);assert.equal(r.status,'out_of_order');assert.equal(r.state.importedWh,0);
  }
  assert.equal(view(s,90999).signedImportW,3600);assert.equal(view(s,91000).signedImportW,null);
  const gap=step(s,sample(91000),91000);assert.equal(gap.status,'gap_anchor');assert.equal(gap.state.importedWh,0);
  assert.equal(step(s,sample(91001,3600,{measuredAt:1000}),91001).status,'invalid_sample');
  const changedReceipt=step(s,sample(2000,3600,{receivedAt:1000}),2000);assert.equal(changedReceipt.status,'invalid_sample');
});

test('restart/source rebind drops baseline, preserves totals, rejects corrupted restore and never mixes modes', () => {
  let s=step(initial(source,100,50),sample(1000),1000).state;
  s=step(s,sample(2000),2000).state;
  const restored=restore(JSON.parse(JSON.stringify(s)),'new_session');assert.equal(restored.baseline,null);
  assert.equal(restored.importedWh,101);assert.equal(restored.exportedWh,50);
  const r=step(restored,sample(200000,3600,{source:'new_session'}),200000);
  assert.equal(r.status,'anchored');assert.equal(r.state.importedWh,101);
  for(const bad of [null,{}, {...s,version:2},{...s,mode:'counter'},{...s,source:''},{...s,importedWh:-1}])assert.equal(restore(bad,source),null);
  assert.equal(step({...s,baseline:{...s.baseline,receivedAt:999999}},sample(3000),3000).status,'invalid_baseline');
  assert.equal(step({...s,mode:'counter'},sample(3000),3000).status,'invalid_state');
  assert.equal(initial(source,Infinity),null);assert.equal(initial(''),null);
  const large=step(initial(source,1e12),sample(1000),1000).state;
  assert.equal(step(large,sample(2000),2000).status,'overflow');
});

test('72-hour synthetic replay stays monotonic through gaps, resets, wrong sources and stale display checks', () => {
  let s=initial(source);let previousI=0;let previousE=0;
  for(let n=1;n<=72*60;n++) {
    const at=1000+n*60000;
    if(n%97===0)s=restore(s,source);
    const r=step(s,sample(at, n%2 ? 3600:-7200, n%71===0 ? {source:'foreign'}:{}),at);
    assert.ok(r.state.importedWh>=previousI);assert.ok(r.state.exportedWh>=previousE);
    assert.equal(r.contributesToEnergy,false);assert.equal(view(r.state,at+90000).signedImportW,null);
    s=r.state;previousI=s.importedWh;previousE=s.exportedWh;
  }
});

test('power route has independent gates, cannot be unlocked by evidence flags, and is unwired from driver/preview/accounting', () => {
  const readiness=dualCtReleaseReadiness({verified:true,gridBank:'A',powerUnit:'W'});
  assert.equal(readiness.contractRegistered,false);assert.equal(readiness.energyAdoption.powerPath.status,'blocked');
  assert.equal(readiness.energyAdoption.powerPath.nativeCountersRequired,false);
  assert.equal(readiness.energyAdoption.counterPath.status,'blocked');
  const root=path.join(__dirname,'..');
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  for(const file of [...walk(path.join(root,'drivers')).filter(f=>f.endsWith('.ts')),path.join(root,'app.ts'),path.join(root,'lib/dualCtMonitor.ts')]) {
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/dualCtPowerEnergyTrial|previewDualCtPowerEnergyTransition/);
  }
});

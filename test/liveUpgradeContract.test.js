'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
// Public manifest identifiers only, extracted from the actual Live tag, not current master.
// No Homey backups, installed IDs, credentials or customer diagnostics are committed.
const baseline=require('./fixtures/live-v1.10.3-contract.json');
const app=require('../app.json');const root=path.join(__dirname,'..');

test('Live v1.10.3 driver, capability, Energy and setting identities remain upgrade compatible',()=>{
  assert.equal(baseline.sourceCommit,'74a3f024c21b4179e0f137303414c541f84cb3fe');
  assert.equal(app.id,baseline.appId);
  for(const old of baseline.drivers){
    const current=JSON.parse(fs.readFileSync(path.join(root,'drivers',old.id,'driver.compose.json'),'utf8'));
    assert.equal(current.class,old.class,old.id+': class');
    assert.deepEqual(current.energy||null,old.energy,old.id+': Energy identity');
    for(const cap of old.capabilities)assert.ok(current.capabilities.includes(cap),old.id+': '+cap);
    const settings=(current.settings||[]).flatMap(item=>item.children||[item]).map(item=>item.id);
    for(const id of old.settings)assert.ok(settings.includes(id),old.id+': setting '+id);
  }
});

test('Live Flow card IDs, argument names/types, dropdown values and target drivers remain resolvable',()=>{
  for(const [kind,cards] of Object.entries(baseline.flow))for(const old of cards){
    const current=app.flow[kind].find(card=>card.id===old.id);assert.ok(current,kind+': '+old.id);
    for(const arg of old.args){
      const next=current.args.find(item=>item.name===arg.name);assert.ok(next,old.id+': '+arg.name);
      assert.equal(next.type,arg.type,old.id+': '+arg.name+' type');
      if(arg.values)for(const id of arg.values)assert.ok(next.values.some(v=>v.id===id),old.id+': dropdown '+id);
      if(arg.filter)for(const driver of arg.filter.replace('driver_id=','').split('|')){
        assert.ok(next.filter.replace('driver_id=','').split('|').includes(driver),old.id+': target '+driver);
      }
    }
  }
});

test('synthetic saved Flow/device references resolve before and after the manifest upgrade without re-pairing',()=>{
  const installation={devices:baseline.drivers.map((driver,index)=>({homeyId:`synthetic-homey-${index}`,driverId:driver.id,
    data:{sn:`SYNTHETIC${index}`},settings:{poll_interval:45},store:{ownerMarker:'preserve'}})),
    flows:baseline.flow.conditions.map(card=>({cardId:card.id,deviceId:'synthetic-homey-1',kind:'conditions'}))};
  const before=structuredClone(installation);
  for(const device of installation.devices)assert.ok(app.drivers.some(driver=>driver.id===device.driverId));
  for(const flow of installation.flows){
    assert.ok(installation.devices.some(d=>d.homeyId===flow.deviceId));
    assert.ok(app.flow[flow.kind].some(card=>card.id===flow.cardId));
  }
  assert.deepEqual(installation,before);
  assert.equal(app.drivers.some(driver=>/dual.?ct/i.test(driver.id)),false,'unverified adapter cannot become a paired driver');
});

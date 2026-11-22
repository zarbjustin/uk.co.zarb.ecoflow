'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
const {DualCtDevicePreview}=require('../.homeybuild/lib/dualCtDevicePreview');
const {comparisonView,comparisonExport,serialize,workingPreview,age}=require('../settings/dual-ct-comparison');
const {compact}=require('../settings/dual-ct-status');
const {packet,context,scalar,nested}=require('./helpers/dualCtSynthetic');
const scope=index=>({account:'synthetic-account',device:`synthetic-meter-${index}`,session:'session-one'});
const view=(preview,now)=>({...preview.snapshot(now),appVersion:'1.10.49'});
const field=(snapshot,id)=>snapshot.banks.flatMap(bank=>bank.readings).find(row=>row.field===id);

test('generated two-meter replay carries raw signs, phases, counters and receipts through decoder/cache/export/adapter',()=>{
  const preview=new DualCtPreview(true,true);const adapters=[0,1].map(i=>new DualCtDevicePreview(scope(i)));
  try {for(let step=0;step<120;step++){
    const at=1000+step*1000;const meter=step%2;const seed=(step%3-1)*(step+1);
    const counters=step%10===0?[[1,-100],[2,100],[3,step],[4,1000+step],[6,1000],[7,step]]:null;
    const bytes=packet(seed,counters);const ctx=context(at);
    preview.observe(meter,bytes,ctx);assert.equal(adapters[meter].observe(scope(meter),bytes,ctx),true);
    const current=view(preview,at);const local=comparisonView(current);const shared=comparisonExport(current);
    assert.ok(shared);assert.ok(serialize(shared).length<=7500);
    // JSON canonicalises IEEE negative zero; nonzero signs and receipt metadata must survive.
    assert.deepEqual(JSON.parse(JSON.stringify(comparisonExport(JSON.parse(serialize(shared))))),JSON.parse(JSON.stringify(shared)));
    const raw=local.candidateSnapshot.devices.find(d=>d.deviceIndex===meter).readings.find(r=>r.field===515);
    assert.equal(raw.value,seed+1);assert.equal(field(adapters[meter].snapshot(at),515).value,seed+1);
    assert.equal(field(adapters[meter].snapshot(at),772).value,-seed);
    assert.equal(local.candidateSnapshot.bankChecks.find(b=>b.deviceIndex===meter&&b.bank==='A').latest.status,'consistent');
    assert.equal(workingPreview(local).signConvention,'raw_unchanged');
    const safe=compact({previewDiagnostics:preview.diagnostics('ready')});
    assert.doesNotMatch(JSON.stringify(safe),/"value"|"raw"|"candidateUnit"|synthetic-/);
    for(const report of [shared,...adapters.map(a=>a.snapshot(at))]){
      assert.equal(report.pairingEnabled,false);assert.equal(report.contributesToEnergy,false);assert.equal(report.controlsEnabled,false);
    }
  }} finally {preview.clear();adapters.forEach(a=>a.disconnect());}
});

test('duplicate and reordered packets do not replace newer scalar values or manufacture phase coherence',()=>{
  const preview=new DualCtPreview(true,true);const adapter=new DualCtDevicePreview(scope(0));
  try {
    preview.observe(0,packet(1),context(1000));adapter.observe(scope(0),packet(1),context(1000));
    // Same receipt could contain complementary fields, but cannot establish order for an existing field.
    preview.observe(0,packet(99),context(2000,1000));
    assert.equal(adapter.observe(scope(0),packet(99),context(2000,1000)),false);
    preview.observe(0,packet(98),context(2000,999));
    const shared=comparisonView(view(preview,2000));
    assert.equal(shared.candidateSnapshot.devices[0].readings.find(r=>r.field===962).value,1);
    assert.equal(field(adapter.snapshot(2000),962).value,1);
    const partial=Buffer.concat([scalar(515,40),scalar(962,10)]);
    preview.observe(0,partial,context(3000));adapter.observe(scope(0),partial,context(3000));
    assert.equal(adapter.snapshot(3000).banks[0].latestPacketCheck,'partial');
    assert.equal(comparisonView(view(preview,3000)).candidateSnapshot.bankChecks[0].latest.status,'partial');
  }finally {preview.clear();adapter.disconnect();}
});

test('sparse counter replay distinguishes latest packet, actual record expiry, gaps and source boundaries end to end',()=>{
  const preview=new DualCtPreview(true,true);
  const counter=(at)=>comparisonView(view(preview,at)).counterContinuity.records.find(r=>r.parent===773);
  try {
    preview.observe(0,packet(1,[[4,100],[6,10],[7,90]]),context(1000));
    for(let at=2000;at<=91000;at+=1000)preview.observe(0,packet(2),context(at));
    const row=counter(91000);assert.equal(row.receivedAgeSec,90);assert.equal(row.lastPacketAgeSec,0);
    assert.equal(row.recordObservations,1);assert.equal(row.status,'not_updated');
    preview.observe(0,packet(1,[[4,150],[6,10],[7,140]]),context(92000));
    assert.equal(counter(92000).status,'gap');
    preview.observe(0,packet(1,[[4,155],[6,10],[7,145]]),context(93000,93000,{encodingBasis:'explicit_zero'}));
    assert.equal(counter(93000).status,'source_changed');
    const partial=Buffer.concat([packet(),nested(773,[[4,200]])]);
    preview.observe(0,partial,context(94000));
    preview.observe(0,Buffer.concat([packet(),nested(773,[[7,190]])]),context(95000));
    assert.equal(counter(95000).fields.find(r=>r.field===7).status,'baseline');
    const aged=age(comparisonView(view(preview,95000)),90,true);
    assert.equal(aged.counterContinuity.records[0].receivedAgeSec,90);
    assert.equal(aged.candidateSnapshot.devices[0].readings[0].receivedAgeSec,90);
  }finally {preview.clear();}
});

test('stop, account replacement, restart and backward clock erase runtime evidence without leaking identities or extending retention',()=>{
  for(const action of ['stop','account','restart','rollback','retention']){
    let preview=new DualCtPreview(true,true);const adapter=new DualCtDevicePreview(scope(0));
    try {
      preview.observe(0,packet(),context(1000));adapter.observe(scope(0),packet(),context(1000));
      if(action==='retention'){
        assert.equal(comparisonView(view(preview,901000)),null);
      }else{
        if(action==='rollback'){preview.snapshot(999);adapter.snapshot(999);}
        else {preview.clear();adapter.disconnect();}
        if(action==='account')adapter.replaceScope({...scope(0),account:'new-synthetic-account'});
        if(action==='restart'){preview=new DualCtPreview(true,true);}
        assert.equal(comparisonView(view(preview,2000)),null);
        assert.equal(adapter.snapshot(2000).availability,'disconnected');
      }
    }finally {preview.clear();adapter.disconnect();}
  }
});

'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
const {comparisonView,comparisonExport,serialize,workingPreview,age}=require('../settings/dual-ct-comparison');
const {compact,diagnosticExport}=require('../settings/dual-ct-status');
const {download}=require('../settings/reporter-status');
const ctx={productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',encodingBasis:'omitted_zero_candidate'};
// Synthetic examples, not customer telemetry or identifying fixtures.
function vi(n){const out=[];do{out.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(out);}
function f(n,v){const b=Buffer.alloc(4);b.writeFloatLE(v);return Buffer.concat([vi(n*8+5),b]);}
function m(n,b){return Buffer.concat([vi(n*8+2),vi(b.length),b]);}
const rows=[[515,2.5],[962,80.5],[963,90.25],[772,-168.25],[956,236],[957,237],[771,238],
  [958,0.5],[959,1.5],[784,-2.5],[991,7.5],[992,8.25],[993,6.75],[998,22.5],
  [985,235],[986,236],[987,237],[988,0.1],[989,0.2],[990,0.3]];
const counters=[[1,-6000],[2,-2000],[3,12000],[4,32000],[6,28000],[7,4000]];
const scalars=()=>Buffer.concat(rows.map(([n,v])=>f(n,v)));
const packet=(values=counters)=>Buffer.concat([scalars(),m(773,Buffer.concat(values.map(([n,v])=>f(n,v)))),m(997,f(4,123))]);
const observe=(p,b,at,device=0,extra={})=>p.observe(device,b,{...ctx,receivedAt:at,now:at,...extra});
const view=(p,at)=>({...p.snapshot(at),appVersion:'1.10.48'});
const counter=(v,parent=773)=>v.diagnosticSnapshot.counterContinuity.records.find(r=>r.parent===parent);

test('one-meter combined export retains all 20 scalars, both bank checks, both counter structures and six candidates',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  const report=comparisonExport(view(p,2000));assert.ok(report);
  assert.equal(report.candidateSnapshot.readingsIncluded,20);
  assert.equal(report.candidateSnapshot.bankChecksIncluded,2);
  assert.equal(report.counterRecordsIncluded,2);assert.equal(report.counterReadingsIncluded,6);
  assert.equal(report.counterRecords.find(r=>r.parent===997).fields[0].field,4);
  assert.ok(serialize(report).length<=7500);assert.deepEqual(comparisonExport(JSON.parse(serialize(report))),report);
  assert.equal(report.candidateSnapshot.bankChecks.find(r=>r.bank==='B').latest.status,'consistent');
  assert.equal(report.candidateSnapshot.devices[0].readings.find(r=>r.field===998).value,22.5);p.clear();
});

test('two-meter size pressure preserves complete power groups, checks and counter candidates before voltage detail',()=>{
  const p=new DualCtPreview(true,true);for(const device of [0,1])observe(p,packet(),1000,device);
  const report=comparisonExport(view(p,2000));assert.ok(report);assert.ok(serialize(report).length<=7500);
  assert.equal(report.candidateSnapshot.bankChecksIncluded,4);assert.equal(report.counterReadingsIncluded,12);
  for(const device of report.candidateSnapshot.devices)for(const fields of [[515,962,963,772],[998,991,992,993]]){
    assert.equal(device.readings.filter(r=>fields.includes(r.field)).length,4);
  }
  assert.equal(report.counterRecordsIncluded,4);
  assert.deepEqual(comparisonExport(report),report);assert.equal(report.candidateSnapshot.readingsAvailable,40);p.clear();
});

test('sparse scalar updates do not reset a counter baseline or freshen its age',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  for(const at of [2000,3000,4000])observe(p,scalars(),at);
  const v=view(p,4000);const r=counter(v);
  assert.equal(r.status,'not_updated');assert.equal(r.recordObservations,1);assert.equal(r.observations,4);
  assert.equal(r.receivedAgeSec,3);assert.equal(r.lastPacketAgeSec,0);assert.equal(r.stale,false);
  assert.equal(r.events.not_updated,3);assert.equal(r.events.missing,undefined);
  observe(p,packet(counters.map(([n,v])=>[n,n===4?v+10:v])),5000);
  const after=counter(view(p,5000));assert.equal(after.status,'compared');
  assert.equal(after.fields.find(r=>r.field===4).status,'increased');p.clear();
});

test('fresh scalar traffic cannot hide counter expiry, bridge 90-second gaps or invent never-seen records',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);observe(p,scalars(),90000);
  const v=view(p,91000);assert.equal(counter(v).stale,true);assert.equal(counter(v).receivedAgeSec,90);
  assert.equal(counter(v).lastPacketAgeSec,1);
  const shared=comparisonView(v);assert.equal(shared.counterContinuity.records[0].receivedAgeSec,90);
  assert.equal(age(shared,10,true).counterContinuity.records[0].lastPacketAgeSec,11);
  observe(p,packet(),92000);assert.equal(counter(view(p,92000)).status,'gap');p.clear();
  const empty=new DualCtPreview(true,true);observe(empty,scalars(),1000);
  const missing=counter(view(empty,1000));assert.equal(missing.recordObserved,false);
  assert.equal(missing.recordObservations,0);assert.equal(missing.stale,true);empty.clear();
});

test('sparse packets do not bridge source changes, invalid records or partial child baselines',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  observe(p,scalars(),2000,0,{encodingBasis:'explicit_zero'});
  observe(p,packet(),3000,0,{encodingBasis:'explicit_zero'});
  assert.equal(counter(view(p,3000)).status,'source_changed');
  observe(p,packet([[4,35000]]),4000,0,{encodingBasis:'explicit_zero'});
  observe(p,scalars(),5000,0,{encodingBasis:'explicit_zero'});
  observe(p,packet([[7,5000]]),6000,0,{encodingBasis:'explicit_zero'});
  const r=counter(view(p,6000));assert.equal(r.fields.find(f=>f.field===7).status,'baseline');
  assert.equal(r.fields.find(f=>f.field===4).status,'missing');p.clear();
});

test('provisional display adds explicit Grid/inverter and Wh-scale hypotheses without mutating raw signs or enabling accounting',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);const report=comparisonView(view(p,2000));
  const before=serialize(report);const projection=workingPreview(report);
  assert.equal(projection.bankRoles.A,'grid');assert.equal(projection.bankRoles.B,'solar_inverter_circuit');
  assert.equal(projection.signConvention,'raw_unchanged');assert.equal(projection.solarIncludesPossibleBatteryDischarge,true);
  assert.equal(projection.counters.find(r=>r.field===1).kWhCandidate,-6);
  assert.equal(projection.counters.find(r=>r.field===4).kWhCandidate,32);
  assert.equal(projection.counters.find(r=>r.field===7).kWhCandidate,4);
  assert.equal(projection.period,'unknown');assert.equal(projection.unitsVerified,false);assert.equal(projection.directionVerified,false);
  assert.equal(projection.contributesToEnergy,false);assert.equal(serialize(report),before);
  assert.equal(report.candidateSnapshot.devices[0].readings.find(r=>r.field===998).value,22.5);
  assert.equal(report.pairingEnabled,false);assert.equal(report.controlsEnabled,false);
  assert.deepEqual(workingPreview({...report,counterResearchEnabled:false}).counters,[]);
  for(const report of [compact({previewDiagnostics:p.diagnostics('ready')}),diagnosticExport(view(p,2000))]){
    assert.doesNotMatch(JSON.stringify(report),/kWhCandidate|workingAssumptions|32000/);
  }p.clear();
});

test('compact comparison download uses the same bounded serialization as copy/manual text, not expanded pretty JSON',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);const report=comparisonExport(view(p,2000));
  let content;const anchor={click(){},remove(){}};
  class BlobStub{constructor(parts){content=parts.join('');}}
  download(JSON.parse(serialize(report)),{createElement:()=>anchor,body:{appendChild(){}}},{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},BlobStub,()=>{});
  assert.equal(content,serialize(report));assert.ok(content.length<=7500);assert.equal(anchor.download,'ecoflow-dual-ct-comparison.json');p.clear();
});

test('schema-2 receipt tables round-trip distinct field ages and reject malformed references without promoting metadata',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  observe(p,Buffer.concat([f(515,0),f(963,0)]),2000);
  const local=comparisonView(view(p,3000));const wire=JSON.parse(serialize(local));
  assert.equal(wire.schemaVersion,2);assert.equal(wire.candidateSnapshot.devices[0].readingReceipts.length,2);
  const restored=comparisonView(wire);assert.deepEqual(restored,local);
  assert.equal(serialize(wire),serialize(local));
  assert.equal(restored.candidateSnapshot.devices[0].readings.find(r=>r.field===962).receivedAgeSec,2);
  assert.equal(restored.candidateSnapshot.devices[0].readings.find(r=>r.field===515).receivedAgeSec,1);
  assert.equal(restored.candidateSnapshot.devices[0].readings.find(r=>r.field===515).value,0);
  assert.equal(age(wire,10,true).candidateSnapshot.devices[0].readings.find(r=>r.field===962).receivedAgeSec,12);
  for(const invalid of [-1,0.5,99]){
    const bad=structuredClone(wire);bad.candidateSnapshot.devices[0].readings[0].receiptIndex=invalid;
    assert.equal(comparisonView(bad),null);
  }
  const invalid=structuredClone(wire);invalid.candidateSnapshot.devices[0].readingReceipts[0].representation='float64';
  assert.equal(comparisonView(invalid),null);
  const forged=structuredClone(wire);forged.raw='PRIVATE';forged.candidateSnapshot.bankChecks[0].latest.mappingVerified=true;
  forged.candidateSnapshot.devices[0].readingReceipts[0].sn='PRIVATE';
  const safe=comparisonExport(forged);assert.ok(safe);assert.equal(safe.contributesToEnergy,false);
  assert.doesNotMatch(serialize(safe),/PRIVATE|mappingVerified":true/);p.clear();
});

test('budget stress with long floats and distinct sparse receipts remains bounded and never exports partial bank fragments',()=>{
  const p=new DualCtPreview(true,true);let at=1000;
  for(const device of [0,1]){
    observe(p,packet(),at,device);at+=1000;
    for(const [field] of rows){observe(p,Buffer.concat([f(515,123.4567),f(963,78.12345),f(field===515||field===963?956:field,234.5678)]),at,device);at+=1000;}
  }
  const local=comparisonView(view(p,at));const report=comparisonExport(local);assert.ok(report);
  assert.ok(serialize(report).length<=7500);assert.equal(report.counterReadingsIncluded,12);
  assert.deepEqual(comparisonExport(JSON.parse(serialize(report))),report);
  for(const device of report.candidateSnapshot.devices)for(const ids of [[515,962,963,772],[998,991,992,993]]){
    const count=device.readings.filter(r=>ids.includes(r.field)).length;assert.ok(count===0||count===4);
  }p.clear();
});

test('candidate energy display preserves real zero and negative net values without assuming a day or reset origin',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet([[1,-1000],[2,0],[3,500],[4,0],[6,500],[7,-500]]),1000);
  const report=comparisonView(view(p,1000));const projected=workingPreview(report);
  assert.equal(projected.counters.find(r=>r.field===4).kWhCandidate,0);
  assert.equal(projected.counters.find(r=>r.field===7).kWhCandidate,-0.5);
  assert.equal(projected.period,'unknown');assert.equal(projected.resetVerified,false);
  assert.equal(report.counterContinuity.dailyAvailable,false);p.clear();
});

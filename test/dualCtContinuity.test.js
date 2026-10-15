'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DualCtContinuity,dualCtPeriodEvidence}=require('../.homeybuild/lib/dualCtContinuity');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
const {comparisonView,comparisonExport,age}=require('../settings/dual-ct-comparison');
const {compact,diagnosticExport}=require('../settings/dual-ct-status');
const ctx={productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',now:1000,receivedAt:1000};
function vi(n){const a=[];do{a.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(a);}
function f(n,v){const b=Buffer.alloc(4);b.writeFloatLE(v);return Buffer.concat([vi(n*8+5),b]);}
function m(n,b){return Buffer.concat([vi(n*8+2),vi(b.length),b]);}
const packet=(fields=[[4,12345],[6,100],[7,12245]],parent=773)=>Buffer.concat([f(515,1),f(962,1),m(parent,Buffer.concat(fields.map(([n,v])=>f(n,v))))]);
const observe=(p,bytes,at,index=0,changes={})=>p.observe(index,bytes,{...ctx,now:at,receivedAt:at,...changes});
const snapshot=(p,now)=>({...p.snapshot(now),appVersion:'1.10.47'});
const row=(p,now,parent=773,index=0)=>snapshot(p,now).diagnosticSnapshot.counterContinuity.records.find(r=>r.parent===parent&&r.deviceIndex===index);
const statuses=r=>Object.fromEntries(r.fields.map(f=>[f.field,f.status]));

test('receipt continuity classifies signed increases, decreases and zero without reset or daily assumptions',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet([[1,-10],[2,0],[4,30],[7,20]]),1000);
  assert.equal(row(p,1000).status,'baseline');
  observe(p,packet([[1,-11],[2,0],[4,35],[7,24]]),2000);
  const r=row(p,2000);assert.equal(r.status,'compared');
  assert.deepEqual(statuses(r),{1:'decreased',2:'unchanged',3:'missing',4:'increased',6:'missing',7:'increased'});
  assert.equal(r.events.baseline,1);assert.equal(r.events.compared,1);
  assert.equal(r.events.decreased,1);assert.equal(r.events.increased,1);assert.equal(r.events.unchanged,1);
  observe(p,packet([[1,-11],[2,0],[4,35],[7,24]]),3000);
  assert.equal(row(p,3000).events.decreased,1,'later unchanged readings do not erase a decrease observation');
  assert.equal(row(p,3000).events.unchanged,2);
  assert.equal(snapshot(p,3000).diagnosticSnapshot.counterContinuity.resetVerified,false);
  assert.equal(r.periodEvidence.dailyAvailable,false);assert.equal(r.periodEvidence.cumulativeOrigin,'unknown');
  assert.doesNotMatch(JSON.stringify(r),/"value"|"delta"|importedWh|exportedWh/);p.clear();
});

test('partial, absent and invalid records break the baseline and never borrow other children',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  observe(p,packet([[4,12346]]),2000);assert.equal(statuses(row(p,2000))[7],'missing');
  observe(p,packet([[7,-10]]),3000);assert.equal(statuses(row(p,3000))[7],'baseline');
  observe(p,f(515,1),4000);assert.equal(row(p,4000).status,'missing');
  observe(p,packet(),5000);assert.equal(statuses(row(p,5000))[4],'baseline');
  observe(p,packet([[4,NaN]]),6000);assert.equal(row(p,6000).status,'invalid');
  observe(p,packet(),7000);assert.equal(statuses(row(p,7000))[4],'baseline');p.clear();
});

test('out-of-order receipts do not refresh evidence; same-receipt order is not invented',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  observe(p,packet([[4,100]]),2000,0,{receivedAt:500});
  assert.equal(row(p,2000).receivedAgeSec,1);assert.equal(row(p,2000).events.out_of_order,1);
  observe(p,packet([[4,100]]),2000,0,{receivedAt:1000});
  assert.equal(row(p,2000).status,'same_receipt');
  observe(p,packet([[4,105]]),3000);assert.equal(statuses(row(p,3000))[4],'baseline');p.clear();
});

test('gaps and admission-source changes anchor again, not an inferred counter reset',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  observe(p,packet(),91000);assert.equal(row(p,91000).status,'gap');
  observe(p,packet(),92000,0,{encodingBasis:'omitted_zero_candidate'});
  assert.equal(row(p,92000).status,'source_changed');
  observe(p,packet(),93000,0,{encodingBasis:'omitted_zero_candidate'});
  assert.equal(statuses(row(p,93000))[4],'unchanged');p.clear();
});

test('two meters and both records are isolated; 997 has no invented numeric continuity',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  observe(p,packet([[4,1]]),2000,1);assert.equal(statuses(row(p,2000,773,1))[4],'baseline');
  observe(p,packet([[4,9999]],997),3000);
  assert.equal(row(p,3000,997).status,'structure_only');assert.deepEqual(row(p,3000,997).fields,[]);
  assert.equal(row(p,3000,773).status,'missing');assert.equal(row(p,3000,773,1).observations,1);p.clear();
});

test('freshness and fixed cleanup clear continuity without an export, refresh or new frame',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const p=new DualCtPreview(true,true);observe(p,packet(),1000);
  assert.equal(row(p,91000).stale,true);
  t.mock.timers.tick(900000);assert.equal(snapshot(p,91000).diagnosticSnapshot,null);
  observe(p,packet(),92000);assert.equal(snapshot(p,92000).diagnosticSnapshot,null);p.clear();
});

test('opt-out, Stop, clear, clock rollback and restart do not retain numeric continuity evidence',()=>{
  const off=new DualCtPreview(true);observe(off,packet(),1000);
  assert.deepEqual(snapshot(off,1000).diagnosticSnapshot.counterContinuity.records,[]);off.clear();
  for(const reset of [p=>p.clear(),p=>p.clear(false),p=>snapshot(p,999)]){
    const p=new DualCtPreview(true,true);observe(p,packet(),1000);reset(p);
    assert.equal(snapshot(p,1000).diagnosticSnapshot,null);p.clear();
  }
  assert.equal(snapshot(new DualCtPreview(true,true),1000).diagnosticSnapshot,null);
});

test('continuity input and output bounds are fixed; snapshots cannot mutate retained baselines',()=>{
  const t=new DualCtContinuity(true);
  const r={parent:773,status:'observed',candidates:[{field:4,value:12345,candidateUnit:null}]};
  for(const [device,at,now,source] of [[2,1000,1000,'explicit_zero'],[0,1001,1000,'explicit_zero'],[0,1,90001,'explicit_zero'],[0,1000,1000,'private']])t.observe(device,[r],at,now,source);
  assert.deepEqual(t.snapshot(1000).records,[]);
  t.observe(0,[r],1000,1000,'explicit_zero');const copy=t.snapshot(1000);copy.records[0].fields[0].status='PRIVATE';
  assert.doesNotMatch(JSON.stringify(t.snapshot(1000)),/PRIVATE/);
  for(let i=0;i<3000;i++)t.observe(0,[r],1000+i,1000+i,'explicit_zero');
  assert.equal(t.snapshot(5000).records[0].observations,2048);assert.equal(t.snapshot(5000).records.length,2);
});

test('calendar evidence distinguishes local midnight and 23/25-hour DST days without manufacturing daily totals',()=>{
  const ms=s=>Date.parse(s);const tz='Europe/London';
  const same=dualCtPeriodEvidence(ms('2026-10-15T22:59:00Z'),ms('2026-10-15T23:01:00Z'),tz);
  assert.equal(same.boundary,'local_day_changed');assert.equal(same.observedSpanSec,120);
  for(const [a,b,hours] of [['2026-03-29T00:00:00Z','2026-03-29T23:00:00Z',23],['2026-10-24T23:00:00Z','2026-10-26T00:00:00Z',25]]){
    const e=dualCtPeriodEvidence(ms(a),ms(b),tz);assert.equal(e.boundary,'local_day_changed');assert.equal(e.observedSpanSec,hours*3600);assert.equal(e.dailyAvailable,false);
  }
  assert.equal(dualCtPeriodEvidence(ms('2026-10-25T00:30:00Z'),ms('2026-10-25T01:30:00Z'),tz).boundary,'same_local_day');
  for(const timezone of [undefined,'Invalid/Zone'])assert.equal(dualCtPeriodEvidence(1000,2000,timezone).boundary,'unavailable');
  assert.equal(dualCtPeriodEvidence(2000,1000,tz).observedSpanSec,null);
});

test('combined continuity export is fixed, numeric-free, bounded, aged and omitted honestly; normal reports unchanged',()=>{
  const p=new DualCtPreview(true,true);observe(p,packet(),1000);observe(p,packet([[4,12346],[7,-1]]),2000);
  const v=snapshot(p,3000);const local=comparisonView(v);assert.equal(local.counterContinuity.records.length,2);
  v.diagnosticSnapshot.counterContinuity.records[0].secret='PRIVATE';
  v.diagnosticSnapshot.counterContinuity.records[0].events.secret=12345;
  v.diagnosticSnapshot.counterContinuity.records[0].fields[0].value=12345;
  const report=comparisonExport(v);assert.ok(report);assert.ok(JSON.stringify(report,null,2).length<=7500);
  const continuity=report.counterContinuity;assert.equal(continuity.valuesIncluded,false);assert.equal(continuity.dailyAvailable,false);
  assert.doesNotMatch(JSON.stringify(continuity),/PRIVATE|12345|value"|measuredAt|source"/);
  assert.deepEqual(comparisonExport(report),report);
  assert.equal(age(local,100,true).counterContinuity.records[0].receivedAgeSec,101);
  assert.equal(age(local,900,true),null);
  assert.doesNotMatch(JSON.stringify(diagnosticExport(v)),/counterContinuity/);
  assert.doesNotMatch(JSON.stringify(compact({previewDiagnostics:p.diagnostics('ready'),counterContinuity:v.diagnosticSnapshot.counterContinuity})),/counterContinuity|12345/);
  const forged=structuredClone(v);forged.diagnosticSnapshot.counterContinuity.records[0].parent=999;
  assert.ok(!comparisonView(forged).counterContinuity.records.some(r=>r.parent===999));p.clear();
});

test('maximal two-meter comparison keeps the 7500 budget and truthful continuity omission counts on re-export',()=>{
  const p=new DualCtPreview(true,true);
  const all=Buffer.concat([515,962,963,772,956,957,771,958,959,784,985,986,987,988,989,990,991,992,993,998].map(n=>f(n,1)));
  for(const i of [0,1])observe(p,Buffer.concat([all,m(773,Buffer.concat([1,2,3,4,6,7].map(n=>f(n,1)))),m(997,f(4,1))]),1000,i);
  const report=comparisonExport(snapshot(p,1000));assert.ok(report);
  assert.ok(JSON.stringify(report,null,2).length<=7500);assert.equal(report.counterContinuity.recordsAvailable,4);
  assert.equal(report.counterContinuity.recordsIncluded,report.counterContinuity.records.length);
  assert.equal(report.counterContinuity.recordsOmitted,report.counterContinuity.records.length<4);
  assert.deepEqual(comparisonExport(report),report);p.clear();
});

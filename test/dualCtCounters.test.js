'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {inspectDualCtCounterRecords,checkDualCtCounterFields}=require('../.homeybuild/lib/dualCtCounters');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
const {DualCtResearch,dualCtResearchSnapshot}=require('../.homeybuild/lib/dualCtResearch');
const {dualCtPreviewDiagnostics}=require('../.homeybuild/lib/dualCtDiagnostics');
const {compact,diagnosticExport}=require('../settings/dual-ct-status');
const {comparisonExport,comparisonView,age,arithmetic}=require('../settings/dual-ct-comparison');
const api=require('../.homeybuild/api');
const ctx={productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',now:1000,receivedAt:1000};
function vi(n){const a=[];do{a.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(a);}
function f(n,v){const b=Buffer.alloc(4);b.writeFloatLE(v);return Buffer.concat([vi(n*8+5),b]);}
function m(n,b){return Buffer.concat([vi(n*8+2),vi(b.length),b]);}
function int(n,v){return Buffer.concat([vi(n*8),vi(v)]);}
const scalar=Buffer.concat([f(515,-6),f(962,-1),f(963,-2),f(772,-3),f(998,9),f(991,2),f(992,3),f(993,4)]);
const vals=[[1,-40],[2,20],[3,70],[4,150],[6,100],[7,50]];
const inner=Buffer.concat(vals.map(([n,v])=>f(n,v)));
const payload=Buffer.concat([scalar,m(773,inner),m(997,inner)]);
function view(preview,now=1000){return {...preview.snapshot(now),appVersion:'1.10.47'};}

test('counter research requires the existing owned-model/header/source/freshness/scalar signature',()=>{
  for(const changes of [{productType:21},{cmdId:22},{cmdFunc:0},{source:'developer_mqtt'},{encoding:'masked'},
    {receivedAt:1001},{now:92000},{encodingBasis:'unsupported'}])assert.deepEqual(inspectDualCtCounterRecords(payload,{...ctx,...changes},true),[]);
  assert.deepEqual(inspectDualCtCounterRecords(m(773,inner),ctx,true),[]);
  assert.deepEqual(inspectDualCtCounterRecords(Buffer.concat([f(515,1),m(773,inner)]),{...ctx,encodingBasis:'omitted_zero_candidate'},true),[]);
  assert.equal(inspectDualCtCounterRecords(payload,{...ctx,encodingBasis:'omitted_zero_candidate'},true).length,2);
});

test('default inspection is structure only; explicit numeric opt-in admits only unscaled 773 allowlist floats',()=>{
  const structure=inspectDualCtCounterRecords(payload,ctx);
  assert.deepEqual(structure[0].candidates,[]);assert.deepEqual(structure[0].checks,[]);
  const records=inspectDualCtCounterRecords(payload,ctx,true);
  assert.equal(records[0].candidates.length,6);assert.ok(records[0].candidates.every(row=>row.candidateUnit===null));
  assert.ok(records[0].checks.every(row=>row.status==='consistent'));assert.equal(records[0].period,'unknown');
  assert.deepEqual(records[1].candidates,[]);assert.deepEqual(records[1].checks,[]);
  assert.equal(records[1].fields.length,6);assert.equal(records[1].unitsVerified,false);
  const excluded=inspectDualCtCounterRecords(Buffer.concat([scalar,m(773,Buffer.concat([inner,f(5,12345),m(10,f(4,12345)),f(65,12345)]))]),ctx,true)[0];
  assert.equal(excluded.candidates.length,6);assert.ok(!excluded.candidates.some(row=>[5,10,65].includes(row.field)));
  assert.equal(excluded.fieldsOmitted,true);assert.doesNotMatch(JSON.stringify(excluded),/12345/);
});

test('counter arithmetic is single-record signed candidate arithmetic, never daily/lifetime or missing-zero semantics',()=>{
  const rows=vals.map(([field,value])=>({field,value}));
  assert.deepEqual(arithmetic(773,rows),checkDualCtCounterFields(773,rows));
  for(const n of [997,515])assert.deepEqual(checkDualCtCounterFields(n,rows),[]);
  assert.equal(checkDualCtCounterFields(773,rows.slice(0,4))[0].status,'partial');
  assert.ok(checkDualCtCounterFields(773,rows.map(row=>({...row,value:0}))).every(row=>row.status==='consistent'));
  const mismatch=rows.map(row=>row.field===7?{...row,value:99}:row);
  assert.ok(checkDualCtCounterFields(773,mismatch).every(row=>row.status==='mismatch'));
  assert.ok(checkDualCtCounterFields(773,[...rows,rows[0]]).every(row=>row.status==='invalid'));
  assert.ok(checkDualCtCounterFields(773,[{field:4,value:NaN}]).every(row=>row.status==='invalid'));
});

test('bad nested fields are isolated from valid scalars; never guess wire types or recurse',()=>{
  for(const bad of [Buffer.from([255]),Buffer.concat([f(4,1),f(4,2)]),f(4,NaN),f(4,Infinity),f(4,1e13),int(4,150)]) {
    const record=inspectDualCtCounterRecords(Buffer.concat([scalar,m(773,bad)]),ctx,true)[0];
    assert.equal(record.status,'invalid');assert.deepEqual(record.candidates,[]);assert.deepEqual(record.checks,[]);
  }
  for(const tail of [Buffer.concat([m(773,inner),m(773,inner)]),int(773,1)]) {
    assert.equal(inspectDualCtCounterRecords(Buffer.concat([scalar,tail]),ctx,true)[0].status,'invalid');
  }
  assert.equal(inspectDualCtCounterRecords(Buffer.concat([scalar,m(773,Buffer.alloc(2049))]),ctx,true)[0].status,'oversized');
  assert.equal(inspectDualCtCounterRecords(Buffer.concat([scalar,m(773,Buffer.concat(Array.from({length:33},(_,i)=>int(i+1,0))))]),ctx,true)[0].status,'invalid');
  const nested=inspectDualCtCounterRecords(Buffer.concat([scalar,m(773,m(4,f(1,150)))]),ctx,false)[0];
  assert.deepEqual(nested.fields,[{field:4,wire:2}]);assert.deepEqual(nested.candidates,[]);
});

test('whole counter records replace partials atomically without cross-packet, bank or device borrowing',()=>{
  const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);
  preview.observe(0,Buffer.concat([scalar,m(773,f(4,180))]),{...ctx,now:2000,receivedAt:2000});
  preview.observe(1,Buffer.concat([scalar,m(773,Buffer.concat([f(6,100),f(7,80)]))]),{...ctx,now:2000,receivedAt:2000});
  const records=view(preview,92000).diagnosticSnapshot.counterRecords;
  assert.deepEqual(records.find(row=>row.deviceIndex===0&&row.parent===773).candidates.map(row=>row.field),[4]);
  assert.ok(records.filter(row=>row.parent===773).every(row=>row.checks.every(check=>check.status==='partial')));
  assert.deepEqual(view(preview,92000).counterResearch.records,[]);
  const retained=view(preview,92000).diagnosticSnapshot.counterRecords;
  retained[0].candidates[0].value=12345;
  assert.doesNotMatch(JSON.stringify(view(preview,92000)),/12345/);
  assert.equal(view(preview,901000).diagnosticSnapshot,null);preview.clear();
});

test('late receipts, clear, opt-out, rollback and restart never revive counter numbers',()=>{
  const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);
  preview.observe(0,Buffer.concat([scalar,m(773,f(4,77))]),{...ctx,now:2000,receivedAt:500});
  assert.equal(view(preview,2000).diagnosticSnapshot.counterRecords[0].candidates.length,6);
  preview.clear(false);assert.deepEqual(view(preview,2000).counterResearch.records,[]);
  const off=new DualCtPreview(true);off.observe(0,payload,ctx);
  assert.ok(view(off).diagnosticSnapshot.counterRecords.every(row=>!row.candidates.length));off.clear();
  const disabled=new DualCtPreview(false,true);disabled.observe(0,payload,ctx);assert.equal(view(disabled).counterResearch.enabled,false);
  const rollback=new DualCtPreview(true,true);rollback.observe(0,payload,ctx);assert.deepEqual(view(rollback,999).counterResearch.records,[]);
  assert.deepEqual(view(new DualCtPreview(true,true)).counterResearch.records,[]);
});

test('normal support and compact retain only counter structure/status and match backend sanitization',()=>{
  const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);const v=view(preview,2000);
  const diagnostics=preview.diagnostics(v.reason);
  assert.deepEqual(compact({previewDiagnostics:diagnostics}).previewDiagnostics,dualCtPreviewDiagnostics(diagnostics));
  for(const report of [dualCtResearchSnapshot({previewDiagnostics:diagnostics}),compact({previewDiagnostics:diagnostics})]) {
    assert.doesNotMatch(JSON.stringify(report),/"value"|"candidates"|packetIndex|candidateUnit|150|100|PRIVATE/);
    assert.equal(report.previewDiagnostics.counterResearch.enabled,true);
    assert.equal(report.previewDiagnostics.counterResearch.records[0].checks[0].status,'consistent');
  }
  assert.doesNotMatch(JSON.stringify(diagnosticExport(v)),/counterRecords|counterResearchEnabled|150/);
  const malicious={...diagnostics,counterResearch:{...diagnostics.counterResearch,raw:'PRIVATE',records:diagnostics.counterResearch.records.map(row=>({...row,sn:'PRIVATE',value:12345}))}};
  assert.doesNotMatch(JSON.stringify(compact({previewDiagnostics:malicious})),/PRIVATE|12345/);
  assert.deepEqual(compact({previewDiagnostics:{...malicious,enabled:false}}).previewDiagnostics.counterResearch.records,[]);preview.clear();
});

test('one comparison export is historical, role-unverified, privacy projected and preserves one-record provenance',()=>{
  const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);const input=view(preview,2000);
  input.raw='PRIVATE';input.diagnosticSnapshot.counterRecords[0].sn='PRIVATE';
  const notes=[{deviceIndex:0,bank:'A',observation:'looks_like_grid',comment:'PRIVATE'},{deviceIndex:0,bank:'B',observation:'looks_like_solar'},
    {deviceIndex:0,bank:'A',observation:'does_not_match'},{deviceIndex:1,bank:'A',observation:'looks_like_grid'}];
  const report=comparisonExport(input,notes);
  assert.equal(report.reportType,'dual_ct_comparison');assert.equal(report.schemaVersion,1);assert.equal(report.counterReadingsIncluded,6);
  assert.equal(report.annotations.length,2);assert.equal(report.annotations[0].verified,false);assert.equal(report.annotations[0].basis,'user_observation');
  assert.equal(report.counterRecords[0].candidates[0].candidateUnit,null);
  const second=report.counterRecords.find(row=>row.parent===997);
  if(second)assert.equal(second.candidates.length,0);
  else{assert.equal(report.counterRecordsAvailable,2);assert.equal(report.counterRecordsOmitted,true);}
  assert.equal(report.counterRecords[0].packetIndex,1);assert.equal(report.period,'unknown');assert.equal(report.contributesToEnergy,false);
  assert.equal(report.counterContinuity.dailyAvailable,false);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE|importWh|exportWh|lifetime|ct1/);
  assert.deepEqual(comparisonExport(report),report);
  const later=age(report,100);assert.equal(later.counterRecords[0].receivedAgeSec,101);
  assert.equal(later.candidateSnapshot.retentionRemainingSec,799);assert.equal(age(report,-1),null);assert.equal(age(report,900),null);
  assert.ok(JSON.stringify(report,null,2).length<=7500);preview.clear();
});

test('untrimmed local comparison retains all bounded scalar rows, while combined sharing reports honest omissions',()=>{
  const preview=new DualCtPreview(true,true);
  const all=Buffer.concat([515,962,963,772,956,957,771,958,959,784,985,986,987,988,989,990,991,992,993,998].map(field=>f(field,field%10)));
  for(const index of [0,1])preview.observe(index,Buffer.concat([all,m(773,inner),m(997,Buffer.concat(Array.from({length:32},(_,i)=>int(i+1,0))))]),ctx);
  const local=comparisonView(view(preview));assert.ok(local);assert.equal(local.candidateSnapshot.devices.reduce((n,d)=>n+d.readings.length,0),40);
  const report=comparisonExport(local);assert.ok(report);assert.ok(JSON.stringify(report,null,2).length<=7500);
  assert.equal(report.candidateSnapshot.readingsAvailable,40);assert.equal(report.counterReadingsAvailable,12);
  assert.equal(report.counterReadingsIncluded,12);assert.ok(report.counterRecords.some(row=>row.fieldsOmitted)||report.candidateSnapshot.readingsOmitted);
  const again=comparisonExport(report);assert.ok(again);assert.equal(again.candidateSnapshot.readingsAvailable,40);
  assert.equal(again.counterReadingsAvailable,12);preview.clear();
});

test('comparison exporter rejects forged capture ages, parent identities, units, roles and unsupported numeric records',()=>{
  const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);const original=view(preview);
  assert.equal(comparisonExport({...original,diagnosticSnapshot:{...original.diagnosticSnapshot,retentionRemainingSec:901}}),null);
  for(const override of [{parent:999},{deviceIndex:1},{receivedAgeSec:-1},{packetIndex:0},{encodingBasis:'masked'}]) {
    const input=structuredClone(original);input.diagnosticSnapshot.counterRecords[0]={...input.diagnosticSnapshot.counterRecords[0],...override};
    assert.ok(!comparisonExport(input).counterRecords.some(row=>row.parent===773));
  }
  const bad=structuredClone(original);bad.diagnosticSnapshot.counterRecords[0].candidates[0].candidateUnit='Wh';
  assert.equal(comparisonExport(bad).counterRecords[0].candidates.length,0);
  bad.diagnosticSnapshot.counterRecords[1].candidates=[{field:4,value:9999,candidateUnit:null}];
  assert.equal(comparisonExport(bad).counterRecords[1].candidates.length,0);preview.clear();
});

test('API counter opt-in requires both explicit booleans, never strings, supplied device or clock',async()=>{
  const seen=[];const homey={app:{startDualCtResearch:(...args)=>{seen.push(args);return {};}}};
  for(const body of [{counterPreviewEnabled:true},{previewEnabled:true,counterPreviewEnabled:'true'},
    {previewEnabled:'true',counterPreviewEnabled:true},{previewEnabled:true,counterPreviewEnabled:true}])await api.startDualCtResearch({homey,body});
  assert.deepEqual(seen,[[false,false],[true,false],[false,false],[true,true]]);
});

test('maximal counter metadata and bank outcomes stay numeric-free within the compact budget with honest trimming',()=>{
  const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);preview.observe(1,payload,ctx);view(preview);
  const diagnostics=preview.diagnostics('ready');
  diagnostics.counterResearch.records.forEach(row=>{row.fields=Array.from({length:32},(_,i)=>({field:i+1,wire:5,value:'PRIVATE'}));});
  const evidence={previewDiagnostics:diagnostics,
    routes:[0,1].flatMap(deviceIndex=>['app_mqtt','developer_mqtt','developer_rest','linked_host_rest'].map(source=>
      ({deviceIndex,source,status:'listening',receiptConfirmed:true,receivedPackets:128,lastReceiptAgeSec:0}))),
    shapes:Array.from({length:16},(_,i)=>({deviceIndex:i%2,cmdFunc:254,cmdId:i,fields:Array.from({length:32},(_,j)=>({field:j+1,wire:5}))}))};
  const report=compact(evidence);assert.ok(JSON.stringify(report,null,2).length<=7500);
  const metadata=report.previewDiagnostics.counterResearch;
  assert.equal(metadata.records.length,4);assert.ok(metadata.records.some(row=>row.fieldsOmitted));
  for(const row of metadata.records){assert.equal(row.fieldsAvailable,32);assert.equal(row.fieldsIncluded,row.fields.length);}
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE|"value"|candidateUnit|packetIndex/);
  const again=compact({previewDiagnostics:report.previewDiagnostics});
  assert.deepEqual(again.previewDiagnostics.counterResearch,metadata);preview.clear();
});

test('fixed retention timer also erases counter candidates without refresh or a new observation',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const preview=new DualCtPreview(true,true);preview.observe(0,payload,ctx);
  assert.equal(view(preview).diagnosticSnapshot.counterRecords[0].candidates.length,6);
  t.mock.timers.tick(900000);assert.deepEqual(view(preview).counterResearch.records,[]);
  preview.observe(0,payload,ctx);assert.equal(view(preview).diagnosticSnapshot,null);preview.clear();
});

test('research capture keeps counter opt-in immutable and rejects late callbacks after stop/account switch',async()=>{
  let handler;const research=new DualCtResearch({previewEnabled:true,counterPreviewEnabled:true,now:()=>1000,
    list:async()=>[{sn:'DUALCTSYNTHETIC01',shared:false,productName:'421',modelCodes:[{field:'productType',code:421}]}],
    subscribe:async(_,fn)=>{handler=fn;return true;},unsubscribe:()=>{},timer:()=>1,cancel:()=>{}});
  await research.start();const frame=m(1,Buffer.concat([m(1,payload),int(6,0),int(8,254),int(9,21)]));
  assert.equal(frame[1],123,'protobuf length byte looks like JSON opening brace after trimStart');
  handler(frame,'/app/device/property/DUALCTSYNTHETIC01');
  assert.equal(research.previewSnapshot().diagnosticSnapshot.counterRecords[0].candidates.length,6);
  assert.equal(research.snapshot().previewDiagnostics.counterResearch.enabled,true);
  handler(Buffer.from('\n {"data":{"power":5}}'),'/app/device/property/DUALCTSYNTHETIC01');
  assert.equal(research.snapshot().rejectedFrames,0,'genuine whitespace-prefixed JSON still works');
  const late=handler;research.stop('account_changed',true);late(frame,'/app/device/property/DUALCTSYNTHETIC01');
  assert.deepEqual(research.previewSnapshot().counterResearch.records,[]);assert.deepEqual(research.snapshot().previewDiagnostics.counterResearch.records,[]);
});

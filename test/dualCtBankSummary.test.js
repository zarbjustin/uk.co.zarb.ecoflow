'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtPreview } = require('../.homeybuild/lib/dualCtPreview');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { dualCtPreviewDiagnostics } = require('../.homeybuild/lib/dualCtDiagnostics');
const { compact, render } = require('../settings/dual-ct-status');
const ctx = { productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',receivedAt:1000,now:1000 };
function vi(n) { const out=[];do{out.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(out); }
function float(f,n) {const b=Buffer.alloc(4);b.writeFloatLE(n);return Buffer.concat([vi(f*8+5),b]);}
function msg(f,b) {return Buffer.concat([vi(f*8+2),vi(b.length),b]);}
function integer(f,n) {return Buffer.concat([vi(f*8),vi(n)]);}
const payload = (mismatch=false) => Buffer.concat([[515,mismatch?999:6],[962,1],[963,2],[772,3],[998,-12],[991,-2],[992,-4],[993,-6]].map(([f,n])=>float(f,n)));
function diagnostics(preview,now) {return preview.diagnostics(preview.snapshot(now).reason);}
const summary = d => d.bankCheckSummary;
const forbidden = /reportedTotal|phaseValues|phaseSum|difference|tolerance|packetIndex|candidateUnit|PRIVATE|serial|rawPayload/;

test('numeric-free bank outcomes survive runtime, support and compact projections without operands',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,payload(true),ctx);
  const d=diagnostics(preview,1000);const report=compact({previewDiagnostics:d},'1.10.47');
  assert.equal(report.schemaVersion,6);assert.equal(summary(d).reported,true);
  assert.deepEqual(summary(report.previewDiagnostics),summary(d));
  assert.deepEqual(summary(dualCtResearchSnapshot({previewDiagnostics:d}).previewDiagnostics),summary(d));
  assert.deepEqual(summary(d).banks.map(r=>r.latest.status),['mismatch','consistent']);
  assert.equal(summary(d).mappingVerified,false);assert.equal(summary(d).unitsVerified,false);
  assert.equal(summary(d).directionVerified,false);assert.equal(summary(d).measurementSimultaneityVerified,false);
  assert.doesNotMatch(JSON.stringify(report),forbidden);assert.equal(report.valuesIncluded,false);
  assert.doesNotMatch(JSON.stringify(report),/999|-12/);preview.clear();
});

test('partial payloads cannot become a complete summary by cache merging or equal receipt times',()=>{
  const preview=new DualCtPreview(true);
  preview.observe(0,Buffer.concat([float(515,6),float(962,1)]),ctx);
  preview.observe(0,Buffer.concat([float(963,2),float(772,3)]),ctx);
  const rows=summary(diagnostics(preview,1000)).banks;
  assert.equal(rows[0].latest.status,'partial');assert.equal(rows[0].lastComplete,null);
  assert.equal(rows[1].lastComplete,null);preview.clear();
});

test('latest partial and last-complete independently age and become stale exactly at 90 seconds',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,payload(),ctx);
  preview.observe(0,float(515,20),{...ctx,now:90000,receivedAt:90000});
  const before=summary(diagnostics(preview,90999)).banks[0];
  assert.equal(before.lastComplete.stale,false);assert.equal(before.latest.stale,false);
  const after=summary(diagnostics(preview,91000)).banks[0];
  assert.equal(after.lastComplete.stale,true);assert.equal(after.lastComplete.receivedAgeSec,90);
  assert.equal(after.latest.stale,false);assert.equal(after.latest.receivedAgeSec,1);
  assert.equal(after.latest.status,'partial');assert.equal(after.lastComplete.status,'consistent');
  after.lastComplete.status='PRIVATE';assert.equal(summary(diagnostics(preview,91000)).banks[0].lastComplete.status,'consistent');
  assert.deepEqual(summary(diagnostics(preview,901000)).banks,[]);preview.clear();
});

test('two devices are distinct, disabled/legacy evidence cannot invent bank outcomes, and clear removes them',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,payload(),ctx);preview.observe(1,payload(true),ctx);
  const d=diagnostics(preview,1000);assert.equal(summary(d).banks.length,4);
  assert.equal(summary(d).banks.find(r=>r.deviceIndex===1&&r.bank==='A').latest.status,'mismatch');
  for(const enabled of [false,null,undefined]) {
    assert.deepEqual(summary(dualCtPreviewDiagnostics({...d,enabled})).banks,[]);
    assert.deepEqual(summary(compact({previewDiagnostics:{...d,enabled}}).previewDiagnostics).banks,[]);
  }
  assert.equal(summary(compact({previewDiagnostics:{enabled:true}}).previewDiagnostics).reported,false);
  preview.clear(false);assert.deepEqual(summary(diagnostics(preview,1000)).banks,[]);
  const disabled=new DualCtPreview(false);disabled.observe(0,payload(),ctx);
  assert.equal(summary(diagnostics(disabled,1000)).reported,false);
});

test('backend and frontend whitelist the same outcomes, reject invalid ages/scopes/order and strip arbitrary nested data',()=>{
  const valid={deviceIndex:0,bank:'A',latest:{status:'partial',receivedAgeSec:2},lastComplete:{status:'consistent',receivedAgeSec:91}};
  const check=entry=>{
    const input={enabled:true,bankCheckSummary:{reported:true,scope:'retained_capture_history',arithmeticScope:'single_decoded_payload',banks:[entry]}};
    const backend=dualCtPreviewDiagnostics(input);const frontend=compact({previewDiagnostics:input}).previewDiagnostics;
    assert.deepEqual(frontend,backend);return summary(backend);
  };
  const malicious={...valid,raw:'PRIVATE',sn:'PRIVATE',latest:{...valid.latest,value:123456,reportedTotal:123456,raw:'PRIVATE',stale:true},
    lastComplete:{...valid.lastComplete,phaseValues:[123456],stale:false}};
  assert.equal(check(malicious).banks.length,1);assert.doesNotMatch(JSON.stringify(check(malicious)),forbidden);
  assert.equal(check(malicious).banks[0].latest.stale,false);assert.equal(check(malicious).banks[0].lastComplete.stale,true);
  for(const entry of [null,{...valid,bank:'CT1'},{...valid,deviceIndex:2},
    ...[-1,NaN,Infinity,990,'1'].map(receivedAgeSec=>({...valid,latest:{status:'partial',receivedAgeSec}})),
    {...valid,latest:{status:'PRIVATE',receivedAgeSec:0}},
    {...valid,lastComplete:{status:'partial',receivedAgeSec:5}},
    {...valid,lastComplete:{status:'consistent',receivedAgeSec:1}},
    {...valid,latest:{status:'mismatch',receivedAgeSec:2}},
    {...valid,latest:{status:'consistent',receivedAgeSec:2},lastComplete:null}]) assert.deepEqual(check(entry).banks,[]);
  for(const override of [{scope:'latest_per_field'},{arithmeticScope:'cache'},{reported:false}]) {
    const input={enabled:true,bankCheckSummary:{reported:true,scope:'retained_capture_history',arithmeticScope:'single_decoded_payload',banks:[valid],...override}};
    assert.deepEqual(summary(dualCtPreviewDiagnostics(input)).banks,[]);
    assert.deepEqual(summary(compact({previewDiagnostics:input}).previewDiagnostics).banks,[]);
  }
});

test('summary remains bounded with two meters and worst-case compact structure and re-export',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,payload(),ctx);preview.observe(1,payload(true),ctx);
  const d=diagnostics(preview,91000);
  d.bankCheckSummary.banks.push(...d.bankCheckSummary.banks);
  const report=compact({previewDiagnostics:d,shapes:Array.from({length:16},(_,i)=>({deviceIndex:i%2,cmdFunc:254,cmdId:i,
    fields:Array.from({length:32},(_,j)=>({field:j+1,wire:5,value:'PRIVATE'}))}))});
  assert.equal(summary(report.previewDiagnostics).banks.length,4);
  assert.ok(JSON.stringify(report,null,2).length<=7500);assert.equal(report.structureOmitted,true);
  assert.doesNotMatch(JSON.stringify(report),forbidden);
  assert.deepEqual(summary(compact({previewDiagnostics:report.previewDiagnostics}).previewDiagnostics),summary(report.previewDiagnostics));preview.clear();
});

test('summary renders neutral labels and receipt freshness in EN/DE/NL without numeric operands',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,payload(),ctx);
  const evidence={previewDiagnostics:diagnostics(preview,91000)};
  for(const lang of ['en','de','nl']) {
    const locale=require(`../locales/${lang}.json`).settings.dual_ct;
    const texts=[];const el={textContent:'',ownerDocument:{createElement:()=>({textContent:''})},appendChild:p=>texts.push(p.textContent)};
    render(el,evidence,key=>locale[key]||key);
    assert.ok(texts.some(t=>t.includes(locale.bank_summary_help)));
    assert.ok(texts.some(t=>t.includes(locale.bank_stale)));
    assert.ok(texts.some(t=>t.includes(locale.bank_candidate)&&t.includes('A')));
    assert.doesNotMatch(texts.join('\n'),/bank_summary_help|bank_stale|reportedTotal|999|-12/);
    for(const key of ['bank_invalid','bank_stale','bank_recent','bank_summary_help']) assert.equal(typeof locale[key],'string');
  }
  preview.clear();
});

test('research stop/account change/new capture and clock rollback never resurrect bank summaries',async()=>{
  let now=1000,handler;
  const capture=new DualCtResearch({previewEnabled:true,now:()=>now,
    list:async()=>[{sn:'DUALCTSYNTHETIC01',productName:'421',shared:false,modelCodes:[{field:'productType',code:421}]}],
    subscribe:async(_,fn)=>{handler=fn;return true;},unsubscribe:()=>{},timer:()=>1,cancel:()=>{}});
  const frame=msg(1,Buffer.concat([msg(1,payload()),integer(8,254),integer(9,21),integer(6,0)]));
  await capture.start();handler(frame,'/app/device/property/DUALCTSYNTHETIC01');
  assert.equal(summary(capture.snapshot().previewDiagnostics).banks.length,2);
  const late=handler;capture.stop('stopped');late(frame,'/app/device/property/DUALCTSYNTHETIC01');
  assert.deepEqual(summary(capture.snapshot().previewDiagnostics).banks,[]);
  await capture.start();assert.deepEqual(summary(capture.snapshot().previewDiagnostics).banks,[]);
  handler(frame,'/app/device/property/DUALCTSYNTHETIC01');now=500;
  assert.deepEqual(summary(capture.snapshot().previewDiagnostics).banks,[]);
  capture.stop('account_changed',true);assert.deepEqual(summary(capture.snapshot().previewDiagnostics).banks,[]);
});

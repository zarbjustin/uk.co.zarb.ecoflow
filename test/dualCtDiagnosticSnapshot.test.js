'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtPreview } = require('../.homeybuild/lib/dualCtPreview');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { compact, diagnosticExport, candidateExport, renderPreview } = require('../settings/dual-ct-status');
const base = { productType: 421, cmdFunc: 254, cmdId: 21, source: 'app_mqtt', encoding: 'plain', now: 1000, receivedAt: 1000 };
function vi(value) { const out=[]; do { out.push((value&127)|(value>127?128:0)); value=Math.floor(value/128); } while(value); return Buffer.from(out); }
function float(field,value) { const b=Buffer.alloc(4); b.writeFloatLE(value); return Buffer.concat([vi(field*8+5),b]); }
function msg(field,b) { return Buffer.concat([vi(field*8+2),vi(b.length),b]); }
function integer(field,value) { return Buffer.concat([vi(field*8),vi(value)]); }
function archive(preview, now) { return diagnosticExport({ ...preview.snapshot(now), appVersion:'1.10.45' }); }

test('historical export survives live expiry, keeps genuine zero and original per-field receipt ages', () => {
  const preview=new DualCtPreview(true);
  preview.observe(0,Buffer.concat([float(515,-7),float(956,230)]),base);
  preview.observe(0,float(515,0),{...base,now:80000,receivedAt:80000});
  let view=preview.snapshot(91000);
  assert.equal(view.devices[0].readings.length,1,'exact 90-second boundary removes only older field');
  let report=archive(preview,180000);
  assert.deepEqual(preview.snapshot(180000).devices,[]);
  assert.equal(report.reportType,'dual_ct_candidate_snapshot'); assert.equal(report.schemaVersion,3);
  assert.equal(report.historical,true); assert.equal(report.notLive,true); assert.equal(report.simultaneous,false);
  assert.equal(report.devices[0].readings.find(r=>r.field===515).value,0);
  assert.equal(report.devices[0].readings.find(r=>r.field===515).receivedAgeSec,100);
  assert.equal(report.devices[0].readings.find(r=>r.field===956).receivedAgeSec,179);
  assert.equal(report.retentionRemainingSec,721);
  assert.equal(report.unitsVerified,false); assert.equal(report.directionVerified,false);
  assert.equal(report.contributesToEnergy,false); assert.equal(report.controlsEnabled,false);
  assert.equal(archive(preview,901000),null);
  assert.equal(preview.snapshot(901001).diagnosticSnapshot,null);
});

test('refresh, failed decoding and later packets never renew the historical deadline', () => {
  const preview=new DualCtPreview(true); preview.observe(0,float(515,4),base);
  assert.equal(archive(preview,2000).retentionRemainingSec,899);
  preview.observe(0,float(999,8),{...base,now:10000,receivedAt:10000});
  preview.observe(0,float(956,230),{...base,now:50000,receivedAt:50000});
  assert.equal(archive(preview,900999).retentionRemainingSec,0.001);
  assert.equal(archive(preview,901000),null);
  // Even a synthetic callback past the capture window cannot restart the deadline.
  preview.observe(0,float(515,8),{...base,now:902000,receivedAt:902000});
  assert.equal(archive(preview,902000),null);
  assert.deepEqual(preview.snapshot(902000).devices,[]);
});

test('opt-out, clear, clock rollback and restart cannot restore historical numeric evidence', () => {
  const off=new DualCtPreview(false); off.observe(0,float(515,4),base);
  assert.equal(archive(off,1000),null);
  for(const operation of ['clear','rollback']) {
    const preview=new DualCtPreview(true); preview.observe(0,float(515,4),base);
    if(operation==='clear') preview.clear(); else preview.snapshot(999);
    assert.equal(archive(preview,1000),null);
  }
  assert.equal(archive(new DualCtPreview(true),1000),null);
});

test('retention timer clears numeric memory without a refresh and cannot be revived by a late callback', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const preview=new DualCtPreview(true); preview.observe(0,float(515,4),base);
  t.mock.timers.tick(900000);
  assert.equal(preview.snapshot(1000).diagnosticSnapshot,null);
  assert.deepEqual(preview.snapshot(1000).devices,[]);
  preview.observe(0,float(515,8),base);
  assert.equal(preview.snapshot(1000).diagnosticSnapshot,null);
  assert.deepEqual(preview.snapshot(1000).devices,[]);
  preview.clear();
});

test('retained snapshot copies cannot mutate the cache, leak identifiers or enter normal reports', () => {
  const preview=new DualCtPreview(true); preview.observe(0,float(515,-12345),base);
  const view=preview.snapshot(120000);
  view.diagnosticSnapshot.devices[0].readings[0].value=999;
  assert.equal(archive(preview,120000).devices[0].readings[0].value,-12345);
  const input={...preview.snapshot(120000),serial:'PRIVATE',email:'PRIVATE',raw:'PRIVATE'};
  input.diagnosticSnapshot.devices[0].sn='PRIVATE';
  assert.doesNotMatch(JSON.stringify(diagnosticExport(input)),/PRIVATE|captureId|aggregatePower/);
  for(const structural of [dualCtResearchSnapshot(input),compact(input,'1.10.45')]) {
    assert.doesNotMatch(JSON.stringify(structural),/-12345|diagnosticSnapshot|candidateUnit|"value"/);
  }
  const element={textContent:''};
  assert.equal(renderPreview(element,input,key=>key),0);
  assert.doesNotMatch(element.textContent,/-12345/);
});

test('diagnostic exporter rejects forged metadata and never promotes historical values to live preview', () => {
  const preview=new DualCtPreview(true); preview.observe(0,float(515,4),base);
  const input=preview.snapshot(120000);
  assert.equal(candidateExport(input),null);
  for(const override of [{kind:'live'},{simultaneous:true},{retentionRemainingSec:901},
    {retentionRemainingSec:0},{retainedForSec:-1},{retainedForSec:NaN},{lastPacketAgeSec:-1},
    {lastPacketAgeSec:Infinity},{lastPacketAgeSec:800},{retentionRemainingSec:899}]) {
    assert.equal(diagnosticExport({...input,diagnosticSnapshot:{...input.diagnosticSnapshot,...override}}),null);
  }
  for(const override of [{value:Infinity},{candidateUnit:'kW'},{encodingBasis:'PRIVATE'},{receivedAgeSec:-1},{receivedAgeSec:2000}]) {
    const d={...input.diagnosticSnapshot,devices:[{deviceIndex:0,readings:[{...input.diagnosticSnapshot.devices[0].readings[0],...override}]}]};
    assert.equal(diagnosticExport({...input,diagnosticSnapshot:d}),null);
  }
});

test('two-meter historical export stays bounded, signals trimming and preserves coverage when copied again', () => {
  const fields=[515,962,963,772,956,957,771,958,959,784,985,986,987,988,989,990,991,992,993,998];
  const preview=new DualCtPreview(true);
  for(const device of [0,1]) preview.observe(device,Buffer.concat(fields.map(field=>float(field,-123.125))),base);
  const report=archive(preview,120000);
  assert.equal(report.readingsAvailable,40); assert.equal(report.readingsOmitted,true);
  assert.equal(report.devices.length,2);
  assert.ok(JSON.stringify(report,null,2).length<=7500);
  const copy=diagnosticExport({...report,diagnosticSnapshot:{...report,kind:'historical_capture'}});
  assert.equal(copy.readingsAvailable,40); assert.equal(copy.readingsOmitted,true);
  assert.equal(copy.devices.length,2);
  assert.ok(copy.devices.flatMap(d=>d.readings).every(row=>row.receivedAgeSec===119));
  assert.ok(JSON.stringify(copy,null,2).length<=7500);
});

test('automatic completion retains bounded evidence, but Stop, account change and a new capture erase it', async () => {
  let handler; let now=1000; const sn='DUALCTSYNTHETIC01';
  const research=new DualCtResearch({previewEnabled:true,now:()=>now,
    list:async()=>[{sn,shared:false,modelCodes:[{field:'productType',code:421}]}],
    subscribe:async(_,fn)=>{handler=fn;return true;},unsubscribe:()=>{},timer:()=>1,cancel:()=>{}});
  const emit=()=>handler(msg(1,Buffer.concat([msg(1,float(515,-7)),integer(6,0),integer(8,254),integer(9,21)])),`/app/device/property/${sn}`);
  await research.start(); emit(); research.stop('complete'); now=180000;
  assert.ok(diagnosticExport(research.previewSnapshot()));
  assert.doesNotMatch(JSON.stringify(research.snapshot()),/diagnosticSnapshot|"value"|candidateUnit/);
  for(const stop of ['stopped','account_changed']) {
    research.stop(stop,true); assert.equal(research.previewSnapshot().diagnosticSnapshot,null);
    now+=1000; await research.start(); emit();
  }
  research.stop('complete'); now+=1000; await research.start();
  assert.equal(research.previewSnapshot().diagnosticSnapshot,null);
  research.stop();
});

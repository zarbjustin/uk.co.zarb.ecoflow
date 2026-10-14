'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DUAL_CT_BANKS, dualCtBankCandidate, checkDualCtBanks } = require('../.homeybuild/lib/dualCtBanks');
const { decodeDualCtCandidates } = require('../.homeybuild/lib/dualCtDecoder');
const { DualCtPreview } = require('../.homeybuild/lib/dualCtPreview');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { bankCandidate, diagnosticExport, compact } = require('../settings/dual-ct-status');
const base = { productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',receivedAt:1000,now:1000 };
function vi(value) { const out=[];do {out.push((value&127)|(value>127?128:0));value=Math.floor(value/128);}while(value);return Buffer.from(out); }
function float(field,value) {const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);return Buffer.concat([vi(field*8+5),bytes]);}
function msg(field,bytes) {return Buffer.concat([vi(field*8+2),vi(bytes.length),bytes]);}
function integer(field,value) {return Buffer.concat([vi(field*8),vi(value)]);}
const a = [[515,0.5],[962,100],[963,60],[772,-159.5]];
const b = [[998,12],[991,12],[992,0],[993,0]];
const bytes = values => Buffer.concat(values.map(([field,value])=>float(field,value)));
const rows = values => values.map(([field,value])=>({field,value}));

test('neutral bank/phase hypotheses agree in backend and settings without assigning CT/grid/solar roles',()=>{
  const seen=new Set();
  for(const bank of DUAL_CT_BANKS) for(const field of [bank.total,...bank.power,...bank.voltage,...bank.current]) {
    assert.equal(seen.has(field),false);seen.add(field);
    const backend=dualCtBankCandidate(field);
    assert.deepEqual(bankCandidate(field),backend);
    assert.equal(backend.bank,bank.bank);
    assert.doesNotMatch(JSON.stringify(backend),/grid|solar|import|export|CT1|CT2/);
  }
  assert.equal(seen.size,20);assert.equal(bankCandidate(997),null);assert.equal(dualCtBankCandidate(773),null);
  assert.deepEqual(dualCtBankCandidate(985),{bank:'B',phase:1,quantity:'voltage',suggestedUnit:'V'});
});

test('same-payload power checks preserve cancellation, negative direction and explicit zeros, without verification claims',()=>{
  for(const values of [[...a,...b],[[515,-6],[962,-1],[963,-2],[772,-3],[998,0],[991,0],[992,0],[993,0]]]) {
    const decoded=decodeDualCtCandidates(bytes(values),base);
    assert.ok(decoded.bankChecks.every(check=>check.status==='consistent'));
    for(const check of decoded.bankChecks) {
      assert.equal(check.scope,'single_decoded_payload');assert.equal(check.mappingVerified,false);
      assert.equal(check.roleVerified,false);assert.equal(check.measurementSimultaneityVerified,false);
    }
    assert.equal(decoded.contributesToEnergy,false);assert.equal(decoded.additionalBankMappingVerified,false);
  }
});

test('float32 tolerance admits representation roundoff but a mismatch stays visible without rejecting readings',()=>{
  const values=[[515,0.61111],[962,101.12345],[963,50.98766],[772,-151.5]];
  assert.equal(decodeDualCtCandidates(bytes(values),base).bankChecks[0].status,'consistent');
  const bad=decodeDualCtCandidates(bytes([[515,5],...a.slice(1)]),base);
  assert.equal(bad.bankChecks[0].status,'mismatch');assert.equal(bad.readings.length,4);
  assert.ok(Math.abs(bad.bankChecks[0].difference)>bad.bankChecks[0].tolerance);
  assert.equal(bad.bankChecks[1].status,'partial');
});

test('partial packets at the same receipt time cannot form a coherent check from cached fields',()=>{
  const preview=new DualCtPreview(true);
  preview.observe(0,bytes(a.slice(0,2)),base);
  preview.observe(0,bytes(a.slice(2)),base);
  const view=preview.snapshot(1000);
  assert.equal(view.devices[0].readings.length,4);
  assert.deepEqual([...new Set(view.devices[0].readings.map(row=>row.packetIndex))],[1,2]);
  const check=view.diagnosticSnapshot.bankChecks.find(check=>check.bank==='A');
  assert.equal(check.latest.status,'partial');assert.equal(check.latest.packetIndex,2);assert.equal(check.lastComplete,null);
});

test('a newer partial update does not replace or refresh a separately aged last-complete check',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,bytes([...a,...b]),base);
  preview.observe(0,float(515,99),{...base,now:80000,receivedAt:80000});
  const view=preview.snapshot(92000);
  assert.equal(view.devices[0].readings.length,1);
  const checks=view.diagnosticSnapshot.bankChecks;
  const bankA=checks.find(check=>check.bank==='A');
  assert.equal(bankA.latest.status,'partial');assert.equal(bankA.latest.receivedAgeSec,12);
  assert.equal(bankA.lastComplete.status,'consistent');assert.equal(bankA.lastComplete.receivedAgeSec,91);
  assert.equal(bankA.lastComplete.reportedTotal,0.5);assert.equal(bankA.lastComplete.packetIndex,1);
  assert.equal(checks.find(check=>check.bank==='B').latest.status,'partial');
  assert.equal(checks.find(check=>check.bank==='B').lastComplete.reportedTotal,12);
  // Mutating a response cannot alter retained evidence.
  bankA.lastComplete.phaseValues[0]=999;
  assert.equal(preview.snapshot(92000).diagnosticSnapshot.bankChecks[0].lastComplete.phaseValues[0],100);
  preview.clear();assert.equal(preview.snapshot(92000).diagnosticSnapshot,null);
});

test('coherence never crosses banks/devices, uses missing-not-zero and rejects invalid helper inputs',()=>{
  const partial=checkDualCtBanks(rows([[515,0],[962,0],[963,0],[998,0],[993,0]]));
  assert.ok(partial.every(check=>check.status==='partial'));
  for(const invalid of [[...rows(a),{field:515,value:0.5}],[...rows(a),{field:956,value:NaN}]]) {
    assert.ok(checkDualCtBanks(invalid).every(check=>check.status==='invalid'));
  }
  const preview=new DualCtPreview(true);
  preview.observe(0,bytes(a.slice(0,2)),base);preview.observe(1,bytes(a.slice(2)),base);
  assert.ok(preview.snapshot(1000).diagnosticSnapshot.bankChecks.every(check=>check.lastComplete===null));
  preview.clear();
});

test('zero and negative secondary candidates never assign a role or permanently disable phases',()=>{
  const preview=new DualCtPreview(true);
  for(const [index,values] of [ [[998,-6],[991,-1],[992,-2],[993,-3]], b,
    [[998,9],[991,2],[992,3],[993,4]] ].entries()) {
    const now=1000+index;
    preview.observe(0,bytes(values),{...base,now,receivedAt:now});
    const view=preview.snapshot(now);const check=view.diagnosticSnapshot.bankChecks.find(row=>row.bank==='B');
    assert.equal(check.latest.status,'consistent');assert.equal(check.latest.roleVerified,false);
    assert.equal(view.devices[0].readings.find(row=>row.field===992).value,values[2][1]);
    assert.doesNotMatch(JSON.stringify(check),/solar|import|export|inactive|disconnected/);
  }
  preview.clear();
});

test('payload indices cannot wrap or repeat after the bounded maximum',()=>{
  const preview=new DualCtPreview(true);
  for(let index=0;index<2050;index++) preview.observe(0,bytes(a),base);
  const view=preview.snapshot(1000);
  assert.ok(view.devices[0].readings.every(row=>row.packetIndex===2048));
  assert.equal(preview.diagnostics(view.reason).acceptedPayloads,2048);
  preview.clear();
});

test('historical export carries packet provenance, neutral hypotheses and separate aged coherent evidence, not normal reports',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,bytes([...a,...b]),base);
  const view={...preview.snapshot(150000),appVersion:'1.10.46'};
  const report=diagnosticExport(view);
  assert.equal(report.schemaVersion,4);assert.deepEqual(report.bankHypotheses,DUAL_CT_BANKS);
  assert.equal(report.bankChecks.length,2);assert.equal(report.bankChecksAvailable,2);
  assert.equal(report.bankChecksOmitted,false);assert.equal(report.bankMappingVerified,false);
  assert.equal(report.measurementSimultaneityVerified,false);assert.equal(report.simultaneous,false);
  assert.ok(report.devices[0].readings.every(row=>row.packetIndex===1));
  assert.equal(report.bankChecks[0].lastComplete.receivedAgeSec,149);
  for(const normal of [dualCtResearchSnapshot(view),compact(view,'1.10.46')]) {
    assert.doesNotMatch(JSON.stringify(normal),/bankChecks|phaseSum|phaseValues|packetIndex|candidateUnit|reportedTotal/);
  }
  const again=diagnosticExport({...report,diagnosticSnapshot:{...report,kind:'historical_capture'}});
  assert.deepEqual(again.bankChecks,report.bankChecks);
  preview.clear();
});

test('old exports and equal ages without packet provenance never invent coherent evidence',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,bytes(a),base);
  const view=preview.snapshot(1000);delete view.diagnosticSnapshot.bankChecks;
  view.diagnosticSnapshot.devices[0].readings.forEach(row=>delete row.packetIndex);
  const output=diagnosticExport(view);
  assert.deepEqual(output.bankChecks,[]);
  assert.ok(output.devices[0].readings.every(row=>row.packetIndex===undefined));
  preview.clear();
});

test('check export ignores forged scope/identity/nonfinite/age/status claims and has fixed privacy projection',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,bytes(a),base);
  const original=preview.snapshot(1000);
  for(const override of [{scope:'cached_fields'},{packetIndex:0},{encodingBasis:'PRIVATE'},{receivedAgeSec:-1},
    {status:'consistent',phaseValues:[Infinity,0,0]},{status:'partial'}, {status:'mismatch'}]) {
    const view=structuredClone(original);view.diagnosticSnapshot.bankChecks[0].latest={...view.diagnosticSnapshot.bankChecks[0].latest,...override};
    assert.ok(!diagnosticExport(view).bankChecks.some(row=>row.bank==='A'));
  }
  original.diagnosticSnapshot.bankChecks[0].latest.serial='PRIVATE';
  original.diagnosticSnapshot.bankChecks[0].lastComplete.raw='PRIVATE';
  assert.doesNotMatch(JSON.stringify(diagnosticExport(original)),/PRIVATE/);
  const conflicting=structuredClone(original);
  conflicting.diagnosticSnapshot.bankChecks[0].lastComplete.phaseValues=[0,0,0];
  conflicting.diagnosticSnapshot.bankChecks[0].lastComplete.reportedTotal=0;
  assert.ok(!diagnosticExport(conflicting).bankChecks.some(row=>row.bank==='A'),'same index cannot carry conflicting payload evidence');
  preview.clear();
});

test('two-meter coherent evidence stays within export budget with honest reading/check coverage',()=>{
  const preview=new DualCtPreview(true);
  const values=[...a,...b,...[956,957,771,958,959,784,985,986,987,988,989,990].map(field=>[field,1])];
  for(const index of [0,1]) preview.observe(index,bytes(values),base);
  const report=diagnosticExport(preview.snapshot(1000));
  assert.ok(JSON.stringify(report,null,2).length<=7500);assert.equal(report.readingsAvailable,40);
  assert.equal(report.bankChecksAvailable,4);assert.equal(report.devices.length,2);
  assert.equal(report.bankChecksIncluded,report.bankChecks.length);
  assert.ok(report.readingsOmitted||report.bankChecksOmitted);
  const again=diagnosticExport({...report,diagnosticSnapshot:{...report,kind:'historical_capture'}});
  assert.equal(again.readingsAvailable,40);assert.equal(again.bankChecksAvailable,4);
  assert.ok(JSON.stringify(again,null,2).length<=7500);
  preview.clear();
});

test('two headers in one MQTT delivery retain distinct payload indices even with an identical receipt clock',async()=>{
  let handler;const sn='DUALCTSYNTHETIC01';
  const research=new DualCtResearch({previewEnabled:true,now:()=>1000,
    list:async()=>[{sn,shared:false,modelCodes:[{field:'productType',code:421}]}],
    subscribe:async(_,fn)=>{handler=fn;return true;},unsubscribe:()=>{},timer:()=>1,cancel:()=>{}});
  await research.start();
  const header=values=>msg(1,Buffer.concat([msg(1,bytes(values)),integer(6,0),integer(8,254),integer(9,21)]));
  handler(Buffer.concat([header(a.slice(0,2)),header(a.slice(2))]),`/app/device/property/${sn}`);
  const view=research.previewSnapshot();
  assert.equal(view.diagnosticSnapshot.bankChecks.find(check=>check.bank==='A').lastComplete,null);
  assert.deepEqual([...new Set(view.devices[0].readings.map(row=>row.packetIndex))],[1,2]);
  assert.doesNotMatch(JSON.stringify(research.snapshot()),/packetIndex|phaseValues|bankChecks/);
  research.stop();assert.equal(research.previewSnapshot().diagnosticSnapshot,null);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {decodeDualCtCandidates}=require('../.homeybuild/lib/dualCtDecoder');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
const {compact,diagnosticExport}=require('../settings/dual-ct-status');
const context={productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',receivedAt:1000,now:1000};
function vi(n){const b=[];do{b.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(b);}
function float(f,n){const b=Buffer.alloc(4);b.writeFloatLE(n);return Buffer.concat([vi(f*8+5),b]);}
function msg(f,b){return Buffer.concat([vi(f*8+2),vi(b.length),b]);}
const power=Buffer.concat([[515,-6],[962,-1],[963,-2],[772,-3]].map(([f,n])=>float(f,n)));
const nested=Buffer.concat([[1,-200],[2,100],[3,600],[4,1300],[5,42],[6,800],[7,500]].map(([f,n])=>float(f,n)));

test('773 and 997 are opaque nested records, never promoted using original-meter counter hypotheses',()=>{
  const decoded=decodeDualCtCandidates(Buffer.concat([power,msg(773,nested),msg(997,nested)]),context);
  assert.deepEqual(decoded.readings.map(r=>r.field),[515,962,963,772]);
  assert.equal(decoded.bankChecks[0].status,'consistent');
  assert.equal(decoded.contributesToEnergy,false);assert.equal(decoded.controlsEnabled,false);
  assert.doesNotMatch(JSON.stringify(decoded),/todayActive|totalReactiveEnergy|totalActiveEnergy|importWh|exportWh|netWh|daily|cumulative/);
  for(const field of [773,997]) assert.equal(decodeDualCtCandidates(msg(field,nested),context),null);
});

test('missing, zero, negative and malformed-inner counter candidates never fabricate energy or reject valid power',()=>{
  for(const record of [Buffer.alloc(0),float(4,0),float(7,-55),Buffer.from([255]),float(7,NaN)]) {
    const decoded=decodeDualCtCandidates(Buffer.concat([power,msg(773,record),msg(997,record)]),context);
    assert.equal(decoded.readings.length,4);assert.equal(decoded.contributesToEnergy,false);
    assert.equal(decoded.bankChecks[0].status,'consistent');
  }
  const truncated=Buffer.concat([power,vi(773*8+2),vi(20),Buffer.from([0])]);
  assert.equal(decodeDualCtCandidates(truncated,context),null,'outer framing must still be structurally valid');
});

test('nested records cannot satisfy absent-marker scalar signature or change measurement-family namespace',()=>{
  assert.equal(decodeDualCtCandidates(Buffer.concat([float(515,1),msg(773,nested),msg(997,nested)]),
    {...context,encodingBasis:'omitted_zero_candidate'}),null);
  for(const override of [{productType:21},{cmdId:22},{source:'developer_mqtt'},{encoding:'masked'}]) {
    assert.equal(decodeDualCtCandidates(Buffer.concat([power,msg(773,nested)]),{...context,...override}),null);
  }
});

test('counter-shaped household values stay out of normal reports and separate scalar candidate exports',()=>{
  const preview=new DualCtPreview(true);preview.observe(0,Buffer.concat([power,msg(773,nested),msg(997,nested)]),context);
  const view=preview.snapshot(1000);const exported=diagnosticExport({...view,appVersion:'1.10.47'});
  assert.equal(exported.devices[0].readings.length,4);assert.equal(exported.contributesToEnergy,false);
  assert.doesNotMatch(JSON.stringify(exported),/1300|800|todayActive|importWh|cumulative|daily/);
  const report=compact({previewDiagnostics:preview.diagnostics(view.reason),
    shapes:[{deviceIndex:0,cmdFunc:254,cmdId:21,fields:[{field:773,wire:2},{field:997,wire:2}]}]});
  assert.deepEqual(report.shapes[0].fields,[{field:773,wire:2},{field:997,wire:2}]);
  assert.equal(report.valuesIncluded,false);assert.equal(report.contributesToEnergy,false);
  assert.doesNotMatch(JSON.stringify(report),/1300|800|todayActive|importWh|reportedTotal/);preview.clear();
});

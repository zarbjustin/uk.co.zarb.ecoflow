'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dualCtEncodingPolicy } = require('../.homeybuild/lib/dualCtEncoding');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { decodeFrameHeaders } = require('../.homeybuild/lib/streamAc5000Protocol');
const { compact, candidateExport, renderPreview } = require('../settings/dual-ct-status');
const sn = 'DUALCTSYNTHETIC01';
function vi(value) { let n = BigInt(value); const out = []; do { out.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n); return Buffer.from(out); }
function integer(f,n) { return Buffer.concat([vi(f*8),vi(n)]); }
function msg(f,bytes) { return Buffer.concat([vi(f*8+2),vi(bytes.length),bytes]); }
function float(f,n) { const bytes = Buffer.alloc(4); bytes.writeFloatLE(n); return Buffer.concat([vi(f*8+5),bytes]); }
const signature = () => Buffer.concat([float(515,-120),float(962,0),float(956,230),float(998,-10)]);
function packet(marker, data = signature(), extra = Buffer.alloc(0), cmdId = 21, identity = sn) {
  return msg(1,Buffer.concat([msg(1,data),integer(8,254),integer(9,cmdId),msg(25,Buffer.from(identity)),
    ...(marker === undefined ? [] : [integer(6,marker)]),extra]));
}
function harness(enabled = true, code = 421) {
  let now = 1000; let handler;
  const capture = new DualCtResearch({ previewEnabled: enabled, now: () => now,
    list: async () => [{ sn, shared: false, productName: 'Smart Meter Dual CT', modelCodes: [{ field: 'productType',code }] }],
    subscribe: async (_,fn) => { handler = fn; return true; }, unsubscribe: () => {}, timer: () => 1, cancel: () => {} });
  return { capture, emit: (bytes,topic = `/app/device/property/${sn}`) => handler(bytes,topic), now: n => { now = n; } };
}

test('scoped encoding policy distinguishes explicit and omitted markers, never normalises the shared parser', () => {
  for (const [marker,basis] of [[0,'explicit_zero'],[undefined,'omitted_zero_candidate']]) {
    const header = decodeFrameHeaders(packet(marker))[0];
    assert.equal(header.encType,marker);
    assert.equal(dualCtEncodingPolicy(header,421,'app_mqtt').basis,basis);
    assert.equal(dualCtEncodingPolicy(header,420,'app_mqtt').basis,null);
    assert.equal(dualCtEncodingPolicy(header,421,'developer_mqtt').basis,null);
    assert.equal(dualCtEncodingPolicy({...header,cmdId:22},421,'app_mqtt').basis,null);
  }
  for (const marker of [1,2,255]) assert.equal(dualCtEncodingPolicy(decodeFrameHeaders(packet(marker))[0],421,'app_mqtt').reason,'unsupported_encoding');
  assert.equal(dualCtEncodingPolicy(null,421,'app_mqtt').reason,'invalid_header');
});

test('68 structurally valid omitted-marker samples can yield candidates without certifying plaintext or units', async () => {
  const h = harness(); await h.capture.start();
  for (let i=0;i<68;i++) h.emit(packet(undefined));
  const snapshot = h.capture.snapshot(); const preview = h.capture.previewSnapshot();
  assert.equal(snapshot.frames,68); assert.equal(snapshot.rejectedFrames,0);
  assert.equal(snapshot.routes[0].receiptConfirmed,true);
  assert.equal(snapshot.previewDiagnostics.encodingCounts.missing,68);
  assert.equal(snapshot.previewDiagnostics.encodingCounts.explicit_plain,0);
  assert.equal(snapshot.previewDiagnostics.omittedMarkerAttempts,68);
  assert.equal(snapshot.previewDiagnostics.omittedMarkerAccepted,68);
  assert.equal(snapshot.previewDiagnostics.encodingVerified,false);
  assert.equal(preview.reason,'ready');
  assert.ok(preview.devices[0].readings.every(row=>row.encodingBasis==='omitted_zero_candidate'));
  assert.equal(preview.devices[0].readings.find(row=>row.field===998).candidateUnit,null);
  for (const report of [snapshot,dualCtResearchSnapshot(snapshot),compact(snapshot,'1.10.44')]) {
    assert.equal(report.valuesIncluded,false); assert.equal(report.contributesToEnergy,false); assert.equal(report.controlsEnabled,false);
    assert.doesNotMatch(JSON.stringify(report), /-120|candidateUnit|SYNTHETIC|"value"/);
  }
});

test('marker trial never crosses opt-in, owned model, live topic or command boundaries', async () => {
  for (const [enabled,code] of [[false,421],[true,420]]) {
    const h=harness(enabled,code); await h.capture.start(); h.emit(packet(undefined));
    assert.deepEqual(h.capture.previewSnapshot().devices,[]);
    assert.equal(h.capture.snapshot().previewDiagnostics.omittedMarkerAttempts,0);
  }
  const h=harness(); await h.capture.start();
  h.emit(packet(undefined),`/app/device/property/${sn}/get_reply`);
  h.emit(packet(undefined),'/app/device/property/OTHEROWNEDDEVICE');
  h.emit(packet(undefined,signature(),Buffer.alloc(0),22));
  h.emit(packet(undefined,signature(),Buffer.alloc(0),21,'OTHEROWNEDDEVICE'));
  assert.deepEqual(h.capture.previewSnapshot().devices,[]);
  assert.equal(h.capture.snapshot().previewDiagnostics.omittedMarkerAttempts,0);
});

test('omitted-marker signature rejects lone floats, wrong wires, corrupt values and duplicates', async () => {
  for (const payload of [float(515,1),Buffer.concat([float(985,230),float(991,-1)]),
    Buffer.concat([signature(),float(962,5)]),Buffer.concat([signature(),integer(956,230)]),
    Buffer.concat([signature(),float(988,NaN)]),Buffer.concat([signature(),float(998,Infinity)]),
    Buffer.concat([signature(),Buffer.from([0xff])])]) {
    const h=harness(); await h.capture.start(); h.emit(packet(undefined,payload));
    assert.deepEqual(h.capture.previewSnapshot().devices,[]);
    assert.equal(h.capture.snapshot().previewDiagnostics.omittedMarkerAccepted,0);
  }
});

test('ambiguous headers and declared-length mismatches block both candidate paths including uint64 overflow wrapping to zero', async () => {
  for (const marker of [undefined,0]) {
    const data=signature();
    for (const extra of [integer(8,254),msg(6,Buffer.from([0])),integer(10,data.length+1),
      Buffer.concat([integer(10,data.length),integer(10,data.length)]),integer(6,1n<<64n)]) {
      const h=harness(); await h.capture.start(); h.emit(packet(marker,data,extra));
      assert.deepEqual(h.capture.previewSnapshot().devices,[]);
      assert.equal(h.capture.snapshot().previewDiagnostics.attemptedPayloads,0);
    }
    const h=harness(); await h.capture.start(); h.emit(packet(marker,data,integer(10,data.length)));
    assert.equal(h.capture.previewSnapshot().reason,'ready');
  }
});

test('provenance and unitless candidates retain per-field age across explicit/omitted packets, Stop and account changes', async () => {
  const h=harness(); await h.capture.start(); h.emit(packet(undefined));
  h.now(80000); h.emit(packet(0,float(515,0)));
  let preview=h.capture.previewSnapshot();
  assert.equal(preview.devices[0].readings.find(row=>row.field===515).encodingBasis,'explicit_zero');
  assert.equal(preview.devices[0].readings.find(row=>row.field===998).encodingBasis,'omitted_zero_candidate');
  h.now(92000); preview=h.capture.previewSnapshot();
  assert.equal(preview.devices[0].readings.length,1);
  assert.equal(preview.devices[0].readings[0].value,0);
  h.capture.stop('complete'); assert.equal(h.capture.previewSnapshot().devices[0].readings.length,1);
  h.capture.stop(); assert.deepEqual(h.capture.previewSnapshot().devices,[]);
  assert.equal(h.capture.snapshot().previewDiagnostics.omittedMarkerAccepted,1);
  h.capture.stop('account_changed',true);
  assert.equal(h.capture.snapshot().previewDiagnostics.omittedMarkerAccepted,0);
});

test('expanded candidate export preserves unknown units, provenance, privacy and honest size coverage after re-export', () => {
  const fields=[515,962,963,772,956,957,771,958,959,784,985,986,987,988,989,990,991,992,993,998];
  const unit = f=>[515,962,963,772].includes(f)?'W':[956,957,771].includes(f)?'V':[958,959,784].includes(f)?'A':null;
  const input={enabled:true,interpretation:'legacy_meter_overlap_unverified',unitsVerified:false,directionVerified:false,
    devices:[0,1].map(deviceIndex=>({deviceIndex,sn:'PRIVATE',readings:fields.map(field=>({field,candidateUnit:unit(field),
      value:-999999.123456789,receivedAgeSec:0.123456789,encodingBasis:'omitted_zero_candidate',candidate:'PRIVATE'}))}))};
  const before=JSON.stringify(input); const report=candidateExport(input);
  assert.equal(report.schemaVersion,2); assert.equal(report.readingsAvailable,40);
  assert.equal(report.readingsIncluded,report.devices.reduce((n,d)=>n+d.readings.length,0));
  assert.ok(JSON.stringify(report,null,2).length<=7500); assert.equal(report.readingsOmitted,true);
  assert.equal(report.encodingVerified,false); assert.equal(report.additionalBankMappingVerified,false);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|gridPower|solarPower|aggregatePower/);
  const again=candidateExport(report);
  assert.equal(again.readingsAvailable,40); assert.equal(again.readingsOmitted,true);
  assert.equal(JSON.stringify(input),before);
  const element={textContent:''}; assert.ok(renderPreview(element,input,key=>key)>0);
  assert.match(element.textContent,/985: .*preview_unknown_unit/);
  assert.match(element.textContent,/preview_basis_omitted_zero_candidate/);
  const invalid={...input,devices:[{deviceIndex:0,readings:[{...input.devices[0].readings[0],encodingBasis:'PRIVATE'}]}]};
  assert.equal(candidateExport(invalid),null);
});

test('metadata trimming and retained structure coverage never claim numeric or second-bank validation', () => {
  const input={status:'listening',previewDiagnostics:{enabled:true,reason:'ready',omittedMarkerAttempts:68,omittedMarkerAccepted:68},
    inventory:[{source:'app',available:true,inspected:200,candidates:Array.from({length:8},()=>({metadataPresent:true,
      codes:[{field:'productType',code:421},{field:'productId',code:65535},{field:'modelId',code:65535}]}))}],
    shapes:[{deviceIndex:0,cmdFunc:254,cmdId:21,fields:Array.from({length:32},(_,i)=>({field:i+1,wire:5}))}]};
  const report=compact(input,'1.10.44');
  assert.equal(report.schemaVersion,6); assert.equal(report.structureCoverage.scope,'retained_capture_structure');
  assert.equal(report.metadataOmitted,true); assert.equal(report.previewDiagnostics.encodingVerified,false);
  assert.ok(JSON.stringify(report,null,2).length<=7500);
});

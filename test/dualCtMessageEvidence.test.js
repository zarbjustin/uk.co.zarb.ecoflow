'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { DualCtMessageEvidence, messageEvidenceSnapshot } = require('../.homeybuild/lib/dualCtMessageEvidence');
const { DualCtMonitor } = require('../.homeybuild/lib/dualCtMonitor');
const { DualCtLiveDelivery } = require('../.homeybuild/lib/dualCtLiveDelivery');
const { varint, scalar } = require('./helpers/dualCtSynthetic');
const nest = (id, b) => Buffer.concat([varint(id*8+2),varint(b.length),b]);
const int = (id,v) => Buffer.concat([varint(id*8),varint(v)]);
const frame = (id,enc=0) => nest(1,Buffer.concat([nest(1,Buffer.concat([scalar(962,12345),scalar(963,-90),scalar(772,45),scalar(515,12300)])),int(6,enc),int(8,254),int(9,id),int(14,1)]));
test('21 and 39 metadata is visible without widening acceptance or exporting payloads',()=>{
 const evidence=new DualCtMessageEvidence();const scope={account:'PRIVATE',device:'SYNTHETIC',session:'one'};
 const monitor=new DualCtMonitor(scope,undefined,evidence);const topic='/app/device/property/SYNTHETIC';
 assert.equal(monitor.observe(frame(21),topic,1000),true);
 assert.equal(monitor.observe(frame(39),topic,2000),false);
 const rows=evidence.snapshot(3000).groups;
 assert.deepEqual(rows.map(r=>[r.cmdId,r.outcome]),[[21,'packet_accepted'],[39,'unrelated_message']]);
 assert.deepEqual(rows[1].ct1FieldsPresent,[515,962,963,772]);
 assert.equal(new DualCtLiveDelivery().inspect(frame(39),topic,topic,{receivedAt:2000,receivedMonoMs:2000,retained:false,duplicate:false},2000).accepted,false);
 const text=JSON.stringify(evidence.snapshot(3000));assert.doesNotMatch(text,/12345|12300|PRIVATE|SYNTHETIC|payload|deviceSn/);
});
test('metadata handles replies JSON invalid oversized and encrypted envelopes without copying contents',()=>{
 const e=new DualCtMessageEvidence();
 e.record(Buffer.from('{"secret":"PRIVATE"}'),'get_reply','topic_get_reply',1000);
 e.record(frame(39,1),'property','unsupported_encoding',2000);
 e.record(Buffer.from([255]),'property','malformed_frame',3000);
 e.record(Buffer.alloc(65537),'property','payload_oversized',4000);
 const r=e.snapshot(4000);assert.equal(r.outgoingRequestsObserved,false);
 assert.deepEqual(r.groups.map(x=>x.format),['json','binary','invalid','oversized']);
 assert.deepEqual(r.groups[1].ct1FieldsPresent,[]);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|secret/);
});
test('groups coalesce with timing, bound memory, expire and clear on clock reversal',()=>{
 const e=new DualCtMessageEvidence();e.record(frame(21),'property','packet_accepted',1000);
 e.record(frame(21),'property','packet_accepted',3000);
 let r=e.snapshot(4000).groups[0];assert.equal(r.count,2);assert.equal(r.minGapMs,2000);assert.equal(r.maxGapMs,2000);
 assert.equal(r.firstAgeSec,3);assert.equal(r.lastAgeSec,1);
 for(let i=0;i<40;i++)e.record(frame(i%2?39:21),'property','packet_accepted',5000+i*1000);
 assert.equal(e.snapshot(45000).groups.length,32);assert.ok(e.snapshot(45000).evictedGroups>0);
 assert.equal(e.snapshot(950000).groups.length,0);
 e.record(frame(21),'property','packet_accepted',1000);assert.equal(e.snapshot(1000).groups.length,1);
 assert.equal(e.snapshot(999).groups.length,0);
});
test('export reconstructs an allowlist and rejects injected identifiers and malformed metadata',()=>{
 const e=new DualCtMessageEvidence();e.record(frame(21),'property','packet_accepted',1000);
 const row=e.snapshot(1000).groups[0];
 const r=messageEvidenceSnapshot({secret:'PRIVATE',groups:[{...row,secret:'PRIVATE',ct1FieldsPresent:[962,'PRIVATE',999]}, {...row,outcome:'PRIVATE'}]});
 assert.equal(r.groups.length,1);assert.deepEqual(r.groups[0].ct1FieldsPresent,[962]);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|999|secret/);
});

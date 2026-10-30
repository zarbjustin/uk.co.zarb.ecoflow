'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DualCtEnergyDetails}=require('../.homeybuild/lib/dualCtEnergyDetails');
const {dualCtDisplayVisible:visible,dualCtDisplayOptions:options,DUAL_CT_ENERGY_DETAIL_CAPABILITIES:ids}=require('../.homeybuild/lib/dualCtDisplaySettings');
const {scalar,varint}=require('./helpers/dualCtSynthetic');
const monitorManifest=require('../drivers/smartmeter_dual_ct_preview/driver.compose.json');
const energyManifest=require('../drivers/smartmeter_dual_ct_energy/driver.compose.json');
const scope={account:'synthetic',device:'SYNTHETICDUALCT01',session:'one'};const topic=`/app/device/property/${scope.device}`;
const frame=rows=>{const nested=(f,b)=>Buffer.concat([varint(f*8+2),varint(b.length),b]);return nested(1,Buffer.concat([
  nested(1,Buffer.concat(rows.map(([f,v])=>scalar(f,v)))),varint(6*8),varint(0),varint(8*8),varint(254),varint(9*8),varint(21)]));};
const rows=[[962,600],[963,0],[772,0],[515,600],[956,240],[957,241],[771,242],[958,2.5],[959,0],[784,0],
  [991,100],[992,200],[993,-50],[998,250],[985,239],[986,238],[987,237],[988,1],[989,2],[990,3]];
function harness(){let now=1000;const values=new Map([['meter_power.imported',12.345],['meter_power.exported',0.123],['measure_power',600]]),opts=new Map(),writes=[];
 const port={hasCapability:id=>values.has(id),addCapability:async id=>{writes.push(['add',id]);values.set(id,null);},
  getCapabilityValue:id=>values.get(id),getCapabilityOptions:id=>opts.get(id),
  setCapabilityOptions:async(id,o)=>{assert.ok(ids.includes(id));opts.set(id,o);writes.push(['options',id]);},
  setCapabilityValue:async(id,v)=>{assert.ok(ids.includes(id),'detail writer must never touch Energy powers/counters');values.set(id,v);writes.push(['value',id,v]);}};
 const detail=new DualCtEnergyDetails(port,()=>now);const deliver=(b=frame(rows),meta={})=>detail.observe(b,topic,{receivedAt:now,retained:false,duplicate:false,...meta},now);
 return{detail,port,values,opts,writes,deliver,at:n=>now=n};}
test('default legacy monitor layout remains visible; Energy defaults follow paired mode with CT2 off',()=>{
 for(const id of monitorManifest.capabilities)assert.equal(visible(id,{},false),true,id);
 assert.equal(visible('dual_ct_preview_voltage.a_p1',{},true),true);
 assert.equal(visible('dual_ct_preview_power.a_p1',{},true),false,'single-phase total is already the standard Energy power');
 assert.equal(visible('dual_ct_preview_voltage.a_p2',{},true),false);
 assert.equal(visible('dual_ct_preview_current.a_p3',{},true,true),true);
 assert.equal(visible('dual_ct_preview_net.b',{},true,true),false);
 assert.deepEqual(energyManifest.capabilities,['measure_power','meter_power.imported','meter_power.exported',...ids]);
});
test('CT1 and CT2 phase layouts are independent and diagnostics respect CT2 off',()=>{
 const layout={display_ct1:'three_phase',display_ct2:'single_phase',display_diagnostics:'hide'};
 assert.equal(visible('dual_ct_preview_power.a_p3',layout,false),true);
 assert.equal(visible('dual_ct_preview_voltage.b_p1',layout,false),true);
 assert.equal(visible('dual_ct_preview_voltage.b_p2',layout,false),false);
 assert.equal(visible('dual_ct_preview_counters',layout,false),false);
 assert.equal(visible('dual_ct_preview_net.b',{...layout,display_ct2:'off'},false),false);
 assert.equal(visible('dual_ct_preview_fields.b_power',{display_ct2:'off',display_diagnostics:'show'},false),false);
 assert.equal(visible('dual_ct_preview_counters',{display_diagnostics:'show'},false),true);
 const custom={title:'My existing title',decimals:4,preventTag:true,preventInsights:true};
 assert.deepEqual(options({title:'Default',preventTag:true,preventInsights:true},custom,false),{...custom,uiComponent:null});
});
test('show/hide is reversible without deleting capabilities, rewriting counters, titles or cached values',async()=>{
 const h=harness();await h.detail.configure({},false);h.opts.set('dual_ct_preview_voltage.a_p1',{...h.opts.get('dual_ct_preview_voltage.a_p1'),title:'Retain my title'});
 h.detail.start(scope);h.deliver();await h.detail.render();
 assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),240);assert.equal(h.values.get('dual_ct_preview_net.b'),250);
 const before=new Map(h.values);h.writes.length=0;
 await h.detail.configure({display_ct1:'three_phase',display_ct2:'off'},false);
 assert.deepEqual(h.values,before);assert.equal(h.opts.get('dual_ct_preview_voltage.a_p1').title,'Retain my title');
 assert.equal(h.opts.get('dual_ct_preview_net.b').uiComponent,null);
 assert.equal(h.opts.get('dual_ct_preview_voltage.a_p3').uiComponent,'sensor');
 assert.equal(h.writes.some(w=>w[0]==='add'||w[0]==='value'),false);
 await h.detail.configure({display_ct1:'single_phase',display_ct2:'three_phase'},false);
 assert.equal(h.opts.get('dual_ct_preview_voltage.a_p3').uiComponent,null);
 assert.equal(h.opts.get('dual_ct_preview_net.b').uiComponent,'sensor');
 await h.detail.stop();assert.equal(h.values.get('meter_power.imported'),12.345);assert.equal(h.values.get('meter_power.exported'),0.123);
});
test('CT2-only packets and delayed delivery never refresh unrelated CT1 details; gaps/missing values stay unknown',async()=>{
 const h=harness();await h.detail.configure({},false);h.detail.start(scope);h.deliver();await h.detail.render();
 h.at(90000);h.deliver(frame([[991,200],[992,100],[993,0],[998,300]]));await h.detail.render();
 h.at(91000);await h.detail.render();assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),null);
 assert.equal(h.values.get('dual_ct_preview_net.b'),300);
 h.at(92000);h.deliver(frame([[956,230]]),{receivedAt:90500});await h.detail.render();
 assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),230);
 assert.equal(h.values.get('dual_ct_preview_voltage.a_p2'),null,'a delayed receipt must not clear or renew unrelated fields');
 h.at(180500);await h.detail.render();assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),null,'expiry uses receipt, not processing time');
 h.detail.start(scope);h.at(200000);h.deliver(frame([[956,225]]));await h.detail.render();
 assert.equal(h.values.get('dual_ct_preview_voltage.a_p2'),null);assert.equal(h.values.get('dual_ct_preview_net.b'),null);
});
test('retained/duplicate/future or stale deliveries cannot repopulate displayed values after stop',async()=>{
 const h=harness();await h.detail.configure({},false);h.detail.start(scope);
 for(const meta of [{retained:true},{duplicate:true},{receivedAt:1001},{receivedAt:-1}]){h.deliver(frame(rows),meta);await h.detail.render();assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),null);}
 h.deliver();await h.detail.render();await h.detail.stop();h.deliver();await h.detail.render();
 assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),null);assert.equal(h.values.get('meter_power.imported'),12.345);
});
test('an SDK option/write failure cannot write Energy counters and shutdown cancels queued detail work',async()=>{
 const h=harness();await h.detail.configure({},false);h.detail.start(scope);let release;
 h.port.setCapabilityValue=async(id,v)=>{assert.ok(ids.includes(id));if(v!==null)await new Promise(r=>{release=r;});h.values.set(id,v);};
 h.deliver();await new Promise(setImmediate);const stop=h.detail.stop();release();await stop;
 assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'),null);assert.equal(h.values.get('meter_power.imported'),12.345);
 const failing=harness();failing.port.addCapability=async()=>{throw Error('synthetic add failure');};
 await assert.rejects(failing.detail.configure({},false));assert.equal(failing.values.get('meter_power.imported'),12.345);
});

test('optional detail shutdown failures cannot prevent core recovery and write targets remain frozen',async()=>{
 const h=harness();h.port.hasCapability=()=>{throw Error('synthetic SDK metadata failure');};
 await assert.doesNotReject(h.detail.stop());assert.equal(h.values.get('meter_power.imported'),12.345);
 assert.equal(Object.isFrozen(ids),true);
});

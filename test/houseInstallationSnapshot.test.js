'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const{houseInstallationSnapshot}=require('../.homeybuild/lib/houseInstallationSnapshot');
const now=Date.now(),mainSn='ES21SYNTHETIC0001',secondSn='ES21SYNTHETIC0002';
function fixture(){
 const config=percent=>({values:Object.fromEntries(Object.entries({backupReserveEnabled:true,backupReservePct:percent,mode:'self_powered',tasks:[]}).map(([k,value])=>[k,{value,stale:false,ageSec:0}]))});
 const field=value=>({value,stale:false,ageSec:0});
 const gate={controlScope:'house-only',deviceId:'main',serial:mainSn,houseMemberDeviceIds:['main','second'],houseMemberSerials:{main:mainSn,second:secondSn}};
 const units=[['main',mainSn],['second',secondSn]].map(([id,sn])=>({getId:()=>id,getData:()=>({sn}),getAvailable:()=>true,getConfigurationDiagnostics:()=>config(18),getReadingDiagnostics:()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:0}}),getCapabilityValue:()=>25}));
 units[0].getTopologyEvidence=()=>({addressSn:mainSn,source:'es21_peer_records',peers:[{sn:secondSn,seenAt:now}],maxReportedRecordCount:2,truncated:false});
 units[0].getSystemReporterDiagnostics=()=>({socPct:field(25),batteryW:field(-1200)});units[0].getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:field(-1200),gridToBatteryW:field(0)}});
 return{gate,units,config,field};
}
test('explicit two-unit house uses system SOC and power once, independently of physical tile power',()=>{
 const f=fixture(),r=houseInstallationSnapshot(f.gate,f.units,now);assert.equal(r.socPercent,25);assert.equal(r.batteryW,-1200);assert.equal(r.gridChargeW,0);assert.deepEqual(r.memberDeviceIds,['main','second']);assert.equal(r.reservePercent,18);
});
test('house installation rejects unreviewed, missing, stale and duplicated members plus divergent native settings',()=>{
 for(const change of [f=>f.units.pop(),f=>f.gate.houseMemberDeviceIds=['main','main'],f=>f.units[1].getAvailable=()=>false,f=>f.units[1].getData=()=>({sn:'ES21OTHER0003'}),f=>f.units[1].getConfigurationDiagnostics=()=>f.config(19),f=>f.units[0].getTopologyEvidence=()=>({addressSn:mainSn,peers:[{sn:secondSn,seenAt:now-91000}],maxReportedRecordCount:2}),f=>f.units[0].getSystemReporterDiagnostics=()=>({socPct:f.field(25),batteryW:{value:0,ageSec:31,stale:false}})]){const f=fixture();change(f);assert.throws(()=>houseInstallationSnapshot(f.gate,f.units,now));}
});

test('depleted house recovers from stale aggregate SOC only with fresh exact zero from every member with independent fresh power through charge startup',()=>{
 const f=fixture();f.units.forEach(d=>d.getCapabilityValue=()=>0);
 f.units[0].getSystemReporterDiagnostics=()=>({socPct:{value:1,ageSec:600,stale:true},batteryW:f.field(0)});
 f.units[0].getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:f.field(0),gridToBatteryW:f.field(0)}});
 const r=houseInstallationSnapshot(f.gate,f.units,now);assert.equal(r.socPercent,0);assert.equal(r.socSource,'minimum-enrolled-member-soc-lower-bound');assert.equal(r.socAgeSec,0);
 f.units[0].getSystemReporterDiagnostics=()=>({socPct:{value:1,ageSec:600,stale:true},batteryW:f.field(4900)});f.units[0].getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:f.field(4900),gridToBatteryW:f.field(4900)}});
 const charging=houseInstallationSnapshot(f.gate,f.units,now);assert.equal(charging.socPercent,0);assert.equal(charging.gridChargeW,4900); // Integer SOC remains zero briefly during a valid start.
 for(const change of [g=>g.units[1].getCapabilityValue=()=>null,g=>g.units[1].getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:11}}),g=>g.units[1].getAvailable=()=>false,g=>g.units[0].getSystemReporterDiagnostics=()=>({batteryW:{value:0,ageSec:31,stale:true}}),g=>g.units[0].getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:g.field(0)}})]){
   const g=fixture();g.units.forEach(d=>d.getCapabilityValue=()=>0);g.units[0].getSystemReporterDiagnostics=()=>({socPct:{value:1,ageSec:600,stale:true},batteryW:g.field(0)});g.units[0].getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:g.field(0),gridToBatteryW:g.field(0)}});change(g);assert.throws(()=>houseInstallationSnapshot(g.gate,g.units,now));
 }
});

test('sparse aggregate SOC uses a fresh conservative member lower bound without averaging or refreshing the aggregate timestamp',()=>{
 const f=fixture();f.units[0].getCapabilityValue=()=>40;f.units[1].getCapabilityValue=()=>30;
 f.units[0].getSystemReporterDiagnostics=()=>({socPct:{value:35,ageSec:80,stale:false},batteryW:f.field(4900)});f.units[0].getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:f.field(4900),gridToBatteryW:f.field(4900)}});
 const r=houseInstallationSnapshot(f.gate,f.units,now);assert.equal(r.socPercent,30);assert.equal(r.socSource,'minimum-enrolled-member-soc-lower-bound');assert.equal(r.systemSocAgeSec,80);assert.equal(r.socAgeSec,0);assert.equal(r.batteryW,4900);
 f.units[1].getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:11}});assert.throws(()=>houseInstallationSnapshot(f.gate,f.units,now));
});

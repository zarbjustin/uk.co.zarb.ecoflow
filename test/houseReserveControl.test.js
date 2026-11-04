'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const Module = require('node:module');
const { houseReserveFrame, freshReserveSnapshot, assertHouseNoDischarge } = require('../.homeybuild/lib/houseReserveControl');
const original = Module._load; let App;
try { Module._load = function load(request, ...args) { if (request === 'homey') return { App: class {} }; return original.call(this, request, ...args); }; App = require('../.homeybuild/app'); } finally { Module._load = original; }
const snapshot = (enabled = true, percent = 18) => ({ values: { maxGridInputW: { value: 7200, ageSec: 0, stale: false }, backupReserveEnabled: { value: enabled, ageSec: 0, stale: false }, backupReservePct: { value: percent, ageSec: 0, stale: false }, mode: { value: 'self_powered', ageSec: 0, stale: false }, tasks: { value: [], ageSec: 0, stale: false } } });
function harness() {
 const app = new App(); let value = snapshot(); const gate = { enabled: true, expiresAt: Date.now() + 60000, deviceId: 'synthetic-house', serial: 'ES21SYNTHETIC0001', minPercent: 3, maxPercent: 100 }; let publishes = 0;
 app.homey = { settings: { get: () => gate }, drivers: { getDriver: () => ({ getDevices: () => [{ getId: () => gate.deviceId, getData: () => ({ sn: gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => value }] }) }, setTimeout: (fn, ms) => { if (ms <= 1000) queueMicrotask(fn); return 1; }, clearTimeout: () => {} };
 app.appMqtt = { connected: true, publishHouseReserve: async () => { publishes++; value = snapshot(true, 17); } };
 return { app, gate, setValue: v => { value = v; }, publishes: () => publishes };
}
test('reserve frame matches captured reserve grammar and refuses foreign models/targets', () => {
 assert.ok(houseReserveFrame('ES21SYNTHETIC0001', true, 55, 1).includes(Buffer.from('081ef2010408011037', 'hex')));
 assert.throws(() => houseReserveFrame('ES22SYNTHETIC0001', true, 18, 1)); assert.throws(() => houseReserveFrame('ES21SYNTHETIC0001', true, 101, 1));
});
test('reserve write requires scoped enable, unchanged owner state and telemetry confirmation', async () => {
 const h = harness(); const r = await h.app.requestHouseReserve({ deviceId: h.gate.deviceId, enabled: true, percent: 17, expectedEnabled: true, expectedPercent: 18 });
 assert.equal(r.verified, true); assert.equal(h.publishes(), 1);
 const x = harness(); x.gate.enabled = false; await assert.rejects(x.app.requestHouseReserve({}), /disabled/); assert.equal(x.publishes(), 0);
 const y = harness(); await assert.rejects(y.app.requestHouseReserve({ deviceId: y.gate.deviceId, enabled: true, percent: 17, expectedEnabled: false, expectedPercent: 18 }), /manual ownership/); assert.equal(y.publishes(), 0);
});
test('unknown/stale reserve and active native tasks refuse control', () => {
 const s = snapshot(); s.values.tasks.value = [{ enabled: true }]; assert.throws(() => freshReserveSnapshot(s));
 const t = snapshot(); t.values.backupReservePct.stale = true; assert.throws(() => freshReserveSnapshot(t));
});
test('publish success without the expected readback is not control success or a retry', async () => {
 const h = harness(); let sent = 0; h.app.appMqtt.publishHouseReserve = async () => { sent++; };
 await assert.rejects(h.app.requestHouseReserve({ deviceId: h.gate.deviceId, enabled: true, percent: 17, expectedEnabled: true, expectedPercent: 18 }), /unverified/); assert.equal(sent, 1);
});
test('expired coordinated lease stops office before restoring house and records completion', async () => {
 const h = harness(); let value = snapshot(true, 19); const events = [];
 const store = { houseReserveLease: { until: Date.now() - 1, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 100, houseDeviceId: h.gate.deviceId, serial: h.gate.serial, restoreEnabled: true, restorePercent: 18, expectedEnabled: true, expectedPercent: 19 } };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } };
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => kind === 'stream'
   ? [{ getId: () => 'office', getAvailable: () => true, getCapabilityValue: () => 100, flowRefresh: async () => {}, getReportingDiagnostics: () => ({ observations: { measure_power: { value: -1, receivedAt: Date.now(), source: 'rest' } } }), flowSetBackupReserve: async n => { assert.equal(n, 3); events.push('office-stop'); } }]
   : [{ getId: () => h.gate.deviceId, getData: () => ({ sn: h.gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => value }] });
 h.app.appMqtt.publishHouseReserve = async () => { events.push('house-restore'); value = snapshot(true, 18); };
 await h.app.expireHouseReserveLease(); assert.deepEqual(events, ['office-stop', 'house-restore']); assert.equal(store.houseReserveLease.completed, true);
});
test('expiry cannot overwrite a manually changed office reserve', async () => {
 const h = harness(); const store = { houseReserveLease: { until: Date.now() - 1, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 100 } };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } };
 h.app.homey.drivers.getDriver = () => ({ getDevices: () => [{ getId: () => 'office', getAvailable: () => true, getCapabilityValue: () => 55 }] });
 await assert.rejects(h.app.expireHouseReserveLease(), /manual ownership/); assert.match(store.houseReserveLease.fault, /manual ownership/); assert.equal(h.publishes(), 0);
});
test('a percent-only change needs a new percent receipt, not a new unchanged enable receipt', async () => {
 const h = harness(); h.app.appMqtt.publishHouseReserve = async () => { const v = snapshot(true, 17); v.values.backupReserveEnabled.ageSec = 300; h.setValue(v); };
 const r = await h.app.requestHouseReserve({ deviceId: h.gate.deviceId, enabled: true, percent: 17, expectedEnabled: true, expectedPercent: 18 }); assert.equal(r.verified, true);
});
test('house hold requires its own fresh nonnegative battery power and a reserve at SOC', () => {
 let power = 0; let age = 1; let soc = 18;
 const d = { getAvailable: () => true, getConfigurationDiagnostics: () => snapshot(), getReadingDiagnostics: () => Object.fromEntries(['measure_battery', 'stream_unit_power_battery_flow'].map(k => [k, { ageSec: age, stale: false, applicationStatus: 'applied' }])), getCapabilityValue: k => k === 'measure_battery' ? soc : power };
 assert.doesNotThrow(() => assertHouseNoDischarge(d, 500));
 for (const p of [-1, null, NaN, 501]) { power = p; assert.throws(() => assertHouseNoDischarge(d, 500)); }
 power = 0; age = 31; assert.throws(() => assertHouseNoDischarge(d)); age = 1; soc = 19; assert.throws(() => assertHouseNoDischarge(d));
});
test('loss of house hold stops owned office before the unexpired lease ends', async () => {
 const h = harness(); const events = []; let value = snapshot(true, 19);
 const store = { houseReserveControl: { enabled: true, mode: 'routine', siteChargeKw: 2.8, houseNativeChargeKw: 2.5, officeNativeChargeKw: 2.3 }, houseReserveLease: { until: Date.now() + 60000, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 100, houseDeviceId: h.gate.deviceId, serial: h.gate.serial, restoreEnabled: true, restorePercent: 18, expectedEnabled: true, expectedPercent: 19 } };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } };
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => kind === 'stream'
   ? [{ getId: () => 'office', getAvailable: () => true, getCapabilityValue: () => 100, flowRefresh: async () => {}, getReportingDiagnostics: () => ({ observations: { measure_power: { value: -1, receivedAt: Date.now(), source: 'rest' } } }), flowSetBackupReserve: async () => { events.push('office-stop'); } }]
   : [{ getId: () => h.gate.deviceId, getData: () => ({ sn: h.gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => value, getReadingDiagnostics: () => ({}) }] });
 h.app.appMqtt.publishHouseReserve = async () => { events.push('house-restore'); value = snapshot(true, 18); };
 await h.app.expireHouseReserveLease(); assert.deepEqual(events, ['office-stop', 'house-restore']);
});
function coordinatedHarness() {
 const h = harness(); let reserve = 3; let power = 0; let houseValue = snapshot(); const events = [];
 const store = { houseReserveControl: { ...h.gate, officeAcquisitionPolicy: 'restore-reserve-only', mode: 'routine', expiresAt: null, officeDeviceId: 'office', restoreEnabled: true, restorePercent: 18, officeRestoreReserve: 3, siteChargeKw: 2.8, houseNativeChargeKw: 2.5, officeNativeChargeKw: 2.3 } };
 const office = { getId: () => 'office', getAvailable: () => true, getCapabilityValue: key => key === 'operating_mode' ? 'self_powered' : key === 'alarm_generic' ? false : reserve, flowRefresh: async () => {}, getReportingDiagnostics: () => ({ observations: { measure_power: { value: -1, receivedAt: Date.now(), source: 'rest' } } }), flowSetBackupReserve: async n => { events.push('office:' + n); reserve = n; } };
 const house = { getId: () => h.gate.deviceId, getData: () => ({ sn: h.gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => houseValue, getReadingDiagnostics: () => Object.fromEntries(['measure_battery', 'stream_unit_power_battery_flow'].map(k => [k, { ageSec: 0, stale: false, applicationStatus: 'applied' }])), getCapabilityValue: k => k === 'measure_battery' ? 18 : power };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } }; h.app.homey.setInterval = () => 1;
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => [kind === 'stream' ? office : house] });
 h.app.appMqtt.publishHouseReserve = async () => { events.push('house:20'); houseValue = snapshot(true, 20); };
 return { ...h, store, events, office, setPower: n => { power = n; }, setOffice: n => { reserve = n; } };
}
test('coordinated endpoint starts office only at verified house hold with a native lease', async () => {
 const h = coordinatedHarness();
 const body = { acquireOfficeLease: true, housePercent: 18, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 };
 const r = await h.app.requestCoordinatedReserve(body); assert.equal(r.verified, true); assert.deepEqual(h.events, ['office:22']); assert.equal(h.store.houseReserveLease.officeExpectedReserve, 22);
});
test('coordinated start refuses insufficient headroom before sending an office command', async () => {
 const h = coordinatedHarness(); h.setPower(2500);
 await assert.rejects(h.app.requestCoordinatedReserve({ acquireOfficeLease: true, housePercent: 18, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 }), /hold unverified/);
 assert.deepEqual(h.events, []); assert.ok(h.store.houseReserveLease.until < Date.now());
});
test('coordinated change releases office before changing house reserve', async () => {
 const h = coordinatedHarness(); h.setOffice(22); h.store.houseReserveLease = { until: Date.now()+60000, officeDeviceId:'office', officeRestoreReserve:3, officeExpectedReserve:22 };
 await h.app.requestCoordinatedReserve({ housePercent: 20, expectedHousePercent: 18, officePercent: 3, expectedOfficePercent: 22, leaseUntil: Date.now() + 60000 });
 assert.deepEqual(h.events, ['office:3', 'house:20']);
});
test('office stop waits for fresh noncharging native power before house restoration', async () => {
 const h = coordinatedHarness(); let watts = 2611; let refreshes = 0;
 h.office.flowRefresh = async () => { refreshes++; watts = refreshes >= 3 ? -20 : 2611; };
 h.office.getReportingDiagnostics = () => ({ observations: { measure_power: { value: watts, receivedAt: Date.now(), source: 'rest' } } });
 await h.app.verifyOfficeChargeStopped(h.office); assert.equal(refreshes, 3); assert.ok(watts <= 0);
});
test('old zero power cannot prove an office stop, and actual combined watts enforce allowance', async () => {
 const h = coordinatedHarness(); h.office.getReportingDiagnostics = () => ({ observations: { measure_power: { value: 0, receivedAt: Date.now() - 60000, source: 'rest' } } });
 await assert.rejects(h.app.verifyOfficeChargeStopped(h.office), /stop unverified/);
 h.office.getReportingDiagnostics = () => ({ observations: { measure_power: { value: 3000, receivedAt: Date.now(), source: 'rest' } } });
 const house = h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
 assert.throws(() => h.app.assertCoordinatedPower(house, h.office, h.store.houseReserveControl), /exceeds allowance/);
});
test('a house reserve change cannot precede a fresh physical office stop', async () => {
 const h = coordinatedHarness(); h.setOffice(22); h.store.houseReserveLease = { until: Date.now()+60000, officeDeviceId:'office', officeRestoreReserve:3, officeExpectedReserve:22 }; let watts = 2611; let refreshes = 0;
 h.office.flowRefresh = async () => { refreshes++; if (refreshes >= 3) watts = -10; };
 h.office.getReportingDiagnostics = () => ({ observations: { measure_power: { value: watts, receivedAt: Date.now(), source: 'rest' } } });
 const publish = h.app.appMqtt.publishHouseReserve;
 h.app.appMqtt.publishHouseReserve = async (...args) => { assert.ok(watts <= 0); assert.equal(refreshes, 3); return publish(...args); };
 await h.app.requestCoordinatedReserve({ housePercent: 20, expectedHousePercent: 18, officePercent: 3, expectedOfficePercent: 22, leaseUntil: Date.now() + 60000 });
 assert.deepEqual(h.events, ['office:3', 'house:20']);
});
test('office driver receipt timestamps are distinct from projected support ages', async () => {
 const h = coordinatedHarness();
 h.office.getReportingDiagnostics = () => ({ observations: { measure_power: { value: 0, ageSec: 0 } } });
 await assert.rejects(h.app.verifyOfficeChargeStopped(h.office), /stop unverified/);
 h.office.getReportingDiagnostics = () => ({ observations: { measure_power: { value: -10, receivedAt: Date.now(), source: 'rest' } } });
 await assert.doesNotReject(h.app.verifyOfficeChargeStopped(h.office));
});
test('a zero power reading before a pending house charge cannot start office without full headroom', () => {
 const h = coordinatedHarness(); const house = h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
 house.getConfigurationDiagnostics = () => snapshot(true, 20);
 assert.throws(() => h.app.assertCoordinatedPower(house, h.office, h.store.houseReserveControl), /charging pending/);
});
test('house reserve must be established in an earlier phase before office start', async () => {
 const h = coordinatedHarness();
 await assert.rejects(h.app.requestCoordinatedReserve({ acquireOfficeLease:true, housePercent: 20, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 }), /Establish house reserve/);
 assert.deepEqual(h.events, []);
});
test('office manual mode and native alarm retain their charging safety guard', async () => {
 for (const fault of [false, true]) {
  const h = coordinatedHarness();const old = h.office.getCapabilityValue;
  h.office.getCapabilityValue = key => key === 'operating_mode' ? (fault ? 'self_powered' : 'custom') : key === 'alarm_generic' ? fault : old(key);
  await assert.rejects(h.app.requestCoordinatedReserve({ acquireOfficeLease:true, housePercent: 18, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 }), /mode\/fault/);
  assert.deepEqual(h.events, []);
 }
});

test('read refresh coalesces, needs a new applied house packet, and makes no settings writes', async () => {
 const h = harness(); const gate = { ...h.gate, officeDeviceId: 'office' }; let appliedAt = Date.now() - 1000; let sent = 0; let delay; let update = true;
 const house = { getId: () => gate.deviceId, getData: () => ({ sn: gate.serial }), getAppliedReadingAt: () => appliedAt, getCapabilityValue: () => 20, getReadingDiagnostics: () => Object.fromEntries(['measure_battery', 'stream_unit_power_battery_flow'].map(k => [k, { ageSec: 0, stale: false, applicationStatus: 'applied' }])) };
 const office = { getId: () => 'office', flowRefresh: async () => {}, getReportingDiagnostics: () => ({ observations: Object.fromEntries(['measure_battery', 'measure_power'].map(k => [k, { value: 20, receivedAt: Date.now() }])) }) };
 h.app.homey.settings = { get: () => gate, set: () => assert.fail('Read must not write settings') };
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => [kind === 'stream' ? office : house] });
 h.app.appMqtt.requestHouseRead = async () => { sent++; await new Promise(resolve => { delay = resolve; }); if (update) appliedAt = Date.now(); };
 const first = h.app.refreshCoordinatedReadings(); const second = h.app.refreshCoordinatedReadings(); await new Promise(resolve => setImmediate(resolve)); delay();
 const [a, b] = await Promise.all([first, second]); assert.deepEqual(a, b); assert.equal(sent, 1); assert.equal(a.houseFresh, true); assert.equal(a.officeFresh, true); assert.equal(a.settingsWrites, 0);
 update = false; const third = h.app.refreshCoordinatedReadings(); await new Promise(resolve => setImmediate(resolve)); delay(); assert.equal((await third).houseFresh, false); assert.equal(h.publishes(), 0);
});

// Regression for 31 October: frequent power receipts hid an ageing config until
// watchdog restoration latched the planner for the entire charging day.
test('watchdog refreshes ageing configuration despite fresh house and office power', async () => {
 const h = coordinatedHarness(); h.setOffice(13);
 const house = h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
 let value = snapshot(); for (const f of Object.values(value.values)) f.ageSec = 601;
 house.getConfigurationDiagnostics = () => value;
 h.store.houseReserveLease = { until: Date.now() + 60000, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 13, houseDeviceId: h.gate.deviceId, serial: h.gate.serial, restoreEnabled: true, restorePercent: 18, expectedEnabled: true, expectedPercent: 18 };
 let reads = 0; h.app.refreshCoordinatedReadings = async () => { reads++; value = snapshot(); return { houseFresh: true, officeFresh: true }; };
 await h.app.expireHouseReserveLease(); assert.equal(reads, 1); assert.deepEqual(h.events, []); assert.equal(h.store.houseReserveLease.fault, undefined); assert.equal(h.store.houseReserveLease.completed, undefined);
});
test('unrecoverable configuration still stops office first and preserves the fault', async () => {
 const h = coordinatedHarness(); h.setOffice(13);
 const house = h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
 const value = snapshot(); value.values.tasks.ageSec = 1201; value.values.tasks.stale = true; house.getConfigurationDiagnostics = () => value;
 h.store.houseReserveLease = { until: Date.now() + 60000, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 13, houseDeviceId: h.gate.deviceId, serial: h.gate.serial, restoreEnabled: true, restorePercent: 18, expectedEnabled: true, expectedPercent: 18 };
 h.app.refreshCoordinatedReadings = async () => ({ houseFresh: true, officeFresh: true });
 await assert.rejects(h.app.expireHouseReserveLease(), /configuration stale/); assert.deepEqual(h.events, ['office:3']); assert.match(h.store.houseReserveLease.fault, /stale/); assert.equal(h.publishes(), 0);
});
test('expiry rereads stale house configuration after office stop without adopting manual changes', async () => {
 const h = coordinatedHarness(); const house = h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
 let value = snapshot(); value.values.tasks.stale = true; house.getConfigurationDiagnostics = () => value;
 h.store.houseReserveLease = { until: Date.now() - 1, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 3, houseDeviceId: h.gate.deviceId, serial: h.gate.serial, restoreEnabled: true, restorePercent: 0, expectedEnabled: true, expectedPercent: 18 };
 h.app.refreshCoordinatedReadings = async () => { value = snapshot(true, 55); };
 await assert.rejects(h.app.expireHouseReserveLease(), /manual ownership/); assert.equal(h.publishes(), 0);
});

test('minimum-SOC maintenance needs three independent fresh bounded samples; stale/excess/non-floor remains blocked', async () => {
 const run = async change => {const h=coordinatedHarness();let tick=0;const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;h.app.homey.setTimeout=fn=>{queueMicrotask(fn);return 1;};h.office.getCapabilityValue=k=>({backup_reserve_soc:3,operating_mode:'self_powered',alarm_generic:false}[k]);h.office.flowRefresh=async()=>{tick++;clock+=4000;};h.office.getReportingDiagnostics=()=>{const t=Date.now();const observations=Object.fromEntries(Object.entries({measure_battery:3,measure_power:30,'measure_power.grid':107,'measure_power.load':77}).map(([k,value])=>[k,{value,receivedAt:t-100+tick,source:'rest'}]));if(change)change(observations,h);return{observations};};return {h,done:h.app.verifyOfficeChargeStopped(h.office).finally(()=>{Date.now=originalNow;}),ticks:()=>tick};};
 const ok=await run();await ok.done;assert.equal(ok.ticks(),3);
 for(const change of [o=>o.measure_power.value=51,o=>o.measure_battery.value=4.1,o=>o.measure_battery.value=2.9,o=>o['measure_power.grid'].value=150,o=>o.measure_power.receivedAt=1]){const r=await run(change);await assert.rejects(r.done,/stop unverified/);}
});

test('slow physical office stop preserves house hold, blocks new starts and faults after bounded waiting',async()=>{
 const h=coordinatedHarness();h.setOffice(4);h.office.getReportingDiagnostics=()=>({observations:{measure_power:{value:2000,receivedAt:Date.now(),source:'rest'}}});
 h.store.houseReserveLease={until:Date.now()-1,officeDeviceId:'office',officeRestoreReserve:3,officeExpectedReserve:4,houseDeviceId:h.gate.deviceId,serial:h.gate.serial,restoreEnabled:true,restorePercent:18,expectedEnabled:true,expectedPercent:18};
 await h.app.expireHouseReserveLease();assert.ok(h.store.houseReserveLease.stoppingSince);assert.equal(h.store.houseReserveLease.fault,undefined);assert.deepEqual(h.events,['office:3']);
 const pending=await h.app.requestCoordinatedReserve({});assert.equal(pending.stopping,true);assert.equal(pending.verified,false);assert.deepEqual(h.events,['office:3']);
 h.store.houseReserveLease.stoppingSince=Date.now()-600001;await assert.rejects(h.app.expireHouseReserveLease(),/stop unverified/);assert.match(h.store.houseReserveLease.fault,/stop unverified/);
});

test('watchdog/control busy response guarantees no new command was attempted',async()=>{
 const h=coordinatedHarness();h.app.houseReserveBusy=true;const r=await h.app.requestCoordinatedReserve({});assert.equal(r.busy,true);assert.equal(r.verified,false);assert.deepEqual(h.events,[]);
});

test('explicit office member evidence permits idle system losses above floor but rejects missing/stale/charging members',()=>{
 const h=coordinatedHarness();h.store.houseReserveControl.officeMemberDeviceIds=['u1','u2'];const units=['u1','u2'].map(id=>({getId:()=>id,getAvailable:()=>true,getCapabilityValue:()=>-2,getReadingDiagnostics:()=>({stream_unit_power_battery_flow:{stale:false,applicationStatus:'applied',ageSec:1}})}));const get=h.app.homey.drivers.getDriver;h.app.homey.drivers.getDriver=k=>k==='stream_unit'?{getDevices:()=>units}:get(k);
 assert.equal(h.app.officeMembersNotCharging(),true);assert.equal(h.app.officeMembersNotCharging(Date.now()-500),false);assert.equal(h.app.officeMembersNotCharging(Date.now()-3000),true);units[1].getCapabilityValue=()=>20;assert.equal(h.app.officeMembersNotCharging(),false);units[1].getCapabilityValue=()=>-2;units[1].getReadingDiagnostics=()=>({stream_unit_power_battery_flow:{stale:false,applicationStatus:'applied',ageSec:91}});assert.equal(h.app.officeMembersNotCharging(),false);h.store.houseReserveControl.officeMemberDeviceIds.push('foreign');assert.equal(h.app.officeMembersNotCharging(),false);
});
test('idle AC-branch loss at high office SOC needs scoped noncharging member evidence',async()=>{
 const h=coordinatedHarness(),originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
 try{h.store.houseReserveControl.officeMemberDeviceIds=['u1','u2'];const units=['u1','u2'].map(id=>({getId:()=>id,getAvailable:()=>true,getCapabilityValue:()=>-2,getReadingDiagnostics:()=>({stream_unit_power_battery_flow:{stale:false,applicationStatus:'applied',ageSec:1}})}));const get=h.app.homey.drivers.getDriver;h.app.homey.drivers.getDriver=k=>k==='stream_unit'?{getDevices:()=>units}:get(k);
 h.office.getCapabilityValue=k=>({backup_reserve_soc:3,operating_mode:'self_powered',alarm_generic:false}[k]);h.office.flowRefresh=async()=>{clock+=4000;};h.office.getReportingDiagnostics=()=>({observations:Object.fromEntries(Object.entries({measure_battery:60,measure_power:100,'measure_power.grid':175,'measure_power.load':75}).map(([k,value])=>[k,{value,receivedAt:clock,source:'rest'}]))});
 await h.app.verifyOfficeChargeStopped(h.office);assert.deepEqual(h.events,[]);units[1].getCapabilityValue=()=>100;await assert.rejects(h.app.verifyOfficeChargeStopped(h.office),/stop unverified/);assert.deepEqual(h.events,[]);
 }finally{Date.now=originalNow;}
});

test('house-only target changes, renewal and watchdog restoration never query or command office', async () => {
 const h=coordinatedHarness();h.store.houseReserveControl.controlScope='house-only';
 h.office.flowRefresh=async()=>assert.fail('Office read is out of scope');
 h.app.verifyOfficeChargeStopped=async()=>assert.fail('Office stop is out of scope');
 const request=(target,expected)=>h.app.requestCoordinatedReserve({houseOnly:true,housePercent:target,expectedHousePercent:expected,officePercent:3,expectedOfficePercent:3,leaseUntil:Date.now()+60000});
 await request(20,18);assert.equal(h.store.houseReserveLease.controlScope,'house-only');
 await request(20,20);assert.deepEqual(h.events,['house:20']);
 const d=h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
 h.app.appMqtt.publishHouseReserve=async()=>{h.events.push('house:48');d.getConfigurationDiagnostics=()=>snapshot(true,48);};
 await request(48,20);assert.equal(h.store.houseReserveLease.expectedPercent,48);
 h.app.appMqtt.publishHouseReserve=async()=>{h.events.push('house-restore');const d=h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];d.getConfigurationDiagnostics=()=>snapshot(true,18);};
 h.store.houseReserveLease.until=Date.now()-1;
 await h.app.expireHouseReserveLease();assert.equal(h.store.houseReserveLease.completed,true);assert.deepEqual(h.events,['house:20','house:48','house-restore']);
});
test('house-only cannot start office, override manual house reserve or adopt active coordinated ownership', async () => {
 for(const kind of ['office','manual','active']){
  const h=coordinatedHarness();h.store.houseReserveControl.controlScope='house-only';
  if(kind==='active')h.store.houseReserveLease={completed:false,officeExpectedReserve:22};
  await assert.rejects(h.app.requestCoordinatedReserve({houseOnly:true,housePercent:20,expectedHousePercent:kind==='manual'?17:18,officePercent:kind==='office'?22:3,expectedOfficePercent:3,leaseUntil:Date.now()+60000}),/prohibited|manual|quiescence/);
  assert.deepEqual(h.events,[]);
 }
 const h=coordinatedHarness();await assert.rejects(h.app.requestCoordinatedReserve({houseOnly:true,housePercent:20,expectedHousePercent:18,officePercent:3,expectedOfficePercent:3,leaseUntil:Date.now()+60000}),/scope mismatch/);
});

test('house-only refresh requires a fresh house packet without reading unavailable office or claiming it fresh',async()=>{
 const h=harness(),gate={...h.gate,controlScope:'house-only'};let at=Date.now()-1000;
 const house={getId:()=>gate.deviceId,getData:()=>({sn:gate.serial}),getAppliedReadingAt:()=>at,getCapabilityValue:()=>20,getReadingDiagnostics:()=>Object.fromEntries(['measure_battery','stream_unit_power_battery_flow'].map(k=>[k,{ageSec:0,stale:false,applicationStatus:'applied'}]))};
 h.app.homey.settings={get:()=>gate,set:()=>assert.fail('Read wrote settings')};
 h.app.homey.drivers.getDriver=kind=>({getDevices:()=>kind==='stream'?[]:[house]});h.app.appMqtt.requestHouseRead=async()=>{at=Date.now();};
 const r=await h.app.refreshCoordinatedReadings();assert.equal(r.houseFresh,true);assert.equal(r.officeFresh,false);assert.equal(r.officeRequired,false);assert.equal(r.settingsWrites,0);
});

function twoMemberHarness(){
 const h=coordinatedHarness(),main=h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0],gate=h.store.houseReserveControl;
 gate.controlScope='house-only';gate.houseMemberDeviceIds=[gate.deviceId,'second'];gate.houseMemberSerials={[gate.deviceId]:gate.serial,second:'ES21SYNTHETIC0002'};
 let first=18,second=18,watts=0,grid=0;const field=value=>({value,stale:false,ageSec:0});const topologyReceivedAt=Date.now();
 main.getConfigurationDiagnostics=()=>snapshot(true,first);
 main.getTopologyEvidence=()=>({addressSn:gate.serial,peers:[{sn:gate.houseMemberSerials.second,seenAt:topologyReceivedAt}],maxReportedRecordCount:2});
 main.getSystemReporterDiagnostics=()=>({socPct:field(25),batteryW:field(watts)});main.getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:field(watts),gridToBatteryW:field(grid),gridFlowNetW:field(grid)}});
 const unit={getId:()=> 'second',getData:()=>({sn:gate.houseMemberSerials.second}),getAvailable:()=>true,getConfigurationDiagnostics:()=>snapshot(true,second),getReadingDiagnostics:()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:0}}),getCapabilityValue:()=>25};
 h.app.homey.drivers.getDriver=kind=>({getDevices:()=>kind==='stream'?[h.office]:[main,unit]});
 h.app.appMqtt.publishHouseReserve=async(sn,frame)=>{const marker=Buffer.from('f20104080110','hex'),at=frame.indexOf(marker);assert.ok(at>=0);const target=frame[at+marker.length];h.events.push((sn===gate.serial?'house:':'second:')+target);if(sn===gate.serial)first=target;else if(sn===gate.houseMemberSerials.second)second=target;else assert.fail('Foreign member');watts=0;grid=0;};
 h.app.verifyOfficeChargeStopped=async()=>assert.fail('Office is out of scope');
 return{...h,main,unit,setSecond:v=>{second=v;},setPower:(v,g=v)=>{watts=v;grid=g;}};
}
const twoBody=()=>({houseOnly:true,houseMemberDeviceIds:['synthetic-house','second'],housePercent:20,expectedHousePercent:18,officePercent:3,expectedOfficePercent:3,leaseUntil:Date.now()+60000});

function dualInstallationHarness(){
 const h=twoMemberHarness(),g=h.store.houseReserveControl;
 h.app.homey.clearTimeout=()=>{};
 g.controlScope='coordinated-installations';g.siteChargeKw=7.2;g.houseNativeChargeKw=1.5;g.officeNativeChargeKw=3.65;
 g.houseSiteChargeKw=7.2;g.houseSpaceGridLimitW=7200;g.officeSpaceGridLimitW=7200;g.wholePropertyGridLimitW=7200;g.wholePropertyMeterDeviceId='synthetic-ct1';g.wholePropertyMeterScopeReviewed=true;
 const bound=maxKw=>({maxKw,commissionedAt:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),evidenceId:'synthetic-review'});
 g.powerBudget={schemaVersion:1,wholePropertyImportLimitKw:7.2,spaceImportLimitKw:{house:7.2,office:7.2},marginKw:0.3,maxObservationAgeSec:5,
  nativeChargeBounds:{house:bound(1.5),office:bound(3.65)}};
 g.officeMemberDeviceIds=Array.from({length:6},(_,i)=>'office-unit-'+i);
 g.officeMemberSerials=Object.fromEntries(g.officeMemberDeviceIds.map((id,i)=>[id,'SYNTHETIC-OFFICE-'+i]));
 const main=g.officeMemberSerials[g.officeMemberDeviceIds[0]];
 g.officeMainSerial=main;
 g.houseMemberPowerScopeReviewed=true;
 const members=g.officeMemberDeviceIds.map(id=>({getId:()=>id,getAvailable:()=>true,getData:()=>({sn:g.officeMemberSerials[id]}),getCapabilityValue:()=>3,getReadingDiagnostics:()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:0},stream_unit_power_battery_flow:{stale:false,applicationStatus:'applied',ageSec:0}}),getCoordinationMainSn:async()=>main}));
 h.main.getCapabilityValue=()=>18;h.unit.getCapabilityValue=()=>18;
 h.unit.getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:0},
   stream_unit_power_battery_flow:{stale:false,applicationStatus:'applied',ageSec:0}});
 let upstream=1000,officeWatts=0;
 h.office.getCoordinationMainSn=async()=>main;
 h.office.getReportingDiagnostics=()=>({aggregateRecovery:{state:'verified_original_main'},observations:{measure_power:{value:officeWatts,receivedAt:Date.now()},'measure_power.grid':{value:500,receivedAt:Date.now()},measure_battery:{value:3,receivedAt:Date.now()}}});
 const prior=h.app.homey.drivers.getDriver;
 h.app.homey.drivers.getDriver=k=>k==='stream_unit'?{getDevices:()=>members}:k==='smartmeter_dual_ct_energy'?{getDevices:()=>[{getId:()=>g.wholePropertyMeterDeviceId,getAvailable:()=>true,getCoordinatedGridReading:()=>({signedImportW:upstream,observedAt:Date.now()})}]}:prior(k);
 h.app.verifyOfficeChargeStopped=async()=>{h.events.push('office-stopped');};
 return {...h,members,setUpstream:n=>{upstream=n;},setOfficeWatts:n=>{officeWatts=n;}};
}
const dualBody=()=>({acquireOfficeLease:true,houseMemberDeviceIds:['synthetic-house','second'],housePercent:18,expectedHousePercent:18,officePercent:22,expectedOfficePercent:3,leaseUntil:Date.now()+60000});

const managedBudget=()=>({schemaVersion:2,mode:'ecoflow-managed',maxObservationAgeSec:30,dispatchBufferSeconds:120,stopBufferSeconds:150});
function managedHarness(){
 const h=dualInstallationHarness(),g=h.store.houseReserveControl;
 g.powerBudget=managedBudget();g.houseMemberPowerScopeReviewed=false;
 g.mode='pilot';g.expiresAt=Date.now()+3600000;
 // No application electrical/accounting approval; native limits stay untouched.
 delete g.houseNativeChargeKw;delete g.officeNativeChargeKw;delete g.siteChargeKw;
 delete g.wholePropertyMeterDeviceId;g.wholePropertyMeterScopeReviewed=false;
 const flow=h.main.getSystemFlowDiagnostics;
 h.main.getSystemFlowDiagnostics=()=>({fields:{...flow().fields,gridFlowNetW:{stale:true,ageSec:900,value:99999}}});
 return h;
}
const managedBody=()=>({...dualBody(),powerBudget:managedBudget(),tariffDeadline:Date.now()+180000});

test('EcoFlow-managed pilot publishes matched Office support without CT, AC bounds or member power accounting',async t=>{
 const h=managedHarness();proofClock(t,h);h.setUpstream(99999);h.setPower(8000,8000);
 const reading=await h.app.refreshCoordinatedReadings();
 assert.equal(reading.houseFresh,true);assert.equal(reading.powerBudgetSupported,true);
 assert.deepEqual(reading.powerBudgetReceipt,managedBudget());
 assert.equal(reading.office.controlContract,'ecoflow-managed-v1');assert.equal(reading.office.qualified,true);
 assert.equal(reading.nativeControlDeadline,h.store.houseReserveControl.expiresAt);
 assert.equal(reading.house.gridImportW,null);assert.equal(reading.house.noDischargeHoldVerified,true);
 assert.deepEqual(h.events,[]);assert.equal(h.store.houseReserveLease,undefined);
 const r=await h.app.requestCoordinatedReserve(managedBody());
 assert.equal(r.verified,true);assert.deepEqual(h.events,['office:22']);
 assert.equal(h.store.houseReserveControl.mode,'pilot');
 // High import/charging estimates are not a watchdog loss of authority.
 await h.app.expireHouseReserveLease();assert.deepEqual(h.events,['office:22']);
});
test('EcoFlow-managed House dispatch retains read-only Office proof and has no AC evidence expiry',async t=>{
 const h=managedHarness();proofClock(t,h);h.office.flowSetBackupReserve=async()=>assert.fail('Office write');
 await h.app.refreshCoordinatedReadings();
 const result=await h.app.requestCoordinatedReserve({...managedBody(),houseOnly:true,officePercent:3,housePercent:20});
 assert.equal(result.verified,true);assert.equal(result.controlScope,'house-only');
 assert.deepEqual(h.events,['house:20','second:20']);
});
test('EcoFlow-managed mode, tariff and pilot agreement fail closed before publishing',async t=>{
 for(const change of ['missing contract','mismatched contract','unknown schema','old bound fields','missing tariff','tariff expired','pilot expired','lease past pilot','disabled']){
  await t.test(change,async st=>{
   const h=managedHarness();proofClock(st,h);const body=managedBody(),g=h.store.houseReserveControl;
   if(change==='missing contract')delete body.powerBudget;
   if(change==='mismatched contract')body.powerBudget.maxObservationAgeSec=5;
   if(change==='unknown schema')g.powerBudget.schemaVersion=999;
   if(change==='old bound fields')g.powerBudget.nativeChargeBounds={house:{validUntil:'2000-01-01T00:00:00Z'}};
   if(change==='missing tariff')delete body.tariffDeadline;
   if(change==='tariff expired')body.tariffDeadline=Date.now()-1;
   if(change==='pilot expired')g.expiresAt=Date.now()-1;
   if(change==='lease past pilot')g.expiresAt=Date.now()+30000;
   if(change==='disabled')g.enabled=false;
   await assert.rejects(h.app.requestCoordinatedReserve(body));assert.deepEqual(h.events,[]);
  });
 }
});
test('EcoFlow-managed Office still requires native membership, recovery, SOC, mode, hold and manual ownership',async t=>{
 const changes={
  member:h=>{h.members.pop();},
  main:h=>{h.store.houseReserveControl.officeMainSerial='WRONG-SYNTHETIC';},
  recovery:h=>{const read=h.office.getReportingDiagnostics;h.office.getReportingDiagnostics=()=>({...read(),aggregateRecovery:{state:'identity_changed'}});},
  soc:h=>{h.members[5].getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:301}});},
  houseSoc:h=>{h.unit.getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:301}});},
  manual:h=>h.setOffice(55),
  mode:h=>{const read=h.office.getCapabilityValue;h.office.getCapabilityValue=k=>k==='operating_mode'?'custom':read(k);},
  houseDischarge:h=>h.setPower(-1,0),
  houseNativeChargingDisabled:h=>{h.store.houseReserveControl.houseGridChargingEnabled=false;h.unit.getCapabilityValue=()=>17;},
 };
 for(const [name,change]of Object.entries(changes))await t.test(name,async st=>{
  const h=managedHarness();proofClock(st,h);change(h);
  await assert.rejects(h.app.requestCoordinatedReserve(managedBody()));assert.deepEqual(h.events,[]);
 });
});
test('EcoFlow-managed unowned House lowering still rejects unknown physical Office stop',async t=>{
 const h=managedHarness();proofClock(t,h);
 h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
 h.setOfficeWatts(500); // Neither nonpositive flow nor fresh grid/load stop proof.
 h.app.officeMembersNotCharging=()=>false;
 const r=await h.app.requestCoordinatedReserve({...managedBody(),houseOnly:true,housePercent:15,officePercent:3});
 assert.equal(r.releaseBlocked,true);assert.equal(r.interventionRequired,true);
 assert.deepEqual(h.events,[]);
});
test('EcoFlow-managed pilot expiry invokes watchdog restoration without renewing pilot authority',async t=>{
 const h=managedHarness(),clock=proofClock(t,h);
 await h.app.requestCoordinatedReserve(managedBody());
 const expiry=h.store.houseReserveControl.expiresAt;
 clock.advance(3600001);
 const g=h.store.houseReserveControl;
 h.main.getTopologyEvidence=()=>({addressSn:g.serial,peers:[{sn:g.houseMemberSerials.second,seenAt:Date.now()}],maxReportedRecordCount:2});
 await h.app.expireHouseReserveLease();
 assert.equal(h.store.houseReserveControl.expiresAt,expiry);
 assert.ok(h.events.includes('office:3'));assert.equal(h.store.houseReserveLease.completed,true);
});
test('EcoFlow-managed routine accepts explicit ongoing authority with bounded individual leases and exact stop acknowledgement',async t=>{
 const h=managedHarness(),clock=proofClock(t,h),gate=h.store.houseReserveControl;
 gate.mode='routine';gate.expiresAt=null;
 h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;h.setOfficeWatts(0);
 const initial=await h.app.refreshCoordinatedReadings();
 assert.equal(initial.nativeControlDeadline,null);assert.equal(initial.office.ownedStopAcknowledged,false);
 await h.app.requestCoordinatedReserve(managedBody());
 const stopped=await h.app.requestCoordinatedReserve({...managedBody(),acquireOfficeLease:false,officePercent:3,expectedOfficePercent:22,
  releaseOfficeOnly:true,releaseOfficeReason:'staged-stop'});
 assert.equal(stopped.officeStopped,true);assert.equal(stopped.houseRestorationPending,true);
 assert.equal((await h.app.refreshCoordinatedReadings()).office.ownedStopAcknowledged,true);
 h.setOffice(4);
 assert.equal((await h.app.refreshCoordinatedReadings()).office.ownedStopAcknowledged,false);
 h.setOffice(3);clock.advance(60001);
 assert.equal((await h.app.refreshCoordinatedReadings()).office.ownedStopAcknowledged,false);
 assert.equal(gate.expiresAt,null);
});
test('EcoFlow-managed routine performs bounded grouped House 100, Office 100 and ordered 3/0 release',async t=>{
 const h=managedHarness();proofClock(t,h);const gate=h.store.houseReserveControl;
 gate.mode='routine';gate.expiresAt=null;gate.minPercent=0;gate.restorePercent=0;
 h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;h.setOfficeWatts(0);
 const body=()=>({...managedBody(),leaseUntil:Date.now()+120000});
 await h.app.refreshCoordinatedReadings();
 const house=await h.app.requestCoordinatedReserve({...body(),housePercent:100,officePercent:3,acquireOfficeLease:false});
 assert.equal(house.verified,true);
 h.setPower(8000,8000);
 assert.equal((await h.app.refreshCoordinatedReadings()).house.houseChargingVerified,true);
 const office=await h.app.requestCoordinatedReserve({...body(),housePercent:100,expectedHousePercent:100,officePercent:100});
 assert.equal(office.verified,true);
 assert.ok(h.store.houseReserveLease.until<=Date.now()+120000);
 await h.app.requestCoordinatedReserve({...body(),acquireOfficeLease:false,housePercent:100,expectedHousePercent:100,
  officePercent:3,expectedOfficePercent:100,releaseOfficeOnly:true,releaseOfficeReason:'staged-stop'});
 const released=await h.app.requestCoordinatedReserve({...body(),acquireOfficeLease:false,housePercent:0,expectedHousePercent:100,officePercent:3});
 assert.equal(released.verified,true);
 assert.deepEqual(h.events,['house:100','second:100','office:100','office:3','house:0','second:0']);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function proofClock(t,h){
 let now=Date.now(),sequence=0;const timers=new Map();
 t.mock.method(Date,'now',()=>now);
 h.app.homey.setTimeout=(fn,ms)=>{
  const id=++sequence;
  if(ms<=1000){now+=1000;queueMicrotask(fn);}else timers.set(id,{fn,at:now+ms});
  return id;
 };
 h.app.homey.clearTimeout=id=>timers.delete(id);
 h.main.getAppliedReadingAt=()=>now;
 h.app.appMqtt.requestHouseRead=async()=>{};
 return{advance:ms=>{now+=ms;},expire:()=>{
  const next=[...timers.values()].sort((a,b)=>a.at-b.at)[0];assert.ok(next,'bounded deadline scheduled');
  now=Math.max(now,next.at);next.fn();
 }};
}
function expiredHouseOnlyLease(h){
 const g=h.store.houseReserveControl;
 h.store.houseReserveLease={until:Date.now()-1,controlScope:'house-only',guardScope:g.controlScope,guardBinding:JSON.stringify(g),
  houseDeviceId:g.deviceId,serial:g.serial,houseMemberDeviceIds:[...g.houseMemberDeviceIds],houseMemberSerials:{...g.houseMemberSerials},
  officeDeviceId:g.officeDeviceId,officeRestoreReserve:3,officeExpectedReserve:3,
  expectedEnabled:true,expectedPercent:18,restoreEnabled:true,restorePercent:15};
 return h.store.houseReserveLease;
}
const houseLowerBody=()=>({...twoBody(),housePercent:15,expectedHousePercent:18});

test('shared Office proof rejects invalid fleets for signed reads, House admission and unowned release',async t=>{
 const mutations={
  'missing binding':h=>{delete h.store.houseReserveControl.officeMemberDeviceIds;},
  'duplicate ID':h=>{h.store.houseReserveControl.officeMemberDeviceIds[5]='office-unit-0';},
  'duplicate serial':h=>{h.store.houseReserveControl.officeMemberSerials['office-unit-5']='SYNTHETIC-OFFICE-0';},
  'wrong serial':h=>{h.members[5].getData=()=>({sn:'WRONG-SYNTHETIC'});},
  'missing member':h=>{h.members.pop();},
  'duplicate enrolled member':h=>{h.members.push(h.members[0]);},
  'wrong configured main':h=>{h.store.houseReserveControl.officeMainSerial='SYNTHETIC-OFFICE-1';},
  'different resolved main':h=>{h.members[5].getCoordinationMainSn=async()=>'OTHER-SYNTHETIC';},
  'stale SOC':h=>{h.members[5].getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:301}});},
  'duplicate aggregate':h=>{const prior=h.app.homey.drivers.getDriver;h.app.homey.drivers.getDriver=k=>k==='stream'?{getDevices:()=>[h.office,h.office]}:prior(k);},
 };
 for(const [name,mutate] of Object.entries(mutations))await t.test(name,async st=>{
  const h=dualInstallationHarness();proofClock(st,h);mutate(h);h.setOfficeWatts(-2000);
  h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
  const reading=await h.app.refreshCoordinatedReadings();
  assert.equal(reading.houseFresh,true);assert.equal(reading.officeDischarge,null);
  assert.equal(h.app.officeCoordinationProof,null);
  await assert.rejects(h.app.requestCoordinatedReserve({...twoBody(),housePercent:100}),/Office discharge receipt/);
  const denied=await h.app.requestCoordinatedReserve(houseLowerBody());
  assert.equal(denied.verified,false);assert.equal(denied.releaseBlocked,true);assert.equal(denied.interventionRequired,true);
  expiredHouseOnlyLease(h);
  await assert.rejects(h.app.expireHouseReserveLease(),/Unowned office stop unverified/);
  assert.match(h.store.houseReserveLease.fault,/Unowned office stop unverified/);
  assert.deepEqual(h.events,[]);
 });
});
test('Office proof checks aggregate object, configured main, exact expiry and current member identity',async t=>{
 const h=dualInstallationHarness(),clock=proofClock(t,h),g=h.store.houseReserveControl;
 await assert.rejects(h.app.verifyOfficeCoordinationMembership({...h.office},g),/aggregate identity/);
 await h.app.verifyOfficeCoordinationMembership(h.office,g);
 assert.equal(h.app.officeCoordinationMembershipCurrent(h.office,g),true);
 g.officeMainSerial='SYNTHETIC-OFFICE-1';
 assert.equal(h.app.officeCoordinationMembershipCurrent(h.office,g),false);
 assert.throws(()=>h.app.officeDischargeReading(h.office,g),/Office discharge receipt/);
 g.officeMainSerial='SYNTHETIC-OFFICE-0';
 clock.advance(90000);
 assert.equal(h.app.officeCoordinationMembershipCurrent(h.office,g),false);
 await h.app.verifyOfficeCoordinationMembership(h.office,g);
 h.members[5]={...h.members[5]};
 assert.equal(h.app.officeCoordinationMembershipCurrent(h.office,g),false);
 assert.deepEqual(h.events,[]);
});
test('membership rechecks recovery and captured bindings after both lookup stages',async t=>{
 for(const phase of ['aggregate','members'])for(const change of ['recovery','recovered-again','gate','lease','shutdown','member-replaced']){
  await t.test(phase+' '+change,async st=>{
   const h=dualInstallationHarness();proofClock(st,h);const paused=deferred(),entered=deferred(),g=h.store.houseReserveControl;
   const target=phase==='aggregate'?h.office:h.members[5];
   target.getCoordinationMainSn=async()=>{entered.resolve();return paused.promise;};
   const pending=h.app.verifyOfficeCoordinationMembership(h.office,g);
   const rejected=assert.rejects(pending);await entered.promise;
   if(change==='recovery'||change==='recovered-again'){
    const diagnostics=h.office.getReportingDiagnostics;
    h.office.getReportingDiagnostics=()=>({...diagnostics(),aggregateRecovery:change==='recovery'
     ?{state:'identity_changed'}:{state:'verified_original_main',recoveries:1}});
   }
   if(change==='gate')g.officeMainSerial='SYNTHETIC-OFFICE-1';
   if(change==='lease')h.store.houseReserveLease={until:Date.now()+30000,controlScope:'house-only'};
   if(change==='shutdown')h.app.stopping=true;
   if(change==='member-replaced')h.members[5]={...h.members[5]};
   paused.resolve('SYNTHETIC-OFFICE-0');await rejected;
   assert.equal(h.app.officeCoordinationProof,null);assert.deepEqual(h.events,[]);
  });
 }
});
test('late rejected and superseded verification cannot resurrect or clear a newer proof',async t=>{
 const h=dualInstallationHarness(),clock=proofClock(t,h),g=h.store.houseReserveControl;
 const paused=deferred(),entered=deferred(),lookup=h.office.getCoordinationMainSn;
 h.office.getCoordinationMainSn=async()=>{entered.resolve();return paused.promise;};
 const old=h.app.verifyOfficeCoordinationMembership(h.office,g),rejected=assert.rejects(old,/deadline expired/);
 await entered.promise;clock.expire();await rejected;assert.equal(h.app.officeCoordinationProof,null);
 h.office.getCoordinationMainSn=lookup;
 await h.app.verifyOfficeCoordinationMembership(h.office,g);const proof=h.app.officeCoordinationProof;
 paused.reject(new Error('late failed lookup'));await flush();
 assert.equal(h.app.officeCoordinationProof,proof);
 const superseded=deferred();
 h.office.getCoordinationMainSn=()=>superseded.promise;
 const older=h.app.verifyOfficeCoordinationMembership(h.office,g),failed=assert.rejects(older,/superseded/);
 h.office.getCoordinationMainSn=lookup;await h.app.verifyOfficeCoordinationMembership(h.office,g);
 const newer=h.app.officeCoordinationProof;superseded.resolve('SYNTHETIC-OFFICE-0');await failed;
 assert.equal(h.app.officeCoordinationProof,newer);assert.deepEqual(h.events,[]);
});
test('single-flight Office lookup leaves House reads short and null, including after its absolute deadline',async t=>{
 for(const phase of ['refresh','aggregate','members','members-rejected-peer'])await t.test(phase,async st=>{
  const h=dualInstallationHarness(),clock=proofClock(st,h),paused=deferred();let calls=0,refreshes=0;
  h.office.flowRefresh=async()=>{refreshes++;if(phase==='refresh'){calls++;await paused.promise;}};
  const target=phase.startsWith('members')?h.members[5]:h.office;
  if(phase==='members-rejected-peer')h.members[0].getCoordinationMainSn=async()=>{throw new Error('lookup failed');};
  if(phase!=='refresh')target.getCoordinationMainSn=async()=>{calls++;return paused.promise;};
  const began=Date.now();
  for(let i=0;i<3;i++){
   const r=await h.app.refreshCoordinatedReadings();assert.equal(r.houseFresh,true);assert.equal(r.officeDischarge,null);
  }
  assert.ok(Date.now()-began<=12000);assert.equal(calls,1);assert.equal(refreshes,1);
  clock.advance(45001);
  assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge,null);
  assert.equal(calls,1);assert.equal(refreshes,1);
  paused.resolve('SYNTHETIC-OFFICE-0');await flush();
  assert.equal(h.app.officeCoordinationProof,null);assert.equal(h.app.coordinatedOfficeReadInFlight,null);
  assert.deepEqual(h.events,[]);assert.equal(h.store.houseReserveLease,undefined);
 });
});
test('delayed Office qualification survives the next read without renewing or repeating membership proof',async t=>{
 const h=dualInstallationHarness(),clock=proofClock(t,h),g=h.store.houseReserveControl,paused=deferred();
 let aggregateLookups=0,memberLookups=0;
 h.office.getCoordinationMainSn=async()=>{aggregateLookups++;return paused.promise;};
 for(const member of h.members){
  const lookup=member.getCoordinationMainSn;
  member.getCoordinationMainSn=async()=>{memberLookups++;return lookup();};
 }
 const first=await h.app.refreshCoordinatedReadings();
 assert.equal(first.houseFresh,true);assert.equal(first.officeDischarge,null);
 assert.equal(aggregateLookups,1);assert.equal(memberLookups,0);
 const background=h.app.coordinatedOfficeReadInFlight;assert.ok(background);
 clock.advance(3000);paused.resolve('SYNTHETIC-OFFICE-0');await background;
 const proof=h.app.officeCoordinationProof;assert.ok(proof);
 assert.equal(memberLookups,6);
 const second=await h.app.refreshCoordinatedReadings();
 assert.equal(second.houseFresh,true);assert.equal(second.officeDischarge.qualified,true);
 assert.equal(h.app.officeCoordinationProof,proof);
 assert.equal(aggregateLookups,1);assert.equal(memberLookups,6);
 const until=proof.until;
 await h.app.refreshCoordinatedReadings();
 assert.equal(h.app.officeCoordinationProof.until,until);
 assert.equal(aggregateLookups,1);assert.equal(memberLookups,6);
 // Expiry requires a new proof; it cannot borrow the previous successful lookup.
 const renewed=deferred();
 h.office.getCoordinationMainSn=async()=>{aggregateLookups++;return renewed.promise;};
 clock.advance(until-Date.now());
 assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge,null);
 assert.equal(h.app.officeCoordinationProof,null);assert.equal(aggregateLookups,2);
 const renewal=h.app.coordinatedOfficeReadInFlight;
 renewed.resolve('SYNTHETIC-OFFICE-0');await renewal;
 assert.equal(h.app.officeCoordinationMembershipCurrent(h.office,g),true);
 // A different configured main must also reject a still-unexpired cached proof.
 g.officeMainSerial='SYNTHETIC-OFFICE-1';
 assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge,null);
 assert.equal(h.app.officeCoordinationProof,null);
 assert.deepEqual(h.events,[]);assert.equal(h.store.houseReserveLease,undefined);
});
test('failed ordinary refresh invalidates its cached proof without clearing a newer verification',async t=>{
 for(const superseded of [false,true])await t.test(superseded?'newer proof preserved':'failed proof invalidated',async st=>{
  const h=dualInstallationHarness();proofClock(st,h);const g=h.store.houseReserveControl,paused=deferred();
  await h.app.verifyOfficeCoordinationMembership(h.office,g);
  h.office.flowRefresh=()=>paused.promise;
  assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge.qualified,true);
  const background=h.app.coordinatedOfficeReadInFlight;
  if(superseded)await h.app.verifyOfficeCoordinationMembership(h.office,g);
  const proof=h.app.officeCoordinationProof;
  paused.reject(new Error('refresh failed'));await background;
  assert.equal(h.app.officeCoordinationProof,superseded?proof:null);
  assert.deepEqual(h.events,[]);
 });
});
test('read-only proof cannot complete after config, lease or shutdown changes during refresh',async t=>{
 for(const change of ['gate','lease','shutdown'])await t.test(change,async st=>{
  const h=dualInstallationHarness();proofClock(st,h);const paused=deferred();
  h.office.flowRefresh=()=>paused.promise;
  assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge,null);
  if(change==='gate')h.store.houseReserveControl.officeMainSerial='SYNTHETIC-OFFICE-1';
  if(change==='lease')h.store.houseReserveLease={until:Date.now()+30000};
  if(change==='shutdown')h.app.stopping=true;
  paused.resolve();await flush();
  assert.equal(h.app.officeCoordinationProof,null);assert.deepEqual(h.events,[]);
 });
});
test('valid membership cannot replace unknown physical Office stop',async t=>{
 const h=dualInstallationHarness();proofClock(t,h);
 h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
 const diagnostics=h.office.getReportingDiagnostics;
 h.office.getReportingDiagnostics=()=>({...diagnostics(),observations:{}});
 const result=await h.app.requestCoordinatedReserve(houseLowerBody());
 assert.equal(result.releaseBlocked,true);assert.equal(result.interventionRequired,true);
 assert.equal(h.app.officeCoordinationProof,null);assert.deepEqual(h.events,[]);
});
test('unowned release rechecks context and reserve across lookup and physical stop for manual and expiry paths',async t=>{
 for(const expiry of [false,true])for(const phase of ['lookup','stop'])for(const change of ['recovery','gate','lease','reserve','shutdown']){
  await t.test([expiry?'expiry':'manual',phase,change].join(' '),async st=>{
   const h=dualInstallationHarness();proofClock(st,h);
   h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
   const paused=deferred(),entered=deferred();
   if(phase==='lookup')h.members[5].getCoordinationMainSn=async()=>{entered.resolve();return paused.promise;};
   else h.office.flowRefresh=async()=>{entered.resolve();await paused.promise;};
   if(expiry)expiredHouseOnlyLease(h);
   const pending=expiry?h.app.expireHouseReserveLease():h.app.requestCoordinatedReserve(houseLowerBody());
   const result=expiry?assert.rejects(pending,/Unowned office stop unverified/):pending;
   await entered.promise;
   const replacement={until:Date.now()+90000,controlScope:'house-only',owner:'replacement'};
   if(change==='recovery'){
    const diagnostics=h.office.getReportingDiagnostics;
    h.office.getReportingDiagnostics=()=>({...diagnostics(),aggregateRecovery:{state:'identity_changed'}});
   }
   if(change==='gate')h.store.houseReserveControl.officeMainSerial='SYNTHETIC-OFFICE-1';
   if(change==='lease')h.store.houseReserveLease=replacement;
   if(change==='reserve')h.setOffice(100);
   if(change==='shutdown')h.app.stopping=true;
   paused.resolve('SYNTHETIC-OFFICE-0');
   const denied=await result;
   if(!expiry){assert.equal(denied.releaseBlocked,true);assert.equal(denied.interventionRequired,true);}
   if(change==='lease')assert.equal(h.store.houseReserveLease,replacement);
   assert.equal(h.app.officeCoordinationProof,null);assert.deepEqual(h.events,[]);
  });
 }
});
test('unowned stop shares one absolute deadline across membership, physical stop and House restoration',async t=>{
 for(const expiry of [false,true])await t.test(expiry?'expiry restoration deadline':'manual request deadline',async st=>{
  const h=dualInstallationHarness(),clock=proofClock(st,h),entered=deferred(),paused=deferred();
  h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
  h.members[5].getCoordinationMainSn=async()=>{clock.advance(40000);return 'SYNTHETIC-OFFICE-0';};
  h.office.flowRefresh=async()=>{entered.resolve();await paused.promise;};
  if(expiry)expiredHouseOnlyLease(h);
  const started=Date.now(),body={...houseLowerBody(),leaseUntil:started+43000};
  const pending=expiry?h.app.expireHouseReserveLease():h.app.requestCoordinatedReserve(body);
  const result=expiry?assert.rejects(pending,/Unowned office stop unverified/):pending;
  await entered.promise;clock.expire();const denied=await result;
  assert.equal(Date.now()-started,expiry?45000:43000);
  if(!expiry)assert.equal(denied.releaseBlocked,true);
  paused.resolve();await flush();assert.deepEqual(h.events,[]);assert.equal(h.app.officeCoordinationProof,null);
 });
});
test('unowned expiry uses a restoration deadline, not the expired charging lease',async t=>{
 const h=dualInstallationHarness();proofClock(t,h);
 h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
 h.setOfficeWatts(-10);expiredHouseOnlyLease(h);
 await h.app.expireHouseReserveLease();
 assert.equal(h.store.houseReserveLease.completed,true);
 assert.deepEqual(h.events,['house:15','second:15']);
});
test('House release rechecks lease and proof immediately before each member publish',async t=>{
 for(const expiry of [false,true])for(const change of ['lease','gate','recovery','deadline','reserve'])await t.test([expiry,change].join(' '),async st=>{
  const h=dualInstallationHarness(),clock=proofClock(st,h),publish=h.app.appMqtt.publishHouseReserve;
  h.app.verifyOfficeChargeStopped=App.prototype.verifyOfficeChargeStopped;
  if(expiry)expiredHouseOnlyLease(h);
  const replacement={until:Date.now()+60000,owner:'replacement',controlScope:'house-only'};
  h.app.appMqtt.publishHouseReserve=async(...args)=>{
   await publish(...args);
   if(change==='lease')h.store.houseReserveLease=replacement;
   if(change==='gate')h.store.houseReserveControl.officeMainSerial='SYNTHETIC-OFFICE-1';
   if(change==='recovery'){
    const diagnostics=h.office.getReportingDiagnostics;
    h.office.getReportingDiagnostics=()=>({...diagnostics(),aggregateRecovery:{state:'identity_changed'}});
   }
   if(change==='deadline')clock.advance(45001);
   if(change==='reserve')h.setOffice(100);
  };
  if(expiry)await assert.rejects(h.app.expireHouseReserveLease());
  else{
   const result=await h.app.requestCoordinatedReserve(houseLowerBody()).catch(()=>null);
   assert.notEqual(result?.verified,true);
  }
  if(change==='lease')assert.equal(h.store.houseReserveLease,replacement);
  assert.deepEqual(h.events,['house:15']);
 });
});

test('House-only admission includes disappearing Office discharge and refuses unknown power even at its floor', async () => {
 for (const kind of ['discharge', 'missing', 'unavailable', 'unqualified']) {
  const h=dualInstallationHarness(),g=h.store.houseReserveControl;
  g.houseNativeChargeKw=4.9;g.powerBudget.nativeChargeBounds.house.maxKw=4.9;g.powerBudget.marginKw=0;
  h.setUpstream(650);h.setOfficeWatts(-2000);
  if(kind==='missing')h.office.getReportingDiagnostics=()=>({aggregateRecovery:{state:'verified_original_main'},observations:{}});
  if(kind==='unavailable')h.office.getAvailable=()=>false;
  if(kind==='unqualified')h.office.getReportingDiagnostics=()=>({observations:{measure_power:{value:0,receivedAt:Date.now()}}});
  await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,housePercent:100,officePercent:3}),/headroom|Office discharge receipt/);
  assert.deepEqual(h.events,[]);
 }
});

test('ordinary dual paths cannot adopt manual Office 100 by matching expected state', async () => {
 for(const changeHouse of [false,true]) {
  const h=dualInstallationHarness();h.setOffice(100);
  await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),expectedOfficePercent:100,officePercent:3,
   ...(changeHouse?{housePercent:20}:{})}),/native ownership/);
  assert.deepEqual(h.events,[]);assert.equal(h.office.getCapabilityValue('backup_reserve_soc'),100);
 }
 for(const missing of ['request','policy']) {
  const h=dualInstallationHarness(),body=dualBody();
  if(missing==='request')delete body.acquireOfficeLease;else delete h.store.houseReserveControl.officeAcquisitionPolicy;
  await assert.rejects(h.app.requestCoordinatedReserve(body),/explicit floor acquisition/);assert.deepEqual(h.events,[]);
 }
});

test('solar surplus cannot replace House charging authority or a full physical hold', async () => {
 const h=dualInstallationHarness(),g=h.store.houseReserveControl;
 h.main.getCapabilityValue=()=>40;h.unit.getCapabilityValue=()=>40;h.setPower(100,0);
 g.houseMemberPowerScopeReviewed=false;
 await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/hold unverified/);assert.deepEqual(h.events,[]);
 h.main.getConfigurationDiagnostics=()=>snapshot(true,60);h.unit.getConfigurationDiagnostics=()=>snapshot(true,60);h.setPower(100,100);
 h.store.houseReserveLease={until:Date.now()+60000,guardScope:g.controlScope,guardBinding:JSON.stringify(g),controlScope:g.controlScope,
  houseDeviceId:g.deviceId,serial:g.serial,houseMemberDeviceIds:g.houseMemberDeviceIds,houseMemberSerials:g.houseMemberSerials,
  expectedEnabled:true,expectedPercent:60,officeDeviceId:g.officeDeviceId,officeExpectedReserve:3,officeRestoreReserve:3};
 assert.equal((await h.app.requestCoordinatedReserve({...dualBody(),housePercent:60,expectedHousePercent:60})).verified,true);
 assert.deepEqual(h.events,['office:22']);
});

test('Office dispatch and acknowledgement crossing the deadline fail closed with owned stop', async t => {
 const originalNow=Date.now;let now=originalNow();t.mock.method(Date,'now',()=>now);
 for(const phase of ['dispatch','ack']) {
  const h=dualInstallationHarness(),write=h.office.flowSetBackupReserve;
  h.app.homey.setTimeout=(fn,ms)=>{if(ms<=1000){now+=1000;queueMicrotask(fn);}return 1;};
  h.office.flowSetBackupReserve=async(n,options)=>{
   if(n===22) {
    if(phase==='ack')await write(n);
    now+=61000;options.assertActive();
   }else await write(n);
  };
  await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/deadline|expired/);
  assert.deepEqual(h.events,phase==='dispatch'?['office-stopped']:['office:22','office:3','office-stopped']);
  assert.equal(h.store.houseReserveLease.completed,true);
  assert.equal(h.app.coordinatedReserveBusy,false);
 }
});

test('watchdog cancels a busy Office writer on expiry and bounds stalled work', async t => {
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=dualInstallationHarness(),write=h.office.flowSetBackupReserve;let entered;
 h.app.homey.setTimeout=(fn,ms)=>{if(ms<=1000){now+=1000;queueMicrotask(fn);}return 1;};
 const started=new Promise(resolve=>{entered=resolve;});
 h.office.flowSetBackupReserve=async(n,options)=>{
  if(n===22){entered(options);return new Promise(()=>{});}
  return write(n);
 };
 const pending=h.app.requestCoordinatedReserve(dualBody());
 const options=await started;
 h.store.houseReserveLease.until=Date.now()-1;
 await h.app.expireHouseReserveLease();
 await assert.rejects(pending,/cancelled|expired/);
 assert.equal(options.signal.aborted,true);assert.equal(h.app.coordinatedReserveBusy,false);
 assert.equal(h.store.houseReserveLease.completed,true);assert.deepEqual(h.events,['office-stopped']);
});

test('normal staged Office stop retains bounded House restoration authority and permits the next phase', async () => {
 const h=dualInstallationHarness();
 await h.app.verifyOfficeCoordinationMembership(h.office,h.store.houseReserveControl);
 await h.app.requestCoordinatedReserve({...dualBody(),housePercent:20,houseOnly:true,officePercent:3});
 // A reviewed dual acquisition is represented by the native lease, not caller equality.
 const g=h.store.houseReserveControl;
 h.store.houseReserveLease={...h.store.houseReserveLease,controlScope:g.controlScope,officeExpectedReserve:22};
 h.setOffice(22);h.setPower(100,100);
 const until=h.store.houseReserveLease.until;
 const result=await h.app.requestCoordinatedReserve({...dualBody(),housePercent:20,expectedHousePercent:20,
  officePercent:3,expectedOfficePercent:22,releaseOfficeOnly:true,releaseOfficeReason:'staged-stop'});
 assert.equal(result.houseVerified,false);assert.equal(result.houseOwnershipPreserved,true);
 assert.equal(result.houseRestorationPending,true);assert.equal(h.store.houseReserveLease.completed,undefined);
 assert.equal(h.store.houseReserveLease.fault,undefined);assert.equal(h.store.houseReserveLease.until,until);
 assert.equal(h.store.houseReserveLease.officeExpectedReserve,3);
 await h.app.requestCoordinatedReserve({...dualBody(),housePercent:18,expectedHousePercent:20,officePercent:3});
 assert.equal(h.store.houseReserveLease.expectedPercent,18);
 assert.deepEqual(h.events,['house:20','second:20','office:3','office-stopped','office-stopped','house:18','second:18']);
});
test('expiry stop survives watchdog reentry but retains its own deadline and ownership checks',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 for(const outcome of ['complete','deadline','ownership']){
  const h=coordinatedHarness(),g=h.store.houseReserveControl;
  const house=h.app.homey.drivers.getDriver('stream_5000_unit').getDevices()[0];
  let value=snapshot(true,20),entered,resume;
  house.getConfigurationDiagnostics=()=>value;
  h.app.appMqtt.publishHouseReserve=async()=>{h.events.push('house:18');value=snapshot(true,18);};
  h.setOffice(22);
  h.store.houseReserveLease={until:now-1,officeDeviceId:g.officeDeviceId,officeExpectedReserve:22,officeRestoreReserve:3,
   houseDeviceId:g.deviceId,serial:g.serial,expectedEnabled:true,expectedPercent:20,restoreEnabled:true,restorePercent:18};
  const started=new Promise(resolve=>{entered=resolve;}),paused=new Promise(resolve=>{resume=resolve;});
  const write=h.office.flowSetBackupReserve;
  h.office.flowSetBackupReserve=async(n,options)=>{entered(options);await paused;options.assertActive();await write(n);};
  const pending=h.app.expireHouseReserveLease(),options=await started;
  if(outcome==='deadline')now+=45001;
  if(outcome==='ownership')h.setOffice(55);
  await h.app.expireHouseReserveLease();
  if(outcome==='complete'){
   assert.equal(options.signal.aborted,false);resume();await pending;
   assert.deepEqual(h.events,['office:3','house:18']);assert.equal(h.store.houseReserveLease.completed,true);
   assert.equal(h.store.houseReserveLease.fault,undefined);
  }else{
   assert.equal(options.signal.aborted,true);
   await assert.rejects(pending,/cancelled|expired/);resume();
   assert.deepEqual(h.events,[]);assert.equal(value.values.backupReservePct.value,20);
   assert.match(h.store.houseReserveLease.fault,/cancelled|expired/);
  }
 }
});
test('dual read exposes diagnostic house hold without making Office availability a House dependency',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.main.getAppliedReadingAt=()=>now;
  h.office.flowRefresh=async()=>{throw new Error('offline');};
  h.app.appMqtt.requestHouseRead=async()=>{};h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};
  let r=await h.app.refreshCoordinatedReadings();
  assert.equal(r.houseFresh,true);assert.equal(r.house.noDischargeHoldVerified,true);
  assert.equal(r.house.houseChargingVerified,false);assert.equal(r.wholeProperty.signedImportW,1000);
  assert.equal(r.powerBudgetSupported,true);assert.equal(r.officePowerBudgetReady,true);assert.equal(r.propertyPower.propertyImportW,1000);
  assert.equal(Date.parse(r.propertyPower.capturedAt)-r.wholeProperty.observedAt,r.propertyPower.ageSec*1000);
  assert.deepEqual(r.powerBudgetReceipt,{schemaVersion:1,wholePropertyImportLimitKw:7.2,spaceImportLimitKw:{house:7.2,office:7.2},
   marginKw:0.3,maxObservationAgeSec:5,houseMaxKw:1.5,officeMaxKw:3.65});
  h.unit.getCapabilityValue=key=>key==='measure_battery'?17:18;
  r=await h.app.refreshCoordinatedReadings();assert.equal(r.house.noDischargeHoldVerified,false);
  h.setPower(2000,2000);r=await h.app.refreshCoordinatedReadings();
  assert.equal(r.house.houseChargingVerified,false);assert.equal(r.house.noDischargeHoldVerified,false);
 }finally{Date.now=old;}
});
test('dual read exposes independent signed Office discharge with source age, not control authority',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=dualInstallationHarness();
 h.store.houseReserveControl.powerBudget.nativeChargeBounds.office=null;
 h.main.getAppliedReadingAt=()=>now;h.app.appMqtt.requestHouseRead=async()=>{};
 h.app.homey.setTimeout=(fn,ms)=>{if(ms<=1000){now+=1000;queueMicrotask(fn);}return 1;};
 h.office.getReportingDiagnostics=()=>({aggregateRecovery:{state:'verified_original_main'},
  observations:{measure_power:{value:-2000,receivedAt:now-2000}}});
 const r=await h.app.refreshCoordinatedReadings();
 assert.equal(r.officeFresh,false);assert.equal(r.officePowerBudgetReady,false);
 assert.deepEqual(r.officeDischarge,{schemaVersion:1,qualified:true,deviceId:'office',
  capturedAt:new Date(now).toISOString(),batteryW:-2000,powerAgeSec:2,powerAgeUncertaintySec:0});
 assert.equal(r.settingsWrites,0);assert.deepEqual(h.events,[]);assert.equal(h.store.houseReserveLease,undefined);
 for(const kind of ['stale','future','missing','unqualified','unavailable','invalid-budget']){
  h.store.houseReserveControl.powerBudget.maxObservationAgeSec=kind==='invalid-budget'?undefined:5;
  h.office.getAvailable=()=>kind!=='unavailable';
  h.office.getReportingDiagnostics=()=>({aggregateRecovery:{state:kind==='unqualified'?'identity_changed':'verified_original_main'},
   observations:kind==='missing'?{}:{measure_power:{value:0,receivedAt:now+(kind==='future'?1000:kind==='stale'?-6000:0)}}});
  assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge,null,kind);
 }
});
test('stalled post-write Office read expires without a verified ACK and invokes owned stop',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=dualInstallationHarness(),timers=new Map();let sequence=0,entered;
 h.app.homey.setTimeout=(fn,ms)=>{
  const id=++sequence;
  if(ms<=1000){now+=1000;queueMicrotask(fn);}else timers.set(id,{fn,ms});
  return id;
 };
 h.app.homey.clearTimeout=id=>timers.delete(id);
 const started=new Promise(resolve=>{entered=resolve;});
 h.office.flowRefresh=async()=>{
  if(h.office.getCapabilityValue('backup_reserve_soc')===22){entered();return new Promise(()=>{});}
 };
 const pending=h.app.requestCoordinatedReserve(dualBody());
 await started;
 const deadline=[...timers.values()].at(-1);assert.ok(deadline);
 now+=deadline.ms;deadline.fn();
 await assert.rejects(pending,/read deadline expired/);
 assert.deepEqual(h.events,['office:22','office:3','office-stopped']);
 assert.equal(h.app.coordinatedReserveBusy,false);
 assert.equal(h.store.houseReserveLease.completed,true);
});
test('property power capturedAt is read time and ageSec is source receipt age',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness(),prior=h.app.homey.drivers.getDriver;
  h.main.getAppliedReadingAt=()=>now;h.app.appMqtt.requestHouseRead=async()=>{};
  h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};
  h.app.homey.drivers.getDriver=k=>k==='smartmeter_dual_ct_energy'
   ?{getDevices:()=>[{getId:()=>h.store.houseReserveControl.wholePropertyMeterDeviceId,getAvailable:()=>true,getCoordinatedGridReading:()=>({signedImportW:1000,observedAt:now-2000})}]}
   :prior(k);
  const r=await h.app.refreshCoordinatedReadings();
  assert.equal(r.propertyPower.ageSec,2);assert.equal(Date.parse(r.propertyPower.capturedAt),now);
  assert.equal(Date.parse(r.propertyPower.capturedAt)-r.wholeProperty.observedAt,2000);
 }finally{Date.now=old;}
});
test('dual native budget validates provenance, age, margin and tariff deadline independently',async()=>{
 for(const change of [
  h=>{h.store.houseReserveControl.powerBudget.nativeChargeBounds.house.validUntil=new Date(Date.now()-1).toISOString();},
  h=>{h.store.houseReserveControl.powerBudget.nativeChargeBounds.office.evidenceId='';},
  h=>{h.store.houseReserveControl.powerBudget.wholePropertyImportLimitKw=7.1;},
  h=>{h.main.getSystemReporterDiagnostics=()=>({socPct:{value:18,stale:false,ageSec:0},batteryW:{value:0,stale:false,ageSec:5}});},
  h=>h.setUpstream(3251),
  h=>{const prior=h.app.homey.drivers.getDriver;h.app.homey.drivers.getDriver=k=>k==='smartmeter_dual_ct_energy'
   ?{getDevices:()=>[{getId:()=>h.store.houseReserveControl.wholePropertyMeterDeviceId,getAvailable:()=>true,getCoordinatedGridReading:()=>({signedImportW:1000,observedAt:Date.now()-6000})}]}
   :prior(k);},
 ]){
  const h=dualInstallationHarness();change(h);await assert.rejects(h.app.requestCoordinatedReserve(dualBody()));assert.deepEqual(h.events,[]);
 }
 const h=dualInstallationHarness();
 await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),tariffDeadline:new Date(Date.now()+1000).toISOString()}),/Invalid coordinated target/);
 await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),tariffDeadline:Date.now()+1000}),/Invalid coordinated target/);
 await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),powerBudget:{schemaVersion:1}}),/differs from native configuration/);
 assert.deepEqual(h.events,[]);
});
test('dual budget requires reviewed narrower House boundary and reserves Space margin',async()=>{
 const h=dualInstallationHarness();h.store.houseReserveControl.powerBudget.houseSpaceBoundary='house-excluding-office';
 await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/power budget/);
 h.store.houseReserveControl.houseSpaceBoundaryReviewed=true;
 assert.equal((await h.app.requestCoordinatedReserve(dualBody())).verified,true);
 const x=dualInstallationHarness(),g=x.store.houseReserveControl;
 g.officeSpaceGridLimitW=4000;g.powerBudget.spaceImportLimitKw.office=4;
 x.office.getReportingDiagnostics=()=>({aggregateRecovery:{state:'verified_original_main'},observations:{
  measure_power:{value:0,receivedAt:Date.now()},'measure_power.grid':{value:100,receivedAt:Date.now()}}});
 await assert.rejects(x.app.requestCoordinatedReserve(dualBody()),/office headroom/);assert.deepEqual(x.events,[]);
});
test('uncommissioned Office bound is independent, but unavailable Office discharge blocks House-only charge',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.store.houseReserveControl.powerBudget.nativeChargeBounds.office=null;
  await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/bound missing or expired/);
  h.store.houseReserveControl.officeNativeChargeKw=null;
  delete h.store.houseReserveControl.officeMemberDeviceIds;delete h.store.houseReserveControl.officeMemberSerials;
  delete h.store.houseReserveControl.officeMainSerial;h.office.getAvailable=()=>false;
  h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};
  await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,housePercent:20,officePercent:3}),/Office discharge receipt/);
  assert.deepEqual(h.events,[]);
 }finally{Date.now=old;}
});
test('dual House reads do not wait indefinitely on a stalled or unavailable Office',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.main.getAppliedReadingAt=()=>now;let calls=0;
  h.office.flowRefresh=()=>{calls++;return new Promise(()=>{});};
  h.app.appMqtt.requestHouseRead=async()=>{};h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};
  assert.equal((await h.app.refreshCoordinatedReadings()).houseFresh,true);
  assert.equal((await h.app.refreshCoordinatedReadings()).houseFresh,true);assert.equal(calls,1);
  h.office.getAvailable=()=>false;
  const third=await h.app.refreshCoordinatedReadings();assert.equal(third.houseFresh,true);assert.equal(third.officeFresh,false);assert.equal(calls,1);
 }finally{Date.now=old;}
});
test('Office-only stop preserves House and requires the native owned lease',async()=>{
 const h=dualInstallationHarness();h.setOffice(22);
 const body={...dualBody(),housePercent:100,expectedHousePercent:100,officePercent:3,expectedOfficePercent:22,releaseOfficeOnly:true,releaseOfficeReason:'manual-house-intervention',controlScope:'coordinated-installations'};
 await assert.rejects(h.app.requestCoordinatedReserve(body),/matching active ownership/);assert.deepEqual(h.events,[]);
 h.store.houseReserveLease={until:Date.now()+60000,controlScope:'coordinated-installations',guardScope:'coordinated-installations',guardBinding:JSON.stringify(h.store.houseReserveControl),
  officeDeviceId:'office',officeRestoreReserve:3,officeExpectedReserve:22};
 const result=await h.app.requestCoordinatedReserve(body);
 assert.equal(result.verified,true);assert.equal(result.controlScope,'coordinated-installations');assert.equal(result.houseVerified,false);assert.equal(result.houseOwnershipPreserved,true);assert.deepEqual(h.events,['office:3','office-stopped']);
 assert.equal(h.store.houseReserveLease.completed,true);assert.match(h.store.houseReserveLease.fault,/Manual house ownership preserved/);
});
test('dual scope charges office only at verified group hold and stops office before house release',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
  const first=await h.app.requestCoordinatedReserve({...dualBody(),controlScope:'coordinated-installations',tariffDeadline:now+120000,powerBudget:JSON.parse(JSON.stringify(h.store.houseReserveControl.powerBudget))});assert.equal(first.verified,true);assert.equal(first.controlScope,'coordinated-installations');assert.deepEqual(h.events,['office:22']);assert.equal(h.store.houseReserveLease.controlScope,'coordinated-installations');
  await h.app.requestCoordinatedReserve({...dualBody(),housePercent:15,expectedHousePercent:18,officePercent:3,expectedOfficePercent:22,leaseUntil:now+60000});
  assert.deepEqual(h.events,['office:22','office:3','office-stopped','house:15','second:15']);
 }finally{Date.now=old;}
});
test('dual scope defers office without inventing house pulse when member SOC differs',async()=>{
 const h=dualInstallationHarness();h.unit.getCapabilityValue=()=>17;
 await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/no-discharge hold unverified/);
 assert.deepEqual(h.events,[]);
});
test('dual scope rejects unverified office membership, unsafe office maximum and insufficient whole-property headroom',async()=>{
 for(const change of [h=>{h.members[5].getAvailable=()=>false;},h=>{h.members[5].getCoordinationMainSn=async()=>'OTHER-SYNTHETIC';},h=>{h.store.houseReserveControl.officeMainSerial='OTHER-SYNTHETIC';},h=>{h.members[5].getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:301}});},h=>{h.setOfficeWatts(3650);h.store.houseReserveControl.officeNativeChargeKw=2.8;},h=>h.setUpstream(4000),h=>{h.store.houseReserveControl.wholePropertyMeterScopeReviewed=false;},h=>{h.store.houseReserveControl.houseMemberPowerScopeReviewed=false;},h=>{h.unit.getCapabilityValue=key=>key==='measure_battery'?18:-10;},h=>{h.store.houseReserveControl.houseNativeChargeKw=NaN;}]){
  const h=dualInstallationHarness();change(h);await assert.rejects(h.app.requestCoordinatedReserve(dualBody()));assert.deepEqual(h.events,[]);
 }
});
test('dual scope supports house-only operation with readonly Office proof but no Office commands',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
  h.office.flowSetBackupReserve=async()=>assert.fail('Office command');
  h.store.houseReserveControl.powerBudget.nativeChargeBounds.office=null;
  h.main.getAppliedReadingAt=()=>now;h.app.appMqtt.requestHouseRead=async()=>{};
  assert.equal((await h.app.refreshCoordinatedReadings()).officeDischarge.qualified,true);
  await assert.rejects(h.app.requestHouseReserve({}),/coordinated owner/);
  await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,controlScope:'coordinated-installations',housePercent:20,officePercent:3}),/scope mismatch/);
  const r=await h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,controlScope:'house-only',housePercent:20,officePercent:3});assert.equal(r.verified,true);assert.equal(h.store.houseReserveLease.controlScope,'house-only');assert.deepEqual(h.events,['house:20','second:20']);
 }finally{Date.now=old;}
});
test('dual house-only never releases House while the unowned office is charging or unknown',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
  await h.app.verifyOfficeCoordinationMembership(h.office,h.store.houseReserveControl);
  await h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,housePercent:20,officePercent:3});
  h.setOffice(100);
  const denied=await h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,housePercent:18,expectedHousePercent:20,officePercent:3});
  assert.equal(denied.verified,false);assert.equal(denied.releaseBlocked,true);assert.equal(denied.interventionRequired,true);
  assert.equal(denied.controlScope,'house-only');assert.match(denied.reason,/Unowned office stop unverified/);
  assert.deepEqual(h.events,['house:20','second:20']);
  await assert.rejects(h.app.expireHouseReserveLease(),/Unowned office stop unverified/);
  assert.match(h.store.houseReserveLease.fault,/Unowned office stop unverified/);
  assert.deepEqual(h.events,['house:20','second:20']);
 }finally{Date.now=old;}
});
test('dual scope aborts subsequent writes and expires lease on mid-flight gate or deadline change',async()=>{
 for(const change of ['gate','deadline','grid']){
  const old=Date.now;let now=old();Date.now=()=>now;
  try{const h=dualInstallationHarness(),publish=h.app.appMqtt.publishHouseReserve;
   await h.app.verifyOfficeCoordinationMembership(h.office,h.store.houseReserveControl);
   h.app.appMqtt.publishHouseReserve=async(...args)=>{await publish(...args);if(change==='gate')h.store.houseReserveControl.siteChargeKw=7.1;if(change==='deadline')now+=61000;if(change==='grid')h.setUpstream(7300);};
   await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,housePercent:20,officePercent:3}),/configuration changed|lease expired|within allowance/);
   assert.deepEqual(h.events,['house:20']);assert.ok(h.store.houseReserveLease.until<now);
  }finally{Date.now=old;}
 }
});
test('dual scope rechecks office ownership, membership and headroom after refresh',async()=>{
 for(const change of ['manual','identity','headroom']){
  const h=dualInstallationHarness();
  h.office.flowRefresh=async()=>{if(change==='manual')h.setOffice(55);if(change==='headroom')h.setUpstream(5000);};
  if(change==='identity')h.office.flowRefresh=async()=>{h.members[5].getCoordinationMainSn=async()=> 'OTHER-SYNTHETIC';};
  await assert.rejects(h.app.requestCoordinatedReserve(dualBody()));
  assert.ok(h.events.every(e=>e==='office-stopped'));assert.ok(h.store.houseReserveLease.until<Date.now());
 }
});
test('dual renewal reserves unobserved Office AC charge ramp conservatively',async t=>{
 const now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=dualInstallationHarness();await h.app.requestCoordinatedReserve(dualBody());
 h.setUpstream(5000);
 await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),expectedOfficePercent:22}),/headroom/);
 assert.deepEqual(h.events,['office:22','office:3','office-stopped']);assert.ok(h.store.houseReserveLease.until<Date.now());
});
test('dual headroom retains unowned House charging and reserves the hold ramp',async()=>{
 for(const owned of [false,true]){
  const h=dualInstallationHarness();h.setPower(1000,1000);h.setUpstream(2500);
  if(owned)h.store.houseReserveLease={until:Date.now()+60000,expectedPercent:18,houseMemberDeviceIds:['synthetic-house','second'],controlScope:'coordinated-installations'};
  await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/headroom|hold unverified/);
  assert.deepEqual(h.events,[]);
 }
});
test('dual headroom adds displaced House discharge before admitting charge',async()=>{
 const h=dualInstallationHarness(),g=h.store.houseReserveControl;
 g.houseNativeChargeKw=5.2;g.powerBudget.nativeChargeBounds.house.maxKw=5.2;
 h.setPower(-3000,0);h.setUpstream(650);
 await h.app.verifyOfficeCoordinationMembership(h.office,g);
 await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,housePercent:20,officePercent:3}),/headroom/);
 assert.deepEqual(h.events,[]);
});
test('dual Office admission adds fresh displaced Office discharge',async()=>{
 const h=dualInstallationHarness();h.setUpstream(1600);h.setOfficeWatts(-200);
 await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/headroom/);
 assert.deepEqual(h.events,[]);
});
test('dual admission rejects fresh but unaligned signed battery power',async()=>{
 for(const kind of ['house','office']){
  const h=dualInstallationHarness();
  if(kind==='house')h.main.getSystemReporterDiagnostics=()=>({socPct:{value:18,ageSec:0,stale:false},batteryW:{value:0,ageSec:1,stale:false}});
  else h.office.getReportingDiagnostics=()=>({aggregateRecovery:{state:'verified_original_main'},observations:{
   measure_power:{value:-200,receivedAt:Date.now()-2000},'measure_power.grid':{value:500,receivedAt:Date.now()}}});
  await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/skew|unaligned/);assert.deepEqual(h.events,[]);
 }
});
test('dual headroom credits owned House draw only when receipt skew is bounded',async()=>{
 const h=dualInstallationHarness(),g=h.store.houseReserveControl;let age=0;
 h.setUpstream(5700);
 h.main.getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:{value:0,ageSec:0,stale:false},
  gridToBatteryW:{value:1000,ageSec:age,stale:false},gridFlowNetW:{value:1000,ageSec:0,stale:false}}});
 h.store.houseReserveLease={until:Date.now()+60000,expectedPercent:18,expectedEnabled:true,houseDeviceId:g.deviceId,serial:g.serial,
  houseMemberDeviceIds:g.houseMemberDeviceIds,houseMemberSerials:g.houseMemberSerials,guardScope:g.controlScope,guardBinding:JSON.stringify(g)};
 await h.app.verifyOfficeCoordinationMembership(h.office,g);
 assert.doesNotThrow(()=>h.app.assertCoordinatedStartHeadroom(g,20,false,null));
 age=1;assert.throws(()=>h.app.assertCoordinatedStartHeadroom(g,20,false,null),/headroom/);
});
test('factory House and Office maxima cannot be admitted under the combined commissioning cap',async()=>{
 const h=dualInstallationHarness(),g=h.store.houseReserveControl;
 g.houseNativeChargeKw=6;g.officeNativeChargeKw=6.6;
 g.powerBudget.nativeChargeBounds.house.maxKw=6;g.powerBudget.nativeChargeBounds.office.maxKw=6.6;
 await assert.rejects(h.app.requestCoordinatedReserve(dualBody()),/headroom/);assert.deepEqual(h.events,[]);
});
test('dual watchdog stops office first and latches upstream budget violation',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};await h.app.requestCoordinatedReserve(dualBody());h.setUpstream(7300);await h.app.expireHouseReserveLease();
  assert.deepEqual(h.events,['office:22','office:3','office-stopped']);assert.equal(h.store.houseReserveLease.completed,true);assert.match(h.store.houseReserveLease.fault,/exceeds allowance/);
 }finally{Date.now=old;}
});
test('dual watchdog does not silently downgrade safety scope after a gate change',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
  await h.app.requestCoordinatedReserve(dualBody());
  h.store.houseReserveControl.controlScope='house-only';await h.app.expireHouseReserveLease();
  assert.deepEqual(h.events,['office:22','office:3','office-stopped']);
  assert.equal(h.store.houseReserveLease.completed,true);
  assert.match(h.store.houseReserveLease.fault,/configuration changed/);
 }finally{Date.now=old;}
});
test('dual renewal cannot adopt an altered gate before watchdog detects it',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=dualInstallationHarness();await h.app.requestCoordinatedReserve(dualBody());
 h.app.homey.setTimeout=(fn,ms)=>{if(ms<=1000){now+=1000;queueMicrotask(fn);}return 1;};
 const binding=h.store.houseReserveLease.guardBinding;h.store.houseReserveControl.powerBudget.marginKw=0.4;
 await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),expectedOfficePercent:22}),/native ownership/);
 assert.equal(h.store.houseReserveLease.guardBinding,binding);
 await h.app.expireHouseReserveLease();
 assert.equal(h.store.houseReserveLease.completed,true);assert.deepEqual(h.events,['office:22','office:3','office-stopped']);
});
test('dual watchdog stops Office and latches an expired native bound',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
  h.store.houseReserveControl.powerBudget.nativeChargeBounds.office.validUntil=new Date(now+5000).toISOString();
  await h.app.requestCoordinatedReserve(dualBody());now+=6000;
  await h.app.expireHouseReserveLease();
  assert.deepEqual(h.events,['office:22','office:3','office-stopped']);
  assert.equal(h.store.houseReserveLease.completed,true);assert.match(h.store.houseReserveLease.fault,/safety guard lost/);
 }finally{Date.now=old;}
});
test('two-member control persists physical bindings and restores the shared target without office calls',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=twoMemberHarness();h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};await h.app.requestCoordinatedReserve(twoBody());assert.deepEqual(h.store.houseReserveLease.houseMemberDeviceIds,h.store.houseReserveControl.houseMemberDeviceIds);h.store.houseReserveLease.until=now-1;await h.app.expireHouseReserveLease();assert.equal(h.store.houseReserveLease.completed,true);assert.equal(h.store.houseReserveLease.fault,undefined);assert.deepEqual(h.events,['house:20','second:20','house:18','second:18']);}finally{Date.now=old;}
});
test('manual change on the second house member is preserved during watchdog restoration',async()=>{
 const h=twoMemberHarness();await h.app.requestCoordinatedReserve(twoBody());h.setSecond(55);h.store.houseReserveLease.until=Date.now()-1;
 await assert.rejects(h.app.expireHouseReserveLease(),/member manual ownership/);assert.deepEqual(h.events,['house:20','second:20']);assert.equal(h.unit.getConfigurationDiagnostics().values.backupReservePct.value,55);
});
test('house grid-charge budget violation stops both and latches; solar charge alone does not trigger it',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{for(const solar of[false,true]){const h=twoMemberHarness();h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};await h.app.requestCoordinatedReserve(twoBody());h.setPower(5000,solar?0:5000);await h.app.expireHouseReserveLease();if(solar){assert.deepEqual(h.events,['house:20','second:20']);assert.equal(h.store.houseReserveLease.completed,undefined);}else{assert.equal(h.store.houseReserveLease.completed,true);assert.match(h.store.houseReserveLease.fault,/exceeds allowance/);assert.deepEqual(h.events,['house:20','second:20','house:18','second:18']);await assert.rejects(h.app.requestCoordinatedReserve({...twoBody(),expectedHousePercent:18}),/fault/);}}}finally{Date.now=old;}
});

test('stale caller membership and unleased direct group writes are rejected before publishing',async()=>{
 const h=twoMemberHarness();await assert.rejects(h.app.requestCoordinatedReserve({...twoBody(),houseMemberDeviceIds:['synthetic-house','foreign']}),/membership changed/);
 await assert.rejects(h.app.requestHouseReserve({deviceId:h.gate.deviceId,enabled:true,percent:20,expectedEnabled:true,expectedPercent:18}),/bounded group lease/);assert.deepEqual(h.events,[]);
});

test('enrolled house can hold but cannot request grid charging while circuit limit is unconfirmed',async()=>{
 const h=twoMemberHarness();h.store.houseReserveControl.houseGridChargingEnabled=false;
 await assert.rejects(h.app.requestCoordinatedReserve(twoBody()),/grid charging disabled/);assert.deepEqual(h.events,[]);
 const r=await h.app.requestCoordinatedReserve({...twoBody(),housePercent:18});assert.equal(r.verified,true);assert.deepEqual(h.events,[]);
});

test('owner-confirmed House Space budget is separate from unchanged office allowance',async()=>{
 const h=twoMemberHarness();h.store.houseReserveControl.houseSiteChargeKw=7.2;await h.app.requestCoordinatedReserve(twoBody());h.setPower(5000,5000);await h.app.expireHouseReserveLease();assert.equal(h.store.houseReserveControl.siteChargeKw,2.8);assert.deepEqual(h.events,['house:20','second:20']);assert.equal(h.store.houseReserveLease.fault,undefined);
});

test('two-member read refresh obtains separately ageing grid-limit fields before accepting installation freshness',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=twoMemberHarness(),g=h.store.houseReserveControl,queries=[];g.houseSpaceGridLimitW=7200;g.houseSiteChargeKw=7.2;h.main.getAppliedReadingAt=()=>now;h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};h.app.appMqtt.requestHouseRead=async sn=>{queries.push(sn);const d=sn===g.serial?h.main:h.unit;d.getConfigurationDiagnostics=()=>({values:{...snapshot().values,maxGridInputW:{value:7200,ageSec:0,stale:false}}});};
 const stale=()=>{const v=snapshot();v.values.maxGridInputW.ageSec=601;return v;};h.main.getConfigurationDiagnostics=stale;h.unit.getConfigurationDiagnostics=stale;
 const r=await h.app.refreshCoordinatedReadings();assert.equal(r.houseFresh,true);assert.equal(r.house.memberDeviceIds.length,2);assert.ok(queries.includes(g.serial));assert.ok(queries.includes(g.houseMemberSerials.second));assert.equal(r.settingsWrites,0);
 }finally{Date.now=old;}
});


test('whole House Space import ceiling includes native load alongside battery charging',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=twoMemberHarness(),g=h.store.houseReserveControl;g.houseSiteChargeKw=7.2;g.houseSpaceGridLimitW=7200;h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};const flow=h.main.getSystemFlowDiagnostics;h.main.getSystemFlowDiagnostics=()=>{const r=flow();r.fields.gridFlowNetW.value=r.fields.gridToBatteryW.value+3000;return r;};await h.app.requestCoordinatedReserve(twoBody());h.setPower(5000,5000);await h.app.expireHouseReserveLease();assert.equal(h.store.houseReserveLease.completed,true);assert.match(h.store.houseReserveLease.fault,/exceeds allowance/);assert.deepEqual(h.events,['house:20','second:20','house:18','second:18']);}finally{Date.now=old;}
});

test('empty-start acknowledgement refreshes aged member receipts without replaying the command',async()=>{
 const old=Date.now,now=old();Date.now=()=>now;try{
 const h=twoMemberHarness();let aged=false,reads=0;
 h.main.getSystemReporterDiagnostics=()=>({batteryW:{value:0,stale:false,ageSec:0}});
 for(const d of [h.main,h.unit]){d.getCapabilityValue=()=>0;d.getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:aged?11:0}});}
 const publish=h.app.appMqtt.publishHouseReserve;h.app.appMqtt.publishHouseReserve=async(...a)=>{await publish(...a);aged=true;};
 h.app.refreshCoordinatedReadings=async()=>{reads++;aged=false;return{houseFresh:true};};
 const result=await h.app.requestCoordinatedReserve(twoBody());assert.equal(result.verified,true);assert.equal(reads,1);assert.deepEqual(h.events,['house:20','second:20']);
 }finally{Date.now=old;}
});

test('persistent empty-start receipt loss stays wall-clock bounded and never replays reserve',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=twoMemberHarness();let aged=false,reads=0;h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};
 h.main.getSystemReporterDiagnostics=()=>({batteryW:{value:0,stale:false,ageSec:0}});
 for(const d of[h.main,h.unit]){d.getCapabilityValue=()=>0;d.getReadingDiagnostics=()=>({measure_battery:{stale:false,applicationStatus:'applied',ageSec:aged?11:0}});}
 const publish=h.app.appMqtt.publishHouseReserve;h.app.appMqtt.publishHouseReserve=async(...a)=>{await publish(...a);aged=true;};
 h.app.refreshCoordinatedReadings=async()=>{reads++;now+=6000;return{houseFresh:false};};
 await assert.rejects(h.app.requestCoordinatedReserve(twoBody()),/unverified/);assert.ok(reads<=7);assert.deepEqual(h.events,['house:20','second:20']);assert.equal(h.app.houseReserveBusy,false);
 }finally{Date.now=old;}
});

test('watchdog restores the second member even when the controller already reports its restored reserve',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=twoMemberHarness();h.app.homey.setTimeout=fn=>{now+=1000;queueMicrotask(fn);return 1;};await h.app.requestCoordinatedReserve(twoBody());h.main.getConfigurationDiagnostics=()=>snapshot(true,18);h.store.houseReserveLease.until=now-1;await h.app.expireHouseReserveLease();assert.equal(h.store.houseReserveLease.completed,true);assert.equal(h.store.houseReserveLease.fault,undefined);assert.deepEqual(h.events,['house:20','second:20','second:18']);assert.equal(h.unit.getConfigurationDiagnostics().values.backupReservePct.value,18);
 }finally{Date.now=old;}
});

test('group acknowledgement must remain stable after a delayed old member reply without another SET',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=twoMemberHarness();let polls=0,reads=0;h.app.homey.setTimeout=fn=>{polls++;now+=500;if(polls===5)h.setSecond(18);queueMicrotask(fn);return 1;};h.app.refreshCoordinatedReadings=async()=>{reads++;h.setSecond(20);return{houseFresh:true};};const r=await h.app.requestCoordinatedReserve(twoBody());assert.equal(r.verified,true);assert.ok(polls>=21);assert.equal(reads,1);assert.deepEqual(h.events,['house:20','second:20']);
 }finally{Date.now=old;}
});

test('house fixture records peer receipt time before snapshot evaluation across millisecond clock boundaries',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now++;
 try{const h=twoMemberHarness(),received=h.main.getTopologyEvidence().peers[0].seenAt;assert.equal(h.main.getTopologyEvidence().peers[0].seenAt,received);const r=await h.app.requestCoordinatedReserve(twoBody());assert.equal(r.verified,true);assert.deepEqual(h.events,['house:20','second:20']);}finally{Date.now=old;}
});

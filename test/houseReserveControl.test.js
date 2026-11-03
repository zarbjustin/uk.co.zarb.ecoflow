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
test('dual scope supports house-only operation without office and rejects direct group writes',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
  h.office.getCoordinationMainSn=async()=>assert.fail('office lookup');h.office.flowRefresh=async()=>assert.fail('office refresh');
  await assert.rejects(h.app.requestHouseReserve({}),/coordinated owner/);
  await assert.rejects(h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,controlScope:'coordinated-installations',housePercent:20,officePercent:3}),/scope mismatch/);
  const r=await h.app.requestCoordinatedReserve({...dualBody(),houseOnly:true,controlScope:'house-only',housePercent:20,officePercent:3});assert.equal(r.verified,true);assert.equal(h.store.houseReserveLease.controlScope,'house-only');assert.deepEqual(h.events,['house:20','second:20']);
 }finally{Date.now=old;}
});
test('dual house-only never releases House while the unowned office is charging or unknown',async()=>{
 const old=Date.now;let now=old();Date.now=()=>now;
 try{const h=dualInstallationHarness();h.app.homey.setTimeout=(fn,ms)=>{if(ms>1000)return 1;now+=1000;queueMicrotask(fn);return 1;};
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
test('dual renewal reserves unobserved Office AC charge ramp conservatively',async()=>{
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
test('dual headroom credits owned House draw only when receipt skew is bounded',()=>{
 const h=dualInstallationHarness(),g=h.store.houseReserveControl;let age=0;
 h.setUpstream(5700);
 h.main.getSystemFlowDiagnostics=()=>({fields:{batteryDerivedW:{value:0,ageSec:0,stale:false},
  gridToBatteryW:{value:1000,ageSec:age,stale:false},gridFlowNetW:{value:1000,ageSec:0,stale:false}}});
 h.store.houseReserveLease={until:Date.now()+60000,expectedPercent:18,expectedEnabled:true,houseDeviceId:g.deviceId,serial:g.serial,
  houseMemberDeviceIds:g.houseMemberDeviceIds,houseMemberSerials:g.houseMemberSerials,guardScope:g.controlScope,guardBinding:JSON.stringify(g)};
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

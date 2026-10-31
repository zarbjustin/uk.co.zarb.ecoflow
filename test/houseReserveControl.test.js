'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const Module = require('node:module');
const { houseReserveFrame, freshReserveSnapshot, assertHouseNoDischarge } = require('../.homeybuild/lib/houseReserveControl');
const original = Module._load; let App;
try { Module._load = function load(request, ...args) { if (request === 'homey') return { App: class {} }; return original.call(this, request, ...args); }; App = require('../.homeybuild/app'); } finally { Module._load = original; }
const snapshot = (enabled = true, percent = 18) => ({ values: { backupReserveEnabled: { value: enabled, ageSec: 0, stale: false }, backupReservePct: { value: percent, ageSec: 0, stale: false }, mode: { value: 'self_powered', ageSec: 0, stale: false }, tasks: { value: [], ageSec: 0, stale: false } } });
function harness() {
 const app = new App(); let value = snapshot(); const gate = { enabled: true, expiresAt: Date.now() + 60000, deviceId: 'synthetic-house', serial: 'ES21SYNTHETIC0001', minPercent: 3, maxPercent: 100 }; let publishes = 0;
 app.homey = { settings: { get: () => gate }, drivers: { getDriver: () => ({ getDevices: () => [{ getId: () => gate.deviceId, getData: () => ({ sn: gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => value }] }) }, setTimeout: fn => { queueMicrotask(fn); return 1; } };
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
 const store = { houseReserveControl: { ...h.gate, mode: 'routine', expiresAt: null, officeDeviceId: 'office', restoreEnabled: true, restorePercent: 18, officeRestoreReserve: 3, siteChargeKw: 2.8, houseNativeChargeKw: 2.5, officeNativeChargeKw: 2.3 } };
 const office = { getId: () => 'office', getAvailable: () => true, getCapabilityValue: key => key === 'operating_mode' ? 'self_powered' : key === 'alarm_generic' ? false : reserve, flowRefresh: async () => {}, getReportingDiagnostics: () => ({ observations: { measure_power: { value: -1, receivedAt: Date.now(), source: 'rest' } } }), flowSetBackupReserve: async n => { events.push('office:' + n); reserve = n; } };
 const house = { getId: () => h.gate.deviceId, getData: () => ({ sn: h.gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => houseValue, getReadingDiagnostics: () => Object.fromEntries(['measure_battery', 'stream_unit_power_battery_flow'].map(k => [k, { ageSec: 0, stale: false, applicationStatus: 'applied' }])), getCapabilityValue: k => k === 'measure_battery' ? 18 : power };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } }; h.app.homey.setInterval = () => 1;
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => [kind === 'stream' ? office : house] });
 h.app.appMqtt.publishHouseReserve = async () => { events.push('house:20'); houseValue = snapshot(true, 20); };
 return { ...h, store, events, office, setPower: n => { power = n; }, setOffice: n => { reserve = n; } };
}
test('coordinated endpoint starts office only at verified house hold with a native lease', async () => {
 const h = coordinatedHarness();
 const body = { housePercent: 18, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 };
 const r = await h.app.requestCoordinatedReserve(body); assert.equal(r.verified, true); assert.deepEqual(h.events, ['office:22']); assert.equal(h.store.houseReserveLease.officeExpectedReserve, 22);
});
test('coordinated start refuses insufficient headroom before sending an office command', async () => {
 const h = coordinatedHarness(); h.setPower(2500);
 await assert.rejects(h.app.requestCoordinatedReserve({ housePercent: 18, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 }), /hold unverified/);
 assert.deepEqual(h.events, []); assert.ok(h.store.houseReserveLease.until < Date.now());
});
test('coordinated change releases office before changing house reserve', async () => {
 const h = coordinatedHarness(); h.setOffice(22);
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
 const h = coordinatedHarness(); h.setOffice(22); let watts = 2611; let refreshes = 0;
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
 await assert.rejects(h.app.requestCoordinatedReserve({ housePercent: 20, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 }), /Establish house reserve/);
 assert.deepEqual(h.events, []);
});
test('office manual mode and native alarm retain their charging safety guard', async () => {
 for (const fault of [false, true]) {
  const h = coordinatedHarness();const old = h.office.getCapabilityValue;
  h.office.getCapabilityValue = key => key === 'operating_mode' ? (fault ? 'self_powered' : 'custom') : key === 'alarm_generic' ? fault : old(key);
  await assert.rejects(h.app.requestCoordinatedReserve({ housePercent: 18, expectedHousePercent: 18, officePercent: 22, expectedOfficePercent: 3, leaseUntil: Date.now() + 60000 }), /mode\/fault/);
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

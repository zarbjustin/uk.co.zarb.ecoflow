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
   ? [{ getId: () => 'office', getAvailable: () => true, getCapabilityValue: () => 100, flowSetBackupReserve: async n => { assert.equal(n, 3); events.push('office-stop'); } }]
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
 const store = { houseReserveControl: { enabled: true, mode: 'routine', siteChargeKw: 2.8, officeNativeChargeKw: 2.3 }, houseReserveLease: { until: Date.now() + 60000, officeDeviceId: 'office', officeRestoreReserve: 3, officeExpectedReserve: 100, houseDeviceId: h.gate.deviceId, serial: h.gate.serial, restoreEnabled: true, restorePercent: 18, expectedEnabled: true, expectedPercent: 19 } };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } };
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => kind === 'stream'
   ? [{ getId: () => 'office', getAvailable: () => true, getCapabilityValue: () => 100, flowSetBackupReserve: async () => { events.push('office-stop'); } }]
   : [{ getId: () => h.gate.deviceId, getData: () => ({ sn: h.gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => value, getReadingDiagnostics: () => ({}) }] });
 h.app.appMqtt.publishHouseReserve = async () => { events.push('house-restore'); value = snapshot(true, 18); };
 await h.app.expireHouseReserveLease(); assert.deepEqual(events, ['office-stop', 'house-restore']);
});
function coordinatedHarness() {
 const h = harness(); let reserve = 3; let power = 0; let houseValue = snapshot(); const events = [];
 const store = { houseReserveControl: { ...h.gate, mode: 'routine', expiresAt: null, officeDeviceId: 'office', restoreEnabled: true, restorePercent: 18, officeRestoreReserve: 3, siteChargeKw: 2.8, officeNativeChargeKw: 2.3 } };
 const office = { getId: () => 'office', getAvailable: () => true, getCapabilityValue: () => reserve, flowSetBackupReserve: async n => { events.push('office:' + n); reserve = n; } };
 const house = { getId: () => h.gate.deviceId, getData: () => ({ sn: h.gate.serial }), getAvailable: () => true, getConfigurationDiagnostics: () => houseValue, getReadingDiagnostics: () => Object.fromEntries(['measure_battery', 'stream_unit_power_battery_flow'].map(k => [k, { ageSec: 0, stale: false, applicationStatus: 'applied' }])), getCapabilityValue: k => k === 'measure_battery' ? 18 : power };
 h.app.homey.settings = { get: key => store[key], set: (key, val) => { store[key] = val; } }; h.app.homey.setInterval = () => 1;
 h.app.homey.drivers.getDriver = kind => ({ getDevices: () => [kind === 'stream' ? office : house] });
 h.app.appMqtt.publishHouseReserve = async () => { events.push('house:20'); houseValue = snapshot(true, 20); };
 return { ...h, store, events, setPower: n => { power = n; }, setOffice: n => { reserve = n; } };
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

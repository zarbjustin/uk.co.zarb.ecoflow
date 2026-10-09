'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let StreamUnit;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: class {} };
    return originalLoad.call(this, request, ...args);
  };
  StreamUnit = require('../.homeybuild/drivers/stream_unit/device');
} finally { Module._load = originalLoad; }

async function harness(sn, mainSn = sn, app) {
  const d = new StreamUnit();
  const caps = new Set(['onoff.ac1', 'onoff.ac2', 'stream_unit_power_ac1', 'stream_unit_power_ac2']);
  const values = {}; const listeners = {}; const writes = []; const reads = [];
  let state = { relay2Onoff: false, relay3Onoff: false, cmsMinDsgSoc: 0, backupReverseSoc: 20 };
  d.getData = () => ({ sn }); d.getStoreValue = () => undefined;
  d.hasCapability = (cap) => caps.has(cap);
  d.addCapability = async (cap) => caps.add(cap); d.removeCapability = async (cap) => caps.delete(cap);
  d.getCapabilityValue = (cap) => values[cap];
  d.setCapabilityValue = async (cap, value) => { values[cap] = value; };
  d.registerCapabilityListener = (cap, callback) => { listeners[cap] = callback; };
  d.setSettings = async () => {}; d.error = () => {};
  d.client = { getMainSn: async () => { if (mainSn === null) throw new Error('offline'); return mainSn; } };
  const intervals = new Map();
  d.homey = { app, setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    setInterval: (fn) => { intervals.set(1, fn); return 1; }, clearInterval: (id) => intervals.delete(id) };
  d.readControlQuota = async (target, fields) => {
    reads.push({ target, fields });
    return fields ? Object.fromEntries(fields.map((field) => [field, state[field]])) : { ...state };
  };
  d.writeQuota = async (payload) => {
    writes.push(payload);
    if ('cfgRelay2Onoff' in payload.params) state.relay2Onoff = payload.params.cfgRelay2Onoff;
    if ('cfgRelay3Onoff' in payload.params) state.relay3Onoff = payload.params.cfgRelay3Onoff;
    if ('cfgMinDsgSoc' in payload.params) state.cmsMinDsgSoc = payload.params.cfgMinDsgSoc;
    if ('cfgBackupReverseSoc' in payload.params) state.backupReverseSoc = payload.params.cfgBackupReverseSoc;
  };
  await d.onReady();
  return { d, caps, values, listeners, writes, reads, intervals, setState: (next) => { state = next; } };
}

function pvFrame(value) {
  // Synthetic wrapper: pdata field 998 (float), cmdFunc 254, cmdId 21.
  const data = Buffer.alloc(6); data[0] = 0xb5; data[1] = 0x3e; data.writeFloatLE(value, 2);
  return Buffer.concat([Buffer.from([0x0a, 13, 0x0a, 6]), data, Buffer.from([0x40, 0xfe, 1, 0x48, 21])]);
}

test('optional BK app diagnostics clear stale components and never touch power or energy', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  let handler; let unsubscribed = 0;
  const sn = 'BK61SYNTHETIC0001';
  const app = { subscribeAppRealtime: async (_sn, callback) => { handler = callback; return true; },
    unsubscribeAppRealtime: () => { unsubscribed += 1; } };
  const h = await harness(sn, sn, app);
  h.values.stream_unit_power_pv3 = 123;
  h.values['meter_power.charged'] = 4;
  handler(pvFrame(32), `/app/device/property/${sn}`);
  await h.d.pvChain;
  assert.equal(h.values.stream_unit_pv3_voltage, 32);
  assert.equal(h.caps.has('stream_unit_pv3_current'), false);
  assert.equal(h.values.stream_unit_power_pv3, 123);
  assert.equal(h.values['meter_power.charged'], 4);
  handler(pvFrame(50), '/app/device/property/BK61OTHER0001');
  await h.d.pvChain;
  assert.equal(h.values.stream_unit_pv3_voltage, 32);
  now += 20 * 60 * 1000 + 1;
  h.intervals.get(1)(); await h.d.pvChain;
  assert.equal(h.values.stream_unit_pv3_voltage, null);
  await h.d.onTeardown();
  assert.equal(unsubscribed, 1); assert.equal(h.intervals.size, 0);
  handler(pvFrame(60), `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_pv3_voltage, null);
  await h.d.onReady();
  assert.equal(h.values.stream_unit_pv3_voltage, null);
  assert.deepEqual(h.d.getReadingDiagnostics(), {});
  await h.d.onTeardown();
});

test('BK subscription finishing after teardown is removed and cannot start a watchdog', async () => {
  let release; let unsubscribed = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const sn = 'BK61SYNTHETIC0001';
  const h = await harness(sn);
  h.d.homey.app = { subscribeAppRealtime: () => pending, unsubscribeAppRealtime: () => { unsubscribed += 1; } };
  const init = h.d.startPvDiagnostics(sn);
  await Promise.resolve();
  await h.d.onTeardown();
  release(true); await init;
  assert.ok(unsubscribed >= 1); assert.equal(h.intervals.size, 0);
});

test('REST-only BK unit stays usable without starting an app-diagnostic watchdog', async () => {
  const h = await harness('BK61SYNTHETIC0001', 'BK61SYNTHETIC0001', {
    subscribeAppRealtime: async () => false, unsubscribeAppRealtime() {},
  });
  assert.equal(h.intervals.size, 0);
  assert.equal(h.caps.has('stream_unit_pv3_voltage'), false);
  await h.d.applyQuota({ powGetPv3: 42 });
  assert.equal(h.values.stream_unit_power_pv3, 42);
  await h.d.onTeardown();
});

test('physical unit socket layout follows documented Max and AC model differences', async () => {
  const max = await harness('BK41TEST');
  assert.ok(max.listeners['onoff.ac1']); assert.equal(max.caps.has('onoff.ac2'), false);
  const ac = await harness('BK51TEST');
  assert.equal(ac.caps.has('onoff.ac1'), false); assert.equal(ac.caps.has('onoff.ac2'), false);
  await assert.rejects(ac.d.runControl({ kind: 'ac1', value: true }), /does not support/);
  assert.equal(ac.writes.length, 0);
});

test('main-resolution failure cannot promote a unit into a system controller', async () => {
  const h = await harness('BK31UNITTEST', null);
  assert.equal(h.caps.has('backup_reserve_soc'), false);
  assert.equal(h.listeners.backup_reserve_soc, undefined);
  assert.ok(h.listeners['onoff.ac1']);
  assert.equal(h.writes.length, 0);
});

test('member socket commands use its own serial and fresh relay readback, not system target', async () => {
  const h = await harness('BK31UNITTEST', 'BK61MAINTEST');
  await h.listeners['onoff.ac1'](true);
  assert.deepEqual(h.reads, [
    { target: 'BK31UNITTEST', fields: ['relay2Onoff'] },
    { target: 'BK31UNITTEST', fields: ['relay2Onoff'] },
  ]);
  assert.equal(h.writes[0].sn, 'BK31UNITTEST');
  assert.equal(h.values['onoff.ac1'], true);
  assert.equal(h.listeners.backup_reserve_soc, undefined);
});

test('unapplied socket commands reject with observed state rather than optimistic success', async () => {
  const h = await harness('BK31UNITTEST');
  h.d.writeQuota = async (payload) => { h.writes.push(payload); };
  await assert.rejects(h.listeners['onoff.ac1'](true), /incomplete/);
  assert.equal(h.writes.length, 1); assert.equal(h.values['onoff.ac1'], false);
});

test('main unit reserve uses current readback, never cached discharge tiles', async () => {
  const h = await harness('BK61MAINTEST');
  h.values.discharge_limit = 0;
  h.setState({ cmsMinDsgSoc: 30, backupReverseSoc: 50 });
  await h.listeners.backup_reserve_soc(10);
  assert.equal(h.writes[0].params.cfgMinDsgSoc, 7);
  assert.equal(h.writes[1].params.cfgBackupReverseSoc, 10);
  assert.equal(h.values.backup_reserve_soc, 10);
  await h.d.onTeardown();
});

test('teardown cancels a pending unit control readback and no later command is sent', async () => {
  const h = await harness('BK61MAINTEST');
  let timerFn; let entered;
  const waiting = new Promise((r) => { entered = r; });
  h.d.homey.setTimeout = (fn) => { timerFn = fn; entered(); return 1; };
  const pending = h.listeners.backup_reserve_soc(10);
  await waiting; await h.d.onTeardown();
  await assert.rejects(pending, /incomplete/);
  timerFn(); assert.equal(h.writes.length, 1);
});

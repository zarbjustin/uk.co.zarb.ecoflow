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

async function harness(sn, mainSn = sn) {
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
  d.homey = { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {} };
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
  return { d, caps, values, listeners, writes, reads, setState: (next) => { state = next; } };
}

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

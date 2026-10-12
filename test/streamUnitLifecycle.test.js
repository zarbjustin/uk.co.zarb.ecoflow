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

async function harness(sn, mainSn = sn, app, configure) {
  const d = new StreamUnit();
  const caps = new Set(['onoff.ac1', 'onoff.ac2', 'stream_unit_power_ac1', 'stream_unit_power_ac2']);
  const values = {}; const listeners = {}; const writes = []; const reads = [];
  let state = { relay2Onoff: false, relay3Onoff: false, cmsMinDsgSoc: 0, backupReverseSoc: 20 };
  d.getData = () => ({ sn }); d.getStoreValue = () => undefined;
  d.hasCapability = (cap) => caps.has(cap);
  d.addCapability = async (cap) => caps.add(cap); d.removeCapability = async (cap) => caps.delete(cap);
  d.getCapabilityValue = (cap) => values[cap];
  // Homey does not necessarily return {} for a valid custom capability with
  // no driver/instance options entry. Model that instead of hiding the failure.
  const options = structuredClone(require('../drivers/stream_unit/driver.compose.json').capabilitiesOptions);
  d.getCapabilityOptions = cap => {
    if (!caps.has(cap) || !Object.hasOwn(options, cap)) throw new Error(`Invalid Capability: ${cap}`);
    return structuredClone(options[cap]);
  };
  d.setCapabilityOptions = async (cap, next) => { options[cap] = structuredClone(next); };
  d.setCapabilityValue = async (cap, value) => { values[cap] = value; };
  d.registerCapabilityListener = (cap, callback) => { listeners[cap] = callback; };
  d.setSettings = async () => {}; d.error = () => {};
  d.client = { getMainSn: async () => { if (mainSn === null) throw new Error('offline'); return mainSn; } };
  const intervals = new Map(); let nextInterval = 0;
  d.homey = { app, setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    setInterval: (fn) => { const id = ++nextInterval; intervals.set(id, fn); return id; }, clearInterval: (id) => intervals.delete(id) };
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
  if (configure) configure(d, caps, values, listeners);
  await d.onReady();
  return { d, caps, values, listeners, writes, reads, intervals, setState: (next) => { state = next; } };
}

test('valid original units initialise when Homey rejects options lookup for a custom grid capability', async () => {
  for (const sn of ['BK11SYNTHETIC0001', 'BK31SYNTHETIC0001']) {
    const optionWrites = [];
    const h = await harness(sn, 'ES22SYNTHETIC0001', undefined, d => {
      d.getCapabilityOptions = cap => {
        if (cap === 'stream_unit_power_grid') throw new Error(`Invalid Capability: ${cap}`);
        return {};
      };
      d.setCapabilityOptions = async (cap, options) => optionWrites.push({ cap, options });
    });
    assert.equal(h.caps.has('stream_unit_power_grid'), true);
    assert.equal(optionWrites.some(item => item.cap === 'stream_unit_power_grid'), false,
      'an unreadable existing option must not be replaced with an invented empty default');
    assert.equal(typeof h.listeners['onoff.ac1'], 'function');
    await h.d.applyQuota({ f32ShowSoc: 81, gridConnectionPower: 420 }, { receivedAt: Date.now(), source: 'mqtt' });
    assert.equal(h.values.stream_unit_power_grid, 420);
    assert.equal(h.writes.length, 0, 'startup recovery sends no hardware commands');
    await h.d.onTeardown(); assert.equal(h.intervals.size, 0);
  }
});

test('original Ultra and AC Pro complete init, poll and MQTT startup despite unreadable grid and runtime options', async () => {
  for (const sn of ['BK11SYNTHETIC0001', 'BK31SYNTHETIC0001']) {
    let pollCount = 0; let handler; let available = false; let unsubscribeCount = 0;
    const h = await harness(sn, 'ES22SYNTHETIC0001', undefined, (d, caps) => {
      for (const cap of require('../drivers/stream_unit/driver.compose.json').capabilities) caps.add(cap);
      d.getCapabilityOptions = cap => { throw new Error(`Invalid Capability: ${cap}`); };
      d.getStoreValue = key => (key === 'mainSn' ? 'ES22SYNTHETIC0001' : undefined);
      d.getSetting = () => undefined;
      d.homey.settings = { get: key => ({ accessKey: 'SYNTHETIC_ACCESS', secretKey: 'SYNTHETIC_SECRET' }[key]) };
      d.homey.app = { subscribeRealtime: async (_sn, callback) => { handler = callback; return true; },
        unsubscribeRealtime: () => { unsubscribeCount++; } };
      d.getAvailable = () => available;
      d.setAvailable = async () => { available = true; };
      d.setUnavailable = async () => { available = false; };
      d.log = () => {};
      // Exercise the real lifecycle without connecting to an account or sending commands.
      d.poll = async () => {
        pollCount++;
        await d.applyQuota({ gridConnectionPower: 420 }, { receivedAt: Date.now(), source: 'rest' });
        await d.setOnlineState(true);
      };
    });
    await h.d.onInit();
    assert.equal(pollCount, 1); assert.equal(available, true);
    assert.equal(h.intervals.size, 3, 'poll, runtime and watt freshness have independent timer handles');
    assert.equal(typeof handler, 'function');
    handler({ f32ShowSoc: 80, gridConnectionPower: 421, bmsDsgRemTime: 25 });
    await h.d.queueDeviceWork(async () => {});
    await h.d.applyRemainingTimePower(-400, Date.now());
    assert.equal(h.values.stream_unit_power_grid, 421);
    assert.equal(h.values.discharge_remaining, 25);
    assert.equal(h.values.measure_battery, 80);
    assert.equal(h.caps.has('stream_unit_power_grid'), true);
    assert.equal(h.writes.length, 0);
    await h.d.onUninit();
    assert.equal(unsubscribeCount, 1); assert.equal(h.intervals.size, 0);
  }
});

function pvFrame(value) {
  // Synthetic wrapper: pdata field 998 (float), cmdFunc 254, cmdId 21.
  const data = Buffer.alloc(6); data[0] = 0xb5; data[1] = 0x3e; data.writeFloatLE(value, 2);
  return Buffer.concat([Buffer.from([0x0a, 13, 0x0a, 6]), data, Buffer.from([0x40, 0xfe, 1, 0x48, 21])]);
}

function bmsFrame(charge, discharge, sn) {
  const vi = n => { const b = []; do { b.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(b); };
  const int = (n, v) => Buffer.concat([vi(n * 8), vi(v)]);
  const msg = (n, b) => Buffer.concat([vi(n * 8 + 2), vi(b.length), b]);
  return msg(1, Buffer.concat([msg(1, Buffer.concat([int(26, charge), int(27, discharge)])),
    int(8, 32), int(9, 50), msg(25, Buffer.from(sn))]));
}

test('fresh BMS restores unit flow/state and only matching runtime without borrowing aggregate or cached packets', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const sn = 'BK31SYNTHETIC0001'; let handler;
  const app = { subscribeAppRealtime: async (_sn, fn) => { handler = fn; return true; }, unsubscribeAppRealtime() {} };
  const h = await harness(sn, 'ES22SYNTHETIC0001', app, (_d, caps) => {
    caps.add('charge_remaining'); caps.add('discharge_remaining');
  });
  const discharge = bmsFrame(0, 404, sn);
  await h.d.applyQuota({ powGetBpCms: -440, gridConnectionPower: 403.42, bmsChgRemTime: 5939, bmsDsgRemTime: 168 });
  assert.equal(h.values.stream_unit_power_battery_flow, null);
  assert.equal(h.values.battery_charging_state, null);
  assert.equal(h.values.discharge_remaining, null, 'no same-scope direction yet');
  handler(discharge, `/app/test/${sn}/thing/property/get_reply`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_power_battery_flow, null, 'cached replies cannot revive live pack flow');
  handler(discharge, `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_power_battery_flow, -404);
  assert.equal(h.values.battery_charging_state, 'discharging');
  assert.equal(h.values.discharge_remaining, 168); assert.equal(h.values.charge_remaining, null);
  assert.equal(h.values.stream_unit_power_grid, 403.42, 'DC flow does not overwrite AC connection');
  handler(bmsFrame(300, 0, sn), `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_power_battery_flow, 300);
  assert.equal(h.values.battery_charging_state, 'charging');
  assert.equal(h.values.charge_remaining, 5939); assert.equal(h.values.discharge_remaining, null);
  now += 180001; await h.d.applyQuota({ temp: 30, gridConnectionPower: 400 });
  h.intervals.get(h.d.remainingTimeTimer)(); await h.d.queueDeviceWork(async () => {});
  assert.equal(h.values.stream_unit_power_battery_flow, null); assert.equal(h.values.battery_charging_state, null);
  assert.equal(h.values.charge_remaining, null); assert.equal(h.values.discharge_remaining, null);
  assert.equal(h.writes.length, 0); assert.equal(h.caps.has('measure_power'), false);
  await h.d.onTeardown(); handler(discharge, `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_power_battery_flow, null); assert.equal(h.intervals.size, 0);
});

test('failed BMS power write cannot invent battery state or direction', async () => {
  const sn = 'BK31SYNTHETIC0001'; let handler;
  const app = { subscribeAppRealtime: async (_sn, fn) => { handler = fn; return true; }, unsubscribeAppRealtime() {} };
  const h = await harness(sn, sn, app);
  const write = h.d.setCapabilityValue;
  h.d.setCapabilityValue = async (cap, value) => {
    if (cap === 'stream_unit_power_battery_flow' && value !== null) throw new Error('SDK');
    await write(cap, value);
  };
  handler(bmsFrame(0, 404, sn), `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_power_battery_flow, null); assert.equal(h.values.battery_charging_state, null);
  assert.equal(h.d.getReadingDiagnostics().stream_unit_power_battery_flow.applicationStatus, 'write_failed');
  await h.d.onTeardown();
});

test('AC Pro limit diagnostics use live property packets, not cached replies, and never create controls or PV tiles', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const sn = 'BK31SYNTHETIC0001'; let handler; let subscriptions = 0;
  const app = { subscribeAppRealtime: async (_sn, fn) => { handler = fn; subscriptions++; return true; },
    unsubscribeAppRealtime() {} };
  const h = await harness(sn, sn, app);
  // uint32 property field 521 = 1200; cmdFunc 254 / cmdId 21.
  const frame = Buffer.from([0x0a, 11, 0x0a, 4, 0xc8, 0x20, 0xb0, 9, 0x40, 0xfe, 1, 0x48, 21]);
  handler(frame, `/app/test/${sn}/thing/property/get_reply`); await h.d.pvChain;
  assert.equal(h.d.getLimitDiagnostics().feedGridModePowLimit.value, null);
  handler(frame, `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.d.getLimitDiagnostics().feedGridModePowLimit.value, 1200);
  assert.equal(h.d.getLimitDiagnostics().feedGridModePowLimit.controlEnabled, false);
  assert.equal(subscriptions, 1); assert.equal(h.writes.length, 0);
  assert.ok(![...h.caps].some(cap => /pv\d_voltage|feedGridModePowLimit/.test(cap)));
  now += 180001;
  assert.equal(h.d.getLimitDiagnostics().feedGridModePowLimit.value, null);
  await h.d.onTeardown(); assert.equal(h.d.getLimitDiagnostics().feedGridModePowLimit.value, null);
  handler(frame, `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.d.getLimitDiagnostics().feedGridModePowLimit.value, null);
});

test('original Unit port watts expire independently of SOC updates and recover on explicit zero', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const h = await harness('BK31SYNTHETIC0001');
  await h.d.applyQuota({ gridConnectionPower: 420 }, { receivedAt: now, source: 'mqtt' });
  now += 180001;
  await h.d.applyQuota({ f32ShowSoc: 75 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(h.values.stream_unit_power_grid, null);
  assert.equal(h.d.getReadingDiagnostics().stream_unit_power_grid.stale, true);
  await h.d.applyQuota({ gridConnectionPower: 0 }, { receivedAt: now, source: 'rest' });
  assert.equal(h.values.stream_unit_power_grid, 0);
  assert.equal(h.d.getReadingDiagnostics().stream_unit_power_grid.stale, false);
  assert.equal(h.writes.length, 0);
  await h.d.onTeardown(); assert.equal(h.intervals.size, 0);
});

test('unit correlation renews unchanged applied receipts, drops rejected writes and resets on teardown', async t => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const h = await harness('BK61SYNTHETIC0001');
  h.caps.add('measure_battery'); // Present in the packaged physical-unit driver.
  await h.d.applyQuota({ f32ShowSoc: 81, gridConnectionPower: 421 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(h.d.getUnitCorrelationDiagnostics().gridPortW.value, 421);
  now += 10000;
  await h.d.applyQuota({ gridConnectionPower: 421 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(h.d.getUnitCorrelationDiagnostics().gridPortW.ageSec, 0);
  assert.equal(h.d.getUnitCorrelationDiagnostics().socPct.ageSec, 10);
  const write = h.d.setCapabilityValue;
  h.d.setCapabilityValue = async (cap, value) => {
    if (cap === 'stream_unit_power_grid') throw new Error('PRIVATE SDK failure');
    await write(cap, value);
  };
  await h.d.applyQuota({ gridConnectionPower: 430 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(h.d.getUnitCorrelationDiagnostics().gridPortW, undefined);
  await h.d.onTeardown();
  assert.deepEqual(h.d.getUnitCorrelationDiagnostics(), {});
  assert.equal(h.writes.length, 0, 'diagnostics issue no hardware writes');
});

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
  h.intervals.get(h.d.pvTimer)(); await h.d.pvChain;
  assert.equal(h.values.stream_unit_pv3_voltage, null);
  await h.d.onTeardown();
  assert.equal(unsubscribed, 1); assert.equal(h.intervals.size, 0);
  handler(pvFrame(60), `/app/device/property/${sn}`); await h.d.pvChain;
  assert.equal(h.values.stream_unit_pv3_voltage, null);
  await h.d.onReady();
  assert.equal(h.values.stream_unit_pv3_voltage, null);
  assert.ok(Object.values(h.d.getReadingDiagnostics()).every(field => field.stale === true));
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

test('REST-only BK unit stays usable with the display watchdog but no app-diagnostic subscription', async () => {
  const h = await harness('BK61SYNTHETIC0001', 'BK61SYNTHETIC0001', {
    subscribeAppRealtime: async () => false, unsubscribeAppRealtime() {},
  });
  assert.equal(h.intervals.size, 1);
  assert.equal(h.caps.has('stream_unit_pv3_voltage'), false);
  await h.d.applyQuota({ powGetPv3: 42 });
  assert.equal(h.values.stream_unit_power_pv3, 42);
  await h.d.onTeardown();
});

test('unit remaining estimates clear persisted values, expire independently, and release the local watchdog', async t => {
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  const h = await harness('BK61SYNTHETIC0001');
  h.caps.add('charge_remaining'); h.caps.add('discharge_remaining');
  h.values.discharge_remaining = 999;
  await h.d.startRemainingTime('unit');
  assert.equal(h.values.discharge_remaining, null);
  await h.d.applyRemainingTimePower(-400, now);
  await h.d.applyQuota({ bmsDsgRemTime: 207, bmsChgRemTime: 5939 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(h.values.discharge_remaining, 207);
  now += 180001;
  await h.d.applyQuota({ cmsDsgRemTime: 50, temp: 38 }, { receivedAt: now, source: 'mqtt' });
  assert.equal(h.values.discharge_remaining, null);
  assert.equal(h.values.charge_remaining, null);
  await h.d.applyQuota({ bmsDsgRemTime: 210 }, { receivedAt: now, source: 'mqtt' });
  now += 180001;
  h.intervals.get(h.d.remainingTimeTimer)(); await h.d.queueDeviceWork(async () => {});
  assert.equal(h.values.discharge_remaining, null);
  await h.d.onTeardown();
  assert.equal(h.intervals.size, 0);
  await h.d.applyQuota({ bmsDsgRemTime: 5 });
  assert.equal(h.values.discharge_remaining, null);
});

test('failed startup clearing of a persisted time estimate retries without a telemetry receipt', async () => {
  const h = await harness('BK31SYNTHETIC0001');
  h.caps.add('discharge_remaining'); h.values.discharge_remaining = 999;
  const write = h.d.setCapabilityValue; let fail = true;
  h.d.setCapabilityValue = async (cap, value) => { if (fail) throw new Error('SDK'); await write(cap, value); };
  await h.d.startRemainingTime('unit');
  assert.equal(h.d.getRemainingTimeDiagnostics().discharge_remaining.ageSec, null);
  fail = false; h.intervals.get(h.d.remainingTimeTimer)(); await h.d.queueDeviceWork(async () => {});
  assert.equal(h.values.discharge_remaining, null);
  assert.equal(h.d.getRemainingTimeDiagnostics().discharge_remaining.source, 'unobserved');
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

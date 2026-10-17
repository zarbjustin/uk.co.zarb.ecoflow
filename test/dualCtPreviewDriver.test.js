'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { varint, packet, scalar } = require('./helpers/dualCtSynthetic');
const { DualCtMonitor } = require('../.homeybuild/lib/dualCtMonitor');
const { dualCtAccountBinding, dualCtPreviewDevices, registerDualCtPreviewPairing } = require('../.homeybuild/lib/dualCtPreviewPairing');
const { hasOtherAppAuthDevices } = require('../.homeybuild/lib/appAuthConsumers');
const auth = require('../.homeybuild/lib/appAuthPairing');
const root = path.join(__dirname, '..');
const manifest = require('../drivers/smartmeter_dual_ct_preview/driver.compose.json');
const wording = require('../locales/en.json').dual_ct_preview;
const text = key => wording[key] || key;
const sessionInfo = { host: 'https://api-e.ecoflow.com', userId: 'SYNTHETIC-ACCOUNT' };
const sn = 'DUALCTSYNTHETIC01';
const deviceRow = { sn, shared: false, productName: '421', modelCodes: [{ field: 'productType', code: 421 }] };
const msg = (field, data) => Buffer.concat([varint(field * 8 + 2), varint(data.length), data]);
const int = (field, value) => Buffer.concat([varint(field * 8), varint(value)]);
function frame(bytes = packet(1, [[1, -40], [2, 20], [3, 70], [4, 150], [6, 100], [7, 50]]), options = {}) {
  return msg(1, Buffer.concat([msg(1, bytes), ...(options.omitted ? [] : [int(6, options.encoding || 0)]),
    int(8, 254), int(9, 21), ...(options.sn ? [msg(25, Buffer.from(options.sn))] : [])]));
}
const topic = `/app/device/property/${sn}`;
const scope = { account: 'synthetic-account', device: sn, session: 'synthetic-session' };

test('continuous preview displays community-observed phase units but keeps totals/counters raw and accounting isolated', () => {
  const monitor = new DualCtMonitor(scope);
  assert.equal(monitor.observe(frame(), topic, 1000), true);
  let view = monitor.snapshot(1000, text);
  assert.equal(view.recent, true); assert.equal(view.values['dual_ct_preview_total.a'], 2);
  assert.equal(view.values['dual_ct_preview_total.b'], 22);
  assert.match(view.values['dual_ct_preview_fields.a_power'], /772: -1/);
  assert.match(view.values['dual_ct_preview_fields.a_power'], /772: -1\.0 W/);
  assert.match(view.values['dual_ct_preview_fields.b_voltage'], /985: 230\.0 V/);
  assert.match(view.values['dual_ct_preview_fields.b_current'], /988: 0\.500 A/);
  assert.match(view.values.dual_ct_preview_counters, /773.1: -40/);
  assert.doesNotMatch(JSON.stringify(view), /kWh|"measure_power"|"meter_power"|CT1|SYNTHETIC/);
  assert.equal(monitor.observe(frame(packet(2, [[1, -41], [4, 150]]), { omitted: true }), topic, 2000), true);
  view = monitor.snapshot(2000, text);
  assert.match(view.values.dual_ct_preview_trends, /1: decreased \(not a confirmed reset\)/);
  assert.match(view.values.dual_ct_preview_trends, /4: unchanged/);
  assert.equal(monitor.observe(frame(Buffer.concat([scalar(956, 0), scalar(957, 0)])), topic, 90000), true);
  view = monitor.snapshot(92000, text);
  assert.equal(view.values['dual_ct_preview_total.a'], null);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'], /956: 0/);
  assert.match(view.values['dual_ct_preview_fields.a_power'], /stale/);
  assert.match(view.values.dual_ct_preview_counters, /Not observed or stale/);
  assert.equal(view.nextExpiryMs, 88000);
  assert.equal(monitor.snapshot(180000, text).recent, false);
});

test('monitor accepts only owned-topic live bounded headers and never interprets record 997 as counters', () => {
  const monitor = new DualCtMonitor(scope);
  for (const [payload, route] of [[frame(), topic + '/get_reply'], [frame(), topic.replace(sn, 'OTHERDEVICE')],
    [frame(packet(), { encoding: 1 }), topic], [frame(packet(), { sn: 'OTHERDEVICE' }), topic],
    [Buffer.alloc(65537), topic], [Buffer.from('{}'), topic]]) assert.equal(monitor.observe(payload, route, 1000), false);
  assert.equal(monitor.observe(frame(packet(), { omitted: true }), topic, 1000), true);
  assert.equal(monitor.observe(frame(packet(9)), topic, 1000), false, 'equal-time receipt order is unknown');
  const counter997 = msg(997, scalar(1, 123456));
  assert.equal(monitor.observe(frame(Buffer.concat([packet(), counter997])), topic, 2000), true);
  assert.doesNotMatch(JSON.stringify(monitor.snapshot(2000, text)), /123456/);
  monitor.snapshot(1999, text);
  assert.equal(monitor.snapshot(2001, text).values['dual_ct_preview_total.a'], null, 'clock rollback clears all caches');
  monitor.observe(frame(), topic, 3000); monitor.clear();
  assert.equal(monitor.snapshot(3001, text).recent, false);
});

test('preview discovery requires owned explicit metadata AND productType 421, with no serial-prefix or custom-name guessing', () => {
  const rejected = [{ ...deviceRow, shared: true }, { ...deviceRow, sn: 'bad/topic' },
    { ...deviceRow, modelCodes: [] }, { ...deviceRow, productName: 'Other product' },
    { ...deviceRow, productName: 'Smart Meter', name: 'Dual CT' },
    { ...deviceRow, modelCodes: [{ field: 'productType', code: 422 }] }];
  assert.deepEqual(dualCtPreviewDevices(rejected), []);
  assert.equal(dualCtPreviewDevices([deviceRow, deviceRow]).length, 1);
  assert.equal(dualCtPreviewDevices([1, 2, 3].map(n => ({ ...deviceRow, sn: sn + n }))).length, 3);
  assert.equal(dualCtAccountBinding(sessionInfo), dualCtAccountBinding({ ...sessionInfo }));
  assert.notEqual(dualCtAccountBinding(sessionInfo), dualCtAccountBinding({ ...sessionInfo, userId: 'OTHER' }));
  for (const bad of [{ host: 'https://untrusted.invalid', userId: 'x' }, { ...sessionInfo, userId: '' }]) {
    assert.throws(() => dualCtAccountBinding(bad));
  }
});

test('pairing is explicitly consented, filters duplicates and commits credentials only for an admitted Add', async () => {
  const original = auth.registerAppAuthHandlers; const handlers = new Map(); let commits = 0; let lists = 0;
  auth.registerAppAuthHandlers = () => ({ getClient: () => ({ getSession: async () => sessionInfo,
    getDeviceList: async () => { lists++; return [deviceRow, { ...deviceRow, sn: sn + '2' }]; } }), commit: () => commits++ });
  try {
    registerDualCtPreviewPairing({ homey: { __: key => key }, getDevices: () => [{ getData: () => ({ sn }) }] },
      { setHandler: (name, fn) => handlers.set(name, fn) });
    await assert.rejects(handlers.get('list_devices')()); assert.equal(lists, 0);
    await handlers.get('dual_ct_preview_consent')({ accepted: 'true' });
    await assert.rejects(handlers.get('list_devices')());
    await handlers.get('dual_ct_preview_consent')({ accepted: true });
    const rows = await handlers.get('list_devices')();
    assert.equal(rows.length, 1); assert.equal(rows[0].data.sn, sn + '2');
    assert.equal(rows[0].store.dualCtPreviewConsent, 1); assert.equal(rows[0].settings.preview_enabled, true);
    assert.doesNotMatch(JSON.stringify(rows), /SYNTHETIC-ACCOUNT|password|token/);
    assert.equal(commits, 0);
    await assert.rejects(handlers.get('add_device')({ data: { sn: 'FOREIGNDEVICE' } }));
    await handlers.get('add_device')(rows[0]); assert.equal(commits, 1);
    await handlers.get('dual_ct_preview_consent')({ accepted: false });
    await assert.rejects(handlers.get('add_device')(rows[0])); assert.equal(commits, 1);
  } finally { auth.registerAppAuthHandlers = original; }
});

test('late pairing lists and a changed account cannot save credentials or admit an old selection', async () => {
  const original = auth.registerAppAuthHandlers; const handlers = new Map(); let release; let account = sessionInfo; let disposed = 0;
  let pending = true;
  auth.registerAppAuthHandlers = () => ({ getClient: () => ({ getSession: async () => account,
    getDeviceList: async () => pending ? new Promise(resolve => { release = resolve; }) : [deviceRow] }),
  commit: () => assert.fail('stale pairing cannot commit'), dispose: () => disposed++ });
  try {
    registerDualCtPreviewPairing({ homey: { __: key => key }, getDevices: () => [] }, { setHandler: (key, fn) => handlers.set(key, fn) });
    await handlers.get('dual_ct_preview_consent')({ accepted: true });
    const listing = handlers.get('list_devices')(); await new Promise(resolve => setImmediate(resolve));
    await handlers.get('disconnect')(); release([deviceRow]); assert.deepEqual(await listing, []); assert.equal(disposed, 1);
    pending = false; await handlers.get('dual_ct_preview_consent')({ accepted: true });
    const rows = await handlers.get('list_devices')();
    account = { ...sessionInfo, userId: 'OTHER' };
    await assert.rejects(handlers.get('add_device')(rows[0]));
  } finally { auth.registerAppAuthHandlers = original; }
});

let PreviewDevice;
const originalLoad = Module._load;
try {
  Module._load = function (request, ...args) {
    if (request === 'homey') return { Device: class {} };
    return originalLoad.call(this, request, ...args);
  };
  PreviewDevice = require('../.homeybuild/drivers/smartmeter_dual_ct_preview/device');
} finally { Module._load = originalLoad; }

function harness(options = {}) {
  const device = new PreviewDevice(); const settings = new EventEmitter();
  const values = new Map(manifest.capabilities.map(id => [id, 99999])); const timers = new Map();
  const handlers = new Set(); const writes = []; let timerId = 0;
  const stored = { dualCtPreviewConsent: 1, dualCtAccountBinding: dualCtAccountBinding(sessionInfo), ...options.store };
  const settingValues = { appAuthEmail: 'tester@example.invalid', appAuthPassword: 'fake', preview_enabled: options.enabled !== false };
  settings.get = key => settingValues[key]; settings.unset = key => { delete settingValues[key]; settings.emit('unset', key); };
  device.homey = { settings, __: key => key.split('.').reduce((o, part) => o?.[part], require('../locales/en.json')) || key,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { timers.set(++timerId, { fn, ms, interval: true }); return timerId; }, clearInterval: id => timers.delete(id),
    app: { subscribeAppRealtime: async (_sn, handler, active) => {
      if (options.pending) await options.pending;
      if (!active()) return false;
      handlers.add(handler); return options.subscription !== false;
    }, unsubscribeAppRealtime: (_sn, handler) => handlers.delete(handler) },
    drivers: { getDriver: () => ({ getDevices: () => options.other ? [options.other] : [device] }) },
  };
  device.getData = () => ({ sn }); device.getSetting = key => settingValues[key];
  device.getStoreValue = key => stored[key]; device.getCapabilities = () => [...values.keys()];
  device.hasCapability = id => values.has(id);
  device.addCapability = async id => { values.set(id, null); };
  device.setCapabilityOptions = async () => {};
  device.getCapabilityValue = id => values.get(id);
  device.setCapabilityValue = async (id, value) => { writes.push([id, value]); values.set(id, value); };
  device.setAvailable = async () => { device.available = true; };
  device.setUnavailable = async message => { device.available = false; device.unavailable = message; };
  device.setWarning = async message => { device.warning = message; };
  return { device, values, timers, handlers, writes, settings, settingValues };
}

test('existing preview upgrades additively without re-pairing, lost identifiers or persisted numeric reuse', async () => {
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => ({ getSession: async () => sessionInfo, getDeviceList: async () => [deviceRow] });
  const h = harness(); const added = []; const capabilityOptions = new Map();
  h.device.setCapabilityOptions = async (id, options) => { capabilityOptions.set(id, options); };
  for (const id of [...h.values.keys()]) if (/dual_ct_preview_(power|voltage|current|net|net_status)\./.test(id)) h.values.delete(id);
  const oldIds = [...h.values.keys()];
  h.device.addCapability = async id => { added.push(id); h.values.set(id, 99999); };
  try {
    await h.device.onInit(); await h.device.chain;
    assert.equal(added.length, 22); assert.equal(h.handlers.size, 1);
    assert.equal(capabilityOptions.size, manifest.capabilities.length);
    assert.equal(capabilityOptions.get('dual_ct_preview_power.a_p1').title.en, 'CT1 phase 1 power');
    assert.equal(capabilityOptions.get('dual_ct_preview_net.b').preventTag, true);
    for (const id of [...oldIds, ...added]) assert.ok(h.values.has(id));
    for (const id of added) assert.notEqual(h.values.get(id), 99999);
    const handler = [...h.handlers][0]; handler(frame(), topic); await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_power.a_p1'), 1);
    await h.device.onUninit();
    assert.ok(added.every(id => h.values.get(id) === null));
    await h.device.onInit(); assert.equal(added.length, 22, 'upgrade is idempotent');
  } finally { await h.device.onUninit(); auth.appAuthClientFromSettings = original; }
});

test('capability upgrade failure or teardown during a delayed upgrade cannot start monitoring', async () => {
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => assert.fail('unfinished upgrade must not read account or subscribe');
  try {
    const failed = harness(); failed.values.delete('dual_ct_preview_power.a_p1');
    failed.device.addCapability = async () => { throw new Error('synthetic failure'); };
    await failed.device.onInit(); assert.equal(failed.handlers.size, 0); assert.equal(failed.timers.size, 0);
    assert.equal(failed.device.getDualCtPreviewDiagnostics().status, 'display_failed');
    await assert.rejects(failed.device.onSettings({ changedKeys: ['preview_enabled'], newSettings: { preview_enabled: true } }), /display update failed/);
    assert.equal(failed.handlers.size, 0, 'explicit enable cannot bypass a failed upgrade');
    await failed.device.onUninit();
    const h = harness(); h.values.delete('dual_ct_preview_power.a_p1'); let release;
    const pending = new Promise(resolve => { release = resolve; });
    h.device.addCapability = async id => { await pending; h.values.set(id, 99999); };
    const init = h.device.onInit(); await new Promise(resolve => setImmediate(resolve));
    const stop = h.device.onUninit(); release(); await Promise.all([init, stop]);
    assert.equal(h.handlers.size, 0); assert.equal(h.timers.size, 0);
    assert.equal(h.values.get('dual_ct_preview_power.a_p1'), null);
  } finally { auth.appAuthClientFromSettings = original; }
});

test('circuit description settings change only text, keep existing subscription, and cannot revive disabled readings', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => ({ getSession: async () => sessionInfo, getDeviceList: async () => [deviceRow] });
  const h = harness();
  try {
    await h.device.onInit(); const handler = [...h.handlers][0]; handler(frame(), topic); await h.device.chain;
    const power = h.values.get('dual_ct_preview_power.b_p1');
    const before = h.device.getDualCtPreviewDiagnostics();
    await h.device.onSettings({ changedKeys: ['ct1_role', 'ct2_role'], newSettings: { ct1_role: 'grid', ct2_role: 'hybrid_inverter' } });
    await h.device.chain;
    assert.ok(h.values.get('dual_ct_preview_net_status.b').includes(text('role_hybrid_inverter')));
    assert.equal(h.values.get('dual_ct_preview_power.b_p1'), power);
    assert.deepEqual(h.device.getDualCtPreviewDiagnostics(), before);
    assert.deepEqual([...h.handlers], [handler]);
    await h.device.onSettings({ changedKeys: ['preview_enabled'], newSettings: { preview_enabled: false } });
    await h.device.onSettings({ changedKeys: ['ct2_role'], newSettings: { ct1_role: 'grid', ct2_role: 'solar_inverter' } });
    await h.device.chain;
    assert.equal(h.handlers.size, 0); assert.equal(h.values.get('dual_ct_preview_net_status.b'), null);
    assert.equal(h.values.get('dual_ct_preview_power.b_p1'), null);
  } finally { await h.device.onUninit(); auth.appAuthClientFromSettings = original; }
});

test('paired preview clears persisted values, renders telemetry, expires per field and detaches without commands or stores', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => ({ getSession: async () => sessionInfo, getDeviceList: async () => [deviceRow] });
  const h = harness();
  try {
    await h.device.onInit(); await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_total.a'), null);
    assert.equal(h.handlers.size, 1); assert.equal(h.device.available, false);
    const handler = [...h.handlers][0]; handler(frame(), topic); await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_total.a'), 2); assert.equal(h.device.available, true);
    t.mock.timers.tick(89000);
    handler(frame(Buffer.concat([scalar(956, 240), scalar(957, 241)])), topic); await h.device.chain;
    t.mock.timers.tick(1000);
    const expiry = [...h.timers].find(([, timer]) => timer.ms === 1000); assert.ok(expiry);
    h.timers.delete(expiry[0]); expiry[1].fn(); await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_total.a'), null);
    assert.match(h.values.get('dual_ct_preview_fields.a_voltage'), /956: 240/);
    h.settings.emit('set', 'appAuthEmail'); await h.device.chain;
    assert.equal(h.handlers.size, 0); assert.equal(h.timers.size, 0);
    assert.equal(h.values.get('dual_ct_preview_total.a'), null);
    handler(frame(packet(99)), topic); await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_total.a'), null, 'late old-account frames cannot restore readings');
    assert.match(h.device.unavailable, /Account changed/);
    await h.device.onSettings({ changedKeys: ['preview_enabled'], newSettings: { preview_enabled: false } });
    await h.device.onSettings({ changedKeys: ['preview_enabled'], newSettings: { preview_enabled: true } });
    await h.device.chain;
    assert.equal(h.handlers.size, 1); assert.equal(h.values.get('dual_ct_preview_total.a'), null);
    const resumed = [...h.handlers][0]; assert.notEqual(resumed, handler);
    resumed(frame(packet(4)), topic); await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_total.a'), 5);
    assert.equal(h.device.getDualCtPreviewDiagnostics().acceptedPackets, 1, 'explicit re-enable creates a fresh scope');
  } finally { await h.device.onUninit(); auth.appAuthClientFromSettings = original; }
});

test('opt-out, missing consent, changed account and ambiguous model never subscribe', async () => {
  const original = auth.appAuthClientFromSettings;
  try {
    for (const scenario of ['disabled', 'consent', 'account', 'model']) {
      auth.appAuthClientFromSettings = () => ({ getSession: async () => scenario === 'account' ? { ...sessionInfo, userId: 'OTHER' } : sessionInfo,
        getDeviceList: async () => scenario === 'model' ? [{ ...deviceRow, modelCodes: [] }] : [deviceRow] });
      const h = harness({ enabled: scenario !== 'disabled', store: scenario === 'consent' ? { dualCtPreviewConsent: 0 } : {} });
      await h.device.onInit(); await h.device.chain;
      assert.equal(h.handlers.size, 0, scenario); assert.equal(h.timers.size, 0, scenario);
      assert.equal(h.values.get('dual_ct_preview_total.a'), null, scenario);
      if (['disabled', 'consent'].includes(scenario)) assert.equal(h.device.getDualCtPreviewDiagnostics().status, 'disabled');
      await h.device.onUninit();
    }
  } finally { auth.appAuthClientFromSettings = original; }
});

test('stopping during slow subscription rejects late attachment; retry is bounded and cancelled on disable', async () => {
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => ({ getSession: async () => sessionInfo, getDeviceList: async () => [deviceRow] });
  try {
    let release; const pending = new Promise(resolve => { release = resolve; }); const h = harness({ pending });
    const init = h.device.onInit(); await new Promise(resolve => setImmediate(resolve));
    await h.device.onUninit(); release(); await init;
    assert.equal(h.handlers.size, 0); assert.equal(h.timers.size, 0);
    const failed = harness({ subscription: false }); await failed.device.onInit();
    assert.equal(failed.handlers.size, 0);
    assert.ok([...failed.timers.values()].some(timer => timer.ms === 30000));
    await failed.device.onSettings({ changedKeys: ['preview_enabled'], newSettings: { preview_enabled: false } });
    assert.equal(failed.timers.size, 0); await failed.device.onUninit();
  } finally { auth.appAuthClientFromSettings = original; }
});

test('shared credentials survive deletion of either a battery or preview while another consumer exists', async () => {
  const preview = { getData: () => ({ sn }) }; const battery = { getData: () => ({ sn: 'ES22SYNTHETIC01' }) };
  assert.equal(hasOtherAppAuthDevices({ drivers: { getDriver: id => ({ getDevices: () => id === 'smartmeter_dual_ct_preview' ? [preview] : [battery] }) } }, battery), true);
  assert.equal(hasOtherAppAuthDevices({ drivers: { getDriver: () => ({ getDevices: () => { throw new Error('unavailable'); } }) } }, battery), true);
  assert.equal(hasOtherAppAuthDevices({ drivers: { getDriver: id => ({ getDevices: () => id === 'stream_unit' ? [battery] : [] }) } }, preview), true,
    'original STREAM PV telemetry must retain the shared app credentials too');
  const h = harness({ enabled: false, other: battery }); await h.device.onInit(); await h.device.onDeleted();
  assert.equal(h.settingValues.appAuthPassword, 'fake');
});

test('uninit during initial capability clearing cannot resume monitoring after a late startup continuation', async () => {
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => assert.fail('cancelled startup must not read the account');
  const h = harness(); const write = h.device.setCapabilityValue; let release;
  const pending = new Promise(resolve => { release = resolve; }); let first = true;
  h.device.setCapabilityValue = async (...args) => { if (first) { first = false; await pending; } await write(...args); };
  try {
    const init = h.device.onInit(); await new Promise(resolve => setImmediate(resolve));
    const uninit = h.device.onUninit(); release(); await Promise.all([init, uninit]);
    assert.equal(h.handlers.size, 0); assert.equal(h.timers.size, 0);
    assert.equal(h.settings.listenerCount('set'), 0);
  } finally { auth.appAuthClientFromSettings = original; }
});

test('a delayed connection-failure display cannot schedule a retry after disable', async () => {
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => ({ getSession: async () => sessionInfo, getDeviceList: async () => [deviceRow] });
  const h = harness({ subscription: false }); const unavailable = h.device.setUnavailable; let release;
  const pending = new Promise(resolve => { release = resolve; });
  h.device.setUnavailable = async message => { if (message === text('connection_failed')) await pending; await unavailable(message); };
  try {
    const init = h.device.onInit(); await new Promise(resolve => setImmediate(resolve));
    const disable = h.device.onSettings({ changedKeys: ['preview_enabled'], newSettings: { preview_enabled: false } });
    release(); await Promise.all([init, disable]);
    assert.equal(h.timers.size, 0); assert.equal(h.handlers.size, 0);
  } finally { await h.device.onUninit(); auth.appAuthClientFromSettings = original; }
});

test('burst telemetry coalesces pending display work and display failures remain unavailable until a successful render', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const original = auth.appAuthClientFromSettings;
  auth.appAuthClientFromSettings = () => ({ getSession: async () => sessionInfo, getDeviceList: async () => [deviceRow] });
  const h = harness();
  try {
    await h.device.onInit(); await h.device.chain; h.writes.length = 0;
    const handler = [...h.handlers][0];
    for (let n = 1; n <= 100; n++) { t.mock.timers.tick(1); handler(frame(packet(n)), topic); }
    await h.device.chain;
    assert.equal(h.values.get('dual_ct_preview_total.a'), 101);
    assert.ok(h.writes.length <= manifest.capabilities.length, 'only the latest bounded projection is pending');
    const write = h.device.setCapabilityValue; let fail = true;
    h.device.setCapabilityValue = async (id, value) => { if (fail && id === 'dual_ct_preview_total.a') throw new Error('PRIVATE'); await write(id, value); };
    t.mock.timers.tick(1); handler(frame(packet(101)), topic); await h.device.chain;
    assert.equal(h.device.available, false); assert.match(h.device.unavailable, /display update failed/);
    assert.equal(h.device.getDualCtPreviewDiagnostics().status, 'display_failed');
    fail = false;
    [...h.timers.values()].find(timer => timer.interval).fn(); await h.device.chain;
    assert.equal(h.device.available, true); assert.equal(h.values.get('dual_ct_preview_total.a'), 102);
  } finally { await h.device.onUninit(); auth.appAuthClientFromSettings = original; }
});

test('ordinary support export contains preview health but never preview numbers, bindings, raw data or credentials', () => {
  const { createSupportSnapshot } = require('../.homeybuild/lib/supportSnapshot');
  const report = createSupportSnapshot({ manifest: { version: '1.10.51' }, drivers: { getDriver: id => {
    if (id !== 'smartmeter_dual_ct_preview') throw new Error('absent');
    return { getDevices: () => [{ getDualCtPreviewDiagnostics: () => ({ enabled: true, status: 'recent', acceptedPackets: 59,
      lastReceiptAgeSec: 1, value: 1234567, account: 'PRIVATE', device: 'PRIVATE', raw: 'PRIVATE', contributesToEnergy: true }) }] };
  } } });
  assert.equal(report.schemaVersion, 17); assert.equal(report.dualCtPreviews[0].acceptedPackets, 59);
  assert.equal(report.dualCtPreviews[0].valuesIncluded, false);
  assert.equal(report.dualCtPreviews[0].contributesToEnergy, false);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|1234567/);
});

test('pairing consent screen is explicit and responsive on desktop/mobile, with no discovery before consent', async () => {
  const { chromium } = require('playwright'); const { pathToFileURL } = require('node:url');
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(translations => {
        window.calls = []; window.next = null;
        window.Homey = { __: key => key.split('.').reduce((o, part) => o?.[part], translations) || key,
          emit: (name, data, callback) => { window.calls.push({ name, data }); callback(null, name === 'check_app_credentials' || data?.accepted === true); },
          showView: id => { window.next = id; } };
      }, require('../locales/en.json'));
      await page.goto(pathToFileURL(path.join(root, 'drivers/smartmeter_dual_ct_preview/pair/preview_consent.html')).href);
      assert.equal(await page.locator('#continue').isDisabled(), true);
      assert.equal(await page.evaluate(() => window.calls.length), 0);
      assert.match(await page.locator('#privacy').innerText(), /continuous read-only monitoring/);
      assert.match(await page.locator('#warning').innerText(), /not verified measurements/);
      await page.locator('#consent').check();
      await page.screenshot({ path: `/tmp/ecoflow-dualct-preview-pair-${width}.png` });
      await page.locator('#continue').click();
      assert.deepEqual(await page.evaluate(() => window.calls.map(call => call.name)), ['dual_ct_preview_consent', 'check_app_credentials']);
      assert.equal(await page.evaluate(() => window.next), 'list_devices');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('preview manifest has no standard power, energy, control, tags, Insights or Flow declarations; original meter is unchanged', () => {
  assert.equal(manifest.class, 'other'); assert.equal(manifest.energy, undefined); assert.equal(manifest.flow, undefined);
  assert.ok(manifest.capabilities.every(id => id.startsWith('dual_ct_preview_')));
  for (const id of manifest.capabilities) {
    const definition = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/capabilities', id.split('.')[0] + '.json')));
    assert.equal(definition.getable, true); assert.equal(definition.setable, false); assert.equal(definition.insights, false);
    assert.equal(manifest.capabilitiesOptions[id].preventTag, true); assert.equal(manifest.capabilitiesOptions[id].preventInsights, true);
    if (/dual_ct_preview_(power|net)\./.test(id)) assert.equal(definition.units, 'W');
    else if (/dual_ct_preview_voltage\./.test(id)) assert.equal(definition.units, 'V');
    else if (/dual_ct_preview_current\./.test(id)) assert.equal(definition.units, 'A');
    else if (id !== 'dual_ct_preview_age') assert.equal(definition.units, undefined);
  }
  assert.equal(manifest.settings[0].value, false);
  for (const size of ['small', 'large', 'xlarge']) {
    assert.deepEqual(fs.readFileSync(path.join(root, manifest.images[size])),
      fs.readFileSync(path.join(root, 'docs/assets/smart-meter-dual-ct/store-photo', size + '.png')));
  }
  assert.equal(require('../drivers/smartmeter/driver.compose.json').energy.cumulativeImportedCapability, 'meter_power.imported');
  for (const language of ['en', 'de', 'nl']) {
    const locale = require(`../locales/${language}.json`).dual_ct_preview;
    for (const key of Object.keys(wording)) assert.equal(typeof locale[key], 'string', language + ':' + key);
  }
});

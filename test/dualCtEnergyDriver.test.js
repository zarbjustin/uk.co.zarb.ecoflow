'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { varint, scalar } = require('./helpers/dualCtSynthetic');
const { DualCtHomeyEnergyContext } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
const { makeDualCtEnergyCheckpoint, DUAL_CT_ENERGY_CHECKPOINT_KEY } = require('../.homeybuild/lib/dualCtEnergyCheckpoint');
const { dualCtGridBinding } = require('../.homeybuild/lib/dualCtGridEnergySource');
const { dualCtAccountBinding } = require('../.homeybuild/lib/dualCtPreviewPairing');
const { DualCtMonitor } = require('../.homeybuild/lib/dualCtMonitor');
const sn = 'DUALCTSYNTHETIC01'; const account = { host: 'https://api.ecoflow.com', userId: 'synthetic' };
const identity = { productType: 421, firmware: 'synthetic.1' };
const contract = { id: 'synthetic_contract', ...identity, channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive',
  timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
const binding = dualCtGridBinding({ account: dualCtAccountBinding(account), device: sn, grid: 'homey_property_grid', session: 'one' }, contract);
const nested = (f, bytes) => Buffer.concat([varint(f * 8 + 2), varint(bytes.length), bytes]);
const int = (f, n) => Buffer.concat([varint(f * 8), varint(n)]);
let sequence = 0;
const payload = (watts, explicitEncoding = true, packetSequence = ++sequence) => nested(1, Buffer.concat([nested(1, Buffer.concat([[962, watts], [963, 0], [772, 0], [515, watts],
  [991, 900000], [992, 900000], [993, 900000]].map(([f, n]) => scalar(f, n)))), ...(explicitEncoding ? [int(6, 0)] : []), int(8, 254), int(9, 21), int(14, packetSequence)]));
class Device {
  constructor() {
    this.values = new Map([['measure_power', 99], ['meter_power.imported', null], ['meter_power.exported', null]]);
    this.store = new Map(Object.entries({ dualCtEnergyConsent: 1, dualCtEnergySourceBinding: binding,
      dualCtEnergyAccountBinding: dualCtAccountBinding(account), dualCtEnergyGrid: 'homey_property_grid' }));
    this.capOptions = new Map(); this.displaySettings = {};
    this.writes = []; this.timers = new Map(); this.subscriptions = []; this.detached = [];
    const settings = new EventEmitter(); settings.get = () => null;
    const deliveries = new Map();
    this.homey = { settings, __: () => 'Energy source unavailable',
      app: { subscribeAppRealtime: async (_sn, handler) => { const delivered = (payload, topic, metadata = { receivedAt: Date.now(), receivedMonoMs: Date.now(), retained: false, duplicate: false }) => handler(payload, topic, metadata); deliveries.set(handler, delivered); this.subscriptions.push(delivered); return true; },
        unsubscribeAppRealtime: (_sn, handler) => this.detached.push(deliveries.get(handler) || handler) },
      setInterval: (fn, ms) => { const id = Symbol(); this.timers.set(id, { fn, ms, interval: true }); return id; },
      clearInterval: id => this.timers.delete(id), setTimeout: (fn, ms) => { const id = Symbol(); this.timers.set(id, { fn, ms, interval: false }); return id; },
      clearTimeout: id => this.timers.delete(id) };
  }
  getData() { return { sn }; }
  getCapabilityValue(key) { return this.values.get(key); }
  getStoreValue(key) { return this.store.get(key); }
  async setStoreValue(key, value) { this.writes.push(['store', key]); this.store.set(key, value); }
  async setCapabilityValue(id, value) { this.writes.push(['cap', id, value]); this.values.set(id, value); }
  hasCapability(id) { return this.values.has(id); }
  async addCapability(id) { this.values.set(id, null); }
  getCapabilityOptions(id) { return this.capOptions.get(id); }
  getSetting(id) { return this.displaySettings[id]; }
  async setSettings(values) { Object.assign(this.displaySettings, values); }
  async setCapabilityOptions(id, options) { this.capOptions.set(id, options); }
  async setEnergy(value) { this.writes.push(['energy', value]); }
  async setUnavailable() { this.available = false; }
  async setAvailable() { this.available = true; }
}
const originalLoad = Module._load;
let Driver;
try { Module._load = function (name, ...args) { return name === 'homey' ? { Device } : originalLoad.call(this, name, ...args); };
  Driver = require('../.homeybuild/drivers/smartmeter_dual_ct_energy/device');
} finally { Module._load = originalLoad; }
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
function enabled(device) {
  device.energyDependencies = () => ({ enabled: () => true, resolve: () => contract,
    context: () => new DualCtHomeyEnergyContext({ homey: device.homey, sn, now: Date.now,
      client: () => ({ getSession: async () => account, getDeviceList: async () => [{ sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] }] }),
      readFirmware: async () => identity.firmware, reader: async () => ({ list: async () => ({}), close() {} }) }) });
}
function enabledCommunity(device) {
  const { DualCtCommunityTrial } = require('../.homeybuild/lib/dualCtCommunityTrial');
  const prod = { productType: 421, firmware: '1.0.0.41' }; const trial = new DualCtCommunityTrial(Date.now);
  trial.refresh({ account: dualCtAccountBinding(account), device: sn, grid: 'homey_property_grid', identity: prod, identityObservedAt: Date.now(), owned: true });
  device.store.set('dualCtEnergyMode', 'three_phase_community');
  device.store.set('dualCtEnergySourceBinding', dualCtGridBinding({ account: dualCtAccountBinding(account), device: sn, grid: 'homey_property_grid', session: 'one' }, trial.resolve(prod)));
  device.energyDependencies = () => ({ enabled: () => true, resolve: () => { throw Error('legacy resolver must not admit trial'); },
    context: () => new DualCtHomeyEnergyContext({ homey: device.homey, sn, communityThreePhase: true, now: Date.now,
      client: () => ({ getSession: async () => account, getDeviceList: async () => [{ sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] }] }),
      readFirmware: async () => prod.firmware, reader: async () => ({ list: async () => ({}), close() {} }) }) });
}
function optionalDetailsHarness() {
  const { DualCtEnergyDetails } = require('../.homeybuild/lib/dualCtEnergyDetails');
  const { DUAL_CT_ENERGY_DETAIL_CAPABILITIES } = require('../.homeybuild/lib/dualCtDisplaySettings');
  let now = 1000;
  const values = new Map(DUAL_CT_ENERGY_DETAIL_CAPABILITIES.map(id => [id, null]));
  const calls = [];
  const port = {
    hasCapability: id => values.has(id), getCapabilityValue: id => values.get(id),
    setCapabilityValue: async (id, value) => { calls.push([id, value]); values.set(id, value); },
  };
  const details = new DualCtEnergyDetails(port, () => now);
  const scope = { account: 'synthetic', device: sn, session: 'optional' };
  details.start(scope);
  return { details, port, values, calls, scope, now: value => { now = value; },
    observe(fields) {
      const bytes = nested(1, Buffer.concat([nested(1, Buffer.concat(fields.map(([f, v]) => scalar(f, v)))),
        int(6, 0), int(8, 254), int(9, 21)]));
      details.observe(bytes, `/app/device/property/${sn}`,
        { receivedAt: now, receivedMonoMs: now, retained: false, duplicate: false }, now);
    } };
}
function deferredSdk() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('follow-on optional partial-field expiry bypasses a held sibling SDK write and isolates clear failures', async () => {
  const h = optionalDetailsHarness();
  h.observe([[962, 100], [956, 230], [957, 230]]); await h.details.render();
  const entered = deferredSdk(); const release = deferredSdk(); const write = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'dual_ct_preview_power.a_p1' && value === 200) { entered.resolve(); await release.promise; }
    return write(id, value);
  };
  h.now(2000); h.observe([[962, 200]]); await entered.promise;
  h.now(91000); h.observe([[957, 240]]); const expired = h.details.render();
  try {
    await settle();
    assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'), null);
    assert.equal(h.values.get('dual_ct_preview_voltage.a_p2'), 240);
    const before = h.calls.length;
    for (let i = 0; i < 100; i++) h.details.render();
    await settle();
    assert.equal(h.calls.length, before, 'held slots coalesce repeated ticks');
  } finally { release.resolve(); await expired; await h.details.stop(); }
});

test('follow-on optional rejected early clear cannot skip later expired fields', async () => {
  const h = optionalDetailsHarness(); h.observe([[962, 100], [956, 230]]); await h.details.render();
  const write = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'dual_ct_preview_power.a_p1' && value === null) throw Error('synthetic clear rejection');
    return write(id, value);
  };
  h.now(91000);
  try {
    await h.details.render();
    assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'), null);
  } finally { h.port.setCapabilityValue = write; await h.details.stop(); }
});

test('follow-on optional late own-field expiry and retired completion reconcile without erasing a newer generation', async () => {
  const h = optionalDetailsHarness();
  const entered = deferredSdk(); const release = deferredSdk(); const write = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'dual_ct_preview_power.a_p1' && value === 100) { entered.resolve(); await release.promise; }
    return write(id, value);
  };
  h.observe([[962, 100]]); await entered.promise;
  h.now(91000); const expired = h.details.render();
  try {
    release.resolve(); await expired; await settle();
    assert.equal(h.values.get('dual_ct_preview_power.a_p1'), null);
    h.details.start({ ...h.scope, session: 'new' });
    h.now(92000); h.observe([[962, 300]]); await h.details.render(); await settle();
    assert.equal(h.values.get('dual_ct_preview_power.a_p1'), 300);
  } finally { release.resolve(); await expired; await h.details.stop(); }
});

test('follow-on optional stop does not await held value work and corrects its completion against the new generation', async () => {
  const h = optionalDetailsHarness();
  const entered = deferredSdk(); const release = deferredSdk(); const write = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'dual_ct_preview_power.a_p1' && value === 100) { entered.resolve(); await release.promise; }
    return write(id, value);
  };
  h.observe([[962, 100]]); await entered.promise;
  let stopped = false;
  const stopping = h.details.stop().then(() => { stopped = true; });
  try {
    await settle(); assert.equal(stopped, true);
    h.details.start({ ...h.scope, session: 'recovered' });
    h.now(2000); h.observe([[962, 300]]);
    release.resolve(); await stopping; await h.details.render(); await settle();
    assert.equal(h.values.get('dual_ct_preview_power.a_p1'), 300);
  } finally { release.resolve(); await stopping; await h.details.stop(); }
});

test('follow-on optional rejected numeric field cannot skip a fresh sibling field', async () => {
  const h = optionalDetailsHarness(); const write = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'dual_ct_preview_power.a_p1' && value !== null) throw Error('synthetic numeric rejection');
    return write(id, value);
  };
  h.observe([[962, 100], [956, 230]]);
  try {
    await h.details.render();
    assert.equal(h.values.get('dual_ct_preview_voltage.a_p1'), 230);
  } finally { h.port.setCapabilityValue = write; await h.details.stop(); }
});

test('follow-on optional retired clear completion restores the current generation without another reader or tick', async () => {
  const h = optionalDetailsHarness(); h.observe([[962, 100]]); await h.details.render();
  const entered = deferredSdk(); const release = deferredSdk(); const write = h.port.setCapabilityValue; let block = true;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'dual_ct_preview_power.a_p1' && value === null) {
      block = false; entered.resolve(); await release.promise;
    }
    return write(id, value);
  };
  h.now(91000); const expired = h.details.render(); await entered.promise;
  const stopped = h.details.stop();
  h.details.start({ ...h.scope, session: 'replacement' });
  h.now(92000); h.observe([[962, 300]]);
  try {
    release.resolve(); await Promise.all([expired, stopped]); await settle();
    assert.equal(h.values.get('dual_ct_preview_power.a_p1'), 300);
  } finally { release.resolve(); await Promise.all([expired, stopped]); await h.details.stop(); }
});

test('follow-on optional held value SDK work cannot gate real driver recovery retry', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d); await d.onInit();
  const handler = d.subscriptions[0];
  handler(payload(3600), `/app/device/property/${sn}`); await settle();
  now += 1000; handler(payload(3600), `/app/device/property/${sn}`); await settle();
  const entered = deferredSdk(); const release = deferredSdk(); const write = d.setCapabilityValue.bind(d); let block = true;
  d.setCapabilityValue = async (id, value) => {
    if (block && id === 'dual_ct_preview_power.a_p1' && value === 7200) {
      block = false; entered.resolve(); await release.promise;
    }
    return write(id, value);
  };
  now += 1000; handler(payload(7200), `/app/device/property/${sn}`); await entered.promise; await settle();
  const saved = structuredClone(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY));
  const recovery = d.recover(d.generation, () => true); await settle();
  try {
    assert.equal(d.adapter, null);
    assert.equal(d.values.get('measure_power'), null);
    assert.equal([...d.timers.values()].some(timer => !timer.interval), true);
    assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
  } finally { release.resolve(); await recovery; await d.onUninit(); }
});

test('follow-on optional held configuration SDK work cannot gate real driver recovery retry', async t => {
  t.mock.method(Date, 'now', () => 1000);
  const d = new Driver(); enabled(d); await d.onInit();
  const entered = deferredSdk(); const release = deferredSdk(); const options = d.setCapabilityOptions.bind(d); let block = true;
  d.setCapabilityOptions = async (id, value) => {
    if (block && id.startsWith('dual_ct_preview_')) { block = false; entered.resolve(); await release.promise; }
    return options(id, value);
  };
  const configuring = d.onSettings({ newSettings: { display_ct1: 'three_phase' }, changedKeys: ['display_ct1'] });
  await entered.promise;
  const recovery = d.recover(d.generation, () => true); await settle();
  try {
    assert.equal([...d.timers.values()].some(timer => !timer.interval), true);
    assert.equal(d.values.get('measure_power'), null);
  } finally { release.resolve(); await Promise.all([configuring, recovery]); await d.onUninit(); }
});

test('sustained hookup keeps one rule reader/listener across recovery and removes it only on shutdown', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d);
  const card = new EventEmitter(); const args = deferredSdk(); let reads = 0;
  card.getArgumentValues = () => { reads++; return args.promise; };
  card.trigger = async () => {};
  d.homey.flow = { getDeviceTriggerCard: id => id === 'smartmeter_grid_power_sustained' ? card : undefined };
  await d.onInit(); await settle();
  const notifications = d.gridNotifications;
  card.emit('update'); card.emit('update'); await settle();
  assert.equal(reads, 1);
  await d.recover(d.generation, () => true);
  assert.equal(d.gridNotifications, notifications);
  assert.equal(card.listenerCount('update'), 1);
  assert.equal(reads, 1);
  args.resolve([]); await settle();
  await d.onUninit(); assert.equal(card.listenerCount('update'), 0);
  await d.onInit(); assert.equal(d.gridNotifications, notifications); assert.equal(card.listenerCount('update'), 1);
  await d.onUninit(); assert.equal(card.listenerCount('update'), 0);
});

test('sustained hookup only emits from owned fresh qualified CT1 samples and rejects queued superseded events', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d);
  const card = new EventEmitter(); const events = [];
  card.getArgumentValues = async () => [{ direction: 'import', watts: 10, seconds: 1, hysteresis: 0, cooldown: 0 }];
  card.trigger = async (device, tokens, state) => { assert.equal(device, d); events.push({ tokens, state }); };
  d.homey.flow = { getDeviceTriggerCard: () => card };
  await d.onInit(); await settle();
  const tick = async () => {
    for (const timer of d.timers.values()) if (timer.interval && timer.ms === 1000) timer.fn();
    await settle();
  };
  try {
    await tick(); assert.equal(events.length, 0);
    const handler = d.subscriptions[0];
    handler(payload(100), `/app/device/property/${sn}`); await settle(); await tick();
    assert.equal(events.length, 0);
    now = 2100; handler(payload(100), `/app/device/property/${sn}`); await settle(); await tick();
    assert.equal(events.length, 1);
    assert.equal(d.gridNotificationEventCurrent(events[0].state.observation), true);
    now = 3100; handler(payload(100), `/app/device/property/${sn}`); await settle();
    assert.equal(d.gridNotificationEventCurrent(events[0].state.observation), false);
    const current = d.adapter.currentPowerObservation(now);
    await d.stop();
    assert.equal(d.gridNotificationEventCurrent(current), false);
  } finally { await d.onUninit(); }
});

async function sustainedContinuityHarness(t, args = {}) {
  let now = 100000; let seq = 0;
  t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d);
  const card = new EventEmitter(); const events = [];
  card.getArgumentValues = async () => [{ direction: 'import', watts: 500, seconds: 3, hysteresis: 100, cooldown: 0, ...args }];
  card.trigger = async (_device, tokens, state) => { events.push({ tokens, state }); };
  d.homey.flow = { getDeviceTriggerCard: () => card };
  await d.onInit(); await settle();
  t.after(() => d.onUninit());
  const deliver = (at, watts, metadata = {}) => {
    now = at;
    const { packetSequence = ++seq, ...delivery } = metadata;
    d.subscriptions.at(-1)(payload(watts, true, packetSequence), `/app/device/property/${sn}`,
      { receivedAt: at, receivedMonoMs: at, retained: false, duplicate: false, connectionEpoch: 1, ...delivery });
  };
  return {
    d, events, deliver,
    sample: async (at, watts, metadata) => { deliver(at, watts, metadata); await settle(); },
    tick: async at => {
      now = at;
      for (const timer of [...d.timers.values()]) if (timer.interval && timer.ms === 1000) timer.fn();
      await settle();
    },
    setNow: at => { now = at; },
  };
}

for (const [label, power] of [['zero', 0], ['entry equality', 500], ['below-entry hysteresis band', 450], ['opposite direction', -600]]) {
  test(`sustained continuity: SDK-qualified ${label} between ticker calls restarts dwell`, async t => {
    const h = await sustainedContinuityHarness(t);
    await h.sample(100000, 600); await h.tick(100000);
    await h.sample(100500, power);
    assert.equal(h.d.values.get('measure_power'), power);
    assert.equal(h.d.adapter.currentPowerObservation(100500).powerW, power);
    await h.sample(100750, 600);
    for (const at of [101000, 102000, 103000]) { await h.sample(at, 600); await h.tick(at); }
    assert.equal(h.events.length, 0, 'the applied interruption cannot be overwritten out of dwell history');
    await h.sample(103750, 600); await h.tick(103750);
    assert.equal(h.events.length, 1);
    assert.equal(h.d.gridNotificationEventCurrent(h.events[0].state.observation), true);
  });
}

for (const [label, rejected, recovered] of [
  ['connection epoch', { connectionEpoch: 2 }, { connectionEpoch: 2 }],
  ['sequence reset', { packetSequence: 0 }, {}],
  ['clock discontinuity', { receivedMonoMs: 99000 }, {}],
]) {
  test(`sustained continuity: ${label} restart withdraws continuity before anchor IO`, async t => {
    const h = await sustainedContinuityHarness(t);
    await h.sample(100000, 600); await h.tick(100000);
    const prior = h.d.adapter.currentPowerObservation(100000);
    const session = h.d.adapter.session;
    const reset = session.resetAnchor.bind(session);
    const entered = deferredSdk(); const release = deferredSdk();
    const ticks = []; const observe = h.d.gridNotifications.tick.bind(h.d.gridNotifications);
    h.d.gridNotifications.tick = (observation, now) => { ticks.push(observation); observe(observation, now); };
    session.resetAnchor = async () => { entered.resolve(); await release.promise; return reset(); };
    h.deliver(100500, 600, rejected); await entered.promise;
    const withdrawnSynchronously = ticks.some(observation => observation === null);
    const lateEventWithdrawnSynchronously = !h.d.gridNotificationEventCurrent(prior);
    release.resolve(); await settle();
    assert.equal(h.d.adapter.currentPowerObservation(100500), null);
    await h.sample(100750, 600, recovered);
    for (const at of [101000, 102000, 103000]) { await h.sample(at, 600, recovered); await h.tick(at); }
    assert.equal(h.events.length, 0, 'the notifier must not bridge the rejected restart packet');
    assert.equal(withdrawnSynchronously, true, 'withdraw notification ownership before awaiting anchor reset');
    assert.equal(lateEventWithdrawnSynchronously, true, 'late event evaluation stays fenced while reset IO is held');
    await h.sample(103750, 600, recovered); await h.tick(103750);
    assert.equal(h.events.length, 1);
    assert.equal(h.d.gridNotificationEventCurrent(h.events[0].state.observation), true);
  });
}

test('sustained continuity: concrete settled zero reaches the observer before a subsequent projection', async t => {
  const h = await sustainedContinuityHarness(t);
  await h.sample(100000, 600); await h.tick(100000);
  const available = h.d.setAvailable.bind(h.d); let replaced = false; let zero = null; let zeroBeforeReplacement = false;
  const observe = h.d.gridNotifications.tick.bind(h.d.gridNotifications);
  h.d.gridNotifications.tick = (observation, now) => {
    if (observation?.powerW === 0) zero = observation;
    observe(observation, now);
  };
  h.d.setAvailable = async () => {
    if (!replaced && h.d.values.get('measure_power') === 0) {
      replaced = true;
      zeroBeforeReplacement = zero !== null;
      h.deliver(100750, 600);
    }
    return available();
  };
  await h.sample(100500, 0);
  await h.d.adapter.refresh(); await settle();
  assert.equal(replaced, true);
  assert.equal(h.d.adapter.currentPowerObservation(100750).powerW, 600);
  for (const at of [101000, 102000, 103000]) { await h.sample(at, 600); await h.tick(at); }
  assert.equal(h.events.length, 0, 'an asynchronous latest-value reread would lose the applied zero');
  assert.equal(zeroBeforeReplacement, true, 'deliver the concrete observation before SDK completion yields further work');
  assert.equal(Object.isFrozen(zero), true);
  assert.equal(zero.receivedAt, 100500);
  assert.equal(zero.powerW, 0, 'later projection cannot mutate the supplied historical receipt');
  await h.sample(103750, 600); await h.tick(103750);
  assert.equal(h.events.length, 1);
});

test('sustained continuity: ordinary multiple high receipts between ticks complete dwell without starvation', async t => {
  const h = await sustainedContinuityHarness(t);
  for (let at = 100000; at <= 103000; at += 250) {
    await h.sample(at, 600 + (at % 1000));
    if (at % 1000 === 0) await h.tick(at);
    if (at < 103000) assert.equal(h.events.length, 0);
  }
  assert.equal(h.events.length, 1);
  assert.equal(h.d.gridNotificationEventCurrent(h.events[0].state.observation), true);
});

test('sustained continuity: source withdrawal resets fired dwell but preserves cooldown', async t => {
  const h = await sustainedContinuityHarness(t, { cooldown: 10 });
  for (const at of [100000, 101000, 102000, 103000]) { await h.sample(at, 600); await h.tick(at); }
  assert.equal(h.events.length, 1);
  await h.sample(103250, 600, { connectionEpoch: 2 });
  assert.equal(h.d.adapter.currentPowerObservation(103250), null);
  await h.sample(103500, 600, { connectionEpoch: 2 });
  for (let at = 104000; at < 113000; at += 1000) {
    await h.sample(at, 600, { connectionEpoch: 2 }); await h.tick(at);
    assert.equal(h.events.length, 1, 'unknown gap cannot erase the previous delivery cooldown');
  }
  await h.sample(113000, 600, { connectionEpoch: 2 }); await h.tick(113000);
  assert.equal(h.events.length, 2);
});

test('sustained continuity: optional CT2 receipts cannot renew CT1 dwell or expiry', async t => {
  const h = await sustainedContinuityHarness(t);
  await h.sample(100000, 600); await h.tick(100000);
  const expires = h.d.adapter.currentPowerObservation(100000).validUntil;
  for (const at of [101000, 102000, 103000, expires]) {
    h.setNow(at);
    const ct2 = nested(1, Buffer.concat([nested(1, scalar(991, 999999)), int(6, 0), int(8, 254), int(9, 21), int(14, at)]));
    h.d.subscriptions.at(-1)(ct2, `/app/device/property/${sn}`,
      { receivedAt: at, receivedMonoMs: at, retained: false, duplicate: false, connectionEpoch: 1 });
    await settle(); await h.tick(at);
    assert.equal(h.events.length, 0);
  }
  assert.equal(h.d.adapter?.currentPowerObservation(expires) ?? null, null);
});

test('below Flow keeps CT1 and CT2 dwell independent and rejects missing, partial and stale power', async t => {
  let now = 100000; let seq = 0; let connected = true;
  t.mock.method(Date, 'now', () => now);
  const device = new Driver(); enabled(device);
  device.displaySettings.display_ct2 = 'single_phase';
  const card = new EventEmitter(); const events = [];
  card.getArgumentValues = async () => ['ct1', 'ct2'].map(channel => ({ channel, direction: 'import', watts: 500,
    seconds: 1, hysteresis: 100, cooldown: 0 }));
  card.trigger = async (_device, tokens, state) => events.push({ tokens, state });
  device.homey.flow = { getDeviceTriggerCard: id => id === 'smartmeter_dual_ct_power_below_sustained' ? card : undefined };
  await device.onInit(); await settle();
  t.after(() => device.onUninit());
  async function sample(at, fields, metadata = {}) {
    now = at;
    const bytes = nested(1, Buffer.concat([nested(1, Buffer.concat(fields.map(([field, power]) => scalar(field, power)))),
      int(6, 0), int(8, 254), int(9, 21), int(14, ++seq)]));
    device.subscriptions[0](bytes, `/app/device/property/${sn}`,
      { receivedAt: at, receivedMonoMs: at, retained: false, duplicate: false, connectionEpoch: 1, isCurrent: () => connected, ...metadata });
    await settle();
  }
  const ct1 = [[515, 120], [962, 120], [963, 0], [772, 0]];
  const ct2 = [[998, -100], [991, -100], [992, 0], [993, 0]];
  await sample(100000, ct2); await sample(101000, ct2);
  assert.equal(events.length, 0, 'CT2 is off until its polarity is confirmed');
  device.displaySettings.ct2_flow_import_sign = 'negative';
  await sample(102000, ct1);
  await sample(103000, ct2);
  await sample(103400, [[991, 0]]);
  await sample(104000, ct2);
  assert.equal(events.length, 0, 'partial CT2 must restart dwell, and CT2 must not advance CT1');
  await sample(105000, ct1);
  assert.equal(events[0].state.channel, 'ct1');
  await sample(105100, ct2);
  assert.equal(events.length, 2);
  assert.equal(events[1].state.channel, 'ct2');
  assert.equal(events[1].tokens.power, 100);
  assert.equal(device.belowNotificationEventCurrent('ct2', events[1].state.observation), true);
  assert.equal(device.belowNotificationEventCurrent('ct1', events[1].state.observation), false);
  connected = false;
  assert.equal(device.belowNotificationEventCurrent('ct1', events[0].state.observation), false, 'CT1 rejects pending delivery immediately on disconnect');
  assert.equal(device.belowNotificationEventCurrent('ct2', events[1].state.observation), false, 'CT2 rejects pending delivery immediately on disconnect');
  connected = true;
  await sample(110100, ct2, { retained: true });
  assert.equal(device.belowNotificationEventCurrent('ct2', events[1].state.observation), false, 'exact expiry despite retained packet');
  now = events[0].state.observation.validUntil;
  assert.equal(device.belowNotificationEventCurrent('ct1', events[0].state.observation), false);
  assert.equal(events.length, 2);
});

test('sustained continuity: failed power SDK settlement cannot advance notification dwell', async t => {
  const h = await sustainedContinuityHarness(t);
  await h.sample(100000, 600); await h.tick(100000);
  const write = h.d.setCapabilityValue.bind(h.d);
  h.d.setCapabilityValue = async (id, value) => {
    if (id === 'measure_power' && value === 700) throw Error('synthetic failed publication');
    return write(id, value);
  };
  await h.sample(103000, 700); await h.tick(103000);
  assert.equal(h.events.length, 0);
  assert.equal(h.d.adapter, null);
});

test('sustained continuity: observer callback failure cannot close accounting or reject core projection', async t => {
  const h = await sustainedContinuityHarness(t);
  h.d.gridNotifications.tick = () => { throw Error('synthetic optional observer failure'); };
  await h.sample(100000, 600);
  assert.equal(h.d.values.get('measure_power'), 600);
  assert.equal(h.d.adapter.diagnostics().active, true);
  assert.equal(h.d.adapter.currentPowerObservation(100000).powerW, 600);
  h.d.gridNotifications.tick = () => {};
});

test('sustained continuity: failed own SDK tile read withdraws qualification without closing accounting', async t => {
  const h = await sustainedContinuityHarness(t);
  await h.sample(100000, 600); await h.tick(100000);
  const read = h.d.getCapabilityValue.bind(h.d); let unavailable = true;
  h.d.getCapabilityValue = id => {
    if (unavailable && id === 'measure_power') throw Error('synthetic unavailable tile metadata');
    return read(id);
  };
  await h.sample(103000, 600);
  assert.equal(h.d.adapter.diagnostics().active, true);
  unavailable = false;
  for (const at of [103250, 104250, 105250]) { await h.sample(at, 600); await h.tick(at); }
  assert.equal(h.events.length, 0, 'unreadable own SDK qualification cannot leave the old dwell armed');
  await h.sample(106250, 600); await h.tick(106250);
  assert.equal(h.events.length, 1);
});

test('existing qualified Energy subscriber recovers a denied topic with fresh CT1 and preserved counter anchors', async t => {
  let now = 100000; let healed = false; let propertyCalls = 0; let client;
  t.mock.method(Date, 'now', () => now);
  const timers = new Set();
  t.mock.method(global, 'setTimeout', (fn, ms) => { const timer = { fn, at: now + ms }; timers.add(timer); return timer; });
  t.mock.method(global, 'clearTimeout', timer => timers.delete(timer));
  class Client extends EventEmitter {
    constructor() { super(); this.connected = false; }
    subscribe(topic, _opts, callback) {
      if (topic === `/app/device/property/${sn}`) propertyCalls++;
      callback(null, [{ topic, qos: topic === `/app/device/property/${sn}` && !healed ? 128 : 0 }]);
    }
    unsubscribe() {}
    end(_force, options, callback) { this.connected = false; (typeof options === 'function' ? options : callback)?.(); }
  }
  const load = Module._load; let Shared;
  try {
    Module._load = function (name, ...args) {
      if (name === 'mqtt') return { connect() {
        client = new Client(); queueMicrotask(() => { client.connected = true; client.emit('connect'); }); return client;
      } };
      return load.call(this, name, ...args);
    };
    Shared = require('../.homeybuild/lib/EcoFlowAppMqtt').EcoFlowAppMqtt;
  } finally { Module._load = load; }
  const mqtt = new Shared({ client: { getSession: async () => account,
    getMqttCredentials: async () => ({ account: 'synthetic', password: 'synthetic', url: 'mqtt-e.ecoflow.com' }) } });
  const d = new Driver(); enabled(d);
  d.values.set('meter_power.imported', 9); d.values.set('meter_power.exported', 8);
  d.store.set(DUAL_CT_ENERGY_CHECKPOINT_KEY, makeDualCtEnergyCheckpoint(binding, contract.timing, 1, 9000, 8000));
  d.homey.app.subscribeAppRealtime = async (serial, handler) => { await mqtt.connect(); mqtt.subscribe(serial, handler); return true; };
  d.homey.app.unsubscribeAppRealtime = (serial, handler) => mqtt.unsubscribe(serial, handler);
  try {
    await d.onInit(); const socket = client;
    for (let second = 1; second <= 60; second++) {
      now = 100000 + second * 1000;
      if (second === 20) healed = true;
      for (const timer of [...timers]) if (timer.at <= now) { timers.delete(timer); timer.fn(); }
      for (const timer of [...d.timers.values()]) if (timer.interval) timer.fn();
      await settle();
    }
    assert.equal(propertyCalls, 4); assert.equal(client, socket);
    assert.equal(mqtt.getDeliveryDiagnostics(sn).activeTopics, 2);
    assert.equal(d.available, false, 'accepted SUBACK is not a fresh reading');
    assert.equal(d.values.get('meter_power.imported'), 9);
    client.emit('message', `/app/device/property/${sn}`, payload(3600), { retain: false, dup: false }); await settle();
    assert.equal(d.available, true); assert.equal(d.values.get('measure_power'), 3600);
    assert.equal(d.values.get('meter_power.imported'), 9, 'first recovery anchors without backfill');
    now += 1000;
    client.emit('message', `/app/device/property/${sn}`, payload(3600), { retain: false, dup: false }); await settle();
    assert.equal(d.values.get('meter_power.imported'), 9.001);
    assert.equal(d.values.get('meter_power.exported'), 8);
  } finally { await d.onUninit(); await mqtt.end(); }
  assert.equal(timers.size, 0);
});
test('qualified CT1 condition preserves strict sign/equality and rejects stale, mismatching, withdrawn or optional CT2 inputs', async t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d);
  const dependencies = d.energyDependencies();
  const fastContract = { ...contract, freshnessMs: 5000 };
  d.energyDependencies = () => ({ ...dependencies, resolve: () => fastContract });
  d.store.set('dualCtEnergySourceBinding', dualCtGridBinding({
    account: dualCtAccountBinding(account), device: sn, grid: 'homey_property_grid', session: 'one',
  }, fastContract));
  await d.onInit();
  t.after(() => d.onUninit());
  assert.throws(() => d.gridPowerAbove('import', 0));
  const handler = d.subscriptions[0];
  handler(payload(100), `/app/device/property/${sn}`); await settle();
  assert.equal(d.gridPowerAbove('import', 99), true); assert.equal(d.gridPowerAbove('import', 100), false);
  assert.equal(d.gridPowerAbove('export', 0), false);
  for (const [direction, watts] of [['sideways', 0], ['import', NaN], ['import', -1], ['import', '0']]) assert.throws(() => d.gridPowerAbove(direction, watts));
  d.values.set('measure_power', 99); assert.throws(() => d.gridPowerAbove('import', 0)); d.values.set('measure_power', 100);
  now += 1; handler(payload(-100), `/app/device/property/${sn}`); await settle();
  assert.equal(d.gridPowerAbove('export', 99), true); assert.equal(d.gridPowerAbove('export', 100), false);
  now += 1; handler(payload(0), `/app/device/property/${sn}`); await settle();
  assert.equal(d.gridPowerAbove('import', 0), false); assert.equal(d.gridPowerAbove('export', 0), false);
  now += 4999; assert.equal(d.gridPowerAbove('export', 0), false);
  now += 1; assert.throws(() => d.gridPowerAbove('export', 0));
  const detailsOnly = nested(1, Buffer.concat([nested(1, scalar(991, 999999)), int(6, 0), int(8, 254), int(9, 21)]));
  handler(detailsOnly, `/app/device/property/${sn}`); await settle();
  assert.throws(() => d.gridPowerAbove('import', 0), 'CT2 must not renew CT1');
  now += 1; handler(payload(100), `/app/device/property/${sn}`); await settle();
  assert.throws(() => d.gridPowerAbove('import', 0), 'the first post-gap frame resets the existing accounting anchor');
  now += 1; handler(payload(100), `/app/device/property/${sn}`); await settle();
  assert.equal(d.gridPowerAbove('import', 0), true);
  d.store.set('dualCtEnergyConsent', 0); assert.throws(() => d.gridPowerAbove('import', 0));
  await d.onUninit(); assert.throws(() => d.gridPowerAbove('import', 0));
});
test('unadopted Energy driver stays unavailable without auth, subscriptions, timers, store writes or resets', async () => {
  const d = new Driver(); d.store.delete('dualCtEnergyConsent'); d.values.set('meter_power.imported', 9); d.values.set('meter_power.exported', 8); await d.onInit();
  assert.equal(d.available, false); assert.equal(d.values.get('measure_power'), null);
  assert.equal(d.values.get('meter_power.imported'), 9); assert.equal(d.values.get('meter_power.exported'), 8);
  assert.equal(d.subscriptions.length, 0); assert.equal(d.timers.size, 0);
  assert.equal(d.writes.some(row => row[0] === 'store' || row[0] === 'energy'), false);
  await d.onUninit(); assert.equal(d.homey.settings.listenerCount('set'), 0);
});
test('real driver/session persists CT1-only totals, handles expiry, account changes and late callbacks', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d); await d.onInit();
  assert.equal(d.subscriptions.length, 1); const handler = d.subscriptions[0];
  handler(payload(3600), `/app/device/property/${sn}`); await settle();
  now = 2000; handler(payload(3600), `/app/device/property/${sn}`); await settle();
  assert.equal(d.available, true); assert.equal(d.values.get('measure_power'), 3600);
  assert.ok(Math.abs(d.values.get('meter_power.imported') - 0.001) < 1e-9);
  assert.equal(d.values.get('meter_power.exported'), 0);
  const persist = d.writes.findIndex(row => row[0] === 'store');
  const projection = d.writes.findIndex(row => row[0] === 'cap' && row[1] === 'meter_power.imported');
  assert.ok(persist < projection, 'persist before Homey projection');
  const total = d.values.get('meter_power.imported');
  now = 92000; d.timers.values().next().value.fn(); await settle();
  assert.equal(d.available, false); assert.equal(d.values.get('measure_power'), null);
  assert.equal(d.values.get('meter_power.imported'), total); assert.equal(d.detached.includes(handler), true);
  handler(payload(900000), `/app/device/property/${sn}`); await settle(); assert.equal(d.values.get('meter_power.imported'), total);
  await d.onUninit(); assert.equal(d.timers.size, 0);
});
test('one process authority blocks a second device and credential edits synchronously detach the first', async t => {
  t.mock.method(Date, 'now', () => 1000);
  const first = new Driver(); enabled(first); const second = new Driver(); enabled(second);
  try {
    await first.onInit(); await second.onInit();
    assert.equal(first.subscriptions.length, 1); assert.equal(second.subscriptions.length, 0);
    assert.equal(second.writes.some(row => row[0] === 'store'), false);
    first.homey.settings.emit('set', 'appAuthPassword');
    assert.equal(first.detached.length, 1); await settle(); assert.equal(first.available, false);
  } finally { await first.onUninit(); await second.onUninit(); }
});

test('missing or older native checkpoint cannot overwrite already projected cumulative energy', async t => {
  t.mock.method(Date, 'now', () => 1000);
  for (const existing of [false, true]) {
    const d = new Driver(); enabled(d); d.values.set('meter_power.imported', 9);
    if (existing) d.store.set(DUAL_CT_ENERGY_CHECKPOINT_KEY, makeDualCtEnergyCheckpoint(binding, contract.timing, 1, 8000, 0));
    await d.onInit();
    assert.equal(d.subscriptions.length, 0); assert.equal(d.values.get('meter_power.imported'), 9);
    assert.equal(d.writes.some(row => row[0] === 'store'), false);
    await d.onUninit();
  }
});
test('new runtime instance restores committed totals and establishes a new anchor without downtime backfill', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const first = new Driver(); enabled(first); await first.onInit();
  first.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  now = 2000; first.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  await first.onUninit();
  const second = new Driver(); enabled(second); second.store = new Map(first.store); second.values = new Map(first.values);
  now = 102000; await second.onInit(); assert.equal(second.subscriptions.length, 1);
  assert.equal(second.values.get('meter_power.imported'), first.values.get('meter_power.imported'));
  second.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  assert.ok(Math.abs(second.values.get('meter_power.imported') - 0.001) < 1e-9);
  now += 1000; second.subscriptions[0](payload(3600), `/app/device/property/${sn}`); await settle();
  assert.ok(Math.abs(second.values.get('meter_power.imported') - 0.002) < 1e-9);
  await second.onUninit();
});

test('a queued old expiry tick cannot call an adapter or reader after teardown', async t => {
  t.mock.method(Date, 'now', () => 1000);
  const d = new Driver(); enabled(d); await d.onInit();
  const tick = [...d.timers.values()].find(timer => timer.interval).fn;
  const adapter = d.adapter; await d.onUninit();
  let calls = 0; adapter.refresh = async () => { calls++; };
  tick(); await settle(); assert.equal(calls, 0); assert.equal(d.timers.size, 0);
});


test('registered driver cannot project retained, duplicate or unknown-delivery power into the Energy session', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d); await d.onInit();
  const handler = d.subscriptions[0]; const topic = `/app/device/property/${sn}`;
  handler(payload(3600), topic); await settle();
  now = 2000; handler(payload(3600), topic); await settle();
  const total = d.values.get('meter_power.imported'); const saved = d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY);
  for (const flags of [null, { retained: true, duplicate: false }, { retained: false, duplicate: true }]) {
    now += 100; handler(payload(99000), topic, flags && { receivedAt: now, receivedMonoMs: now, ...flags }); await settle();
    assert.equal(d.values.get('measure_power'), 3600);
    assert.equal(d.values.get('meter_power.imported'), total); assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
  }
  await d.onUninit();
});

test('receipt gaps re-anchor a new session without filling missing time or resetting committed energy', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabled(d); await d.onInit(); const topic = `/app/device/property/${sn}`;
  d.subscriptions[0](payload(3600), topic); await settle();
  now = 2000; d.subscriptions[0](payload(3600), topic); await settle();
  const total = d.values.get('meter_power.imported');
  now = 8000; d.subscriptions[0](payload(99000), topic); await settle();
  assert.equal(d.values.get('meter_power.imported'), total); assert.equal(d.values.get('measure_power'), null);
  assert.equal([...d.timers.values()].filter(timer => !timer.interval).length, 0, 'delivery gap must not tear down the subscription');
  now = 9000; d.subscriptions.at(-1)(payload(3600), topic); await settle();
  assert.equal(d.values.get('meter_power.imported'), total, 'first fresh delivery is an anchor only');
  now = 10000; d.subscriptions.at(-1)(payload(3600), topic); await settle();
  assert.ok(Math.abs(d.values.get('meter_power.imported') - total - 0.001) < 1e-9);
  await d.onUninit();
});

test('native rounded import and export counters survive a reporting gap and runtime restart', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  for (const watts of [5760, -5760]) {
    now = 1000;
    const first = new Driver(); enabled(first);
    const set = first.setCapabilityValue.bind(first);
    first.setCapabilityValue = (id, value) => set(id, typeof value === 'number' && id.startsWith('meter_power.') ? Math.round(value * 1000) / 1000 : value);
    const cap = watts > 0 ? 'meter_power.imported' : 'meter_power.exported';
    try {
      await first.onInit();
      first.subscriptions[0](payload(watts), `/app/device/property/${sn}`); await settle();
      now = 2000; first.subscriptions[0](payload(watts), `/app/device/property/${sn}`); await settle();
      assert.equal(first.values.get(cap), 0.002, 'Homey projects 1.6 Wh to 0.002 kWh');
      const checkpoint = first.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY);
      assert.ok(Math.abs((watts > 0 ? checkpoint.importedWh : checkpoint.exportedWh) - 1.6) < 1e-9);
      now = 8000; first.subscriptions[0](payload(watts), `/app/device/property/${sn}`); await settle();
      assert.equal([...first.timers.values()].filter(timer => !timer.interval).length, 0);
      await settle();
      assert.equal(first.subscriptions.length, 1, 'gap recovery retains the subscription and precise checkpoint');
      assert.equal(first.values.get(cap), 0.002, 'recovery never lowers the native counter');
      first.subscriptions.at(-1)(payload(watts), `/app/device/property/${sn}`); await settle();
      assert.equal(first.values.get(cap), 0.002, 'new epoch does not backfill the gap');
      await first.onUninit();
      const second = new Driver(); enabled(second); second.store = new Map(first.store); second.values = new Map(first.values);
      try {
        now = 108000; await second.onInit();
        assert.equal(second.subscriptions.length, 1, 'native precision also survives a process restart');
        assert.equal(second.values.get(cap), 0.002);
      } finally { await second.onUninit(); }
    } finally { await first.onUninit(); }
  }
});

test('native precision still rejects a genuinely older checkpoint in either counter', async t => {
  t.mock.method(Date, 'now', () => 1000);
  for (const cap of ['meter_power.imported', 'meter_power.exported']) {
    for (const [wh, previous, admitted] of [[1.4, 0.001, true], [1.4, 0.002, false], [1.6, 0.003, false]]) {
      const d = new Driver(); enabled(d); d.values.set(cap, previous);
      const imported = cap === 'meter_power.imported' ? wh : 0;
      const exported = cap === 'meter_power.exported' ? wh : 0;
      const saved = makeDualCtEnergyCheckpoint(binding, contract.timing, 1, imported, exported);
      d.store.set(DUAL_CT_ENERGY_CHECKPOINT_KEY, saved);
      try {
        await d.onInit();
        assert.equal(d.subscriptions.length, admitted ? 1 : 0);
        assert.equal(d.values.get(cap), previous, 'no native counter rollback');
        assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved, 'restore never rewrites precision or resets totals');
      } finally { await d.onUninit(); }
    }
  }
});

test('real community driver restores its separate binding, nets three phases and retains local feedback without affecting legacy admission',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const {DualCtCommunityTrial}=require('../.homeybuild/lib/dualCtCommunityTrial');
  const prod={productType:421,firmware:'1.0.0.41'};const trial=new DualCtCommunityTrial(()=>now);
  trial.refresh({account:dualCtAccountBinding(account),device:sn,grid:'homey_property_grid',identity:prod,identityObservedAt:now,owned:true});
  const key=dualCtGridBinding({account:dualCtAccountBinding(account),device:sn,grid:'homey_property_grid',session:'one'},trial.resolve(prod));
  const d=new Driver();d.store.set('dualCtEnergyMode','three_phase_community');d.store.set('dualCtEnergySourceBinding',key);
  d.energyDependencies=()=>({enabled:()=>true,resolve:()=>{throw Error('legacy resolver must not admit trial');},
    context:()=>new DualCtHomeyEnergyContext({homey:d.homey,sn,communityThreePhase:true,now:Date.now,
      client:()=>({getSession:async()=>account,getDeviceList:async()=>[{sn,shared:false,modelCodes:[{field:'productType',code:421}]}]}),
      readFirmware:async()=>prod.firmware,reader:async()=>({list:async()=>({}),close(){}})})});
  await d.onInit();const emit=()=>d.subscriptions.at(-1)(nested(1,Buffer.concat([nested(1,Buffer.concat([[962,2000],[963,-1500],
    [772,-1000],[515,-500],[991,50000],[992,50000],[993,50000],[998,150000]].map(([f,v])=>scalar(f,v)))),int(8,254),int(9,21),int(14,++sequence)])),`/app/device/property/${sn}`);
  emit();await settle();now+=1000;emit();await settle();
  assert.equal(d.values.get('measure_power'),-500);assert.equal(d.values.get('meter_power.exported'),0,'native projection rounds sub-Wh; exact storage retains it');
  assert.ok(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY).exportedWh>0);
  const report=d.getDualCtCommunityFeedback();assert.equal(report.eligibleIntervalMs,1000);assert.equal(report.hardwareValidated,false);
  assert.equal(report.counts.eligible_interval,1);assert.equal(report.uploadedAutomatically,false);
  const beforeGap=structuredClone(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY));
  now+=6000;emit();await settle();
  assert.equal(d.subscriptions.length,1,'three-phase gap must not enter a blind reconnect window');
  assert.equal(d.values.get('measure_power'),null);
  assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY),beforeGap);
  now+=1000;emit();await settle();
  assert.equal(d.values.get('measure_power'),-500);
  assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY),beforeGap,'first resumed frame anchors without filling the gap');
  now+=1000;emit();await settle();
  assert.ok(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY).exportedWh>beforeGap.exportedWh);
  const saved=structuredClone(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY));await d.onUninit();
  now+=100000;await d.onInit();assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY),saved);
  emit();await settle();assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY),saved);await d.onUninit();
});

test('real Energy display settings never change the active subscription, core counter checkpoint or accounting mode',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const d=new Driver();enabled(d);await d.onInit();
  d.subscriptions[0](payload(600),`/app/device/property/${sn}`);await settle();now+=1000;
  d.subscriptions[0](payload(600),`/app/device/property/${sn}`);await settle();
  const before={store:structuredClone([...d.store]),core:['measure_power','meter_power.imported','meter_power.exported'].map(k=>d.values.get(k)),ids:[...d.values.keys()]};
  d.writes.length=0;
  await d.onSettings({newSettings:{display_ct1:'three_phase',display_ct2:'three_phase'},changedKeys:['display_ct1','display_ct2']});
  assert.equal(d.capOptions.get('dual_ct_preview_voltage.a_p3').uiComponent,'sensor');
  assert.equal(d.capOptions.get('dual_ct_preview_net.b').uiComponent,'sensor');
  await d.onSettings({newSettings:{display_ct1:'single_phase',display_ct2:'off'},changedKeys:['display_ct1','display_ct2']});
  assert.equal(d.capOptions.get('dual_ct_preview_voltage.a_p3').uiComponent,null);
  assert.equal(d.capOptions.get('dual_ct_preview_net.b').uiComponent,null);
  assert.deepEqual([...d.store],before.store);assert.deepEqual([...d.values.keys()],before.ids);
  assert.deepEqual(['measure_power','meter_power.imported','meter_power.exported'].map(k=>d.values.get(k)),before.core);
  assert.equal(d.writes.some(w=>w[0]==='store'||w[0]==='energy'),false);
  assert.equal(d.subscriptions.length,1);assert.equal(d.detached.length,0);assert.equal(d.available,true);
  await d.onUninit();
});

test('optional detail capability failure cannot block the existing Energy subscription or counter updates',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const d=new Driver();enabled(d);
  d.addCapability=async()=>{throw Error('synthetic UI capability failure');};
  await d.onInit();assert.equal(d.subscriptions.length,1);
  d.subscriptions[0](payload(600),`/app/device/property/${sn}`);await settle();now+=1000;
  d.subscriptions[0](payload(600),`/app/device/property/${sn}`);await settle();
  assert.equal(d.values.get('measure_power'),600);assert.equal(d.available,true);
  assert.ok(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY).importedWh>0);await d.onUninit();
});

test('synthetic sparse three-frame feed reproduces accepted packets, gap, unrelated message and honest stale Energy', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabledCommunity(d);
  const monitor = new DualCtMonitor({ account: 'synthetic', device: sn, session: 'sparse' });
  let accepted = 0;
  try {
    await d.onInit(); const handler = d.subscriptions[0]; const topic = `/app/device/property/${sn}`;
    const emit = bytes => {
      if (monitor.observe(bytes, topic, now, now)) accepted++;
      handler(bytes, topic);
    };
    const saved = structuredClone(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY));
    emit(payload(3600, false)); await settle();
    now = 7000; emit(payload(3600, false)); await settle();
    now = 8000; emit(nested(1, Buffer.concat([nested(1, scalar(962, 900000)), int(8, 254), int(9, 22), int(14, ++sequence)]))); await settle();
    now = 258600; await d.context.refresh(); await d.adapter.refresh();
    assert.equal(accepted, 2);
    assert.deepEqual(monitor.getRejectionCounts(), { unrelated_message: 1 });
    assert.equal(monitor.snapshot(now, key => key).values.dual_ct_preview_status, 'stale');
    const feedback = d.getDualCtCommunityFeedback();
    assert.deepEqual(feedback.counts, { anchor: 1, delivery_rejected: 2, delivery_gap: 1, not_ct1_property_upload: 1 });
    assert.equal(feedback.eligibleIntervalMs, 0); assert.equal(feedback.rejectedGapMs, 0);
    assert.equal(d.available, false); assert.equal(d.values.get('measure_power'), null);
    assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
    assert.equal(d.subscriptions.length, 1); assert.equal(d.detached.length, 0);
    now += 1000; emit(payload(3600, false)); await settle();
    assert.equal(d.available, true); assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved, 'resume anchors without filling missing time');
    now += 1000; emit(payload(3600, false)); await settle();
    assert.ok(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY).importedWh > saved.importedWh);
  } finally { await d.onUninit(); }
});

test('a fast transport reconnection cannot integrate across socket epochs even with increasing sequences', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  for (const [setup, watts] of [[enabled, 3600], [enabled, -3600], [enabledCommunity, 3600], [enabledCommunity, -3600]]) {
    now = 1000; const d = new Driver(); setup(d);
    try {
      await d.onInit(); const handler = d.subscriptions[0]; const topic = `/app/device/property/${sn}`;
      const emit = epoch => handler(payload(watts, setup === enabled), topic, { receivedAt: now, receivedMonoMs: now, retained: false, duplicate: false, connectionEpoch: epoch });
      emit(1); await settle(); now += 1000; emit(1); await settle();
      const saved = structuredClone(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY));
      now += 1000; emit(2); await settle();
      assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved, 'socket gap is unknown even below five seconds');
      assert.equal(d.available, false); assert.equal(d.values.get('measure_power'), null);
      now += 1000; emit(2); await settle();
      assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved, 'first resumed sample anchors only');
      now += 1000; emit(2); await settle();
      const counter = watts > 0 ? 'importedWh' : 'exportedWh';
      assert.ok(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY)[counter] > saved[counter]);
      assert.equal(d.subscriptions.length, 1); assert.equal(d.detached.length, 0);
    } finally { await d.onUninit(); }
  }
});


test('paired mode summary follows stored consent, never display settings; summary failure preserves details', async () => {
  for (const mode of [undefined, 'three_phase_community']) {
    const d = new Driver(); d.homey.__ = key => key;
    if (mode) d.store.set('dualCtEnergyMode', mode);
    const before = structuredClone([...d.store]);
    const expected = mode ? 'pairedThreePhase' : 'pairedSinglePhase';
    await d.configureDetails();
    assert.equal(d.displaySettings.paired_mode_summary, `dual_ct_energy.${expected}`);
    await d.onSettings({newSettings:{display_ct1:mode ? 'single_phase' : 'three_phase',paired_mode_summary:'forged'},changedKeys:['display_ct1']});
    assert.equal(d.displaySettings.paired_mode_summary, `dual_ct_energy.${expected}`);
    assert.deepEqual([...d.store], before);
    d.setSettings = async () => { throw Error('synthetic label failure'); };
    await assert.doesNotReject(d.configureDetails({display_ct2:'three_phase'}));
    assert.equal(d.capOptions.get('dual_ct_preview_voltage.b_p3').uiComponent, 'sensor');
  }
});

test('startup diagnostics distinguish source, contract, binding and subscription failures without resetting counters', async t => {
 t.mock.method(Date,'now',()=>1000);
 for(const stage of ['source','contract','binding','subscription']) {
  const d=new Driver();enabled(d);d.store.set('dualCtEnergyMode','three_phase_community');
  const deps=d.energyDependencies();
  if(stage==='source') {const context=deps.context();context.refresh=async()=>{throw Error('PRIVATE account');};deps.context=()=>context;}
  if(stage==='contract') deps.resolve=()=>null;
  if(stage==='binding') d.store.set('dualCtEnergySourceBinding','synthetic-other');
  if(stage==='subscription') d.homey.app.subscribeAppRealtime=async()=>{throw Error('PRIVATE broker');};
  d.energyDependencies=()=>deps;
  d.values.set('meter_power.imported',2);d.values.set('meter_power.exported',1);
  d.store.set(DUAL_CT_ENERGY_CHECKPOINT_KEY,makeDualCtEnergyCheckpoint(binding,contract.timing,1,2000,1000));
  const before=structuredClone([...d.store]);
  try {await d.onInit();const evidence=d.getDualCtCommunityFeedback();
   assert.equal(evidence.counts[`startup_${stage}_failed`],1);
   assert.doesNotMatch(JSON.stringify(evidence),/PRIVATE|synthetic-other/);
   assert.equal(d.values.get('meter_power.imported'),2);assert.equal(d.values.get('meter_power.exported'),1);
   assert.deepEqual([...d.store],before);
   assert.equal([...d.timers.values()].filter(x=>!x.interval).length,1);
  }finally{await d.onUninit();assert.equal(d.timers.size,0);}
 }
});

test('busy transport with one sparse CT1 anchor can show recent detail while Energy expires, then recover without backfill', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const d = new Driver(); enabledCommunity(d);
  const monitor = new DualCtMonitor({ account: 'synthetic', device: sn, session: 'sparse_latest' });
  try {
    await d.onInit(); const handler = d.subscriptions[0]; const topic = `/app/device/property/${sn}`;
    const emit = bytes => { const accepted = monitor.observe(bytes, topic, now, now); handler(bytes, topic); return accepted; };
    const unrelated = nested(1, Buffer.concat([nested(1, scalar(962, 900000)), int(8, 254), int(9, 22), int(14, ++sequence)]));
    assert.equal(emit(unrelated), false); await settle();
    now = 17000; assert.equal(emit(payload(3600, false)), true); await settle();
    const saved = structuredClone(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY));
    const feedback = d.getDualCtCommunityFeedback();
    assert.deepEqual(feedback.counts, { delivery_rejected: 1, not_ct1_property_upload: 1, anchor: 1 });
    assert.equal(feedback.eligibleIntervalMs, 0);
    assert.deepEqual(feedback.messageEvidence.groups.map(row => row.outcome), ['not_ct1_property_upload', 'delivery_eligible']);
    assert.deepEqual(feedback.messageEvidence.groups.map(row => row.cmdId), [22, 21]);
    now += 59600; await d.adapter.refresh();
    assert.equal(monitor.snapshot(now, key => key).recent, true, 'detail age remains within 90 seconds');
    assert.equal(d.available, false, 'one old sample cannot represent live grid power');
    assert.equal(d.values.get('measure_power'), null);
    assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
    // Renew identity only, as the normal runtime does. Identity is not measurement freshness.
    now = 110000; await d.context.refresh(); await d.adapter.refresh();
    assert.equal(monitor.snapshot(now, key => key).recent, false);
    assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
    assert.equal(d.subscriptions.length, 1); assert.equal(d.detached.length, 0);
    now += 1000; emit(payload(3600, false)); await settle();
    assert.equal(d.values.get('measure_power'), null, 'cross-gap packet resets the accounting anchor');
    now += 1000; emit(payload(3600, false)); await settle();
    assert.equal(d.available, true); assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
    now += 1000; emit(payload(3600, false)); await settle();
    assert.equal(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY).importedWh, saved.importedWh + 1);
    assert.equal(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY).exportedWh, saved.exportedWh);
    assert.equal(d.getDualCtCommunityFeedback().eligibleIntervalMs, 1000);
    assert.equal(d.subscriptions.length, 1); assert.equal(d.detached.length, 0);
  } finally { await d.onUninit(); }
});


test('single-phase startup diagnostics survive recovery without exposing community trial claims or clearing counters', async () => {
  const d = new Driver(); enabled(d);
  d.values.set('meter_power.imported', 9); d.values.set('meter_power.exported', 8);
  d.energyDependencies = () => ({ enabled: () => true, resolve: () => contract,
    context: () => new DualCtHomeyEnergyContext({ homey: {}, sn, client: () => null }) });
  await d.onInit();
  const diag = d.getDualCtEnergyDiagnostics();
  assert.equal(diag.mode, 'single_phase'); assert.equal(diag.startupStage, 'source');
  assert.equal(diag.context.stage, 'selection'); assert.equal(diag.context.reason, 'account_required');
  assert.equal(diag.retryScheduled, true); assert.equal(diag.active, false);
  assert.equal(d.getDualCtCommunityFeedback(), null);
  assert.equal(d.values.get('meter_power.imported'), 9); assert.equal(d.values.get('meter_power.exported'), 8);
  assert.equal(d.subscriptions.length, 0); assert.doesNotMatch(JSON.stringify(diag), /DUALCTSYNTHETIC01|synthetic_contract/);
  await d.onUninit();
});

test('real SDK-only startup respects an explicitly reviewed excluded Office meter and preserves existing counter checkpoints', async t => {
  t.mock.method(Date, 'now', () => 100000);
  const d = new Driver(); enabled(d);
  const saved = makeDualCtEnergyCheckpoint(binding, contract.timing, 1, 25000, 1000);
  d.store.set(DUAL_CT_ENERGY_CHECKPOINT_KEY, saved); d.values.set('meter_power.imported', 25); d.values.set('meter_power.exported', 1);
  const settings = { property_meter_role: 'not_included' };
  const port = (s, opts) => ({ getData: () => ({ sn: s }), getCapabilities: () => ['measure_power','meter_power.imported'],
    getEnergy: () => null, getSettings: () => opts, getName: () => 'Synthetic meter' });
  d.homey.manifest = { id: 'uk.co.zarb.ecoflow', drivers: [{ id: 'smartmeter', energy: { cumulative: true } },
    { id: 'smartmeter_dual_ct_energy', energy: { cumulative: true } }] };
  d.homey.drivers = { getDriver: id => ({ getDevices: () => id === 'smartmeter' ? [port('OFFICESYNTHETIC', settings)] : [port(sn, {})] }) };
  d.homey.api = { getOwnerApiToken() { assert.fail('broad API'); } };
  const deps = d.energyDependencies();
  d.energyDependencies = () => ({ ...deps, context: () => new DualCtHomeyEnergyContext({ homey: d.homey, sn,
    ownDevice: { sn, driverId: 'homey:app:uk.co.zarb.ecoflow:smartmeter_dual_ct_energy' },
    client: () => ({ getSession: async () => account, getDeviceList: async () => [{ sn, shared: false, modelCodes: [{ field: 'productType', code:421 }] }] }),
    readFirmware: async () => identity.firmware }) });
  await d.onInit();
  assert.equal(d.subscriptions.length, 1); assert.equal(d.getDualCtEnergyDiagnostics().active, true);
  assert.equal(d.values.get('meter_power.imported'), 25); assert.equal(d.values.get('meter_power.exported'), 1);
  assert.deepEqual(d.store.get(DUAL_CT_ENERGY_CHECKPOINT_KEY), saved);
  settings.property_meter_role = 'unreviewed';
  await d.onUninit(); await d.onInit();
  assert.equal(d.getDualCtEnergyDiagnostics().context.reason, 'energy_role_review_required');
  assert.equal(d.getDualCtEnergyDiagnostics().active, false);
  assert.equal(d.values.get('meter_power.imported'), 25); assert.equal(d.values.get('meter_power.exported'), 1);
  await d.onUninit();
});

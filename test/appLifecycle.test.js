'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const originalLoad = Module._load;
let EcoFlowApp;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { App: class {} };
    return originalLoad.call(this, request, ...args);
  };
  EcoFlowApp = require('../.homeybuild/app');
} finally { Module._load = originalLoad; }

function harness() {
  const app = new EcoFlowApp();
  const settings = new EventEmitter();
  settings.get = () => null;
  const timers = new Map();
  let nextTimer = 0;
  app.homey = {
    settings,
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  };
  app.log = () => {};
  app.error = () => {};
  return { app, settings, timers };
}

test('5000 read-only conditions route to fresh device observations, not a control method', async () => {
  const { app } = harness();
  const listeners = new Map();
  app.homey.flow = { getConditionCard: (id) => ({ registerRunListener: (fn) => listeners.set(id, fn) }) };
  await app.onInit();
  assert.deepEqual([...listeners.keys()], ['stream_5000_mode_is', 'stream_5000_reserve_enabled']);
  const device = {
    configurationModeIs: async (mode) => mode === 'custom',
    configurationReserveEnabled: async () => { throw new Error('Fresh state unavailable'); },
  };
  assert.equal(await listeners.get('stream_5000_mode_is')({ device, mode: 'custom' }), true);
  await assert.rejects(listeners.get('stream_5000_reserve_enabled')({ device }), /Fresh state unavailable/);
  await app.onUninit();
});

test('app teardown detaches settings listeners and cancels pending reconnect callbacks', async () => {
  const { app, settings, timers } = harness();
  await app.onInit();
  settings.emit('set', 'accessKey');
  settings.emit('unset', 'appAuthPassword');
  assert.equal(timers.size, 2);
  await app.onUninit();
  assert.equal(settings.listenerCount('set'), 0);
  assert.equal(settings.listenerCount('unset'), 0);
  assert.equal(timers.size, 0);
  settings.emit('set', 'accessKey');
  assert.equal(timers.size, 0);
  assert.equal(await app.subscribeRealtime('BK61TEST00000001', () => {}), false);
  assert.equal(await app.subscribeAppRealtime('ES22TEST00000001', () => {}), false);
});

test('late MQTT connection completion after app shutdown cannot attach a subscription', async () => {
  const { app } = harness();
  await app.onInit();
  let release;
  let entered;
  const connected = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let attaches = 0;
  app.getMqtt = async () => { entered(); return connected; };
  const subscription = app.subscribeRealtime('BK61TEST00000001', () => {});
  await started;
  await app.onUninit();
  release({ subscribe() { attaches += 1; } });
  assert.equal(await subscription, false);
  assert.equal(attaches, 0);
});

test('late app-auth connection completion after shutdown cannot attach a subscription', async () => {
  const { app } = harness();
  await app.onInit();
  let release;
  let entered;
  const connected = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let attaches = 0;
  app.getAppMqtt = async () => { entered(); return connected; };
  const subscription = app.subscribeAppRealtime('ES22TEST00000001', () => {});
  await started;
  await app.onUninit();
  release({ subscribe() { attaches += 1; } });
  assert.equal(await subscription, false);
  assert.equal(attaches, 0);
});

test('anonymous discovery is cleared immediately on account changes and shutdown, including late replies', async () => {
  const { app, settings } = harness();
  await app.onInit();
  const devices = [{ sn: 'ZZ11PRIVATE0001', productName: 'STREAM Expansion Battery 5000', name: 'PRIVATE', online: 1 }];
  app.beginStreamDiscoveryObservation()(devices);
  assert.equal(app.getStreamDiscoveryEvidence().groups[0].productHint, 'expansion_5000');
  const oldAccount = app.beginStreamDiscoveryObservation();
  settings.emit('set', 'appAuthPassword');
  assert.equal(app.getStreamDiscoveryEvidence(), null);
  oldAccount(devices);
  assert.equal(app.getStreamDiscoveryEvidence(), null);
  app.beginStreamDiscoveryObservation()(devices);
  const late = app.beginStreamDiscoveryObservation();
  await app.onUninit();
  late(devices);
  app.beginStreamDiscoveryObservation()(devices);
  assert.equal(app.getStreamDiscoveryEvidence(), null);
});

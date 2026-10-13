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

test('cancelled research cannot attach after slow app/Developer connections finish', async () => {
  for (const transport of ['app', 'developer']) {
    const { app } = harness(); await app.onInit();
    let release; let attached = 0; let active = true;
    const waiting = new Promise((resolve) => { release = resolve; });
    const mqtt = { subscribe() { attached++; }, unsubscribe() {}, hasSubscribers: false, end: async () => {} };
    if (transport === 'app') { app.appMqtt = mqtt; app.getAppMqtt = async () => waiting; }
    else { app.mqtt = mqtt; app.getMqtt = async () => waiting; }
    const pending = transport === 'app' ? app.subscribeAppRealtime('ZZ99SYNTHETIC0001', () => {}, () => active)
      : app.subscribeRealtime('ZZ99SYNTHETIC0001', () => {}, undefined, () => active);
    active = false;
    if (transport === 'app') app.unsubscribeAppRealtime('ZZ99SYNTHETIC0001', () => {});
    else app.unsubscribeResearchRealtime('ZZ99SYNTHETIC0001', () => {});
    release(mqtt); assert.equal(await pending, false); assert.equal(attached, 0);
    await app.onUninit();
  }
});

test('a connection replaced while awaiting readiness cannot receive a stale subscription', async () => {
  for (const transport of ['app', 'developer']) {
    const { app } = harness(); await app.onInit(); let release; let attaches = 0;
    const old = { subscribe() { attaches++; }, hasSubscribers: false, end: async () => {} };
    const replacement = { hasSubscribers: true, end: async () => assert.fail('replacement closed') };
    const waiting = new Promise((resolve) => { release = resolve; });
    if (transport === 'app') { app.appMqtt = old; app.getAppMqtt = async () => waiting; }
    else { app.mqtt = old; app.getMqtt = async () => waiting; }
    const pending = transport === 'app' ? app.subscribeAppRealtime('BK21SYNTHETIC0001', () => {})
      : app.subscribeRealtime('BK21SYNTHETIC0001', () => {});
    if (transport === 'app') app.appMqtt = replacement;
    else app.mqtt = replacement;
    release(old); assert.equal(await pending, false); assert.equal(attaches, 0);
    replacement.end = async () => {}; await app.onUninit();
  }
});

test('stopping discovery preserves another pending app subscriber and its later readings', async () => {
  const { EcoFlowAppMqtt } = require('../.homeybuild/lib/EcoFlowAppMqtt');
  const { app } = harness(); await app.onInit();
  const mqtt = new EcoFlowAppMqtt({ client: {} }); let ends = 0; let readings = 0;
  mqtt.end = async () => { ends++; };
  app.appMqtt = mqtt; let release;
  app.getAppMqtt = async () => new Promise((resolve) => { release = resolve; });
  const regular = () => { readings++; }; const research = () => {};
  const pending = app.subscribeAppRealtime('BK21SYNTHETIC0001', regular);
  app.unsubscribeAppRealtime('ZZ99SYNTHETIC0001', research);
  assert.equal(ends, 0);
  release(mqtt); assert.equal(await pending, true);
  mqtt.onMessage('/app/device/property/BK21SYNTHETIC0001', Buffer.from('{}'));
  assert.equal(readings, 1); assert.equal(ends, 0);
  app.unsubscribeAppRealtime('BK21SYNTHETIC0001', regular); assert.equal(ends, 1);
  await app.onUninit();
});

test('discovery unsubscribes only its callbacks on a shared meter identity in both transports', async () => {
  const { EcoFlowMqtt } = require('../.homeybuild/lib/EcoFlowMqtt');
  const { EcoFlowAppMqtt } = require('../.homeybuild/lib/EcoFlowAppMqtt');
  const { app } = harness(); await app.onInit(); const sn = 'BK21SYNTHETIC0001';
  const mqtt = new EcoFlowMqtt({ accessKey: 'synthetic', secretKey: 'synthetic' });
  const appMqtt = new EcoFlowAppMqtt({ client: {} }); let ends = 0;
  mqtt.end = appMqtt.end = async () => { ends++; };
  app.mqtt = mqtt; app.appMqtt = appMqtt;
  app.getMqtt = async () => mqtt; app.getAppMqtt = async () => appMqtt;
  let regularQuota = 0; let regularFrames = 0; let researchSamples = 0;
  const regular = () => { regularQuota++; }; const regularFrame = () => { regularFrames++; };
  const research = () => { researchSamples++; }; const researchFrame = () => { researchSamples++; };
  await app.subscribeRealtime(sn, regular); await app.subscribeRealtime(sn, research);
  await app.subscribeAppRealtime(sn, regularFrame); await app.subscribeAppRealtime(sn, researchFrame);
  app.unsubscribeResearchRealtime(sn, research); app.unsubscribeAppRealtime(sn, researchFrame);
  mqtt.onMessage(`/open/synthetic/${sn}/quota`, Buffer.from('{"power":5}'));
  appMqtt.onMessage(`/app/device/property/${sn}`, Buffer.from('{}'));
  assert.equal(regularQuota, 1); assert.equal(regularFrames, 1); assert.equal(researchSamples, 0);
  assert.equal(ends, 0); assert.equal(mqtt.hasSubscribers, true);
  await app.onUninit();
});

test('idle research Developer connection is released only after another pending subscription settles', async () => {
  const { EcoFlowMqtt } = require('../.homeybuild/lib/EcoFlowMqtt');
  const { app } = harness(); await app.onInit();
  const mqtt = new EcoFlowMqtt({ accessKey: 'synthetic', secretKey: 'synthetic' }); let ends = 0;
  mqtt.end = async () => { ends++; }; app.mqtt = mqtt; let release;
  app.getMqtt = async () => new Promise((resolve) => { release = resolve; });
  const regular = () => {};
  const pending = app.subscribeRealtime('BK21SYNTHETIC0001', regular);
  app.unsubscribeResearchRealtime('ZZ99SYNTHETIC0001', () => {}); assert.equal(ends, 0);
  release(mqtt); assert.equal(await pending, true); assert.equal(ends, 0);
  app.unsubscribeRealtime('BK21SYNTHETIC0001', regular);
  app.unsubscribeResearchRealtime('ZZ99SYNTHETIC0001', () => {}); assert.equal(ends, 1);
  await app.onUninit();
});

test('5000 read-only conditions route to fresh device observations, not a control method', async () => {
  const { app } = harness();
  const listeners = new Map();
  app.homey.flow = { getConditionCard: (id) => ({ registerRunListener: (fn) => listeners.set(id, fn) }) };
  await app.onInit();
  assert.deepEqual([...listeners.keys()], ['smartmeter_grid_power_above', 'stream_5000_mode_is', 'stream_5000_reserve_enabled']);
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

test('Dual CT research is never started automatically and is cleared on account unset and teardown', async () => {
  const { app, settings } = harness();
  await app.onInit();
  assert.equal(app.getDualCtResearchSnapshot().status, 'not_started');
  const calls = [];
  app.dualCtResearch = { stop: (...args) => calls.push(args), snapshot: () => ({ status: 'stopped' }) };
  settings.emit('unset', 'appAuthPassword');
  assert.deepEqual(calls[0], ['account_changed', true]);
  await app.onUninit();
  assert.deepEqual(calls[1], ['stopped', true]);
  assert.deepEqual(await app.startDualCtResearch(), { status: 'stopped' });
});

test('restarted Dual CT capture owns its inventory independently of a late stopped-account list', async () => {
  const pairing = require('../.homeybuild/lib/appAuthPairing');
  const original = pairing.appAuthClientFromSettings;
  const { app } = harness(); await app.onInit();
  let release; let lists = 0; const attached = [];
  const oldSn = 'ZZ98SYNTHETIC0001'; const newSn = 'ZZ99SYNTHETIC0001';
  const device = (sn) => ({ sn, productName: 'Smart Meter Dual CT', shared: false });
  pairing.appAuthClientFromSettings = () => ({ getDeviceList: async () => {
    lists++;
    if (lists === 1) return new Promise((resolve) => { release = resolve; });
    return [device(newSn)];
  } });
  app.subscribeAppRealtime = async (sn) => { attached.push(sn); return true; };
  app.unsubscribeAppRealtime = () => {};
  try {
    const oldCapture = app.startDualCtResearch();
    app.stopDualCtResearch();
    await app.startDualCtResearch();
    release([device(oldSn)]); await oldCapture;
    assert.deepEqual(attached, [newSn]);
    assert.equal(app.getDualCtResearchSnapshot().status, 'listening');
    assert.equal(app.getDualCtResearchSnapshot().deviceCount, 1);
  } finally { pairing.appAuthClientFromSettings = original; await app.onUninit(); }
});

test('active Dual CT Start keeps its original consent and reports both requested and effective modes', async () => {
  const pairing = require('../.homeybuild/lib/appAuthPairing');
  const original = pairing.appAuthClientFromSettings;
  try {
    for (const enabled of [false, true]) {
      const { app } = harness(); await app.onInit(); let lists = 0; let subscriptions = 0;
      pairing.appAuthClientFromSettings = () => ({ getDeviceList: async () => {
        lists++; return [{ sn: 'ZZ99SYNTHETIC0001', productName: '421',
          modelCodes: [{ field: 'productType', code: 421 }], shared: false }];
      } });
      app.subscribeAppRealtime = async () => { subscriptions++; return true; };
      app.unsubscribeAppRealtime = () => {};
      const first = await app.startDualCtResearch(enabled);
      assert.equal(first.captureStart.reused, false);
      assert.equal(first.captureStart.effectivePreviewEnabled, enabled);
      const view = app.getDualCtResearchView();
      assert.match(view.captureId, /^[0-9a-f-]{36}$/);
      assert.equal(view.preview.captureId, view.captureId);
      assert.equal(view.preview.enabled, enabled);
      const { dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
      const { compact } = require('../settings/dual-ct-status');
      const accidentalEnvelope = { ...view.research, captureId: view.captureId,
        preview: { devices: [{ value: 1234567, sn: 'PRIVATE' }] } };
      for (const exported of [dualCtResearchSnapshot(accidentalEnvelope), compact(accidentalEnvelope)]) {
        assert.doesNotMatch(JSON.stringify(exported), /captureId|1234567|PRIVATE|candidateUnit/);
      }
      const again = await app.startDualCtResearch(!enabled);
      assert.equal(again.captureStart.reused, true);
      assert.equal(again.captureStart.requestedPreviewEnabled, !enabled);
      assert.equal(again.captureStart.effectivePreviewEnabled, enabled);
      assert.equal(again.captureStart.requiresRestart, true);
      assert.equal(app.getDualCtResearchView().captureId, view.captureId);
      assert.equal(lists, 1); assert.equal(subscriptions, 1);
      assert.doesNotMatch(JSON.stringify(app.getDualCtResearchSnapshot()), /captureId|candidateUnit|SYNTHETIC/);
      app.stopDualCtResearch();
      const restarted = await app.startDualCtResearch(!enabled);
      assert.equal(restarted.captureStart.effectivePreviewEnabled, !enabled);
      assert.equal(restarted.captureStart.requiresRestart, false);
      assert.notEqual(app.getDualCtResearchView().captureId, view.captureId);
      await app.onUninit();
    }
  } finally { pairing.appAuthClientFromSettings = original; }
});

test('local Dual CT view never discovers, subscribes or uses supplied request identities/clocks', async () => {
  const { app } = harness(); await app.onInit();
  const api = require('../.homeybuild/api');
  const view = await api.dualCtResearchView({ homey: { app }, body: { sn: 'PRIVATE', now: 1, previewEnabled: true } });
  assert.equal(view.research.status, 'not_started');
  assert.equal(view.preview.enabled, false);
  assert.deepEqual(view.preview.devices, []);
  assert.equal(view.captureId, null);
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE/);
  await app.onUninit();
});

test('concurrent Start during discovery does not change preview consent or attach another capture', async () => {
  const pairing = require('../.homeybuild/lib/appAuthPairing'); const original = pairing.appAuthClientFromSettings;
  const { app } = harness(); await app.onInit(); let resolveList; let lists = 0;
  pairing.appAuthClientFromSettings = () => ({ getDeviceList: async () => {
    lists++; return new Promise(resolve => { resolveList = resolve; });
  } });
  app.subscribeAppRealtime = async () => true; app.unsubscribeAppRealtime = () => {};
  try {
    const pending = app.startDualCtResearch(false);
    const id = app.getDualCtResearchView().captureId;
    const repeated = await app.startDualCtResearch(true);
    assert.equal(repeated.status, 'discovering');
    assert.equal(repeated.captureStart.reused, true);
    assert.equal(repeated.captureStart.requiresRestart, true);
    assert.equal(repeated.captureStart.effectivePreviewEnabled, false);
    assert.equal(lists, 1); assert.equal(app.getDualCtResearchView().captureId, id);
    resolveList([{ sn: 'ZZ99SYNTHETIC0001', productName: 'Smart Meter Dual CT', shared: false }]);
    await pending;
    assert.equal(app.getDualCtResearchView().preview.enabled, false);
  } finally { pairing.appAuthClientFromSettings = original; await app.onUninit(); }
});

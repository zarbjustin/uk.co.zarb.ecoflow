'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtResearch, dualCtResearchDevices, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const sn = 'ZZ99SYNTHETIC0001';
const device = { sn, productName: 'EcoFlow Smart Meter Dual CT', shared: false };
const { mergeDualCtInventory, dualCtOwnedHost, probeDualCtDeveloper, dualCtJsonShape,
  dualCtJsonShapesSnapshot } = require('../.homeybuild/lib/dualCtSources');
function vi(n) { const out = []; do { out.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(out); }
function int(n, v) { return Buffer.concat([vi(n * 8), vi(v)]); }
function msg(n, value) { return Buffer.concat([vi(n * 8 + 2), vi(value.length), value]); }
function frame(data, source = sn) { return msg(1, Buffer.concat([msg(1, data), int(8, 32), int(9, 50), msg(25, Buffer.from(source))])); }
function harness(list = async () => [device]) {
  let now = 1000;
  const handlers = new Map(); const timers = new Map();
  let listCalls = 0; let subscriptions = 0;
  const hooks = {
    now: () => now, list: async () => { listCalls++; return list(); },
    subscribe: async (serial, handler) => { subscriptions++; handlers.set(serial, handler); return true; },
    unsubscribe: (serial, handler) => { if (handlers.get(serial) === handler) handlers.delete(serial); },
    timer: (fn, ms) => { assert.equal(ms, 120000); timers.set(1, fn); return 1; },
    cancel: (id) => timers.delete(id),
  };
  const capture = new DualCtResearch(hooks);
  return { capture, hooks, handlers, timers, advance: (ms) => { now += ms; },
    counts: () => ({ listCalls, subscriptions }) };
}

test('Dual CT admission requires explicit owned product metadata, never custom names or guessed prefixes', () => {
  assert.equal(dualCtResearchDevices([device, device, { ...device, shared: true },
    { sn: 'BK21SYNTHETIC0001', name: device.productName, productName: 'Smart Meter' },
    { ...device, sn: 'bad/topic' }]).length, 1);
  assert.equal(dualCtResearchDevices([1, 2, 3].map((n) => ({ ...device, sn: `${sn}${n}` }))).length, 2);
});

test('capture is manual, bounded, ignores cached replies and retains structure without values or identities', async () => {
  const h = harness();
  assert.deepEqual(h.counts(), { listCalls: 0, subscriptions: 0 });
  await h.capture.start(); await h.capture.start();
  assert.deepEqual(h.counts(), { listCalls: 1, subscriptions: 1 });
  const handler = h.handlers.get(sn);
  const payload = frame(Buffer.concat([int(1, 12345), msg(2, Buffer.from('PRIVATE-SECRET'))]));
  handler(payload, `/app/user/${sn}/thing/property/get_reply`);
  assert.equal(h.capture.snapshot().frames, 0);
  handler(payload, `/app/device/property/${sn}`);
  const evidence = h.capture.snapshot();
  assert.deepEqual(evidence.shapes[0].fields, [{ field: 1, wire: 0 }, { field: 2, wire: 2 }]);
  assert.equal(evidence.contributesToEnergy, false);
  assert.equal(evidence.controlsEnabled, false);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|ZZ99|12345/);
  evidence.shapes[0].fields[0].field = 99;
  assert.equal(h.capture.snapshot().shapes[0].fields[0].field, 1);
  h.advance(120000); handler(payload, `/app/device/property/${sn}`);
  assert.equal(h.capture.snapshot().status, 'complete');
  assert.equal(h.handlers.size, 0); assert.equal(h.timers.size, 0);
});

test('malformed, oversized and wrong-source frames cannot produce shapes; frame limit detaches listener', async () => {
  const h = harness(); await h.capture.start(); const handler = h.handlers.get(sn);
  for (const payload of [Buffer.alloc(65537), frame(Buffer.from([8, 128])), frame(int(1, 42), 'OTHERIDENTITY')]) {
    handler(payload, `/app/device/property/${sn}`);
  }
  assert.equal(h.capture.snapshot().rejectedFrames, 3);
  assert.deepEqual(h.capture.snapshot().shapes, []);
  for (let i = 0; i < 130; i++) handler(frame(int(1, i)), `/app/device/property/${sn}`);
  assert.equal(h.capture.snapshot().frames, 128);
  assert.equal(h.capture.snapshot().status, 'sample_limit');
  assert.equal(h.handlers.size, 0);
});

test('stop/account change while list or subscribe is pending rejects late subscriptions and evidence', async () => {
  let resolveList; const h = harness(() => new Promise((resolve) => { resolveList = resolve; }));
  const pending = h.capture.start(); h.capture.stop('account_changed', true);
  resolveList([device]); await pending;
  assert.equal(h.handlers.size, 0); assert.equal(h.capture.snapshot().deviceCount, 0);
  let resolveSubscribe; const h2 = harness();
  h2.hooks.subscribe = async (serial, handler) => {
    await new Promise((resolve) => { resolveSubscribe = resolve; }); h2.handlers.set(serial, handler); return true;
  };
  const pending2 = h2.capture.start();
  await new Promise((resolve) => setImmediate(resolve));
  h2.capture.stop('stopped', true); resolveSubscribe(); await pending2;
  assert.equal(h2.handlers.size, 0); assert.equal(h2.capture.snapshot().deviceCount, 0);
});

test('no model/auth failure/transport failure are inconclusive and release timer; clock rollback expires capture', async () => {
  for (const list of [async () => [], async () => { throw new Error('private credentials'); }]) {
    const h = harness(list); await h.capture.start(); assert.equal(h.timers.size, 0);
    assert.doesNotMatch(JSON.stringify(h.capture.snapshot()), /private credentials/);
  }
  const h = harness(); h.hooks.subscribe = async () => false; await h.capture.start();
  assert.equal(h.capture.snapshot().status, 'transport_unavailable');
  const h2 = harness(); await h2.capture.start(); h2.advance(-1001);
  h2.handlers.get(sn)(frame(int(1, 1)), `/app/device/property/${sn}`);
  assert.equal(h2.handlers.size, 0);
});

test('public projection cannot promote arbitrary payloads or claim Energy/control/channel support', () => {
  const evidence = dualCtResearchSnapshot({ status: 'invented', secret: 'PRIVATE', frames: Infinity,
    shapes: [{ deviceIndex: 0, cmdId: 1, cmdFunc: 2, raw: 'PRIVATE', fields: [{ field: 1, wire: 0, value: 'PRIVATE' }] }],
    contributesToEnergy: true, controlsEnabled: true, valuesCaptured: true });
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE/);
  assert.equal(evidence.status, 'not_started'); assert.equal(evidence.valuesCaptured, true);
  assert.equal(evidence.valuesIncluded, false);
  assert.equal(evidence.contributesToEnergy, false); assert.equal(evidence.controlsEnabled, false);
});

test('app and Developer discovery authorise routes independently with explicit metadata and exact identities', () => {
  const developer = [{ sn, productName: device.productName, online: 1 }];
  assert.deepEqual(mergeDualCtInventory([], developer).map((row) => [row.appListed, row.developerListed]), [[false, true]]);
  assert.deepEqual(mergeDualCtInventory([device], [{ sn, productName: '', online: 1 }])
    .map((row) => [row.appListed, row.developerListed]), [[true, true]]);
  assert.equal(mergeDualCtInventory([{ ...device, shared: true }], []).length, 0);
  assert.equal(mergeDualCtInventory([], [{ sn: 'BK21SYNTHETIC0001', deviceName: device.productName }]).length, 0);
  assert.equal(mergeDualCtInventory([device], [{ ...developer[0], sn: `${sn}OTHER` }]).length, 2);
  assert.equal(mergeDualCtInventory(Array.from({ length: 256 }, (_, i) => ({ ...device,
    sn: `OTHERDEVICE${i}`, productName: 'Unknown' })), developer).length, 1);
});

test('linked-host lookup never probes unknown, non-STREAM, own-meter or off-account targets', async () => {
  const host = 'BK61SYNTHETIC0001'; const calls = [];
  const inventory = [{ sn }, { sn: host }];
  assert.equal(dualCtOwnedHost(host, sn, inventory), true);
  for (const target of [sn, 'OTHERACCOUNT123', '/bad/topic', 'BK21METER000001']) {
    assert.equal(dualCtOwnedHost(target, sn, [...inventory, { sn: 'BK21METER000001' }]), false);
    const result = await probeDualCtDeveloper({ getQuotaAll: async (targetSn) => { calls.push(targetSn); return {}; },
      getMainSn: async () => target }, sn, inventory, () => true);
    assert.equal(result[1].status, 'host_not_verified');
  }
  assert.deepEqual(calls, [sn, sn, sn, sn]);
  const reads = [];
  const result = await probeDualCtDeveloper({ getQuotaAll: async (target, options) => {
    reads.push([target, options]); return { power: -100 }; }, getMainSn: async () => host }, sn, inventory, () => true);
  assert.deepEqual(reads, [[sn, { fresh: true }], [host, { fresh: true }]]);
  assert.equal(result[1].source, 'linked_host_rest');
});

test('Developer probes distinguish empty/error and stop additional reads after cancellation', async () => {
  const result = await probeDualCtDeveloper({ getQuotaAll: async () => ({}),
    getMainSn: async () => { throw new Error('PRIVATE TOKEN'); } }, sn, [{ sn }], () => true);
  assert.equal(result[0].status, 'empty'); assert.equal(result[1].status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  let active = true; let resolves = 0;
  const stopped = await probeDualCtDeveloper({ getQuotaAll: async () => { active = false; return { power: 1 }; },
    getMainSn: async () => { resolves++; return sn; } }, sn, [{ sn }], () => active);
  assert.deepEqual(stopped, []); assert.equal(resolves, 0);
  assert.deepEqual(await probeDualCtDeveloper({ getQuotaAll: async () => assert.fail('off-account read'),
    getMainSn: async () => assert.fail('off-account resolve') }, sn, [], () => true), []);
});

test('JSON shape handles wrappers/dotted paths/arrays without values, arbitrary keys or unbounded nesting', () => {
  const circular = { ct1: { power: -123, current: 0 }, ct2: { voltage: 240 }, secret: 'PRIVATE',
    'localMeter.power': 7, [sn]: 123, channels: [{ power: 1 }, { power: 2 }] };
  circular.data = circular;
  const shape = dualCtJsonShape(circular);
  assert.equal(shape.empty, false);
  assert(shape.fields.some((field) => field.path === 'ct1.current' && field.type === 'number'));
  assert(shape.fields.some((field) => field.path === 'localMeter.power'));
  assert(shape.fields.length <= 32);
  assert.doesNotMatch(JSON.stringify(shape), /PRIVATE|ZZ99|123|240/);
  const sanitized = dualCtJsonShapesSnapshot([{ deviceIndex: 0, source: 'developer_rest', secret: 'PRIVATE',
    fields: [{ path: 'ct1.power', type: 'number', value: 7 }, { path: sn, type: 'string' }] }]);
  assert.deepEqual(sanitized[0].fields, [{ path: 'ct1.power', type: 'number' }]);
  assert.throws(() => dualCtJsonShape([]));
});

test('app JSON records structure; malformed JSON and cached replies cannot masquerade as live data', async () => {
  const h = harness(); await h.capture.start(); const handler = h.handlers.get(sn);
  handler(Buffer.from('{"params":{"ct1":{"power":0},"ct2":{"power":-50}},"secret":"PRIVATE"}'), `/app/device/property/${sn}`);
  const evidence = h.capture.snapshot();
  assert.equal(evidence.jsonShapes[0].source, 'app_json');
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|-50/);
  handler(Buffer.from('{invalid'), `/app/device/property/${sn}`);
  assert.equal(h.capture.snapshot().rejectedFrames, 1);
  handler(Buffer.from('{"power":1}'), `/app/user/${sn}/thing/property/get_reply`);
  assert.equal(h.capture.snapshot().frames, 2);
  h.capture.stop();
});

test('Developer-only device can capture REST and MQTT independently of the app transport', async () => {
  const h = harness(async () => [{ ...device, appListed: false, developerListed: true }]);
  let callback; let unsubscribed = 0;
  h.hooks.probe = async () => [{ source: 'developer_rest', status: 'empty', data: {} },
    { source: 'linked_host_rest', status: 'host_not_verified' }];
  h.hooks.developerSubscribe = async (_, handler) => { callback = handler; return true; };
  h.hooks.developerUnsubscribe = () => { unsubscribed++; };
  await h.capture.start(); assert.equal(h.counts().subscriptions, 0);
  callback({ ct1: { power: 0 } });
  assert.equal(h.capture.snapshot().jsonShapes[1].source, 'developer_mqtt');
  h.capture.stop('account_changed', true);
  callback({ ct1: { power: 7 } });
  assert.equal(unsubscribed, 1); assert.deepEqual(h.capture.snapshot().jsonShapes, []);
});

test('late Developer subscription completion cannot restore a stopped capture', async () => {
  const h = harness(async () => [{ ...device, appListed: false, developerListed: true }]);
  let release; let detached = 0;
  h.hooks.developerSubscribe = async () => new Promise((resolve) => { release = resolve; });
  h.hooks.developerUnsubscribe = () => { detached++; };
  const pending = h.capture.start(); await new Promise((resolve) => setImmediate(resolve));
  h.capture.stop('stopped', true); release(true); await pending;
  assert.equal(detached, 2); assert.equal(h.capture.snapshot().deviceCount, 0);
});

test('capture history records route/frame/stop ages and clears on account change without raw evidence', async () => {
  const h = harness(); await h.capture.start(); const handler = h.handlers.get(sn);
  h.advance(500); handler(frame(int(1, 12345)), `/app/device/property/${sn}`);
  h.advance(500); handler(frame(int(1, 12345)), `/app/device/property/${sn}`);
  h.capture.stop();
  const history = h.capture.snapshot().history;
  assert.equal(history.find((event) => event.status === 'protobuf').samples, 2);
  assert.equal(history[history.length - 1].status, 'stopped');
  assert.doesNotMatch(JSON.stringify(history), /ZZ99|12345|firstAt|lastAt/);
  h.capture.stop('account_changed', true); assert.deepEqual(h.capture.snapshot().history, []);
});

test('slow inventory finishing after the window cannot start connections or quota probes', async () => {
  let release; const h = harness(() => new Promise((resolve) => { release = resolve; }));
  let probes = 0; h.hooks.probe = async () => { probes++; return []; };
  const pending = h.capture.start(); h.advance(120000);
  release([{ ...device, developerListed: true }]); await pending;
  assert.equal(h.counts().subscriptions, 0); assert.equal(probes, 0);
  assert.equal(h.capture.snapshot().status, 'complete'); assert.equal(h.timers.size, 0);
});

test('a cleanup failure cannot prevent other detachments or revive capture callbacks', async () => {
  const second = `${sn}B`; const h = harness(async () => [device, { ...device, sn: second }]);
  const removed = [];
  h.hooks.unsubscribe = (serial) => { removed.push(serial); if (serial === sn) throw new Error('PRIVATE'); };
  await h.capture.start(); const old = h.handlers.get(sn);
  h.capture.stop(); old(frame(int(1, 2)), `/app/device/property/${sn}`);
  assert.deepEqual(removed, [sn, second]);
  assert.equal(h.capture.snapshot().cleanupFailures, 1); assert.equal(h.capture.snapshot().frames, 0);
  assert.equal(h.capture.snapshot().status, 'stopped');
  assert.doesNotMatch(JSON.stringify(h.capture.snapshot()), /PRIVATE/);
});

test('stopping during a slow probe discards results and prevents Developer attachment', async () => {
  const h = harness(async () => [{ ...device, appListed: false, developerListed: true }]);
  let release; let attached = 0;
  h.hooks.probe = async () => new Promise((resolve) => { release = resolve; });
  h.hooks.developerSubscribe = async () => { attached++; return true; };
  const pending = h.capture.start(); await new Promise((resolve) => setImmediate(resolve));
  h.capture.stop(); release([{ source: 'developer_rest', status: 'observed', data: { power: 1 } }]);
  await pending;
  assert.equal(attached, 0); assert.deepEqual(h.capture.snapshot().jsonShapes, []);
});

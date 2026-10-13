'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtResearch, dualCtResearchDevices, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const sn = 'ZZ99SYNTHETIC0001';
const device = { sn, productName: 'EcoFlow Smart Meter Dual CT', shared: false };
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
  assert.equal(evidence.status, 'not_started'); assert.equal(evidence.valuesCaptured, false);
  assert.equal(evidence.contributesToEnergy, false); assert.equal(evidence.controlsEnabled, false);
});

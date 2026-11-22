'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { EcoFlowClient } = require('../.homeybuild/lib/EcoFlowClient');

function client() { return new EcoFlowClient({ accessKey: 'bug-bash-test', secretKey: 'test-only' }); }

function response(t, body, statusCode = 200, event) {
  t.mock.method(https, 'request', (_opts, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      const res = new EventEmitter(); res.statusCode = statusCode;
      callback(res);
      if (event) { res.emit(event, new Error('stream failed')); return; }
      res.emit('data', Buffer.from(body)); res.emit('end');
    };
    req.destroy = (error) => req.emit('error', error);
    req.write = () => {};
    return req;
  });
}

test('invalid JSON errors never include raw server content', async (t) => {
  response(t, 'PRIVATE-SERVER-CONTENT');
  await assert.rejects(client().requestOnce('GET', '/test'), (e) => {
    assert.match(e.message, /invalid JSON/);
    assert.doesNotMatch(e.message, /PRIVATE/); return true;
  });
});

test('null and array envelopes reject cleanly rather than throwing in a response callback', async (t) => {
  for (const body of ['null', '[]']) {
    response(t, body);
    await assert.rejects(client().requestOnce('GET', '/test'), /invalid response envelope/);
    t.mock.restoreAll();
  }
});

test('non-success HTTP status cannot be accepted through a code-zero envelope', async (t) => {
  response(t, '{"code":"0","data":{}}', 503);
  await assert.rejects(client().requestOnce('GET', '/test'), (e) => e.code === '503');
});

test('response stream errors and truncation settle the request', async (t) => {
  for (const event of ['error', 'aborted']) {
    response(t, '', 200, event);
    await assert.rejects(client().requestOnce('GET', '/test'), /stream failed|interrupted/);
    t.mock.restoreAll();
  }
});

test('oversized API response is rejected before parsing', async (t) => {
  response(t, 'x'.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(client().requestOnce('GET', '/test'), /size limit/);
});

test('history accepts documented nested and flat arrays but rejects inner errors and malformed payloads', async () => {
  const c = client();
  for (const payload of [[{ indexValue: 1 }], { code: '0', data: [{ indexValue: 1 }] }]) {
    c.request = async () => payload;
    assert.deepEqual(await c.getHistory('BK61TEST', 'metric', 'start', 'end'), [{ indexValue: 1 }]);
  }
  c.request = async () => ({ code: '1006', data: [] });
  await assert.rejects(c.getHistory('BK61TEST', 'metric', 'start', 'end'), (e) => e.code === '1006');
  c.request = async () => ({ unexpected: true });
  await assert.rejects(c.getHistory('BK61TEST', 'metric', 'start', 'end'), /invalid history/);
});

test('device list rejects malformed successful payloads', async () => {
  const c = client(); c.request = async () => ({ devices: [] });
  await assert.rejects(c.getDeviceList(), /invalid device-list/);
});

test('missing main identity never silently promotes the queried member to main', async () => {
  const c = client(); c.request = async () => ({});
  await assert.rejects(c.getMainSn('BK31NOIDENTITYTEST'), /identity unavailable/);
});

test('explicit reporter diagnostic resolution bypasses a cached main without replacing it', async () => {
  EcoFlowClient.responseCache.clear();
  const c = client(); let calls = 0;
  c.request = async () => ({ sn: ++calls === 1 ? 'BK11SYNTHETIC' : 'ES22SYNTHETIC' });
  assert.equal(await c.getMainSn('BK31SYNTHETIC'), 'BK11SYNTHETIC');
  assert.equal(await c.getMainSn('BK31SYNTHETIC'), 'BK11SYNTHETIC');
  assert.equal(await c.getMainSn('BK31SYNTHETIC', { fresh: true }), 'ES22SYNTHETIC');
  assert.equal(calls, 2);
  assert.equal(await c.getMainSn('BK31SYNTHETIC'), 'BK11SYNTHETIC');
  EcoFlowClient.responseCache.clear();
});

test('shared API cache is bounded and expired entries are retired', async (t) => {
  EcoFlowClient.responseCache.clear();
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const c = client(); let requests = 0; c.request = async () => ({ value: ++requests });
  for (let i = 0; i < 300; i += 1) await c.getQuotaAll(`BK61TEST${i}`);
  assert.equal(EcoFlowClient.responseCache.size, 256);
  await c.getQuotaAll('BK61TEST299'); assert.equal(requests, 300);
  now += 2000;
  await c.getQuotaAll('BK61NEW'); assert.equal(EcoFlowClient.responseCache.size, 1);
  EcoFlowClient.responseCache.clear();
});

test('wall-clock deadline bounds a request that never gets a socket timeout, and rejects late data', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0; let destroyed = 0; let sendResponse;
  t.mock.method(https, 'request', (_opts, callback) => {
    requests++;
    const req = new EventEmitter();
    req.end = () => {};
    req.destroy = () => { destroyed++; }; // Deadline must settle even without an error event.
    sendResponse = () => {
      const res = new EventEmitter(); res.destroy = () => { destroyed++; };
      callback(res);
      res.emit('data', Buffer.from('{"code":"0","data":{"sn":"ES22SYNTHETIC"}}'));
      res.emit('end');
    };
    return req;
  });
  const request = client().requestOnce('GET', '/test');
  const rejected = assert.rejects(request, /deadline exceeded/);
  t.mock.timers.tick(15000);
  await rejected;
  sendResponse();
  assert.equal(requests, 1);
  assert.equal(destroyed, 2);
});

test('response trickle does not reset wall-clock deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let res; let destroyed = false;
  t.mock.method(https, 'request', (_opts, callback) => {
    const req = new EventEmitter(); req.destroy = () => { destroyed = true; };
    req.end = () => { res = new EventEmitter(); res.statusCode = 200; callback(res); };
    return req;
  });
  const pending = client().requestOnce('GET', '/test');
  const rejected = assert.rejects(pending, /deadline exceeded/);
  for (let i = 0; i < 3; i++) { res.emit('data', Buffer.from(' ')); t.mock.timers.tick(5000); }
  await rejected;
  assert.equal(destroyed, true);
});

test('abort stops a main lookup without retrying, and a pre-aborted request never sends', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0; let destroyed = 0;
  t.mock.method(https, 'request', () => {
    requests++;
    const req = new EventEmitter(); req.end = () => {}; req.destroy = () => { destroyed++; };
    return req;
  });
  const controller = new AbortController();
  const pending = client().getMainSn('BK11SYNTHETIC', { fresh: true, signal: controller.signal });
  const rejected = assert.rejects(pending, /cancelled/);
  controller.abort();
  await rejected;
  t.mock.timers.tick(60000);
  await assert.rejects(client().getMainSn('BK11SYNTHETIC', { signal: controller.signal }), /cancelled/);
  assert.equal(requests, 1);
  assert.equal(destroyed, 1);
});

test('HTTP rate limits are not retried even when the body is not JSON', async (t) => {
  response(t, 'PRIVATE RATE LIMIT PAGE', 429);
  const request = https.request;
  let count = 0;
  t.mock.method(https, 'request', (...args) => { count++; return request(...args); });
  await assert.rejects(client().getMainSn('BK11SYNTHETIC', { fresh: true }), e => {
    assert.equal(e.code, '429'); assert.ok(!e.message.includes('PRIVATE')); return true;
  });
  assert.equal(count, 1);
});

test('successful requests remove abort listeners and deadline timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  response(t, '{"code":"0","data":{"sn":"ES22SYNTHETIC"}}');
  const controller = new AbortController();
  let added = 0; let removed = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  t.mock.method(controller.signal, 'addEventListener', (...args) => { added++; return add(...args); });
  t.mock.method(controller.signal, 'removeEventListener', (...args) => { removed++; return remove(...args); });
  assert.equal(await client().getMainSn('BK11SYNTHETIC', { fresh: true, signal: controller.signal }), 'ES22SYNTHETIC');
  assert.equal(added, 1); assert.equal(removed, 1);
  controller.abort();
  t.mock.timers.tick(60000); // No late timeout or abort after successful completion.
});

test('control PUT and selective POST preserve actual envelopes for ACK and configuration normalization', async (t) => {
  const {
    normalizeStream5000ReserveAck: ack,
    normalizeStream5000ReserveConfiguration: configuration,
  } = require('../.homeybuild/lib/stream5000ControlContract');
  const target = {
    targetKey: 'synthetic-target', installationKey: 'synthetic-installation',
    model: 'STREAM_5000', firmware: 'synthetic-only', scope: 'system',
    routing: 'qualified_system_main', commandTargetSn: 'ES21SYNTHETICMAIN', generation: 1,
  };
  const data = { 'bpBackupConfig-backupSocOnOff': true, 'bpBackupConfig-backupSoc': 51 };
  response(t, JSON.stringify({ code: '0', data }));
  const c = client();
  assert.equal(ack('synthetic-op', { transport: 'http', body: await c.setQuotaEnvelope({ sn: target.commandTargetSn }) }).code, 0);
  const body = await c.getQuotaEnvelope(target.commandTargetSn, Object.keys(data));
  const context = {
    now: 1002, target, authority: { revision: 1 },
    configuration: {
      source: 'official_native', generation: 1, commandTargetSn: target.commandTargetSn,
      receivedAt: 1002, reserveEnabled: true, reservePercent: 51,
    },
  };
  const query = { operationId: 'synthetic-op', queryId: 'synthetic-query', requestedAt: 1001 };
  assert.equal(configuration(context, query, {
    queryId: query.queryId, receivedAt: 1002, target, authorityRevision: 1,
    source: 'official_native_selective', independent: true, body,
  }).reservePercent, 51);
  assert.deepEqual(await c.setQuota({ sn: target.commandTargetSn }), data, 'legacy consumers retain unwrapped data');
});

test('control envelopes reject coerced statuses and private error text while legacy numeric success stays compatible', async (t) => {
  for (const code of [0, null, undefined, '00', '1', 'PRIVATE-IDENTIFIER']) {
    response(t, JSON.stringify({ code, message: 'PRIVATE-RESPONSE', data: {} }));
    await assert.rejects(client().setQuotaEnvelope({ sn: 'SYNTHETIC' }), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE/);
      return true;
    });
    t.mock.restoreAll();
  }
  response(t, '{"code":0,"data":{"legacy":true}}');
  assert.deepEqual(await client().setQuota({ sn: 'SYNTHETIC' }), { legacy: true });
});

test('control PUT and selective POST honor pre-abort and cancel the one dispatched request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0; let destroyed = 0;
  t.mock.method(https, 'request', () => {
    requests++;
    const req = new EventEmitter();
    req.end = () => {}; req.write = () => {}; req.destroy = () => { destroyed++; };
    return req;
  });
  for (const method of ['set', 'get']) {
    const c = client(); const controller = new AbortController();
    const call = () => method === 'set'
      ? c.setQuotaEnvelope({ sn: 'SYNTHETIC' }, { signal: controller.signal })
      : c.getQuotaEnvelope('SYNTHETIC', ['field'], { signal: controller.signal });
    const pending = call(); const rejected = assert.rejects(pending, /cancelled/);
    controller.abort(); await rejected;
    const before = requests;
    await assert.rejects(call(), /cancelled/);
    assert.equal(requests, before);
  }
  t.mock.timers.tick(60000);
  assert.equal(requests, 2);
  assert.equal(destroyed, 2);
});

test('the control main lookup has one attempt and its total deadline is not extended by trickle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0; let destroyed = 0; let res;
  t.mock.method(https, 'request', (_options, callback) => {
    requests++;
    const req = new EventEmitter();
    req.destroy = () => { destroyed++; };
    req.end = () => { res = new EventEmitter(); res.statusCode = 200; callback(res); };
    return req;
  });
  const pending = client().getMainSnEnvelope('SYNTHETIC', { timeoutMs: 1000 });
  const rejected = assert.rejects(pending, /deadline exceeded/);
  res.emit('data', Buffer.from(' ')); t.mock.timers.tick(999);
  res.emit('data', Buffer.from(' ')); t.mock.timers.tick(1);
  await rejected;
  t.mock.timers.tick(60000);
  assert.equal(requests, 1);
  assert.equal(destroyed, 1);
  for (const timeoutMs of [0, -1, 15001, 1.5, NaN]) {
    await assert.rejects(client().getMainSnEnvelope('SYNTHETIC', { timeoutMs }), /invalid request deadline/);
  }
  assert.equal(requests, 1);
});

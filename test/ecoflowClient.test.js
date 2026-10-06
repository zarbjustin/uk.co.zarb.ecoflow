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

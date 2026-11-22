'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CoordinationWorkspace } = require('../.homeybuild/lib/coordinationWorkspace');

function clock() {
  let now = 100000, id = 0;
  const timers = new Map();
  return { timers, now: () => now,
    set(fn, ms) { const handle = id++; timers.set(handle, { fn, at: now + ms }); return handle; },
    clear(handle) { timers.delete(handle); },
    advance(ms) { now += ms; for (const [handle, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(handle); timer.fn(); }
    } },
  };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const reader = () => ({ list: async () => ({}), read: async () => null, closes: 0, close() { this.closes++; } });
const open = workspace => workspace.request({ action: 'open', consent: true, clientId: 'synthetic-page' });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('hung opening times out and permits retry without app restart', async () => {
  const time = clock(), old = deferred(), current = reader(); let calls = 0;
  const workspace = new CoordinationWorkspace(() => ++calls === 1 ? old.promise : Promise.resolve(current), time.now, time);
  const pending = open(workspace); time.advance(10000);
  assert.equal((await pending).reason, 'read_timeout'); assert.equal(time.timers.size, 0);
  const next = await open(workspace); assert.equal(next.reason, 'session_open');
  const late = reader(); old.resolve(late); await flush(); assert.equal(late.closes, 1);
  assert.equal((await workspace.request({ action: 'catalog', consent: true, token: next.token })).reason, 'catalog_ready');
  workspace.stop(); assert.equal(current.closes, 1); assert.equal(time.timers.size, 0);
});

test('late old completion cannot clear the busy slot or revoke the retry', async () => {
  for (const rejects of [false, true]) {
    const time = clock(), first = deferred(), second = deferred(); let calls = 0;
    const workspace = new CoordinationWorkspace(() => ++calls === 1 ? first.promise : second.promise, time.now, time);
    const old = open(workspace); time.advance(10000); await old;
    const retry = open(workspace);
    if (rejects) first.reject(new Error('synthetic provider error')); else first.resolve(reader());
    await flush(); assert.equal((await open(workspace)).reason, 'busy'); assert.equal(calls, 2);
    second.resolve(reader()); assert.equal((await retry).reason, 'session_open');
    workspace.stop(); assert.equal(time.timers.size, 0);
  }
});

test('explicit revoke settles an uncancellable opening and allows a replacement session', async () => {
  const time = clock(), old = deferred(); let calls = 0;
  const workspace = new CoordinationWorkspace(() => ++calls === 1 ? old.promise : Promise.resolve(reader()), time.now, time);
  const pending = open(workspace);
  await workspace.request({ action: 'revoke', clientId: 'synthetic-page' });
  assert.equal((await pending).reason, 'session_expired');
  assert.equal((await open(workspace)).reason, 'session_open');
  workspace.stop(); assert.equal(time.timers.size, 0);
  const late = reader(); old.resolve(late); await flush(); assert.equal(late.closes, 1);
});

test('hung catalog is detached at timeout, and an old tab cannot cancel a recovered session', async () => {
  const time = clock(), catalog = deferred(), first = reader(); first.list = () => catalog.promise;
  let calls = 0; const workspace = new CoordinationWorkspace(async () => ++calls === 1 ? first : reader(), time.now, time);
  const old = await open(workspace);
  const pending = workspace.request({ action: 'catalog', token: old.token, consent: true });
  const oldTimers = [...time.timers.values()].map(timer => timer.fn);
  time.advance(10000); assert.equal((await pending).reason, 'read_timeout'); assert.equal(first.closes, 1);
  const next = await open(workspace);
  assert.equal((await workspace.request({ action: 'revoke', token: old.token })).reason, 'session_expired');
  oldTimers.forEach(fn => fn()); catalog.resolve({}); await flush();
  assert.equal((await workspace.request({ action: 'catalog', token: next.token, consent: true })).reason, 'catalog_ready');
  workspace.stop(); assert.equal(time.timers.size, 0);
});

test('shutdown settles pending work, suppresses late work and leaves no owned timer', async () => {
  const time = clock(), waiting = deferred();
  const workspace = new CoordinationWorkspace(() => waiting.promise, time.now, time);
  const pending = open(workspace); workspace.stop();
  assert.equal((await pending).reason, 'session_expired'); assert.equal(time.timers.size, 0);
  assert.equal((await open(workspace)).reason, 'session_expired');
  const late = reader(); waiting.resolve(late); await flush(); assert.equal(late.closes, 1);
});

test('provider failures remain read_failed with no sensitive detail and do not lock the workspace', async () => {
  const time = clock(); let calls = 0;
  const workspace = new CoordinationWorkspace(async () => { if (++calls === 1) throw new Error('PRIVATE_TOKEN'); return reader(); }, time.now, time);
  const failed = await open(workspace); assert.equal(failed.reason, 'read_failed');
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_TOKEN/);
  assert.equal((await open(workspace)).reason, 'session_open'); workspace.stop(); assert.equal(time.timers.size, 0);
});

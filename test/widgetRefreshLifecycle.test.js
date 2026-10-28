'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ids = ['stream_flow', 'stream_balance', 'stream_battery_plan', 'stream_solar_forecast', 'stream_tariff_opportunity'];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(id) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'widgets', id, 'public/index.html'), 'utf8');
  const elements = new Map();
  for (const [, name] of html.matchAll(/id="([^"]+)"/g)) {
    const classes = new Set();
    elements.set(name, { textContent: '', innerHTML: '', style: {}, classList: {
      add: value => classes.add(value), contains: value => classes.has(value),
      toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value),
    } });
  }
  const card = elements.get('card') || { classList: { add() {}, toggle() {} } };
  const timers = new Map(); const listeners = {}; const requests = []; let next = 0;
  const context = vm.createContext({
    document: { getElementById: name => elements.get(name), querySelector: () => card },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    setInterval: (fn, ms) => { timers.set(++next, { fn, ms, interval: true }); return next; },
    clearInterval: handle => timers.delete(handle),
    setTimeout: (fn, ms) => { timers.set(++next, { fn, ms, interval: false }); return next; },
    clearTimeout: handle => timers.delete(handle),
  });
  for (const [, script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
  context.onHomeyReady({
    __: key => key, getSettings: () => ({}), getDeviceIds: () => ['selected-system'], ready() {},
    api: (_method, url) => { const request = deferred(); requests.push({ ...request, url }); return request.promise; },
  });
  return { elements, timers, requests, listeners,
    tick: () => { for (const timer of [...timers.values()]) if (timer.interval) timer.fn(); },
    timeout: () => { for (const [key, timer] of [...timers]) if (!timer.interval) { timers.delete(key); timer.fn(); } },
  };
}
const response = name => ({ ok: true, name, available: true });
for (const id of ids) {
  test(`${id}: timed-out request retries and late success cannot overwrite recovered data`, async () => {
    const h = harness(id);
    h.tick(); assert.equal(h.requests.length, 1, 'ordinary slow requests do not overlap');
    h.timeout(); await flush();
    assert.equal(h.elements.get('title').textContent, 'widgets.common.data_unavailable');
    h.tick(); assert.equal(h.requests.length, 2);
    h.requests[0].resolve(response('Obsolete')); await flush();
    assert.notEqual(h.elements.get('title').textContent, 'Obsolete');
    h.tick(); assert.equal(h.requests.length, 2, 'obsolete completion cannot unlock the current request');
    h.requests[1].resolve(response('Recovered')); await flush();
    assert.equal(h.elements.get('title').textContent, 'Recovered');
    h.tick(); assert.equal(h.requests.length, 3, 'refresh continues after recovery');
    h.listeners.pagehide(); assert.equal(h.timers.size, 0);
  });
  test(`${id}: restored page resumes exactly one timer and discards pre-hide completion`, async () => {
    const h = harness(id);
    h.listeners.pagehide(); assert.equal(h.timers.size, 0);
    h.listeners.pageshow(); h.listeners.pageshow();
    assert.equal(h.requests.length, 2);
    assert.equal([...h.timers.values()].filter(t => t.interval).length, 1);
    h.requests[1].resolve(response('Restored')); await flush();
    h.requests[0].reject(new Error('old session')); await flush();
    assert.equal(h.elements.get('title').textContent, 'Restored');
    h.tick(); assert.equal(h.requests.length, 3);
    assert.ok(h.requests.every(r => r.url.includes('deviceId=selected-system')));
    h.listeners.pagehide(); assert.equal(h.timers.size, 0);
  });
}

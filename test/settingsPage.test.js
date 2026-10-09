'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SETTINGS_HTML = path.join(__dirname, '..', 'settings', 'index.html');
const APP_AUTH_KEYS = ['appAuthEmail', 'appAuthPassword', 'appAuthHost'];

/** The inline settings script, run exactly as the settings page runs it. */
function loadSettingsScript() {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  const blocks = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  const source = blocks.find((b) => b.includes('onHomeyReady'));
  assert.ok(source, 'settings/index.html has no onHomeyReady script');
  const context = vm.createContext({
    console, setTimeout, Promise, document: fakeDocument(),
  });
  vm.runInContext(source, context);
  return context;
}

/** Minimal stand-in for the handful of DOM features the page uses. */
function fakeDocument() {
  const elements = new Map();
  return {
    elements,
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          value: '',
          checked: true,
          textContent: '',
          style: {},
          handlers: {},
          addEventListener(event, handler) {
            this.handlers[event] = handler;
          },
          click() {
            return this.handlers.click ? this.handlers.click() : undefined;
          },
          change() {
            return this.handlers.change ? this.handlers.change() : undefined;
          },
        });
      }
      return elements.get(id);
    },
  };
}

/**
 * Settings-API stub. `failures` maps a key to the error a call for it produces,
 * so a partially failing removal can be reproduced.
 */
function fakeHomey({
  values = {}, unsetFails = {}, setFails = {}, withUnset = true, confirmAccepted = true,
} = {}) {
  const store = new Map(Object.entries(values));
  const homey = {
    store,
    ready() {},
    get(key, cb) {
      cb(null, store.has(key) ? store.get(key) : undefined);
    },
    set(key, value, cb) {
      if (setFails[key]) {
        cb(new Error(setFails[key]));
        return;
      }
      store.set(key, value);
      cb(null);
    },
    api(method, url, body, cb) {
      cb(null, {});
    },
    confirm(message, type, cb) {
      cb(null, confirmAccepted);
    },
  };
  if (withUnset) {
    homey.unset = (key, cb) => {
      if (unsetFails[key]) {
        cb(new Error(unsetFails[key]));
        return;
      }
      store.delete(key);
      cb(null);
    };
  }
  return homey;
}

function storedAccount() {
  return { appAuthEmail: 'tester@example.invalid', appAuthPassword: 'not-a-real-password', appAuthHost: 'https://api.ecoflow.com' };
}

async function clickRemove(homey) {
  const context = loadSettingsScript();
  context.onHomeyReady(homey);
  const button = context.document.getElementById('clearAppAuth');
  await button.click();
  return {
    status: context.document.getElementById('appAuthSaved').textContent,
    state: context.document.getElementById('appAuthState').textContent,
  };
}

test('removing the EcoFlow account clears every credential key', async () => {
  const homey = fakeHomey({ values: storedAccount() });
  const { status, state } = await clickRemove(homey);

  for (const key of APP_AUTH_KEYS) assert.strictEqual(homey.store.has(key), false, `${key} was left behind`);
  assert.match(status, /^Removed\./);
  assert.match(state, /No EcoFlow account stored/);
});

test('support report copies displayed JSON only and handles unavailable clipboard', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  homey.api = (_method, _url, _body, cb) => cb(null, { schemaVersion: 6, drivers: [] });
  const copied = [];
  context.navigator = { clipboard: { writeText: async text => copied.push(text) } };
  context.onHomeyReady(homey);
  const show = context.document.getElementById('supportSnapshot');
  const copy = context.document.getElementById('copySupportSnapshot');
  await copy.click();
  assert.equal(copied.length, 0);
  await show.click();
  assert.equal(copy.disabled, false);
  await copy.click();
  assert.equal(copied[0], context.document.getElementById('supportSnapshotResult').textContent);
  assert.deepEqual(JSON.parse(copied[0]), { schemaVersion: 6, drivers: [] });
  context.navigator.clipboard.writeText = async () => { throw new Error('PRIVATE'); };
  await copy.click();
  assert.match(context.document.getElementById('supportCopyStatus').textContent, /copy it manually/);
  homey.api = (_method, _url, _body, cb) => cb(new Error('PRIVATE'));
  await show.click();
  assert.equal(copy.disabled, true);
  await copy.click();
  assert.equal(copied.length, 1, 'an old report is never copied after a failed refresh');
});

test('a failing unset is reported instead of a false success', async () => {
  const homey = fakeHomey({
    values: storedAccount(),
    unsetFails: { appAuthEmail: 'settings unavailable' },
  });
  const { status, state } = await clickRemove(homey);

  assert.ok(!status.startsWith('Removed'), `unexpected success message: ${status}`);
  assert.match(status, /Could not remove/);
  assert.match(status, /settings unavailable/);
  // The password did get cleared, and the page reports what is really left.
  assert.strictEqual(homey.store.has('appAuthPassword'), false);
  assert.strictEqual(homey.store.get('appAuthEmail'), 'tester@example.invalid');
  assert.match(state, /Signed in as/);
});

test('a failing password unset stops before claiming anything was removed', async () => {
  const homey = fakeHomey({
    values: storedAccount(),
    unsetFails: { appAuthPassword: 'boom' },
  });
  const { status } = await clickRemove(homey);

  assert.match(status, /Could not remove/);
  assert.strictEqual(homey.store.get('appAuthPassword'), 'not-a-real-password');
  // Nothing after the first failure is claimed as done.
  assert.strictEqual(homey.store.has('appAuthEmail'), true);
});

test('an older Homey without unset still clears the account through set(null)', async () => {
  const homey = fakeHomey({ values: storedAccount(), withUnset: false });
  const { status, state } = await clickRemove(homey);

  for (const key of APP_AUTH_KEYS) assert.strictEqual(homey.store.get(key), null, `${key} was not nulled`);
  assert.match(status, /^Removed\./);
  assert.match(state, /No EcoFlow account stored/);
});

test('a failing set fallback is reported too', async () => {
  const homey = fakeHomey({
    values: storedAccount(),
    withUnset: false,
    setFails: { appAuthHost: 'settings unavailable' },
  });
  const { status } = await clickRemove(homey);

  assert.ok(!status.startsWith('Removed'), `unexpected success message: ${status}`);
  assert.match(status, /Could not remove/);
  assert.strictEqual(homey.store.get('appAuthHost'), 'https://api.ecoflow.com');
});

test('the stored password is never read back into the page', () => {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  assert.ok(!html.includes("Homey.get('appAuthPassword'"));
  assert.ok(!html.includes('Homey.get("appAuthPassword"'));
});

test('support report is requested locally on demand and rendered as text', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  let calls = 0;
  homey.api = (method, url, body, cb) => {
    calls += 1;
    assert.equal(method, 'GET');
    assert.equal(url, '/support-snapshot');
    assert.equal(body, null);
    cb(null, { appVersion: '1.10.17', harmless: '<script>not executable</script>' });
  };
  context.onHomeyReady(homey);
  assert.equal(calls, 0);
  await context.document.getElementById('supportSnapshot').click();
  assert.equal(calls, 1);
  const output = context.document.getElementById('supportSnapshotResult');
  assert.match(output.textContent, /1.10.17/);
  assert.match(output.textContent, /<script>not executable/);
  assert.equal(output.innerHTML, undefined);
});

test('support report failure cannot display private exception contents', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  homey.api = (_method, _url, _body, cb) => cb(new Error('secret-token'));
  context.onHomeyReady(homey);
  await context.document.getElementById('supportSnapshot').click();
  assert.match(context.document.getElementById('supportSnapshotResult').textContent, /Could not read/);
  assert.ok(!context.document.getElementById('supportSnapshotResult').textContent.includes('secret-token'));
  assert.equal(context.document.getElementById('supportSnapshot').disabled, false);
});

test('STREAM 5000 beta pairing is disabled by default and requires acknowledgement', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey({ confirmAccepted: false });
  context.onHomeyReady(homey);
  const checkbox = context.document.getElementById('stream5000BetaEnabled');

  assert.strictEqual(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.change();
  assert.strictEqual(checkbox.checked, false);
  assert.strictEqual(homey.store.has('stream5000BetaEnabled'), false);
  assert.match(context.document.getElementById('stream5000BetaSaved').textContent, /remains disabled/i);
});

test('accepting the warning persists STREAM 5000 beta access independently', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  context.onHomeyReady(homey);
  const checkbox = context.document.getElementById('stream5000BetaEnabled');

  checkbox.checked = true;
  await checkbox.change();
  assert.strictEqual(homey.store.get('stream5000BetaEnabled'), true);
  assert.match(context.document.getElementById('stream5000BetaSaved').textContent, /enabled/i);

  checkbox.checked = false;
  await checkbox.change();
  assert.strictEqual(homey.store.get('stream5000BetaEnabled'), false);
  assert.match(context.document.getElementById('stream5000BetaSaved').textContent, /Existing paired devices will continue/i);
});

test('the STREAM 5000 settings clearly disclose the beta API risk', () => {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  assert.match(html, /STREAM 5000 Series \(Beta\)/i);
  assert.match(html, /Experimental, read-only integration/i);
  assert.match(html, /official API/i);
  assert.match(html, /Re-pairing may be required/i);
  assert.match(html, /Disabled by default/i);
  assert.match(html, /not available\s+through the supported public API/i);
  assert.match(html, /Monitoring only/i);
  assert.match(html, /controls are intentionally disabled/i);
});

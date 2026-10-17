'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { CoordinationWorkspace } = require('../.homeybuild/lib/coordinationWorkspace');

function fixture(now) {
  const cap = (title, units, value) => ({ title, units, type: 'number', getable: true, value, lastUpdated: new Date(now).toISOString() });
  return {
    grid: { id: 'grid', driverId: 'synthetic:meter', name: 'Synthetic grid', available: true,
      capabilitiesObj: { measure_power: cap('Grid', 'W', -300) } },
    battery: { id: 'battery', driverId: 'synthetic:battery', name: 'Synthetic external battery', available: true,
      capabilitiesObj: { measure_battery: cap('SOC', '%', 98), measure_power: cap('Battery', 'kW', 0) } },
    stream: { id: 'stream', driverId: 'synthetic:stream', name: 'Synthetic STREAM', available: true,
      capabilitiesObj: { measure_power: cap('STREAM', 'W', 0) } },
  };
}
test('desktop/mobile selected-source settings remain opt-in, clear stale/hidden values and persist metadata only', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      let now = 100000, lists = 0; const reads = [], calls = [];
      const workspace = new CoordinationWorkspace(async () => ({
        list: async () => { lists++; return fixture(now); },
        read: async id => { reads.push(id); return fixture(now)[id]; }, close() {},
      }), () => now);
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
      await page.clock.install({ time: new Date(now) });
      await page.exposeFunction('coordRequest', body => { calls.push(body.action); return workspace.request(body); });
      await page.evaluate(translations => {
        window.savedCoordination = null; window.uiRequests = [];
        window.onHomeyReady({ ready() {}, get(_key, callback) { callback(null, null); },
          set(key, value, callback) { if (key === 'streamCoordinationBindingsV1') window.savedCoordination = value; callback(null); },
          __(key) { return key.split('.').reduce((value, part) => value?.[part], translations) || key; },
          api(method, url, body, callback) { window.uiRequests.push({ method, url });
            if (url === '/coordination-workspace') window.coordRequest(body).then(value => callback(null, value), () => callback(new Error('PRIVATE')));
            else callback(null, {});
          } });
      }, require('../locales/en.json'));
      await page.locator('#coordinationTitle').click();
      assert.equal(await page.locator('#coord-consent').isChecked(), false); assert.equal(lists, 0); assert.equal(reads.length, 0);
      assert.equal(await page.locator('#coord-flow-consent').isChecked(), false);
      assert.match(await page.locator('#coord-flow-status').innerText(), /has not been checked/);
      assert.equal(await page.locator('#coord-flow-start').isEnabled(), false);
      await page.locator('#coord-consent').check(); assert.equal(calls.length, 0);
      await page.locator('#coord-load').click();
      await page.waitForFunction(() => document.querySelectorAll('#coord-grid option').length > 1, null, { timeout: 5000 });
      assert.equal(lists, 1); assert.equal(reads.length, 0);
      assert.equal(await page.locator('#coord-grid').inputValue(), '', 'no auto-selected source');
      await page.locator('#coord-site').fill('home');
      for (const [slot, index, sign] of [['grid', '0', 'import'], ['externalSoc', '1', 'soc'], ['externalPower', '2', 'charging'], ['streamPower', '3', 'charging']]) {
        await page.locator('#coord-' + slot).selectOption(index); await page.locator('#coord-sign-' + slot).selectOption(sign);
      }
      for (const id of ['reviewed', 'noManualOverride', 'noCompetingController', 'otherSourcesReviewed']) await page.locator('#coord-' + id).check();
      await page.locator('#coord-save').click(); await page.waitForFunction(() => window.savedCoordination !== null, null, { timeout: 5000 });
      const saved = await page.evaluate(() => window.savedCoordination);
      assert.equal(saved.sources.grid.deviceId, 'grid'); assert.doesNotMatch(JSON.stringify(saved), /lastUpdated|"value"|"at"|Synthetic/);
      await page.locator('#coord-sign-grid').selectOption('export');
      assert.equal(await page.locator('#coord-reviewed').isChecked(), false);
      assert.equal(await page.locator('#coord-noCompetingController').isChecked(), false);
      await page.locator('#coord-sign-grid').selectOption('import');
      for (const id of ['reviewed', 'noManualOverride', 'noCompetingController', 'otherSourcesReviewed']) await page.locator('#coord-' + id).check();
      now += 2500; await page.clock.runFor(2500);
      await page.locator('#coord-evaluate').click(); await page.waitForFunction(() => document.getElementById('coord-result').textContent.includes('Waiting'), null, { timeout: 5000 });
      const text = await page.locator('#coord-result').innerText();
      assert.match(text, /-300 W/); assert.match(text, /0 W/); assert.match(text, /remain disabled/);
      assert.deepEqual(reads, ['grid', 'battery', 'stream']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#coordinationPanel').screenshot({ path: `/tmp/ecoflow-coordination-${viewport.width === 390 ? 'mobile' : 'desktop'}.png` });
      const before = calls.length; await page.clock.runFor(60001);
      assert.match(await page.locator('#coord-status').innerText(), /expired/);
      assert.equal(await page.locator('#coord-result').innerText(), ''); assert.equal(calls.length, before, 'expiry never polls');
      await page.locator('#coord-load').click();
      await page.waitForFunction(() => document.getElementById('coord-status').textContent.startsWith('Choose sources'), null, { timeout: 5000 });
      assert.equal(await page.locator('#coord-grid').inputValue(), '0', 'saved selection survives an explicit picker reload');
      assert.equal(await page.locator('#coord-reviewed').isChecked(), false, 'saved bindings never restore current confirmations');
      await page.locator('#coord-consent').uncheck();
      await page.waitForFunction(() => document.getElementById('coord-status').textContent.includes('off'));
      assert.equal(await page.locator('#coord-bindings').isVisible(), false);
      assert.equal(await page.locator('#coord-reviewed').isChecked(), false);
      assert.equal(await page.locator('#coord-noCompetingController').isChecked(), false);
      assert.equal(await page.locator('#coord-grid option').count(), 1);
      assert.deepEqual(errors, []);
      workspace.stop(); await page.close();
    }
  } finally { await browser.close(); }
});

test('Flow monitoring has separate opt-in, explicit start/stop and no automatic activation or hidden-page lease extension', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
    await page.evaluate(({ translations, devices }) => {
      window.flowCalls = []; window.saved = [];
      let revision = 0;
      window.onHomeyReady({ ready() {}, get(_key, cb) { cb(null, null); },
        set(key, value, cb) { window.saved.push({ key, value }); cb(null); },
        __(key) { return key.split('.').reduce((value, part) => value?.[part], translations) || key; },
        api(_method, url, body, cb) {
          if (url === '/coordination-flow-monitor') {
            window.flowCalls.push(body);
            if (body.action === 'status') {
              if (window.delayFlowStatus) { window.delayedFlowStatus = cb; return; }
              return cb(null, { revision, active: false });
            }
            revision++;
            return cb(null, { revision, active: body.action === 'start', state: 'waiting', reason: 'monitor_starting' });
          }
          if (url === '/coordination-workspace') return cb(null, body.action === 'open' ? { token: 'synthetic-session' }
            : { sources: Object.values(devices).flatMap(d => Object.entries(d.capabilitiesObj).map(([id, c]) => ({
              deviceId: d.id, driverId: d.driverId, capabilityId: id, unit: c.units, name: d.name, title: c.title }))) });
          cb(null, {});
        } });
    }, { translations: require('../locales/en.json'), devices: fixture(100000) });
    await page.locator('#coordinationTitle').click();
    await page.locator('#coord-flow-consent').check();
    assert.deepEqual(await page.evaluate(() => window.flowCalls), []);
    await page.locator('#coord-consent').check(); await page.locator('#coord-load').click();
    await page.locator('#coord-site').fill('home');
    for (const [slot, index, sign] of [['grid', '0', 'import'], ['externalSoc', '1', 'soc'], ['externalPower', '2', 'charging'], ['streamPower', '3', 'charging']]) {
      await page.locator('#coord-' + slot).selectOption(index); await page.locator('#coord-sign-' + slot).selectOption(sign);
    }
    for (const id of ['reviewed', 'noManualOverride', 'noCompetingController', 'otherSourcesReviewed']) await page.locator('#coord-' + id).check();
    assert.deepEqual(await page.evaluate(() => window.flowCalls), [], 'page preview does not start Flow reads');
    await page.locator('#coord-flow-start').click();
    assert.match(await page.locator('#coord-flow-status').innerText(), /Last checked.*was active.*30 minutes/);
    const calls = await page.evaluate(() => window.flowCalls);
    assert.deepEqual(calls.map(c => c.action), ['status', 'start']);
    assert.equal(calls[1].expectedRevision, 0); assert.equal(calls[1].flowConsent, true);
    assert.equal(calls[1].bindings.sources.grid.deviceId, 'grid');
    assert.deepEqual(calls[1].policy, { startSoc: 98, stopSoc: 97 });
    assert.deepEqual(await page.evaluate(() => window.saved), []);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal((await page.evaluate(() => window.flowCalls)).length, 2, 'hidden page does not extend, restart or silently revoke independent Flow consent');
    await page.locator('#coord-flow-stop').click();
    assert.equal(await page.locator('#coord-flow-consent').isChecked(), false);
    assert.match(await page.locator('#coord-flow-status').innerText(), /off/);
    assert.equal((await page.evaluate(() => window.flowCalls)).at(-1).action, 'stop');
    // A delayed status reply must not schedule Start after Stop was requested.
    await page.locator('#coord-consent').check(); await page.locator('#coord-load').click();
    for (const [slot, index, sign] of [['grid', '0', 'import'], ['externalSoc', '1', 'soc'], ['externalPower', '2', 'charging'], ['streamPower', '3', 'charging']]) {
      await page.locator('#coord-' + slot).selectOption(index); await page.locator('#coord-sign-' + slot).selectOption(sign);
    }
    for (const id of ['reviewed', 'noManualOverride', 'noCompetingController', 'otherSourcesReviewed']) await page.locator('#coord-' + id).check();
    await page.evaluate(() => { window.delayFlowStatus = true; });
    await page.locator('#coord-flow-consent').check(); await page.locator('#coord-flow-start').click();
    await page.locator('#coord-flow-stop').click();
    await page.evaluate(() => window.delayedFlowStatus(null, { revision: 2, active: false }));
    assert.equal((await page.evaluate(() => window.flowCalls)).filter(c => c.action === 'start').length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close();
  } finally { await browser.close(); }
});

test('restored bindings do not restore consent; hiding the page clears readings and revokes access', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
    await page.evaluate(translations => {
      window.actions = [];
      window.onHomeyReady({ ready() {},
        get(key, cb) { cb(null, key === 'streamCoordinationBindingsV1' ? { schemaVersion: 1, siteKey: 'saved-home', sources: {} } : null); },
        __(key) { return key.split('.').reduce((value, part) => value?.[part], translations) || key; },
        api(_method, url, body, cb) {
          if (url !== '/coordination-workspace') return cb(null, {});
          window.actions.push(body.action);
          cb(null, body.action === 'open' ? { token: 'synthetic-session' } : { sources: [] });
        } });
    }, require('../locales/en.json'));
    await page.locator('#coordinationTitle').click();
    assert.equal(await page.locator('#coord-consent').isChecked(), false);
    assert.deepEqual(await page.evaluate(() => window.actions), []);
    await page.locator('#coord-consent').check(); await page.locator('#coord-load').click();
    assert.equal(await page.locator('#coord-site').inputValue(), 'saved-home');
    await page.evaluate(() => {
      document.getElementById('coord-result').textContent = 'synthetic old reading';
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('#coord-result').innerText(), '');
    assert.equal(await page.locator('#coord-consent').isChecked(), false);
    assert.equal(await page.locator('#coord-grid option').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.actions), ['open', 'catalog', 'revoke']);
    await page.close();
  } finally { await browser.close(); }
});

test('late responses after edits/opt-out are ignored and all locale labels exist', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
    await page.evaluate(translations => {
      window.late = null;
      window.onHomeyReady({ ready() {}, get(_key, cb) { cb(null, null); },
        __(key) { return key.split('.').reduce((value, part) => value?.[part], translations) || key; },
        api(_method, url, _body, cb) { if (url === '/coordination-workspace') window.late = cb; else cb(null, {}); } });
    }, require('../locales/de.json'));
    await page.locator('#coordinationTitle').click(); await page.locator('#coord-consent').check();
    await page.locator('#coord-load').click(); await page.evaluate(() => { window.oldLate = window.late; });
    await page.locator('#coord-consent').uncheck();
    await page.evaluate(() => window.oldLate(null, { token: 'late-private-token', sources: [{ name: 'PRIVATE' }] }));
    assert.doesNotMatch(await page.locator('#coordinationWorkspace').innerText(), /PRIVATE|late-private-token|coordination\./);
    for (const language of ['de', 'nl']) assert.deepEqual(Object.keys(require(`../locales/${language}.json`).coordination).sort(),
      Object.keys(require('../locales/en.json').coordination).sort());
    await page.close();
  } finally { await browser.close(); }
});

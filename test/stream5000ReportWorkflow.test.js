'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('desktop/mobile reports explain an unmetered unit-only setup without writes or automatic discovery', async () => {
  const browser = await chromium.launch();
  const translations = require('../locales/en.json');
  const now = 100000;
  const field = value => ({ value, ageSec: 1, stale: false });
  const report = { schemaVersion: 19, capturedAt: new Date(now).toISOString(), appVersion: '1.10.56', drivers: [
    { id: 'stream', pairedCount: 0 },
    { id: 'stream_5000_unit', pairedCount: 1,
      physicalPower: [{ status: 'waiting_for_unit_evidence', physicalScopeVerified: false, energyContribution: false }],
      batteryReadingStatus: [{ status: 'last_reported_standby', lastStandbyAgeSec: 420, live: false, energyUsed: false }],
      configuration: [{ values: { backupReserveEnabled: field(false), backupReservePct: field(37) } }],
      systemFlow: [{ fields: { gridFlowNetW: field(3) } }] },
    { id: 'stream_5000_system', pairedCount: 0 },
  ] };
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [], calls = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
      await page.locator('#supportTitle').click();
      await page.clock.install({ time: new Date(now) });
      await page.exposeFunction('recordOwnerReportCall', (method, url) => { calls.push({ method, url }); });
      await page.exposeFunction('recordOwnerReportWrite', key => { writes.push(key); });
      await page.evaluate(({ strings, snapshot }) => {
        window.onHomeyReady({ ready() {}, get(_key, callback) { callback(null, null); },
          set(key, _value, callback) { window.recordOwnerReportWrite(key); callback(null); },
          __(key) { return key.split('.').reduce((value, part) => value?.[part], strings) || key; },
          api(method, url, _body, callback) {
            window.recordOwnerReportCall(method, url);
            callback(null, url === '/support-snapshot' ? snapshot : {});
          } });
      }, { strings: translations, snapshot: report });
      await page.getByRole('button', { name: 'Show integration support report', exact: true }).click();
      const text = await page.locator('#reporterStatus').innerText();
      assert.match(text, /Only STREAM 5000 Unit monitors are paired/);
      assert.doesNotMatch(text, /fresh Unit power reading/);
      assert.match(text, /Last report: Standby \(not live\)/);
      assert.match(text, /Current power and state have expired/);
      assert.match(text, /420 s/);
      assert.match(text, /Backup reserve \(reported setting\) 1: Disabled/);
      assert.match(text, /Stored reserve target: 37%/);
      assert.match(text, /Max Power from Grid limits grid draw, not total charging power or a charge-task target/);
      assert.match(text, /system scope is not independently verified/);
      assert.match(text, /Reported grid-meter power: Unavailable or stale/);
      assert.match(text, /Flow-derived grid power: 3 W/);
      assert.equal(await page.locator('#enableDualCtPreview').isChecked(), false);
      assert.equal(await page.locator('#coord-flow-consent').isChecked(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.deepEqual(calls, [{ method: 'GET', url: '/support-snapshot' }]);
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/ecoflow-owner-report-${viewport.width}.png`, fullPage: true });
      await page.locator('#reporterStatus').screenshot({ path: `/tmp/ecoflow-owner-report-panel-${viewport.width}.png` });
      await page.close();
    }
  } finally { await browser.close(); }
});

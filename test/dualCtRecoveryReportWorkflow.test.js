'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('desktop/mobile Dual CT summary copies single-phase recovery and owned scan evidence using one read-only request', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings/index.html')).href);
      await page.locator('#supportTitle').click();
      await page.evaluate(strings => {
        window.calls = []; window.copied = null;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } });
        window.onHomeyReady({ ready() {}, get(_key, cb) { cb(null, null); }, set() { throw Error('unexpected write'); },
          __(key) { return key.split('.').reduce((o, k) => o?.[k], strings) || key; },
          api(method, url, body, cb) {
            window.calls.push({ method, url, body });
            cb(null, { schemaVersion: 20, appVersion: '1.11.23', homeyVersion: '12.10.0',
              dualCtPreviews: [], dualCtCommunityTrials: [], unrelated: 'PRIVATE_NOT_FOR_SUMMARY',
              dualCtOwnedInventory: { status: 'read_failed', stage: 'settings', driver: 'smartmeter', complete: false, readOnly: true },
              dualCtEnergyRecovery: [{ mode: 'single_phase', startupStage: 'source', active: false, retryScheduled: true,
                context: { stage: 'inventory', reason: 'owned_inventory_read_failed', inventoryStage: 'settings', driver: 'smartmeter' } }] });
          } });
      }, require('../locales/en.json'));
      await page.locator('#dualCtSupportSummary').click();
      const report = JSON.parse(await page.locator('#supportSnapshotResult').textContent());
      assert.equal(report.dualCtEnergyRecovery[0].mode, 'single_phase');
      assert.equal(report.dualCtOwnedInventory.stage, 'settings');
      assert.equal(report.scope, 'dual_ct_support_summary');
      assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
      await page.locator('#copySupportSnapshot').click();
      assert.deepEqual(JSON.parse(await page.evaluate(() => window.copied)), report);
      assert.deepEqual(await page.evaluate(() => window.calls), [{ method: 'GET', url: '/support-snapshot', body: null }]);
      await page.close();
    }
  } finally { await browser.close(); }
});

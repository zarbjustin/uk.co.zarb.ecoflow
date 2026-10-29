'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('release settings separate connections, Energy consent and Support without starting diagnostics or changing settings', async () => {
  const browser = await chromium.launch();
  try {
    for (const language of ['en', 'de', 'nl']) {
      const translations = require(`../locales/${language}.json`);
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
        await page.evaluate(translations => {
          window.requests = []; window.writes = [];
          window.onHomeyReady({ ready() {},
            get(key, cb) { cb(null, key === 'stream5000BetaEnabled' ? true : null); },
            set(key, value, cb) { window.writes.push({ key, value }); cb(null); },
            __(key) { return key.split('.').reduce((value, part) => value?.[part], translations) || key; },
            api(method, url, body, cb) { window.requests.push({ method, url, body }); cb(null, {}); },
          });
        }, translations);
        assert.equal(await page.locator('#supportPanel').getAttribute('open'), null);
        assert.equal(await page.locator('#energySetup').getAttribute('open'), null);
        assert.equal(await page.locator('#developerConnection').getAttribute('open'), null);
        assert.equal(await page.locator('#startDualCtResearch').isVisible(), false);
        assert.equal(await page.locator('#clearAppAuth').isVisible(), false);
        assert.equal(await page.locator('#appConnectionTitle').innerText(), translations.settings.setup.appConnectionTitle);
        assert.equal(await page.locator('#supportTitle').innerText(), translations.settings.setup.supportTitle);
        await page.locator('#energySetupTitle').click();
        assert.equal(await page.locator('#stream5000AggregatePairingEnabled').isChecked(), false);
        assert.equal(await page.locator('#energyAvailability').innerText(), translations.settings.setup.energyAvailability);
        assert.equal(await page.locator('#energyGridHelp').innerText(), translations.settings.setup.energyGridHelp);
        await page.locator('#supportTitle').click();
        await page.locator('#dualCtTitle').click();
        assert.equal(await page.locator('#startDualCtResearch').isVisible(), true);
        assert.deepEqual(await page.evaluate(() => ({ requests: window.requests, writes: window.writes })), { requests: [], writes: [] });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
  } finally { await browser.close(); }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const script = path.join(__dirname, '..', 'settings', 'coordination-settings.js');
async function pageFor(browser, lang, stored, error = false, mobile = false) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  await page.setContent('<details open><summary>Advanced coordination</summary><div id="workspace"></div></details>');
  await page.addScriptTag({ path: script });
  const translations = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', lang + '.json'))).coordination;
  await page.evaluate(({ translations, stored, error }) => {
    window.fixture = { stored, writes: 0, requests: 0, reads: [] };
    window.homey = { __: key => translations[key.replace('coordination.', '')],
      get(key, callback) { window.fixture.reads.push(key); callback(error ? new Error('PRIVATE_FAILURE') : null, stored); },
      set() { window.fixture.writes++; }, api() { window.fixture.requests++; } };
    window.EcoFlowCoordinationSettings.mount(document.getElementById('workspace'), window.homey);
  }, { translations, stored, error });
  return page;
}
test('desktop/mobile migration panel explains external coordination in every shipped locale without broad reads or controls', async () => {
  const browser = await chromium.launch();
  try { for (const lang of ['en', 'de', 'nl']) for (const mobile of [false, true]) {
    const page = await pageFor(browser, lang, null, false, mobile);
    assert(await page.locator('#coord-external-notice').isVisible());
    assert.equal(await page.locator('input, button, select').count(), 0);
    assert.equal(await page.locator('#coord-status').getAttribute('role'), 'status');
    const r = await page.evaluate(() => window.fixture); assert.equal(r.writes, 0); assert.equal(r.requests, 0);
    assert.deepEqual(r.reads, ['streamCoordinationBindingsV1']); await page.close();
  } } finally { await browser.close(); }
});
test('existing bindings are retained byte-for-byte and device identifiers never become settings-page content', async () => {
  const browser = await chromium.launch();
  try { const stored = { schemaVersion: 1, sources: { grid: { deviceId: 'PRIVATE_DEVICE', driverId: 'PRIVATE_DRIVER' } } };
    const page = await pageFor(browser, 'en', stored);
    assert.deepEqual(await page.evaluate(() => window.fixture.stored), stored);
    assert.match(await page.locator('#coord-status').innerText(), /retained/);
    assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_DEVICE|PRIVATE_DRIVER/);
    assert.equal(await page.evaluate(() => window.fixture.writes), 0);
  } finally { await browser.close(); }
});
test('failed saved-binding read is visible without leaking errors or changing settings', async () => {
  const browser = await chromium.launch();
  try { const page = await pageFor(browser, 'en', null, true);
    assert.match(await page.locator('#coord-status').innerText(), /could not be checked/);
    assert.doesNotMatch(await page.locator('body').innerText(), /PRIVATE_FAILURE/);
    assert.equal(await page.evaluate(() => window.fixture.writes), 0);
  } finally { await browser.close(); }
});
test('malformed or hostile saved binding content cannot inject markup or enable a reader', async () => {
  const browser = await chromium.launch();
  try { const page = await pageFor(browser, 'en', '<img src=x onerror="window.injected=true">');
    assert.equal(await page.locator('img').count(), 0); assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.evaluate(() => window.fixture.requests), 0);
  } finally { await browser.close(); }
});
test('remounting and page visibility changes do not start sessions, monitors or writes', async () => {
  const browser = await chromium.launch();
  try { const page = await pageFor(browser, 'en', { sources: {} });
    await page.evaluate(() => { window.EcoFlowCoordinationSettings.mount(document.getElementById('workspace'), window.homey);
      document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#coord-external-notice').count(), 1);
    assert.equal(await page.evaluate(() => window.fixture.requests + window.fixture.writes), 0);
  } finally { await browser.close(); }
});

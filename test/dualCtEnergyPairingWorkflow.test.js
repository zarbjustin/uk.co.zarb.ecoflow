'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '..', 'drivers/smartmeter_dual_ct_energy/pair/energy_setup.html'), 'utf8');
async function pageFor(browser, viewport, language, enabled) {
  const page = await browser.newPage({ viewport });
  await page.setContent('<div id="pair-root"></div>'); await page.clock.install({ time: new Date(100000) });
  await page.evaluate(({ translations, enabled }) => {
    window.calls = []; window.views = [];
    window.Homey = { __(key) { return key.split('.').reduce((v, k) => v?.[k], translations) || key; },
      async emit(name, input) {
        window.calls.push({ name, input });
        if (name === 'dual_ct_energy_access') return { enabled };
        if (name === 'check_app_credentials') return true;
        if (name === 'dual_ct_energy_candidates') return [{ sn: 'SYNTHETIC01', label: 'Dual CT · IC01' }];
        if (name === 'dual_ct_energy_review') return { token: 'synthetic-review', expiresAt: Date.now() + 90000, sourceLabel: '<script>PRIVATE</script>' };
        return true;
      }, async showView(view) { window.views.push(view); } };
  }, { translations: require(`../locales/${language}.json`), enabled });
  await page.locator('#pair-root').evaluate((root, content) => { root.innerHTML = content; }, html);
  // innerHTML does not execute scripts; run only the page's own inline pairing script.
  await page.addScriptTag({ content: html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1] });
  return page;
}
test('desktop/mobile blocked Energy entry is local, translated and cannot prompt login or discovery', async () => {
  const browser = await chromium.launch();
  try {
    for (const language of ['en', 'de', 'nl']) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await pageFor(browser, viewport, language, false);
      assert.equal(await page.locator('#connection').isVisible(), false);
      assert.equal(await page.locator('#status').innerText(), require(`../locales/${language}.json`).dual_ct_energy.unavailable);
      assert.deepEqual(await page.evaluate(() => window.calls.map(row => row.name)), ['dual_ct_energy_access']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.close();
    }
  } finally { await browser.close(); }
});
test('desktop/mobile Energy review requires both acknowledgements, expires and passes only consent to native add flow', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await pageFor(browser, viewport, 'en', true);
      await page.locator('#find').click(); await page.locator('#review').click();
      assert.equal(await page.locator('#approve').isDisabled(), true);
      assert.equal(await page.locator('#reviewSource script').count(), 0, 'source label rendered as text');
      await page.locator('#scopeConsent').check(); assert.equal(await page.locator('#approve').isDisabled(), true);
      await page.locator('#overlapConsent').check(); assert.equal(await page.locator('#approve').isEnabled(), true);
      await page.clock.runFor(90001); assert.equal(await page.locator('#confirmation').isVisible(), false);
      assert.deepEqual(await page.evaluate(() => window.views), []);
      await page.locator('#review').click();
      assert.equal(await page.locator('#scopeConsent').isChecked(), false); assert.equal(await page.locator('#overlapConsent').isChecked(), false);
      await page.locator('#scopeConsent').check(); await page.locator('#overlapConsent').check(); await page.locator('#approve').click();
      assert.deepEqual(await page.evaluate(() => window.views), ['list_devices']);
      const consent = await page.evaluate(() => window.calls.find(row => row.name === 'dual_ct_energy_approve').input);
      assert.deepEqual(consent, { token: 'synthetic-review', consent: true, externalOverlapReviewed: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.close();
    }
  } finally { await browser.close(); }
});

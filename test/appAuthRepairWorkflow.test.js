'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const drivers = ['stream_5000_unit', 'stream_5000_system', 'stream_ac5000', 'stream_unit', 'smartmeter_dual_ct_preview', 'smartmeter_dual_ct_energy'];
const html = fs.readFileSync(path.join(__dirname, '..', 'drivers', drivers[0], 'repair/app_account_repair.html'), 'utf8');
test('every app-connected role offers the same source-preserving account repair view', () => {
  for (const driver of drivers) {
    const manifest = require(`../drivers/${driver}/driver.compose.json`);
    assert.deepEqual(manifest.repair, [{ id: 'app_account_repair' }]);
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'drivers', driver, 'repair/app_account_repair.html'), 'utf8'), html);
  }
});
test('desktop/mobile repair has no automatic requests, clears passwords, requires confirmation and never creates a device', async () => {
  const browser = await chromium.launch();
  try {
    for (const language of ['en', 'de', 'nl']) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.setContent('<div id="root"></div>'); await page.clock.install({ time: new Date(100000) });
      await page.evaluate(translations => {
        window.calls = []; window.Homey = { __(key) { return key.split('.').reduce((v, k) => v?.[k], translations) || key; },
          async emit(name, input) { window.calls.push(name);
            if (name === 'app_account_repair_login') { if (input.password !== 'synthetic-password') throw new Error('PRIVATE'); return { token: 'synthetic-review', expiresAt: Date.now() + 90000, affectedDevices: 2 }; }
            if (name === 'app_account_repair_confirm') return { saved: true };
            return true;
          } };
      }, require(`../locales/${language}.json`));
      await page.locator('#root').evaluate((root, content) => { root.innerHTML = content; }, html);
      await page.addScriptTag({ content: html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1] });
      assert.deepEqual(await page.evaluate(() => window.calls), []);
      await page.locator('#email').fill('synthetic@example.invalid'); await page.locator('#password').fill('synthetic-password'); await page.locator('#login').click();
      assert.equal(await page.locator('#password').inputValue(), ''); assert.equal(await page.locator('#confirm').isDisabled(), true);
      await page.locator('#consent').check(); await page.clock.runFor(90001);
      assert.equal(await page.locator('#review').isVisible(), false); assert.equal(await page.locator('#credentials').isVisible(), true);
      await page.locator('#password').fill('synthetic-password'); await page.locator('#login').click();
      assert.equal(await page.locator('#consent').isChecked(), false); await page.locator('#consent').check(); await page.locator('#confirm').click();
      assert.equal(await page.locator('#credentials').isVisible(), false);
      assert.equal(await page.locator('#status').innerText(), require(`../locales/${language}.json`).app_account_repair.saved);
      const calls = await page.evaluate(() => window.calls);
      assert.equal(calls.filter(name => name === 'app_account_repair_confirm').length, 1);
      assert.equal(calls.some(name => /^(?:add_device|createDevice)$/.test(name)), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.close();
    }
  } finally { await browser.close(); }
});

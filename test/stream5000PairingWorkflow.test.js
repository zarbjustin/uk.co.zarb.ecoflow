'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('desktop/mobile unit pairing needs no gate; Energy pairing fails closed and rechecks explicit consent', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const mock = `<script>window.pairCalls=[];window.views=[];window.energyAccess=false;
        window.Homey={emit:function(name,body,cb){window.pairCalls.push(name);cb(null,window.energyAccess);},
        showView:function(view){window.views.push(view);}};</script>`;
      const html = (driver, view) => fs.readFileSync(path.join(__dirname, '..', 'drivers', driver, 'pair', `${view}.html`), 'utf8');
      await page.setContent(mock + html('stream_5000_unit', 'connection_info'));
      assert.equal(await page.getByRole('heading', { name: 'STREAM 5000 Series Unit', exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.pairCalls), []);
      assert.deepEqual(await page.evaluate(() => window.views), ['app_credentials']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

      await page.setContent(mock + html('stream_5000_system', 'energy_access'));
      assert.equal(await page.getByRole('button', { name: 'I understand, continue', exact: true }).isVisible(), false);
      assert.match(await page.locator('#energy-status').innerText(), /separate Home Battery/);
      assert.deepEqual(await page.evaluate(() => window.pairCalls), ['check_stream_5000_aggregate_access']);
      assert.deepEqual(await page.evaluate(() => window.views), []);
      await page.evaluate(() => { window.energyAccess = 'true'; });
      await page.getByRole('button', { name: 'Check again', exact: true }).click();
      assert.equal(await page.locator('#energy-continue').isVisible(), false, 'truthy string is not consent');
      await page.evaluate(() => { window.energyAccess = true; });
      await page.getByRole('button', { name: 'Check again', exact: true }).click();
      await page.getByRole('button', { name: 'I understand, continue', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.views), ['app_credentials']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

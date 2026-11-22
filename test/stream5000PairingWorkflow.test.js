'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('credential forms announce validation errors and support keyboard use without mobile overflow', async () => {
  const browser = await chromium.launch();
  try {
    for (const driver of ['stream', 'stream_unit', 'stream_solar', 'stream_micro', 'stream_socket', 'smartmeter',
      'stream_ac5000', 'stream_5000_unit', 'stream_5000_system']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const view = driver.includes('5000') ? 'app_credentials' : 'credentials';
      const html = fs.readFileSync(path.join(__dirname, '..', 'drivers', driver, 'pair', `${view}.html`), 'utf8');
      await page.setContent(`<script>window.calls=[];window.Homey={emit:(name,body,cb)=>{calls.push(name);cb(null,false);},showView:()=>{}};</script>${html}`);
      const button = page.locator('#ef-next');
      await button.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('alert').count(), 1, driver);
      assert.match(await page.getByRole('alert').innerText(), /required/i, driver);
      assert.equal(await page.locator('input').count(), 2);
      for (const id of await page.locator('input').evaluateAll(inputs => inputs.map(input => input.id))) {
        assert.equal(await page.locator(`label[for="${id}"]`).count(), 1);
      }
      assert.equal(await page.evaluate(() => calls.some(name => name === 'login' || name === 'app_login')), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('desktop/mobile unit pairing needs no gate; Energy pairing fails closed and rechecks explicit consent', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const mock = `<script>window.pairCalls=[];window.views=[];window.energyAccess=false;window.scopeConfirmation=false;
        window.Homey={emit:function(name,body,cb){window.pairCalls.push(name);cb(null,name==='confirm_stream_5000_installation_scope'?window.scopeConfirmation:window.energyAccess);},
        __:function(key){return key.split('.').reduce((value,k)=>value[k],${JSON.stringify(require('../locales/en.json'))});},
        showView:function(view){window.views.push(view);}};</script>`;
      const html = (driver, view) => fs.readFileSync(path.join(__dirname, '..', 'drivers', driver, 'pair', `${view}.html`), 'utf8');
      await page.setContent(mock + html('stream_5000_unit', 'connection_info'));
      assert.equal(await page.getByRole('heading', { name: 'STREAM 5000 Unit Monitor', exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.pairCalls), []);
      assert.deepEqual(await page.evaluate(() => window.views), ['app_credentials']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

      await page.setContent(mock + html('stream_5000_system', 'energy_access'));
      assert.equal(await page.locator('#energy-continue').isVisible(), false);
      assert.match(await page.locator('#energy-status').innerText(), /Allow Home Battery \(5000\) Energy pairing/);
      assert.deepEqual(await page.evaluate(() => window.pairCalls), ['check_stream_5000_aggregate_access']);
      assert.deepEqual(await page.evaluate(() => window.views), []);
      await page.evaluate(() => { window.energyAccess = 'true'; });
      await page.getByRole('button', { name: 'Check again', exact: true }).click();
      assert.equal(await page.locator('#energy-continue').isVisible(), false, 'truthy string is not consent');
      await page.evaluate(() => { window.energyAccess = true; });
      await page.getByRole('button', { name: 'Check again', exact: true }).click();
      await page.locator('#energy-continue').click();
      assert.deepEqual(await page.evaluate(() => window.views), [], 'rejected scope confirmation must not advance');
      assert.match(await page.locator('#energy-status').innerText(), /separate installation/);
      await page.evaluate(() => { window.scopeConfirmation = 'true'; });
      await page.locator('#energy-continue').click();
      assert.deepEqual(await page.evaluate(() => window.views), [], 'truthy string is not installation confirmation');
      await page.evaluate(() => { window.scopeConfirmation = true; });
      await page.locator('#energy-continue').click();
      assert.deepEqual(await page.evaluate(() => window.views), ['app_credentials']);
      assert.equal(await page.evaluate(() => window.pairCalls.filter(name => name === 'confirm_stream_5000_installation_scope').length), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('all six pairing choices explain scope and alternatives in each locale before anyone selects a device', async () => {
  const browser = await chromium.launch();
  const drivers = require('../app.json').drivers;
  const families = [['stream', 'stream_solar', 'stream_unit'], ['stream_5000_system', 'stream_5000_solar', 'stream_5000_unit']];
  try {
    for (const lang of ['en', 'de', 'nl']) {
      const locale = require('../locales/' + lang + '.json');
      for (const family of families) {
        for (const id of family) {
          const driver = drivers.find(row => row.id === id);
          const role = locale.pair[id === 'stream' ? 'stream_home_battery' : id];
          assert.equal(role.title, driver.name[lang]);
          for (const otherId of family.filter(row => row !== id)) {
            assert.ok(role.other.includes(drivers.find(row => row.id === otherId).name[lang]));
          }
          const view = driver.pair[0].id;
          const markup = fs.readFileSync(path.join(__dirname, '..', 'drivers', id, 'pair', view + '.html'), 'utf8');
          const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
          await page.setContent(`<script>
            window.views = []; window.events = [];
            window.Homey = {
              __: key => key.split('.').reduce((o,k) => o[k], ${JSON.stringify(locale)}),
              emit: (name, data, cb) => { window.events.push(name); cb(null, name === 'check_credentials'); },
              showView: view => window.views.push(view)
            };
          </script>` + markup);
          await page.evaluate(() => {
            for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = Homey.__(el.dataset.i18n);
          });
          assert.equal(await page.getByRole('heading', { name: role.title, exact: true }).isVisible(), true);
          assert.equal(await page.getByText(role.intro, { exact: true }).isVisible(), true);
          assert.equal(await page.getByText(role.other, { exact: true }).isVisible(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.deepEqual(await page.evaluate(() => window.views), []);
          if (view === 'credentials') {
            assert.equal(await page.locator('#ef-access').isVisible(), false);
            const next = page.getByRole('button', { name: locale.pair.choose });
            await next.focus(); await next.press('Enter');
            assert.deepEqual(await page.evaluate(() => window.events), ['check_credentials']);
            assert.deepEqual(await page.evaluate(() => window.views), ['list_devices']);
          } else if (view === 'connection_info') {
            await page.getByRole('button').click();
            assert.deepEqual(await page.evaluate(() => window.views), ['app_credentials']);
            assert.deepEqual(await page.evaluate(() => window.events), []);
          } else {
            assert.equal(await page.locator('#energy-continue').isVisible(), false);
            assert.deepEqual(await page.evaluate(() => window.events), ['check_stream_5000_aggregate_access']);
          }
          await page.close();
        }
      }
    }
  } finally { await browser.close(); }
});

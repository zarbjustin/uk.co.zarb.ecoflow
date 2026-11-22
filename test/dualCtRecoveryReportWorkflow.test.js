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
              dualCtEnergyRecovery: [{ mode: 'single_phase', linkedPowerStatus: 'tag_protection_unconfirmed', startupStage: 'source', active: false, retryScheduled: true,
                feed: { lastPacketAgeSec: 1, lastAcceptedCt1AgeSec: 96, lastRejectionAgeSec: 1,
                  lastRejectionReason: 'unrelated_grid_packet' },
                context: { stage: 'inventory', reason: 'owned_inventory_read_failed', inventoryStage: 'settings', driver: 'smartmeter' } }] });
          } });
      }, require('../locales/en.json'));
      await page.locator('#dualCtSupportSummary').click();
      const report = JSON.parse(await page.locator('#supportSnapshotResult').textContent());
      assert.match(await page.locator('#meterStatus').textContent(), /until Homey confirms the Flow tag/);
      assert.equal(report.dualCtEnergyRecovery[0].linkedPowerStatus, 'tag_protection_unconfirmed');
      assert.equal(report.dualCtEnergyRecovery[0].mode, 'single_phase');
      assert.equal(report.dualCtEnergyRecovery[0].feed.lastAcceptedCt1AgeSec, 96);
      assert.equal(report.dualCtEnergyRecovery[0].feed.lastRejectionReason, 'unrelated_grid_packet');
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

for(const [width,height] of [[390,844],[1280,900]]) {
 test('support can resume a pending Dual CT summary after pagehide/pageshow at width '+width,async()=>{
   const browser=await chromium.launch();
   try {
    const page=await browser.newPage({viewport:{width,height}});
    await page.goto(pathToFileURL(path.join(__dirname,'..','settings','index.html')).href);
    await page.locator('#supportTitle').click();
    await page.evaluate(strings=>{
      window.calls=[];window.onHomeyReady({ready(){},get(k,cb){cb(null,null);},set(){throw Error('unexpected write')},
        __(key){return key.split('.').reduce((o,k)=>o?.[k],strings)||key;},api(method,url,body,cb){window.calls.push({method,url});window.pendingReport=cb;}});
    },require('../locales/en.json'));
    await page.locator('#dualCtSupportSummary').click();
    const result=await page.evaluate(()=>{
      dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
      dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      window.pendingReport(null,{appVersion:'STALE_CALLBACK'});
      return {summary:document.querySelector('#dualCtSupportSummary').disabled,comparison:document.querySelector('#dualCtComparisonStep').disabled,
        general:document.querySelector('#supportSnapshot').disabled,output:document.querySelector('#supportSnapshotResult').textContent,calls:window.calls};
    });
    assert.equal(result.output,'');assert.deepEqual(result.calls,[{method:'GET',url:'/support-snapshot'}]);assert.equal(result.general,false);
    assert.equal(result.summary,false);assert.equal(result.comparison,false);
   } finally {await browser.close();}
 });
}

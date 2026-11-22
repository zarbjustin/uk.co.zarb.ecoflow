'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { varint, packet } = require('./helpers/dualCtSynthetic');

// Exercise the shipped settings, API, app lifecycle and decoder together. Only
// inventory, transport and the capture clock are synthetic; no cloud access.
const load = Module._load;
let EcoFlowApp;
try {
  Module._load = function (request, ...args) {
    if (request === 'homey') return { App: class {} };
    return load.call(this, request, ...args);
  };
  EcoFlowApp = require('../.homeybuild/app');
} finally { Module._load = load; }
const api = require('../.homeybuild/api');
const pairing = require('../.homeybuild/lib/appAuthPairing');
const sn = 'DUALCTSYNTHETIC01';
function message(field, data) {
  return Buffer.concat([varint(field * 8 + 2), varint(data.length), data]);
}
function integer(field, value) { return Buffer.concat([varint(field * 8), varint(value)]); }
function frame() {
  return message(1, Buffer.concat([message(1, packet(1, [[1, -40], [2, 20], [3, 70], [4, 150], [6, 100], [7, 50]])),
    integer(6, 0), integer(8, 254), integer(9, 21)]));
}

test('desktop/mobile numeric capture completes automatically and downloads one reviewed combined export through real app/API paths', async () => {
  const browser = await chromium.launch();
  const original = pairing.appAuthClientFromSettings;
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const app = new EcoFlowApp();
      const settings = new EventEmitter(); settings.get = () => null;
      const timers = new Map(); const handlers = new Map(); const calls = [];
      let nextTimer = 0; let inventoryReads = 0; let clock = Date.now();
      app.homey = { settings, manifest: { version: '1.10.51' },
        setTimeout(fn, ms) { assert.equal(ms, 120000); timers.set(++nextTimer, fn); return nextTimer; },
        clearTimeout(id) { timers.delete(id); } };
      app.log = () => {}; app.error = () => {};
      pairing.appAuthClientFromSettings = () => ({ getDeviceList: async () => {
        inventoryReads++;
        return [{ sn, productName: '421', shared: false, modelCodes: [{ field: 'productType', code: 421 }] }];
      } });
      app.subscribeAppRealtime = async (serial, handler) => { handlers.set(serial, handler); return true; };
      app.unsubscribeAppRealtime = (serial) => { handlers.delete(serial); };
      const page = await browser.newPage({ viewport, acceptDownloads: true });
      try {
        await app.onInit();
        await page.exposeFunction('localDualCtApi', async (method, url, body) => {
          calls.push({ method, url, body });
          const routes = {
            'POST /dual-ct-research/start': api.startDualCtResearch,
            'POST /dual-ct-research/stop': api.stopDualCtResearch,
            'GET /dual-ct-research/view': api.dualCtResearchView,
            'GET /dual-ct-preview': api.dualCtPreview,
          };
          assert.ok(routes[`${method} ${url}`], 'only explicit local research routes');
          const result = await routes[`${method} ${url}`]({ homey: { app }, body });
          if (app.dualCtResearch) {
            // A newly created capture starts on the real clock. Never move its
            // test clock backwards when installing manual completion control.
            clock = Math.max(clock, Date.now());
            app.dualCtResearch.hooks.now = () => clock;
          }
          return result;
        });
        await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
        await page.locator('#supportTitle').click();
        await page.clock.install({ time: new Date(clock) });
        clock += 1000;
        await page.clock.pauseAt(new Date(clock));
        await page.evaluate(translations => {
          window.onHomeyReady({ ready() {}, get(_key, callback) { callback(null, null); },
            __(key) { return key.split('.').reduce((o, p) => o?.[p], translations) || key; },
            api(method, url, body, callback) {
              window.localDualCtApi(method, url, body).then(result => callback(null, result), error => callback(error));
            } });
        }, require('../locales/en.json'));
        await page.locator('#dualCtTitle').click();
        assert.equal(calls.length, 0, 'opening settings does not capture');

        // Reproduce Robert's structure-only state, then follow the new checklist.
        await page.locator('#startDualCtResearch').click();
        await page.waitForFunction(() => document.getElementById('dualCtCaptureMode').textContent.includes('mode is locked'));
        handlers.get(sn)(frame(), `/app/device/property/${sn}`);
        await page.locator('#refreshDualCtResearch').click();
        await page.waitForFunction(() => document.getElementById('dualCtExportAvailability').textContent.includes('numeric preview turned off'));
        assert.equal(await page.locator('#consentDualCtCandidateExport').isDisabled(), true);
        assert.equal(await page.locator('#includeDualCtComparison').isDisabled(), true);
        assert.equal(await page.locator('#dualCtCompactText').isVisible(), false, 'technical export is secondary and collapsed');
        assert.equal(app.getDualCtPreviewSnapshot().diagnosticSnapshot, null);
        await page.locator('#stopDualCtResearch').click();
        await page.locator('#enableDualCtPreview').waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.getElementById('enableDualCtPreview').disabled);
        await page.locator('#enableDualCtPreview').check();
        await page.locator('#enableDualCtCounters').check();
        assert.equal(await page.locator('#startDualCtResearch').innerText(), 'Start two-minute numeric capture');
        await page.locator('#startDualCtResearch').click();
        await page.waitForFunction(() => document.getElementById('dualCtCaptureMode').textContent.includes('optional local numeric candidates'));
        const starts = calls.filter(call => call.url.endsWith('/start'));
        assert.deepEqual(starts.map(call => call.body), [
          { previewEnabled: false, counterPreviewEnabled: false },
          { previewEnabled: true, counterPreviewEnabled: true },
        ]);
        assert.equal(app.getDualCtResearchSnapshot().previewDiagnostics.enabled, true);
        assert.equal(app.getDualCtResearchSnapshot().previewDiagnostics.counterResearch.enabled, true);
        assert.equal(await page.locator('#enableDualCtPreview').isDisabled(), true);
        assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(), false);

        handlers.get(sn)(frame(), `/app/device/property/${sn}`);
        clock += 120000;
        const complete = [...timers.values()][0]; assert.equal(typeof complete, 'function'); complete();
        const callsBeforeCompletionRead = calls.length;
        await page.clock.runFor(120250);
        assert.equal(app.getDualCtResearchSnapshot().status, 'complete');
        assert.equal(handlers.size, 0);
        assert.equal(timers.size, 0);
        assert.ok(app.getDualCtPreviewSnapshot().diagnosticSnapshot, 'automatic completion retains historical evidence');
        const readsBeforeRefresh = inventoryReads;
        await page.waitForFunction(() => !document.getElementById('includeDualCtComparison').disabled);
        assert.equal(calls.length, callsBeforeCompletionRead + 1, 'one automatic local completion read');
        assert.equal(calls.at(-1).url, '/dual-ct-research/view');
        assert.equal(inventoryReads, readsBeforeRefresh, 'refresh is local, not another cloud capture');
        assert.match(await page.locator('#dualCtPreviewState').innerText(), /Live candidate values have expired/);
        assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(), false);
        assert.equal(await page.locator('#includeDualCtComparison').isChecked(), true, 'combined format needs no extra step');
        assert.match(await page.locator('#dualCtExportKind').innerText(), /ecoflow-dual-ct-comparison.json/);
        assert.match(await page.locator('#dualCtWorkflowStatus').innerText(), /Capture finished/);
        assert.equal(await page.locator('#downloadDualCtCandidates').innerText(), 'Download numeric comparison JSON');
        assert.equal(await page.evaluate(() => {
          const button = document.getElementById('downloadDualCtCandidates');
          return !!(button.compareDocumentPosition(document.getElementById('dualCtCandidateText')) & Node.DOCUMENT_POSITION_FOLLOWING)
            && !!(button.compareDocumentPosition(document.getElementById('dualCtCompactPanel')) & Node.DOCUMENT_POSITION_FOLLOWING);
        }), true, 'numeric download is before long JSON and technical exports');
        // Robert's confusing path remains available for technical support, but
        // cannot silently claim to be the numeric file or grant sharing consent.
        assert.equal(await page.locator('#downloadDualCtCompact').isVisible(), false);
        await page.locator('#dualCtCompactTitle').click();
        assert.match(await page.locator('#dualCtCompactHelp').innerText(), /not the numeric comparison export/);
        assert.match(await page.locator('#downloadDualCtCompact').innerText(), /no readings/);
        const technicalDownload = page.waitForEvent('download');
        await page.locator('#downloadDualCtCompact').click();
        const technicalFile = await technicalDownload;
        assert.equal(technicalFile.suggestedFilename(), 'ecoflow-dual-ct-compact.json');
        const technical = JSON.parse(await fs.readFile(await technicalFile.path(), 'utf8'));
        assert.equal(technical.reportType, 'dual_ct_compact');
        assert.equal(technical.valuesCaptured, true); assert.equal(technical.valuesIncluded, false);
        assert.doesNotMatch(JSON.stringify(technical), /"value"|candidateUnit/);
        assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(), false);
        assert.equal(await page.locator('#downloadDualCtCandidates').isDisabled(), true);
        await page.locator('#dualCtCompactTitle').click();
        await page.locator('#consentDualCtCandidateExport').check();
        const reviewed = await page.locator('#dualCtCandidateText').textContent();
        const report = JSON.parse(reviewed);
        assert.equal(report.reportType, 'dual_ct_comparison');
        assert.equal(report.historical, true); assert.equal(report.notLive, true);
        assert.equal(report.contributesToEnergy, false);
        assert.ok(report.counterRecords.some(row => row.candidates.length > 0));
        assert.ok(report.candidateSnapshot.devices.some(device => device.readings.length > 0));
        assert.doesNotMatch(reviewed, /DUALCTSYNTHETIC|captureId/);
        assert.ok(reviewed.length <= 7500);
        const callsBeforeDownload = calls.length;
        const requested = page.waitForEvent('download');
        await page.locator('#downloadDualCtCandidates').click();
        const download = await requested;
        assert.equal(download.suggestedFilename(), 'ecoflow-dual-ct-comparison.json');
        assert.equal(await fs.readFile(await download.path(), 'utf8'), reviewed);
        assert.equal(calls.length, callsBeforeDownload, 'download sends nothing and does not refresh or recapture');
        await page.clock.runFor(1000);
        assert.equal(calls.length, callsBeforeDownload, 'completion read never becomes polling');
        assert.equal(calls.filter(call => call.url.endsWith('/stop')).length, 1, 'no Stop after numeric capture');
        assert.equal(inventoryReads, 2, 'only the two explicitly started synthetic captures discover');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('#dualCtExportAvailability').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `/tmp/ecoflow-capture-to-export-${viewport.width}.png` });
      } finally { await page.close(); await app.onUninit(); }
    }
  } finally { pairing.appAuthClientFromSettings = original; await browser.close(); }
});

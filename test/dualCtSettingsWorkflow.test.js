'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('desktop and mobile settings keep numeric sharing optional, reviewed, bounded and separate', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, acceptDownloads: true });
      await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
      await page.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
      await page.evaluate(translations => {
        window.uiCalls = []; window.copiedCandidate = null;
        window.previewResponse = { enabled: false, reason: 'disabled', devices: [] };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async text => { if (window.failCopy) throw new Error('PRIVATE'); window.copiedCandidate = text; },
        } });
        window.onHomeyReady({ ready() {}, get(_key, cb) { cb(null, null); },
          __(key) { return key.split('.').reduce((obj, part) => obj?.[part], translations) || key; },
          api(method, url, body, callback) {
            window.uiCalls.push({ method, url, body });
            if (url === '/dual-ct-preview') callback(null, structuredClone(window.previewResponse));
            else if (url === '/dual-ct-research/view') callback(null, {
              research: { status: 'listening', appVersion: '1.10.43', deviceCount: 1, frames: 49,
                previewDiagnostics: { enabled: window.previewResponse.enabled, reason: window.previewResponse.reason },
                history: [{ deviceIndex: 0, source: 'app_mqtt', status: 'protobuf', samples: 49, lastAgeSec: 0 }],
                routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' },
                  { deviceIndex: 0, source: 'developer_mqtt', status: 'listening' }] },
              preview: structuredClone(window.previewResponse),
            });
            else if (url.endsWith('/start')) {
              window.previewResponse = { enabled: body.previewEnabled, reason: 'no_samples', devices: [] };
              callback(null, { status: 'listening' });
            }
            else callback(null, { status: url.endsWith('/stop') ? 'stopped' : 'listening', appVersion: '1.10.42',
              deviceCount: 1, frames: 49, selected: [{ deviceIndex: 0, basis: 'observed_app_product_type_421', appListed: true }],
              history: [{ deviceIndex: 0, source: 'app_mqtt', status: 'protobuf', samples: 49, lastAgeSec: 0 }],
              previewDiagnostics: { enabled: true, reason: 'no_samples' },
              routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' },
                { deviceIndex: 0, source: 'developer_mqtt', status: 'listening' }] });
          } });
      }, require('../locales/en.json'));
      assert.equal(await page.evaluate(() => window.uiCalls.length), 0);
      await page.locator('#dualCtTitle').click();
      await page.locator('#dualCtPreviewTitle').click();
      await page.locator('#refreshDualCtPreview').click();
      assert.match(await page.locator('#dualCtPreviewState').innerText(), /preview is off/);
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(), true);
      await page.locator('#enableDualCtPreview').check();
      await page.locator('#startDualCtResearch').click();
      assert.equal(await page.evaluate(() => window.uiCalls.find(call => call.url.endsWith('/start')).body.previewEnabled), true);
      assert.equal(await page.locator('#enableDualCtPreview').isDisabled(), true);
      assert.match(await page.locator('#dualCtCaptureMode').innerText(), /mode is locked/);
      const summary = await page.locator('#dualCtResearchResult').innerText();
      assert.match(summary, /App telemetry — receipt confirmed/);
      assert.match(summary, /Developer telemetry — subscription attached; receipt not established/);
      await page.evaluate(() => { window.previewResponse = { enabled: true, reason: 'missing_encoding', devices: [] }; });
      await page.locator('#refreshDualCtPreview').click();
      assert.match(await page.locator('#dualCtPreviewState').innerText(), /encoding marker was omitted/);
      await page.evaluate(() => {
        window.previewResponse = { enabled: true, reason: 'ready', interpretation: 'legacy_meter_overlap_unverified',
          captureId: '11111111-1111-4111-8111-111111111111',
          unitsVerified: false, directionVerified: false, appVersion: '1.10.42', sn: 'PRIVATE',
          devices: [{ deviceIndex: 0, sn: 'PRIVATE', readings: [{ field: 515, value: -123.5, candidateUnit: 'W', receivedAgeSec: 0 },
            { field: 956, value: 230, candidateUnit: 'V', receivedAgeSec: 0 },
            { field: 985, value: 231, candidateUnit: null, receivedAgeSec: 0, encodingBasis: 'omitted_zero_candidate' }] }] };
      });
      await page.locator('#refreshDualCtPreview').click();
      assert.match(await page.locator('#dualCtPreviewState').innerText(), /515: -123.5/);
      assert.match(await page.locator('#dualCtPreviewState').innerText(), /985: 231.*unknown; no unit assigned.*omitted marker/);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(), false);
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(), true);
      assert.equal(await page.locator('#dualCtCandidateText').isVisible(), false);
      assert.equal(await page.evaluate(() => window.copiedCandidate), null);
      await page.locator('#consentDualCtCandidateExport').check();
      const reviewed = JSON.parse(await page.locator('#dualCtCandidateText').innerText());
      assert.equal(reviewed.devices[0].readings[0].value, -123.5);
      assert.equal(reviewed.schemaVersion, 2);
      assert.equal(reviewed.encodingVerified, false);
      assert.equal(reviewed.devices[0].readings.find(row => row.field === 985).candidateUnit, null);
      assert.doesNotMatch(JSON.stringify(reviewed), /PRIVATE/);
      await page.locator('#copyDualCtCandidates').click();
      assert.equal(JSON.parse(await page.evaluate(() => window.copiedCandidate)).reportType, 'dual_ct_candidate_preview');
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#downloadDualCtCandidates').click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), 'ecoflow-dual-ct-candidates.json');
      assert.equal(JSON.parse(fs.readFileSync(await download.path(), 'utf8')).devices[0].readings[0].value, -123.5);
      await page.locator('#refreshDualCtResearch').click();
      assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(), true);
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(), false);
      assert.match(await page.locator('#dualCtCandidateText').innerText(), /-123.5/);
      assert.equal(await page.evaluate(() => document.getElementById('dualCtPreviewPanel').open), true);
      await page.evaluate(() => { window.failCopy = true; });
      await page.locator('#copyDualCtCandidates').click();
      assert.match(await page.locator('#dualCtCandidateShareStatus').innerText(), /candidate JSON shown above.*manually/);
      await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('PRIVATE'); }; });
      await page.locator('#downloadDualCtCandidates').click();
      assert.match(await page.locator('#dualCtCandidateShareStatus').innerText(), /nothing has been sent/);
      assert.doesNotMatch(await page.locator('#dualCtCandidateShareStatus').innerText(), /PRIVATE/);
      assert.doesNotMatch(await page.locator('#dualCtCompactText').innerText(), /123.5|candidateUnit/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
      await page.locator('#dualCtResearch').screenshot({ path: `/tmp/ecoflow-dualct-settings-${viewport.width === 390 ? 'mobile' : 'desktop'}.png` });
      const calls = await page.evaluate(() => window.uiCalls.length);
      await page.clock.runFor(90001);
      assert.match(await page.locator('#dualCtPreviewState').innerText(), /expired/);
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(), true);
      assert.equal(await page.locator('#dualCtCandidateText').textContent(), '');
      assert.equal(await page.evaluate(() => window.uiCalls.length), calls, 'expiry causes no network requests');
      await page.locator('#stopDualCtResearch').click();
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.locator('#enableDualCtPreview').isChecked(), false);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(), false);
      await page.close();
    }
  } finally { await browser.close(); }
});

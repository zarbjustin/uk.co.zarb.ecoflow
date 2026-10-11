'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, render, download } = require('../settings/reporter-status');
const { ReporterTimeline, timelineSnapshot } = require('../.homeybuild/lib/reporterTimeline');

test('readiness explains ready, active, rollback and blockers without guessing', () => {
  assert.equal(describe({ readiness: { eligible: true, status: 'active' } }).state, 'ready');
  assert.equal(describe({ enabled: true, status: 'active' }).state, 'active');
  assert.equal(describe({ rollbackAwaitingFreshOriginal: true }).state, 'rollback');
  for (const [status, state] of [['resolution_stale', 'lookup'], ['resolved_reporter_not_paired', 'monitor'],
    ['duplicate_energy_aggregate', 'overlap'], ['selected_reporter_changed', 'changed'],
    ['pending_apply', 'waiting'], ['application_failed', 'failed'], ['PRIVATE', 'failed']]) {
    assert.equal(describe({ enabled: true, status }).state, state);
  }
});

test('readiness renders fixed labels with safe text and complete translations', () => {
  const element = { children: [], ownerDocument: { createElement: () => ({}) },
    appendChild(child) { this.children.push(child); } };
  render(element, { drivers: [{ id: 'stream', monitoringTrial: [{ status: 'PRIVATE', enabled: true, name: '<script>PRIVATE</script>' }] }] }, key => key);
  assert.equal(element.children[0].textContent, 'battery 1: failed');
  assert.ok(!JSON.stringify(element.children).includes('PRIVATE'));
  const en = require('../locales/en.json').settings.reporter;
  for (const locale of ['de', 'nl']) assert.deepEqual(Object.keys(require(`../locales/${locale}.json`).settings.reporter).sort(), Object.keys(en).sort());
});

test('download keeps JSON formatting and UTC filename, cleans URLs and does not poll', () => {
  const report = { capturedAt: '2026-10-11T01:02:03.004Z', schemaVersion: 9 };
  let removed = false; let revoked; let appended; let blob;
  const anchor = { click() { assert.match(this.download, /^ecoflow-integration-2026-10-11T01-02-03-004Z\.json$/); }, remove() { removed = true; } };
  const doc = { createElement: () => anchor, body: { appendChild(node) { appended = node; } } };
  const urls = { createObjectURL(value) { blob = value; return 'blob:synthetic'; }, revokeObjectURL(value) { revoked = value; } };
  class BlobMock { constructor(parts, opts) { this.text = parts.join(''); this.type = opts.type; } }
  download(report, doc, urls, BlobMock);
  assert.equal(appended, anchor); assert.equal(removed, true); assert.equal(revoked, 'blob:synthetic');
  assert.deepEqual(JSON.parse(blob.text), report); assert.equal(blob.type, 'application/json');
  anchor.click = () => { throw new Error('blocked download'); };
  assert.throws(() => download({ capturedAt: 'PRIVATE' }, doc, urls, BlobMock), /blocked/);
  assert.equal(anchor.download, 'ecoflow-integration-snapshot.json');
});

test('source labels keep grid meter and flow separate and suppress stale/skewed comparisons', () => {
  const field = (value, ageSec = 0, stale = false) => ({ value, ageSec, stale });
  const text = (meter, flow) => {
    const element = { children: [], ownerDocument: { createElement: () => ({}) },
      appendChild(child) { this.children.push(child); } };
    render(element, { drivers: [
      { id: 'stream', monitoringTrial: [{ enabled: true, status: 'active', readiness: { eligible: false } }] },
      { id: 'stream_5000_unit', name: 'PRIVATE', systemFlow: [{ fields: { gridMeterW: meter, gridFlowNetW: flow },
        meterMinusFlowW: 'PRIVATE' }] },
    ] }, key => key);
    return element.children.map(child => child.textContent).join('\n');
  };
  const valid = text(field(-5), field(-29, 1));
  assert.match(valid, /active/);
  assert.match(valid, /activation_only/);
  assert.match(valid, /grid_meter: -5 W/);
  assert.match(valid, /grid_flow: -29 W/);
  assert.match(valid, /grid_difference: 24 W/);
  assert.ok(!valid.includes('PRIVATE'));
  for (const [meter, flow] of [[null, field(0)], [field(0, 181), field(0)],
    [field(0, 31), field(0)], [field(Infinity), field(0)], [field(0, 0, true), field(0)]]) {
    assert.match(text(meter, flow), /grid_difference: field_unavailable/);
  }
  assert.match(text(field(0), field(0)), /grid_difference: 0 W/);
});

test('session timeline is bounded, fixed vocabulary, resets and rejects private/future input', () => {
  const timeline = new ReporterTimeline(); timeline.reset(1000);
  timeline.record('PRIVATE', 1001, 'PRIVATE');
  for (let i = 0; i < 100; i++) timeline.record('reporter_state', 1001 + i, i % 2 ? 'active' : 'PRIVATE');
  const snap = timeline.snapshot(2000);
  assert.equal(snap.events.length, 32); assert.equal(snap.sessionUptimeSec, 1);
  assert.ok(!JSON.stringify(snap).includes('PRIVATE'));
  assert.equal(timelineSnapshot({ startedAt: 1000, events: [{ at: 3000, event: 'trial_enabled' }] }, 2000).events.length, 0);
  timeline.reset(4000); assert.equal(timeline.snapshot(4000).events.length, 1);
  assert.equal(timeline.snapshot(3999).sessionUptimeSec, null);
});

test('settings readiness and JSON download work in the browser without hidden polling', async () => {
  const { chromium } = require('playwright');
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  const fs = require('node:fs');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'settings', 'index.html')).href);
    const report = { capturedAt: '2026-10-11T01:02:03.004Z', schemaVersion: 10,
      drivers: [{ id: 'stream', monitoringTrial: [{ enabled: false, readiness: { eligible: true, status: 'active' } }] },
        { id: 'stream_5000_unit', systemFlow: [{ fields: {
          gridMeterW: { value: -5, ageSec: 0, stale: false },
          gridFlowNetW: { value: -29, ageSec: 1, stale: false },
        } }] }] };
    await page.evaluate(({ report, translations }) => {
      window.calls = 0;
      window.onHomeyReady({ ready() {}, get(_key, callback) { callback(null, null); },
        __(key) { return key.split('.').reduce((obj, part) => obj?.[part], translations) || key; },
        api(_method, _url, _body, callback) { window.calls++; callback(null, report); } });
    }, { report, translations: require('../locales/en.json') });
    assert.equal(await page.evaluate(() => window.calls), 0);
    await page.locator('#supportSnapshot').click();
    assert.match(await page.locator('#reporterStatus').innerText(), /Ready for the optional monitoring trial/);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#downloadSupportSnapshot').click();
    const file = await downloadEvent;
    assert.match(file.suggestedFilename(), /^ecoflow-integration-2026/);
    assert.deepEqual(JSON.parse(fs.readFileSync(await file.path(), 'utf8')), report);
    assert.equal(await page.evaluate(() => window.calls), 1);
    assert.match(await page.locator('#reporterStatus').innerText(), /Reported grid-meter power: -5 W/);
    assert.match(await page.locator('#reporterStatus').innerText(), /Meter minus flow: 24 W/);
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#reporterStatus').screenshot({ path: '/tmp/ecoflow-reporter-source-labels.png' });
  } finally { await browser.close(); }
});

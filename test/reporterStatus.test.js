'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('forum-safe parts preserve Unicode, empty arrays and literal smart quotes without hand repair', () => {
  const { reportMessages, reassembleReportMessages } = require('../settings/reporter-status');
  const text = JSON.stringify({ empty: [], quotes: '“text”', emoji: '🔋', padding: 'ä'.repeat(12000) }, null, 2);
  const parts = reportMessages(text);
  assert.ok(parts.length > 1); assert.ok(parts.every(p => p.length < 8000));
  assert.ok(parts.every(p => !p.includes('[]') && !p.includes('“')));
  assert.equal(reassembleReportMessages([...parts].reverse()), text);
  assert.equal(reassembleReportMessages(parts.map(p => p.replaceAll('\n', '\r\n'))), text);
  assert.equal(reassembleReportMessages(parts.map(p => p.split('\n').slice(1, -1).join('\n'))), text);
  assert.deepEqual(reportMessages(''), []);
  for (const broken of [parts.slice(1), [...parts, parts[0]],
    [parts[0], ...reportMessages(JSON.stringify({ other: 1 })).slice(0, 1)],
    parts.map((p, i) => i ? p : p.replace(/\n([A-Za-z0-9+/])/, '\nA')),
    parts.map((p, i) => { if (i) return p; const lines = p.split('\n');
      lines[2] = (lines[2][0] === 'A' ? 'B' : 'A') + lines[2].slice(1); return lines.join('\n'); })]) {
    assert.throws(() => reassembleReportMessages(broken), /Incomplete, mixed or damaged/);
  }
  assert.throws(() => reassembleReportMessages(['PRIVATE']), /Incomplete, mixed or damaged/);
  assert.throws(() => reportMessages('x'.repeat(2304001)), /message limit/);
});

const { renderCaptureGuide } = require('../settings/reporter-status');

test('capture checklist renders five fixed instructions without polling or private text', () => {
  const element = { children: [], ownerDocument: { createElement: () => ({}) },
    appendChild(child) { this.children.push(child); } };
  const report = { capturedAt: 'PRIVATE', captureGuide: ['<script>PRIVATE</script>'] };
  const before = JSON.stringify(report);
  renderCaptureGuide(element, report, key => require('../locales/en.json').settings.reporter[key]);
  const text = element.children.map(child => child.textContent).join('\n');
  assert.equal(element.children.length, 5);
  assert.match(text, /no one-minute deadline/); assert.match(text, /timezone/);
  assert.match(text, /log ID/); assert.match(text, /Download the integration JSON/);
  assert.doesNotMatch(text, /PRIVATE|script/);
  assert.equal(JSON.stringify(report), before);
});
const { describe, render, download, renderCapture } = require('../settings/reporter-status');
const { ReporterTimeline, timelineSnapshot } = require('../.homeybuild/lib/reporterTimeline');

test('new explanations distinguish blank reasons, trial sources and counter suspicion without private data', () => {
  const element = { children: [], ownerDocument: { createElement: () => ({}) },
    appendChild(child) { this.children.push(child); } };
  render(element, { drivers: [{ id: 'stream', monitoringTrial: [{ enabled: true, status: 'active' }],
    readingExplanations: [{ readings: { 'a': 'individual_flow_unverified', 'b': 'expired',
      'c': 'write_failed', 'd': 'not_reported', 'PRIVATE': 'PRIVATE' } }],
    counterContinuity: [{ fields: { accuChgEnergy: { status: 'missing' },
      accuDsgEnergy: { possibleStall: true } } }],
  }] }, key => key);
  const text = element.children.map(c => c.textContent).join('\n');
  for (const key of ['trial_sources', 'individual_flow_unverified', 'reading_expired',
    'application_failed', 'reading_not_reported', 'counter_scope', 'counter_possible_stall', 'counter_incomplete']) {
    assert.ok(text.includes(key));
  }
  assert.ok(!text.includes('PRIVATE'));
});

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
  let cleanup;
  download(report, doc, urls, BlobMock, (fn, delay) => { cleanup = fn; assert.equal(delay, 60000); });
  assert.equal(appended, anchor); assert.equal(removed, true); assert.equal(revoked, undefined);
  cleanup(); assert.equal(revoked, 'blob:synthetic');
  assert.deepEqual(JSON.parse(blob.text), report); assert.equal(blob.type, 'application/json');
  anchor.click = () => { assert.equal(anchor.download, 'ecoflow-dual-ct-compact.json'); };
  download({ reportType: 'dual_ct_compact', schemaVersion: 2 }, doc, urls, BlobMock, () => {});
  anchor.click = () => { throw new Error('blocked download'); };
  assert.throws(() => download({ capturedAt: 'PRIVATE' }, doc, urls, BlobMock), /blocked/);
  assert.equal(anchor.download, 'ecoflow-integration-snapshot.json');
});

test('report parts retain every byte, stay below forum limits and never split surrogate pairs', () => {
  const { reportParts } = require('../settings/reporter-status');
  const text = JSON.stringify({ capturedAt: '2026-10-12T21:00:00Z', sample: 'x'.repeat(7970) + '😀'.repeat(15000) });
  const parts = reportParts(text);
  assert.ok(parts.length > 1); assert.equal(parts.join(''), text);
  assert.deepEqual(JSON.parse(parts.join('')), JSON.parse(text));
  parts.forEach(part => { assert.ok(part.length <= 8000); assert.ok(!/[\uD800-\uDBFF]$/.test(part)); });
  assert.deepEqual(reportParts(''), []); assert.deepEqual(reportParts(null), []);
});

test('linked unit and pending update explanations use fixed translated text, not private fields', () => {
  const element = { children: [], ownerDocument: { createElement: () => ({}) },
    appendChild(child) { this.children.push(child); } };
  render(element, { drivers: [
    { id: 'stream', monitoringTrial: [{ enabled: true, status: 'active', updatePending: true }] },
    { id: 'stream_5000_unit', physicalPower: [{ status: 'linked_power_unverified', name: 'PRIVATE' }] },
  ] }, key => key);
  const text = element.children.map(child => child.textContent).join('\n');
  assert.match(text, /update_pending/);
  assert.match(text, /linked_unit_power/);
  assert.doesNotMatch(text, /PRIVATE/);
  for (const locale of ['en', 'de', 'nl']) {
    const translations = require(`../locales/${locale}.json`);
    assert.ok(translations.device.stream_5000_unit.linked_power_unverified);
    assert.ok(translations.settings.support.technical);
  }
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

test('capture metadata distinguishes capture freshness from now without changing the report', () => {
  const element = {}; const at = Date.parse('2026-10-11T01:02:03.004Z');
  const report = { capturedAt: new Date(at).toISOString(), appVersion: '1.10.31',
    fields: { value: 0, ageSec: 0, stale: false } };
  const before = JSON.stringify(report);
  const translate = key => require('../locales/en.json').settings.reporter[key];
  renderCapture(element, report, translate, at + 400000);
  assert.match(element.textContent, /1.10.31/);
  assert.match(element.textContent, /2026-10-11T01:02:03.004Z/);
  assert.match(element.textContent, /Snapshot age now: 400 s/);
  assert.match(element.textContent, /capture time, not the current connection/);
  assert.equal(JSON.stringify(report), before);
  for (const capturedAt of ['PRIVATE', new Date(at + 1000).toISOString()]) {
    renderCapture(element, { appVersion: 'PRIVATE', capturedAt }, translate, at);
    assert.match(element.textContent, /Unknown or clock mismatch/);
    assert.doesNotMatch(element.textContent, /PRIVATE/);
  }
  renderCapture(element, null, translate, at);
  assert.equal(element.textContent, '');
});

test('scope and write-failure explanations render fixed labels without arbitrary titles or errors', () => {
  const element = { children: [], ownerDocument: { createElement: () => ({}) },
    appendChild(child) { this.children.push(child); } };
  render(element, { drivers: [
    { id: 'stream_unit', pairedCount: 1 },
    { id: 'stream_5000_unit', pairedCount: 1, readingFreshness: [{ readings: {
      'measure_power.load': { applicationStatus: 'write_failed', error: 'PRIVATE' },
    } }] },
  ] }, key => key);
  const text = element.children.map(child => child.textContent).join('\n');
  assert.match(text, /unit_scope/);
  assert.match(text, /original_unit_scope/);
  assert.match(text, /application_failed/);
  assert.doesNotMatch(text, /PRIVATE/);
});

test('bounded summary survives event eviction, counts only observed states and stops at rollback', () => {
  const timeline = new ReporterTimeline(); timeline.reset(1000);
  timeline.record('trial_enabled', 2000);
  timeline.record('reporter_state', 3000, 'active');
  timeline.record('reporter_state', 13000, 'fields_missing_or_stale');
  timeline.record('reporter_state', 15000, 'reporter_connection_unavailable');
  timeline.record('reporter_state', 19000, 'selected_reporter_changed');
  timeline.record('reporter_state', 23000, 'active');
  for (let i = 0; i < 100; i++) timeline.record('lookup_failed', 24000 + i);
  timeline.record('rollback_started', 33000);
  const snap = timeline.snapshot(99000);
  assert.equal(snap.events.length, 32);
  assert.equal(snap.summary.activeSec, 20);
  assert.equal(snap.summary.unavailableSec, 10);
  assert.equal(snap.summary.longestUnavailableSec, 10);
  assert.equal(snap.summary.longestObservedTelemetryUnavailableSec, 6);
  assert.equal(snap.summary.stateTransitions, 3);
  assert.equal(snap.summary.discardedEvents, 76);
  assert.equal(timeline.snapshot(199000).summary.activeSec, 20, 'no growth outside the trial');
  const copy = timeline.snapshot(99000); copy.summary.activeSec = 999;
  assert.equal(timeline.snapshot(99000).summary.activeSec, 20);
  timeline.record('trial_enabled', 2000);
  assert.equal(timeline.snapshot(2000).summary.clockResets, 1);
  assert.equal(timeline.snapshot(2000).summary.activeSec, 0);
  timeline.record('reporter_state', 3000, 'active');
  assert.equal(timeline.snapshot(4000).summary.activeSec, 1);
  timeline.reset(5000);
  assert.equal(timeline.snapshot(5000).summary.discardedEvents, 0);
});

test('summary projection rejects forged durations and private fields', () => {
  const snap = timelineSnapshot({ startedAt: 1000, summary: { activeSec: 9000, unavailableSec: -1,
    longestUnavailableSec: NaN, longestObservedTelemetryUnavailableSec: Infinity,
    stateTransitions: 'PRIVATE', discardedEvents: 12, password: 'PRIVATE' } }, 5000);
  assert.equal(snap.summary.activeSec, null);
  assert.equal(snap.summary.unavailableSec, null);
  assert.equal(snap.summary.discardedEvents, 12);
  assert.doesNotMatch(JSON.stringify(snap), /PRIVATE|password/);
});

test('long unchecked intervals cannot inflate healthy time and repeated checks do not grow events', () => {
  const timeline = new ReporterTimeline(); timeline.reset(1000);
  timeline.record('reporter_state', 1000, 'active');
  assert.equal(timeline.snapshot(10000000).summary.activeSec, 180);
  for (let i = 1; i <= 1000; i++) timeline.record('reporter_state', 1000 + i * 15000, 'active');
  assert.equal(timeline.snapshot(15001000).events.length, 2);
  assert.equal(timeline.snapshot(15001000).summary.activeSec, 15000);
  timeline.record('reporter_state', 25001000, 'fields_missing_or_stale');
  assert.equal(timeline.snapshot(25001000).summary.activeSec, 15180);
  assert.equal(timeline.snapshot(25001000).summary.unavailableSec, 0);
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
    const report = { capturedAt: '2026-10-11T01:02:03.004Z', appVersion: '1.10.31', schemaVersion: 11, padding: 'x'.repeat(19000),
      dualCtResearch: { status: 'complete', deviceCount: 1, frames: 2, rejectedFrames: 0, captureAgeSec: 121,
        routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' }],
        history: [{ deviceIndex: 0, source: 'app_mqtt', status: 'protobuf', lastAgeSec: 1 }] },
      drivers: [{ id: 'stream', monitoringTrial: [{ enabled: false, readiness: { eligible: true, status: 'active' } },
        { enabled: true, status: 'active', updatePending: true }] },
        { id: 'stream_5000_unit', physicalPower: [{ status: 'linked_power_unverified' }], systemFlow: [{ fields: {
          gridMeterW: { value: -5, ageSec: 0, stale: false },
          gridFlowNetW: { value: -29, ageSec: 1, stale: false },
        } }] }] };
    await page.clock.install({ time: new Date(report.capturedAt) });
    await page.evaluate(({ report, translations }) => {
      window.calls = 0;
      window.onHomeyReady({ ready() {}, get(_key, callback) { callback(null, null); },
        __(key) { return key.split('.').reduce((obj, part) => obj?.[part], translations) || key; },
        api(_method, _url, _body, callback) { window.calls++; callback(null, report); } });
    }, { report, translations: require('../locales/en.json') });
    assert.equal(await page.evaluate(() => window.calls), 0);
    await page.locator('#supportSnapshot').click();
    assert.match(await page.locator('#supportCaptureStatus').innerText(), /1.10.31/);
    await page.clock.runFor(20000);
    assert.match(await page.locator('#supportCaptureStatus').innerText(), /Snapshot age now: 20 s/);
    assert.equal(await page.evaluate(() => window.calls), 1, 'age ticker makes no API requests');
    assert.match(await page.locator('#reporterStatus').innerText(), /Ready for the optional monitoring trial/);
    assert.match(await page.locator('#reporterStatus').innerText(), /New readings are waiting/);
    assert.match(await page.locator('#reporterStatus').innerText(), /Blank unit tiles do not mean zero/);
    assert.equal(await page.locator('#technicalReport').getAttribute('open'), null, 'technical JSON is optional and collapsed');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#downloadSupportSnapshot').click();
    const file = await downloadEvent;
    assert.match(file.suggestedFilename(), /^ecoflow-integration-2026/);
    assert.deepEqual(JSON.parse(fs.readFileSync(await file.path(), 'utf8')), report);
    assert.equal(await page.evaluate(() => window.calls), 1);
    await page.locator('#supportPartsTitle').click();
    const parts = [];
    while (true) {
      parts.push(await page.locator('#supportPartText').inputValue());
      if (!(await page.locator('#supportPartNext').isEnabled())) break;
      await page.locator('#supportPartNext').click();
    }
    assert.ok(parts.length > 1);
    assert.equal(require('../settings/reporter-status').reassembleReportMessages(parts), JSON.stringify(report, null, 2));
    assert.equal(await page.locator('#supportPartNext').isEnabled(), false);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: async () => { throw new Error('clipboard denied'); } } }));
    await page.locator('#supportPartCopy').click();
    assert.match(await page.locator('#supportCopyStatus').innerText(), /copy it manually/);
    assert.equal(await page.locator('#supportPartText').evaluate(e => e.selectionEnd - e.selectionStart), parts.at(-1).length);
    await page.locator('#supportSnapshot').click();
    assert.match(await page.locator('#supportPartLabel').innerText(), /1 \/ /);
    assert.equal(await page.locator('#supportPartPrevious').isEnabled(), false);
    assert.equal(await page.evaluate(() => window.calls), 2, 'export fallback never performs another API call');
    assert.match(await page.locator('#reporterStatus').innerText(), /Reported grid-meter power: -5 W/);
    assert.match(await page.locator('#reporterStatus').innerText(), /Meter minus flow: 24 W/);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('#dualCtTitle').click();
    await page.locator('#dualCtCompactTitle').click();
    assert.match(await page.locator('#dualCtResearchResult').innerText(), /Channel mapping, units and direction are still unverified/);
    await page.locator('#refreshDualCtResearch').click();
    assert.equal(await page.evaluate(() => window.calls), 3, 'manual local refresh only');
    await page.clock.runFor(20000);
    assert.equal(await page.evaluate(() => window.calls), 3, 'summary has no hidden polling');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#dualCtResearch').screenshot({ path: '/tmp/ecoflow-dualct-local-summary.png' });
    await page.locator('#reporterStatus').screenshot({ path: '/tmp/ecoflow-reporter-source-labels.png' });
    await page.locator('#supportCaptureStatus').screenshot({ path: '/tmp/ecoflow-diagnostic-capture-age.png' });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('#supportParts').isVisible(), false);
    assert.equal(await page.locator('#supportPartText').inputValue(), '');
  } finally { await browser.close(); }
});

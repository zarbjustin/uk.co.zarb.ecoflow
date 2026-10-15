'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SETTINGS_HTML = path.join(__dirname, '..', 'settings', 'index.html');
const APP_AUTH_KEYS = ['appAuthEmail', 'appAuthPassword', 'appAuthHost'];

test('compact Dual CT export follows local refresh, has a text fallback and clears on navigation', async () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  context.navigator = { clipboard: { writeText: async () => { throw new Error('private browser failure'); } } };
  homey.api = (method, url, body, callback) => calls.push({ method, url, callback });
  context.onHomeyReady(homey);
  assert.equal(calls.length, 0);
  context.document.getElementById('refreshDualCtResearch').click();
  calls[0].callback(null, { research: { status: 'no_explicit_model', appVersion: '1.10.39',
    inventory: [{ source: 'app', available: true, inspected: 3 }] } });
  const report = JSON.parse(context.document.getElementById('dualCtCompactText').textContent);
  assert.equal(report.appVersion, '1.10.39');
  assert.equal(report.summary.state, 'no_explicit_model');
  assert.equal(report.valuesCaptured, false);
  await context.document.getElementById('copyDualCtCompact').click();
  assert.match(context.document.getElementById('dualCtShareStatus').textContent, /manually/);
  assert.doesNotMatch(context.document.getElementById('dualCtShareStatus').textContent, /private browser failure/);
  assert.match(context.document.getElementById('dualCtPreviewState').textContent, /Not available/);
  context.events.pagehide();
  assert.equal(context.document.getElementById('dualCtCompactText').textContent, '');
  assert.equal(context.document.getElementById('copyDualCtCompact').disabled, true);
});

test('compact copy success is acknowledged without starting discovery or sending data', async () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); let copied = '';
  context.navigator = { clipboard: { writeText: async (text) => { copied = text; } } };
  homey.api = (method, url, body, callback) => callback(null, { research: { status: 'complete' } });
  context.onHomeyReady(homey);
  context.document.getElementById('refreshDualCtResearch').click();
  await context.document.getElementById('copyDualCtCompact').click();
  assert.equal(JSON.parse(copied).reportType, 'dual_ct_compact');
  assert.match(context.document.getElementById('dualCtShareStatus').textContent, /copied/);
});

test('an older integration report cannot overwrite a newer Dual CT action summary', () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, callback) => calls.push({ method, url, body, callback });
  context.onHomeyReady(homey);
  context.document.getElementById('supportSnapshot').click();
  context.document.getElementById('startDualCtResearch').click();
  calls[1].callback(null, { status: 'listening', deviceCount: 1 });
  calls[2].callback(null, { research: { status: 'listening', deviceCount: 1 } });
  const element = context.document.getElementById('dualCtResearchResult'); const before = element.children.length;
  calls[0].callback(null, { dualCtResearch: { status: 'complete', deviceCount: 0 } });
  assert.equal(element.children.length, before);
  calls[1].callback(null, { status: 'complete', deviceCount: 0 });
  assert.equal(element.children.length, before, 'duplicate action callback cannot replace summary');
});

test('Dual CT summary refresh uses one separate local view GET and never starts a new capture', () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, callback) => {
    calls.push({ method, url, body }); callback(null, { research: { status: 'complete', frames: 3, deviceCount: 1 } });
  };
  context.onHomeyReady(homey); assert.equal(calls.length, 0);
  context.document.getElementById('refreshDualCtResearch').click();
  assert.deepEqual(calls.map((call) => [call.method, call.url, call.body]), [['GET', '/dual-ct-research/view', null]]);
  const result = context.document.getElementById('dualCtResearchResult').children.map((child) => child.textContent).join(' ');
  assert.match(result, /completed/); assert.match(result, /Observed samples: 3/);
});

test('Dual CT capture requires an explicit click, permits Stop, and ignores late callbacks', () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, callback) => calls.push({ method, url, body, callback });
  context.onHomeyReady(homey);
  assert.equal(calls.length, 0);
  context.document.getElementById('startDualCtResearch').click();
  assert.equal(calls[0].url, '/dual-ct-research/start');
  assert.equal(calls[0].body.previewEnabled, false);
  context.document.getElementById('stopDualCtResearch').click();
  assert.equal(calls[1].url, '/dual-ct-research/stop');
  calls[1].callback(null, { status: 'stopped' });
  calls[0].callback(null, { status: 'listening' });
  assert.match(context.document.getElementById('dualCtResearchResult').children.map((child) => child.textContent).join(' '), /stopped/i);
  assert.equal([...context.timers.values()].filter((timer) => !timer.interval).length, 0);
  context.document.getElementById('startDualCtResearch').click();
  const deadline = [...context.timers.values()].find((timer) => !timer.interval); deadline.fn();
  calls[2].callback(new Error('private token'));
  assert.match(context.document.getElementById('dualCtResearchResult').textContent, /timed out/);
  assert.doesNotMatch(context.document.getElementById('dualCtResearchResult').textContent, /private token/);
});

/** The inline settings script, run exactly as the settings page runs it. */
test('candidate preview opt-in is manual, separate from exports and invalidates late callbacks on stop/navigation', () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, callback) => calls.push({ method, url, body, callback });
  context.onHomeyReady(homey);
  assert.equal(calls.length, 0);
  context.document.getElementById('enableDualCtPreview').checked = true;
  context.document.getElementById('startDualCtResearch').click();
  assert.equal(calls[0].body.previewEnabled, true);
  calls[0].callback(null, { status: 'listening', valuesCaptured: true });
  calls[1].callback(null, { research: { status: 'listening', previewDiagnostics: { enabled: true } },
    preview: { enabled: true, reason: 'no_samples', devices: [] } });
  context.document.getElementById('refreshDualCtPreview').click();
  assert.equal(calls[2].url, '/dual-ct-preview'); assert.equal(calls[2].method, 'GET');
  calls[2].callback(null, { enabled: true, interpretation: 'legacy_meter_overlap_unverified', unitsVerified: false,
    directionVerified: false, devices: [{ deviceIndex: 0, readings: [{ field: 515, candidateUnit: 'W', value: -12345, receivedAgeSec: 0 }] }] });
  assert.match(context.document.getElementById('dualCtPreviewState').textContent, /515: -12345/);
  assert.doesNotMatch(context.document.getElementById('dualCtCompactText').textContent, /12345/);
  const expiry = [...context.timers.values()].find(timer => timer.ms > 80000 && !timer.interval);
  assert.ok(expiry); context.now += 90001; expiry.fn();
  assert.match(context.document.getElementById('dualCtPreviewState').textContent, /expired/);
  context.document.getElementById('refreshDualCtPreview').click();
  context.document.getElementById('stopDualCtResearch').click();
  calls[3].callback(null, { enabled: true, devices: [] });
  assert.match(context.document.getElementById('dualCtPreviewState').textContent, /Not available/);
  context.events.pagehide();
  assert.equal(context.document.getElementById('enableDualCtPreview').checked, false);
});

test('candidate sharing requires separate consent, shows a manual fallback, and clears on consent removal', async () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); let writes = 0;
  context.navigator = { clipboard: { writeText: async () => { writes++; throw new Error('PRIVATE'); } } };
  homey.api = (_method, _url, _body, callback) => callback(null, { enabled: true, captureId,
    interpretation: 'legacy_meter_overlap_unverified', unitsVerified: false, directionVerified: false,
    diagnosticSnapshot: { kind:'historical_capture',simultaneous:false,retainedForSec:0,retentionRemainingSec:900,lastPacketAgeSec:0,
      devices:[{deviceIndex:0,readings:[{field:515,value:-500,candidateUnit:'W',receivedAgeSec:0}]}] },
    devices: [{ deviceIndex: 0, sn: 'PRIVATE', readings: [{ field: 515, value: -500, candidateUnit: 'W', receivedAgeSec: 0 }] }] });
  context.onHomeyReady(homey);
  context.document.getElementById('refreshDualCtPreview').click();
  await context.document.getElementById('copyDualCtCandidates').click();
  assert.equal(writes, 0);
  const consent = context.document.getElementById('consentDualCtCandidateExport');
  consent.checked = true; consent.change();
  const text = context.document.getElementById('dualCtCandidateText');
  assert.equal(JSON.parse(text.textContent).devices[0].readings[0].value, -500);
  assert.doesNotMatch(text.textContent, /PRIVATE/);
  await context.document.getElementById('copyDualCtCandidates').click();
  assert.equal(writes, 1);
  assert.match(context.document.getElementById('dualCtCandidateShareStatus').textContent, /manually/);
  assert.doesNotMatch(context.document.getElementById('dualCtCandidateShareStatus').textContent, /PRIVATE/);
  consent.checked = false; consent.change();
  assert.equal(text.textContent, ''); assert.equal(text.hidden, true);
  assert.equal(context.document.getElementById('copyDualCtCandidates').disabled, true);
});

test('reused capture shows effective opt-out, locks checkbox and never silently restarts', () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, callback) => calls.push({ method, url, body, callback });
  context.onHomeyReady(homey);
  context.document.getElementById('enableDualCtPreview').checked = true;
  context.document.getElementById('startDualCtResearch').click();
  calls[0].callback(null, { status: 'listening', captureStart: { reused: true, requiresRestart: true } });
  calls[0].callback(null, { status: 'listening' });
  assert.equal(calls.length, 2, 'duplicate Start callback cannot issue another local read');
  calls[1].callback(null, { research: { status: 'listening', previewDiagnostics: { enabled: false } },
    preview: { enabled: false, reason: 'disabled', devices: [] } });
  assert.equal(context.document.getElementById('enableDualCtPreview').checked, false);
  assert.equal(context.document.getElementById('enableDualCtPreview').disabled, true);
  assert.match(context.document.getElementById('dualCtCaptureMode').textContent, /structure only.*mode is locked.*reused/s);
  assert.equal(context.document.getElementById('dualCtPreviewPanel').open, true);
  assert.match(context.document.getElementById('dualCtPreviewState').textContent, /preview is off/);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  context.document.getElementById('stopDualCtResearch').click();
  calls[2].callback(null, { status: 'stopped', previewDiagnostics: { enabled: false } });
  assert.equal(context.document.getElementById('enableDualCtPreview').disabled, false);
});

const captureId = '11111111-1111-4111-8111-111111111111';
function numericPreview(id = captureId, age = 0) {
  return { captureId: id, enabled: true, reason: 'ready', interpretation: 'legacy_meter_overlap_unverified',
    diagnosticSnapshot: { kind:'historical_capture',simultaneous:false,retainedForSec:age,retentionRemainingSec:900-age,lastPacketAgeSec:age,
      devices:[{deviceIndex:0,readings:[{field:515,value:-12345,candidateUnit:'W',receivedAgeSec:age}]}] },
    unitsVerified: false, directionVerified: false, devices: [{ deviceIndex: 0,
      readings: [{ field: 515, value: -12345, candidateUnit: 'W', receivedAgeSec: age }] }] };
}

test('one explicit refresh retains same-capture sharing consent through completion, never in normal reports', () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, callback) => calls.push({ method, url, body, callback });
  context.onHomeyReady(homey);
  context.document.getElementById('refreshDualCtPreview').click(); calls[0].callback(null, numericPreview());
  const consent = context.document.getElementById('consentDualCtCandidateExport');
  consent.checked = true; consent.change();
  context.document.getElementById('refreshDualCtResearch').click();
  assert.equal(context.document.getElementById('copyDualCtCandidates').disabled, true, 'pending data cannot be exported');
  calls[1].callback(null, { captureId, research: { status: 'complete', previewDiagnostics: { enabled: true } },
    preview: numericPreview(captureId, 30) });
  assert.equal(consent.checked, true); assert.equal(consent.disabled, false);
  assert.equal(context.document.getElementById('copyDualCtCandidates').disabled, false);
  assert.equal(JSON.parse(context.document.getElementById('dualCtCandidateText').textContent).devices[0].readings[0].value, -12345);
  assert.doesNotMatch(context.document.getElementById('dualCtCompactText').textContent, /12345|candidateUnit|captureId/);
  assert.equal(context.document.getElementById('enableDualCtPreview').disabled, false, 'completed capture unlocks next capture option');
  assert.equal(calls.length, 2); assert.equal(calls[1].url, '/dual-ct-research/view');
});

test('changed capture or absent identity revokes sharing consent and clears stale prepared values', () => {
  for (const id of ['22222222-2222-4222-8222-222222222222', null]) {
    const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
    homey.api = (_method, _url, _body, callback) => calls.push(callback);
    context.onHomeyReady(homey);
    context.document.getElementById('refreshDualCtPreview').click(); calls[0](null, numericPreview());
    const consent = context.document.getElementById('consentDualCtCandidateExport'); consent.checked = true; consent.change();
    context.document.getElementById('refreshDualCtResearch').click();
    calls[1](null, { research: { status: 'listening', previewDiagnostics: { enabled: true } }, preview: numericPreview(id) });
    assert.equal(consent.checked, false);
    assert.equal(context.document.getElementById('dualCtCandidateText').textContent, '');
    assert.equal(context.document.getElementById('copyDualCtCandidates').disabled, true);
  }
});

test('late local views after Stop, expiry, failure, timeout or navigation cannot restore candidate exports', () => {
  for (const event of ['stop', 'timeout', 'pagehide', 'error', 'expired']) {
    const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
    homey.api = (_method, url, _body, callback) => calls.push({ url, callback });
    context.onHomeyReady(homey);
    context.document.getElementById('refreshDualCtPreview').click(); calls[0].callback(null, numericPreview());
    const consent = context.document.getElementById('consentDualCtCandidateExport'); consent.checked = true; consent.change();
    context.document.getElementById('refreshDualCtResearch').click();
    if (event === 'stop') {
      context.document.getElementById('stopDualCtResearch').click(); calls[2].callback(null, { status: 'stopped' });
    } else if (event === 'timeout') [...context.timers.values()].find(timer => timer.ms === 20000 && !timer.interval).fn();
    else if (event === 'pagehide') context.events.pagehide();
    else if (event === 'error') calls[1].callback(new Error('PRIVATE'));
    else calls[1].callback(null, { research: { status: 'complete' }, preview: numericPreview(captureId, 900) });
    calls[1].callback(null, { research: { status: 'listening' }, preview: numericPreview() });
    assert.equal(consent.checked, false, event);
    assert.equal(context.document.getElementById('dualCtCandidateText').textContent, '', event);
    assert.equal(context.document.getElementById('copyDualCtCandidates').disabled, true, event);
    assert.doesNotMatch(context.document.getElementById('dualCtPreviewState').textContent, /12345|PRIVATE/, event);
  }
});

test('account removal invalidates pending summary/preview reads as well as prepared private exports', async () => {
  const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
  homey.api = (_method, _url, _body, callback) => calls.push(callback);
  context.onHomeyReady(homey);
  context.document.getElementById('refreshDualCtPreview').click(); calls[0](null, numericPreview());
  const consent = context.document.getElementById('consentDualCtCandidateExport'); consent.checked = true; consent.change();
  context.document.getElementById('refreshDualCtResearch').click();
  await context.document.getElementById('clearAppAuth').click();
  calls[1](null, { research: { status: 'listening', previewDiagnostics: { enabled: true } }, preview: numericPreview() });
  assert.equal(context.document.getElementById('dualCtCompactText').textContent, '');
  assert.equal(context.document.getElementById('dualCtCandidateText').textContent, '');
  assert.equal(consent.checked, false);
  assert.equal(context.document.getElementById('enableDualCtPreview').checked, false);
  assert.equal(context.document.getElementById('startDualCtResearch').disabled, false);
});

test('coherent summary refresh shows the precise unavailable preview reason after capture discovery fails', () => {
  const context = loadSettingsScript(); const homey = fakeHomey();
  homey.api = (_method, _url, _body, callback) => callback(null, {
    research: { status: 'discovery_unavailable', previewDiagnostics: { enabled: true } },
    preview: { enabled: true, reason: 'capture_unavailable', devices: [] },
  });
  context.onHomeyReady(homey);
  context.document.getElementById('refreshDualCtResearch').click();
  assert.match(context.document.getElementById('dualCtPreviewState').textContent, /could not discover or listen/);
  assert.equal(context.document.getElementById('enableDualCtPreview').disabled, false);
  assert.equal(context.document.getElementById('copyDualCtCandidates').disabled, true);
});

function loadSettingsScript() {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  const blocks = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  const source = blocks.find((b) => b.includes('onHomeyReady'));
  assert.ok(source, 'settings/index.html has no onHomeyReady script');
  const context = vm.createContext({
    console, Promise, TextEncoder, TextDecoder, btoa, atob, document: fakeDocument(),
  });
  const timers = new Map(); let next = 0;
  context.now = Date.now();
  context.Date = class extends Date { static now() { return context.now; } };
  context.timers = timers;
  context.setTimeout = (fn, ms) => { timers.set(++next, { fn, ms, interval: false }); return next; };
  context.setInterval = (fn, ms) => { timers.set(++next, { fn, ms, interval: true }); return next; };
  context.clearTimeout = context.clearInterval = id => timers.delete(id);
  context.events = {};
  context.addEventListener = (event, fn) => { context.events[event] = fn; };
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'settings', 'meter-status.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'settings', 'reporter-status.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'settings', 'dual-ct-status.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'settings', 'dual-ct-comparison.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return context;
}

/** Minimal stand-in for the handful of DOM features the page uses. */
function fakeDocument() {
  const elements = new Map();
  return {
    elements,
    createElement() { return { textContent: '', value: '', ownerDocument: this, children: [], dataset: {},
      appendChild(child) { this.children.push(child); }, setAttribute() {}, addEventListener() {} }; },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          value: '',
          checked: true,
          textContent: '',
          ownerDocument: this,
          children: [],
          appendChild(child) { this.children.push(child); },
          style: {},
          handlers: {},
          addEventListener(event, handler) {
            this.handlers[event] = handler;
          },
          click() {
            return this.handlers.click ? this.handlers.click() : undefined;
          },
          change() {
            return this.handlers.change ? this.handlers.change() : undefined;
          },
        });
      }
      return elements.get(id);
    },
  };
}

/**
 * Settings-API stub. `failures` maps a key to the error a call for it produces,
 * so a partially failing removal can be reproduced.
 */
function fakeHomey({
  values = {}, unsetFails = {}, setFails = {}, withUnset = true, confirmAccepted = true,
} = {}) {
  const store = new Map(Object.entries(values));
  const homey = {
    store,
    ready() {},
    __(key) { return key.split('.').reduce((value, part) => value?.[part], require('../locales/en.json')) || key; },
    get(key, cb) {
      cb(null, store.has(key) ? store.get(key) : undefined);
    },
    set(key, value, cb) {
      if (setFails[key]) {
        cb(new Error(setFails[key]));
        return;
      }
      store.set(key, value);
      cb(null);
    },
    api(method, url, body, cb) {
      cb(null, {});
    },
    confirm(message, type, cb) {
      cb(null, confirmAccepted);
    },
  };
  if (withUnset) {
    homey.unset = (key, cb) => {
      if (unsetFails[key]) {
        cb(new Error(unsetFails[key]));
        return;
      }
      store.delete(key);
      cb(null);
    };
  }
  return homey;
}

function storedAccount() {
  return { appAuthEmail: 'tester@example.invalid', appAuthPassword: 'not-a-real-password', appAuthHost: 'https://api.ecoflow.com' };
}

test('read-only reporter check uses the fixed endpoint and enables copying only its returned report', async () => {
  const homey = fakeHomey(); const calls = [];
  homey.api = (method, url, body, cb) => {
    calls.push([method, url]); cb(null, { schemaVersion: 7, reporterRepair: [] });
  };
  const context = loadSettingsScript(); context.onHomeyReady(homey);
  await context.document.getElementById('refreshReporterDiagnostics').click();
  assert.deepEqual(calls, [['POST', '/reporter-diagnostics']]);
  assert.equal(context.document.getElementById('copySupportSnapshot').disabled, false);
  assert.equal(JSON.parse(context.document.getElementById('supportSnapshotResult').textContent).schemaVersion, 7);
  assert.match(context.document.getElementById('reporterCheckHelp').textContent, /does not change/);
  assert.match(context.document.getElementById('reporterHelp').textContent, /Homey may truncate/);
  assert.match(context.document.getElementById('reporterHelp').textContent, /screenshot first/);
});

async function clickRemove(homey) {
  const context = loadSettingsScript();
  context.onHomeyReady(homey);
  const button = context.document.getElementById('clearAppAuth');
  await button.click();
  return {
    status: context.document.getElementById('appAuthSaved').textContent,
    state: context.document.getElementById('appAuthState').textContent,
  };
}

test('removing the EcoFlow account clears every credential key', async () => {
  const homey = fakeHomey({ values: storedAccount() });
  const { status, state } = await clickRemove(homey);

  for (const key of APP_AUTH_KEYS) assert.strictEqual(homey.store.has(key), false, `${key} was left behind`);
  assert.match(status, /^Removed\./);
  assert.match(state, /No EcoFlow account stored/);
});

test('support report copies displayed JSON only and handles unavailable clipboard', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  homey.api = (_method, _url, _body, cb) => cb(null, { schemaVersion: 6, drivers: [] });
  const copied = [];
  context.navigator = { clipboard: { writeText: async text => copied.push(text) } };
  context.onHomeyReady(homey);
  const show = context.document.getElementById('supportSnapshot');
  const copy = context.document.getElementById('copySupportSnapshot');
  await copy.click();
  assert.equal(copied.length, 0);
  await show.click();
  assert.equal(copy.disabled, false);
  await copy.click();
  assert.equal(copied[0], context.document.getElementById('supportSnapshotResult').textContent);
  assert.deepEqual(JSON.parse(copied[0]), { schemaVersion: 6, drivers: [] });
  context.navigator.clipboard.writeText = async () => { throw new Error('PRIVATE'); };
  await copy.click();
  assert.match(context.document.getElementById('supportCopyStatus').textContent, /copy it manually/);
  homey.api = (_method, _url, _body, cb) => cb(new Error('PRIVATE'));
  await show.click();
  assert.equal(copy.disabled, true);
  await copy.click();
  assert.equal(copied.length, 1, 'an old report is never copied after a failed refresh');
});

test('report refreshes cannot overlap or restore an older snapshot', () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  const calls = [];
  homey.api = (method, url, body, cb) => calls.push({ method, url, cb });
  context.onHomeyReady(homey);
  const show = context.document.getElementById('supportSnapshot');
  const check = context.document.getElementById('refreshReporterDiagnostics');
  const download = context.document.getElementById('downloadSupportSnapshot');
  show.click();
  check.click();
  show.click();
  assert.equal(calls.length, 1);
  assert.equal(show.disabled, true);
  assert.equal(check.disabled, true);
  calls[0].cb(null, { schemaVersion: 9, drivers: [] });
  assert.equal(download.disabled, false);
  check.click();
  show.click();
  assert.equal(calls.length, 2);
  assert.equal(download.disabled, true);
  calls[1].cb(new Error('PRIVATE'));
  assert.equal(show.disabled, false);
  assert.equal(check.disabled, false);
  assert.equal(download.disabled, true);
  assert.doesNotMatch(context.document.getElementById('supportSnapshotResult').textContent, /PRIVATE/);
});

test('missing callbacks time out, allow manual retry, and reject late/duplicate callbacks', () => {
  for (const [button, deadline] of [['supportSnapshot', 15000], ['refreshReporterDiagnostics', 180000]]) {
    const context = loadSettingsScript(); const homey = fakeHomey(); const calls = [];
    homey.api = (_method, _url, _body, cb) => calls.push(cb);
    context.onHomeyReady(homey);
    const show = context.document.getElementById(button);
    const output = context.document.getElementById('supportSnapshotResult');
    show.click();
    const [id, timer] = [...context.timers].find(([, entry]) => !entry.interval);
    assert.equal(timer.ms, deadline);
    timer.fn();
    assert.equal(context.timers.has(id), false);
    assert.equal(show.disabled, false);
    assert.match(output.textContent, /timed out/);
    assert.equal(calls.length, 1, 'no automatic network retry');
    assert.equal(context.document.getElementById('downloadSupportSnapshot').disabled, true);
    show.click();
    calls[0](null, { schemaVersion: 999 });
    assert.equal(show.disabled, true, 'old callback cannot unlock the new request');
    calls[1](null, { schemaVersion: 11 });
    calls[0](new Error('PRIVATE'));
    calls[1](null, { schemaVersion: 999 });
    assert.equal(JSON.parse(output.textContent).schemaVersion, 11);
    assert.equal([...context.timers.values()].filter(entry => !entry.interval).length, 0);
    context.events.pagehide();
    assert.equal(context.timers.size, 0);
    context.events.pageshow();
    context.events.pageshow();
    assert.equal(context.timers.size, 1, 'only one UI age timer after restore');
  }
});

test('synchronous API errors and page teardown fail safely without resurrecting old results', () => {
  const context = loadSettingsScript(); const homey = fakeHomey();
  homey.api = () => { throw new Error('PRIVATE'); };
  context.onHomeyReady(homey);
  const show = context.document.getElementById('supportSnapshot');
  show.click();
  assert.equal(show.disabled, false);
  assert.doesNotMatch(context.document.getElementById('supportSnapshotResult').textContent, /PRIVATE/);
  let callback;
  homey.api = (_method, _url, _body, cb) => { callback = cb; };
  show.click(); context.events.pagehide(); callback(null, { schemaVersion: 999 });
  assert.equal(context.document.getElementById('downloadSupportSnapshot').disabled, true);
  assert.equal(context.timers.size, 0);
});

test('a failing unset is reported instead of a false success', async () => {
  const homey = fakeHomey({
    values: storedAccount(),
    unsetFails: { appAuthEmail: 'settings unavailable' },
  });
  const { status, state } = await clickRemove(homey);

  assert.ok(!status.startsWith('Removed'), `unexpected success message: ${status}`);
  assert.match(status, /Could not remove/);
  assert.match(status, /settings unavailable/);
  // The password did get cleared, and the page reports what is really left.
  assert.strictEqual(homey.store.has('appAuthPassword'), false);
  assert.strictEqual(homey.store.get('appAuthEmail'), 'tester@example.invalid');
  assert.match(state, /Signed in as/);
});

test('a failing password unset stops before claiming anything was removed', async () => {
  const homey = fakeHomey({
    values: storedAccount(),
    unsetFails: { appAuthPassword: 'boom' },
  });
  const { status } = await clickRemove(homey);

  assert.match(status, /Could not remove/);
  assert.strictEqual(homey.store.get('appAuthPassword'), 'not-a-real-password');
  // Nothing after the first failure is claimed as done.
  assert.strictEqual(homey.store.has('appAuthEmail'), true);
});

test('an older Homey without unset still clears the account through set(null)', async () => {
  const homey = fakeHomey({ values: storedAccount(), withUnset: false });
  const { status, state } = await clickRemove(homey);

  for (const key of APP_AUTH_KEYS) assert.strictEqual(homey.store.get(key), null, `${key} was not nulled`);
  assert.match(status, /^Removed\./);
  assert.match(state, /No EcoFlow account stored/);
});

test('a failing set fallback is reported too', async () => {
  const homey = fakeHomey({
    values: storedAccount(),
    withUnset: false,
    setFails: { appAuthHost: 'settings unavailable' },
  });
  const { status } = await clickRemove(homey);

  assert.ok(!status.startsWith('Removed'), `unexpected success message: ${status}`);
  assert.match(status, /Could not remove/);
  assert.strictEqual(homey.store.get('appAuthHost'), 'https://api.ecoflow.com');
});

test('the stored password is never read back into the page', () => {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  assert.ok(!html.includes("Homey.get('appAuthPassword'"));
  assert.ok(!html.includes('Homey.get("appAuthPassword"'));
});

test('support report is requested locally on demand and rendered as text', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  let calls = 0;
  homey.api = (method, url, body, cb) => {
    calls += 1;
    assert.equal(method, 'GET');
    assert.equal(url, '/support-snapshot');
    assert.equal(body, null);
    cb(null, { appVersion: '1.10.17', harmless: '<script>not executable</script>' });
  };
  context.onHomeyReady(homey);
  assert.equal(calls, 0);
  await context.document.getElementById('supportSnapshot').click();
  assert.equal(calls, 1);
  const output = context.document.getElementById('supportSnapshotResult');
  assert.match(output.textContent, /1.10.17/);
  assert.match(output.textContent, /<script>not executable/);
  assert.equal(output.innerHTML, undefined);
});

test('support report failure cannot display private exception contents', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  homey.api = (_method, _url, _body, cb) => cb(new Error('secret-token'));
  context.onHomeyReady(homey);
  await context.document.getElementById('supportSnapshot').click();
  assert.match(context.document.getElementById('supportSnapshotResult').textContent, /Could not read/);
  assert.ok(!context.document.getElementById('supportSnapshotResult').textContent.includes('secret-token'));
  assert.equal(context.document.getElementById('supportSnapshot').disabled, false);
});

test('STREAM 5000 beta pairing is disabled by default and requires acknowledgement', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey({ confirmAccepted: false });
  context.onHomeyReady(homey);
  const checkbox = context.document.getElementById('stream5000BetaEnabled');

  assert.strictEqual(checkbox.checked, false);
  checkbox.checked = true;
  await checkbox.change();
  assert.strictEqual(checkbox.checked, false);
  assert.strictEqual(homey.store.has('stream5000BetaEnabled'), false);
  assert.match(context.document.getElementById('stream5000BetaSaved').textContent, /remains disabled/i);
});

test('accepting the warning persists STREAM 5000 beta access independently', async () => {
  const context = loadSettingsScript();
  const homey = fakeHomey();
  context.onHomeyReady(homey);
  const checkbox = context.document.getElementById('stream5000BetaEnabled');

  checkbox.checked = true;
  await checkbox.change();
  assert.strictEqual(homey.store.get('stream5000BetaEnabled'), true);
  assert.match(context.document.getElementById('stream5000BetaSaved').textContent, /enabled/i);

  checkbox.checked = false;
  await checkbox.change();
  assert.strictEqual(homey.store.get('stream5000BetaEnabled'), false);
  assert.match(context.document.getElementById('stream5000BetaSaved').textContent, /Existing paired devices will continue/i);
});

test('the STREAM 5000 settings clearly disclose the beta API risk', () => {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  assert.match(html, /STREAM 5000 Series \(Beta\)/i);
  assert.match(html, /Experimental, read-only integration/i);
  assert.match(html, /official API/i);
  assert.match(html, /Re-pairing may be required/i);
  assert.match(html, /Disabled by default/i);
  assert.match(html, /not available\s+through the supported public API/i);
  assert.match(html, /Monitoring only/i);
  assert.match(html, /controls are intentionally disabled/i);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { dualCtPreviewDiagnostics } = require('../.homeybuild/lib/dualCtDiagnostics');
const { describe, compact, render } = require('../settings/dual-ct-status');
const translations = require('../locales/en.json').settings.dual_ct;
const sn = 'DUALCTSYNTHETIC01';
function vi(n) { const out = []; do { out.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); return Buffer.from(out); }
function integer(f, n) { return Buffer.concat([vi(f * 8), vi(n)]); }
function msg(f, bytes) { return Buffer.concat([vi(f * 8 + 2), vi(bytes.length), bytes]); }
function float(f, value) { const bytes = Buffer.alloc(4); bytes.writeFloatLE(value); return Buffer.concat([vi(f * 8 + 5), bytes]); }
function frame(encoding, fields = float(515, -12345), cmdId = 21) {
  return msg(1, Buffer.concat([msg(1, fields), integer(8, 254), integer(9, cmdId),
    ...(encoding === undefined ? [] : [integer(6, encoding)])]));
}
function harness(enabled = false, immediate = false) {
  let now = 1000; let handler; let developerHandler;
  const hooks = { previewEnabled: enabled, now: () => now,
    list: async () => [{ sn, productName: '421', modelCodes: [{ field: 'productType', code: 421 }], shared: false, developerListed: true }],
    subscribe: async (_, fn) => { handler = fn; if (immediate) fn(frame(0), `/app/device/property/${sn}`); return true; },
    developerSubscribe: async (_, fn) => { developerHandler = fn; return true; },
    unsubscribe: () => {}, developerUnsubscribe: () => {}, timer: () => 1, cancel: () => {} };
  const capture = new DualCtResearch(hooks);
  return { capture, emit: (data, topic = `/app/device/property/${sn}`) => handler(data, topic),
    developer: data => developerHandler(data), setNow: n => { now = n; } };
}

test('receipt is confirmed independently of subscription, including callbacks before attach resolves', async () => {
  const h = harness(false, true); await h.capture.start();
  const report = h.capture.snapshot();
  const app = report.routes.find(route => route.source === 'app_mqtt');
  const developer = report.routes.find(route => route.source === 'developer_mqtt');
  assert.equal(app.status, 'listening'); assert.equal(app.receiptConfirmed, true); assert.equal(app.receivedPackets, 1);
  assert.equal(developer.receiptConfirmed, false);
  h.emit(frame(0), `/app/device/property/${sn}/get_reply`);
  assert.equal(h.capture.snapshot().routes[0].receivedPackets, 1);
  h.developer({ data: { power: 2 } });
  assert.equal(h.capture.snapshot().routes.find(route => route.source === 'developer_mqtt').receiptConfirmed, true);
  h.setNow(500); assert.equal(h.capture.snapshot().routes[0].receiptConfirmed, false);
  h.capture.stop('account_changed', true); assert.deepEqual(h.capture.snapshot().routes, []);
});

test('route receipts survive bounded history eviction but do not confirm another source/device', async () => {
  const h = harness(); await h.capture.start(); h.emit(frame(0));
  for (let i = 0; i < 40; i++) h.developer(i % 2 ? {} : { data: { power: i } });
  const report = h.capture.snapshot();
  assert.equal(report.history.some(event => event.source === 'app_mqtt' && event.status === 'protobuf'), false);
  assert.equal(report.routes.find(route => route.source === 'app_mqtt').receivedPackets, 1);
  assert.equal(report.routes.find(route => route.source === 'developer_mqtt').receivedPackets, 40);
  const old = describe({ routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' },
    { deviceIndex: 1, source: 'app_mqtt', status: 'listening' }, { deviceIndex: 0, source: 'developer_mqtt', status: 'listening' }],
    history: [{ deviceIndex: 0, source: 'app_mqtt', status: 'protobuf', samples: 49, lastAgeSec: 0 }] });
  assert.deepEqual(old.routes.map(route => route.receiptConfirmed), [true, false, false]);
});

test('compact projection renders Robert-shaped receipt evidence without claiming Developer receipt', () => {
  const evidence = { status: 'listening', deviceCount: 1, frames: 49,
    routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' }, { deviceIndex: 0, source: 'developer_mqtt', status: 'listening' }],
    history: [{ deviceIndex: 0, source: 'app_mqtt', status: 'protobuf', samples: 49, lastAgeSec: 0 }] };
  const element = { textContent: '', children: [], ownerDocument: { createElement: () => ({ textContent: '' }) },
    appendChild(row) { this.children.push(row); } };
  render(element, evidence, key => translations[key]);
  const rows = element.children.map(row => row.textContent);
  assert.match(rows.find(row => row.includes('App telemetry')), /receipt confirmed/);
  assert.match(rows.find(row => row.includes('Developer telemetry')), /receipt not established/);
  const output = compact(evidence, '1.10.43');
  assert.equal(output.summary.routes[0].receivedPackets, 49);
  assert.equal(output.previewDiagnostics.enabled, null); // Old evidence does not prove consent was disabled.
});

test('compact diagnostics distinguish disabled capture, missing/masked/unsupported flags and accepted payloads', async () => {
  const h = harness(true); await h.capture.start();
  h.emit(frame(undefined)); h.emit(frame(1)); h.emit(frame(2));
  let diagnostics = compact(h.capture.snapshot(), '1.10.43').previewDiagnostics;
  assert.equal(diagnostics.enabled, true); assert.equal(diagnostics.attemptedPayloads, 1);
  assert.equal(diagnostics.omittedMarkerAttempts, 1); assert.equal(diagnostics.omittedMarkerAccepted, 0);
  assert.equal(diagnostics.encodingCounts.missing, 1); assert.equal(diagnostics.encodingCounts.masked, 1);
  assert.equal(diagnostics.encodingCounts.unsupported, 1); assert.equal(diagnostics.reason, 'unsupported_encoding');
  h.emit(frame(0));
  diagnostics = h.capture.snapshot().previewDiagnostics;
  assert.equal(diagnostics.reason, 'ready'); assert.equal(diagnostics.acceptedPayloads, 1);
  assert.equal(diagnostics.attemptedPayloads, 2);
  h.emit(frame(1, integer(293, 5), 22));
  assert.deepEqual(h.capture.snapshot().previewDiagnostics, diagnostics, 'runtime/configuration does not override measurement diagnostics');
  for (const output of [h.capture.snapshot(), dualCtResearchSnapshot(h.capture.snapshot()), compact(h.capture.snapshot(), '1.10.43')]) {
    assert.doesNotMatch(JSON.stringify(output), /12345|DUALCTSYNTHETIC|candidateUnit|\"devices\":\[/);
    assert.equal(output.valuesIncluded, false);
  }
  h.capture.stop();
  assert.equal(h.capture.snapshot().previewDiagnostics.reason, 'stopped');
  assert.equal(h.capture.snapshot().previewDiagnostics.acceptedPayloads, 1);
  assert.deepEqual(h.capture.previewSnapshot().devices, []);
});

test('extra scalar structure stays anonymous and unassigned, not numeric second-bank telemetry', async () => {
  const h = harness(false); await h.capture.start();
  h.emit(frame(undefined, Buffer.concat([985,986,987,988,989,990,991,992,993,998].map(field => float(field, 12345)))));
  const report = compact(h.capture.snapshot(), '1.10.43');
  assert.equal(report.previewDiagnostics.enabled, false);
  assert.equal(report.previewDiagnostics.reason, 'disabled');
  assert.equal(report.previewDiagnostics.additionalScalarFieldsSeen.length, 10);
  assert.equal(report.previewDiagnostics.additionalBankMappingVerified, false);
  assert.equal(report.previewDiagnostics.attemptedPayloads, 0);
  assert.doesNotMatch(JSON.stringify(report), /12345|solarPower|ct1Power|candidateUnit/);
  assert.equal(report.structureCoverage.fieldsIncluded, 10);
  const projected = dualCtPreviewDiagnostics({ enabled: 'PRIVATE', reason: 'PRIVATE', raw: 'PRIVATE',
    devices: [{ value: 'PRIVATE' }], encodingCounts: { missing: Infinity }, additionalScalarFieldsSeen: [985,985,'985',773,998] });
  assert.equal(projected.enabled, null); assert.equal(projected.reason, 'not_reported');
  assert.deepEqual(projected.additionalScalarFieldsSeen, [985,998]);
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE/);
});

test('encoding metadata survives unreadable masked pdata, but neither plaintext nor decryption is guessed', async () => {
  const h = harness(true); await h.capture.start();
  h.emit(frame(1, Buffer.from([0xff,0xff])));
  const report = h.capture.snapshot();
  assert.equal(report.previewDiagnostics.encodingCounts.masked, 1);
  assert.equal(report.previewDiagnostics.reason, 'unsupported_encoding');
  assert.equal(report.previewDiagnostics.attemptedPayloads, 0);
  assert.equal(report.rejectedFrames, 1);
  assert.equal(report.routes[0].receiptConfirmed, true);
  assert.deepEqual(h.capture.previewSnapshot().devices, []);
});

test('maximum preview/receipt metadata remains bounded in compact export and has translated reasons', () => {
  const evidence = { previewDiagnostics: { enabled: true, reason: 'ready', attemptedPayloads: 2048, acceptedPayloads: 2048,
    encodingCounts: Object.fromEntries(['explicit_plain','missing','masked','unsupported','invalid_header'].map(key => [key,2048])),
    additionalScalarFieldsSeen: [985,986,987,988,989,990,991,992,993,998], raw: 'PRIVATE' },
    routes: [0,1].flatMap(deviceIndex => ['app_mqtt','developer_mqtt','developer_rest','linked_host_rest'].map(source =>
      ({ deviceIndex, source, status: 'listening', receiptConfirmed: true, receivedPackets: 128, lastReceiptAgeSec: 9000 }))),
    shapes: Array.from({ length: 16 }, (_, i) => ({ deviceIndex: i % 2, cmdFunc: 254, cmdId: i,
      fields: Array.from({ length: 32 }, (_, n) => ({ field: n + 1, wire: 5, value: 'PRIVATE' })) })) };
  const report = compact(evidence, '1.10.43');
  assert.ok(JSON.stringify(report, null, 2).length <= 7500);
  assert.equal(report.previewDiagnostics.reason, 'ready');
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  for (const lang of ['en','de','nl']) {
    const locale = require(`../locales/${lang}.json`).settings.dual_ct;
    for (const reason of ['ready','disabled','no_samples','missing_encoding','unsupported_encoding','invalid_header',
      'model_unverified','no_supported_candidates','expired','stopped','account_changed','capture_unavailable','not_reported']) {
      assert.equal(typeof locale['preview_' + reason], 'string');
    }
  }
});

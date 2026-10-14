'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtPreview } = require('../.homeybuild/lib/dualCtPreview');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { compact, renderPreview, candidateExport } = require('../settings/dual-ct-status');
const api = require('../.homeybuild/api');
function vi(value) { const out = []; do { out.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value); return Buffer.from(out); }
function integer(field, value) { return Buffer.concat([vi(field * 8), vi(value)]); }
function msg(field, value) { return Buffer.concat([vi(field * 8 + 2), vi(value.length), value]); }
function float(field, value) { const bytes = Buffer.alloc(4); bytes.writeFloatLE(value); return Buffer.concat([vi(field * 8 + 5), bytes]); }
const context = { productType: 421, cmdFunc: 254, cmdId: 21, source: 'app_mqtt', encoding: 'plain', receivedAt: 1000, now: 1000 };

test('local preview is opt-in, per-field fresh, preserves signed zero and does not manufacture direction', () => {
  const off = new DualCtPreview(false); off.observe(0, float(515, -7), context);
  assert.deepEqual(off.snapshot(1000).devices, []);
  const preview = new DualCtPreview(true);
  preview.observe(0, Buffer.concat([float(515, -7), float(956, 230)]), context);
  preview.observe(0, float(515, 0), { ...context, receivedAt: 80000, now: 80000 });
  const snapshot = preview.snapshot(92000);
  assert.equal(snapshot.devices[0].readings.length, 1);
  assert.equal(snapshot.devices[0].readings[0].value, 0);
  assert.equal(snapshot.devices[0].readings[0].receivedAgeSec, 12);
  assert.equal(snapshot.unitsVerified, false); assert.equal(snapshot.directionVerified, false);
  assert.equal(snapshot.measurementTimestampKnown, false);
  assert.equal(snapshot.contributesToEnergy, false);
  assert.deepEqual(preview.snapshot(170001).devices, []);
});

test('clock rollback, clear and invalid identity/source cannot resurrect values', () => {
  const preview = new DualCtPreview(true);
  for (const override of [{ productType: 420 }, { source: 'developer_mqtt' }, { encoding: 'unknown' }, { receivedAt: 1001 }]) {
    preview.observe(0, float(515, 8), { ...context, ...override });
  }
  preview.observe(2, float(515, 8), context);
  assert.deepEqual(preview.snapshot(1000).devices, []);
  preview.observe(0, float(515, -7), context);
  assert.deepEqual(preview.snapshot(999).devices, []);
  assert.deepEqual(preview.snapshot(1001).devices, []);
  preview.observe(0, float(515, 10), { ...context, receivedAt: 1001, now: 1001 });
  preview.clear(); assert.deepEqual(preview.snapshot(1001).devices, []);
});

test('research preview requires explicit plaintext/live owned type 421; exports retain no numeric telemetry', async () => {
  const sn = 'DUALCTSYNTHETIC01'; let handler; let now = 1000;
  const capture = new DualCtResearch({ previewEnabled: true, now: () => now,
    list: async () => [{ sn, shared: false, productName: '421', modelCodes: [{ field: 'productType', code: 421 }] }],
    subscribe: async (_, fn) => { handler = fn; return true; }, unsubscribe: () => {}, timer: () => 1, cancel: () => {} });
  await capture.start();
  const packet = (encoding) => msg(1, Buffer.concat([msg(1, float(515, -12345)), integer(8, 254), integer(9, 21),
    ...encoding, msg(25, Buffer.from(sn))]));
  assert.equal(capture.snapshot().valuesCaptured, false);
  for (const encoding of [[], [integer(6, 1)], [integer(6, 0), integer(6, 0)],
    [integer(6, 0), integer(8, 254)], [msg(6, Buffer.from([0]))],
    [integer(6, 0), msg(1, float(515, 12))], [integer(6, 0), Buffer.from([0, 0])]]) {
    handler(packet(encoding), `/app/device/property/${sn}`);
    assert.deepEqual(capture.previewSnapshot().devices, []);
  }
  handler(Buffer.concat([packet([integer(6, 0)]), Buffer.from([0, 0])]), `/app/device/property/${sn}`);
  assert.deepEqual(capture.previewSnapshot().devices, []);
  handler(packet([integer(6, 0)]), `/app/device/property/${sn}/get_reply`);
  assert.deepEqual(capture.previewSnapshot().devices, []);
  handler(packet([integer(6, 0)]), `/app/device/property/${sn}`);
  assert.equal(capture.previewSnapshot().devices[0].readings[0].value, -12345);
  for (const report of [capture.snapshot(), dualCtResearchSnapshot(capture.snapshot()), compact(capture.snapshot(), '1.10.42')]) {
    assert.equal(report.valuesCaptured, true); assert.equal(report.valuesIncluded, false);
    assert.doesNotMatch(JSON.stringify(report), /12345|candidateUnit|DUALCTSYNTHETIC/);
  }
  now = 92000; assert.deepEqual(capture.previewSnapshot().devices, []);
  now = 93000; handler(packet([integer(6, 0)]), `/app/device/property/${sn}`);
  capture.stop(); assert.deepEqual(capture.previewSnapshot().devices, []);
});

test('preview renderer exposes field-number candidates only and rejects expired/nonfinite values', () => {
  const preview = new DualCtPreview(true); preview.observe(0, float(515, -7), context);
  const element = { textContent: '' }; const translate = (key) => key;
  assert.equal(renderPreview(element, preview.snapshot(1000), translate), 90000);
  assert.match(element.textContent, /preview_warning/); assert.match(element.textContent, /515: -7/);
  assert.doesNotMatch(element.textContent, /aggregatePower|import|export/);
  const bad = preview.snapshot(1000);
  bad.devices[0].readings[0].receivedAgeSec = 90;
  assert.equal(renderPreview(element, bad, translate), 0);
  assert.equal(element.textContent, 'preview_expired');
});

test('research numeric retention is off by default, unknown product metadata stays structural, and account change clears', async () => {
  const sn = 'DUALCTSYNTHETIC01';
  for (const options of [{ code: true }, { previewEnabled: true, code: false }, { previewEnabled: true, code: true }]) {
    let handler;
    const capture = new DualCtResearch({ previewEnabled: options.previewEnabled, now: () => 1000,
      list: async () => [{ sn, productName: 'EcoFlow Smart Meter Dual CT', shared: false,
        modelCodes: options.code ? [{ field: 'productType', code: 421 }] : [] }],
      subscribe: async (_, fn) => { handler = fn; return true; }, unsubscribe: () => {}, timer: () => 1, cancel: () => {} });
    await capture.start();
    handler(msg(1, Buffer.concat([msg(1, float(515, -12345)), integer(6, 0), integer(8, 254), integer(9, 21)])), `/app/device/property/${sn}`);
    assert.equal(capture.snapshot().frames, 1);
    assert.equal(capture.previewSnapshot().devices.length, options.previewEnabled && options.code ? 1 : 0);
    capture.stop('account_changed', true);
    assert.deepEqual(capture.previewSnapshot().devices, []);
    assert.equal(capture.snapshot().valuesCaptured, false);
  }
});

test('preview API accepts only explicit boolean consent and has no supplied clock/device input', async () => {
  const flags = []; const homey = { app: { startDualCtResearch: flag => { flags.push(flag); return {}; },
    getDualCtPreviewSnapshot: () => ({ enabled: false, devices: [] }) } };
  for (const body of [undefined, {}, { previewEnabled: 'true' }, { previewEnabled: 1 }, { previewEnabled: true }]) {
    await api.startDualCtResearch({ homey, body });
  }
  assert.deepEqual(flags, [false, false, false, false, true]);
  assert.deepEqual(await api.dualCtPreview({ homey, body: { now: 1, sn: 'PRIVATE' } }), { enabled: false, devices: [] });
});

test('preview reasons distinguish opt-out, unsupported encoding, missing candidates, ready and expired', () => {
  assert.equal(new DualCtPreview(false).snapshot(1000).reason, 'disabled');
  const preview = new DualCtPreview(true);
  assert.equal(preview.snapshot(1000).reason, 'no_samples');
  for (const reason of ['missing_encoding', 'unsupported_encoding', 'invalid_header', 'model_unverified']) {
    preview.noteUnavailable(reason); assert.equal(preview.snapshot(1000).reason, reason);
    const element = { textContent: '' };
    renderPreview(element, preview.snapshot(1000), key => key);
    assert.equal(element.textContent, 'preview_' + reason);
  }
  preview.observe(0, float(777, 20), context);
  assert.equal(preview.snapshot(1000).reason, 'no_supported_candidates');
  preview.observe(0, float(515, 0), context);
  assert.equal(preview.snapshot(1000).reason, 'ready');
  assert.equal(preview.snapshot(91001).reason, 'expired');
});

test('candidate export has bounded numeric evidence only, no identifiers/raw packets or inferred roles', () => {
  const preview = new DualCtPreview(true); preview.observe(0, float(515, -7), context);
  const input = { ...preview.snapshot(1000), appVersion: '1.10.42', serial: 'PRIVATE', email: 'PRIVATE', raw: 'PRIVATE' };
  input.devices[0].sn = 'PRIVATE'; input.devices[0].readings[0].candidate = 'IMPORT';
  const output = candidateExport(input);
  assert.equal(output.reportType, 'dual_ct_candidate_preview');
  assert.equal(output.devices[0].readings[0].value, -7);
  assert.equal(output.unitsVerified, false); assert.equal(output.directionVerified, false);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|IMPORT|aggregatePower|phase/);
  assert.ok(JSON.stringify(output, null, 2).length < 7500);
  assert.equal(candidateExport({ ...input, unitsVerified: true }), null);
  assert.equal(candidateExport({ ...input, enabled: false }), null);
  input.devices[0].readings[0].receivedAgeSec = 90;
  assert.equal(candidateExport(input), null);
  assert.doesNotMatch(JSON.stringify(compact(input, '1.10.42')), /\"value\"|candidateUnit/);
});

test('research explains failed discovery/no meter/no transport without zero readings', async () => {
  const device = { sn: 'DUALCTSYNTHETIC01', productName: '421', shared: false, modelCodes: [{ field: 'productType', code: 421 }] };
  for (const [list, reason] of [[async () => [], 'no_eligible_meter'],
    [async () => { throw new Error('PRIVATE'); }, 'capture_unavailable'], [async () => [device], 'capture_unavailable']]) {
    const capture = new DualCtResearch({ previewEnabled: true, now: () => 1000, list,
      subscribe: async () => false, unsubscribe: () => {}, timer: () => 1, cancel: () => {} });
    await capture.start();
    assert.equal(capture.previewSnapshot().reason, reason);
    assert.deepEqual(capture.previewSnapshot().devices, []);
    assert.doesNotMatch(JSON.stringify(capture.previewSnapshot()), /PRIVATE/);
  }
});

test('maximum candidate export is compact and rejects invalid fields, values, units and ages', () => {
  const fields = [[515, 'W'], [962, 'W'], [963, 'W'], [772, 'W'], [956, 'V'], [957, 'V'], [771, 'V'], [958, 'A'], [959, 'A'], [784, 'A']];
  const input = { enabled: true, interpretation: 'legacy_meter_overlap_unverified', unitsVerified: false, directionVerified: false,
    devices: [0, 1, 2].map(deviceIndex => ({ deviceIndex, sn: 'PRIVATE',
      readings: fields.map(([field, candidateUnit]) => ({ field, candidateUnit, value: -999999.123456789, receivedAgeSec: 0 })) })) };
  const report = candidateExport(input);
  assert.equal(report.devices.length, 2); assert.equal(report.devices[0].readings.length, 10);
  assert.ok(JSON.stringify(report, null, 2).length < 7500);
  for (const override of [{ field: '515' }, { field: 998 }, { value: Infinity }, { value: 1000001 }, { candidateUnit: 'kW' }, { receivedAgeSec: -1 }]) {
    const invalid = { ...input, devices: [{ deviceIndex: 0, readings: [{ field: 515, value: 0, candidateUnit: 'W', receivedAgeSec: 0, ...override }] }] };
    assert.equal(candidateExport(invalid), null);
  }
});

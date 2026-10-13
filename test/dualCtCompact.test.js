'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dualCtInventorySummary, dualCtInventorySnapshot, dualCtResearchDevices } = require('../.homeybuild/lib/dualCtSources');
const { compact } = require('../settings/dual-ct-status');
const { DualCtResearch, dualCtResearchSnapshot } = require('../.homeybuild/lib/dualCtResearch');
const { dualCtModelCodes } = require('../.homeybuild/lib/dualCtMetadata');
const { normalizeAppDeviceList } = require('../.homeybuild/lib/appDevices');

test('display name hint explains missing metadata without authorising discovery', () => {
  const rows = [{ sn: 'PRIVATE12345', name: 'Smart Meter Dual CT-1930', productName: '', shared: false }];
  assert.deepEqual(dualCtResearchDevices(rows), []);
  const summary = dualCtInventorySummary(rows, [], [true, false]);
  assert.equal(summary[0].missingProductMetadata, 1);
  assert.equal(summary[0].displayNameHints, 1);
  assert.equal(summary[0].explicitMatches, 0);
  assert.equal(summary[1].available, false);
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE|1930/);
});

test('explicit model gate retains ownership and bounded inventory rules', () => {
  const row = { sn: 'ZZ9912345678', name: 'private', productName: 'EcoFlow Smart-Meter Dual_CT', shared: false };
  assert.equal(dualCtResearchDevices([row]).length, 1);
  assert.equal(dualCtResearchDevices([{ ...row, shared: true }]).length, 0);
  const summary = dualCtInventorySummary(Array(300).fill(row), [], [true, true]);
  assert.equal(summary[0].inspected, 256);
  assert.equal(summary[0].truncated, true);
});

test('compact report is bounded and excludes private integration payloads', () => {
  const evidence = { status: 'no_explicit_model', deviceCount: 0, frames: 0,
    secret: 'PRIVATE_SECRET', shapes: Array(10000).fill({ raw: 'PRIVATE_RAW' }),
    inventory: [{ source: 'app', available: true, inspected: 12, missingProductMetadata: 2,
      displayNameHints: 1, productName: 'PRIVATE_MODEL', sn: 'PRIVATE_SN' }] };
  const report = compact(evidence);
  assert.equal(report.summary.state, 'no_explicit_model');
  assert.equal(report.inventory[0].displayNameHints, 1);
  assert.equal(report.contributesToEnergy, false);
  assert.equal(report.controlsEnabled, false);
  assert.ok(JSON.stringify(report).length < 2000);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  assert.deepEqual(dualCtInventorySnapshot([{ source: 'private', inspected: 999 }]), []);
  assert.equal(dualCtResearchSnapshot(evidence).inventory[0].inspected, 12);
});

test('compact report rejects arbitrary status routes and invalid counts', () => {
  const report = compact({ status: 'PRIVATE', inventory: [{ source: 'app', inspected: Infinity,
    displayNameHints: -1 }], routes: [{ source: 'PRIVATE', deviceIndex: 0, status: 'listening' }] });
  assert.equal(report.summary.state, 'not_started');
  assert.equal(report.inventory[0].inspected, 0);
  assert.deepEqual(report.summary.routes, []);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
});

test('failed identification retains anonymous inventory and account clearing removes it', async () => {
  const capture = new DualCtResearch({ list: async () => [],
    inventory: () => [{ source: 'app', available: true, inspected: 4, missingProductMetadata: 1 }],
    subscribe: async () => { throw new Error('Must not subscribe'); }, unsubscribe: () => {},
    timer: () => 1, cancel: () => {} });
  await capture.start();
  assert.equal(capture.snapshot().status, 'no_explicit_model');
  assert.equal(capture.snapshot().inventory[0].inspected, 4);
  capture.stop('account_changed', true);
  assert.deepEqual(capture.snapshot().inventory, []);
});

test('model codes preserve numeric vendor identifiers but never arbitrary strings or serial fields', () => {
  assert.deepEqual(dualCtModelCodes({ productId: '123', productType: 'PRIVATE', modelId: 42,
    deviceType: -1, sn: 999, email: 'PRIVATE' }), [{ field: 'productId', code: 123 }, { field: 'modelId', code: 42 }]);
  const rows = normalizeAppDeviceList({ bound: [{ sn: 'ZZ9912345678', productName: '',
    deviceName: 'Smart Meter Dual CT-PRIVATE', productId: 123, modelId: 42 }] });
  assert.deepEqual(rows[0].modelCodes, [{ field: 'productId', code: 123 }, { field: 'modelId', code: 42 }]);
  const summary = dualCtInventorySummary(rows, [], [true, false]);
  assert.deepEqual(summary[0].candidates[0].codes, rows[0].modelCodes);
  assert.equal(dualCtResearchDevices(rows).length, 0);
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE|ZZ99/);
});

test('compact structure excludes scalar values and arbitrary field paths, and includes safe version', () => {
  const report = compact({ status: 'complete', jsonShapes: [{ deviceIndex: 0, source: 'developer_rest', fields: [
    { path: 'phaseA.power', type: 'number', value: 123456 }, { path: 'PRIVATE', type: 'string' },
  ] }], shapes: [{ deviceIndex: 0, cmdFunc: 254, cmdId: 21,
    fields: [{ field: 1, wire: 0, value: 'PRIVATE' }] }] }, '1.10.39');
  assert.equal(report.appVersion, '1.10.39');
  assert.deepEqual(report.jsonShapes[0].fields, [{ path: 'phaseA.power', type: 'number' }]);
  assert.deepEqual(report.shapes[0].fields, [{ field: 1, wire: 0 }]);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|123456/);
  assert.equal(compact({}, 'PRIVATE').appVersion, 'unknown');
  assert.equal(report.valuesCaptured, false);
});

test('worst-case compact report stays below the message budget and declares omitted structure', () => {
  const fields = Array.from({ length: 16 }, () => ({ path: Array(7).fill('gridConnectionPower').join('.'), type: 'number' }));
  const report = compact({ jsonShapes: Array(8).fill({ deviceIndex: 0, source: 'developer_rest', fields }) });
  assert.ok(JSON.stringify(report, null, 2).length <= 7500);
  assert.equal(report.structureOmitted, true);
  assert.deepEqual(report.jsonShapes, []);
});

test('worst-case metadata also stays below the copy budget with an explicit omission flag', () => {
  const candidate = { shared: true, metadataPresent: true, codes: ['productId', 'productType', 'modelId', 'deviceType']
    .map((field) => ({ field, code: 4294967295 })) };
  const report = compact({ deviceCount: 1, selected: [{ deviceIndex: 0, basis: 'observed_app_product_type_421', appListed: true }],
    routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' }], inventory: ['app', 'developer'].map((source) => ({ source,
    available: true, inspected: 256, candidates: Array(8).fill(candidate) })) });
  assert.ok(JSON.stringify(report, null, 2).length <= 7500);
  assert.equal(report.metadataOmitted, true);
  assert.equal(report.summary.selected[0].basis, 'observed_app_product_type_421');
  assert.equal(report.summary.routes[0].status, 'listening');
});

test('field-observed productType 421 admits owned app rows without treating it as an explicit name', () => {
  const { mergeDualCtInventory, dualCtDiscoveryIdentity } = require('../.homeybuild/lib/dualCtSources');
  const app = normalizeAppDeviceList({ bound: [{ sn: 'ZZ99SYNTHETIC0421', productType: 421, deviceName: 'renamed' }] });
  assert.equal(dualCtDiscoveryIdentity(app[0]), 'observed_app_product_type_421');
  assert.equal(dualCtResearchDevices(app).length, 1);
  const summary = dualCtInventorySummary(app, [], [true, true]);
  assert.equal(summary[0].explicitMatches, 0);
  assert.equal(summary[0].observedCodeMatches, 1);
  assert.equal(compact({ inventory: summary }).inventory[0].observedCodeMatches, 1);
  const merged = mergeDualCtInventory(app, [{ sn: app[0].sn, online: 1 }]);
  assert.equal(merged[0].appListed, true);
  assert.equal(merged[0].developerListed, true);
  assert.deepEqual(mergeDualCtInventory([], [{ sn: app[0].sn, productName: '421', productType: 421 }]), []);
});

test('421 does not admit renamed original meters, shared devices, conflicting models or unrelated codes', () => {
  const base = { sn: 'ZZ99SYNTHETIC0421', name: 'Smart Meter Dual CT', productName: '421',
    shared: false, modelCodes: [{ field: 'productType', code: 421 }] };
  const denied = [
    { ...base, shared: true }, { ...base, sn: 'bad/serial' },
    { ...base, productName: 'STREAM Ultra X' }, { ...base, productName: 'Smart Meter' },
    { ...base, modelCodes: [] }, { ...base, modelCodes: [{ field: 'productId', code: 421 }] },
    { ...base, modelCodes: [{ field: 'productType', code: 420 }] },
  ];
  denied.forEach((device) => assert.equal(dualCtResearchDevices([device]).length, 0));
  const unknown = normalizeAppDeviceList({ bound: [{ sn: base.sn, productType: 422, deviceName: base.name }] });
  assert.equal(dualCtResearchDevices(unknown).length, 0);
  assert.equal(dualCtResearchDevices(Array(3).fill(base)).length, 1);
});

test('421 capture reaches read-only app subscription with live structure only and cleans up', async () => {
  const app = normalizeAppDeviceList({ bound: [{ sn: 'ZZ99SYNTHETIC0421', productType: '421' }] });
  let subscribed = null; let removed = false;
  const capture = new DualCtResearch({ list: async () => app,
    subscribe: async (sn, handler) => { subscribed = { sn, handler }; return true; },
    unsubscribe: () => { removed = true; }, timer: () => 1, cancel: () => {} });
  await capture.start();
  assert.equal(capture.snapshot().status, 'listening');
  assert.equal(capture.snapshot().selected[0].basis, 'observed_app_product_type_421');
  assert.equal(subscribed.sn, app[0].sn);
  assert.equal(capture.snapshot().pairingEnabled, false);
  assert.equal(capture.snapshot().contributesToEnergy, false);
  assert.equal(capture.snapshot().controlsEnabled, false);
  const payload = Buffer.from(JSON.stringify({ phaseA: { power: 123456 }, privateValue: 'PRIVATE' }));
  subscribed.handler(payload, `/app/device/property/${app[0].sn}/get_reply`);
  assert.equal(capture.snapshot().frames, 0);
  subscribed.handler(payload, `/app/device/property/${app[0].sn}`);
  assert.equal(capture.snapshot().frames, 1);
  assert.equal(capture.snapshot().valuesCaptured, false);
  assert.doesNotMatch(JSON.stringify(capture.snapshot()), /123456|PRIVATE|ZZ99/);
  capture.stop();
  assert.equal(removed, true);
  subscribed.handler(payload, `/app/device/property/${app[0].sn}`);
  assert.equal(capture.snapshot().frames, 1);
});

test('selected identity and transport outcome survive compact budget trimming without private fields', () => {
  const { describe } = require('../settings/dual-ct-status');
  const selected = [{ deviceIndex: 0, basis: 'observed_app_product_type_421', sn: 'PRIVATE', provisional: false, appListed: true }];
  const input = { status: 'listening', deviceCount: 1, selected,
    routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' }] };
  assert.equal(describe(input).stage, 'subscribed_no_samples');
  const report = compact(input);
  assert.equal(report.summary.selected[0].provisional, true);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  assert.equal(describe({ ...input, routes: [], status: 'transport_unavailable' }).stage, 'identified_no_transport');
  assert.equal(describe({ ...input, routes: [] }).stage, 'identified');
  assert.equal(describe({ ...input, history: [{ source: 'app_json', status: 'json', lastAgeSec: 1 }] }).stage, 'structure_captured');
  assert.equal(describe({ status: 'no_explicit_model' }).stage, 'not_identified');
});

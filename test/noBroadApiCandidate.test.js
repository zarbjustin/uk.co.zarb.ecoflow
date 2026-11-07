'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DualCtHomeyEnergyContext, readOwnAppEnergyDevices, dualCtHomeyContributors } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
const { createHomeyCoordinationReader } = require('../.homeybuild/lib/coordinationWorkspace');
const appId = 'uk.co.zarb.ecoflow';
const sn = 'DUALCTSYNTHETIC01';
function device(source, energy, settings = {}) {
  return { getData: () => ({ sn: source }), getName: () => 'Synthetic meter', getCapabilities: () => ['measure_power', 'meter_power.imported'],
    getEnergy: () => energy, getSettings: () => settings };
}
function homey(rows = {}) {
  const definitions = [{ id: 'smartmeter', energy: { cumulative: true } }, { id: 'smartmeter_dual_ct_energy', energy: { cumulative: true } },
    { id: 'stream_unit', energy: {} }];
  return { manifest: { id: appId, drivers: definitions }, drivers: { getDriver: id => ({ getDevices: () => rows[id] || [] }) },
    api: { getOwnerApiToken: () => assert.fail('whole-Homey token must never be requested'), getLocalUrl: () => assert.fail('loopback API must never be requested') } };
}
function context(h, own = false) {
  const client = { getSession: async () => ({ host: 'https://api.ecoflow.com', userId: 'synthetic' }),
    getDeviceList: async () => [{ sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] }],
    getDualCtCurrentFirmware: async () => ({ version: '1.0.0.41' }) };
  return new DualCtHomeyEnergyContext({ homey: h, sn, client: () => client, now: () => 100000,
    ...(own ? { ownDevice: { sn, driverId: `homey:app:${appId}:smartmeter_dual_ct_energy` } } : {}) });
}
test('production candidate does not request broad Homey API access', () => {
  for (const path of ['.homeycompose/app.json', 'app.json']) assert(!JSON.parse(fs.readFileSync(path)).permissions.includes('homey:manager:api'));
});
test('normal Dual CT context works with standard SDK only and declares the external-review boundary', async () => {
  const c = context(homey()); await c.refresh(); const snapshot = c.snapshot();
  assert(snapshot); assert.equal(snapshot.inventory.complete, true);
  assert.equal(snapshot.inventory.scope, 'app_owned'); assert.equal(snapshot.inventory.externalInventoryVerified, false);
  assert.deepEqual(snapshot.inventory.contributors, []); c.close();
});
test('same-app active meters still block and excluded/downstream meters remain distinct', async () => {
  const h = homey({ smartmeter: [device('METER1', { cumulative: true }), device('METER2', { cumulative: true }, { energy_exclude: true }),
    device('METER3', { cumulative: true }, { energy_cumulative_include: false })] });
  const c = context(h); await c.refresh(); const rows = c.snapshot().inventory.contributors;
  assert.equal(rows.length, 3); assert.equal(rows.filter(r => r.contributes).length, 1); c.close();
});
test('own Energy device is excluded exactly once; another source and duplicate own identities cannot be hidden', async () => {
  const d = device(sn, { cumulative: true });
  const c = context(homey({ smartmeter_dual_ct_energy: [d] }), true); await c.refresh(); assert.deepEqual(c.snapshot().inventory.contributors, []); c.close();
  const duplicate = context(homey({ smartmeter_dual_ct_energy: [d, d] }), true);
  await assert.rejects(duplicate.refresh()); assert.equal(duplicate.snapshot(), null);
});
test('unknown SDK inventory or malformed settings fail closed instead of becoming empty complete inventory', async () => {
  for (const h of [{}, homey({ smartmeter: [device('METER', { cumulative: true }, { energy_exclude: 'true' })] }),
    { ...homey(), drivers: { getDriver() { throw Error('missing'); } } }]) {
    const c = context(h); try { await c.refresh(); } catch { /* Unknown SDK state may reject or return an incomplete snapshot. */ }
    assert.notEqual(c.snapshot()?.inventory.complete, true); c.close();
  }
});
test('device/driver identities are stable across fresh scans and native Energy definitions are never rewritten', async () => {
  const d = device('METER', { cumulative: true }); d.setEnergy = () => assert.fail('write'); d.setSettings = () => assert.fail('write');
  const h = homey({ smartmeter: [d] }); const first = await readOwnAppEnergyDevices(h); const second = await readOwnAppEnergyDevices(h);
  assert.deepEqual(Object.keys(first), Object.keys(second)); assert.equal(dualCtHomeyContributors(first).contributors.length, 1);
});
test('advanced cross-app reader explicitly requires an external runner and cannot acquire a token', async () => {
  await assert.rejects(createHomeyCoordinationReader(homey()), /external_reader_required/);
});


test('owned-inventory completeness never substitutes for explicit external-meter review', async () => {
  const { planDualCtEnergyAdoption } = require('../.homeybuild/lib/dualCtEnergyAdoption');
  const c = context(homey()); await c.refresh(); const inventory = c.snapshot().inventory;
  const request = { explicitConsent: true, target: 'new_energy_device', accounting: 'power', binding: 'a'.repeat(64),
    grid: 'homey_property_grid', inventoryComplete: inventory.complete, contributors: inventory.contributors,
    contractQualified: true, externalOverlapReviewed: false };
  assert.equal(inventory.externalInventoryVerified, false);
  assert.equal(planDualCtEnergyAdoption(request).status, 'external_overlap_review_required');
  assert.equal(planDualCtEnergyAdoption({ ...request, externalOverlapReviewed: true }).preparationAllowed, true);
  c.close();
});


test('an undefined SDK cumulative override cannot hide a declared EcoFlow property meter', async () => {
  const rows = await readOwnAppEnergyDevices(homey({ smartmeter: [device('METER', { cumulative: undefined })] }));
  const result = dualCtHomeyContributors(rows);
  assert.equal(result.complete, true); assert.equal(result.contributors.filter(r => r.contributes).length, 1);
});

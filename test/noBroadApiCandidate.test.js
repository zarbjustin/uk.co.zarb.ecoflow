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
function context(h, own = false, communityThreePhase = false) {
  const client = { getSession: async () => ({ host: 'https://api.ecoflow.com', userId: 'synthetic' }),
    getDeviceList: async () => [{ sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] }],
    getDualCtCurrentFirmware: async () => ({ version: '1.0.0.41' }) };
  return new DualCtHomeyEnergyContext({ homey: h, sn, client: () => client, now: () => 100000, communityThreePhase,
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
  const h = homey({ smartmeter: [device('METER1', { cumulative: true }, { property_meter_role: 'included' }), device('METER2', { cumulative: true }, { energy_exclude: true }),
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
  const d = device('METER', { cumulative: true }, { property_meter_role: 'included' }); d.setEnergy = () => assert.fail('write'); d.setSettings = () => assert.fail('write');
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
  const rows = await readOwnAppEnergyDevices(homey({ smartmeter: [device('METER', { cumulative: undefined }, { property_meter_role: 'included' })] }));
  const result = dualCtHomeyContributors(rows);
  assert.equal(result.complete, true); assert.equal(result.contributors.filter(r => r.contributes).length, 1);
});


test('owned scan identifies the failing SDK getter without returning private values or errors', () => {
  const { dualCtOwnedInventoryDiagnostics } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
  for (const [method, stage] of [['getData', 'identity'], ['getEnergy', 'energy'], ['getSettings', 'settings'], ['getCapabilities', 'capabilities']]) {
    const d = device('PRIVATE_SERIAL', { cumulative: true });
    d[method] = () => { throw Error('PRIVATE_TOKEN PRIVATE_HOUSEHOLD'); };
    const scan = dualCtOwnedInventoryDiagnostics(homey({ smartmeter: [d] }));
    assert.equal(scan.status, 'read_failed'); assert.equal(scan.stage, stage); assert.equal(scan.driver, 'smartmeter');
    assert.equal(scan.readOnly, true); assert.equal(scan.complete, false);
    assert.doesNotMatch(JSON.stringify(scan), /PRIVATE/);
  }
});
test('owned diagnostic scans distinguish malformed inventory and included/excluded meters without writes', () => {
  const { dualCtOwnedInventoryDiagnostics } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
  const d = device('PRIVATE_SERIAL', null, { energy_exclude: true });
  d.setEnergy = d.setSettings = () => assert.fail('diagnostics must not write');
  const scan = dualCtOwnedInventoryDiagnostics(homey({ smartmeter: [d] }));
  assert.equal(scan.status, 'complete'); assert.equal(scan.pairedDevices, 1); assert.equal(scan.includedMeters, 0);
  assert.equal(scan.propertyMeters, 1); assert.equal(scan.externalInventoryVerified, false);
  assert.doesNotMatch(JSON.stringify(scan), /PRIVATE/);
  const bad = dualCtOwnedInventoryDiagnostics(homey({ smartmeter: [device('PRIVATE_SERIAL', null, { energy_exclude: 'true' })] }));
  assert.equal(bad.status, 'incomplete'); assert.equal(bad.includedMeters, null);
});
test('source and SDK inventory failures remain distinct after refresh clears eligibility', async () => {
  const badHomey = homey({ smartmeter: [device('PRIVATE_SERIAL', null)] });
  badHomey.drivers.getDriver = () => { throw Error('PRIVATE_TOKEN'); };
  const c = context(badHomey); await assert.rejects(c.refresh(), /energy_source_unavailable/);
  assert.equal(c.snapshot(), null);
  assert.deepEqual(c.diagnostics(), { stage: 'inventory', reason: 'owned_inventory_read_failed', inventoryStage: 'driver', driver: 'smartmeter' });
  c.close(); assert.equal(c.diagnostics().stage, 'inventory');
  const unavailable = new DualCtHomeyEnergyContext({ homey: homey(), sn, client: () => null });
  await assert.rejects(unavailable.refresh()); assert.equal(unavailable.diagnostics().stage, 'selection');
  assert.equal(unavailable.diagnostics().reason, 'account_required');
  assert.doesNotMatch(JSON.stringify(c.diagnostics()), /PRIVATE/);
});

test('hostile error and diagnostic getters cannot preserve eligibility or expose exception text', async () => {
  const { dualCtContextFailureSnapshot, dualCtEnergyRecoverySnapshot } = require('../.homeybuild/lib/dualCtRecoveryDiagnostics');
  assert.equal(dualCtContextFailureSnapshot({ get stage() { throw Error('PRIVATE'); } }), null);
  assert.equal(dualCtEnergyRecoverySnapshot({ get mode() { throw Error('PRIVATE'); } }), null);
  const c = new DualCtHomeyEnergyContext({ homey: homey(), sn, client: () => ({ getSession: async () => {
    throw Object.defineProperty({}, 'message', { get() { throw Error('PRIVATE'); } });
  } }) });
  await assert.rejects(c.refresh(), /energy_source_unavailable/);
  assert.equal(c.snapshot(), null); assert.equal(c.diagnostics().reason, 'read_failed');
  assert.doesNotMatch(JSON.stringify(c.diagnostics()), /PRIVATE/);
  const fake = dualCtContextFailureSnapshot({ stage: 'inventory', reason: 'PRIVATE', driver: 'PRIVATE', inventoryStage: 'PRIVATE' });
  assert.equal(fake.driver, null); assert.equal(fake.inventoryStage, null); assert.equal(fake.reason, 'read_failed');
});

test('array-shaped meter settings cannot be admitted as a complete overlap inventory', async () => {
  const c = context(homey({ smartmeter: [device('PRIVATE', { cumulative: true }, [])] }));
  await c.refresh(); assert.equal(c.snapshot().inventory.complete, false);
  assert.equal(c.diagnostics().reason, 'inventory_incomplete'); c.close();
});
test('owned diagnostics expose fixed exclusion states rather than names, IDs, readings or settings payloads', () => {
  const { dualCtOwnedInventoryDiagnostics } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
  const scan = dualCtOwnedInventoryDiagnostics(homey({ smartmeter: [device('PRIVATE', null,
    { energy_exclude: true, energy_cumulative_include: false, private: 'PRIVATE' })] }));
  assert.deepEqual(scan.meterSettings, [{ driver: 'smartmeter', exclude: 'true', include: 'false', reviewedRole: 'unreviewed' }]);
  assert.doesNotMatch(JSON.stringify(scan), /PRIVATE/);
});


test('SDK-unset Energy flags require explicit meter-role review instead of inventing a grid overlap', async () => {
  const c = context(homey({ smartmeter: [device('OFFICESYNTHETIC', null)] }));
  await c.refresh(); const snapshot = c.snapshot();
  assert.equal(snapshot.inventory.complete, false); assert.equal(snapshot.inventory.roleReviewRequired, true);
  assert.equal(c.diagnostics().reason, 'energy_role_review_required'); c.close();
});
test('reviewed non-property SDK meter permits admission while included roles and explicit platform conflicts remain blockers', async () => {
  for (const [settings, expected] of [
    [{ property_meter_role: 'not_included' }, false], [{ property_meter_role: 'included' }, true],
    [{ property_meter_role: 'not_included', energy_exclude: false, energy_cumulative_include: true }, true],
    [{ property_meter_role: 'included', energy_exclude: true }, false],
  ]) {
    const c = context(homey({ smartmeter: [device('OFFICESYNTHETIC', null, settings)] }));
    await c.refresh(); const inventory = c.snapshot().inventory;
    assert.equal(inventory.complete, true); assert.equal(inventory.contributors[0].contributes, expected);
    c.close();
  }
});
test('invalid reviews, new unreviewed meters and malformed platform flags cannot silently pass SDK inventory', async () => {
  for (const rows of [
    [device('OFFICE', null, { property_meter_role: 'invalid' })],
    [device('OFFICE', null, { property_meter_role: 'not_included' }), device('NEW', null)],
    [device('OFFICE', null, { property_meter_role: 'not_included', energy_exclude: 'true' })],
  ]) { const c = context(homey({ smartmeter: rows })); await c.refresh(); assert.equal(c.snapshot().inventory.complete, false); c.close(); }
});
test('role edits change only inventory admission; source bindings and identities remain unchanged', async () => {
  const settings = { property_meter_role: 'not_included' };
  const c = context(homey({ smartmeter: [device('OFFICESYNTHETIC', null, settings)] }));
  await c.refresh(); const source = c.snapshot().source; const ids = c.snapshot().inventory.contributors.map(r => r.id);
  settings.property_meter_role = 'included'; await c.refresh();
  assert.deepEqual(c.snapshot().source, source); assert.deepEqual(c.snapshot().inventory.contributors.map(r => r.id), ids);
  assert.equal(c.snapshot().inventory.contributors[0].contributes, true);
  settings.property_meter_role = 'unreviewed'; await c.refresh(); assert.equal(c.snapshot().inventory.complete, false); c.close();
});

test('reviewed SDK roles preserve single-phase qualification and separately consented three-phase scope', async () => {
  for (const community of [false, true]) {
    const c = context(homey({ smartmeter: [device('OFFICE', null, { property_meter_role: 'not_included' })],
      smartmeter_dual_ct_energy: [device(sn, { cumulative: true })] }), true, community);
    await c.refresh(); const snapshot = c.snapshot();
    assert.equal(snapshot.inventory.complete, true); assert.equal(snapshot.inventory.contributors[0].contributes, false);
    const contract = c.resolveContract(snapshot.source.identity);
    if (community) { assert.equal(contract.communityTrial, true); assert.equal(contract.wiring, 'three_phase'); }
    else { assert.equal(contract.singlePhaseOnly, true); assert.notEqual(contract.communityTrial, true); }
    c.close();
  }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = driver => JSON.parse(fs.readFileSync(path.join(root, 'drivers', driver, 'driver.compose.json')));
test('one Dual CT picker entry retains the legacy driver and optional phase/CT2 capability contracts', () => {
  const legacy = read('smartmeter_dual_ct_preview');
  const energy = read('smartmeter_dual_ct_energy');
  assert.equal(legacy.deprecated, true);
  assert.notEqual(energy.deprecated, true);
  assert.equal(energy.name.en, 'Smart Meter Dual CT');
  for (const bank of ['a', 'b']) for (const phase of [1, 2, 3]) for (const quantity of ['power', 'voltage', 'current']) {
    const capability = `dual_ct_preview_${quantity}.${bank}_p${phase}`;
    assert.ok(legacy.capabilities.includes(capability));
    assert.ok(energy.capabilities.includes(capability));
  }
  for (const capability of ['measure_power', 'meter_power.imported', 'meter_power.exported', 'dual_ct_preview_net.b']) {
    assert.ok(energy.capabilities.includes(capability));
  }
  assert.ok(energy.settings.some(setting => setting.id === 'display_ct2'));
  assert.ok(legacy.repair.length > 0);
});


test('cleanup preserves the installed driver capability, repair and Energy contracts', () => {
  const baseline = require('./fixtures/dualCtPublishedContracts.json');
  // Last published source is the fixed upgrade baseline, not a moving HEAD.
  for (const id of ['smartmeter_dual_ct_preview', 'smartmeter_dual_ct_energy']) {
    const prior = baseline[id];
    const current = read(id);
    assert.deepEqual(current.capabilities, prior.capabilities);
    assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(current.capabilitiesOptions)).digest('hex'), prior.capabilitiesOptionsSha256);
    assert.deepEqual(current.energy, prior.energy);
    assert.deepEqual(current.repair, prior.repair);
    for (const id of prior.settingIds) assert.ok(current.settings.some(row => row.id === id));
  }
  assert.equal(read('smartmeter_dual_ct_energy').settings.find(row => row.id === 'paired_mode_summary').type, 'label');
});

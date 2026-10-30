import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const presentation = new Set(['title', 'titleFormatted', 'hint', 'placeholder']);
function contract(value) {
  if (Array.isArray(value)) return value.map(contract);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !presentation.has(key)).map(([key, item]) => [key, contract(item)]));
  return value;
}
export function loadReleaseInputs(root) {
  const json = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const app = json('app.json');
  return {
    app, compose: json('.homeycompose/app.json'), pkg: json('package.json'), lock: json('package-lock.json'),
    legacy: json('test/fixtures/legacy-flow-v1.10.54-contract.json'), live: json('test/fixtures/live-v1.10.3-contract.json'),
    definitions: app.capabilities,
    pairingAccess: fs.readFileSync(path.join(root, 'lib/stream5000PairingAccess.ts'), 'utf8'),
    gridProfiles: json('settings/dual-ct-grid-profiles.json'),
    threePhaseGridProfiles: json('settings/dual-ct-three-phase-grid-profiles.json'),
    gridGate: fs.readFileSync(path.join(root, 'lib/dualCtGridEnergySource.ts'), 'utf8'),
    timeObserver: fs.readFileSync(path.join(root, 'lib/stream5000TimeObserver.ts'), 'utf8'),
    timeObserverRuntime: fs.readFileSync(path.join(root, 'lib/Stream5000UnitDevice.ts'), 'utf8'),
    runtime: ['app.ts', 'api.ts', ...app.drivers.filter(driver => driver.id !== 'smartmeter_dual_ct_energy').map(driver => `drivers/${driver.id}/device.ts`)]
      .filter(name => fs.existsSync(path.join(root, name))).map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n'),
  };
}
export function assertReleaseBoundaries({ app, compose, pkg, lock, legacy, live, definitions, pairingAccess, gridGate, gridProfiles, threePhaseGridProfiles, runtime,
  timeObserver, timeObserverRuntime }) {
  assert.deepEqual(threePhaseGridProfiles, { schemaVersion: 1, profiles: [] }, 'Three-phase admission is not approved');
  assert.equal(app.id, 'uk.co.zarb.ecoflow');
  for (const version of [compose.version, pkg.version, lock.version, lock.packages[''].version]) assert.equal(version, app.version, 'version mismatch');
  assert.deepEqual([...app.permissions].sort(), ['homey:manager:api', 'homey:manager:geolocation']);
  assert.deepEqual([...compose.permissions].sort(), [...app.permissions].sort());
  assert.deepEqual(app.drivers.map(driver => driver.id).sort(), ['smartmeter', 'smartmeter_dual_ct_energy', 'smartmeter_dual_ct_preview', 'stream',
    'stream_5000_system', 'stream_5000_unit', 'stream_ac5000', 'stream_micro', 'stream_socket', 'stream_solar', 'stream_unit']);
  for (const old of live.drivers) {
    const current = app.drivers.find(driver => driver.id === old.id);
    assert.equal(current.class, old.class); assert.deepEqual(current.energy || null, old.energy);
    for (const capability of old.capabilities) assert(current.capabilities.includes(capability));
  }
  const additions = {
    triggers: ['coordination_assessment_changed', 'coordination_readings_changed'],
    conditions: ['coordination_circuit_power_sustained', 'coordination_external_priority', 'coordination_grid_export_sustained', 'coordination_readings_current'],
    actions: [],
  };
  for (const [kind, oldCards] of Object.entries(legacy.flow)) {
    assert.deepEqual(app.flow[kind].map(card => card.id).sort(), [...oldCards.map(card => card.id), ...additions[kind]].sort(), 'unexpected Flow identities');
    for (const old of oldCards) assert.deepEqual(contract(app.flow[kind].find(card => card.id === old.id).args || []), contract(old.args || []), `legacy arguments: ${old.id}`);
  }
  const preview = app.drivers.find(driver => driver.id === 'smartmeter_dual_ct_preview');
  assert.equal(preview.class, 'other'); assert.equal(preview.energy, undefined);
  for (const id of preview.capabilities) {
    assert(id.startsWith('dual_ct_preview_')); const definition = definitions[id.split('.')[0]];
    assert.equal(definition.getable, true); assert.equal(definition.setable, false); assert.equal(definition.insights, false);
    assert.equal(preview.capabilitiesOptions[id].preventTag, true); assert.equal(preview.capabilitiesOptions[id].preventInsights, true);
  }
  assert.equal(preview.settings.find(setting => setting.id === 'preview_enabled').value, false);
  const grid = app.drivers.find(driver => driver.id === 'smartmeter_dual_ct_energy');
  assert.equal(grid.class, 'sensor');
  assert.equal(grid.deprecated, undefined, 'normal candidate pairing must remain separate from the legacy monitor');
  assert.deepEqual(grid.capabilities, ['measure_power', 'meter_power.imported', 'meter_power.exported']);
  assert.deepEqual(grid.energy, { cumulative: true, cumulativeImportedCapability: 'meter_power.imported', cumulativeExportedCapability: 'meter_power.exported' });
  assert.equal(grid.pair[0].id, 'energy_setup');

  assert.equal(app.drivers.find(driver => driver.id === 'stream_5000_unit').pair[0].id, 'connection_info');
  assert.equal(app.drivers.find(driver => driver.id === 'stream_5000_system').pair[0].id, 'energy_access');
  const readingStatus = 'stream_5000_reading_status';
  assert.equal(definitions[readingStatus].type, 'enum');
  assert.equal(definitions[readingStatus].getable, true);
  assert.equal(definitions[readingStatus].setable, false);
  assert.equal(definitions[readingStatus].insights, false);
  for (const id of ['stream_5000_unit', 'stream_ac5000']) {
    const unit = app.drivers.find(driver => driver.id === id);
    assert(unit.capabilities.includes(readingStatus));
    assert.equal(unit.capabilitiesOptions[readingStatus].preventTag, true);
    assert.equal(unit.capabilitiesOptions[readingStatus].preventInsights, true);
  }
  assert(!app.drivers.find(driver => driver.id === 'stream_5000_system').capabilities.includes(readingStatus));
  assert.match(pairingAccess, /settings\?\.get\(STREAM_5000_AGGREGATE_PAIRING_SETTING\) === true/);
  assert.doesNotMatch(pairingAccess, /\.get\(['"]stream5000BetaEnabled['"]\)/);
  assert.match(gridGate, /^export const DUAL_CT_ENERGY_RUNTIME_ENABLED = true;/m);
  assert.equal(gridProfiles.schemaVersion, 1);
  assert.equal(gridProfiles.qualification, 'controlled_candidate');
  assert.deepEqual(Object.keys(gridProfiles).sort(), ['profiles', 'qualification', 'reference', 'schemaVersion']);
  assert.equal(gridProfiles.reference, 'docs/CT1_ENERGY_CANDIDATE_VALIDATION.md');
  assert.deepEqual(gridProfiles.profiles, [{ id: 'dual_ct_421_10041_ct1_receipt_v1', productType: 421, firmware: '1.0.0.41',
    channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive', timing: 'verified_live_receipt_estimate',
    encoding: 'omitted_zero_candidate', liveFreshnessValidated: true, singlePhaseOnly: true, freshnessMs: 5000 }]);
  assert.match(timeObserver, /^export const STREAM_5000_TIME_OBSERVER_RUNTIME_ENABLED = false;/m);
  assert.match(timeObserverRuntime, /new Stream5000TimeObserver\(sn\)/);
  assert.doesNotMatch(timeObserverRuntime, /timeObserver\??\.start\s*\(/, 'timer research must not autostart');
  assert.match(gridGate, /registry\.profiles\.find/);
  assert.match(gridGate, /dualCtGridContractValid\(contract, identity\)/);
  assert.doesNotMatch(runtime, /(?:from\s*|require\s*\()['"][^'"]*(?:dualCtEnergyAdoptionWorkflow|dualCtGridEnergyDeviceAdapter|dualCtGridEnergySession|dualCtGridEnergySource|dualCtEnergyAdoption)/);
  for (const route of Object.values(app.api)) assert.notEqual(route.public, true, 'unexpected public app route');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertReleaseBoundaries(loadReleaseInputs(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')));
  console.log('Release boundaries passed: identities preserved; pinned CT1 candidate admission, separate explicit adoption, no public API. Existing reserve bridge is preserved.');
  console.log('Native/hardware acceptance, exact CI and publication remain separate gates.');
}

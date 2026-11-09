'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('consolidated release check enforces the frozen preview, legacy and publication boundaries', async () => {
  const { loadReleaseInputs, assertReleaseBoundaries } = await import('../scripts/check-release-boundaries.mjs');
  assert.doesNotThrow(() => assertReleaseBoundaries(loadReleaseInputs(path.join(__dirname, '..'))));
});

test('release check rejects accidental Energy, actions, public routes, permissions and contract drift', async () => {
  const { loadReleaseInputs, assertReleaseBoundaries } = await import('../scripts/check-release-boundaries.mjs');
  const baseline = loadReleaseInputs(path.join(__dirname, '..'));
  for (const mutate of [
    value => { value.app.drivers.find(driver => driver.id === 'smartmeter_dual_ct_preview').energy = { cumulative: true }; },
    value => { value.app.flow.actions.push({ id: 'coordination_force_charge' }); },
    value => { value.app.flow.actions.find(card => card.id === 'stream_5000_request_backup_reserve').args[0].filter += '|stream_5000_system'; },
    value => { value.app.flow.actions.find(card => card.id === 'stream_5000_request_backup_reserve').args[1].max = 101; },
    value => { value.app.drivers.find(driver => driver.id === 'stream_5000_unit').settings.find(setting => setting.id === 'reserve_request_enabled').value = true; },
    value => { value.app.api.coordinationWorkspace.public = true; },
    value => { value.app.permissions.push('homey:manager:flow'); },
    value => { value.app.permissions.push('homey:manager:api'); },
    value => { value.app.drivers.find(driver => driver.id === 'smartmeter').settings.find(setting => setting.id === 'property_meter_role').value = 'not_included'; },
    value => { value.app.drivers.find(driver => driver.id === 'smartmeter_dual_ct_energy').settings.find(setting => setting.id === 'property_meter_role').values = []; },
    value => { value.homeyReader += '\nhomey.api.getOwnerApiToken();'; },
    value => { value.app.flow.conditions.find(card => card.id === 'battery_soc').args[1].name = 'changed'; },
    value => { value.app.flow.triggers.find(card => card.id === 'smartmeter_grid_power_sustained').args[0].filter += '|smartmeter_dual_ct_preview'; },
    value => { value.app.flow.triggers.find(card => card.id === 'smartmeter_grid_power_sustained').args[3].max = 86400; },
    value => { value.app.flow.triggers.find(card => card.id === 'smartmeter_grid_power_sustained').tokens[1].type = 'string'; },
    value => { value.gridGate = value.gridGate.replace('RUNTIME_ENABLED = true', 'RUNTIME_ENABLED = false'); },
    value => { value.gridProfiles.profiles[0].firmware = '*'; },
    value => { value.communityGridProfiles.profiles[0].firmware = '*'; },
    value => { value.communityGridProfiles.profiles[0].communityTrial = false; },
    value => { value.threePhaseGridProfiles.profiles.push({ wiring: 'three_phase' }); },
    value => { value.gridProfiles.profiles[0].freshnessMs = 90000; },
    value => { value.gridProfiles.profiles[0].singlePhaseOnly = false; },
    value => { value.gridProfiles.hardwareAcceptanceComplete = true; },
    value => { value.timeObserver = value.timeObserver.replace('RUNTIME_ENABLED = false', 'RUNTIME_ENABLED = true'); },
    value => { value.timeObserverRuntime += '\nthis.timeObserver.start();'; },
    value => { value.timeObserverRuntime = value.timeObserverRuntime.replace('new Stream5000TimeObserver(sn)', 'new Stream5000TimeObserver(sn, true)'); },
    value => { value.app.drivers.find(driver => driver.id === 'smartmeter_dual_ct_preview').settings[0].value = true; },
    value => { value.pkg.version = '0.0.0'; },
    value => { value.app.drivers.find(driver => driver.id === 'stream_5000_system').pair[0].id = 'app_credentials'; },
    value => { value.pairingAccess = value.pairingAccess.replace('=== true', '!== false'); },
  ]) {
    const next = structuredClone(baseline); mutate(next); assert.throws(() => assertReleaseBoundaries(next));
  }
});

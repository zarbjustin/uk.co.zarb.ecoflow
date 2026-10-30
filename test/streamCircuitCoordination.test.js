'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { streamCoordinationPreview: preview } = require('../.homeybuild/lib/streamCoordinationPreview');
const { streamCircuitRole, streamCircuitMeaning } = require('../.homeybuild/lib/streamCircuitRoles');
const { dualCtCircuitRole } = require('../.homeybuild/lib/dualCtPresentation');
const api = require('../.homeybuild/api');
const reading = (value, at) => ({ value, at });
const source = name => ({ sourceKey: name, sessionKey: 'session-one', siteKey: 'synthetic-site' });
function input(now = 100000) {
  return { schemaVersion: 2, now, manualOverride: false, controllerConflict: false, otherSourcesReviewed: true,
    circuits: {
      grid: { ...source('grid'), role: 'grid', scope: 'whole_installation', positiveMeans: 'import', powerW: reading(-300, now) },
      secondary: { ...source('hybrid'), role: 'hybrid_inverter', scope: 'branch', positiveMeans: 'to_house', powerW: reading(900, now) },
    },
    externalBattery: { ...source('external-battery'), soc: reading(98, now), powerW: reading(0, now) },
    streamBattery: { ...source('stream-battery'), powerW: reading(0, now) },
  };
}
function qualified(start = 100000) {
  const first = preview(input(start));
  const second = preview(input(start + 30000), first);
  return preview(input(start + 60000), second);
}
function fenced(result) {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.controlsEnabled, false);
  assert.equal(result.commandWrites, 0);
  assert.equal(result.contributesToEnergy, false);
  assert.equal(result.solarOriginVerified, false);
}

test('shared circuit roles retain preview settings and explicitly distinguish hybrid, solar and load scope', () => {
  for (const role of ['unknown', 'grid', 'hybrid_inverter', 'solar_inverter', 'load']) {
    assert.equal(streamCircuitRole(role), role); assert.equal(dualCtCircuitRole(role), role);
    const meaning = streamCircuitMeaning(role);
    assert.equal(meaning.assertionOnly, true); assert.equal(meaning.measurementMappingVerified, false);
    assert.equal(meaning.suppliesSeparateBatteryState, false);
    assert.equal(meaning.solarOnlyDeclared, role === 'solar_inverter');
    assert.equal(meaning.contributesToEnergy, false); assert.equal(meaning.controlsEnabled, false);
  }
  assert.equal(streamCircuitMeaning('hybrid_inverter').meaning, 'combined_solar_and_battery_exchange');
  assert.equal(streamCircuitMeaning('load').meaning, 'branch_consumption');
  for (const value of [null, {}, [], 'pv', 'solar', '<script>', 421]) assert.equal(streamCircuitRole(value), 'unknown');
});

test('circuit-aware advice requires sustained fresh export and stays explicitly non-actuating', () => {
  const first = preview(input()); assert.equal(first.reason, 'surplus_dwell_or_cooldown');
  const middle = preview(input(130000), first); assert.equal(middle.state, 'waiting');
  const candidate = preview(input(160000), middle);
  assert.equal(candidate.state, 'review_candidate'); assert.equal(candidate.reason, 'observed_surplus_for_review');
  assert.equal(candidate.surplusAssessed, true); fenced(candidate);
  assert.equal(candidate.circuitRoles.secondary.solarOnlyDeclared, false);
  assert.equal(candidate.sourceBasis, 'caller_asserted');
});

test('legacy SOC-only callers remain advisory and never claim to have assessed surplus', () => {
  const legacy = { now: 100000, manualOverride: false, controllerConflict: false,
    bydSoc: reading(98, 100000), bydBatteryW: reading(0, 100000), streamBatteryW: reading(0, 100000) };
  const result = preview(legacy); assert.equal(result.state, 'waiting'); assert.equal(result.surplusAssessed, false); fenced(result);
  for (const extra of [{ schemaVersion: 2 }, { circuits: null }, { externalBattery: {} }, { streamBattery: {} }]) {
    assert.equal(preview({ ...legacy, ...extra }).state, 'blocked', 'v2 cannot fall back to legacy');
  }
});

test('P1-style grid-only input is supported without making Dual CT or secondary metering mandatory', () => {
  const value = input(); delete value.circuits.secondary;
  const result = preview(value); assert.equal(result.state, 'waiting');
  assert.equal(result.secondaryIncludedInGrid, false); assert.equal(result.circuitRoles.secondary.role, 'unknown');
  const missingBattery = input(); delete missingBattery.externalBattery;
  assert.equal(preview(missingBattery).reason, 'missing_sources');
});

test('external solar, hybrid and load remain separate branches and cannot add phantom grid surplus', () => {
  for (const role of ['solar_inverter', 'hybrid_inverter', 'load']) {
    const value = input(161000); value.circuits.secondary.role = role;
    value.circuits.grid.powerW.value = 0; value.circuits.secondary.powerW.value = 99999;
    value.streamBattery.powerW.value = 1000;
    const result = preview(value, qualified());
    assert.equal(result.reason, 'insufficient_observed_export'); assert.equal(result.state, 'waiting'); fenced(result);
    assert.equal(result.circuitRoles.secondary.role, role);
    assert.equal(result.circuitRoles.secondary.meaning === 'whole_installation_grid_exchange', false);
  }
});

test('explicit grid direction works both ways; role labels cannot supply missing direction', () => {
  const positiveExport = input(); positiveExport.circuits.grid.positiveMeans = 'export'; positiveExport.circuits.grid.powerW.value = 300;
  assert.equal(preview(positiveExport).reason, 'surplus_dwell_or_cooldown');
  positiveExport.circuits.grid.powerW.value = -300;
  assert.equal(preview(positiveExport).reason, 'grid_import_present');
  for (const patch of [{ role: 'load' }, { scope: 'branch' }, { positiveMeans: undefined }, { role: 'unknown' }]) {
    const value = input(); Object.assign(value.circuits.grid, patch);
    assert.equal(preview(value).reason, 'grid_scope_or_direction_unconfirmed');
  }
  for (const patch of [{ role: 'grid' }, { scope: 'whole_installation' }, { positiveMeans: 'import' }, { role: 'unknown' }]) {
    const value = input(); Object.assign(value.circuits.secondary, patch);
    assert.equal(preview(value).reason, 'secondary_scope_or_direction_unconfirmed');
  }
});

test('battery priority and cross-charging checks use separate battery telemetry, not hybrid output', () => {
  for (const [external, stream, reason] of [[-80, 80, 'opposing_battery_flows'], [80, -80, 'opposing_battery_flows'],
    [-80, 0, 'external_battery_discharging'], [0, -80, 'stream_discharging'], [80, 0, 'external_battery_still_charging']]) {
    const value = input(); value.externalBattery.powerW.value = external; value.streamBattery.powerW.value = stream;
    const result = preview(value); assert.equal(result.reason, reason); assert.notEqual(result.state, 'review_candidate'); fenced(result);
  }
  const value = input(); value.externalBattery.soc.value = 97;
  assert.equal(preview(value).reason, 'external_battery_priority');
});

test('candidate hysteresis never bypasses ongoing export, external charge priority or stopped threshold', () => {
  const previous = qualified(); assert.equal(previous.state, 'review_candidate');
  const value = input(161000); value.externalBattery.soc.value = 97.5;
  assert.equal(preview(value, previous).state, 'review_candidate');
  value.externalBattery.soc.value = 97; assert.equal(preview(value, previous).reason, 'external_battery_priority');
  value.externalBattery.soc.value = 98; value.circuits.grid.powerW.value = -99;
  assert.equal(preview(value, previous).reason, 'insufficient_observed_export');
  value.circuits.grid.powerW.value = 100; assert.equal(preview(value, previous).reason, 'grid_import_present');
});

test('every individual reading expires, including secondary data; coherent receipt is not measurement proof', () => {
  const selectors = [v => v.circuits.grid.powerW, v => v.circuits.secondary.powerW, v => v.externalBattery.soc,
    v => v.externalBattery.powerW, v => v.streamBattery.powerW];
  for (const select of selectors) {
    for (const patch of [{ at: 40000 }, { at: 100001 }, { at: NaN }, { value: NaN }, { value: '300' }]) {
      const value = input(); Object.assign(select(value), patch);
      assert.equal(preview(value).reason, 'missing_or_stale_input');
    }
    const value = input(); select(value).at = 94999;
    assert.equal(preview(value).reason, 'incoherent_reading_times');
  }
});

test('invalid identities, overlapping aliases and cross-installation sources cannot qualify', () => {
  for (const name of ['sourceKey', 'sessionKey', 'siteKey']) {
    const value = input(); value.externalBattery[name] = '';
    assert.equal(preview(value).reason, 'source_identity_required');
  }
  const overlap = input(); overlap.circuits.secondary.sourceKey = overlap.circuits.grid.sourceKey;
  assert.equal(preview(overlap).reason, 'overlapping_source_aliases');
  const foreign = input(); foreign.externalBattery.siteKey = 'another-site';
  assert.equal(preview(foreign).reason, 'different_installations');
});

test('source, session, circuit role, polarity, topology or policy change resets dwell and held candidates', () => {
  const previous = qualified();
  const changes = [v => { v.circuits.grid.sourceKey = 'other-grid'; }, v => { v.externalBattery.sessionKey = 'reconnected'; },
    v => { v.circuits.secondary.role = 'solar_inverter'; }, v => { v.circuits.grid.positiveMeans = 'export'; v.circuits.grid.powerW.value = 300; },
    v => { delete v.circuits.secondary; }];
  for (const change of changes) {
    const value = input(161000); change(value);
    const result = preview(value, previous); assert.equal(result.state, 'waiting'); assert.equal(result.candidateSince, 161000);
    assert.notEqual(result.contextFingerprint, previous.contextFingerprint);
  }
  assert.equal(preview(input(161000), previous, { minSurplusW: 200 }).state, 'waiting');
});

test('duplicate evaluations, cached power and gaps cannot establish sustained surplus', () => {
  const first = preview(input());
  assert.equal(preview(input(), first).reason, 'unadvanced_power_readings');
  const value = input(130000); value.circuits.grid.powerW.at = 100000;
  assert.equal(preview(value, first, { maxSkewMs: 60000 }).reason, 'surplus_dwell_or_cooldown', 'policy changes first reset context');
  const initial = preview(input(), {}, { maxSkewMs: 60000 });
  assert.equal(preview(value, initial, { maxSkewMs: 60000 }).reason, 'unadvanced_power_readings');
  const resumed = preview(input(160000), first);
  assert.equal(resumed.state, 'waiting'); assert.equal(resumed.candidateSince, 160000, 'exact freshness gap resets dwell');
  assert.equal(preview(input(220001), qualified()).state, 'waiting');
});

test('policy, malformed state and rollback fail closed without exposing input objects', () => {
  for (const policy of [null, [], { minSurplusW: 20 }, { maxSkewMs: -1 }, { maxSkewMs: 60001 },
    { minSurplusW: Infinity }, { startSoc: '98' }, { stopSoc: 98 }, { maxAgeMs: 999 }]) {
    assert.equal(preview(input(), {}, policy).reason, 'invalid_policy');
  }
  for (const previous of [null, [], { schemaVersion: 2, lastEvaluatedAt: 100001 },
    { schemaVersion: 2, lastEvaluatedAt: 99999, lastTransitionAt: 100000 }]) {
    assert.equal(preview(input(), previous).state, 'blocked');
  }
  const value = input(); value.externalBattery.soc.value = 101; assert.equal(preview(value).reason, 'invalid_reading');
  value.externalBattery.soc.value = 98; value.circuits.grid.powerW.value = -100001;
  assert.equal(preview(value).reason, 'invalid_reading');
  for (const patch of [{ manualOverride: true }, { controllerConflict: true }, { otherSourcesReviewed: false }]) {
    const result = preview({ ...input(), ...patch }, qualified()); assert.equal(result.state, 'blocked'); fenced(result);
  }
});

test('endpoint keeps server clock, never accesses Homey and cannot elevate caller flags or expose identities', async () => {
  const homey = new Proxy({}, { get() { throw new Error('No Homey access'); } });
  const value = input(Date.now()); value.circuits.grid.sourceKey = 'PRIVATE_GRID';
  value.externalBattery.password = 'PRIVATE_PASSWORD'; value.controlsEnabled = true; value.contributesToEnergy = true;
  const result = await api.coordinationPreview({ homey, body: { input: value } });
  assert.equal(result.state, 'waiting'); fenced(result);
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
  assert.equal((await api.coordinationPreview({ homey, body: { input: input(100000) } })).reason, 'missing_or_stale_input');
});

test('circuit settings and new advisory path cannot wire controls, Energy sessions or automatic telemetry collection', () => {
  const previewManifest = require('../drivers/smartmeter_dual_ct_preview/driver.compose.json');
  assert.equal(previewManifest.energy, undefined);
  assert(previewManifest.capabilities.every(id => id.startsWith('dual_ct_preview_')));
  const sourceText = fs.readFileSync('lib/streamCircuitCoordination.ts', 'utf8');
  assert.doesNotMatch(sourceText, /from ['"].*(EcoFlow|dualCtGridEnergy|mqtt|homey)/);
  const driver = fs.readFileSync('drivers/smartmeter_dual_ct_preview/device.ts', 'utf8');
  assert.doesNotMatch(driver, /streamCircuitCoordination|streamCoordinationPreview/);
  const { DUAL_CT_ENERGY_RUNTIME_ENABLED, resolveDualCtGridEnergyContract } = require('../.homeybuild/lib/dualCtGridEnergySource');
  assert.equal(DUAL_CT_ENERGY_RUNTIME_ENABLED, true); assert.equal(resolveDualCtGridEnergyContract({ productType: 421, firmware: 'synthetic' }), null);
});

test('cooldown can exceed dwell and any blocked sample restarts the qualifying period', () => {
  const policy = { dwellMs: 1000, cooldownMs: 10000 };
  const first = preview(input(), {}, policy);
  const second = preview(input(102000), first, policy); assert.equal(second.state, 'waiting');
  const candidate = preview(input(110000), second, policy); assert.equal(candidate.state, 'review_candidate');
  const blocked = preview({ ...input(111000), manualOverride: true }, candidate, policy);
  const restart = preview(input(112000), blocked, policy);
  assert.equal(restart.state, 'waiting'); assert.equal(restart.candidateSince, 112000);
  assert.equal(preview(input(113000), restart, policy).state, 'waiting');
});

test('schema versions and malformed prior observation state cannot retain a candidate', () => {
  for (const version of [null, 0, 1, 3, '2', {}]) assert.equal(preview({ ...input(), schemaVersion: version }).reason, 'unsupported_schema');
  const previous = qualified();
  for (const times of [null, [], [0, 1], [0, 1, Infinity], [-1, 1, 1], [160001, 1, 1]]) {
    assert.equal(preview(input(161000), { ...previous, powerObservationTimes: times }).reason, 'invalid_prior_observations');
  }
  assert.equal(preview(input(159999), previous).reason, 'invalid_prior_clock');
  assert.equal(preview(input(161000), { ...previous, schemaVersion: 1 }).state, 'waiting');
});

test('callers cannot extend dwell by only updating SOC or another circuit', () => {
  const policy = { maxSkewMs: 60000, dwellMs: 1000, cooldownMs: 1000 };
  const first = preview(input(), {}, policy);
  for (const which of ['grid', 'external', 'stream']) {
    const value = input(102000);
    if (which === 'grid') value.circuits.grid.powerW.at = 100000;
    if (which === 'external') value.externalBattery.powerW.at = 100000;
    if (which === 'stream') value.streamBattery.powerW.at = 100000;
    assert.equal(preview(value, first, policy).reason, 'unadvanced_power_readings');
  }
});

test('secondary branch polarity does not change grid surplus or silently adopt solar energy', () => {
  for (const positiveMeans of ['to_house', 'from_house']) {
    const value = input(); value.circuits.secondary.positiveMeans = positiveMeans;
    value.circuits.secondary.powerW.value = positiveMeans === 'to_house' ? 900 : -900;
    const result = preview(value); assert.equal(result.reason, 'surplus_dwell_or_cooldown'); fenced(result);
  }
  const previous = qualified(); const value = input(161000);
  value.circuits.secondary.positiveMeans = 'from_house';
  assert.equal(preview(value, previous).state, 'waiting');
});

test('advisory does not mutate caller data or fingerprint unknown supplied metadata', () => {
  const value = input(); const previous = preview(value);
  const original = JSON.stringify(value); const prior = JSON.stringify(previous);
  const next = input(130000); next.externalBattery.role = { password: 'PRIVATE_IGNORED' };
  const result = preview(next, previous);
  assert.equal(result.contextFingerprint, previous.contextFingerprint);
  assert.equal(JSON.stringify(value), original); assert.equal(JSON.stringify(previous), prior);
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false); fenced(result);
});

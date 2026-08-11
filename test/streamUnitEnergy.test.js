'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compose = require('../drivers/stream_unit/driver.compose.json');
const generatedApp = require('../app.json');

test('a physical STREAM Unit is a standalone Homey Energy battery', () => {
  assert.strictEqual(compose.class, 'battery');
  assert.deepEqual(compose.energy, {
    homeBattery: true,
    meterPowerImportedCapability: 'meter_power.charged',
    meterPowerExportedCapability: 'meter_power.discharged',
  });
  assert.ok(compose.capabilities.includes('meter_power.charged'));
  assert.ok(compose.capabilities.includes('meter_power.discharged'));
  assert.ok(compose.capabilities.includes('measure_power'));
  assert.equal(compose.capabilities.includes('measure_power.grid'), false,
    'unit must not acquire the aggregate widget capability pair');

  const generatedDriver = generatedApp.drivers.find((driver) => driver.id === 'stream_unit');
  assert.ok(generatedDriver);
  assert.deepEqual(generatedDriver.energy, compose.energy);
  assert.deepEqual(generatedDriver.capabilities, compose.capabilities);
});

test('existing physical units migrate to reset-proof cumulative meters', () => {
  const source = fs.readFileSync(path.join(root, 'drivers', 'stream_unit', 'device.ts'), 'utf8');
  assert.match(source, /ensureCapabilities\(\[/);
  assert.match(source, /\.\.\.StreamUnitDevice\.ENERGY_CAPS/);
  assert.match(source, /batteryEnergyMode\(/);
  assert.match(source, /followResettableCounter\(/);
  assert.match(source, /integrateSignedPower\(/);
  assert.match(source, /energyCheckpoint\?\.flush\(\)/);
});

test('pairing and settings explain standalone and aggregate roles', () => {
  const html = fs.readFileSync(
    path.join(root, 'drivers', 'stream_unit', 'pair', 'credentials.html'),
    'utf8',
  );
  assert.match(html, /charged and discharged energy/i);
  assert.match(html, /standalone installation/i);
  assert.match(html, /exclude this unit from Homey Energy/i);

  const energyRole = compose.settings
    .flatMap((setting) => setting.children || [])
    .find((setting) => setting.id === 'energy_role');
  assert.ok(energyRole);
  assert.match(energyRole.hint.en, /Exclude from Energy/);
  assert.match(energyRole.hint.en, /twice/);
});

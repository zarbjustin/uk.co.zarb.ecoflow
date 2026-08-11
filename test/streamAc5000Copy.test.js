'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compose = require('../drivers/stream_ac5000/driver.compose.json');
const familyCompose = require('../drivers/stream_5000_unit/driver.compose.json');
const systemCompose = require('../drivers/stream_5000_system/driver.compose.json');
const generatedApp = require('../app.json');

test('the public STREAM AC 5000 driver name has no experimental qualifier', () => {
  assert.deepStrictEqual(compose.name, {
    en: 'STREAM AC 5000',
    de: 'STREAM AC 5000',
    nl: 'STREAM AC 5000',
  });

  const connectionGroup = compose.settings.find((setting) => setting.type === 'group'
    && setting.children?.some((child) => child.id === 'experimental_notice'));
  assert.deepStrictEqual(connectionGroup.label, {
    en: 'EcoFlow app connection',
    de: 'EcoFlow-App-Verbindung',
    nl: 'EcoFlow-appverbinding',
  });
  assert.match(connectionGroup.children.find((child) => child.id === 'experimental_notice').value, /^Monitoring only/);
  assert.strictEqual(compose.deprecated, true);
});

test('the replacement driver represents the STREAM 5000 unit family', () => {
  assert.deepStrictEqual(familyCompose.name, {
    en: 'STREAM 5000 Series Unit (Beta)',
    de: 'STREAM-5000-Serieneinheit (Beta)',
    nl: 'STREAM 5000-serie-unit (bèta)',
  });
  assert.strictEqual(familyCompose.deprecated, undefined);
  assert.strictEqual(familyCompose.class, 'battery');
  assert.deepStrictEqual(familyCompose.energy, {
    batteries: ['INTERNAL'],
    meterPowerImportedCapability: 'meter_power.charged',
    meterPowerExportedCapability: 'meter_power.discharged',
  });
  assert.ok(familyCompose.capabilities.includes('stream_unit_power_battery_flow'));
  assert.ok(!familyCompose.capabilities.includes('measure_power'));
  assert.ok(familyCompose.capabilities.includes('meter_power.charged'));
  assert.ok(familyCompose.capabilities.includes('meter_power.discharged'));

  const familyDriver = generatedApp.drivers.find((candidate) => candidate.id === 'stream_5000_unit');
  assert.ok(familyDriver, 'generated app.json has no stream_5000_unit driver');
  assert.deepStrictEqual(familyDriver.name, familyCompose.name);
  assert.strictEqual(familyDriver.deprecated, undefined);
});

test('the STREAM 5000 installation aggregate is the sole Homey Energy battery', () => {
  const expectedEnergy = {
    homeBattery: true,
    meterPowerImportedCapability: 'meter_power.charged',
    meterPowerExportedCapability: 'meter_power.discharged',
  };
  assert.deepStrictEqual(systemCompose.name, {
    en: 'STREAM Home Battery (5000 Beta)',
    de: 'STREAM-Hausbatterie (5000 Beta)',
    nl: 'STREAM-thuisbatterij (5000-bèta)',
  });
  assert.deepStrictEqual(systemCompose.energy, expectedEnergy);
  assert.ok(systemCompose.capabilities.includes('measure_power'));
  assert.ok(systemCompose.capabilities.includes('meter_power.charged'));
  assert.ok(systemCompose.capabilities.includes('meter_power.discharged'));

  const systemDriver = generatedApp.drivers.find((candidate) => candidate.id === 'stream_5000_system');
  assert.ok(systemDriver, 'generated app.json has no stream_5000_system driver');
  assert.deepStrictEqual(systemDriver.energy, expectedEnergy);
});

test('the STREAM 5000 family driver uses the AC 5000 product artwork as its icon', () => {
  const familyIcon = fs.readFileSync(
    path.join(root, 'drivers', 'stream_5000_unit', 'assets', 'icon.svg'),
    'utf8',
  );
  const ac5000Icon = fs.readFileSync(
    path.join(root, 'drivers', 'stream_ac5000', 'assets', 'icon.svg'),
    'utf8',
  );
  const systemIcon = fs.readFileSync(
    path.join(root, 'drivers', 'stream_5000_system', 'assets', 'icon.svg'),
    'utf8',
  );

  assert.strictEqual(familyIcon, ac5000Icon);
  assert.strictEqual(systemIcon, ac5000Icon);
  assert.match(familyIcon, /viewBox=\"0 0 960\.000000 960\.000000\"/);
});

test('the generated app manifest has clean public copy and monitoring-only disclosure', () => {
  const driver = generatedApp.drivers.find((candidate) => candidate.id === 'stream_ac5000');
  assert.ok(driver, 'generated app.json has no stream_ac5000 driver');
  assert.deepStrictEqual(driver.name, {
    en: 'STREAM AC 5000',
    de: 'STREAM AC 5000',
    nl: 'STREAM AC 5000',
  });
  assert.strictEqual(driver.deprecated, true);

  const connectionGroup = driver.settings.find((setting) => setting.type === 'group'
    && setting.children?.some((child) => child.id === 'experimental_notice'));
  const publicCopy = JSON.stringify({
    name: driver.name,
    label: connectionGroup.label,
    children: connectionGroup.children.map((child) => ({
      label: child.label, value: child.value, hint: child.hint,
    })),
  });
  assert.ok(!/experimental|experimentell|experimenteel/i.test(publicCopy));
  assert.match(publicCopy, /Monitoring only/);
  assert.match(publicCopy, /no supported public API/);
});

test('physical STREAM 5000 devices omit instantaneous Homey Energy power but expose cumulative meters', () => {
  assert.strictEqual(compose.class, 'battery');
  const expectedEnergy = {
    batteries: ['INTERNAL'],
    meterPowerImportedCapability: 'meter_power.charged',
    meterPowerExportedCapability: 'meter_power.discharged',
  };
  assert.deepStrictEqual(compose.energy, expectedEnergy);
  assert.ok(compose.capabilities.includes('measure_battery'));
  assert.ok(compose.capabilities.includes('stream_unit_power_battery_flow'));
  assert.ok(!compose.capabilities.includes('measure_power'));
  assert.ok(compose.capabilities.includes('meter_power.charged'));
  assert.ok(compose.capabilities.includes('meter_power.discharged'));

  const driver = generatedApp.drivers.find((candidate) => candidate.id === 'stream_ac5000');
  assert.deepStrictEqual(driver.energy, expectedEnergy);
  assert.deepStrictEqual(familyCompose.energy, expectedEnergy);
});

test('STREAM AC 5000 offers an automatically-resetting diagnostic capture setting', () => {
  const setting = compose.settings
    .flatMap((group) => group.children || [])
    .find((candidate) => candidate.id === 'diagnostic_capture_next');
  assert.ok(setting);
  assert.strictEqual(setting.type, 'checkbox');
  assert.strictEqual(setting.value, false);
  assert.match(setting.hint.en, /switches off automatically/);
});

test('pairing clearly explains the monitoring-only app connection', () => {
  const html = fs.readFileSync(
    path.join(root, 'drivers', 'stream_ac5000', 'pair', 'app_credentials.html'),
    'utf8',
  );
  assert.ok(!/experimental|experimentell|experimenteel/i.test(html));
  assert.match(html, /no supported public API/i);
  assert.match(html, /Monitoring only/i);
  assert.match(html, /controls are intentionally disabled/i);

  const familyHtml = fs.readFileSync(
    path.join(root, 'drivers', 'stream_5000_unit', 'pair', 'app_credentials.html'),
    'utf8',
  );
  assert.match(familyHtml, /STREAM 5000 Series/);
  assert.match(familyHtml, /verified serial prefixes and telemetry/i);
  assert.match(familyHtml, /Monitoring only/i);
  assert.match(familyHtml, /Exclude from Energy/i);

  const systemHtml = fs.readFileSync(
    path.join(root, 'drivers', 'stream_5000_system', 'pair', 'app_credentials.html'),
    'utf8',
  );
  assert.match(systemHtml, /STREAM 5000 Home Battery/);
  assert.match(systemHtml, /Homey Energy Home Battery/);

  for (const driverId of ['stream_5000_unit', 'stream_5000_system']) {
    const driverCompose = require(`../drivers/${driverId}/driver.compose.json`);
    assert.strictEqual(driverCompose.pair[0].id, 'beta_access');
    const betaHtml = fs.readFileSync(
      path.join(root, 'drivers', driverId, 'pair', 'beta_access.html'),
      'utf8',
    );
    assert.match(betaHtml, /Experimental, read-only integration/i);
    assert.match(betaHtml, /official API/i);
    assert.match(betaHtml, /Re-pairing may be required/i);
    assert.match(betaHtml, /check_stream_5000_beta_access/);
  }
});

test('wrong-device and monitoring-only copy is localized without driver terminology', () => {
  for (const locale of ['en', 'de', 'nl']) {
    const messages = require(`../locales/${locale}.json`);
    assert.match(messages.errors.es22_wrong_driver, /STREAM AC 5000/);
    assert.ok(!/driver|Treiber|stuurprogramma/i.test(messages.errors.es22_wrong_driver));
    assert.ok(messages.errors.developer_api_unsupported_device);
    assert.ok(messages.device.stream_ac5000.monitoring_only);
    assert.ok(messages.device.stream_5000_unit.monitoring_only);
    assert.ok(messages.device.stream_5000_system.monitoring_only);
  }
});

test('aggregate and physical drivers use the shared STREAM 5000 lifecycle with distinct roles', () => {
  const source = fs.readFileSync(
    path.join(root, 'lib', 'Stream5000UnitDevice.ts'),
    'utf8',
  );
  assert.match(source, /device\.stream_5000_unit\.monitoring_only/);
  assert.match(source, /experimental_notice:\s*localizedStatus/);
  assert.match(source, /class Stream5000PhysicalUnitDevice/);
  assert.match(source, /await this\.initialiseEnergyCapabilities\(\)/);
  assert.match(source, /if \(typeof batteryPowerW === 'number'\)/);
  assert.doesNotMatch(source, /\['measure_power', \.\.\.ENERGY_CAPABILITIES\]/);
  for (const driverId of ['stream_ac5000', 'stream_5000_unit']) {
    const wrapper = fs.readFileSync(path.join(root, 'drivers', driverId, 'device.ts'), 'utf8');
    assert.match(wrapper, /Stream5000PhysicalUnitDevice/);
  }
  const aggregateWrapper = fs.readFileSync(
    path.join(root, 'drivers', 'stream_5000_system', 'device.ts'),
    'utf8',
  );
  assert.match(aggregateWrapper, /Stream5000UnitDevice/);
});

test('every STREAM 5000 pairing path enforces the server-side beta gate', () => {
  const source = fs.readFileSync(path.join(root, 'lib', 'stream5000Pairing.ts'), 'utf8');
  assert.match(source, /check_stream_5000_beta_access/);
  assert.match(source, /requireStream5000BetaAccess\(driver\?\.homey\)/);
  assert.ok(source.indexOf('requireStream5000BetaAccess(driver?.homey)')
    < source.indexOf('const client = appAuth.getClient()'));
});

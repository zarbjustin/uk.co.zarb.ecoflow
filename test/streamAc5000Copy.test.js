'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compose = require('../drivers/stream_ac5000/driver.compose.json');
const familyCompose = require('../drivers/stream_5000_unit/driver.compose.json');
const streamCompose = require('../drivers/stream/driver.compose.json');

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
    en: 'STREAM 5000 Series Unit',
    de: 'STREAM-5000-Serieneinheit',
    nl: 'STREAM 5000-serie-unit',
  });
  assert.strictEqual(familyCompose.deprecated, undefined);
  assert.strictEqual(familyCompose.class, 'battery');
  assert.deepStrictEqual(familyCompose.energy, { batteries: ['INTERNAL'] });
  assert.ok(familyCompose.capabilities.includes('stream_unit_power_battery_flow'));
  assert.ok(!familyCompose.capabilities.includes('measure_power'));
  assert.ok(!familyCompose.capabilities.includes('meter_power.charged'));
  assert.ok(!familyCompose.capabilities.includes('meter_power.discharged'));
});

test('the standard STREAM Home Battery is also the 5000 installation aggregate', () => {
  const expectedEnergy = {
    homeBattery: true,
    meterPowerImportedCapability: 'meter_power.charged',
    meterPowerExportedCapability: 'meter_power.discharged',
  };
  assert.deepStrictEqual(streamCompose.name, {
    en: 'STREAM Home Battery (installation)',
    de: 'STREAM-Hausbatterie (Anlage)',
    nl: 'STREAM-thuisbatterij (installatie)',
  });
  assert.deepStrictEqual(streamCompose.energy, expectedEnergy);
  assert.ok(streamCompose.capabilities.includes('measure_power'));
  assert.ok(streamCompose.capabilities.includes('meter_power.charged'));
  assert.ok(streamCompose.capabilities.includes('meter_power.discharged'));

  assert.strictEqual(
    fs.existsSync(path.join(root, 'drivers', 'stream_5000_system', 'driver.compose.json')),
    false,
  );
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
  assert.strictEqual(familyIcon, ac5000Icon);
  assert.match(familyIcon, /viewBox=\"0 0 960\.000000 960\.000000\"/);
});

test('the public manifest copy has a clear monitoring-only disclosure', () => {
  assert.deepStrictEqual(compose.name, {
    en: 'STREAM AC 5000',
    de: 'STREAM AC 5000',
    nl: 'STREAM AC 5000',
  });
  assert.strictEqual(compose.deprecated, true);

  const connectionGroup = compose.settings.find((setting) => setting.type === 'group'
    && setting.children?.some((child) => child.id === 'experimental_notice'));
  const publicCopy = JSON.stringify({
    name: compose.name,
    label: connectionGroup.label,
    children: connectionGroup.children.map((child) => ({
      label: child.label, value: child.value, hint: child.hint,
    })),
  });
  assert.ok(!/experimental|experimentell|experimenteel/i.test(publicCopy));
  assert.match(publicCopy, /Monitoring only/);
  assert.match(publicCopy, /no supported public API/);
});

test('physical STREAM 5000 devices are excluded from Homey Energy accounting', () => {
  assert.strictEqual(compose.class, 'battery');
  const expectedEnergy = { batteries: ['INTERNAL'] };
  assert.deepStrictEqual(compose.energy, expectedEnergy);
  assert.ok(compose.capabilities.includes('measure_battery'));
  assert.ok(compose.capabilities.includes('stream_unit_power_battery_flow'));
  assert.ok(!compose.capabilities.includes('measure_power'));
  assert.ok(!compose.capabilities.includes('meter_power.charged'));
  assert.ok(!compose.capabilities.includes('meter_power.discharged'));

  assert.deepStrictEqual(compose.energy, expectedEnergy);
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

  const homeBatteryChoiceHtml = fs.readFileSync(
    path.join(root, 'drivers', 'stream', 'pair', 'select_connection.html'),
    'utf8',
  );
  assert.match(homeBatteryChoiceHtml, /STREAM Home Battery/);
  assert.match(homeBatteryChoiceHtml, /STREAM 5000 Series/);
  assert.match(homeBatteryChoiceHtml, /same STREAM Home Battery/i);

  const homeBatteryAppHtml = fs.readFileSync(
    path.join(root, 'drivers', 'stream', 'pair', 'app_credentials.html'),
    'utf8',
  );
  assert.match(homeBatteryAppHtml, /same STREAM Home Battery/i);
  assert.match(homeBatteryAppHtml, /controls are intentionally disabled/i);
});

test('wrong-device and monitoring-only copy is localized without driver terminology', () => {
  for (const locale of ['en', 'de', 'nl']) {
    const messages = require(`../locales/${locale}.json`);
    assert.match(messages.errors.es22_wrong_driver, /STREAM AC 5000/);
    assert.ok(!/driver|Treiber|stuurprogramma/i.test(messages.errors.es22_wrong_driver));
    assert.ok(messages.errors.developer_api_unsupported_device);
    assert.ok(messages.device.stream_ac5000.monitoring_only);
    assert.ok(messages.device.stream_5000_unit.monitoring_only);
    assert.ok(messages.device.stream.monitoring_only);
  }
});

test('the unified Home Battery maps 5000 profiles to the shared app-connected lifecycle', () => {
  const source = fs.readFileSync(
    path.join(root, 'lib', 'Stream5000UnitDevice.ts'),
    'utf8',
  );
  assert.match(source, /device\.stream_5000_unit\.monitoring_only/);
  assert.match(source, /experimental_notice:\s*localizedStatus/);
  assert.match(source, /class Stream5000PhysicalUnitDevice/);
  for (const driverId of ['stream_ac5000', 'stream_5000_unit']) {
    const wrapper = fs.readFileSync(path.join(root, 'drivers', driverId, 'device.ts'), 'utf8');
    assert.match(wrapper, /Stream5000PhysicalUnitDevice/);
  }
  const homeBatteryDriver = fs.readFileSync(
    path.join(root, 'drivers', 'stream', 'driver.ts'),
    'utf8',
  );
  assert.match(homeBatteryDriver, /onMapDeviceClass/);
  assert.match(homeBatteryDriver, /Stream5000UnitDevice/);
  assert.match(homeBatteryDriver, /stream5000HomeBatteryPairingOptions/);
});

test('Developer-API Flow cards exclude monitoring-only 5000 Home Batteries', () => {
  for (const kind of ['actions', 'conditions', 'triggers']) {
    const directory = path.join(root, '.homeycompose', 'flow', kind);
    for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.json'))) {
      const definition = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      const deviceArg = (definition.args || []).find((arg) => arg.type === 'device');
      if (!deviceArg) continue;
      assert.strictEqual(
        deviceArg.filter,
        'driver_id=stream&capabilities=operating_mode',
        `${kind}/${file}`,
      );
    }
  }
});

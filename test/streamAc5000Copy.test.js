'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compose = require('../drivers/stream_ac5000/driver.compose.json');
const familyCompose = require('../drivers/stream_5000_unit/driver.compose.json');
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
    en: 'STREAM 5000 Series Unit',
    de: 'STREAM-5000-Serieneinheit',
    nl: 'STREAM 5000-serie-unit',
  });
  assert.strictEqual(familyCompose.deprecated, undefined);
  assert.strictEqual(familyCompose.class, 'battery');
  assert.deepStrictEqual(familyCompose.energy, { homeBattery: true });

  const familyDriver = generatedApp.drivers.find((candidate) => candidate.id === 'stream_5000_unit');
  assert.ok(familyDriver, 'generated app.json has no stream_5000_unit driver');
  assert.deepStrictEqual(familyDriver.name, familyCompose.name);
  assert.strictEqual(familyDriver.deprecated, undefined);
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

test('STREAM AC 5000 is classified as a Homey Energy home battery', () => {
  assert.strictEqual(compose.class, 'battery');
  assert.deepStrictEqual(compose.energy, { homeBattery: true });
  assert.ok(compose.capabilities.includes('measure_battery'));
  assert.ok(compose.capabilities.includes('measure_power'));

  const driver = generatedApp.drivers.find((candidate) => candidate.id === 'stream_ac5000');
  assert.deepStrictEqual(driver.energy, { homeBattery: true });
  assert.deepStrictEqual(familyCompose.energy, { homeBattery: true });
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
});

test('wrong-device and monitoring-only copy is localized without driver terminology', () => {
  for (const locale of ['en', 'de', 'nl']) {
    const messages = require(`../locales/${locale}.json`);
    assert.match(messages.errors.es22_wrong_driver, /STREAM AC 5000/);
    assert.ok(!/driver|Treiber|stuurprogramma/i.test(messages.errors.es22_wrong_driver));
    assert.ok(messages.errors.developer_api_unsupported_device);
    assert.ok(messages.device.stream_ac5000.monitoring_only);
    assert.ok(messages.device.stream_5000_unit.monitoring_only);
  }
});

test('both drivers use the shared STREAM 5000 family device lifecycle', () => {
  const source = fs.readFileSync(
    path.join(root, 'lib', 'Stream5000UnitDevice.ts'),
    'utf8',
  );
  assert.match(source, /device\.stream_5000_unit\.monitoring_only/);
  assert.match(source, /experimental_notice:\s*localizedStatus/);
  for (const driverId of ['stream_ac5000', 'stream_5000_unit']) {
    const wrapper = fs.readFileSync(path.join(root, 'drivers', driverId, 'device.ts'), 'utf8');
    assert.match(wrapper, /Stream5000UnitDevice/);
  }
});

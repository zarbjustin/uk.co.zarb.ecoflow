'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scopedReadingOptions, migrateReadingTitle, STREAM_5000_UNIT_TITLES, STREAM_UNIT_GRID_TITLE } = require('../.homeybuild/lib/streamReadingScopes');
const { mapStreamQuota } = require('../.homeybuild/lib/streamMapping');

test('known default titles migrate without resetting custom titles or options', () => {
  const titles = STREAM_5000_UNIT_TITLES['measure_power.load'];
  assert.deepEqual(scopedReadingOptions('measure_power.load', { title: 'House consumption', decimals: 2 }, titles), { title: titles, decimals: 2 });
  assert.equal(scopedReadingOptions('measure_power.load', { title: 'My custom title' }, titles), null);
  assert.equal(scopedReadingOptions('measure_power.load', { title: titles }, titles), null);
  assert.equal(scopedReadingOptions('PRIVATE', {}, titles), null);
  assert.equal(scopedReadingOptions('measure_power.load', { title: [] }, titles), null);
  const original = { title: { en: 'House consumption', de: 'Custom DE', nl: 'Huisverbruik' }, units: 'W' };
  const updated = scopedReadingOptions('measure_power.load', original, titles);
  assert.equal(updated.title.en, titles.en);
  assert.equal(updated.title.de, 'Custom DE');
  assert.equal(updated.units, 'W');
  assert.equal(original.title.en, 'House consumption');
});

test('physical manifests match scoped defaults while original grid-port and system Energy remain separate', () => {
  for (const id of ['stream_5000_unit', 'stream_ac5000']) {
    const driver = require(`../drivers/${id}/driver.compose.json`);
    for (const [key, title] of Object.entries(STREAM_5000_UNIT_TITLES)) assert.deepEqual(driver.capabilitiesOptions[key].title, title);
    assert.ok(driver.settings.some(group => group.children?.some(setting => setting.id === 'reading_scope')));
    assert.equal(driver.capabilities.includes('measure_power'), false);
  }
  assert.deepEqual(require('../.homeycompose/capabilities/stream_unit_power_grid.json').title, STREAM_UNIT_GRID_TITLE);
  assert.deepEqual(require('../drivers/stream_unit/driver.compose.json').capabilitiesOptions.stream_unit_power_grid.title, STREAM_UNIT_GRID_TITLE);
  assert.equal(require('../drivers/stream_5000_system/driver.compose.json').energy.homeBattery, true);
});

test('optional title migration isolates getter/setter failures without overwriting unreadable or custom options', async () => {
  const key = 'stream_unit_power_grid'; const titles = STREAM_UNIT_GRID_TITLE;
  let reads = 0; let writes = 0;
  const device = {
    hasCapability: () => true,
    getCapabilityOptions: () => { reads++; throw new Error(`Invalid Capability: ${key}`); },
    setCapabilityOptions: async () => { writes++; },
  };
  await migrateReadingTitle(device, key, titles);
  assert.equal(reads, 1); assert.equal(writes, 0);
  device.getCapabilityOptions = () => ({ title: 'My cable', decimals: 1 });
  await migrateReadingTitle(device, key, titles); assert.equal(writes, 0);
  device.getCapabilityOptions = () => ({ title: 'Grid import/export', decimals: 1 });
  device.setCapabilityOptions = () => { writes++; throw new Error('synchronous SDK error'); };
  await migrateReadingTitle(device, key, titles);
  device.setCapabilityOptions = async () => { writes++; throw new Error('asynchronous SDK error'); };
  await migrateReadingTitle(device, key, titles); assert.equal(writes, 2);
  device.hasCapability = () => false;
  await migrateReadingTitle(device, key, titles); assert.equal(writes, 2);
  device.hasCapability = () => true;
  await migrateReadingTitle(device, key, titles, () => false); assert.equal(writes, 2);
  await migrateReadingTitle({ hasCapability: () => true }, key, titles);
});

test('original unit grid-port watts are not battery direction, system watts or socket watts', () => {
  const input = { gridConnectionPower: 800, powGetBpCms: -1500, powGetSysGrid: -3 };
  const unit = mapStreamQuota(input, 'unit');
  assert.equal(unit['measure_power.grid'], 800);
  assert.equal(unit.measure_power, undefined);
  assert.equal(unit.battery_charging_state, undefined);
  assert.equal(mapStreamQuota(input, 'system').measure_power, -1500);
  assert.equal(mapStreamQuota({ powGetBpCms: -1500 }, 'unit')['measure_power.grid'], undefined);
});

test('EcoFlow grid connection label migrates both released default generations, preserving custom options', () => {
  const old = { en: 'Unit grid-port power', de: 'Einheit: Netzanschlussleistung', nl: 'Unit: netaansluitvermogen' };
  assert.equal(STREAM_UNIT_GRID_TITLE.en, 'Unit grid connection port');
  for (const name of ['Grid import/export', 'Netzbezug/-einspeisung', 'Netafname/-teruglevering', ...Object.values(old)]) {
    const options = { title: name, decimals: 2, units: 'W', preventInsights: true };
    assert.deepEqual(scopedReadingOptions('stream_unit_power_grid', options, STREAM_UNIT_GRID_TITLE),
      { ...options, title: STREAM_UNIT_GRID_TITLE });
    assert.equal(options.title, name);
  }
  const options = { title: { en: old.en, de: 'Meine Leitung', nl: 'Netafname/-teruglevering' }, decimals: 2 };
  assert.deepEqual(scopedReadingOptions('stream_unit_power_grid', options, STREAM_UNIT_GRID_TITLE),
    { title: { en: STREAM_UNIT_GRID_TITLE.en, de: 'Meine Leitung', nl: STREAM_UNIT_GRID_TITLE.nl }, decimals: 2 });
  assert.equal(options.title.en, old.en);
  assert.equal(scopedReadingOptions('stream_unit_power_grid', { title: 'My office cable' }, STREAM_UNIT_GRID_TITLE), null);
  assert.equal(scopedReadingOptions('stream_unit_power_grid', { title: STREAM_UNIT_GRID_TITLE }, STREAM_UNIT_GRID_TITLE), null);
  assert.deepEqual(scopedReadingOptions('stream_unit_power_grid', { title: { en: old.en } }, STREAM_UNIT_GRID_TITLE),
    { title: STREAM_UNIT_GRID_TITLE });
});

test('grid connection naming is consistent in composed and packaged assets without changing signed values', () => {
  const cap = require('../.homeycompose/capabilities/stream_unit_power_grid.json');
  assert.deepEqual(require('../app.json').capabilities.stream_unit_power_grid.title, cap.title);
  assert.equal(cap.units.en, 'W');
  assert.equal(cap.setable, false);
  assert.ok(require('../drivers/stream_unit/driver.compose.json').capabilities.includes('stream_unit_power_grid'));
  for (const value of [800, -800, 0]) assert.equal(mapStreamQuota({ gridConnectionPower: value }, 'unit')['measure_power.grid'], value);
  assert.match(require('../locales/en.json').settings.reporter.original_unit_scope, /[Gg]rid connection port/);
});

test('remaining-time default labels can be scoped without overwriting a custom name or units', () => {
  const titles = { en: 'Unit discharge time remaining', de: 'Einheit: Verbleibende Entladezeit', nl: 'Unit: resterende ontlaadtijd' };
  const options = scopedReadingOptions('discharge_remaining', { title: 'Discharge time remaining', units: 'min' }, titles);
  assert.deepEqual(options, { title: titles, units: 'min' });
  assert.equal(scopedReadingOptions('discharge_remaining', { title: 'My runtime' }, titles), null);
});

test('released Time to full/empty labels migrate to explicit unit or system scope', () => {
  for (const [key, names] of [['charge_remaining', ['Time to full', 'Zeit bis voll', 'Tijd tot vol']],
    ['discharge_remaining', ['Time to empty', 'Zeit bis leer', 'Tijd tot leeg']]]) {
    for (const name of names) {
      const title = { en: 'Unit time remaining', de: 'Einheit: Restzeit', nl: 'Unit: resterende tijd' };
      assert.deepEqual(scopedReadingOptions(key, { title: name, units: 'min' }, title), { title, units: 'min' });
    }
  }
});

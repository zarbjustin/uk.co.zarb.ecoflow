'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scopedReadingOptions, STREAM_5000_UNIT_TITLES, STREAM_UNIT_GRID_TITLE } = require('../.homeybuild/lib/streamReadingScopes');
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
  assert.equal(require('../drivers/stream_5000_system/driver.compose.json').energy.homeBattery, true);
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

test('remaining-time default labels can be scoped without overwriting a custom name or units', () => {
  const titles = { en: 'Unit discharge time remaining', de: 'Einheit: Verbleibende Entladezeit', nl: 'Unit: resterende ontlaadtijd' };
  const options = scopedReadingOptions('discharge_remaining', { title: 'Discharge time remaining', units: 'min' }, titles);
  assert.deepEqual(options, { title: titles, units: 'min' });
  assert.equal(scopedReadingOptions('discharge_remaining', { title: 'My runtime' }, titles), null);
});

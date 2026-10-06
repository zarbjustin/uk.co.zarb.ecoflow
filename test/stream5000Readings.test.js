'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000ReadingAges, stream5000ConfigurationValues } = require('../.homeybuild/lib/stream5000Readings');
const manifest = require('../app.json');
const fs = require('node:fs');
const path = require('node:path');

test('new capability metadata is read-only, matches compose and references real artwork', () => {
  const root = path.join(__dirname, '..');
  for (const [id, capability] of Object.entries(manifest.capabilities).filter(([id]) => id.startsWith('stream_5000_'))) {
    assert.equal(capability.setable, false);
    assert.deepEqual(capability, require(path.join(root, '.homeycompose/capabilities', id + '.json')));
    assert.ok(fs.existsSync(path.join(root, capability.icon)));
  }
  for (const card of manifest.flow.conditions.filter(card => card.id.startsWith('stream_5000_'))) {
    assert.deepEqual(card, require(path.join(root, '.homeycompose/flow/conditions', card.id + '.json')));
  }
});

test('reading timestamps are bounded to known capabilities, ignore counters, and do not refresh missing deltas', () => {
  const ages = new Stream5000ReadingAges();
  ages.observe({ measure_power: 200, 'meter_power.charged': 10, PRIVATE: 99 }, 1000);
  ages.observe({ measure_temperature: 30 }, 2000);
  assert.deepEqual(ages.expired(2500, 1000), ['measure_power']);
  assert.equal(ages.snapshot(2500, 1000).measure_temperature.stale, false);
  assert.ok(!JSON.stringify(ages.snapshot(2500, 1000)).includes('PRIVATE'));
  ages.observe({ measure_power: null }, 2500);
  assert.equal(ages.snapshot(2500, 1000).measure_power, undefined);
  ages.observe({ measure_power: 0 }, 3000);
  assert.deepEqual(ages.expired(2999, 1000), ['measure_power']);
});

test('read-only configuration rejects stale, malformed, unknown mode and invalid numeric values', () => {
  const values = stream5000ConfigurationValues({ values: {
    mode: { stale: false, value: 'custom' }, maxChargeSocPct: { stale: false, value: 101 },
    maxGridInputW: { stale: false, value: 0 }, backupReservePct: { stale: true, value: 20 },
    minDischargeSocPct: { stale: false, value: 'PRIVATE' },
  } });
  assert.equal(values.stream_5000_mode, 'custom');
  assert.equal(values.stream_5000_charge_limit, null);
  assert.equal(values.stream_5000_grid_input_limit, 0);
  assert.equal(values.stream_5000_backup_reserve, null);
  assert.equal(values.stream_5000_discharge_limit, null);
  for (const capability of Object.keys(values)) {
    assert.equal(manifest.capabilities[capability].setable, false);
    assert.equal(manifest.capabilities[capability].getable, true);
  }
  assert.ok(!JSON.stringify(values).includes('PRIVATE'));
});

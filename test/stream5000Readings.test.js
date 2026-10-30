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
  assert.equal(ages.snapshot(2500, 1000).measure_power.applicationStatus, 'unavailable');
  assert.equal(ages.snapshot(2500, 1000).measure_power.ageSec, null);
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

test('power/state expire independently within three minutes while SOC and temperature retain the connection timeout', () => {
  const ages = new Stream5000ReadingAges();
  ages.observe({ measure_power: 200, 'measure_power.load': 25, stream_unit_power_battery_flow: -20,
    battery_charging_state: 'charging', stream_5000_direct_pv: 100,
    stream_5000_socket_power: 80, stream_unit_power_pv4: 50, measure_battery: 15, measure_temperature: 30 }, 1000);
  assert.equal(ages.expired(181000, 1200000).length, 0);
  assert.equal(ages.expired(181001, 1200000).length, 7);
  ages.observe({ measure_temperature: 31 }, 181001);
  assert.equal(ages.snapshot(181001, 1200000).measure_power.stale, true);
  assert.equal(ages.snapshot(181001, 1200000).measure_battery.stale, false);
  assert.equal(ages.snapshot(181001, 1200000).measure_temperature.stale, false);
  ages.observe({ measure_power: 0 }, 181001);
  assert.equal(ages.snapshot(181001, 1200000).measure_power.stale, false);
  assert.equal(ages.snapshot(181001, 1200000)['measure_power.load'].stale, true);
});

test('reserve status is independent of stored target, accepts false and zero, and never guesses unknown as disabled', () => {
  const field = value => ({ value, stale: false });
  const values = (state, target) => stream5000ConfigurationValues({ values: {
    backupReserveEnabled: state, backupReservePct: target,
  } });
  assert.equal(values(field(false), field(40)).stream_5000_backup_reserve_state, 'disabled');
  assert.equal(values(field(false), field(40)).stream_5000_backup_reserve, 40);
  assert.equal(values(field(true), field(0)).stream_5000_backup_reserve_state, 'enabled');
  assert.equal(values(field(true), field(0)).stream_5000_backup_reserve, 0);
  for (const state of [undefined, null, field(0), field(1), field('false'), field('true'),
    field({ enabled: true }), { value: true, stale: true }, { value: false }]) {
    const result = values(state, field(40));
    assert.equal(result.stream_5000_backup_reserve_state, null);
    assert.equal(result.stream_5000_backup_reserve, 40);
  }
  for (const target of [undefined, null, field(-1), field(101), field('40'), { value: 40, stale: true }]) {
    const result = values(field(true), target);
    assert.equal(result.stream_5000_backup_reserve_state, 'enabled');
    assert.equal(result.stream_5000_backup_reserve, null);
  }
});

test('failed application keeps the applied age while separating receipt age and recovery per field', () => {
  const ages = new Stream5000ReadingAges();
  ages.observe({ 'measure_power.load': 42 }, 1000);
  ages.failed('measure_power.load', 5000);
  assert.deepEqual(ages.snapshot(5000, 180000)['measure_power.load'], {
    ageSec: 4, receivedAgeSec: 0, stale: true, applicationStatus: 'write_failed',
  });
  ages.observe({ measure_temperature: 30 }, 6000);
  assert.equal(ages.hasWriteFailures(), true);
  assert.deepEqual(ages.expired(6000, 180000), ['measure_power.load']);
  ages.failed('measure_power.load'); // a failed watchdog clear is not another receipt
  assert.equal(ages.snapshot(7000, 180000)['measure_power.load'].receivedAgeSec, 2);
  ages.observe({ 'measure_power.load': 0 }, 7000);
  assert.equal(ages.hasWriteFailures(), false);
  assert.equal(ages.snapshot(7000, 180000)['measure_power.load'].applicationStatus, 'applied');
});

test('invalid and out-of-order attempts do not renew applied freshness or clear failures', () => {
  const ages = new Stream5000ReadingAges();
  ages.observe({ measure_power: 42 }, 5000);
  ages.failed('measure_power', 6000);
  for (const at of [NaN, Infinity, -1, 1000]) {
    ages.failed('measure_power', at);
    ages.observe({ measure_power: 0 }, at);
  }
  ages.observe({ measure_power: NaN, measure_temperature: {}, PRIVATE: 0 }, 7000);
  ages.failed('PRIVATE', 7000);
  const snapshot = ages.snapshot(7000, 180000);
  assert.deepEqual(Object.keys(snapshot), ['measure_power']);
  assert.equal(snapshot.measure_power.ageSec, 2);
  assert.equal(snapshot.measure_power.receivedAgeSec, 1);
  assert.equal(snapshot.measure_power.applicationStatus, 'write_failed');
  assert.equal(ages.canApply('measure_power', 5000, 7000, 180000), false);
  assert.equal(ages.canApply('measure_power', 7001, 7000, 180000), false);
});

test('clock rollback invalidates old applied values but admits a new-epoch receipt', () => {
  const ages = new Stream5000ReadingAges();
  ages.observe({ measure_power: 100 }, 10000);
  assert.equal(ages.snapshot(5000, 180000).measure_power.stale, true);
  assert.equal(ages.canApply('measure_power', 10000, 5001, 180000), false);
  assert.equal(ages.canApply('measure_power', 5000, 5001, 180000), true);
  ages.receive('measure_power', 5000);
  assert.equal(ages.snapshot(5001, 180000).measure_power.stale, true);
  ages.observe({ measure_power: 0 }, 5000);
  assert.equal(ages.snapshot(5001, 180000).measure_power.stale, false);
});

test('exact applied receipt is field specific and does not advance on failed writes or other telemetry', () => {
 const ages = new Stream5000ReadingAges(); const key = 'stream_unit_power_battery_flow';
 assert.equal(ages.appliedReceiptAt(key), null); ages.observe({ [key]: -100 }, 1000);
 ages.observe({ measure_temperature: 30 }, 2000); ages.failed(key, 3000);
 assert.equal(ages.appliedReceiptAt(key), 1000); ages.observe({ [key]: 0 }, 4000); assert.equal(ages.appliedReceiptAt(key), 4000);
 ages.observe({ [key]: null }, 5000); assert.equal(ages.appliedReceiptAt(key), null);
});

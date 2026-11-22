'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SmartMeterTelemetry } = require('../.homeybuild/lib/smartMeterTelemetry');
const mqtt = (receivedAt) => ({ source: 'mqtt', receivedAt });
const rest = (receivedAt) => ({ source: 'rest', receivedAt });

test('active grid diagnostics distinguish direct, fallback, stale, restart and clock reversal', () => {
  const t = new SmartMeterTelemetry();
  assert.equal(t.snapshot(1000).activeGrid, null);
  t.observe({ powGetSysGrid: 0 }, mqtt(1000), 1000);
  assert.deepEqual(t.snapshot(2000).activeGrid, { source: 'direct_meter', value: 0, ageSec: 1, stale: false });
  assert.equal(t.snapshot(91001).readings.measure_power.stale, true);
  assert.equal(t.snapshot(91001).activeGrid.value, null);
  t.observe({ powGetSysGrid: -100 }, rest(92000), 92000);
  assert.deepEqual(t.snapshot(93000).activeGrid, { source: 'linked_installation', value: -100, ageSec: 1, stale: false });
  t.observe({ powGetSysGrid: 20 }, mqtt(94000), 94000);
  assert.equal(t.snapshot(94000).activeGrid.source, 'direct_meter');
  assert.deepEqual(t.snapshot(93000).activeGrid, { source: 'direct_meter', value: null, ageSec: null, stale: true });
  assert.equal(new SmartMeterTelemetry().snapshot(95000).activeGrid, null);
});

test('direct MQTT wins over host REST until its own grid field expires', () => {
  const t = new SmartMeterTelemetry();
  assert.equal(t.observe({ powGetSysGrid: 0 }, mqtt(1000), 1000).measure_power, 0);
  assert.equal(t.observe({ powGetSysGrid: 999 }, rest(2000), 2000).measure_power, undefined);
  t.observe({ gridConnectionVolL1: 240 }, mqtt(90000), 90000);
  assert.equal(t.observe({ powGetSysGrid: -50 }, rest(92000), 92000).measure_power, -50);
});

test('partial frames retain individual ages and explicit zeros; older frames cannot overwrite', () => {
  const t = new SmartMeterTelemetry();
  t.observe({ powGetSysGrid: 0, gridConnectionPowerL1: 0, gridConnectionVolL1: 240 }, mqtt(1000), 1000);
  t.observe({ gridConnectionVolL1: 241 }, mqtt(2000), 2000);
  assert.deepEqual(t.observe({ gridConnectionVolL1: 222 }, mqtt(1500), 2000), {});
  const s = t.snapshot(3000);
  assert.equal(s.readings['measure_power.l1'].value, 0);
  assert.equal(s.readings['measure_voltage.l1'].ageSec, 1);
  assert.equal(s.readings.measure_power.ageSec, 2);
  assert.ok(t.expired(182001).includes('measure_voltage.l1'));
});

test('rejects future and stale queued samples; does not manufacture grid power from details', () => {
  const t = new SmartMeterTelemetry();
  assert.deepEqual(t.observe({ powGetSysGrid: 10 }, mqtt(3000), 2000), {});
  assert.deepEqual(t.observe({ powGetSysGrid: 10 }, mqtt(1000), 200000), {});
  assert.equal(t.observe({ gridConnectionVolL1: 230 }, mqtt(2000), 2000).measure_power, undefined);
});

test('zero power factor is unavailable while power flows, but valid at idle', () => {
  const t = new SmartMeterTelemetry();
  assert.equal(t.observe({ powGetSysGrid: 100, gridConnectionPowerFactor: 0 }, mqtt(1000), 1000).power_factor, null);
  assert.equal(t.observe({ powGetSysGrid: 0, gridConnectionPowerFactor: 0 }, mqtt(2000), 2000).power_factor, 0);
});

test('counter candidates are diagnostics only and identity fields never escape', () => {
  const t = new SmartMeterTelemetry();
  const out = t.observe({ sn: 'PRIVATE', gridConnectionDataRecord: { todayActive: 100, totalReactiveEnergy: 20, totalActiveEnergy: 80, private: 'SECRET' }, gridConnectionFlagL1: 1 }, mqtt(1000), 1000);
  assert.deepEqual(out, {});
  const s = t.snapshot(2000);
  assert.equal(s.counterCandidates.todayActive.value, 100);
  assert.equal(s.accountingSource, 'integrated_power');
  assert.equal(s.nativeCounterMigrationEnabled, false);
  assert.equal(s.readings.gridConnectionFlagL1.value, 1);
  assert.ok(!JSON.stringify(s).includes('PRIVATE'));
  assert.ok(!JSON.stringify(s).includes('SECRET'));
  assert.equal(new SmartMeterTelemetry().snapshot(2000).directGridFresh, false);
});

test('older direct grid cannot overwrite a newer fallback and backwards clocks are not fresh', () => {
  const t = new SmartMeterTelemetry();
  t.observe({ powGetSysGrid: 100 }, rest(10000), 10000);
  assert.equal(t.observe({ powGetSysGrid: 200 }, mqtt(9000), 10000).measure_power, undefined);
  assert.equal(t.freshGrid(10000), 100);
  assert.equal(t.freshGrid(8000), null);
});

test('host REST does not claim this meter phase measurements', () => {
  const t = new SmartMeterTelemetry();
  assert.deepEqual(t.observe({ powGetSysGrid: 100, gridConnectionVolL1: 230 }, rest(1000), 1000), { measure_power: 100 });
  assert.deepEqual(t.snapshot(2000).readings, {});
});

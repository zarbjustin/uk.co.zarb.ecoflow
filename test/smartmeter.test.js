'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { mapSmartMeterQuota, accumulateEnergy, looksLikeSmartMeter } = require('../.homeybuild/lib/smartMeterMapping.js');

test('grid power comes from powGetSysGrid (STREAM main) with gridConnectionPower fallback', () => {
  assert.strictEqual(mapSmartMeterQuota({ powGetSysGrid: 2769 })['measure_power'], 2769);
  // Falls back to gridConnectionPower when the system grid field is absent.
  assert.strictEqual(mapSmartMeterQuota({ gridConnectionPower: 150.5 })['measure_power'], 150.5);
  // No grid data at all -> no measure_power.
  assert.strictEqual(mapSmartMeterQuota({}).measure_power, undefined);
});

test('per-phase telemetry maps when a standalone meter provides it', () => {
  const out = mapSmartMeterQuota({
    gridConnectionPowerL1: 100,
    gridConnectionVolL2: 230.1,
    gridConnectionAmpL3: 1.5,
    gridConnectionPowerFactor: 0.98,
  });
  assert.strictEqual(out['measure_power.l1'], 100);
  assert.strictEqual(out['measure_voltage.l2'], 230.1);
  assert.strictEqual(out['measure_current.l3'], 1.5);
  assert.strictEqual(out['power_factor'], 0.98);
});

test('accumulateEnergy integrates import and export monotonically', () => {
  // 3600 W for 1 second = 1 Wh.
  let s = { importWh: 0, exportWh: 0 };
  s = accumulateEnergy(s, 3600, 1000);
  assert.ok(Math.abs(s.importWh - 1) < 1e-9);
  assert.strictEqual(s.exportWh, 0);

  // Exporting: -3600 W for 1 second = 1 Wh export, import unchanged.
  s = accumulateEnergy(s, -3600, 1000);
  assert.ok(Math.abs(s.importWh - 1) < 1e-9);
  assert.ok(Math.abs(s.exportWh - 1) < 1e-9);
});

test('accumulateEnergy ignores invalid or oversized intervals', () => {
  const base = { importWh: 5, exportWh: 2 };
  assert.deepStrictEqual(accumulateEnergy(base, 1000, 0), base); // dt <= 0
  assert.deepStrictEqual(accumulateEnergy(base, 1000, -10), base); // negative dt
  assert.deepStrictEqual(accumulateEnergy(base, 1000, 2 * 60 * 60 * 1000), base); // > 1h gap
  assert.deepStrictEqual(accumulateEnergy(base, NaN, 1000), base); // bad power
});

test('looksLikeSmartMeter detects standalone per-phase meters only', () => {
  assert.strictEqual(looksLikeSmartMeter({ gridConnectionPowerL1: 1 }), true);
  assert.strictEqual(looksLikeSmartMeter({ powGetSysGrid: 2769 }), false);
});

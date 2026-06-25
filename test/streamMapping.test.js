'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { mapStreamQuota } = require('../.homeybuild/lib/streamMapping.js');

// Real STREAM main-SN quota sample (whole-home aggregates populated).
const MAIN = {
  cmsBattSoc: 20,
  powGetBpCms: 1237,
  powGetPvSum: 2437,
  powGetSysGrid: 2769,
  powGetSysLoad: 3969,
  gridConnectionPower: 1049.936,
  relay2Onoff: true,
  relay3Onoff: false,
};

test('system scope reports whole-home grid (powGetSysGrid)', () => {
  const v = mapStreamQuota(MAIN); // default scope = system
  assert.strictEqual(v['measure_power.grid'], 2769);
  assert.strictEqual(v['measure_power.load'], 3969);
  assert.strictEqual(v['measure_battery'], 20);
  assert.strictEqual(v['battery_charging_state'], 'charging');
});

test('battery_charging_state reflects battery power sign', () => {
  assert.strictEqual(mapStreamQuota({ powGetBpCms: 1500 })['battery_charging_state'], 'charging');
  assert.strictEqual(mapStreamQuota({ powGetBpCms: -800 })['battery_charging_state'], 'discharging');
  assert.strictEqual(mapStreamQuota({ powGetBpCms: 0 })['battery_charging_state'], 'idle');
  assert.strictEqual(mapStreamQuota({})['battery_charging_state'], undefined);
});

test('unit scope reports the inverter own grid feed (gridConnectionPower)', () => {
  const v = mapStreamQuota(MAIN, 'unit');
  assert.strictEqual(v['measure_power.grid'], 1049.936);
  assert.strictEqual(v['onoff.ac1'], true);
  assert.strictEqual(v['onoff.ac2'], false);
});

test('unit grid falls back to powGetSysGrid when no own feed is present', () => {
  const v = mapStreamQuota({ powGetSysGrid: 100 }, 'unit');
  assert.strictEqual(v['measure_power.grid'], 100);
});

test('unit scope reads per-unit SoC and ignores system cmsBattSoc', () => {
  // Member MQTT BMS: the unit's own SoC.
  assert.strictEqual(mapStreamQuota({ f32ShowSoc: 28.2, soc: 28 }, 'unit')['measure_battery'], 28.2);
  // Member REST snapshot: only the system cmsBattSoc (0 on members) -> unit reports nothing.
  assert.strictEqual(mapStreamQuota({ cmsBattSoc: 0 }, 'unit')['measure_battery'], undefined);
  // System scope still uses the aggregate cmsBattSoc.
  assert.strictEqual(mapStreamQuota({ cmsBattSoc: 20 })['measure_battery'], 20);
});

test('solar is per-unit (own strings) for unit scope, system total for system scope', () => {
  const q = { powGetPvSum: 845, powGetPv: 188, powGetPv2: 181 };
  // System: uses the firmware total.
  assert.strictEqual(mapStreamQuota(q)['measure_power.pv'], 845);
  // Unit: sums the unit's own strings, ignoring the system total.
  assert.strictEqual(mapStreamQuota(q, 'unit')['measure_power.pv'], 369);
});

test('self_heating is mapped only when the device reports a heating field', () => {
  assert.strictEqual(mapStreamQuota({}).self_heating, undefined);
  assert.strictEqual(mapStreamQuota({ bmsHeatingStatus: 1 }, 'unit').self_heating, true);
  assert.strictEqual(mapStreamQuota({ heatingStatus: 0 }, 'unit').self_heating, false);
});

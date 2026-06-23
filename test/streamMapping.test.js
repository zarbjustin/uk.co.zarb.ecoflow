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

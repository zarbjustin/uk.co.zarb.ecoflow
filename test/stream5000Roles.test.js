'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stream5000PhysicalCapabilityValues,
} = require('../.homeybuild/lib/stream5000Roles');

test('physical unit telemetry moves battery power out of the Homey Energy namespace', () => {
  const telemetry = {
    measure_battery: 81,
    measure_power: -381,
    'measure_power.load': 380,
  };

  const unitValues = stream5000PhysicalCapabilityValues(telemetry);

  assert.equal(unitValues.measure_power, undefined);
  assert.equal(unitValues.stream_unit_power_battery_flow, -381);
  assert.equal(unitValues.measure_battery, 81);
  assert.equal(unitValues['measure_power.load'], 380);
  assert.equal(telemetry.measure_power, -381, 'the shared telemetry sample must not be mutated');
});

test('physical unit telemetry retains a genuine zero battery-flow sample', () => {
  const unitValues = stream5000PhysicalCapabilityValues({ measure_power: 0 });
  assert.equal(unitValues.stream_unit_power_battery_flow, 0);
  assert.equal(unitValues.measure_power, undefined);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stream5000ModelFromSn } = require('../.homeybuild/lib/stream5000Models');
const { stream5000TelemetryAdapter } = require('../.homeybuild/lib/stream5000Adapters');
const core = require('./fixtures/stream5000Es21Core.json');
const captures = require('./fixtures/stream5000Telemetry.json');
const adapter = stream5000TelemetryAdapter(stream5000ModelFromSn('ES21TESTUNITAAAA'));

test('ES21 public masked frames corroborate core SOC, grid, BMS and conservative unknown handling', () => {
  const parse = (index) => adapter.parse(Buffer.from(core.frames.find((entry) => entry.index === index).hex, 'hex'));
  assert.equal(parse(0).socPct, 74);
  assert.equal(parse(0).homeW, 610);
  assert.ok(Math.abs(parse(0).gridW + 19.195) < 0.001);
  assert.equal(parse(1).battTempC, 45);
  assert.equal(parse(1).bmsSohPct, 100);
  assert.equal(parse(2).maxChargeSocPct, 100, 'readback is not a permitted write recommendation');
  assert.equal(parse(3).battW, -630);
  assert.equal(parse(3).gridExportPowerW, 19);
  assert.equal(parse(4), null);
  assert.equal(adapter.parse(Buffer.from([0xff])), null);
});

test('ES21 PV-to-battery charge enters aggregate flow power, not an additional PV Energy source', () => {
  const expected = [438, 34, 28];
  for (const [index, sample] of captures.mppt.frames.entries()) {
    const telemetry = adapter.parse(Buffer.from(sample.hex, 'hex'));
    const values = adapter.map(telemetry);
    assert.equal(values.measure_power, expected[index]);
    assert.equal(values.battery_charging_state, 'charging');
    assert.equal(Object.keys(values).some((key) => key.includes('pv') || key.includes('meter_power')), false);
  }
});

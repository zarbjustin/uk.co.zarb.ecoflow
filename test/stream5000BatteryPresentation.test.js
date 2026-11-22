'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000BatteryPresentation } = require('../.homeybuild/lib/stream5000BatteryPresentation');
const zero = { stream_unit_power_battery_flow: 0, battery_charging_state: 'idle' };
const sample = (now, extra = {}) => ({ now, connectionLimitMs: 1200000, telemetryAt: now,
  active: true, live: false, seen: true, writeFailed: false, linked: false, ...extra });

test('sparse idle preserves only explicitly last-reported standby, never a live number', () => {
  const view = new Stream5000BatteryPresentation();
  view.observe(zero, 100000, 100000);
  assert.equal(view.snapshot(sample(100000, { live: true })).status, 'live');
  view.observe({ measure_temperature: 22 }, 400000, 400000);
  assert.deepEqual(view.snapshot(sample(400000)), {
    status: 'last_reported_standby', lastStandbyAgeSec: 300, live: false, energyUsed: false,
  });
  view.observe({ measure_temperature: 23 }, 1300001, 1300001);
  assert.equal(view.snapshot(sample(1300001)).status, 'expired');
});

test('zero alone, idle alone, missing, null, nonzero and split deltas cannot establish standby', () => {
  for (const values of [{ stream_unit_power_battery_flow: 0 }, { battery_charging_state: 'idle' },
    { stream_unit_power_battery_flow: null, battery_charging_state: 'idle' },
    { stream_unit_power_battery_flow: 10, battery_charging_state: 'idle' },
    { stream_unit_power_battery_flow: 0, battery_charging_state: 'charging' }]) {
    const view = new Stream5000BatteryPresentation();
    view.observe(values, 100000, 100000);
    assert.notEqual(view.snapshot(sample(400000)).status, 'last_reported_standby');
  }
  const view = new Stream5000BatteryPresentation();
  view.observe({ stream_unit_power_battery_flow: 0 }, 100000, 100000);
  view.observe({ battery_charging_state: 'idle' }, 100001, 100001);
  assert.equal(view.snapshot(sample(400000)).status, 'expired');
});

test('new power or missing direction withdraws last standby, fresh zero can recover', () => {
  const view = new Stream5000BatteryPresentation();
  view.observe(zero, 100000, 100000);
  view.observe({ stream_unit_power_battery_flow: -100, battery_charging_state: 'discharging' }, 200000, 200000);
  assert.equal(view.snapshot(sample(400000)).status, 'expired');
  view.observe(zero, 500000, 500000);
  assert.equal(view.snapshot(sample(500000, { live: true })).status, 'live');
  view.observe({ battery_charging_state: null }, 500001, 500001);
  assert.equal(view.snapshot(sample(800000)).status, 'expired');
});

test('disconnect, write failure, linked scope, clock rollback and session reset discard the hint', () => {
  for (const extra of [{ active: false }, { telemetryAt: 1, connectionLimitMs: 1000 },
    { writeFailed: true }, { linked: true }]) {
    const view = new Stream5000BatteryPresentation();
    view.observe(zero, 100000, 100000);
    assert.notEqual(view.snapshot(sample(400000, extra)).status, 'last_reported_standby');
    assert.equal(view.snapshot(sample(400001)).lastStandbyAgeSec, null);
  }
  const view = new Stream5000BatteryPresentation();
  view.observe(zero, 100000, 100000);
  assert.equal(view.snapshot(sample(99999)).lastStandbyAgeSec, null);
  view.observe(zero, 100000, 100000); view.reset();
  assert.notEqual(view.snapshot(sample(100001, { live: true })).status, 'live');
});

test('future, late, out-of-order and non-finite receipts cannot create or renew the hint', () => {
  const view = new Stream5000BatteryPresentation();
  for (const [at, now] of [[NaN, 100000], [200000, 100000], [1, 400000]]) {
    view.observe(zero, at, now);
    assert.equal(view.snapshot(sample(400000)).lastStandbyAgeSec, null);
  }
  view.observe(zero, 500000, 500000);
  view.observe({ stream_unit_power_battery_flow: 100 }, 499999, 500000);
  assert.equal(view.snapshot(sample(800000)).lastStandbyAgeSec, 300);
});

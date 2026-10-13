'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtChannels, verifiedDualCtContract } = require('../.homeybuild/lib/dualCtChannels');
const unknown = () => ({ role: 'unknown', source: null, importSign: null });
function harness(role = 'grid', sign = 'positive') {
  const state = new DualCtChannels();
  state.configure({ ct1: { role, source: 'developer_live', importSign: role === 'grid' ? sign : null },
    ct2: { role: 'load', source: 'app_live', importSign: null } });
  return state;
}
const reading = (state, channel, metric, value, at = 1000, source = 'developer_live', unit = 'W', measured = at) =>
  state.observe(channel, metric, value, unit, source, at, measured, at);
const channel = (state, id, now = 1000) => state.snapshot(now).channels.find((item) => item.channel === id);

test('no identity/metadata/research boolean can activate a verified Dual CT contract', () => {
  for (const identity of ['BK21', 'Dual CT', 'ZZ99', { verified: true }, null]) assert.equal(verifiedDualCtContract(identity), null);
  const state = new DualCtChannels();
  assert.equal(reading(state, 'ct1', 'powerW', 10), false);
  const result = state.snapshot(1000);
  assert.equal(result.channelMappingVerified, false); assert.equal(result.contributesToEnergy, false);
  assert.equal(result.pairingEnabled, false); assert.equal(result.controlsEnabled, false);
  assert(result.channels.every((item) => item.role === 'unknown' && item.metrics.powerW.value === null));
});

test('CT1 and CT2 are independent, never summed or inferred as grid/solar by position', () => {
  const state = harness(); reading(state, 'ct1', 'powerW', -200);
  reading(state, 'ct2', 'powerW', 50, 1000, 'app_live');
  const result = state.snapshot(1000);
  assert.equal(channel(state, 'ct1').gridExportW, 200);
  assert.equal(channel(state, 'ct2').gridExportW, null);
  assert.equal(result.combinedGridW, null);
  assert.equal(channel(state, 'ct2').role, 'load');
  assert.equal(channel(state, 'ct2').metrics.voltageV.value, null);
});

test('direction requires explicit grid sign; zero is valid and unknown direction is not manufactured', () => {
  for (const [sign, power, imported, exported] of [['positive', 90, 90, 0], ['positive', -90, 0, 90],
    ['negative', -90, 90, 0], ['positive', 0, 0, 0], [null, -90, null, null]]) {
    const state = harness('grid', sign); reading(state, 'ct1', 'powerW', power);
    assert.equal(channel(state, 'ct1').gridImportW, imported);
    assert.equal(channel(state, 'ct1').gridExportW, exported);
  }
});

test('partial metrics retain their own ages; unrelated updates do not freshen stale fields', () => {
  const state = harness(); reading(state, 'ct1', 'powerW', 25);
  reading(state, 'ct1', 'voltageV', 230, 50000, 'developer_live', 'V');
  const current = channel(state, 'ct1', 92000);
  assert.equal(current.metrics.powerW.value, null); assert.equal(current.metrics.powerW.status, 'stale');
  assert.equal(current.metrics.voltageV.value, 230);
  assert.equal(current.metrics.currentA.status, 'missing');
  assert.equal(current.gridImportW, null);
  assert.equal(channel(state, 'ct2', 92000).metrics.powerW.status, 'missing');
});

test('cached/out-of-order/future/nonfinite readings, wrong units and unselected sources fail closed', () => {
  const state = harness(); assert(reading(state, 'ct1', 'powerW', 25));
  assert.equal(reading(state, 'ct1', 'powerW', 99, 2000, 'developer_live', 'W', 1000), false);
  assert.equal(reading(state, 'ct1', 'powerW', 99, 2000, 'developer_live', 'W', 900), false);
  assert.equal(state.observe('ct1', 'powerW', 99, 'W', 'developer_live', 3000, 3000, 2000), false);
  assert.equal(reading(state, 'ct1', 'powerW', 99, 2000, 'app_live'), false);
  assert.equal(reading(state, 'ct1', 'powerW', 99, 2000, 'developer_live', 'kW'), false);
  for (const value of [Infinity, NaN, '99', 100001]) assert.equal(reading(state, 'ct1', 'powerW', value, 2000), false);
  assert.equal(channel(state, 'ct1', 2000).metrics.powerW.value, 25);
});

test('role/source/sign changes clear old values; two grid roles and invalid configurations are rejected', () => {
  const state = harness(); reading(state, 'ct1', 'powerW', 10);
  assert.equal(state.configure({ ct1: { role: 'grid', source: 'developer_live', importSign: 'positive' },
    ct2: { role: 'grid', source: 'app_live', importSign: 'positive' } }), false);
  assert.equal(channel(state, 'ct1').metrics.powerW.value, 10);
  assert.equal(state.configure({ ct1: { role: 'solar', source: 'app_live', importSign: null }, ct2: unknown() }), true);
  assert.equal(channel(state, 'ct1').metrics.powerW.value, null);
  assert.equal(channel(state, 'ct1').role, 'solar');
  assert.equal(reading(state, 'ct1', 'powerW', 99, 2000), false);
  assert.equal(state.configure({ ct1: { role: 'load', source: 'app_live', importSign: 'positive' }, ct2: unknown() }), false);
});

test('snapshot receipts require measurement age, not a new HTTP response receipt', () => {
  const state = new DualCtChannels(); state.configure({ ct1: { role: 'grid', source: 'device_snapshot', importSign: null }, ct2: unknown() });
  assert.equal(reading(state, 'ct1', 'powerW', 10, 100000, 'device_snapshot', 'W', 1), false);
  assert.equal(reading(state, 'ct1', 'powerW', 10, 100000, 'device_snapshot', 'W', 99999), true);
  assert.equal(channel(state, 'ct1', 100000).metrics.powerW.measurementAgeSec, 0.001);
  assert.equal(channel(state, 'ct1', 100000).gridImportW, null);
});

test('clear/reconnect and clock rollback cannot retain readings; callers cannot mutate state snapshots/config', () => {
  const state = harness(); reading(state, 'ct1', 'powerW', 10);
  const snapshot = state.snapshot(1000); snapshot.channels[0].metrics.powerW.value = 999;
  assert.equal(channel(state, 'ct1').metrics.powerW.value, 10);
  assert.equal(channel(state, 'ct1', 500).metrics.powerW.value, null);
  reading(state, 'ct1', 'powerW', 20, 1000); state.clear();
  assert.equal(channel(state, 'ct1').metrics.powerW.value, null);
});

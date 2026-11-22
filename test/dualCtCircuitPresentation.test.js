'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtMonitor } = require('../.homeybuild/lib/dualCtMonitor');
const { DualCtDevicePreview } = require('../.homeybuild/lib/dualCtDevicePreview');
const { DUAL_CT_PHASE_DISPLAYS, dualCtCircuitRole } = require('../.homeybuild/lib/dualCtPresentation');
const { verifiedDualCtContract } = require('../.homeybuild/lib/dualCtChannels');
const { dualCtReleaseReadiness } = require('../.homeybuild/lib/dualCtReadiness');
const { varint, scalar, context } = require('./helpers/dualCtSynthetic');
const en = require('../locales/en.json').dual_ct_preview;
const manifest = require('../drivers/smartmeter_dual_ct_preview/driver.compose.json');
const text = key => en[key] || key;
const scope = { account: 'synthetic-account', device: 'SYNTHETICDUALCT01', session: 'synthetic-session' };
const topic = `/app/device/property/${scope.device}`;
const nested = (field, bytes) => Buffer.concat([varint(field * 8 + 2), varint(bytes.length), bytes]);
const int = (field, value) => Buffer.concat([varint(field * 8), varint(value)]);
const frame = bytes => nested(1, Buffer.concat([nested(1, bytes), int(6, 0), int(8, 254), int(9, 21)]));
const bytes = rows => Buffer.concat(rows.map(([field, value]) => scalar(field, value)));
// Generated, unrelated to customer measurements. Two circuits net independently.
const mixed = [[962, 180], [963, -280], [772, 70], [515, -30], [991, -15], [992, -25], [993, -35], [998, -75]];

test('native phase cards preserve all 18 individual values, SI units, signs and explicit zero without summing voltage/current', () => {
  const monitor = new DualCtMonitor(scope);
  const rows = DUAL_CT_PHASE_DISPLAYS.map((row, i) => [row.field, i === 0 ? 0 : (i % 2 ? -1 : 1) * (i + 0.123456)]);
  monitor.observe(frame(bytes(rows)), topic, 1000);
  const view = monitor.snapshot(2000, text);
  assert.equal(DUAL_CT_PHASE_DISPLAYS.length, 18);
  for (const [i, row] of DUAL_CT_PHASE_DISPLAYS.entries()) {
    assert.equal(view.values[row.capability], Math.fround(rows[i][1]));
    const definition = require(`../.homeycompose/capabilities/${row.capability.split('.')[0]}.json`);
    assert.equal(definition.units, { power: 'W', voltage: 'V', current: 'A' }[row.quantity]);
    assert.equal(definition.setable, false); assert.equal(definition.insights, false);
  }
  assert.match(view.values['dual_ct_preview_fields.a_voltage'], /Phase 1 · 956:/);
  assert.equal(view.values['dual_ct_preview_fields.a_voltage'].split('\n').length, 3);
  assert.equal(Object.keys(view.values).some(id => /sum.*voltage|sum.*current/.test(id)), false);
});

test('each circuit has its own signed same-packet phase sum, never an addition of CT1 and CT2', () => {
  const monitor = new DualCtMonitor(scope);
  monitor.observe(frame(bytes(mixed)), topic, 1000);
  const view = monitor.snapshot(2000, text);
  assert.equal(view.values['dual_ct_preview_net.a'], -30);
  assert.equal(view.values['dual_ct_preview_net.b'], -75);
  assert.match(view.values['dual_ct_preview_net_status.a'], /one packet.*\(1s\)/);
  assert.doesNotMatch(JSON.stringify(view), /combinedGridW|measure_power|meter_power/);
});

test('phase-only complete packet can produce a sum; raw total alone and partial cached unions cannot', () => {
  const monitor = new DualCtMonitor(scope);
  for (const [i, field] of [962, 963, 772].entries()) monitor.observe(frame(scalar(field, 50)), topic, 1000 + i);
  assert.equal(monitor.snapshot(2000, text).values['dual_ct_preview_net.a'], null);
  monitor.observe(frame(bytes([[962, 10], [963, -40], [772, 20]])), topic, 3000);
  assert.equal(monitor.snapshot(3000, text).values['dual_ct_preview_net.a'], -10);
  monitor.observe(frame(scalar(515, -10)), topic, 4000);
  const view = monitor.snapshot(4000, text);
  assert.equal(view.values['dual_ct_preview_total.a'], -10);
  assert.equal(view.values['dual_ct_preview_net.a'], null);
  assert.ok(view.values['dual_ct_preview_net_status.a'].includes(en.sum_partial));
});

test('partial power invalidates only its circuit sum; unrelated voltage and other-bank packets cannot renew it', () => {
  const monitor = new DualCtMonitor(scope); monitor.observe(frame(bytes(mixed)), topic, 1000);
  monitor.observe(frame(scalar(962, 190)), topic, 2000);
  let view = monitor.snapshot(2000, text);
  assert.equal(view.values['dual_ct_preview_net.a'], null);
  assert.equal(view.values['dual_ct_preview_net.b'], -75);
  monitor.observe(frame(scalar(985, 230)), topic, 90000);
  view = monitor.snapshot(91000, text);
  assert.equal(view.values['dual_ct_preview_net.b'], null);
  assert.ok(view.values['dual_ct_preview_net_status.b'].includes(en.sum_stale));
  assert.equal(view.values['dual_ct_preview_voltage.b_p1'], 230);
  assert.equal(view.values['dual_ct_preview_power.b_p1'], null);
  assert.match(view.values['dual_ct_preview_net_status.b'], /90s/);
});

test('conflicting total suppresses a same-packet sum; a later complete consistent packet recovers', () => {
  const monitor = new DualCtMonitor(scope);
  monitor.observe(frame(bytes([[962, 1], [963, 2], [772, 3], [515, 900]])), topic, 1000);
  let view = monitor.snapshot(1000, text);
  assert.equal(view.values['dual_ct_preview_net.a'], null);
  assert.ok(view.values['dual_ct_preview_net_status.a'].includes(en.sum_mismatch));
  assert.equal(view.values['dual_ct_preview_total.a'], 900, 'reported raw total remains separate');
  monitor.observe(frame(bytes([[962, -4], [963, 2], [772, 2], [515, 0]])), topic, 2000);
  view = monitor.snapshot(2000, text);
  assert.equal(view.values['dual_ct_preview_net.a'], 0, 'genuine net zero is not missing');
});

test('foreign, duplicate-field and nonfinite packets cannot replace or renew a valid sum', () => {
  const monitor = new DualCtMonitor(scope); monitor.observe(frame(bytes(mixed)), topic, 1000);
  const valid = frame(bytes(mixed));
  assert.equal(monitor.observe(valid, topic.replace(scope.device, 'FOREIGN'), 2000), false);
  assert.equal(monitor.observe(frame(bytes([...mixed, [962, 999]])), topic, 3000), false);
  assert.equal(monitor.observe(frame(bytes([[962, NaN], [963, 2], [772, 3]])), topic, 4000), false);
  const view = monitor.snapshot(90000, text);
  assert.equal(view.values['dual_ct_preview_net.a'], -30);
  assert.match(view.values['dual_ct_preview_net_status.a'], /89s/);
  assert.equal(monitor.snapshot(91000, text).values['dual_ct_preview_net.a'], null);
});

test('exact sum expiry is independent of later phase-cache updates and resumption never restores stale sums', () => {
  const monitor = new DualCtMonitor(scope); monitor.observe(frame(bytes(mixed)), topic, 1000);
  monitor.observe(frame(scalar(956, 240)), topic, 80000);
  assert.equal(monitor.snapshot(90999, text).values['dual_ct_preview_net.a'], -30);
  assert.equal(monitor.snapshot(90999, text).nextExpiryMs, 1);
  assert.equal(monitor.snapshot(91000, text).values['dual_ct_preview_net.a'], null);
  monitor.observe(frame(scalar(962, 20)), topic, 92000);
  assert.equal(monitor.snapshot(92000, text).values['dual_ct_preview_net.a'], null);
  monitor.clear();
  assert.ok(Object.entries(monitor.snapshot(92001, text).values).filter(([id]) => /^dual_ct_preview_(power|net|voltage|current)\./.test(id)).every(([, value]) => value === null));
});

test('disconnect, scope replacement and clock rollback clear phase sums without crossing identities', () => {
  const adapter = new DualCtDevicePreview(scope); adapter.observe(scope, bytes(mixed), context(1000));
  assert.equal(adapter.snapshot(1000).banks[0].phaseSum.value, -30);
  assert.equal(adapter.observe({ ...scope, device: 'other' }, bytes(mixed), context(2000)), false);
  adapter.replaceScope({ ...scope, session: 'other' });
  assert.equal(adapter.snapshot(2000).banks[0].phaseSum.value, null);
  adapter.observe({ ...scope, session: 'other' }, bytes(mixed), context(3000));
  adapter.snapshot(2999);
  assert.equal(adapter.snapshot(3001).banks[0].phaseSum.value, null);
});

test('circuit descriptions are allowlisted display-only assertions, not solar, grid-source or sign mapping adoption', () => {
  for (const invalid of [null, undefined, {}, 'CT1', '<script>', 'solar', 421]) assert.equal(dualCtCircuitRole(invalid), 'unknown');
  const monitor = new DualCtMonitor(scope); monitor.observe(frame(bytes(mixed)), topic, 1000);
  const before = monitor.snapshot(1000, text);
  const view = monitor.snapshot(1000, text, { aRole: 'grid', bRole: 'hybrid_inverter' });
  for (const [id, value] of Object.entries(before.values)) if (!id.startsWith('dual_ct_preview_net_status.')) assert.equal(view.values[id], value);
  assert.ok(view.values['dual_ct_preview_net_status.b'].includes(en.role_hybrid_inverter));
  assert.ok(view.values['dual_ct_preview_net_status.a'].includes(en.role_grid));
  for (const id of ['ct1_role', 'ct2_role']) {
    const setting = manifest.settings.find(row => row.id === id);
    assert.equal(setting.value, 'unknown');
    assert.deepEqual(setting.values.map(row => row.id), ['unknown', 'grid', 'hybrid_inverter', 'solar_inverter', 'load']);
    for (const language of ['en', 'de', 'nl']) assert.ok(setting.hint[language]);
  }
  assert.equal(verifiedDualCtContract({ productType: 421, role: 'grid', directionVerified: true }), null);
  assert.equal(dualCtReleaseReadiness().contributesToEnergy, false);
  assert.equal(manifest.energy, undefined); assert.equal(manifest.flow, undefined);
});

test('localised sum status distinguishes unconfigured, mixed-generation hybrid circuit and stale receipts without unit/counter adoption', () => {
  for (const language of ['en', 'de', 'nl']) {
    const locale = require(`../locales/${language}.json`).dual_ct_preview;
    const monitor = new DualCtMonitor(scope); monitor.observe(frame(bytes(mixed)), topic, 1000);
    const translate = key => locale[key] || key;
    assert.ok(monitor.snapshot(1000, translate).values['dual_ct_preview_net_status.a'].includes(locale.role_unknown));
    const view = monitor.snapshot(1000, translate, { aRole: 'grid', bRole: 'hybrid_inverter' });
    assert.ok(view.values['dual_ct_preview_net_status.b'].includes(locale.role_hybrid_inverter));
    assert.equal(view.values['dual_ct_preview_net.b'], -75);
    assert.equal(view.values.dual_ct_preview_counters, locale.missing_stale);
    assert.ok(monitor.snapshot(91000, translate).values['dual_ct_preview_net_status.a'].includes(locale.sum_stale));
  }
});

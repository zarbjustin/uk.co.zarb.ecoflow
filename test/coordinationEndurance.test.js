'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CoordinationWorkspace } = require('../.homeybuild/lib/coordinationWorkspace');
const { CoordinationFlowMonitor } = require('../.homeybuild/lib/coordinationFlowMonitor');

function simulation() {
  let now = Date.parse('2026-10-24T23:00:00Z'), id = 0, opens = 0, closes = 0, fail = false, reads = 0;
  const timers = new Map();
  const clock = { now: () => now,
    set(fn, ms) { timers.set(++id, { at: now + ms, fn }); return id; }, clear(handle) { timers.delete(handle); } };
  const row = (deviceId, capabilityId, unit, positiveMeans, driverId) => ({ deviceId, capabilityId, unit, positiveMeans, driverId });
  const make = (streamDriver) => ({ schemaVersion: 1, siteKey: 'synthetic-site', reviewed: true, secondaryRole: 'none', sources: {
    grid: row('grid', 'measure_power', 'W', 'import', 'synthetic:p1'),
    externalSoc: row('external', 'measure_battery', '%', 'soc', 'synthetic:external'),
    externalPower: row('external', 'measure_power', 'kW', 'discharging', 'synthetic:external'),
    streamPower: row('stream', 'measure_power', 'W', 'charging', streamDriver),
  } });
  let bindings = make('homey:app:uk.co.zarb.ecoflow:stream');
  const cap = (units, value) => ({ units, value, type: 'number', getable: true, lastUpdated: new Date(now).toISOString() });
  const data = () => ({
    grid: { id: 'grid', available: true, driverId: 'synthetic:p1', capabilitiesObj: { measure_power: cap('W', -500) } },
    external: { id: 'external', available: true, driverId: 'synthetic:external', capabilitiesObj: { measure_battery: cap('%', 98), measure_power: cap('kW', 0) } },
    stream: { id: 'stream', available: true, driverId: bindings.sources.streamPower.driverId, capabilitiesObj: { measure_power: cap('W', 0) } },
    preview: { id: 'preview', available: true, driverId: 'homey:app:uk.co.zarb.ecoflow:smartmeter_dual_ct_preview', capabilitiesObj: {} },
  });
  const factory = async () => { opens++; let closed = false; return {
    list: async () => data(), read: async key => { reads++; assert.notEqual(key, 'preview'); if (fail) throw new Error('synthetic'); return data()[key]; },
    close() { assert.equal(closed, false, 'reader closed exactly once'); closed = true; closes++; },
  }; };
  const acks = { noManualOverride: true, noCompetingController: true, otherSourcesReviewed: true };
  const events = [];
  const monitor = new CoordinationFlowMonitor(factory, (event, tokens) => events.push({ event, tokens }), clock);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const advance = async ms => {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
      assert(timers.size <= 3, 'bounded timers across page and monitor');
    } now = end; await flush();
  };
  return { clock, timers, monitor, events, factory, acks, advance,
    setup() { return { flowConsent: true, acknowledgements: acks, bindings }; },
    profile(driver) { bindings = make(driver); }, fail(value) { fail = value; },
    get bindings() { return bindings; }, get counts() { return { opens, closes, reads }; } };
}

test('48-hour synthetic original/5000 observation replay expires each lease, survives gaps and bounds resources', async () => {
  const h = simulation();
  for (let session = 0; session < 96; session++) {
    h.profile(session % 2 ? 'homey:app:uk.co.zarb.ecoflow:stream_5000_system' : 'homey:app:uk.co.zarb.ecoflow:stream');
    assert.equal(h.monitor.status().active, false); const before = h.counts.reads;
    h.monitor.start(h.setup()); await h.advance(60000);
    assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), true);
    h.fail(true); await h.advance(15000);
    assert.throws(() => h.monitor.condition('current'), /unavailable/);
    h.fail(false); await h.advance(15000);
    assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), false, 'reconnect cannot inherit dwell');
    await h.advance(1710000);
    assert.equal(h.monitor.status().active, false); assert.equal(h.timers.size, 0);
    assert(h.counts.reads > before); assert.equal(h.counts.opens, h.counts.closes);
    assert.equal(h.monitor.history.size, 0);
  }
  const after = h.counts; await h.advance(3600000); assert.deepEqual(h.counts, after, 'expiry cannot resume reads');
  assert(h.events.every(row => Object.values(row.tokens).every(value => typeof value === 'string')));
  assert.doesNotMatch(JSON.stringify(h.events), /synthetic|measure_power|5000|"value"/);
  h.monitor.shutdown(); assert.equal(h.timers.size, 0);
});

test('100 page start/read/revoke cycles cannot activate a monitor or retain timers/readers', async () => {
  const h = simulation(); const page = new CoordinationWorkspace(h.factory, h.clock.now, h.clock);
  for (let cycle = 0; cycle < 100; cycle++) {
    const opening = await page.request({ action: 'open', clientId: 'synthetic-page', consent: true });
    const value = await page.request({ action: 'evaluate', token: opening.token, consent: true, bindings: h.bindings, acknowledgements: h.acks });
    assert.equal(value.controlsEnabled, false); assert.equal(value.contributesToEnergy, false);
    await page.request({ action: 'revoke', token: opening.token });
    assert.equal(h.monitor.status().active, false); assert.equal(h.events.length, 0);
    assert.equal(h.counts.opens, h.counts.closes); assert.equal(h.timers.size, 0);
  }
  page.stop(); h.monitor.shutdown();
});

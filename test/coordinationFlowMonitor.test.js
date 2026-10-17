'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CoordinationFlowMonitor } = require('../.homeybuild/lib/coordinationFlowMonitor');

function setup() {
  const row = (deviceId, capabilityId, unit, positiveMeans) => ({ deviceId, driverId: 'synthetic:driver', capabilityId, unit, positiveMeans });
  return { flowConsent: true, policy: { startSoc: 98, stopSoc: 97 },
    acknowledgements: { noManualOverride: true, noCompetingController: true, otherSourcesReviewed: true },
    bindings: { schemaVersion: 1, siteKey: 'synthetic-site', reviewed: true, secondaryRole: 'solar_inverter', sources: {
      grid: row('grid', 'power', 'W', 'import'), externalSoc: row('external', 'soc', '%', 'soc'),
      externalPower: row('external', 'power', 'kW', 'charging'), streamPower: row('stream', 'power', 'W', 'charging'),
      secondary: row('solar', 'power', 'W', 'to_house'),
    } } };
}
function harness() {
  let now = 100000, nextId = 0, opens = 0, closes = 0, reject = false;
  let modify = () => {};
  const timers = new Map(), events = [], reads = [];
  const clock = { now: () => now,
    set(fn, ms) { const id = ++nextId; timers.set(id, { at: now + ms, fn }); return id; },
    clear(id) { timers.delete(id); } };
  const cap = (units, value) => ({ units, value, type: 'number', getable: true, lastUpdated: new Date(now).toISOString() });
  const data = () => {
    const value = {
      grid: { id: 'grid', available: true, driverId: 'synthetic:driver', capabilitiesObj: { power: cap('W', -500) } },
      external: { id: 'external', available: true, driverId: 'synthetic:driver', capabilitiesObj: { soc: cap('%', 98), power: cap('kW', 0) } },
      stream: { id: 'stream', available: true, driverId: 'synthetic:driver', capabilitiesObj: { power: cap('W', 0) } },
      solar: { id: 'solar', available: true, driverId: 'synthetic:driver', capabilitiesObj: { power: cap('W', 1000) } },
    }; modify(value); return value;
  };
  const reader = () => ({ list: async () => assert.fail('monitor must not enumerate'),
    read: async id => { reads.push(id); if (reject) throw new Error('PRIVATE_TOKEN'); return data()[id]; },
    close() { closes++; } });
  const monitor = new CoordinationFlowMonitor(async () => { opens++; return reader(); }, (event, tokens) => events.push({ event, tokens }), clock);
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  const advance = async ms => {
    const end = now + ms;
    for (;;) {
      const earliest = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!earliest) break;
      timers.delete(earliest[0]); now = earliest[1].at; earliest[1].fn(); await flush();
    }
    now = end; await flush();
  };
  return { monitor, clock, timers, events, reads, flush, advance, reader,
    modify(fn) { modify = fn; }, reject(value) { reject = value; }, now(value) { now = value; },
    get opens() { return opens; }, get closes() { return closes; } };
}

test('Flow monitor is inert until separate valid opt-in; page consent and persisted metadata cannot start it', async () => {
  const h = harness(); assert.equal(h.monitor.status().active, false); assert.equal(h.opens, 0);
  assert.throws(() => h.monitor.condition('current'), /unavailable/);
  for (const mutate of [s => { s.flowConsent = false; }, s => { delete s.flowConsent; },
    s => { s.acknowledgements.noCompetingController = false; }, s => { s.bindings.reviewed = false; },
    s => { s.policy.stopSoc = 99; }]) {
    const s = setup(); mutate(s); assert.throws(() => h.monitor.start(s), /invalid_setup/);
  }
  await h.advance(60000); assert.equal(h.opens, 0); assert.equal(h.reads.length, 0); assert.equal(h.events.length, 0);
  h.now(NaN); assert.throws(() => h.monitor.start(setup()), /invalid_clock/);
  assert.equal(h.monitor.status().active, false); assert.equal(h.timers.size, 0);
});

test('Dual CT candidate-only preview cannot be promoted to Flow automation by selecting it in a binding', () => {
  const h = harness();
  for (const change of [s => { s.bindings.sources.grid.driverId = 'homey:app:uk.co.zarb.ecoflow:smartmeter_dual_ct_preview'; },
    s => { s.bindings.sources.secondary.capabilityId = 'dual_ct_preview_power.ct2'; }]) {
    const s = setup(); change(s); assert.throws(() => h.monitor.start(s), /unverified_preview_source/);
    assert.equal(h.monitor.status().active, false); assert.equal(h.opens, 0);
  }
});

test('selected-device-only observations produce bounded numeric-free state/availability tokens and no commands', async () => {
  const h = harness(); h.monitor.start(setup()); await h.advance(0);
  assert.deepEqual(h.reads, ['grid', 'external', 'stream', 'solar']);
  assert.equal(h.monitor.condition('current'), true); assert.equal(h.monitor.condition('priority'), true);
  assert.equal(h.monitor.status().controlsEnabled, false); assert.equal(h.monitor.status().contributesToEnergy, false);
  assert.equal(h.monitor.status().commandWrites, 0);
  assert.doesNotMatch(JSON.stringify(h.monitor.status()), /synthetic-site|lastUpdated|"value"|capabilitiesObj/);
  assert(h.events.every(e => Object.values(e.tokens).every(v => typeof v === 'string')));
  assert.doesNotMatch(JSON.stringify(h.events), /synthetic|500|1000|98|PRIVATE/);
  await h.advance(60000); assert.equal(h.monitor.status().state, 'review_candidate');
  assert.equal(h.events.filter(e => e.tokens.state === 'review_candidate').length, 1);
  await h.advance(15000); assert.equal(h.events.filter(e => e.tokens.state === 'review_candidate').length, 1);
  h.monitor.shutdown();
});

test('sustained conditions use advancing observations and actual observed duration, not query count or age', async () => {
  const h = harness(); h.monitor.start(setup()); await h.advance(0);
  assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), false);
  await h.advance(45000);
  for (let i = 0; i < 100; i++) assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), false);
  h.now(159999); assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), false);
  h.now(145000); // clock deliberately restored before the next scheduled read; querying backwards fails closed.
  assert.throws(() => h.monitor.condition('current'), /unavailable/);
  h.monitor.start(setup()); await h.advance(60000);
  assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), true);
  h.modify(v => { v.grid.capabilitiesObj.power.value = 10; }); await h.advance(15000);
  assert.equal(h.monitor.condition('export', { watts: 100, seconds: 60 }), false); h.monitor.shutdown();
});

test('cached timestamps cannot establish sustained export or an advisory dwell', async () => {
  const h = harness(); const at = new Date(100000).toISOString();
  h.modify(v => Object.values(v).forEach(d => Object.values(d.capabilitiesObj).forEach(c => { c.lastUpdated = at; })));
  h.monitor.start(setup()); await h.advance(45000);
  assert.equal(h.monitor.condition('export', { watts: 100, seconds: 30 }), false);
  assert.notEqual(h.monitor.status().state, 'review_candidate');
  await h.advance(15000); assert.equal(h.monitor.status().readingsCurrent, false);
  for (const kind of ['current', 'priority', 'export', 'circuit']) assert.throws(() => h.monitor.condition(kind, { watts: 100, seconds: 1 }), /unavailable/);
  h.monitor.shutdown();
});

test('missing, stale, skewed, future and changed contracts reject conditions rather than returning invertible false', async () => {
  for (const mutate of [v => { v.grid.available = false; }, v => { v.external.capabilitiesObj.soc.value = null; },
    v => { v.grid.capabilitiesObj.power.lastUpdated = new Date(90000).toISOString(); },
    v => { v.grid.capabilitiesObj.power.lastUpdated = new Date(100001).toISOString(); },
    v => { v.stream.driverId = 'replacement'; }, v => { v.grid.capabilitiesObj.power.units = 'Wh'; }]) {
    const h = harness(); h.modify(mutate); h.monitor.start(setup()); await h.advance(0);
    assert.equal(h.monitor.status().readingsCurrent, false);
    assert.throws(() => !h.monitor.condition('current'), /unavailable/);
    assert.throws(() => !h.monitor.condition('export', { watts: 100, seconds: 1 }), /unavailable/);
    h.monitor.shutdown();
  }
});

test('priority uses configurable SOC hysteresis and vetoes both charging and discharging', async () => {
  const h = harness(); let soc = 97.5, power = 0;
  h.modify(v => { v.external.capabilitiesObj.soc.value = soc; v.external.capabilitiesObj.power.value = power; });
  h.monitor.start(setup()); await h.advance(0); assert.equal(h.monitor.condition('priority'), false);
  soc = 98; await h.advance(15000); assert.equal(h.monitor.condition('priority'), true);
  soc = 97.5; await h.advance(15000); assert.equal(h.monitor.condition('priority'), true);
  soc = 97; await h.advance(15000); assert.equal(h.monitor.condition('priority'), false);
  soc = 99; power = -0.2; await h.advance(15000); assert.equal(h.monitor.condition('priority'), false);
  power = 0.2; await h.advance(15000); assert.equal(h.monitor.condition('priority'), false);
  power = 0; await h.advance(15000); assert.equal(h.monitor.condition('priority'), true); h.monitor.shutdown();
});

test('branch condition enforces explicit role/direction and does not add hybrid watts to grid export', async () => {
  const h = harness(), s = setup(); s.bindings.secondaryRole = 'hybrid_inverter';
  h.modify(v => { v.grid.capabilitiesObj.power.value = 0; }); h.monitor.start(s); await h.advance(30000);
  assert.equal(h.monitor.condition('circuit', { role: 'hybrid_inverter', direction: 'to_house', watts: 100, seconds: 30 }), true);
  assert.equal(h.monitor.condition('circuit', { role: 'hybrid_inverter', direction: 'from_house', watts: 100, seconds: 30 }), false);
  assert.throws(() => h.monitor.condition('circuit', { role: 'solar_inverter', direction: 'to_house', watts: 100, seconds: 30 }), /scope/);
  assert.equal(h.monitor.condition('export', { watts: 100, seconds: 1 }), false);
  for (const args of [{ watts: '100', seconds: 30 }, { watts: 100, seconds: 0 }, { watts: 100, seconds: Infinity }]) {
    assert.throws(() => h.monitor.condition('export', args), /threshold/);
  }
  h.monitor.shutdown();
});

test('read failures revoke the reader, reset continuity and recover only from a new connection', async () => {
  const h = harness(); h.monitor.start(setup()); await h.advance(60000);
  h.reject(true); await h.advance(15000); assert.equal(h.closes, 1);
  assert.equal(h.monitor.status().reason, 'read_failed'); assert.throws(() => h.monitor.condition('current'), /unavailable/);
  h.reject(false); await h.advance(15000); assert.equal(h.opens, 2); assert.equal(h.monitor.status().state, 'waiting');
  assert.equal(h.monitor.condition('export', { watts: 100, seconds: 30 }), false);
  assert.equal(h.events.filter(e => e.tokens.availability === 'unavailable').length, 1);
  assert.equal(h.events.filter(e => e.tokens.availability === 'available').length, 2);
  assert.doesNotMatch(JSON.stringify(h.events), /PRIVATE/); h.monitor.shutdown();
});

test('late results cannot revive a stopped session or leave observation timers alive', async () => {
  const h = harness(); let finish, calls = 0;
  const monitor = new CoordinationFlowMonitor(async () => ({ read: async id => { calls++;
    if (calls > 4) return new Promise(resolve => { finish = resolve; });
    return h.reader().read(id);
  }, close() {} }), () => {}, h.clock);
  monitor.start(setup()); await h.advance(0); assert.equal(monitor.condition('current'), true);
  await h.advance(15000); monitor.stop(); finish({}); await h.flush();
  assert.equal(monitor.status().active, false); assert.throws(() => monitor.condition('current'), /unavailable/);
  assert.equal(h.timers.size, 0);
});

test('timeout and pending factory cancellation close late readers without leaking or overlapping sessions', async () => {
  const h = harness(); let finish, closes = 0, factories = 0;
  const monitor = new CoordinationFlowMonitor(() => { factories++; return new Promise(resolve => { finish = resolve; }); }, () => {}, h.clock);
  monitor.start(setup()); await h.advance(0); await h.advance(10000);
  assert.equal(monitor.status().reason, 'read_timeout'); assert.equal(factories, 1);
  finish({ close() { closes++; } }); await h.flush(); assert.equal(closes, 1);
  await h.advance(15000); assert.equal(factories, 2);
  monitor.shutdown(); finish({ close() { closes++; } }); await h.flush();
  assert.equal(closes, 2); assert.equal(h.timers.size, 0);
});

test('source/review changes, lease expiry, clock rollback and app restart discard observation history', async () => {
  const h = harness(); h.monitor.start(setup()); await h.advance(60000);
  const changed = setup(); changed.bindings.siteKey = 'other-site'; h.monitor.start(changed); await h.advance(0);
  assert.equal(h.monitor.status().state, 'waiting'); assert.equal(h.monitor.condition('export', { watts: 100, seconds: 30 }), false);
  await h.advance(1800000); assert.equal(h.monitor.status().active, false); assert.equal(h.monitor.status().reason, 'monitor_expired');
  assert.equal(h.timers.size, 0); h.monitor.start(setup()); await h.advance(0);
  h.now(1); assert.throws(() => h.monitor.condition('current'), /unavailable/); assert.equal(h.timers.size, 0);
  h.monitor.shutdown(); assert.throws(() => h.monitor.start(setup()), /invalid_setup/);
  assert.equal(harness().monitor.status().active, false);
});

test('Flow event failures cannot corrupt observations; repeated steady state does not create a trigger storm', async () => {
  const h = harness(); let attempts = 0;
  const monitor = new CoordinationFlowMonitor(async () => h.reader(), () => { attempts++; throw new Error('synthetic flow failed'); }, h.clock);
  monitor.start(setup()); await h.advance(60000); assert.equal(monitor.condition('current'), true);
  const before = attempts; await h.advance(60000); assert.equal(attempts, before); monitor.shutdown();
});

test('revocation during event delivery cannot deliver a later recovery event or recreate a timer', async () => {
  const h = harness(); const events = []; let monitor;
  monitor = new CoordinationFlowMonitor(async () => h.reader(), event => { events.push(event); monitor.stop(); }, h.clock);
  monitor.start(setup()); await h.advance(0);
  assert.deepEqual(events, ['coordination_assessment_changed']);
  assert.equal(monitor.status().active, false); assert.equal(h.timers.size, 0);
});

test('observation cards have localized stable IDs, no action cards and no activation/migration path', () => {
  for (const [kind, ids] of Object.entries({ triggers: ['coordination_assessment_changed', 'coordination_readings_changed'],
    conditions: ['coordination_readings_current', 'coordination_external_priority', 'coordination_grid_export_sustained', 'coordination_circuit_power_sustained'] })) {
    for (const id of ids) {
      const card = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.homeycompose', 'flow', kind, id + '.json')));
      assert.equal(card.id, id); for (const lang of ['en', 'de', 'nl']) assert(card.title[lang]);
      assert(!card.args?.some(arg => arg.type === 'device'), 'one explicit installation session, not a per-unit controller');
      assert.equal(fs.existsSync(path.join(__dirname, '..', '.homeycompose', 'flow', 'actions', id + '.json')), false);
    }
  }
});

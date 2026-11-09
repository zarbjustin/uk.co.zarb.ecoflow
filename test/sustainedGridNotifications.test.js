'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SustainedGridRule, QualifiedGridNotifications, gridNotificationKey, gridNotificationMatches,
} = require('../.homeybuild/lib/sustainedGridNotifications');

const args = { direction: 'export', watts: 500, seconds: 3, hysteresis: 100, cooldown: 10 };
const sample = (receivedAt, powerW = -600, generation = 1) => ({
  receivedAt, powerW, generation, validUntil: receivedAt + 5000,
});
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('below rule uses fresh directed magnitude with strict entry and upper rearm', () => {
  const rule = new SustainedGridRule({ ...args, seconds: 1, cooldown: 0 }, true);
  const observe = (at, power) => rule.observe(sample(at, power), at);
  assert.equal(observe(1000, -500), false);
  assert.equal(observe(2000, -500), false, 'equality never completes dwell');
  assert.equal(observe(3000, 0), false);
  assert.equal(observe(4000, 120), true, 'fresh opposite direction is zero export');
  assert.equal(observe(5000, -599), false);
  assert.equal(observe(6000, -20), false);
  assert.equal(observe(7000, -20), false, 'the hysteresis band must not rearm');
  assert.equal(observe(8000, -600), false);
  assert.equal(observe(9000, -20), false);
  assert.equal(observe(10000, -20), true);
});

test('below dwell cannot complete on a cached, missing or expired zero', () => {
  const rule = new SustainedGridRule({ ...args, seconds: 3, cooldown: 0 }, true);
  const zero = sample(1000, 0);
  assert.equal(rule.observe(zero, 1000), false);
  assert.equal(rule.observe(zero, 4000), false, 'cached reading cannot complete dwell');
  assert.equal(rule.observe(zero, 6000), false, 'exact expiry resets dwell');
  assert.equal(rule.observe(sample(7000, 0), 7000), false);
  assert.equal(rule.observe(null, 8000), false);
  assert.equal(rule.observe(sample(10000, 0), 10000), false, 'missing reading restarts the wait');
  assert.equal(rule.observe(sample(13000, 0), 13000), true);
});
function harness(ports) {
  let current = { observation: null, now: 0 };
  const monitor = new QualifiedGridNotifications({ ...ports, readCurrent: () => current });
  return {
    monitor,
    tick(observation, now) { current = { observation, now }; monitor.tick(observation, now); },
    setCurrent(observation, now) { current = { observation, now }; },
  };
}

test('sustained direction requires advancing receipts and emits once, not cached dwell', () => {
  for (const direction of ['import', 'export']) {
    const rule = new SustainedGridRule({ ...args, direction });
    const value = direction === 'export' ? -600 : 600;
    assert.equal(rule.observe(sample(1000, value), 1000), false);
    assert.equal(rule.observe(sample(1000, value), 3998), false);
    assert.equal(rule.observe(sample(3999, value), 3999), false);
    assert.equal(rule.observe(sample(4000, value), 4000), true);
    assert.equal(rule.observe(sample(7000, value), 7000), false);
  }
});

test('strict entry, hysteresis equality, zero and opposite direction have defined semantics', () => {
  const rule = new SustainedGridRule({ ...args, cooldown: 0 });
  assert.equal(rule.observe(sample(1000, -500), 1000), false);
  assert.equal(rule.observe(sample(2000), 2000), false);
  assert.equal(rule.observe(sample(4000, -450), 4000), false);
  assert.equal(rule.observe(sample(5000, -450), 5000), false);
  assert.equal(rule.observe(sample(6000), 6000), false);
  assert.equal(rule.observe(sample(9000), 9000), true);
  assert.equal(rule.observe(sample(10000, -450), 10000), false);
  assert.equal(rule.observe(sample(11000), 11000), false);
  assert.equal(rule.observe(sample(12000, -400), 12000), false);
  assert.equal(rule.observe(sample(13000, 0), 13000), false);
  assert.equal(rule.observe(sample(14000, 600), 14000), false);
  assert.equal(rule.observe(sample(15000), 15000), false);
  assert.equal(rule.observe(sample(18000), 18000), true);
});

test('power must remain strictly above the entry threshold throughout dwell, not merely its hysteresis band', () => {
  const rule = new SustainedGridRule({ ...args, cooldown: 0 });
  rule.observe(sample(1000), 1000);
  assert.equal(rule.observe(sample(4000, -450), 4000), false);
  assert.equal(rule.observe(sample(5000), 5000), false);
  assert.equal(rule.observe(sample(8000), 8000), true);
});

test('expiry, missing source, generation and rollback restart dwell but preserve cooldown', () => {
  for (const gap of ['expiry', 'missing', 'generation', 'rollback']) {
    const rule = new SustainedGridRule(args);
    rule.observe(sample(1000), 1000);
    assert.equal(rule.observe(sample(4000), 4000), true);
    if (gap === 'expiry') rule.observe(sample(4000), 9000);
    else if (gap === 'missing') rule.observe(null, 5000);
    else if (gap === 'rollback') rule.observe(sample(2000), 2000);
    const generation = gap === 'generation' ? 2 : 1;
    assert.equal(rule.observe(sample(10000, -600, generation), 10000), false);
    assert.equal(rule.observe(sample(13000, -600, generation), 13000), false);
    assert.equal(rule.observe(sample(14000, -600, generation), 14000), true);
  }
});

test('exact missing-observation gap cannot infer coverage across its expired deadline', () => {
  const rule = new SustainedGridRule({ ...args, seconds: 6 });
  rule.observe(sample(1000), 1000);
  assert.equal(rule.observe(sample(6000), 6000), false);
  assert.equal(rule.observe(sample(9000), 9000), false);
  assert.equal(rule.observe(sample(12000), 12000), true);
});

test('saved arguments filter other rules and malformed events fail closed', () => {
  assert.equal(gridNotificationMatches(args, { ruleKey: gridNotificationKey(args) }), true);
  assert.equal(gridNotificationMatches({ ...args, seconds: 4 }, { ruleKey: gridNotificationKey(args) }), false);
  assert.equal(gridNotificationMatches({ ...args, hysteresis: 501 }, { ruleKey: 'anything' }), false);
  assert.equal(gridNotificationMatches(args, null), false);
});

test('duplicate Flow rules coalesce, loaded changes reset dwell, cooldown survives unchanged rules', async () => {
  const events = [];
  const { monitor, tick } = harness({
    loadRules: async () => [args, args],
    trigger: async (tokens, state) => events.push({ tokens, state }),
    onError: () => assert.fail('unexpected rule failure'),
  });
  monitor.start(); await flush();
  tick(sample(1000), 1000); tick(sample(4000), 4000); await flush();
  assert.equal(events.length, 1); assert.equal(events[0].tokens.power, 600);
  monitor.reload(); await flush();
  tick(sample(5000), 5000); tick(sample(8000), 8000); await flush();
  assert.equal(events.length, 1);
  tick(sample(11000), 11000); tick(sample(14000), 14000); await flush();
  assert.equal(events.length, 2);
  monitor.stop(); tick(sample(18000), 18000); await flush();
  assert.equal(events.length, 2);
});

test('hung metadata and trigger calls retain one owned slot and never gate source ticks', async () => {
  let release; let reads = 0; let sends = 0;
  const { monitor, tick } = harness({
    loadRules: () => { reads++; return new Promise((resolve) => { release = resolve; }); },
    trigger: () => { sends++; return new Promise(() => {}); },
    onError: () => assert.fail('unexpected failure'),
  });
  monitor.start(); await flush();
  for (let i = 0; i < 100; i++) { monitor.reload(); tick(sample(1000 + i), 1000 + i); }
  assert.equal(reads, 1); assert.equal(sends, 0);
  release([args]); await flush();
  assert.equal(reads, 2);
  release([args]); await flush();
  tick(sample(1000), 1000); tick(sample(4000), 4000); await flush();
  assert.equal(sends, 1);
  for (let at = 5000; at < 100000; at += 1000) {
    tick(sample(at, at % 5000 === 0 ? 0 : -600), at);
  }
  await flush(); assert.equal(sends, 1); monitor.stop();
});

test('queued events recheck source, expiry, rule changes and teardown before SDK dispatch', async () => {
  for (const change of ['stop', 'rule', 'missing', 'expired', 'new_receipt']) {
    let events = 0;
    const { monitor, tick, setCurrent } = harness({
      loadRules: async () => [args], trigger: async () => { events++; }, onError: () => {},
    });
    monitor.start(); await flush();
    tick(sample(1000), 1000); tick(sample(4000), 4000);
    if (change === 'stop') monitor.stop();
    else if (change === 'rule') monitor.reload();
    else if (change === 'missing') setCurrent(null, 4000);
    else if (change === 'expired') setCurrent(sample(4000), 9000);
    else setCurrent(sample(4001), 4001);
    await flush(); assert.equal(events, 0); monitor.stop();
  }
});

test('cancelled notification reservation does not consume the still-continuous excursion or cooldown', async () => {
  let events = 0;
  const { monitor, tick, setCurrent } = harness({
    loadRules: async () => [args], trigger: async () => { events++; }, onError: () => {},
  });
  monitor.start(); await flush();
  tick(sample(1000), 1000); tick(sample(4000), 4000);
  setCurrent(sample(4001), 4001); await flush(); assert.equal(events, 0);
  tick(sample(5000), 5000); await flush(); assert.equal(events, 1);
  tick(sample(8000), 8000); await flush(); assert.equal(events, 1); monitor.stop();
});

test('a fresh cached recovery receipt cannot backdate dwell across an unknown interval', () => {
  const rule = new SustainedGridRule({ ...args, cooldown: 0 });
  rule.observe(sample(1000), 1000); rule.observe(null, 4000);
  assert.equal(rule.observe(sample(4000), 7000), false);
  assert.equal(rule.observe(sample(7001), 7001), false);
  assert.equal(rule.observe(sample(10000), 10000), true);
});

test('late SDK qualification after the preceding deadline cannot bridge an unseen expiry', () => {
  const rule = new SustainedGridRule({ ...args, cooldown: 0 });
  rule.observe(sample(1000), 1000);
  assert.equal(rule.observe(sample(5000), 7000), false);
  assert.equal(rule.observe(sample(8000), 8000), false);
  assert.equal(rule.observe(sample(10000), 10000), true);
});

test('failure after actual SDK notification dispatch is not automatically replayed', async () => {
  let events = 0; let errors = 0;
  const { monitor, tick } = harness({
    loadRules: async () => [args],
    trigger: async () => { events++; throw new Error('synthetic SDK rejection'); },
    onError: () => { errors++; },
  });
  monitor.start(); await flush();
  tick(sample(1000), 1000); tick(sample(4000), 4000); await flush();
  for (let at = 5000; at < 30000; at += 3000) tick(sample(at), at);
  await flush(); assert.equal(events, 1); assert.equal(errors, 1); monitor.stop();
});

test('an old reservation cannot commit after unknown recovery reuses its still-fresh receipt', async () => {
  let events = 0;
  const { monitor, tick } = harness({
    loadRules: async () => [args], trigger: async () => { events++; }, onError: () => {},
  });
  monitor.start(); await flush();
  tick(sample(1000), 1000); tick(sample(4000), 4000);
  tick(null, 4000); tick(sample(4000), 4000); await flush();
  assert.equal(events, 0);
  tick(sample(7000), 7000); await flush(); assert.equal(events, 1); monitor.stop();
});

test('unknown source observed during queued dispatch breaks continuity even without an extra ticker', async () => {
  let events = 0;
  const { monitor, tick, setCurrent } = harness({
    loadRules: async () => [args], trigger: async () => { events++; }, onError: () => {},
  });
  monitor.start(); await flush();
  tick(sample(1000), 1000); tick(sample(4000), 4000);
  setCurrent(null, 4000); await flush(); assert.equal(events, 0);
  tick(sample(5000), 5000); await flush(); assert.equal(events, 0);
  tick(sample(8000), 8000); await flush(); assert.equal(events, 1); monitor.stop();
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { streamCoordinationPreview: preview } = require('../.homeybuild/lib/streamCoordinationPreview');
const api = require('../.homeybuild/api');
const manifest = require('../.homeycompose/app.json');

function input(now = 100000, soc = 98, byd = 0, stream = 0) {
  return { now, manualOverride: false, controllerConflict: false,
    bydSoc: { value: soc, at: now }, bydBatteryW: { value: byd, at: now }, streamBatteryW: { value: stream, at: now } };
}

test('runtime advisory requires dwell, holds hysteresis, and resets below stop SOC', () => {
  const waiting = preview(input());
  assert.equal(waiting.state, 'waiting');
  const candidate = preview(input(160000), waiting);
  assert.equal(candidate.state, 'review_candidate');
  assert.equal(preview(input(161000, 97.5), candidate).state, 'review_candidate');
  assert.equal(preview(input(162000, 97), candidate).state, 'waiting');
  assert.equal(candidate.controlsEnabled, false);
  assert.equal(candidate.commandWrites, 0);
});

test('a previous candidate cannot override missing, stale, future or conflicting inputs', () => {
  const previous = { state: 'review_candidate', lastTransitionAt: 100000, password: 'PRIVATE' };
  const cases = [null, {}, { ...input(), manualOverride: true }, { ...input(), controllerConflict: undefined },
    { ...input(), bydSoc: { value: 98, at: 39999 } }, { ...input(), bydSoc: { value: 98, at: 100001 } },
    { ...input(), bydSoc: { value: Infinity, at: 100000 } }, input(100000, 101), input(100000, 98, -30, 30),
    input(100000, 98, 30, -30), input(100000, 98, -30, 0)];
  for (const value of cases) {
    const result = preview(value, previous);
    assert.equal(result.state, 'blocked');
    assert.equal(result.commandWrites, 0);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('policy bounds and invalid prior clocks fail closed', () => {
  for (const policy of [null, [], { startSoc: 101 }, { stopSoc: 98 }, { maxAgeMs: Infinity },
    { maxAgeMs: 999 }, { dwellMs: 86400001 }, { powerDeadbandW: 10001 }, { startSoc: '98' }]) {
    assert.equal(preview(input(), {}, policy).reason, 'invalid_policy');
  }
  for (const prior of [null, [], { lastTransitionAt: Infinity }, { lastTransitionAt: 100001 }]) {
    assert.equal(preview(input(), prior).state, 'blocked');
  }
});

test('preview endpoint never accesses Homey or returns supplied secrets', async () => {
  assert.deepEqual(manifest.api.coordinationPreview, { method: 'POST', path: '/coordination-preview' });
  const homey = new Proxy({}, { get() { throw new Error('Homey must not be accessed'); } });
  const result = await api.coordinationPreview({ homey, body: { input: { ...input(Date.now()), token: 'PRIVATE' },
    previous: { secret: 'PRIVATE' }, policy: { password: 'PRIVATE' } } });
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.state, 'waiting');
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal((await api.coordinationPreview({ homey, body: null })).state, 'blocked');
});

test('endpoint clock cannot be overridden to revive stale readings', async () => {
  const result = await api.coordinationPreview({ body: { input: input(100000) } });
  assert.equal(result.reason, 'missing_or_stale_input');
});

test('cooldown is independent of dwell and blocking resets the candidate timer', () => {
  const policy = { dwellMs: 1000, cooldownMs: 10000 };
  const waiting = preview(input(), {}, policy);
  assert.equal(preview(input(102000), waiting, policy).state, 'waiting');
  assert.equal(preview(input(110000), waiting, policy).state, 'review_candidate');
  const blocked = preview({ ...input(110001), manualOverride: true }, waiting, policy);
  assert.equal(preview(input(120001), blocked, policy).state, 'waiting');
});

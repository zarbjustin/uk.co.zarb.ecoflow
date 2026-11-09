'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const record = require('../docs/STREAM_5000_THEN_ACCEPTANCE.json');
const modulePromise = import('../scripts/check-stream-5000-then-acceptance.mjs');
const fingerprint = 'a'.repeat(64);
const clone = () => structuredClone(record);
function acceptedRecord() {
  const next = clone();
  for (const gate of next.gates) Object.assign(gate, {
    status: 'passed', evidence: 'candidate_hardware', candidateFingerprint: fingerprint,
    firmwareVersion: '1.2.3', observedAt: '2026-10-28T21:00:00Z',
    startedAt: gate.id.endsWith('.normal_use_soak') ? '2026-10-26T21:00:00Z' : null,
  });
  return next;
}

test('THEN readiness needs its own complete qualification, not monitoring or source evidence', async () => {
  const { assessThenAcceptance, validateThenAcceptance } = await modulePromise;
  for (const model of record.models) assert.equal(assessThenAcceptance(record, fingerprint, model).ready, false);
  for (const evidence of ['none', 'source_tests', 'installed_read_only']) {
    const next = acceptedRecord(); next.gates[0].evidence = evidence;
    assert.throws(() => validateThenAcceptance(next), /cannot qualify THEN hardware/);
  }
  const next = acceptedRecord(); next.scope = 'read_only_monitoring';
  assert.throws(() => validateThenAcceptance(next));
});

test('every native/provider/runtime gate is required even with successful ACK/readback elsewhere', async () => {
  const { assessThenAcceptance, validateThenAcceptance } = await modulePromise;
  for (const gate of record.gates.filter(g => g.id.startsWith('es21.'))) {
    const next = acceptedRecord();
    Object.assign(next.gates.find(g => g.id === gate.id), {
      status: 'partial', evidence: 'installed_read_only', candidateFingerprint: null,
      firmwareVersion: null, startedAt: null,
    });
    assert.equal(assessThenAcceptance(next, fingerprint, 'es21').ready, false, gate.id);
  }
  const next = acceptedRecord(); next.gates.pop();
  assert.throws(() => validateThenAcceptance(next), /Missing or extra/);
  const duplicate = acceptedRecord(); duplicate.gates[1].id = duplicate.gates[0].id;
  assert.throws(() => validateThenAcceptance(duplicate), /Unknown or duplicate/);
});

test('THEN acceptance is model, exact-candidate and consistent-firmware scoped', async () => {
  const { assessThenAcceptance, validateThenAcceptance } = await modulePromise;
  const next = acceptedRecord();
  assert.equal(assessThenAcceptance(next, fingerprint, 'es21').ready, true);
  assert.equal(assessThenAcceptance(next, 'b'.repeat(64), 'es21').ready, false);
  next.gates.find(g => g.id === 'es22.native_contract').candidateFingerprint = 'b'.repeat(64);
  assert.equal(assessThenAcceptance(next, fingerprint, 'es21').ready, true);
  assert.equal(assessThenAcceptance(next, fingerprint, 'es22').ready, false);
  next.gates[0].firmwareVersion = '1.2.4';
  assert.equal(assessThenAcceptance(next, fingerprint, 'es21').ready, false);
  next.gates[0].firmwareVersion = null;
  assert.throws(() => validateThenAcceptance(next), /firmware version/);
  const partial = clone(); partial.gates[0].candidateFingerprint = fingerprint;
  assert.throws(() => validateThenAcceptance(partial), /not candidate signoff/);
});

test('THEN soak requires 48 hours of real dated exact-runtime evidence, not eventual equality', async () => {
  const { validateThenAcceptance } = await modulePromise;
  const next = acceptedRecord();
  const soak = next.gates.find(g => g.id === 'es21.normal_use_soak');
  soak.startedAt = '2026-10-26T21:00:00.001Z';
  assert.throws(() => validateThenAcceptance(next), /at least 48 hours/);
  soak.startedAt = '2026-10-28T22:00:00Z';
  assert.throws(() => validateThenAcceptance(next), /at least 48 hours/);
  soak.startedAt = '2026-02-31T21:00:00Z';
  assert.throws(() => validateThenAcceptance(next), /real calendar time/);
  const future = acceptedRecord(); future.gates[0].observedAt = '2099-01-01T00:00:00Z';
  assert.throws(() => validateThenAcceptance(future), /Future evidence/);
  const partial = clone(); partial.gates[0].observedAt = 'synthetic-private-text';
  assert.throws(() => validateThenAcceptance(partial), /Invalid evidence timestamp/);
});

test('THEN ledger rejects widened scope and raw/private evidence instead of retaining it', async () => {
  const { validateThenAcceptance } = await modulePromise;
  for (const field of ['rawPayload', 'deviceName', 'accessKey', 'serialNumber']) {
    const next = clone(); next.gates[0][field] = 'synthetic';
    assert.throws(() => validateThenAcceptance(next), /Unexpected THEN acceptance field/);
  }
  const next = clone(); next.excluded.shift(); assert.throws(() => validateThenAcceptance(next));
  next.roles.push('system'); assert.throws(() => validateThenAcceptance(next));
});

test('THEN CLI narrowing cannot qualify system controls or another model', async () => {
  const { thenAcceptanceTargets } = await modulePromise;
  assert.deepEqual(thenAcceptanceTargets([]), ['es21', 'es22']);
  assert.deepEqual(thenAcceptanceTargets(['--model', 'es21', '--require-ready']), ['es21']);
  for (const args of [['--role', 'system'], ['--role', 'unit'], ['--model'], ['--model', 'es23'],
    ['--publish'], ['--model', 'es21', '--model', 'es22'], ['--require-ready', '--require-ready']]) {
    assert.throws(() => thenAcceptanceTargets(args));
  }
});

test('structural THEN check reports pending; physical readiness remains nonzero', () => {
  const script = path.resolve(__dirname, '../scripts/check-stream-5000-then-acceptance.mjs');
  for (const args of [[], ['--require-ready'], ['--model', 'es21', '--require-ready']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, args.length ? 1 : 0, result.stderr);
    assert.match(result.stdout, /es21\/unit\/reserve: PENDING/);
    if (args.includes('--model')) assert.doesNotMatch(result.stdout, /es22\/unit\/reserve/);
  }
});

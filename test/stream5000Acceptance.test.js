'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const record = require('../docs/STREAM_5000_MONITORING_ACCEPTANCE.json');
const root = path.resolve(__dirname, '..');
const fingerprint = 'a'.repeat(64);
const modulePromise = import('../scripts/check-stream-5000-acceptance.mjs');
const clone = () => structuredClone(record);
function acceptedRecord() {
  const next = clone();
  for (const gate of next.gates) Object.assign(gate, { status: 'passed', evidence: 'candidate_hardware',
    candidateFingerprint: fingerprint, observedAt: '2026-10-25T21:00:00Z' });
  return next;
}

test('acceptance record validates and an explicitly open gate cannot claim a release', async () => {
  const { assessAcceptance, validateAcceptance } = await modulePromise;
  validateAcceptance(record);
  const next = acceptedRecord();
  Object.assign(next.gates.find(g => g.id === 'native_upgrade'), {
    status: 'open', evidence: 'none', candidateFingerprint: null,
  });
  for (const model of record.models) for (const role of record.roles) {
    assert.equal(assessAcceptance(next, fingerprint, model, role).ready, false);
  }
});

test('an observed older Test build or community reading cannot pass candidate hardware acceptance', async () => {
  const { validateAcceptance } = await modulePromise;
  for (const evidence of ['installed_test', 'community', 'none']) {
    const next = acceptedRecord(); next.gates[0].evidence = evidence;
    assert.throws(() => validateAcceptance(next), /cannot pass hardware gates/);
  }
});

test('software test counts cannot be substituted for evidence, or remove required gates', async () => {
  const { validateAcceptance } = await modulePromise;
  const next = clone(); next.gates[0].evidence = 'unit_tests';
  assert.throws(() => validateAcceptance(next), /Invalid evidence type/);
  next.gates.pop(); assert.throws(() => validateAcceptance(next), /Missing or extra/);
});

test('duplicate gates, unknown models and arbitrary release roles fail closed', async () => {
  const { validateAcceptance, requiredAcceptanceGates } = await modulePromise;
  const next = clone(); next.gates[1].id = next.gates[0].id;
  assert.throws(() => validateAcceptance(next), /Unknown or duplicate/);
  assert.throws(() => requiredAcceptanceGates('es23', 'unit'), /Unsupported/);
  assert.throws(() => requiredAcceptanceGates('es21', 'gateway'), /Unsupported/);
});

test('acceptance is exact-candidate, model-specific and role-specific', async () => {
  const { assessAcceptance } = await modulePromise;
  const next = acceptedRecord();
  assert.equal(assessAcceptance(next, fingerprint, 'es21', 'system').ready, true);
  assert.equal(assessAcceptance(next, 'b'.repeat(64), 'es21', 'system').ready, false);
  Object.assign(next.gates.find(g => g.id === 'es22.charge'), { status: 'open', evidence: 'none', candidateFingerprint: null });
  assert.equal(assessAcceptance(next, fingerprint, 'es21', 'unit').ready, true);
  assert.equal(assessAcceptance(next, fingerprint, 'es22', 'unit').ready, false);
  Object.assign(next.gates.find(g => g.id === 'es21.energy_continuity'), { status: 'open', evidence: 'none', candidateFingerprint: null });
  assert.equal(assessAcceptance(next, fingerprint, 'es21', 'unit').ready, true);
  assert.equal(assessAcceptance(next, fingerprint, 'es21', 'system').ready, false);
});

test('passed evidence needs a timestamp and fingerprint, partial evidence is never a signoff', async () => {
  const { validateAcceptance } = await modulePromise;
  const next = acceptedRecord(); next.gates[0].candidateFingerprint = null;
  assert.throws(() => validateAcceptance(next), /exact candidate identity/);
  next.gates[0].candidateFingerprint = fingerprint; delete next.gates[0].observedAt;
  assert.throws(() => validateAcceptance(next));
  const partial = clone(); partial.gates[0].candidateFingerprint = fingerprint;
  assert.throws(() => validateAcceptance(partial), /Partial evidence/);
});

test('acceptance record cannot widen product or control scope and contains no raw evidence', async () => {
  const { validateAcceptance } = await modulePromise;
  const next = clone(); next.excluded.splice(0, 1); assert.throws(() => validateAcceptance(next));
  const prose = fs.readFileSync(path.join(root, 'docs/STREAM_5000_MONITORING_RC.md'), 'utf8');
  for (const gate of record.gates) {
    const anchor = gate.reference.split('#')[1];
    assert.ok(prose.split('\n').some(line => line.toLowerCase() === `## ${anchor.replaceAll('-', ' ')}`), anchor);
  }
  assert.doesNotMatch(JSON.stringify(record), /accessKey|secretKey|deviceName|serialNumber|rawPayload/);
});

test('unexpected raw or private evidence fields are rejected, not silently retained', async () => {
  const { validateAcceptance } = await modulePromise;
  for (const field of ['rawPayload', 'deviceName', 'accessKey', 'notes']) {
    const next = clone(); next.gates[0][field] = 'synthetic';
    assert.throws(() => validateAcceptance(next), /Unexpected acceptance field/);
  }
  const next = clone(); next.privateEvidence = {};
  assert.throws(() => validateAcceptance(next), /Unexpected acceptance field/);
});

test('monitoring candidate keeps physical and aggregate identities, read-only configuration and gated pairing', () => {
  const app = require('../app.json');
  const unit = app.drivers.find(d => d.id === 'stream_5000_unit');
  const system = app.drivers.find(d => d.id === 'stream_5000_system');
  assert.equal(unit.capabilities.includes('measure_power'), false);
  assert.equal(unit.capabilities.some(id => id.startsWith('meter_power.')), false);
  assert.equal(system.energy.homeBattery, true);
  assert.equal(unit.pair[0].id, 'connection_info');
  assert.equal(system.pair[0].id, 'energy_access');
  for (const driver of [unit, system]) {
    for (const id of Object.keys(app.capabilities).filter(id => id.startsWith('stream_5000_'))) {
      assert.equal(app.capabilities[id].setable, false, id);
    }
  }
  const modelsSource = fs.readFileSync(path.join(root, 'lib/stream5000Models.ts'), 'utf8');
  assert.doesNotMatch(modelsSource, /monitoringOnly:\s*false/);
  const runtime = fs.readFileSync(path.join(root, 'lib/Stream5000UnitDevice.ts'), 'utf8');
  assert.doesNotMatch(runtime, /registerCapabilityListener|registerMultipleCapabilityListener|\.setQuota\s*\(|\.publish\s*\(/);
});

test('runtime fingerprint is repeatable and derived from actual candidate contents', async () => {
  const { candidateFingerprint } = await modulePromise;
  assert.match(candidateFingerprint(root), /^[a-f0-9]{64}$/);
  assert.equal(candidateFingerprint(root), candidateFingerprint(root));
});

test('readiness command exit status agrees with exact-candidate hardware gates, independently of schema validity', async () => {
  const { candidateFingerprint, assessAcceptance } = await modulePromise;
  const identity = candidateFingerprint(root);
  const results = record.models.flatMap(model => record.roles.map(role => assessAcceptance(record, identity, model, role)));
  const script = path.join(root, 'scripts/check-stream-5000-acceptance.mjs');
  const report = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(report.status, 0, report.stderr);
  for (const result of results) assert.ok(report.stdout.includes(`${result.model}/${result.role}: ${result.ready ? 'ACCEPTED' : 'PENDING'}`));
  const ready = spawnSync(process.execPath, [script, '--require-ready'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(ready.status, results.every(result => result.ready) ? 0 : 1, ready.stderr);
});

test('monitoring readiness selects exact models/roles without waiving unit gates or admitting Energy', async () => {
  const { acceptanceTargets, assessAcceptance } = await modulePromise;
  assert.deepEqual(acceptanceTargets(['--role', 'unit', '--require-ready']), [
    { model: 'es21', role: 'unit' }, { model: 'es22', role: 'unit' },
  ]);
  assert.deepEqual(acceptanceTargets(['--model', 'es21', '--role', 'unit']), [{ model: 'es21', role: 'unit' }]);
  assert.equal(acceptanceTargets([]).length, 4);
  const next = acceptedRecord();
  for (const id of ['es21.system_scope', 'es21.energy_continuity', 'es22.charge']) {
    Object.assign(next.gates.find(g => g.id === id), { status: 'open', evidence: 'none', candidateFingerprint: null });
  }
  assert.equal(assessAcceptance(next, fingerprint, 'es21', 'unit').ready, true);
  assert.equal(assessAcceptance(next, fingerprint, 'es21', 'system').ready, false);
  assert.equal(assessAcceptance(next, fingerprint, 'es22', 'unit').ready, false);
  for (const args of [['--model'], ['--role'], ['--model', 'ES21'], ['--role', 'gateway'],
    ['--publish'], ['--role', 'unit', '--role', 'system'], ['--require-ready', '--require-ready']]) {
    assert.throws(() => acceptanceTargets(args));
  }
});

test('monitoring CLI stays non-ready for open hardware gates and rejects misspelled narrowing flags', () => {
  const script = path.join(root, 'scripts/check-stream-5000-acceptance.mjs');
  const result = spawnSync(process.execPath, [script, '--model', 'es21', '--role', 'unit', '--require-ready'],
    { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /es21\/unit: PENDING/);
  assert.doesNotMatch(result.stdout, /es22\/|es21\/system/);
  const invalid = spawnSync(process.execPath, [script, '--roles', 'unit'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown acceptance option/);
});

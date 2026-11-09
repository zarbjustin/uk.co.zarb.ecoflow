import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptanceTargets, candidateFingerprint } from './check-stream-5000-acceptance.mjs';

const models = ['es21', 'es22'];
const gates = ['identity_scope', 'native_contract', 'private_durable_cas', 'issuance_fencing',
  'driver_binding', 'exact_runtime', 'action_readback', 'native_ai_preservation',
  'recovery', 'ui_semantics', 'normal_use_soak'];
const sha256 = /^(?!0{64}$)[a-f0-9]{64}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function keysWithin(value, allowed) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected THEN acceptance object');
  assert(Object.keys(value).every(key => allowed.includes(key)), 'Unexpected THEN acceptance field');
}

function evidenceTime(value) {
  assert.equal(typeof value, 'string', 'Evidence timestamp required');
  assert.match(value, timestamp, 'Invalid evidence timestamp');
  const result = Date.parse(value);
  assert(Number.isFinite(result), 'Invalid evidence timestamp');
  assert.equal(new Date(result).toISOString().replace('.000Z', 'Z'), value.replace('.000Z', 'Z'),
    'Evidence timestamp must describe a real calendar time');
  assert(result <= Date.now(), 'Future evidence cannot qualify THEN');
  return result;
}

export function validateThenAcceptance(record) {
  keysWithin(record, ['schemaVersion', 'scope', 'models', 'roles', 'excluded', 'gates']);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.scope, 'qualified_reserve_unit_then');
  assert.deepEqual(record.models, models);
  assert.deepEqual(record.roles, ['unit']);
  assert.deepEqual(record.excluded, ['system_controls', 'mode_controls', 'feed_limit_controls',
    'socket_controls', 'exact_watts', 'native_return', 'monitoring_signoff']);
  const required = new Set(models.flatMap(model => gates.map(gate => `${model}.${gate}`)));
  assert(Array.isArray(record.gates) && record.gates.length === required.size, 'Missing or extra THEN gates');
  for (const gate of record.gates) {
    keysWithin(gate, ['id', 'status', 'evidence', 'candidateFingerprint', 'firmwareVersion',
      'reference', 'observedAt', 'startedAt']);
    assert(required.delete(gate.id), 'Unknown or duplicate THEN gate');
    assert(['open', 'partial', 'passed'].includes(gate.status), 'Invalid THEN gate status');
    assert(['none', 'source_tests', 'installed_read_only', 'candidate_hardware'].includes(gate.evidence),
      'Invalid THEN evidence type');
    const kind = gate.id.split('.')[1];
    assert.equal(gate.reference, `docs/STREAM_5000_THEN_RELEASE_ACCEPTANCE.md#${kind.replaceAll('_', '-')}`);
    if (gate.status === 'passed') {
      assert.equal(gate.evidence, 'candidate_hardware', 'Source/monitoring observations cannot qualify THEN hardware');
      assert.match(gate.candidateFingerprint || '', sha256, 'Exact THEN candidate identity required');
      assert.match(gate.firmwareVersion || '', /^\d+(?:\.\d+){1,5}(?:[-+][a-z0-9.]+)?$/,
        'Exact firmware version required');
      const end = evidenceTime(gate.observedAt);
      if (kind === 'normal_use_soak') {
        assert(end - evidenceTime(gate.startedAt) >= 48 * 60 * 60 * 1000, 'Exact-runtime soak must cover at least 48 hours');
      } else assert.equal(gate.startedAt, null, 'Only soak evidence has a start time');
    } else {
      assert.equal(gate.candidateFingerprint, null, 'Partial evidence is not candidate signoff');
      assert.equal(gate.firmwareVersion, null, 'Partial evidence is not firmware signoff');
      assert.equal(gate.startedAt, null, 'Partial evidence is not soak signoff');
      if (gate.observedAt !== null) evidenceTime(gate.observedAt);
    }
  }
}

/** These are reviewed evidence claims, not discovery or native-proof generation. */
export function assessThenAcceptance(record, fingerprint, model) {
  validateThenAcceptance(record);
  assert(models.includes(model), 'Unsupported THEN model');
  assert.match(fingerprint, sha256);
  const selected = record.gates.filter(gate => gate.id.startsWith(`${model}.`));
  const pending = selected.filter(gate => gate.status !== 'passed' || gate.candidateFingerprint !== fingerprint)
    .map(gate => gate.id);
  const firmware = new Set(selected.filter(gate => gate.status === 'passed').map(gate => gate.firmwareVersion));
  if (firmware.size > 1) pending.push(`${model}.firmware_consistency`);
  return { model, role: 'unit', action: 'reserve', ready: pending.length === 0, pending };
}

export function thenAcceptanceTargets(args) {
  assert(!args.includes('--role'), 'THEN acceptance is unit-scoped; system controls are excluded');
  return acceptanceTargets([...args, '--role', 'unit']).map(target => target.model);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const record = JSON.parse(fs.readFileSync(path.join(root, 'docs/STREAM_5000_THEN_ACCEPTANCE.json'), 'utf8'));
    const fingerprint = candidateFingerprint(root);
    const results = thenAcceptanceTargets(process.argv.slice(2))
      .map(model => assessThenAcceptance(record, fingerprint, model));
    console.log(`Reserve THEN candidate fingerprint: ${fingerprint}`);
    for (const result of results) console.log(`${result.model}/unit/reserve: ${result.ready ? 'ACCEPTED' : `PENDING (${result.pending.join(', ')})`}`);
    console.log('Evidence assessment only: no writer, card, installation or publication is enabled.');
    if (process.argv.includes('--require-ready') && results.some(result => !result.ready)) process.exitCode = 1;
  } catch {
    console.error('Invalid reserve THEN acceptance ledger or options.');
    process.exitCode = 1;
  }
}

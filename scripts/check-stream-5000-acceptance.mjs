import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modelGates = ['identity', 'discharge', 'charge', 'idle', 'freshness_recovery', 'configuration_scope', 'accessories'];
const systemGates = ['system_scope', 'energy_continuity'];
const sharedGates = ['native_upgrade', 'pairing_workflow', 'normal_use_soak'];
const models = ['es21', 'es22'];

function keysWithin(value, allowed) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected acceptance object');
  assert(Object.keys(value).every(key => allowed.includes(key)), 'Unexpected acceptance field; keep private evidence out of the ledger');
}

/** Fingerprint candidate runtime, not mutable acceptance prose or test counts. */
export function candidateFingerprint(root) {
  const files = ['app.json', 'package.json', 'package-lock.json', 'app.ts', 'api.ts'];
  const walk = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const name = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (/\.(?:ts|js|json|html|svg|png)$/.test(name)) files.push(name);
    }
  };
  for (const directory of ['lib', 'drivers', 'settings', 'locales', 'widgets', '.homeycompose', 'assets']) walk(directory);
  const hash = crypto.createHash('sha256');
  for (const name of [...new Set(files)].sort()) {
    const data = fs.readFileSync(path.join(root, name));
    hash.update(`${name}\0${data.length}\0`); hash.update(data);
  }
  return hash.digest('hex');
}

export function requiredAcceptanceGates(model, role) {
  assert(models.includes(model), 'Unsupported acceptance model');
  assert(['unit', 'system'].includes(role), 'Unsupported acceptance role');
  return [...sharedGates, ...modelGates.map(gate => `${model}.${gate}`),
    ...(role === 'system' ? systemGates.map(gate => `${model}.${gate}`) : [])];
}

export function validateAcceptance(record) {
  keysWithin(record, ['schemaVersion', 'scope', 'models', 'roles', 'excluded', 'gates']);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.scope, 'read_only_monitoring');
  assert.deepEqual(record.models, models);
  assert.deepEqual(record.roles, ['unit', 'system']);
  assert.deepEqual(record.excluded, ['new_5000_controls', 'remaining_time', 'dual_ct_energy',
    'automatic_mixed_generation_merge', 'new_product_admission']);
  const required = new Set(models.flatMap(model => requiredAcceptanceGates(model, 'system')));
  assert.equal(record.gates.length, required.size, 'Missing or extra acceptance gates');
  for (const gate of record.gates) {
    keysWithin(gate, ['id', 'status', 'evidence', 'candidateFingerprint', 'reference', 'observedAt']);
    assert(required.delete(gate.id), 'Unknown or duplicate acceptance gate');
    assert(['open', 'partial', 'passed'].includes(gate.status), 'Invalid acceptance status');
    assert(['none', 'installed_test', 'community', 'candidate_hardware'].includes(gate.evidence), 'Invalid evidence type');
    assert.equal(typeof gate.reference, 'string');
    assert.match(gate.reference, /^docs\/STREAM_5000_MONITORING_RC\.md#[a-z0-9-]+$/);
    if (gate.status === 'passed') {
      assert.equal(gate.evidence, 'candidate_hardware', 'Software/older installed observations cannot pass hardware gates');
      assert.match(gate.candidateFingerprint || '', /^[a-f0-9]{64}$/, 'Passed gate needs exact candidate identity');
      assert.match(gate.observedAt || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
      assert(Number.isFinite(Date.parse(gate.observedAt)), 'Invalid evidence date');
    } else {
      assert.equal(gate.candidateFingerprint, null, 'Partial evidence must not sign off candidate');
    }
  }
}

/** An open gate is a release blocker, not a failed unit test or an activation. */
export function assessAcceptance(record, fingerprint, model, role) {
  validateAcceptance(record);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  const required = requiredAcceptanceGates(model, role);
  const pending = record.gates.filter(gate => required.includes(gate.id)
    && (gate.status !== 'passed' || gate.candidateFingerprint !== fingerprint));
  return { model, role, ready: pending.length === 0, pending: pending.map(gate => gate.id) };
}

/** A narrow readiness decision never approves another model or system Energy. */
export function acceptanceTargets(args) {
  let selectedModel; let selectedRole;
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    assert(['--model', '--role', '--require-ready'].includes(flag), 'Unknown acceptance option');
    assert(!seen.has(flag), 'Duplicate acceptance option');
    seen.add(flag);
    if (flag === '--require-ready') continue;
    const value = args[++index];
    if (flag === '--model') {
      assert(models.includes(value), 'Unsupported acceptance model');
      selectedModel = value;
    } else {
      assert(['unit', 'system'].includes(value), 'Unsupported acceptance role');
      selectedRole = value;
    }
  }
  return (selectedModel ? [selectedModel] : models).flatMap(model =>
    (selectedRole ? [selectedRole] : ['unit', 'system']).map(role => ({ model, role })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const record = JSON.parse(fs.readFileSync(path.join(root, 'docs/STREAM_5000_MONITORING_ACCEPTANCE.json'), 'utf8'));
  const fingerprint = candidateFingerprint(root);
  const results = acceptanceTargets(process.argv.slice(2))
    .map(({ model, role }) => assessAcceptance(record, fingerprint, model, role));
  console.log(`Monitoring candidate fingerprint: ${fingerprint}`);
  for (const result of results) console.log(`${result.model}/${result.role}: ${result.ready ? 'ACCEPTED' : `PENDING (${result.pending.join(', ')})`}`);
  console.log('No pairing gate, setting, device, publication or Energy contract is changed by this check.');
  if (process.argv.includes('--require-ready') && results.some(result => !result.ready)) process.exitCode = 1;
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateFingerprint } from './check-stream-5000-acceptance.mjs';

export const requiredDualCtGates = Object.freeze(['identity_firmware', 'ct1_property_scope', 'phase_units_direction',
  'measurement_freshness', 'physical_import_export_zero', 'energy_intervals', 'source_overlap',
  'native_storage_restart', 'upgrade_rollback_backup', 'normal_use_48h', 'native_desktop_mobile']);
const exactKeys = (value, keys) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected acceptance object');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Unexpected/missing acceptance fields; keep private evidence outside Git');
};

export function validateDualCtAcceptance(record) {
  exactKeys(record, ['schemaVersion', 'scope', 'productType', 'wiring', 'firmware', 'timing', 'gates']);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.scope, 'ct1_property_grid_power_energy');
  assert.equal(record.productType, 421);
  assert.equal(record.wiring, 'single_phase');
  assert(record.firmware === null || (typeof record.firmware === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(record.firmware)));
  assert([null, 'device_measurement', 'verified_live_receipt_estimate'].includes(record.timing));
  assert(Array.isArray(record.gates));
  assert.deepEqual(record.gates.map(gate => gate.id).sort(), [...requiredDualCtGates].sort(), 'Missing/duplicate/extra hardware gates');
  for (const gate of record.gates) {
    const passed = gate.status === 'passed';
    exactKeys(gate, ['id', 'status', 'evidence', 'candidateFingerprint', 'reference', ...(passed ? ['observedAt'] : [])]);
    assert(['open', 'partial', 'passed'].includes(gate.status));
    assert(['none', 'owner_observation', 'candidate_hardware'].includes(gate.evidence));
    assert.equal(gate.reference, `docs/DUAL_CT_ENERGY_RC.md#${gate.id.replaceAll('_', '-')}`);
    if (passed) {
      assert.equal(gate.evidence, 'candidate_hardware');
      assert(record.firmware !== null && record.timing !== null, 'Passed gates need explicit firmware/timing scope');
      assert.match(gate.candidateFingerprint || '', /^[a-f0-9]{64}$/);
      assert.match(gate.observedAt || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
      assert(Number.isFinite(Date.parse(gate.observedAt)));
    } else assert.equal(gate.candidateFingerprint, null, 'Partial observations cannot approve a runtime');
  }
}

export function assessDualCtAcceptance(record, fingerprint) {
  validateDualCtAcceptance(record);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  const pending = record.gates.filter(gate => gate.status !== 'passed' || gate.candidateFingerprint !== fingerprint).map(gate => gate.id);
  return { ready: pending.length === 0, scope: record.scope, wiring: record.wiring, pending };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const record = JSON.parse(fs.readFileSync(path.join(root, 'docs/DUAL_CT_ENERGY_ACCEPTANCE.json'), 'utf8'));
  const rc = fs.readFileSync(path.join(root, 'docs/DUAL_CT_ENERGY_RC.md'), 'utf8');
  for (const gate of requiredDualCtGates) assert(rc.includes(`## ${gate.replaceAll('_', '-')}`), 'Missing evidence reference');
  const fingerprint = candidateFingerprint(root);
  const result = assessDualCtAcceptance(record, fingerprint);
  console.log(`Dual CT candidate fingerprint: ${fingerprint}`);
  console.log(`CT1 single-phase property Energy: ${result.ready ? 'ACCEPTED' : `PENDING (${result.pending.join(', ')})`}`);
  console.log('Hardware readiness only: no contract registration, activation, pairing, settings or publication performed.');
  if (process.argv.includes('--require-ready') && !result.ready) process.exitCode = 1;
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessAcceptance, candidateFingerprint } from './check-stream-5000-acceptance.mjs';
import { assessDualCtAcceptance } from './check-dual-ct-acceptance.mjs';
import { assessThenAcceptance } from './check-stream-5000-then-acceptance.mjs';

const solarGates = ['linked_source_identity', 'native_watts_and_zero', 'generated_kwh_interval',
  'restart_and_gap_recovery', 'homey_energy_projection', 'normal_use_48h'];

export function assessSolarAcceptance(record, fingerprint) {
  if (!record) return { ready: false, pending: ['solar_not_assessed'] };
  assert.deepEqual(Object.keys(record).sort(), ['gates', 'scope']);
  assert.equal(record.scope, 'es21_direct_pv');
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(record.gates.map(gate => gate.id).sort(), [...solarGates].sort());
  for (const gate of record.gates) {
    assert.deepEqual(Object.keys(gate).sort(), ['candidateFingerprint', 'evidence', 'id', 'observedAt', 'startedAt', 'status']);
    if (gate.status === 'open') {
      for (const key of ['observedAt', 'startedAt', 'candidateFingerprint', 'evidence']) assert.equal(gate[key], null);
    } else {
      assert.equal(gate.status, 'passed');
      assert.equal(gate.evidence, 'candidate_hardware');
      assert.match(gate.candidateFingerprint, /^[a-f0-9]{64}$/);
      const utcTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
      assert.match(gate.observedAt, utcTime);
      assert(Number.isFinite(Date.parse(gate.observedAt)));
      if (gate.id === 'normal_use_48h') {
        assert.match(gate.startedAt, utcTime);
        assert(Date.parse(gate.observedAt) - Date.parse(gate.startedAt) >= 48 * 3600000);
      } else assert.equal(gate.startedAt, null);
    }
  }
  const pending = record.gates.filter(gate => gate.status !== 'passed' || gate.candidateFingerprint !== fingerprint).map(gate => gate.id);
  return { ready: pending.length === 0, pending };
}

/** Full requested scope is the intersection, never a transfer of one model/role's hardware evidence. */
export function assessFullRelease(dualCt, monitoring, fingerprint, engineering = { ready: false, pending: ['engineering_not_assessed'] }, thenRecord = null, solarRecord = null) {
  const dual = assessDualCtAcceptance(dualCt, fingerprint);
  const batteries = ['es21', 'es22'].flatMap(model => ['unit', 'system'].map(role => assessAcceptance(monitoring, fingerprint, model, role)));
  const reserve = ['es21', 'es22'].map(model => thenRecord === null
    ? { model, role: 'unit', action: 'reserve', ready: false, pending: [`${model}.then_not_assessed`] }
    : assessThenAcceptance(thenRecord, fingerprint, model));
  const solar = assessSolarAcceptance(solarRecord, fingerprint);
  const hardwareReady = solar.ready && dual.ready && batteries.every(row => row.ready) && reserve.every(row => row.ready);
  return { fingerprint, hardwareReady, engineering, ready: hardwareReady && engineering.ready === true, dualCt: dual, batteries, then: reserve, solar };
}

/** Fail closed on an intentionally disabled/hidden source, even if hardware records are accidentally marked passed. */
export function assessEnergyEngineering(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const source = fs.readFileSync(path.join(root, 'lib/dualCtGridEnergySource.ts'), 'utf8');
  const driver = manifest.drivers.find(row => row.id === 'smartmeter_dual_ct_energy');
  const pending = [];
  if (!driver || driver.class !== 'sensor' || driver.energy?.cumulative !== true
    || driver.energy.cumulativeImportedCapability !== 'meter_power.imported'
    || driver.energy.cumulativeExportedCapability !== 'meter_power.exported') pending.push('dual_ct_energy_driver');
  if (!/^export const DUAL_CT_ENERGY_RUNTIME_ENABLED = true;/m.test(source)) pending.push('dual_ct_runtime_qualification');
  if (/export const resolveDualCtGridEnergyContract:[^\n]*= \(\) => null;/.test(source)) pending.push('dual_ct_source_contract');
  if (!driver || driver.deprecated === true) pending.push('dual_ct_pairing_admission');
  const solar = manifest.drivers.find(row => row.id === 'stream_5000_solar');
  if (!solar || solar.deprecated || solar.class !== 'solarpanel'
    || solar.energy?.meterPowerExportedCapability !== 'meter_power'
    || !['measure_power', 'meter_power'].every(id => solar.capabilities?.includes(id))) pending.push('es21_solar_energy_driver');
  return { ready: pending.length === 0, pending };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', name), 'utf8'));
  const result = assessFullRelease(read('DUAL_CT_ENERGY_ACCEPTANCE.json'), read('STREAM_5000_MONITORING_ACCEPTANCE.json'), candidateFingerprint(root), assessEnergyEngineering(root), read('STREAM_5000_THEN_ACCEPTANCE.json'), read('STREAM_5000_SOLAR_ACCEPTANCE.json'));
  console.log(`Full release candidate: ${result.fingerprint}`);
  console.log(`Energy driver structural checks only: ${result.engineering.ready ? 'PASSED' : `PENDING: ${result.engineering.pending.join(', ')}`}`);
  console.log(`Dual CT CT1: ${result.dualCt.ready ? 'ACCEPTED' : `PENDING: ${result.dualCt.pending.join(', ')}`}`);
  console.log(`ES21 direct solar Energy: ${result.solar.ready ? 'ACCEPTED' : `PENDING: ${result.solar.pending.join(', ')}`}`);
  for (const row of result.batteries) console.log(`${row.model}/${row.role}: ${row.ready ? 'ACCEPTED' : `PENDING: ${row.pending.join(', ')}`}`);
  for (const row of result.then) console.log(`${row.model}/${row.role}/${row.action}: ${row.ready ? 'ACCEPTED' : `PENDING: ${row.pending.join(', ')}`}`);
  console.log('No activation, deployment, hardware operation or publication. Software CI and the remaining product scope are separate checkpoints.');
  if (process.argv.includes('--require-ready') && !result.ready) process.exitCode = 1;
}

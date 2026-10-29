import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessAcceptance, candidateFingerprint } from './check-stream-5000-acceptance.mjs';
import { assessDualCtAcceptance } from './check-dual-ct-acceptance.mjs';

/** Full requested scope is the intersection, never a transfer of one model/role's hardware evidence. */
export function assessFullRelease(dualCt, monitoring, fingerprint, engineering = { ready: false, pending: ['engineering_not_assessed'] }) {
  const dual = assessDualCtAcceptance(dualCt, fingerprint);
  const batteries = ['es21', 'es22'].flatMap(model => ['unit', 'system'].map(role => assessAcceptance(monitoring, fingerprint, model, role)));
  const hardwareReady = dual.ready && batteries.every(row => row.ready);
  return { fingerprint, hardwareReady, engineering, ready: hardwareReady && engineering.ready === true, dualCt: dual, batteries };
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
  return { ready: pending.length === 0, pending };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', name), 'utf8'));
  const result = assessFullRelease(read('DUAL_CT_ENERGY_ACCEPTANCE.json'), read('STREAM_5000_MONITORING_ACCEPTANCE.json'), candidateFingerprint(root), assessEnergyEngineering(root));
  console.log(`Full release candidate: ${result.fingerprint}`);
  console.log(`Energy engineering: ${result.engineering.ready ? 'ACCEPTED' : `PENDING: ${result.engineering.pending.join(', ')}`}`);
  console.log(`Dual CT CT1: ${result.dualCt.ready ? 'ACCEPTED' : `PENDING: ${result.dualCt.pending.join(', ')}`}`);
  for (const row of result.batteries) console.log(`${row.model}/${row.role}: ${row.ready ? 'ACCEPTED' : `PENDING: ${row.pending.join(', ')}`}`);
  console.log('No activation, deployment, hardware operation or publication. Software CI and the remaining product scope are separate checkpoints.');
  if (process.argv.includes('--require-ready') && !result.ready) process.exitCode = 1;
}

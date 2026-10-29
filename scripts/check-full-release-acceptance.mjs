import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessAcceptance, candidateFingerprint } from './check-stream-5000-acceptance.mjs';
import { assessDualCtAcceptance } from './check-dual-ct-acceptance.mjs';

/** Full requested scope is the intersection, never a transfer of one model/role's hardware evidence. */
export function assessFullRelease(dualCt, monitoring, fingerprint) {
  const dual = assessDualCtAcceptance(dualCt, fingerprint);
  const batteries = ['es21', 'es22'].flatMap(model => ['unit', 'system'].map(role => assessAcceptance(monitoring, fingerprint, model, role)));
  return { fingerprint, ready: dual.ready && batteries.every(row => row.ready), dualCt: dual, batteries };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs', name), 'utf8'));
  const result = assessFullRelease(read('DUAL_CT_ENERGY_ACCEPTANCE.json'), read('STREAM_5000_MONITORING_ACCEPTANCE.json'), candidateFingerprint(root));
  console.log(`Full release candidate: ${result.fingerprint}`);
  console.log(`Dual CT CT1: ${result.dualCt.ready ? 'ACCEPTED' : `PENDING: ${result.dualCt.pending.join(', ')}`}`);
  for (const row of result.batteries) console.log(`${row.model}/${row.role}: ${row.ready ? 'ACCEPTED' : `PENDING: ${row.pending.join(', ')}`}`);
  console.log('No activation, deployment, hardware operation or publication. Software CI is a separate checkpoint.');
  if (process.argv.includes('--require-ready') && !result.ready) process.exitCode = 1;
}

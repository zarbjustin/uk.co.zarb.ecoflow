'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const path = require('node:path'); const { pathToFileURL } = require('node:url');
const fs = require('node:fs'); const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..'); const fp = 'a'.repeat(64);
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'docs', file)));
const load = () => import(pathToFileURL(path.join(root, 'scripts/check-full-release-acceptance.mjs')));
function passAll(record) {
  record.gates.forEach(g => Object.assign(g, { status: 'passed', evidence: 'candidate_hardware',
    candidateFingerprint: fp, observedAt: '2026-10-29T16:00:00Z' })); return record;
}
test('full release requires Dual CT plus every STREAM 5000 model/role on one candidate', async () => {
  const { assessFullRelease } = await load();
  const dual = read('DUAL_CT_ENERGY_ACCEPTANCE.json'); const batteries = read('STREAM_5000_MONITORING_ACCEPTANCE.json');
  assert.equal(assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }).ready, false);
  dual.firmware = 'synthetic.1'; dual.timing = 'verified_live_receipt_estimate'; passAll(dual);
  assert.equal(assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }).ready, false, 'meter acceptance cannot approve batteries');
  passAll(batteries); assert.equal(assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }).ready, true);
  batteries.gates.find(g => g.id === 'es22.charge').candidateFingerprint = 'b'.repeat(64);
  const result = assessFullRelease(dual, batteries, fp, { ready: true, pending: [] });
  assert.equal(result.ready, false); assert.equal(result.batteries.find(g => g.model === 'es21' && g.role === 'unit').ready, true);
});
test('actual full-release readiness command remains nonzero and read-only with open hardware gates', () => {
  const files = ['DUAL_CT_ENERGY_ACCEPTANCE.json', 'STREAM_5000_MONITORING_ACCEPTANCE.json'];
  const before = files.map(f => fs.readFileSync(path.join(root, 'docs', f), 'utf8'));
  const result = spawnSync(process.execPath, ['scripts/check-full-release-acceptance.mjs', '--require-ready'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stdout, /Dual CT CT1: PENDING/); assert.match(result.stdout, /es21\/unit: PENDING/);
  assert.deepEqual(files.map(f => fs.readFileSync(path.join(root, 'docs', f), 'utf8')), before);
});

test('hardware ledgers cannot declare release ready when source engineering is disabled or unassessed', async () => {
  const { assessFullRelease, assessEnergyEngineering } = await load();
  const dual = passAll(read('DUAL_CT_ENERGY_ACCEPTANCE.json')); dual.firmware = 'synthetic.1'; dual.timing = 'verified_live_receipt_estimate';
  const batteries = passAll(read('STREAM_5000_MONITORING_ACCEPTANCE.json'));
  const engineering = assessEnergyEngineering(root);
  assert.equal(engineering.ready, false); assert.ok(engineering.pending.includes('dual_ct_runtime_qualification'));
  assert.ok(engineering.pending.includes('dual_ct_source_contract')); assert.ok(engineering.pending.includes('dual_ct_pairing_admission'));
  assert.equal(assessFullRelease(dual, batteries, fp).ready, false);
  const result = assessFullRelease(dual, batteries, fp, engineering);
  assert.equal(result.hardwareReady, true); assert.equal(result.ready, false);
});

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
function passThen() {
  const record = passAll(read('STREAM_5000_THEN_ACCEPTANCE.json'));
  record.gates.forEach(g => Object.assign(g, { firmwareVersion: '1.2.3',
    startedAt: g.id.endsWith('.normal_use_soak') ? '2026-10-27T16:00:00Z' : null }));
  return record;
}

test('full release fails closed when reserve THEN evidence is absent or unqualified', async () => {
  const { assessFullRelease } = await load();
  const dual = passAll(read('DUAL_CT_ENERGY_ACCEPTANCE.json'));
  dual.firmware = 'synthetic.1'; dual.timing = 'verified_live_receipt_estimate';
  const batteries = passAll(read('STREAM_5000_MONITORING_ACCEPTANCE.json'));
  const engineering = { ready: true, pending: [] };
  assert.equal(assessFullRelease(dual, batteries, fp, engineering).ready, false);
  const open = assessFullRelease(dual, batteries, fp, engineering, read('STREAM_5000_THEN_ACCEPTANCE.json'));
  assert.equal(open.ready, false);
  assert.equal(open.then.every(row => !row.ready && row.pending.length === 11), true);
});

test('full release preserves exact model and candidate reserve THEN holds', async () => {
  const { assessFullRelease } = await load();
  const dual = passAll(read('DUAL_CT_ENERGY_ACCEPTANCE.json'));
  dual.firmware = 'synthetic.1'; dual.timing = 'verified_live_receipt_estimate';
  const batteries = passAll(read('STREAM_5000_MONITORING_ACCEPTANCE.json'));
  const record = passThen(); const engineering = { ready: true, pending: [] };
  assert.equal(assessFullRelease(dual, batteries, fp, engineering, record).ready, true);
  record.gates.find(g => g.id === 'es22.native_contract').candidateFingerprint = 'b'.repeat(64);
  const result = assessFullRelease(dual, batteries, fp, engineering, record);
  assert.equal(result.ready, false);
  assert.equal(result.then.find(row => row.model === 'es21').ready, true);
  assert.equal(result.then.find(row => row.model === 'es22').ready, false);
});

test('full release requires Dual CT plus every STREAM 5000 model/role on one candidate', async () => {
  const { assessFullRelease } = await load();
  const dual = read('DUAL_CT_ENERGY_ACCEPTANCE.json'); const batteries = read('STREAM_5000_MONITORING_ACCEPTANCE.json');
  const reserve = passThen();
  assert.equal(assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }, reserve).ready, false);
  dual.firmware = 'synthetic.1'; dual.timing = 'verified_live_receipt_estimate'; passAll(dual);
  assert.equal(assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }, reserve).ready, false, 'meter acceptance cannot approve batteries');
  passAll(batteries); assert.equal(assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }, reserve).ready, true);
  batteries.gates.find(g => g.id === 'es22.charge').candidateFingerprint = 'b'.repeat(64);
  const result = assessFullRelease(dual, batteries, fp, { ready: true, pending: [] }, reserve);
  assert.equal(result.ready, false); assert.equal(result.batteries.find(g => g.model === 'es21' && g.role === 'unit').ready, true);
});
test('actual full-release readiness command remains nonzero and read-only with open hardware gates', () => {
  const files = ['DUAL_CT_ENERGY_ACCEPTANCE.json', 'STREAM_5000_MONITORING_ACCEPTANCE.json', 'STREAM_5000_THEN_ACCEPTANCE.json'];
  const before = files.map(f => fs.readFileSync(path.join(root, 'docs', f), 'utf8'));
  const result = spawnSync(process.execPath, ['scripts/check-full-release-acceptance.mjs', '--require-ready'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stdout, /Dual CT CT1: PENDING/); assert.match(result.stdout, /es21\/unit: PENDING/);
  assert.match(result.stdout, /es21\/unit\/reserve: PENDING/);
  assert.match(result.stdout, /es22\/unit\/reserve: PENDING/);
  assert.deepEqual(files.map(f => fs.readFileSync(path.join(root, 'docs', f), 'utf8')), before);
});

test('candidate admission cannot replace native hardware acceptance or an explicit engineering assessment', async () => {
  const { assessFullRelease, assessEnergyEngineering } = await load();
  const dual = passAll(read('DUAL_CT_ENERGY_ACCEPTANCE.json')); dual.firmware = 'synthetic.1'; dual.timing = 'verified_live_receipt_estimate';
  const batteries = passAll(read('STREAM_5000_MONITORING_ACCEPTANCE.json'));
  const reserve = passThen();
  const engineering = assessEnergyEngineering(root);
  assert.equal(engineering.ready, true);
  assert.equal(assessFullRelease(read('DUAL_CT_ENERGY_ACCEPTANCE.json'), read('STREAM_5000_MONITORING_ACCEPTANCE.json'), fp, engineering, reserve).ready, false);
  assert.equal(assessFullRelease(dual, batteries, fp, undefined, reserve).ready, false);
  const result = assessFullRelease(dual, batteries, fp, { ready: false, pending: ['explicit_review_hold'] }, reserve);
  assert.equal(result.hardwareReady, true); assert.equal(result.ready, false);
});

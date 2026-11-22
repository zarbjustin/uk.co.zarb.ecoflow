'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const record = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/DUAL_CT_ENERGY_ACCEPTANCE.json')));
const checker = () => import(pathToFileURL(path.join(root, 'scripts/check-dual-ct-acceptance.mjs')));
const fingerprint = 'a'.repeat(64);
function passed() {
  const r = record(); r.firmware = 'synthetic.1'; r.timing = 'verified_live_receipt_estimate';
  r.gates.forEach(g => Object.assign(g, { status: 'passed', evidence: 'candidate_hardware', candidateFingerprint: fingerprint, observedAt: '2026-10-29T15:00:00Z' })); return r;
}
test('Dual CT hardware readiness is separate, exact-runtime and closed for the real ledger', async () => {
  const { assessDualCtAcceptance: assess, requiredDualCtGates } = await checker();
  assert.deepEqual(assess(record(), fingerprint).pending.sort(), [...requiredDualCtGates].sort());
  assert.equal(assess(passed(), fingerprint).ready, true);
  assert.equal(assess(passed(), 'b'.repeat(64)).ready, false);
});
test('ledger rejects software signoffs, missing/duplicate gates, unknown scope, private fields and absent timing', async () => {
  const { validateDualCtAcceptance: validate } = await checker();
  for (const mutate of [r => { r.gates.pop(); }, r => { r.gates[1] = r.gates[0]; },
    r => { r.gates[0].evidence = 'owner_observation'; }, r => { r.gates[0].serial = 'PRIVATE'; },
    r => { r.timing = null; }, r => { r.firmware = null; }, r => { r.wiring = 'three_phase'; },
    r => { r.gates[0].candidateFingerprint = null; }, r => { r.gates[0].observedAt = 'bad'; }]) {
    const r = passed(); mutate(r); assert.throws(() => validate(r));
  }
});

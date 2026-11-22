# Microinverter and battery startup counters — 6 November 2026

## Scope and current state

Owner authorised offline investigation, confirmed-defect repairs and regression
tests, keeping installed Development, Store Test/Live and native EcoFlow AI
settings unchanged. Canonical diagnostic baseline was clean synchronized
`1167ff46004fb2785dfd556613ea5fa268c59073`; fresh fetch showed ahead/behind 0/0.
The shared editing lease was acquired before edits. No Homey/EcoFlow API/UI call,
installation, restart, battery/control/Flow/Energy change or tester contact occurred.
No commit, push, version bump or publication is included in this continuation.

The previously reviewed solar fix is retained unchanged. This batch fixes related
microinverter and battery startup paths without treating the solar hardware
observation as proof that these other devices failed physically. The installed
archive still predates both source repairs. Homey's two reserve-execution switches
remain untouched in their last recorded disabled state; native AI remains owner.

## Reproduced defects and bounded repairs

Four real-driver regressions failed on the original compiled source:

1. **Microinverter startup rollback:** 123,000 stored Wh overwrote a projected
   123.004 kWh with 123 kWh. Startup now validates a same-device source-bound
   `microEnergyState` record, retains a genuinely newer projected total, and
   checkpoints the recovered precise Wh with source in one authoritative record.
   Its scalar compatibility mirror cannot override the coherent record after a
   partial write. Unsupported formats/foreign sources preserve history and pause
   accounting, while valid live power can still update.
2. **Original battery startup rollback:** valid legacy/coherent totals of
   1,000/2,000 Wh ignored a newer 1.004 kWh charged projection. Same-bound-source
   projections now recover that floor. Only a raised direction loses its old raw
   anchor; its first new native counter anchors without adding that interval
   twice. The unaffected direction retains its coherent raw baseline and delta.
   Recovery is persisted even without further generation/charge. Foreign-source
   records are not promoted using an unrelated projection; displayed history is
   retained without merging it into that record.
3. **Original battery rounded display decrease:** 1,000.6 precise Wh restored as
   1.0006 kWh over an already rounded 1.001 kWh capability. Projection now preserves
   a higher existing display while retaining precise internal Wh and source rules.
4. **5000 fractional inflation:** 1,000.6 stored Wh plus native rounded 1.001 kWh
   was treated as 1,001 Wh. Startup now recognises that native one-Wh bin as a
   representation of the existing checkpoint, not extra energy, and avoids
   rewriting the rounded projection. Higher genuinely newer floors still restore;
   physical unit monitors still do not gain aggregate Energy counters.

Microinverter receipt timestamps now anchor accounting before SDK awaits, reset
across startup/teardown and reject old/duplicate/foreign/invalid/future samples.
Long gaps are not backfilled. Startup SDK writes share Base's existing queue/drain;
checkpoint `close()` retires retry timers while preserving failed dirty writes
for explicit retry. Existing capability IDs, pairing, settings and PV/grid display
mapping remain intact; partial-PV aggregation policy was not broadened here.

An additional candidate regression deliberately seeded the only legacy raw anchor
without a saved counter-source flag. Clearing that anchor while raising a floor
initially enabled power fallback, producing 1.014 instead of 1.004 kWh. The failing
reproduction is retained. Recovery now preserves evidence that native counters
were already authoritative, independently of whether their raw anchors were
cleared. Power-only samples cannot silently resume integration in that mode.
This was found and corrected offline before any deployment.

## Regression coverage and validation

New tests: **15**, taking the suite from **1,456 to 1,471 passing**.

- `test/microEnergyLifecycle.test.js`: nine real-driver offline tests/matrices
  for higher floors, precision/zero, absent versus corrupt history, future/foreign
  formats, both persistence-key failures, stale mirror precedence, changed-store
  retry ownership, receipt/SDK latency, same-instance restart, clock rollback,
  duplicate/old/foreign samples, long gaps and held startup teardown. No network
  or household credentials are used. Live power remains available while corrupt
  energy history is withheld.
- `test/streamEnergyLifecycle.test.js`: five tests cover legacy/coherent startup
  floors, independent raw-direction re-anchoring, persistence/restart, preservation
  of native counter authority, fractional display handling, foreign-source records
  and malformed saved read addresses without cross-source floor adoption.
- `test/stream5000Lifecycle.test.js`: repeated fresh-instance restore of fractional
  Wh with rounded capabilities; existing genuine higher-floor, invalid-projection,
  unit/system isolation and counter tests remain passing.

Node **22.23.4**, committed-lockfile `npm ci`, full `npm test` **1,471/1,471**,
repository lint wrapper, `npm run release:check` and whitespace checks passed.
The final test-only retired-timer assertion was additionally rerun with the full
nine-test micro suite. Earlier targeted battery/5000/solar/checkpoint run passed
162 tests before the additional native-mode regression; the final full suite
includes that regression. The raw-ESLint compatibility adapter was not bypassed.

Pinned Homey CLI **4.5.3** preprocess/TypeScript compilation and **verified**
validation passed on an isolated public-source copy. No deployment/archive upload
method was called. Existing manager API permission review warning remains.
No new exact-commit CI or standalone audit result is claimed for this uncommitted
diff; manifest/lockfile and CI/acceptance rules were not changed.

Evidence outside Git:
`../work/output/startup-counter-audit-2026-11-06/`.
`before-fix.log` retains four original failures, `raw-mode-before.log` the extra
candidate failure, and `primary-after.log`, `targeted.log`, `npm-test-final.log`,
`micro-final.log`, `lint-final.log`, `release-check-final.log` and
`homey-verified.log` retain actual results. `verified-source/` is an isolated
validation copy, not a replacement checkout or installed app. No private raw
household evidence/history/images were opened or uploaded by this investigation.

## Changed files, review and remaining gates

Production edits are limited to `drivers/stream_micro/device.ts`,
`drivers/stream/device.ts` and `lib/Stream5000UnitDevice.ts`. The reviewed solar
driver, shared Base queue, shared checkpoint implementation, app controls, device
manifests, Energy declarations, package/lockfile and hardware ledgers are unchanged.
The coordinator reviewed the diff and adversarial tests; no new independent
multi-model review is claimed. Earlier solar reviews do not approve this new diff.

These are software defect reproductions, not observed microinverter/battery
hardware failures or new hardware signoffs. The actual installed solar checkpoint
sequence remains untraced, and its original 4 Wh startup failure remains recorded.
No manual counter correction, source migration or automatic rollback occurred.

Next: review these local source changes, then separately approve source sync/CI
and preparation of one combined validation archive. Any household update needs
fresh exact-artifact approval, disabled Homey execution, native AI ownership,
quiescence and full preservation baseline. Immediate startup comparisons must
precede generation masking a drop. Native rendering/independent comparisons,
physical counter continuity, full normal-use soak, ES22 and three-phase gates
remain open; software passes do not close them. Keep reserve execution disabled;
never resume it or clear the historical fault as part of this source repair.

## Subsequent owner-authorised source sync and candidate preparation

The owner subsequently authorised final review, commit/push, CI and combined
validation candidate preparation while retaining all live boundaries above.
Production/test validation hashes were rechecked; coordinator final review found
no further blocking issue. Nine intended source/test/handover files were explicitly
staged and committed as `003f2c4aee9c58aeeda7ad907b4c06f1dc8c832d`, normally pushed
after a fresh divergence check. [Exact source CI 42224824156](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42224824156)
passed tests, lint, release checks, audit and pinned verified validation.

The [combined candidate review](COMBINED_COUNTER_VALIDATION_REVIEW_2026-11-06.md)
records clean-export packaging/provenance and the separately gated hardware plan.
No installation, publication, version bump, live setting/control/Flow operation
or hardware query occurred. Final documentation-only commit/CI, local receipt and
lease/index outcome remain outside Git at
`../work/output/combined-counter-candidate-2026-11-06/FINAL_RECEIPT.md`.

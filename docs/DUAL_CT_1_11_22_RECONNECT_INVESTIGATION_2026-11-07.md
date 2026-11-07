# Dual CT 1.11.22 reconnect investigation — 7 November 2026

## Update after approved1.11.23 delivery — cause confirmed

See [diagnostic result](DEVELOPMENT_1_11_23_DIAGNOSTIC_RESULT_2026-11-07.md).
SDK Energy flags are absent while Web API confirms the Office meter is excluded;
the classifier defaults missing flags to included and falsely blocks admission.
Dual CT remains reconnecting pending a reviewed correction. The initial source-
preparation snapshot below predates these diagnostics and its unresolved-cause
statements are superseded. No further source/policy/install change was applied.


## Result and certainty

**Household reconnect cause remains unresolved.** Do not describe1.11.23 as a
proven live-power fix. Confirmed defects fixed locally are (1) failure evidence
being discarded/hidden for single-phase meters and (2) array-shaped cumulative
meter settings being accepted as a complete inventory. The latter is a reproduced
validation defect, not evidence of the household's cause. No admission bypass,
permissive fallback or guessed firmware fix was applied.

Current branch remains codex/mixed-generation-reporting-diagnostics at
c1c7f689a293b93c36fafba38115d8f720308da6 plus uncommitted source/docs. Fresh fetch
found remote equal. Prior uncommitted1.11.22 installation reports/checkpoints were
preserved. No commit, push, CI trigger or external contact in this task.

## Evidence used and remaining gap

Reviewed installed1.11.22 preservation/readbacks, sanitized follow-up, source
inventory/context/session/adapter/driver/recovery/support/export code and existing
regressions. A single targeted read at14:11:22UTC confirmed1.11.22/running:
preview marked available; Energy driver still reconnecting, unknown grid watts,
two numeric cumulative totals. Preview availability alone is not independent proof
of current power, broker health or electrical accuracy. No forced subscription,
refresh, reconnect, silence, vendor login or controls were used.

Existing receipt evidence proves available-before/unavailable-after delivery,
not which SDK getter, inventory flag, source qualification, firmware readback,
binding or admission check failed.1.11.22 context.refresh replaces exceptions
with energy_source_unavailable; driver.stop discards context/adapter; single-phase
getDualCtCommunityFeedback returns null. Existing stdout projection found no
specific source/reader exception. A wider repeated raw capture cannot recover
this discarded evidence. Raw originals/credentials/stdout were not loaded into
remote model context; deterministic local projections only.

Official SDK references were checked for
[Device getters](https://apps-sdk-v3.developer.homey.app/Device.html),
[own-driver enumeration](https://apps-sdk-v3.developer.homey.app/ManagerDrivers.html)
and [Energy override semantics](https://apps.developer.homey.app/the-basics/devices/energy).
These document supported getters, not the actual values returned on this household
runtime. SDK getEnergy override/exclusion visibility remains a hypothesis to
measure; documentation cannot close that gap or justify skipping overlap checks.

## Source-only diagnostic candidate1.11.23

- Retain fixed source-selection versus owned-inventory failure classifications
  before refresh clears eligibility. For SDK scan failures, retain getter stage
  (manifest/driver/devices/identity/energy/capabilities/settings) and only a known
  packaged driver label. No raw exceptions, names, device IDs or serials.
- Preserve startup/admission state through recovery, including periodic identity
  refresh failure, for both single- and three-phase devices. Current retry/active
  state is reported separately from last startup result. Historical failures
  never grant eligibility or claim freshness.
- Add local read-only SDK metadata scan to support schema20. It reports bounded
  counts and fixed exclusion/include flag states; no powers/counters or raw settings.
  The scan includes this app's own Energy meter: an included count of one is not
  automatically an overlap. It never claims external inventory verification.
- Include both new sections in the Dual CT summary/copy and native comparison
  export. Community-trial feedback remains a separate section; single-phase
  diagnostics do not falsely claim three-phase hardware qualification.
- Reject array-shaped cumulative settings as incomplete. Isolated synthetic replay
  against original1.11.22 compiled classifier returned complete=true; revised
  classifier returns false. No evidence shows this malformed input exists on the
  household. Missing/malformed source data stays unknown; never admit or reset.

Production changes: lib/dualCtHomeyEnergyContext.ts,
lib/dualCtRecoveryDiagnostics.ts, drivers/smartmeter_dual_ct_energy/device.ts,
lib/supportSnapshot.ts and settings/index.html, plus versions/changelog/tests.
All driver/Flow IDs, argument contracts, capabilities, Energy declarations and
permissions match HEAD except package version. No counter schema/binding/accounting,
phase mapping, ownership lease, retry schedule, freshness limit or battery policy
change. Existing broad API removal/manual external-review tradeoff remains.

## Validation and artifact

Eight core new regressions plus a desktop/mobile export workflow were added.
Initial five diagnostics regressions failed before implementation and passed after;
summary export regression also failed before its integration. Array-settings replay
confirms the old/new validation difference. Tests cover getter failure isolation,
private error/identity redaction, malformed metadata, external-review boundary,
source versus inventory distinction, single-phase recovery/counter preservation,
hostile error access and summary copying using one GET only. Existing three-phase,
accounting, stale-power and overlap tests remain passing.

**1,529 tests passed**, no failures/skips/cancellations. Node22.23.4 with committed
lockfile npm ci, lint, release:check and whitespace passed; npm ci audit found zero
vulnerabilities. Pinned Homey CLI4.5.3 verified validation and packaging passed in
an isolated public-source export. Metadata equals HEAD except version. No new
independent multi-model review or exact-commit CI exists for this uncommitted work.
`release:full` still exits1 for open hardware gates; no ledger weakened/gate closed.

Runtime-source fingerprint: `726847ed24b81e82a70c3fdd91d255242bce6bf536032ea0729902247275e7e6`.
Review archive SHA-256: `60f77156be874d8352f94ac4913a15c3e38eea7733e90c1760d6c0145e053659`.
Archive: ../work/output/dualct-11122-recovery-investigation-20261107T1412Z/package-review/candidate-reproducible.tgz.
Export manifest SHA-256: `5ac1131d985cf91291217384b71e97b664c22bef6021a09731b714a034d87ca2`.
Compiled entrypoints match the verified build. Two normalizations of one CLI
archive are byte-identical; no independent rebuild claim. Earlier intermediate
exports/archives are retained separately and are not this review artifact. Later
review/handover text is outside the runtime/source export snapshot.

## Required next bounded step — for review, not executed

1. Review this diagnostic scope; commit/push and exact-commit CI need owner approval.
2. Before a separately approved exact1.11.23 non-clean Development installation on
   Justin's Homey Pro, take fresh preservation/safety baseline, external-meter role
   review and verify prior archive/rollback limits. This restarts readings for all
   EcoFlow devices. No permission/battery/Flow/Energy change or coordinator restart.
3. Collect one support snapshot after startup. New dualCtEnergyRecovery identifies
   source/contract/binding/admission/subscription stage; dualCtOwnedInventory tests
   SDK metadata independently of an already-destroyed failed context. Compare fixed
   SDK exclusion flags/counts with the separate authenticated full-Homey role view.
4. If source lookup fails, investigate its existing read-only API path. If a getter
   or classification fails, reproduce the exact returned shape with a synthetic
   fixture and repair only that defect. If binding/checkpoint/admission fails,
   inspect continuity safely; no store rewrite, new pairing, zero-fill, disabled
   guard or broad API fallback. Do not ask Robert for another capture for this
   household-specific regression.
5. No48hacceptance soak or release promotion until the actual cause and recovery
   are demonstrated on an approved exact runtime. Single-phase never qualifies
   three-phase, and source tests never close physical gates.

Installed Development remains1.11.22; Test/Live remain unchanged (last authenticated
store read1.11.21/build88 and1.10.3/build18). No installation/restart/publication,
settings/Flows/Energy/battery/reserve/task/control/permission change or external
contact. EcoFlow AI and disabled Homey reserve execution unchanged. Private evidence
and receipts stay outside Git; source-only review used public code/sanitized evidence.
Local final receipt: ../work/output/dualct-11122-recovery-investigation-20261107T1412Z/FINAL_RECEIPT.md.

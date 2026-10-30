# 1.11.7 release readiness

30 October 2026. This is the current release-preparation index. Historical sprint
notes and the October 25 checklist remain evidence for their recorded scope.
Nothing here authorises installation, publication, controls or an Energy change.


## Published Test checkpoint

The owner subsequently authorised Test publication before the scheduled native
Development validation. **Test 1.11.7/build 74 is active**, verified 30 October;
Live remains 1.10.3/build 18 and installed Development remains 1.11.5. The reviewed
Dual CT listing wording was supplied as build-specific metadata in all three
languages, without modifying the approved archive or packaged README files.
See the newest handover/status checkpoint for exact-source CI, archive/server
repack comparison and preservation results. The checklist below retains its
pre-publication sequence as the preparation record; pending native/production
acceptance is not waived by this Test release.

## Frozen candidate

- Diagnostic runtime source: `5a59e97aefb9aae2445809028a0b4c4dff2569ea`.
- Exact recorded successful CI: [41123399129](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/41123399129),
  with 1,279 tests, lint, release checks and pinned Homey verified validation.
- Archive SHA-256: `f41f5d4b35a476e8440d7327936333338ac7ef814023921cb5657a024a8414e1`.
- Runtime fingerprint: `99f550936c891851fbcdb25fdb3b355dd099759cc5372384e9920a5fd7eb037c`.
- Includes [display settings](DUAL_CT_DISPLAY_CANDIDATE.md) and the
  [availability fix](DUAL_CT_AVAILABILITY_CANDIDATE.md).

The archive hash was rechecked during this preparation. No rebuild or substitution
is permitted under the existing archive-specific installation approval.
Documentation changes do not represent a new runtime or a native acceptance pass.
The recorded exact-source CI was not rerun for this documentation work.

## Readiness by checkpoint

| Checkpoint | Evidence / work remaining |
| --- | --- |
| Source and package | Fetched diagnostic branch was synced; approved archive hash matches. No runtime or dependency changes in this preparation. |
| Software boundaries | Fresh release-boundary check passes; fresh dependency audit reports zero known vulnerabilities. The existing complete software suite remains recorded against exact runtime source above. |
| Development delivery | Not yet installed. Conditional maintenance window is 31 October 2026, 17:05–17:25 GMT; proceed only after natural release and fresh ownership/idle checks. See current handover. |
| Native acceptance for Test | Widget availability, display round trips on mobile/desktop, additive capability changes, retained titles/history/Flows/Insights and nondecreasing counters. Genuine stale data must remain unavailable/unknown. |
| Test activation | Not authorised by this preparation. Last verified Test is 1.11.6/build 73; later approval must identify exact reviewed archive and changelog. |
| Production | Hardware readiness remains blocked; exact-runtime scope, independent Energy comparison, recovery and soak still need evidence. |

Installed Development was last verified as 1.11.5 and Live as 1.10.3/build 18.
Those are prior readbacks, not fresh live polling during this documentation work.
No install/restart, Homey mutation, portal activation, version/tag operation or
Mainline change was performed.

## Test acceptance and handoff

1. Apply the separately approved maintenance procedure only in its safe window.
   Keep an immutable immediate baseline and install receipt. Defer if unsafe;
   do not force battery release or repeat an uncertain installation.
2. Compare full identities/settings and expected additive capabilities, custom
   titles, Flow definitions/references, Insights identities, Energy inclusion and
   native counters. Record precise-checkpoint API visibility limits honestly.
3. Exercise display selections only, then restore the previous choices. Reopen
   native mobile/desktop views. SDK option readback alone cannot pass rendering.
   Three-phase display on single-phase hardware is not a three-phase wiring test.
4. Observe normal updates, widgets and any naturally occurring expiry/recovery.
   Do not manufacture a gap. Separate delivery outages from projection flicker;
   an absent natural expiry is unobserved, not a pass.
5. Review results and store-copy limitations below before requesting Test approval.
6. If subsequently authorised, verify the exact source CI and reviewed archive,
   upload receipt/version/build, Test activation, resulting listing/changelog and
   unchanged Live/installed Development separately. Do not run the generic version
   workflow: 1.11.7 is already prepared, and that workflow creates tags/releases.
   The generic publish workflow rebuilds source; it does not prove that the frozen
   reviewed archive was uploaded. Use a reviewed delivery procedure instead.

No backup restoration, rollback, Repair, pairing or control test is included in
these steps. Each needs its own explicit scope and permission if required.

## Draft Test changelog — not submitted

Dual CT: choose CT1 single/three-phase display and optional CT2 details per device.
Improves availability during normal reading updates while retaining stale-data
warnings. Existing counters, history and Flows are preserved. Display settings do
not change Energy accounting; three-phase Energy remains an opt-in community trial.

## Store-copy review before Test publication

The frozen package's English store text still says three-phase wiring is not
supported for Energy in this Test build. That predates the opt-in community trial.
It also describes 5000 Energy validation/consent limitations. Do not call all
Homey Energy support complete or quietly remove genuine limitations.

Prepare corresponding English/German/Dutch copy together. Review the 5000 claim
against actual admission and acceptance before changing it. Proposed English
replacement for the Dual CT paragraph, for review only:

> Smart Meter Dual CT offers a separate property meter for Homey Energy on model
> 421 with current firmware 1.0.0.41. Single-phase CT1 is the default. Three-phase
> CT1 is available as an opt-in community trial with additional setup consent;
> hardware validation is still in progress. CT1 must cover the property incomer.
> Review overlapping meters before adding a property Energy source. Import/export
> totals are estimates calculated from accepted live CT1 readings; reporting gaps
> are not backfilled. CT2 is excluded from property Energy accounting and may carry
> both solar and battery exchange. Independent display settings do not change the
> paired accounting mode. Keep existing paired devices and history.

Do not edit packaged README/configuration/assets or repack the approved archive
as a documentation shortcut. If replacement packaged copy is required, prepare a
separately reviewed archive with fresh provenance/checks and installation decision.
Any portal-only listing change also requires review and authorisation. No portal
edit or packaged README edit occurred here.

## Production gates and explicit scope

The [CT1 ledger](DUAL_CT_ENERGY_ACCEPTANCE.json) and
[5000 ledger](STREAM_5000_MONITORING_ACCEPTANCE.json) remain unchanged.
`release:full` currently accepts the Energy engineering shape but deliberately
fails exact-runtime hardware readiness. It does not independently certify all
original STREAM features, solar scope, Repair, or the three-phase community trial.

| Area | Evidence needed before the corresponding production claim |
| --- | --- |
| Single-phase CT1 | Aligned import/export/zero and independent interval-energy comparisons, timing/gap coverage, source overlap, native persistence/recovery and UI. Reference boundary, tolerances and interval alignment must be agreed before a test. |
| Three-phase | Current installation/firmware/phase assignment, coherent signed netting including opposing phases, partial/stale rejection, CT2 isolation, independent intervals, native recovery and soak. Use the [community trial](DUAL_CT_THREE_PHASE_COMMUNITY_TRIAL.md) and [evidence review](DUAL_CT_THREE_PHASE_EVIDENCE_REVIEW.md); retain experimental status until accepted. |
| Original STREAM | Final-runtime main/member roles after relinking, capacity/reporting scope, freeze recovery, history/Flow preservation and battery/solar attribution without double counting. |
| ES21 / ES22 | Unit versus aggregate scope, independent SOC/power/state freshness, charge/discharge/idle, accounting continuity and model-specific accessories. Older passes remain exact-runtime evidence; owner ES21 has no directly connected PV. |
| Upgrade / account | Native Repair/cancellation/failure and backup/rollback evidence where claimed, under separately reviewed permission. |
| Ordinary use | At least 48 hours on the final accepted runtime, with declared observation coverage and no unreported gaps; missing operating states remain missing. |

The owner's single-phase hardware cannot close Robert's three-phase gates. Robert
has now been invited in the existing private conversation, with explicit owner
send approval. No further repeated capture request is needed at this stage;
private correspondence and household measurements stay outside this repository.

## Soak plan ready for review — not running

Record the exact runtime, covered models/roles and immutable baseline, start/end
times, observation cadence and gaps. Use bounded local read-only observations;
do not start commands, additional requests/captures, forced reconnects or uploads.
Check meaningful errors, availability versus genuine stale warnings, independent
receipt ages, subscription/reconnect and resource trends, source overlap,
identities/Flows/Insights and monotonic counters with no downtime backfill.

Take a final preservation readback after at least 48 hours. Record absent export,
charge, expiry or recovery cases explicitly. Stop for review on counter rollback,
duplicate accounting, stale power presented as live, unexpected battery/settings
changes or crash loops. No automatic corrective restart, rollback or Repair.
A changed runtime requires a new baseline; incomplete observation is not a pass.
This document starts no observation or automation.

The release decision can explicitly narrow unsupported model/feature claims;
it cannot manufacture missing acceptance by relabelling old evidence. Test,
Mainline integration, certification and Live remain separate approval decisions.

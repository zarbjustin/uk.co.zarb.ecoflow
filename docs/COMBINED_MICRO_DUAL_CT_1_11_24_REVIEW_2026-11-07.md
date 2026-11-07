# Combined1.11.24 source candidate — 7 November2026

## Review result

**Source fixes prepared for the microinverter sparse-total behavior and Dual CT
false-overlap regression. Not installed, committed, pushed or published.**
Canonical diagnostic HEAD remains e9fef96ac5e2c5690246b7c5996fb76ccf3b8326 plus
reviewable source/docs. Fresh fetch found remote equal; prior dirty reports and
checkpoints preserved. Installed Development remains1.11.23. Test/Live,battery/AI/
Homey execution settings were not queried or changed in this source task. Prior
last authenticated channels remain Test1.11.21/build88 and Live1.10.3/build18.

These are software/synthetic results,not physical recovery or full-release signoff.
No new exact-commit CI or independent multi-model review exists for this uncommitted
candidate. Full release remains NO-GO; all hardware ledgers unchanged.

## Microinverter change

Previously a PV1-only or PV2-only update cleared the last complete total immediately,
causing availability loss even when its accepted total was only seconds old. Saved
field history supported this daytime pattern separately from current real offline
status. The driver now publishes a new total **only from a complete packet**.

Sparse updates retain the last complete accepted total with its original receipt
age/deadline. They never refresh its freshness, combine independent channel frames,
fill an absent channel with zero,or recover a persisted startup power value. Expiry
still uses the existing180-second freshness policy and normal expiry timer/SDK
write behavior. A sparse update also runs expiry; it cannot indefinitely hold power
by continuing to update only one channel. UI scheduling/SDK latency remains part
of later runtime validation; no exact physical sampling-time guarantee is implied.

Accounting stays stricter than display retention: every partial report resets its
energy anchor. A later complete packet anchors again without backfilling missing
intervals. Existing source-bound precise totals,unknown/read-only history handling,
ordering,clock guards,zero handling and teardown persistence remain. Explicit
complete zero is valid; a device that stops reporting still expires unavailable.

Tests cover initial/interleaved partial fields without a complete total,retained
original ages,actual availability across sparse traffic,expiry despite ongoing
PV2 updates,complete zero recovery,no gap integration,failed expiry clears/retry,
source/counter floors and existing receipt ordering. The prior failed partial-clear
regression was adapted to a real expiry-clear failure; its failure/retry protection
was retained rather than silently removed.

## Dual CT change and important role contract

On installed1.11.23,SDK getSettings omitted Homey-managed Energy flags. The original
Office/shed meter was independently verified excluded via Web API,but the reader
interpreted missing flags as included and falsely raised grid_source_overlap.

SDK-owned rows are now explicitly distinguished from Web API inputs. When the
SDK reports sufficient actual inclusion/exclusion flags,those flags control the
check. A visible included-property conflict always blocks even if a manual role
claims not included. Excluded/downstream flags remain non-contributors. Malformed
metadata,duplicate identities and unknown inventory remain blocked.

When inclusion cannot be read,the reader does **not** guess included or excluded.
It requires an explicit app-local **Homey Energy meter role** review on the other
cumulative EcoFlow meter. The new native dropdown is declared on original Smart
Meter and Dual CT Energy drivers in EN/DE/NL:

- Not reviewed (default): SDK-unknown roles block with energy_role_review_required.
- Included as a whole-property meter: blocks a competing property source.
- Excluded or configured as a submeter: allowed only as an owner declaration that
  the meter has already been configured that way in Homey Energy.

This setting does not change Homey Energy inclusion,device Energy declarations,
capabilities,Flows,counters or wiring. It is a **manual declaration,not independent
SDK verification**. Review it again after Energy inclusion/wiring changes: the SDK
cannot automatically detect subsequent changes to hidden platform flags. This
replaces the previous overstatement of automatic EcoFlow-owned inclusion checking.
External-meter review remains a separate mandatory pairing acknowledgement.
No broad Homey API grant,companion requirement or hidden token reader is added.

The selected existing Dual CT is excluded exactly once from its own peer-overlap
inventory and does not require its own review. Other cumulative EcoFlow meters do.
Standalone support inventory scans include all paired meters (including the selected
meter); their raw review counts are not that selected device's admission result.
Use per-device recovery status for the actual admission decision. No hardware
qualification or source contract is inferred from a role declaration.

Runtime role-review failures now show a translated actionable instruction rather
than only generic reconnecting. Scheduled retry behavior is unchanged. Pairing
reports the same translated requirement before issuing consent; changes to roles
that alter admission invalidate later confirmation. No role is defaulted excluded,
no historical consent is silently converted into a new role review,and no binding/
checkpoint is migrated. Source identity/firmware/three-phase consent and process-wide
one-source authority guards remain intact.

## What your household would need after a separately approved update

The code fix deliberately does not silently commission the Office meter. After
reviewed installation it will wait for the app-local role review. The proposed
single additional non-battery setting is on the **existing original EcoFlow Smart
Meter measuring Office/shed**: property_meter_role from absent/unreviewed to
not_included,only after a fresh read confirms its existing Homey Energy exclusion/
submeter configuration. Leave energy_exclude and energy_cumulative_include unchanged.
Do not change the selected Dual CT's role,accounting mode or Energy inclusion.

That review is an additional action for fresh owner approval; it has **not** been
applied here. It does not send EcoFlow commands. The original-meter settings handler
only performs source/poll work for meter_source/poll_interval changes; role review
adds no vendor command or forced reconnect. Let existing scheduled Dual CT retry
observe the new SDK-visible app setting naturally. Exact runtime readback must
confirm visibility,admission and fresh power; if it does not,hold for review.

The app cannot verify an incorrect manual declaration when platform flags are
unavailable. The review workflow and owner responsibility must be accepted explicitly;
do not advertise this as unchanged automatic conflict detection.

## Preservation and verification

Metadata comparison to HEAD matches after removing only version and the two new
property_meter_role declarations. Driver IDs,capability IDs,Flow cards/arguments,
Energy declarations,permissions and existing setting definitions remain unchanged.
New native settings default unreviewed; old values/counters/Insights IDs are not
removed. Adding these declarations may introduce the new default key during a
future approved update; include that expected difference in preservation readback.
No live preservation pass for1.11.24 is claimed before installation.

Ten new regressions were added. Five new cases failed against the pre-fix source
and pass after implementation. **Full suite:1,539 passed**,no failures/skips/cancels.
After refining the existing failed-clear regression to expiry,the final17 micro
lifecycle tests also passed. Pairing browser tests include the translated role
failure. Real driver/default-SDK startup with a reviewed excluded Office peer
preserves25/1 synthetic kWh checkpoint floors; unreviewing the peer blocks again.
Single-phase and separately consented three-phase source contexts are tested without
promoting three-phase hardware qualification. Release mutations reject defaulting a
new role to not_included or dropping required choices.

Node22.23.4 committed-lockfile npm ci,lint,release:check,whitespace and pinned
Homey CLI4.5.3 verified validation passed. Dependency audit found zero vulnerabilities.
Compiled microinverter/Dual CT driver entrypoints and owned reader match the validated
package. `release:full` still exits1 for open hardware gates; no ledgers weakened.

Runtime-source fingerprint:
`6ecc251ecf25b7ffd34e62f8c2573806a3136a045d936702cbd25010bd245df8`
Review archive SHA-256:
`c02bffcae1d6cd3a18221e494ecac65a898cf8c749d816efb09b42cadd55e97c`
Review archive:
../work/output/combined-micro-dualct-11124-20261107T1710Z/package-review/candidate-reproducible.tgz
Public-source export manifest SHA-256:
`1a87d41a4764dffa5ba6651c9890fa905f0d2f0a9dd9add9b29e5979d7458780`

Public-source-only export,full per-file manifest and patch retained locally. Two
normalizations of one CLI archive are identical; no independent rebuild claim.
The earlier package/ is an intermediate artifact; package-review/ is the review
candidate. Later sanitized review/handover text is outside the exported snapshot;
runtime identity is unchanged. Private originals/credentials were not loaded into
remote model context or exported; no raw household material in Git.

## Next review / bounded validation

1. Review source and the explicit meter-role responsibility. Commit/push and exact
   CI require separate owner instruction; no such action in this task.
2. Before installation,approve the exact artifact and fresh target-specific safety/
   preservation baseline/rollback review. A non-clean household app update restarts
   readings for all its EcoFlow devices. Existing AI ownership/disabled Homey reserve
   execution must remain; no battery changes or automatic rollback.
3. Separately approve the single Office meter role declaration above if intended.
   Verify existing Energy inclusion and native app setting visibility first; do not
   modify built-in Energy flags. No re-pair,Repair,manual counter rewrite or controls.
4. Observe natural Dual CT recovery and micro complete/sparse/expired behavior using
   existing reports. Preserve identities/titles/settings/Flows/Insights and counter
   floors. Low-light/current-offline micro observations do not validate daylight
   partial reports; normal SDK timestamps are not physical receipt times.
5. Keep model/role/phase/native/interval/48h hardware gates open until independently
   demonstrated on the exact approved runtime. Test/Live unchanged without approval.

Local receipt: ../work/output/combined-micro-dualct-11124-20261107T1710Z/FINAL_RECEIPT.md.

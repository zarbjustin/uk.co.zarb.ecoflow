# Sprint 5 AI-owner Development delivery — 6 November 2026

## Outcome

Owner explicitly approved the revised execution pause, retained native AI
ownership and exact non-clean Development delivery. Both Homey execution switches
were disabled and verified; the reviewed candidate was installed once. App is
running. **Preservation is not fully accepted:** the first readback observed a
4 Wh decrease in STREAM Solar's cumulative generated-energy capability.
Later normal generation recovered above the baseline, which does not erase the
startup continuity failure. No further hardware experiments or soak were begun.

## Executed scope and provenance

Fresh source/fetch still matched `169495793b8932dc6565db546ccd008081032ae6`;
reviewed production is `e8c48fea948ab3adc82c26bfd1a1db93215812aa`.
The exact HEAD CI was rechecked successfully before installation.

The pinned dedicated Advanced Flow's `enabled` and only the execution config's
`enabled` field were changed to false. The complete private before/after baseline
verified those exact two changes only. Existing fault/history/expected values,
native completed lease, app control gate, all other config fields and the current
resident runner were preserved. Six legacy reserve cards remained unconditional
no-op delegates. There was no manual Flow execution or reserve command.

Pause verified **10:17:02 UTC**. Immediate full pre-install baseline was then
captured. Exactly one non-clean/debug-false devkit delivery was acknowledged at
**10:17:35.733 UTC** (see exact local acknowledgement timestamp). App metadata
and new-session readback confirm running Development **1.11.20**.

- Delivered archive SHA256: `73c6aa47496d745a2081af53ae19db442d5f8bc1fc4ca2a65503ac809b9d9df4`.
- Source fingerprint: `81fab286a28569d7c1bd7f9fb714ebf43ddaee296cca61c6a142c6a56adacbe0`.
- Preserved resident runner SHA256: `874a2c6c69e1d488e9143a051290bd00fc118429302e7d94631c1bf963b4c8d7`.

This establishes archive delivery provenance and runtime readback, not an
independent installed-filesystem rehash. The historical recovery artifact remains
available and unexercised; no automatic rollback or counter correction occurred.
The original candidate manifest and previous receipts were not overwritten.

## Preservation findings

Readbacks at **10:17:47 UTC** and **10:20:44 UTC** compare against the immediate
pre-install full baseline:

- All 15 EcoFlow device identities and all household device IDs retained.
- Names/zones/notes, settings, capability identities and other compared metadata
  retained. The only definition differences were `capabilityMetadata/iconObj/url`
  (182 capability URLs across 14 device records). Other icon-object fields matched;
  URL paths also changed. Preserve these findings rather than treating the initial
  full-definition comparator as a pass. Independent icon rendering is unverified.
- All 101 standard/advanced Flow definitions preserved after the approved pause;
  zero newly broken Flows. All 1,217 Insights log identities retained.
- Whole-Homey Energy definitions and global app-setting equality hashes unchanged.
- Both execution switches remain off; all other config fields, execution state,
  historical fault, native lease and app gate match the paused baseline.
- Ten cumulative meters were finite/comparable in each readback. One STREAM Solar
  `meter_power` value was **4 Wh lower** at first readback; the other nine did not
  decrease. By the later read all ten were at/above baseline. This does not prove
  there was no intervening decrease on the other meters or accept full continuity.

The bounded validation stopped at this preservation exception. No full 30-minute
success, 48-hour soak, counter rewrite or gate closure is claimed.

## Confirmed source failure mode; persistence cause remains bounded

Packaged `drivers/stream_solar/device.js` was replayed locally with a synthetic
fake base, no network/hardware and attribution discovery stubbed out. Stored
generation was seeded to 123,000 Wh while the persisted projected capability was
123.004 kWh. Real `onReady()` overwrote the capability with 123 kWh, reproducing
the 4 Wh decrease. This is a positive reproduction of an existing startup defect,
not a passing preservation regression or a source fix.
It does not establish that the reviewed sprint changes introduced the defect.

Current `drivers/stream_solar/device.ts` restores `generatedWh` solely from its
store and immediately writes `meter_power`, without reconciling a higher
same-source projected total. `EnergyCheckpoint` coalesces writes and supports
teardown flushing, but the historical installed store/flush sequence was not
independently traced. The reproduction is consistent with the hardware result;
do not claim a captured physical checkpoint race or storage failure as proven.

Next engineering priority: preserve a valid higher same-source solar projection
on startup, with explicit source/invalid-store policy and checkpoint/teardown
regressions. Do not transfer counters between installations or silently seed
missing values. Prepare source/tests and review a new exact archive separately;
do not repair the installed counter manually under this delivery approval.

## Native ownership and channel checks

Fresh subscription configuration after delivery continued reporting
`intelligent_plus` for both physical 5000 records and the aggregate, with known
fresh task-list reports. No mode/task/reserve/limit write was issued. This supports
retained AI mode; it is not an independent native display/power accuracy pass.

The native EcoFlow Mac process was running. A read-only Accessibility text query
of its existing front window exposed neither matching complete unit identity nor
an AI/Intelligent+ label. No navigation, screenshot, setting edit or native
comparison acceptance followed. Original/raw UI text remains restricted locally.
Phone/widget and Energy UI confirmation, matched-unit native comparisons and
unavailable natural states remain unverified.

Read-only store listing at **10:22:43 UTC** reports **Test 1.11.20/build 87** and
**Live 1.10.3/build 18**, matching prior published records. No store mutation or
Mainline operation was performed.

## Local evidence and next state

Restricted evidence directory:
`../work/output/copilot-bug-bash-2026-11-06/sprint-5/ai-owner-installation/`.
Use `delivered-manifest.json`, pause/install receipts, readback projections,
`initial-difference-projection.json`, `continuity-review-projection.json`,
`solar-startup-replay.json`, `native-ui-projection.json` and `channels-projection.json`.
Full before/after inventories, selected state, UI text and process logs remain in
its restricted `private/` directory; do not upload/index/read into hosted context.
Only deterministic metadata/failure projections were exposed to the hosted model.

An initial local helper hashing failure occurred before any pause/install intent
or live mutation. Handling for an undefined metadata value was corrected locally;
the subsequent pause succeeded. No installer retry occurred. The synthetic replay
and local helper syntax/whitespace checks ran; no production source was changed
and no new full test-suite pass is claimed. Acceptance JSONs are unchanged.

**Leave Homey reserve execution disabled.** Do not clear its historical ownership
fault, reset counters, reinstate old reserve targets, resume the runner, roll back
or repeat installation automatically. Native EcoFlow AI remains the owner's chosen
controller. General release, exact-candidate upgrade preservation, normal-use soak,
ES22 and three-phase physical acceptance remain open. Handover/status are updated
locally only; no commit/push is included. Lease/index outcome belongs to the local
final receipt.

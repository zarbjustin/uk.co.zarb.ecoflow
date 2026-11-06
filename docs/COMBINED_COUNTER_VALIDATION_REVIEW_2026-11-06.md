# Combined startup-counter validation candidate — 6 November 2026

## Ready for review, not installed or published

The owner authorised final source review, commit/push on the diagnostic branch,
exact CI and local preparation of a combined validation archive. No live operation
was authorised. The installed app, Store Test/Live, Mainline and native EcoFlow AI
were not queried or changed during this preparation.

Source commit: `003f2c4aee9c58aeeda7ad907b4c06f1dc8c832d`.
[Exact source CI 42224824156](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42224824156)
passed every step: lockfile install, Chromium preparation, tests, lint, release
checks, audit and pinned Homey verified validation. The owner-continuity records
were deliberately committed with the intended source/tests; no unrelated work
or private evidence was staged. No force-push/rebase/reset or branch switch.

## Exact artifact

- Version: **1.11.20**; identify by archive hash, not the unchanged version.
- Archive: `ecoflow-stream-1.11.20-combined-counters-003f2c4.tgz`.
- Archive SHA256: `5a8daa62475500e210991ea6428024b703a72b8f7529aa5ce8eca61da30955ff`.
- Source fingerprint: `89ad4da2352e91baade7a0f5150688fe2d120faf832901abf62b6875c6e3f1af`.
- Compressed size: 10,831,168 bytes; 2,058 packaged files.

Private/local artifact and exact target review directory:
`../work/output/combined-counter-candidate-2026-11-06/`.
Start with `candidate-manifest.json`, `archive-verification.json` and
`OWNER_REVIEW.md`. Files are outside the public repository, not store uploads.

A clean Git export of the exact source commit was built with Node 22.23.4,
committed-lockfile `npm ci` and Homey CLI 4.5.3 preprocess/verified validation.
Archive inventory excludes `env.json` and private evidence paths. Compiled app
matches the isolated build; compiled `app.js` and `api.js` match the last-recorded
installed archive. That comparison covers those entrypoints, not every imported
module or an independent hash read from Homey. All four counter driver/module
outputs are present. Current runtime source fingerprint matches the clean export.
Final handover-only commit/CI and lease/index receipts are recorded externally.

## Combined behaviour and review limits

Includes the previously committed solar repair and the microinverter/original
battery/STREAM 5000 repairs in [the targeted report](STARTUP_COUNTER_PATHS_2026-11-06.md):

- Solar/microinverter preserve genuinely newer same-source projected totals,
  precise Wh, coherent source-bound state and safe partial-persistence recovery.
- Original battery restores a newer same-source floor and re-anchors only its
  affected native raw counter, preserving native-counter authority and avoiding
  double-counting. Unknown/foreign history is not blindly merged into that source.
- Rounded native bins do not create fractional energy or trigger a displayed
  startup decrease; STREAM 5000 physical monitors remain separate from Energy
  aggregates. New counters or Energy sources are not introduced.

Full local suite **1,471/1,471** passed before source sync; validation hashes
matched at review/commit. No production changes followed that validation.
Coordinator final review found no further blocking issue; the new counter diff
has not had a separate multi-model review. The earlier solar model reviews do
not approve it, and exact MAI Preview mapping remains unattested. Software passes
do not prove the old physical storage/flush sequence or close hardware gates.

## Proposed separately approved household validation

One non-clean Development installation of this exact archive, `clean=false`,
`debug=false`, on the owner-named household Homey, followed by a bounded read-only
session of up to 30 minutes. An update restarts the whole EcoFlow app and briefly
interrupts readings for all its paired devices and any dependent automations.
This document does not approve that installation or any additional restart.

Prerequisites immediately before any approved delivery:

1. Recheck exact target, candidate/recovery hashes, source/CI, app state and any
   previous attempt/receipt. Never repeat an uncertain installation blindly.
2. Both existing Homey reserve-execution switches must already be disabled.
   Preserve their current configuration, resident runner and original fault/history.
   No run lock, pending intent, active native command, stopping state or
   uncompleted/faulted native lease may be interrupted. Do not release reserves,
   edit leases, clear faults, execute Flows or change native settings to create
   an idle window. A new/different fault or changed owner requires review.
3. Keep EcoFlow AI/Intelligent+ in charge. The owner-explained historical ownership
   fault may remain preserved under the previously reviewed AI-owner maintenance
   policy; do not clear it or require a match to the old Homey reserve expectation.
   Native AI can change reserves naturally. It is not a manual settings-write
   authorisation. If current ownership/configuration is uncertain, defer.
4. Capture a fresh restricted full preservation baseline: identities/data,
   settings/names/zones/custom titles/capabilities, complete standard/advanced
   Flows, Insights identities, Energy definitions, cumulative/daily history
   coverage, global-setting equality hashes and available precise checkpoint
   health. Record inaccessible store/backup details as unknown, not as preserved.
   Historical counts (15 devices/101 Flows/1,217 Insights) are observations, not
   assumed current inventory. Independent stores are not fully exposed by these
   read-only APIs; Git source and an archive are not a complete Homey backup.

After delivery, capture the first available cumulative values promptly, with a
small bounded read-only startup observer if approved as part of the validation.
Use at most one inventory GET per second for the first two minutes; stop on
throttling/errors and retain transient unknowns. Avoid simultaneous full support
exports or new MQTT observers. Record pre-install/acknowledgement/readback times
and distinct Homey/Mac clocks; do not infer sub-second ordering from clock skew.

Normal generation may mask a dip quickly. A finite sampling cadence cannot prove
that no shorter dip occurred: report the actual first observed sample/coverage,
not absolute uninterrupted monotonicity. Never force darkness, disconnect PV,
change battery tasks/reserves, switch native mode or operate loads to make the
counter easier to test. Stop and report any observed cumulative decrease without
manual correction, automatic reinstall or rollback.

Then compare the full baseline and available checkpoints after ordinary startup
and by the session end. Retain fractional versus projected-bin precision as
separate evidence; daily rollovers are not cumulative-counter failures. Verify
only expected icon transport URL changes, preserving semantic metadata where
exposed; otherwise request owner rendering confirmation rather than waive a
definition difference. Keep the previous 4 Wh solar dip recorded as a failure
of its older runtime, not retroactively repaired by source success.

Owner-assisted checks: current native physical-unit/system membership and mode;
near-time per-unit versus aggregate SOC, signed battery watts/state; Dual CT CT1
role/direction and existing Energy inclusion; phone/widget SOC, unavailable/recovery
and icon rendering. Keep raw native readings/screenshots/identities local and
project only sanitised comparison outcomes into hosted model context. Opening
EcoFlow can prompt reports; document it. Do not infer aggregate power into a
scope-unverified physical unit or use single-phase observations for three-phase.
Unobserved natural states remain unverified; no independent energy accuracy claim
from integrating the same watts used by the app.

## Recovery and completion boundaries

Frozen last-recorded installed archive is available locally as
`last-recorded-installed-development-73c6aa47.tgz`, SHA256
`73c6aa47496d745a2081af53ae19db442d5f8bc1fc4ca2a65503ac809b9d9df4`.
It contains the known solar startup defect. It is a recovery option for separate
review, not an automatically safe rollback, current installed-filesystem proof,
or store backup. Older code can ignore coherent records and restore lagging scalar
mirrors; review live counter/checkpoint compatibility before any rollback. Restoring
an old whole-app backup can roll counters back. No rollback has been tested here.

After success OR failure, leave both Homey execution switches disabled and native
AI ownership intact. No account Repair, pairing, battery/settings/task/reserve
write, new Energy activation, control/Flow execution, forced silence/reconnect,
automatic fault clear, counter rewrite, publication or Mainline change. No 48-hour
soak/automation starts under this preparation. Review initial hardware results
before authorising a separately bounded ordinary-use soak. All acceptance ledgers,
ES22, three-phase, independent native/accounting and lifecycle gates remain open.

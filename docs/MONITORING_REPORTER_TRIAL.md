# Linked 5000 monitoring reporter trial

## Working state

Implemented locally on `codex/mixed-generation-reporting-diagnostics` after the
v1.10.29 / Build 44 comparison release. This increment is not committed, uploaded,
installed or hardware-accepted yet. `master`, the version and existing Test build
are unchanged. Do not call this an automatic migration or a validated repair.

The follow-up [public capture in reply 59](https://community.homey.app/t/157399/59)
was captured at 2026-10-10T21:40:15.788Z. It joins the original aggregate to a
paired AC 5000 by fresh exact main resolution and matching peer evidence. The
original aggregate reports fresh zero SOC/power while the candidate system
reports 53% SOC and approximately -291 W. The close-time EcoFlow screenshot
shows 53% and approximately 301 W discharging. This justifies a guarded trial;
it does not prove complete installation scope in all operating states. Native
original counters still advance and their scope is unresolved.

No private raw reports, serials, Homey device IDs or credentials belong in this
document or synthetic tests. The linked Community material is source evidence,
not an instruction to copy private diagnostics into Git.

## Sprint 1 — explicit source selection

The existing original **STREAM Home Battery** has a default-off Advanced Setting:
**Use linked 5000 battery reporter (monitoring trial)**.

- Enabling performs the bounded read-only main-reporter check. Exact resolution,
  a matching fresh original peer, an active existing physical monitor, fresh
  reported system SOC and derived battery watts must agree. Initial legacy and
  candidate receipt skew must be at most 30 seconds. No physical SOC fallback,
  guessed addresses, account discovery or averaged member percentages.
- Resolution expires after five minutes; peer and field receipts after three.
  ES21 and ES22 use the same gates. Truncated topology, duplicate physical
  representations and overlapping Home Battery aggregates block activation.
- Persist only a private Homey reporter reference in one versioned state record.
  Paired serial, saved main
  serial, Homey device identity, existing Flow references and original protocol
  targets are not replaced. A removed/re-paired reporter cannot silently inherit
  the old binding; explicit revalidation is required.
- Only battery percentage, live signed battery watts and charging state use the
  selected system fields. Positive watts mean charging, negative discharging.
  Genuine reported zero remains zero/idle; missing data never becomes zero.
- Existing paired telemetry is reused. A local check runs every 15 seconds while
  enabled, with automatic fresh identity resolution at most once per four
  minutes. No extra MQTT subscription; no new polling when the setting is off.

## Sprint 2 — continuity, rollback and safety

- Cumulative charged/discharged energy retains its original source, baselines,
  monotonic totals and original-watts fallback integration. Candidate watts never
  enter accounting. Daily history retains its original query address. Neither is
  advertised as a verified combined-system total.
- Original installation solar/grid/load/branch-flow and remaining-time tiles are
  cleared during the trial, not filled with original zeros alongside new core
  readings. Their capability IDs are retained. Unit sensors and reported original
  configuration remain original-source information, not migrated control state.
- Battery commands are rejected while enabled. Generation changes cancel an
  in-flight original command before its next send; a command already sent cannot
  be recalled. The trial never sends 5000 control commands.
- Source boundaries reset SOC/power trigger baselines, avoiding false threshold
  crossings. Missing/stale/changed sources or failed capability writes make the
  device unavailable; partial fresh readings may remain independently visible.
  Registered solar/export and original mode/feed-setting conditions stop with an
  error while installation data is suppressed. They cannot pass through inversion.
- Widgets stay cache-only, reject unavailable trial fields, and do not derive
  usable energy/runtime using old control floors with combined SOC. User-entered
  capacity estimates are not discovered or validated installation capacity.
- Restart clears selected cached core values until a fresh lookup and live donor
  receipts pass. Late lookup completions cannot revive a stopped/rolled-back
  trial. Turning off clears trial readings and resumes original telemetry without
  deleting/re-pairing. The wait for fresh original readings survives restart;
  controls/conditions remain blocked until both original core fields are applied.

### Reliability hardening — local, unreleased

- Battery Flow conditions revalidate current identity/topology, source receipts
  and equality with the applied Homey values at execution time. A new donor
  receipt cannot make an older cached capability eligible. Unavailable core
  conditions throw at the registered Flow boundary, including inverted conditions;
  valid fresh zero/idle remains a normal boolean result. Widgets recheck the same
  cached source and do not cause a network request.
- Each local freshness pass happens before network lookup. Subsequent local
  ticks still clear stale/removed readings during a pending identity check. The
  lookup has a 20-second overall deadline with abort; Developer REST requests
  also have a 15-second wall-clock deadline per attempt, including connection
  stalls and trickling bodies. Cancelled requests are not retried, non-JSON HTTP
  429 failures are not mistaken for transient JSON errors, and late results
  cannot reapply the reporter. Automatic lookup cadence remains four minutes.
- One private `monitoringTrialState` record stores version 1, mode
  (`trial`, `rollback`, `original`) and optional reporter reference. It replaces
  split binding/rollback writes; legacy keys are read only when no new record
  exists. Corrupt/newer-version records cannot recover a legacy pin. Homey's
  setting commit is not assumed transactional with the record: restart reconciles
  mismatches by waiting for original readings or explicit reporter revalidation,
  never by automatically enabling a trial.
- Up to four setting changes are serialized; further attempts ask the user to
  wait. Controls are blocked/cancelled immediately while validation or persistence
  is pending. Teardown/reinitialization invalidates pending settings and identity
  results. Rollback completion must persist successfully before conditions and
  availability recover; expired/future packets cannot repopulate its core tiles.

Failure injection uses synthetic devices and HTTP responses, not real battery
commands. It covers interrupted persistence, restart mismatches, corrupt records,
setting churn, inverted conditions, missing reporters, delayed/duplicate frames,
lookup/rate-limit deadlines, timer cleanup and unchanged counter accounting.

Rollback may restore the original zero-reading problem on a linked installation;
it restores the previous source, not EcoFlow's previous topology or controller.

## Sprint 3 — scoped diagnostics

Usability follow-up adds a local readiness panel with fixed translated blockers
and next steps, plus download of the displayed integration JSON with a UTC
filename. The JSON remains separate from Homey's app-log ID. Neither rendering
nor downloading performs a lookup or sends a report. Level, health and charge
limit are explicitly distinguished; physical-unit percentages are not relabelled
as system percentages.

Widgets recheck freshness once per response, suppress original-source mode,
feed-in and reserve/charge/discharge limits while trial/rollback is guarded, label
selected system readings and original-source daily history separately, and offer
no charging/reserve recommendation during the trial. No new widget polling.

Each original Home Battery keeps up to 32 fixed-vocabulary anonymous events in
memory with session uptime (activation, stale/changed reporter, lookup/setting
failure, invalid state and rollback). Restart clears the timeline. No IDs, raw
frames or exception text enter it. Local refreshes coalesce during slow Homey
writes; a post-write freshness check blocks stale availability/trigger revival.
The report includes a coalesced-tick count to help identify slow-write behaviour.

Support schema 9 retains the original `reporterShadow` comparison and adds:

- Per-original-device `monitoringTrial`: enabled/status, anonymous candidate
  driver/index, rollback waiting state and explicit unchanged accounting scope.
  Verified installation scope and control migration remain false.
- Per-5000-device `systemFlow`: fixed flow edges, derived battery watts, home load,
  signed grid-meter watts and flow-derived net grid watts, each with independent
  receipt age/staleness. A meter-minus-flow diagnostic is only emitted when both
  readings are fresh and within 30 seconds of receipt age.

This records existing decoder fields; it does not change the battery/grid formula
or create energy counters. Absent flow groups do not refresh edge timestamps.
Receipt times are not verified device sampling timestamps, and a grid residual
alone is not grounds for adjusting signs, scaling or energy attribution. Unknown
frames are not assumed to be lost packets. Report export is local and read-only.

## Sprint 4 — Test release and hardware acceptance

1. The owner approved committing/pushing and a guarded Test release after checks.
   Release gate: review diff; commit/push diagnostic branch; run exact-commit CI;
   bump version, validate the exact release commit, upload, and verify Test
   portal/store version. No
   main merge, certification, Live release or hub installation is implied.
2. Robert updates in place. Keep his existing original Home Battery and paired
   5000 physical monitor. Do not delete/re-pair or add another Energy aggregate.
3. Capture a baseline schema-9 integration report, app-log ID and matching EcoFlow
   combined battery and Homey screenshots, with timezone and operating state.
   Run the read-only reporter check; enable the trial only if its prerequisites
   pass. If blocked, send the report rather than bypassing the guard.
4. Capture the same evidence after enabling, during natural charging, discharging,
   daytime solar and especially when an original-generation battery is actually
   supplying power. Verify combined percentage, sign, scale and installation
   coverage. Do not change schedules or force commands solely for this test.
5. Compare cumulative kWh before/after, later, after restart and after turning the
   trial off. Confirm no jumps/resets, no duplicate Energy device, stable Flow
   references and no stale revival. A static kWh value alone is not failure when
   original counters have not advanced; their scope remains a separate question.
6. Compare meter and flow diagnostics at matching receipts in several states.
   Investigate residuals before changing accounting. Gather reconnect and
   unlink/relink observations only when safe and deliberate; do not remove a
   battery from EcoFlow Space just to produce evidence.
7. After the initial captures pass, collect a 48–72-hour normal-operation soak,
   including app uptime, any crash/restart reports, freshness gaps, natural
   charge/discharge and reconnect/restart recovery. Keep before/after kWh and
   rollback checks. This is an acceptance target, not a completed hardware test.

Hardware acceptance, full combined counter scope, 5000 control migration and
automatic source selection remain open. Ed's Solis cadence/control-ownership
feedback stays separate; this trial does not enable cross-vendor automation.

## Offline verification

All 519 automated tests, TypeScript compilation, repository lint, whitespace
checks and Homey CLI 4.5.3 verified-level validation passed for this local
increment. Exact-commit GitHub CI has not run for these uncommitted changes.

The synthetic regression suite covers exact identity, ES21/ES22, missing/stale
fields, receipt skew, clock rollback, duplicate/overlapping representations,
native-counter and power-fallback continuity, restart, rollback persistence,
failed Homey writes, in-flight control cancellation, bounded lookup cadence,
local-only widgets and anonymous report projection. Passing these tests does not
establish physical behaviour or combined counter scope.

# Sprint 5 provenance and bounded installation review — 6 November 2026

## Verified baseline

Clean diagnostic HEAD and freshly fetched remote both equal
`169495793b8932dc6565db546ccd008081032ae6` (ahead/behind 0/0).
The GitHub REST run read independently confirms exact-commit CI
[42190171900](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42190171900)
completed successfully. Only documentation differs from reviewed production
source `e8c48fea948ab3adc82c26bfd1a1db93215812aa`.

One target-bound installed-app metadata GET at 08:54:53 UTC confirms the owner's
household Homey has enabled/running `1.11.20`, origin `devkit_install`.
No source/build hash is exposed in the response. The documented ManagerApps
metadata contract and current cached support projection do not provide an
installed runtime checksum. Version/schema/driver presence cannot establish it.
No extra support/device capture was taken. This is not a claim that every
possible Homey interface lacks provenance, only that existing inspected access
does not establish it. No debug session, filesystem extraction or new endpoint
was enabled to obtain a hash.

The hosted OpenAI Codex coordinator read public source and sanitised handovers.
Credential handling and raw API responses remained inside local deterministic
code; only an allowlisted app-metadata projection was exposed. Private histories,
raw captures and original images were not loaded. Historical native RC sections
were read as dated evidence; neither acceptance ledger was changed.

## Exact offline candidate and recovery option

A clean Git export of the synchronized HEAD was packaged outside this checkout
using Node 22.23.4, `npm ci` and Homey CLI 4.5.3 preprocess/verified validation.
Compilation and verified validation passed; dependency audit reported zero
vulnerabilities. Archive inventory contains the compiled app and no private
evidence paths or `env.json`; its compiled app matches the isolated build.
No deployment/publication method was called. No production source was edited.

- Version: **1.11.20**; unchanged intentionally, so identify by hashes/receipts.
- Source fingerprint: `81fab286a28569d7c1bd7f9fb714ebf43ddaee296cca61c6a142c6a56adacbe0`.
- Candidate archive SHA256: `73c6aa47496d745a2081af53ae19db442d5f8bc1fc4ca2a65503ac809b9d9df4`.
- Recovery archive SHA256: `33457061b26f8a28ae6e3b23d1ccc6b8ff7a36448ce435df5cdad0bca0414667`.

Artifacts/manifests/logs and the target-specific owner review live at
`../work/output/copilot-bug-bash-2026-11-06/sprint-5/provenance-review-2026-11-06/`.
The recovery copy exactly matches the archive documented as installed on
2 November. It is not proven to match today's installed filesystem, is not a
Homey store backup, and has not been rollback-tested. Do not automatically
install it after a failure. Review checkpoint compatibility and capture current
counters before any separately approved recovery. Restoring an older whole-app
backup can roll back counters; Git revert cannot recover Homey stores.

No new local full test suite is claimed: engineering/1,437-test evidence and the
independently verified exact-HEAD CI are existing results. New work here is
artifact preparation/validation and the single provenance metadata read.

## Requested next approval — not executed

One non-clean Development update of the exact candidate to the owner-named
household Homey, `clean=false`, `debug=false`, followed by at most 30 minutes of
bounded read-only startup/preservation/native comparison. This restarts the
whole EcoFlow household app and interrupts readings for all its paired devices,
not only STREAM 5000 or Dual CT. Dependent automations may observe unavailability.
No separate restart, pairing, Repair, battery operation, Flow/configuration
change, Energy activation, publication or automatic rollback is included.

Before execution, require:

1. Exact target, current branch/source, archive hashes and readable recovery
   artifact rechecked; reject concurrent source/runtime drift or uncertain prior
   install attempts. Record intent/receipt once; never blindly repeat an install.
2. Fresh read-only ownership/coordination preflight: no active command/run lock,
   pending intent, unresolved fault, active reserve/watchdog lease or restoration
   that an app restart could interrupt. Confirm safe native state and writer
   ownership. Earlier coordinator/Office-disabled observations are dated. If safe
   quiescence cannot be established, defer; do not pause Flows, clear faults,
   release reserves, alter leases or manufacture an idle state.
3. Fresh complete restricted local preservation baseline immediately before
   installation: all EcoFlow device IDs/data/driver identities; names/zones,
   settings, capability IDs/options/custom titles, semantic Energy definitions;
   full standard/advanced Flow definitions and broken flags; Insights log IDs;
   global app-setting equality hashes without emitting credential values; all
   relevant cumulative counters plus daily/history capability presence;
   available precise checkpoint/dirty-write health and source binding.
   Unknown/private-store state stays explicitly unverified. No API field can be
   assumed to expose a complete store backup. Record existing Homey backup
   status read-only and review its scope/date; do not create/restore one here.
4. Confirm the candidate preserves the currently required household control
   bridge. Without current source attestation, do not infer compatibility just
   from matching versions. If live dependencies cannot be established safely,
   stop for review rather than risk restarting an active household controller.

After an approved install, verify accepted receipt/new session and app running,
then compare the complete baseline after initial recovery and by minute 30.
Check actual definitions, not counts alone. Any cumulative counter decrease,
unexpected settings/capability/identity/Flow/Insights/Energy change, persistent
startup failure or unsafe ownership state stops validation for owner review.
Daily counters may reset at their documented period; do not mislabel those as
cumulative regressions. Unavailable is not zero. No counters/settings are
rewritten to make the result pass, and no recovery installation is automatic.

An upload receipt and new-session readback establish archive delivery provenance,
not an independent installed-filesystem rehash. Retain that distinction.

## Owner-assisted native comparisons

Use a private local worksheet, not raw screenshots/reports in hosted model
context. The owner opens only overview/information pages and makes no edits.
Native navigation may prompt reports; note when the native app was opened and
do not call the resulting cadence app-closed behaviour. Keep Mac/Homey clocks
and display observation times distinct.

- Confirm current battery model/firmware and exact unit identities locally,
  current system membership/main/member roles and connected PV/accessories.
  Do not carry forward the old standalone-ES21 or no-direct-PV configuration
  without confirmation; newer records describe multiple house units.
- For each enrolled 5000 physical unit, note its native SOC, signed battery
  watts/direction, explicit charging/discharging/standby state and temperature
  with observation time. Compare that same physical unit in Homey. A native
  magnitude plus direction is sufficient; do not use GRID-port/house watts as
  battery flow. A scope-unverified unit stays unaccepted.
- Separately note the native installation's aggregate SOC, battery flow/state
  and current member list. Compare with the corresponding Home Battery aggregate;
  never average unit SOC or sum ambiguous system watt fields to invent agreement.
- For Dual CT, confirm current firmware/model, CT1 incomer role and phase binding,
  whether CT2 remains disconnected, then native signed CT1 watts and observation
  time versus the corresponding Homey property meter. Review existing Energy
  inclusion read-only; do not activate/exclude any source. Existing independent
  incomer readings may corroborate direction but differing inputs/timing are not
  a calibration reference by assumption.
- Observe natural charge/discharge/idle and import/export/zero only when they
  happen. Record absent states as NOT OBSERVED. Zero/missing SOC, accessories,
  precision expiry and three-phase behaviour do not pass through inference.
- Owner checks phone/widget SOC, unavailable/recovery rendering and existing
  Energy tile visibility without editing its status indicator or Energy setup.

For near-time steady battery comparison, predeclare max(20 W, 5%) as a display
comparison tolerance with separately recorded time skew; transients outside it
require investigation, not smoothing/clipping. SOC equality and state/direction
must be assessed at their own receipt/display times. This is not calibrated
energy/capacity acceptance. Matched-window kWh comparison needs a demonstrably
comparable independent source/timebase and its own uncertainty, not integration
of the same watts used by the app.

## After the first bounded session

Review the first result before agreeing a 48-hour exact-runtime ordinary-use
soak. No unattended observer, poller or automation is scheduled here. A later
soak must define sparse checkpoints, failure reporting, retained counter and
subscription/freshness evidence, app-open conditions and available natural
states; it does not itself authorise physical manipulation or lifecycle tests.
Restart/reconnect/silence, rollback, account Repair/pairing, deliberate charge,
Energy source changes and tester contact remain separately approved operations.

ES22 and three-phase physical gates remain separate community/hardware needs.
Single-phase owner results cannot close them. All current-fingerprint hardware
gates remain open; older passed fingerprints remain historical evidence.

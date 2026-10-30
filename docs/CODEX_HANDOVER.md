# Codex cross-machine handover

## 1.11.0 approved Development and CT1 Energy adoption — 30 October 2026

Owner approved the non-clean combined candidate and one CT1 property Energy
adoption, then explicitly authorised a new Test build. Source runtime aa4ee07,
fingerprint 6fe3db750e6492e21a7028e3666df1105e2a39e0c58b128a5a59a90b52e44b94,
passed exact CI and all 1,206 tests. The preflight found independently installed
1.10.64: its compiled app/API/reserve bridge/configuration decoder match the
combined candidate. Its execution Flow was disabled and a faulted lease prevented
watchdog actions. No fault, gate, lease, battery setting or Flow was changed here.

Non-clean 1.11.0 delivery and immediate readback passed: all 13 existing EcoFlow
identities, definitions/settings, 101 Flows, app-setting hashes, all property Energy
flags, 1,201 Insights IDs and eight nondecreasing counters were preserved.
One separate owned CT1 Energy device was then added through real pairing,
firmware readback and explicit overlap consent. It is cumulative and included;
all pre-existing Energy flags and devices remain unchanged. The detailed monitor
warning is cleared. The new meter is available; Homey's live Energy report includes
it and totalCumulative.W matches its power. Estimated import increased from
0.003 to 0.016 kWh; export remained zero. Three new Insights logs were added,
with every prior Insights ID retained. These are adoption/import observations,
not calibrated accuracy, physical export/zero, recovery or soak acceptance.

The independent reserve task continues commissioning. A later readback found its
houseReserveControl setting changed after the initially equal preservation check;
this task did not write that setting or restore its old value. Preserve concurrent
work and coordinate again before any future installation. No further battery
operation, Flow execution, forced reconnect or app restart was performed here.

The Test listing/changelog is being aligned with the supported single-phase CT1 /
firmware 1.0.0.41 scope. Its runtime fingerprint is unchanged from local 1.11.0;
metadata-only packaging does not require another local installation. Test publication
must be verified separately in the portal. Live and Mainline remain unchanged.
Full production and final 48-hour soak remain gated by the native acceptance ledger.
Raw captures, settings, pairing receipts and household readings remain private.


## 1.11.0 combined CT1 Energy review candidate — 30 October 2026

Normal CT1 Energy candidate admission is prepared for model 421 / firmware
1.0.0.41 / single-phase CT1 only, using guarded receipt-time estimates, a 5 s
logical power TTL and explicit new-device adoption. Unknown firmware, absent
phase values, nonzero phases 2/3, retained/duplicate/old sequence/late deliveries
cannot qualify. The existing monitor retains identity/capabilities and gains no
Energy. No device is paired automatically. See
[the candidate qualification and limits](CT1_ENERGY_CANDIDATE_VALIDATION.md).

Confirmed accounting fix: unrelated CT2/voltage packets no longer erase CT1's
power anchor or renew freshness. Partial CT1 still clears the anchor. The bounded
01:20–01:35 UTC passive stream revealed a roughly 14 s gap and out-of-order burst;
no MQTT/hardware command was sent. Offline replay uses the real candidate resolver
and private lab storage only. Import estimates are corroborated, not calibrated;
physical export/zero, native Energy adoption/recovery and final soak remain open.
No hardware ledger gate is marked passed. Source admission does not replace full
release acceptance; hardware-required commands must still return nonzero.

Another active owner task installed Development 1.10.63 during this investigation,
adding reserve control in a separate checkout. This task did not install it or
change battery settings. The combined review snapshot preserves that bridge and
newer source edits. Coordinate a fresh idle/lease checkpoint and verify latest
bridge provenance before any later approved installation. Do not overwrite it
with a meter-only archive or silently pause its coordinator.

This is local source preparation, not an installation, activation, Test or Live
publication. Keep raw captures/identities/settings and private review evidence out
of Git. Preserve older ES21/ES22 evidence with its original runtime; no transfer
to this candidate. Readiness, exact CI, delivery and physical acceptance stay separate.

## Dual CT firmware lookup found and validated read-only — 30 October 2026

The native app's GET /iot-service/device/latestPackInfo, with native lang/version
headers, returns same-source model-421 cpackInfo.version=1.0.0.41. Current-package
metadata is distinct from latestPackInfo (an offered update). Two new guarded GETs
and the default DualCtHomeyEnergyContext lookup succeeded with real owned discovery
and complete inventory; no injected firmware or Energy session. See
[firmware readback review](DUAL_CT_FIRMWARE_READBACK.md).

Local source now includes a strict current-package reader and wires normal context
discovery to it. Wrong identity/model, offline, malformed, offered-only, upgrading,
loader and unknown status fail closed. Native version-report PUT and upgrade writes
were explicitly excluded. This resolves the missing-reader engineering dependency;
old assertions below that no firmware reader exists are superseded.

The cloud metadata has no device-report timestamp: hardwareReportedAt stays null.
API receipt time cannot prove live hardware or CT1 measurement freshness. No
firmware-change/recovery, sign/timing or accounting gate is passed by this finding.
Resolver remains empty, Energy runtime hidden/off. Finish measurement qualification,
then review a concrete installation/adoption candidate before any native write.

Final readback retains 13 EcoFlow definitions/settings, Energy configuration,
1201 Insights and eight nondecreasing counters. Existing 99 Flow definitions are
unchanged, with one additional Advanced Flow now present (100 total); its author
is not established, and it was not modified or executed here.

All 1185 tests, locked Node 22 install, lint/release/diff checks and pinned Homey
4.5.3 verified validation pass. Prior local UI cleanup/docs are preserved. Installed
Development 1.10.62, Mainline/Test/Live and all Energy settings remain untouched;
no install, restart/reconnect, hardware command, pairing, battery/Flow operation,
version bump, push/publication, new CI or soak. Raw evidence stays private.

## Dual CT completion review and UI cleanup — 30 October 2026

Owner prioritized normal CT1 property Energy with preview/banner cleanup; any
installation or Energy change remains subject to review. Current source clears
the persistent research warning and uses normal EN/DE/NL product/monitoring wording.
Existing IDs, consent, custom names, expiry and Energy/Flow/Insights boundaries
are retained; no automatic paired-device rename or Energy conversion.

Fresh native firmware remains V1.0.0.41. Owned app discovery exposes model 421 but
no firmware; Developer quota GET returns 1006. Runtime source qualification is
therefore still blocked. A bounded read-only 25-pair comparison with an owner-
confirmed property meter supports import corroboration only; do not mark physical
accuracy/export/zero/timing or final-candidate gates passed. See
[the concrete completion review](DUAL_CT_COMPLETION_REVIEW.md) for the finite route.

Fresh readback: 13 EcoFlow IDs, 99 Flows, 1201 Insights, eight nondecreasing counters,
no new broken Flow. Energy/settings are unchanged during this review. Office meter
exclusion and CT1 grid-description changes predate the first readback this turn;
compared with the prior restart baseline these are differences, not a clean equal
preservation claim. Do not restore them or attribute them to this agent.

All 1178 tests, locked Node 22 install, lint/release/diff checks and pinned Homey
4.5.3 verified validation pass. Cleanup remains local/uninstalled, no version bump,
commit/push/new CI. Installed Development 1.10.62 unchanged; Test/Live/Mainline
unchanged. Energy driver hidden/off, resolver empty, no soak started. No hardware
command, restart/reconnect, installation, pairing, battery setting or Energy write.

## 1.10.62 approved idle restart passed — 30 October 2026

Owner's single graceful restart ran **00:31:39.146–00:31:40.788 UTC** after two
passing idle/checkpoint preflights. Running observed by **00:31:42**, fresh 0 W/idle
by **00:31:44**, and real 0% SOC in both roles by **00:33:29**. Initial readings
were unknown; zero SOC was not inferred. Precise pre-restart charged/discharged
totals and projected meters remain exactly unchanged throughout observed startup.
One restart only; no battery/task/settings write, install or forced reconnect.

Fresh native idle comparison **00:36:19** agrees. Final **00:36:32** full readback
preserves 13 EcoFlow identities/settings/capabilities, 99 complete Flows, 1201
Insights IDs, app-setting hashes, all 276 Energy configurations and eight comparable
nondecreasing counters. No new broken Flow/definition change. Original reporter
matched/original_stream; independent native GET/main/SOC matches and power differs
under 0.003 W. Self-powered, no tasks, clean checkpoint and zero new-session
reconnects. Observer stopped; raw evidence private outside Git.

ES21 idle is refreshed to runtime 31c31c48…1545; current charge/discharge passes
remain. Full freshness/recovery and Energy continuity remain partial: nonzero
outage, precise expiry/hint horizon and absolute energy accuracy were not proved
by an idle restart. Older identity/ES22 passes are not transferred. See monitoring
RC owner-development-11062-idle-restart. Test/Live/Mainline and runtime unchanged.
No 48-hour soak or automation started; review the separate start/scope next.


## 1.10.62 startup investigation/recovery proposal — 30 October 2026

No confirmed runtime defect found for the 575 W startup snapshot. Both decoded
paths reported it; source scaling, role separation and accounting checks pass.
Missing original MQTT bytes/simultaneous native peak leave the physical cause
unresolved. No clamp, runtime patch or repeat charging task is recommended.
See [the investigation and recovery review](STREAM_5000_11062_STARTUP_RECOVERY_REVIEW.md).

Existing natural-gap evidence is partial: ignoredGaps=1, no reconnect/reset,
discharged counter flat 77 Wh at 00:06:55–00:10:45 then increasing. Insights power
is carried/interpolated and cannot prove tile expiry. A six-minute cached-read
observation ended at 00:23:16: 343 fresh-zero/live samples, age at most 3 seconds,
no expiry event. Fresh 00:24:36 readback preserves 13 devices/99 Flows/1201 Insights,
all Energy configuration/settings and counters. Observer stopped normally.

Recovery proposal is **one graceful app restart after fresh idle/checkpoint
preflight**, followed by startup/counter/preservation checks, with no battery
setting changes. No restart, task, install, re-pair, forced silence/reconnect,
new capture flag, Flow execution, control/Energy activation, publication or soak
ran. Test/Live/Mainline and fingerprint 31c31c48…1545 unchanged. Freshness/recovery
and Energy continuity remain partial; no new gate passes. Owner review precedes
any restart or battery change and the later qualifying soak start.

All 1177 tests, lint, release/diff checks and private synthetic examples pass;
no runtime change. Review records remain local and private evidence stays outside Git.


## 1.10.62 attended charge/discharge completed — 29–30 October 2026

Owner amended the approved 500 W test to start immediately and finish midnight,
then saved/started the native one-off task. Persisted Never/date/time/power were
verified. Observed charge **23:33:37–00:00:08 UTC**, approximately 26.5 minutes,
SOC **0→4%**, about **219.4 Wh** internally integrated. Steady **493–502 W** agrees
with near-time native comparisons; retain one unresolved **575 W startup** sample.
No power-limit, calibrated energy, capacity or efficiency signoff is implied.

Discharge appeared **00:00:13 UTC** before deletion confirmation **00:00:22**;
task list empty by **00:00:28**, Self-powered restored **00:01:03**. Native discharge
690 W / 4% agrees with Homey -671 W / discharging / 4% about two seconds later.
Fresh **00:03:37 UTC** readback passes preservation versus the actual pre-test
baseline: 13 devices, 99 complete Flows, 1201 Insights identities, app-setting
hashes, all Energy configuration and eight nondecreasing comparable counters.
No unexpected changes/newly broken Flows; zero reconnects. Collector stopped.

Only ES21 charge/discharge reporting gates are refreshed to fingerprint
31c31c48…1545; see the new monitoring RC section and ledger. Historical identity/
idle fingerprints, system/energy-accuracy, startup transient, freshness/recovery,
rollback, temperature, ES22/accessories, Dual CT Energy and final-candidate soak
remain separate/open. No 48-hour soak, publish, install, re-pair, extra restart,
forced reconnect/silence, Flow execution, new controls or Energy migration.
Test/Live/Mainline unchanged. Raw household evidence remains private outside Git.

All 1177 tests, lint, release-boundary/ledger checks and diff check pass. Runtime
fingerprint remains unchanged. Documentation/ledger updates remain local for review.


## 1.10.62 preflight and approved editor inspection — 29 October 2026

Read-only preflight confirmed running 1.10.62 and preservation against the prior
post-install baseline: 13 EcoFlow identities/settings, 99 complete Flows, 1201
Insights identities, global app-setting hashes and all Energy configuration match;
no sampled counter decrease or newly broken Flow. Native House battery and
Homey agree on fresh 0%/0 W/standby. Firmware remains V1.1.6.18. This is idle
comparison, not nonzero Energy, physical capacity or final hardware signoff.

Owner then explicitly approved a temporary Custom-mode editor inspection and
restoration only. Current editor confirms half-hour timing and a Never/date
option, but defaults to 2500 W/Daily. The task-power slider did not accept tool
input; no 500 W selection or saved charge is claimed. The unsaved card was removed,
all edits discarded through Don't save, and Self-powered restored. Fresh
23:25:38 UTC readback confirms empty tasks, original configuration, zero power
and unchanged zero charged/discharged counters; preservation still matches.

The private dated charge/stop proposal remains outside Git for owner review.
No charging test, saved task, additional restart/reconnect, Energy migration,
re-pair, Flow execution, acceptance promotion, soak or publication. Test/Live/
Mainline unchanged. Executing a charge still needs explicit approval, owner
attendance/local stop and verified 500 W, one-off date/time and removal route.
A 10-minute manual stop inside a 30-minute task window is not a hard cutoff.


## 1.10.62 charge/recovery/48-hour plan prepared — 29 October 2026

Owner requested a plan with battery setting changes reviewed before execution.
See [the review plan](STREAM_5000_11062_VALIDATION_PLAN.md). It covers an attended
500 W charge, conditional native-editor cutoff, natural discharge, independent
energy-reference requirements, natural recovery, separately approved restart
and a 48-hour soak after restoration. The historical half-hour task-editor limit
is explicit: a ten-minute manual stop is not a ten-minute hardware cutoff.

Planning only: no task/setting, restart, reconnect, pairing, Energy/source or
Flow operation; no soak/monitor started, acceptance gate promoted or Test/Live/
Mainline publication. Installed 1.10.62 attribution and prior hardware limits
below remain unchanged. Fresh execution baseline and exact dated native task/
stop parameters must be reviewed before any battery write. A later runtime or
Energy change requires final-candidate requalification; ES21 cannot qualify ES22
or Dual CT by itself.

Plan validation: locked dependencies on Node 22, all 1177 tests, lint,
release-boundary/ledger checks and diff check pass. Runtime fingerprint unchanged;
hardware readiness remains pending. Documentation remains local for owner review.


## Current installed/source runtime — Development 1.10.62

Owner approved the exact archive, non-clean, plus preservation/read-only validation.
Delivery **29 October 23:01:53.660 UTC**, SDK/UI confirm running/enabled 1.10.62.
Implementation b31eacb / exact CI 40969235537 passed before delivery. Runtime
fingerprint (archive provenance, not installed-file rehash):
`31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`.
Archive SHA256 `ac83f47fbdd8093965a4c43699c07a774c7d16804062f8eb7e51813a1cf2e99f`.
All 13 identities/settings/capability metadata, 99 complete Flows, 1201 Insights IDs,
app-setting hashes and all 276 device Energy configurations preserved. Eight
sampled counters nondecreasing; no unexpected changes/newly broken Flows.

Original aggregate main resolution is matched/original_stream, with a fresh
read-only EcoFlow comparison agreeing on SOC and power to under 0.01 W. No battery
write was used. The 5000 reports fresh zero power/idle; SOC waits for its own
receipt, then reaches real 0%. Five samples over two minutes keep both new
counters at zero with accepted power samples. Source/telemetry/short idle checks
pass within scope; native sign/energy accuracy, capacity, recovery/rollback,
Dual CT qualification and final-candidate soak remain open. No hardware gate is
promoted merely from software tests or this short zero window.

Test/Live/Mainline, grid/CT1 and battery settings/tasks, Flows and pairing unchanged.
No extra restart, forced reconnect/silence, Energy activation or Repair. Existing
pairing gate remains as approved previously. See newest STATUS and monitoring RC
owner development 11062 readback for evidence and exact limits. The candidate
preparation and earlier deployment records below are historical.


## Previous candidate preparation and installed 1.10.61 reconciliation

29 October: the original aggregate relinking fix a1391f0 was separately approved
and installed by the coordinating HomeyPro task at 22:37:59.909 UTC. Its reviewed
archive hash f09d1655…fea2e3a was rechecked; installed source fingerprint is
`82f0120b20fcea1033117aee3f81b51308a4631b731e615ef32610634b1521e6`.
This supersedes the earlier 224ad5f/0b32aa19 archive despite the same 1.10.61 version.
Preserve the concurrent deployment record below; do not install that fix again
merely because an earlier handover called it source-only. Test/Live unchanged.

Fresh read-only evidence at 22:41 shows the 5000 aggregate now receiving **0% SOC,
0 W and idle**, with accepted power samples and unchanged zero counters. This
followed the separately approved restart, so recovery must not be described as
spontaneous or as proof of native-app triggering. Owner is unsure about opening
the native overview. Singleton-record SOC and derived battery flow remain distinct
from independently verified installation scope. See
ORIGINAL_RELINKING_AND_5000_STARTUP_REVIEW.md for the evidence and limits.

Prepared source **1.10.62**, NOT installed, carries the relinking correction and
a confirmed SOC scope guard: peer discovery explicitly clears a prior singleton
SOC fallback, while explicit system SOC (including zero) remains authoritative.
Two added tests cover that transition and late-listener zero recovery without
inventing readings or energy. **1177 tests**, locked Node 22 tooling, lint,
release/diff/audit and pinned Homey verified validation pass. Candidate fingerprint:
`31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`; archive SHA256 `ac83f47fbdd8093965a4c43699c07a774c7d16804062f8eb7e51813a1cf2e99f`.
No install, reconnect, Homey setting/Flow/device action or publication ran in this
investigation. Current installation is a1391f0, not this candidate. Hardware gates
are unchanged; review a new exact archive before any further Development update.


## Reviewed aggregate fix deployed — 29 October 2026, 22:38 UTC

Owner approved non-clean Development deployment of source a1391f0. Built from an
isolated Git export with locked dependencies and pinned CLI 4.5.3 verified-level
validation; source CI 40966605948 passed. Archive SHA256:
`f09d165586e6e8f93d579cd019ee3e252dec21f175add9128625dbc49fea2e3a`.
Homey accepted clean=false/debug=false; running Development remains version
1.10.61, now with this aggregate fix. Runtime attribution is exact archive/upload
provenance plus corrected readback, not an installed-filesystem rehash.

Read-only verification at 22:39:41: current original main is Ultra X Left; a fresh EcoFlow Developer API read
and Homey agree at 38% and approximately -162 W (reported discharging). Runtime
reporter resolution is matched/original_stream. Paired device data and saved old
main identity stay preserved; the false saved-address comparison is expected.
Control target verified from deployed code, runtime resolution and native GETs;
no battery write, outlet command, forced mode/limit, native relink or extra restart.

All 13 EcoFlow IDs/data/settings/capability metadata and semantic icon IDs, all
99 complete Flows, all 1201 Insights log IDs and global app settings preserved.
Eight sampled cumulative readings across six devices did not decrease. House
5000 physical/aggregate and Dual CT settings preserved; native-reported limits,
reserve and mode returned to the same values after startup unknowns. Signed icon
transport URLs changed on reinstall; this is not an Insights/capability migration.
Private before/after/archive/target evidence is retained in the coordinating
HomeyPro chat's ignored .private-transfer/ecoflow-aggregate-a1391f0 directory.
Original private transfer and watcher cursor hash remain exact. Codex tasks were
not resumed. No store/Test/Live publication or Energy/source/pairing change.
This is aggregate reporting and preservation verification, not physical
office-to-house delivery, anti-export enforcement or a new 5000 hardware gate.

## Historical alignment before the separate 22:38 installation

29 October reconciliation: a separate source-only correction a1391f0 was added at
22:32 UTC after the approved archive was prepared and installed. It fixes the
original aggregate's post-relinking reporter binding; exact CI 40966605948 passes.
Current source runtime fingerprint is
`82f0120b20fcea1033117aee3f81b51308a4631b731e615ef32610634b1521e6`.
This newer work was preserved and is NOT installed. Version metadata still reads
1.10.61, so do not infer package identity from the version alone.

The installed Development 1.10.61 is the approved 224ad5f archive delivered at
22:20:18 UTC, fingerprint
`0b32aa19c02e36b14249c070009547ca039e114bfdfeae89ff1959181d31f02b`.
It includes the physical-unit main-role and Smart Meter floor fixes, but not
that later original-aggregate correction. No re-add is recommended: retain both
Home Battery identities/Flows/history, review a separately versioned candidate
for the original reporter binding, and investigate missing initial battery data
for the new 5000 aggregate. No further install or publication is authorised by
this alignment record. Mainline/Test/Live remain unchanged.


## Aggregate relinking correction — 29 October 2026, SOURCE ONLY / NOT INSTALLED

Owner requested a source-only fix after read-only evidence showed an original
aggregate still reading its paired former main while fresh system-main resolution
selected another original unit. The candidate keeps the Homey data identity,
capability/Insights identities, custom titles, Flows and accumulated totals intact.
It resolves an original-family main before the first poll/MQTT subscription and
uses that address for aggregate telemetry, history and control readback/writes.
Controls revalidate the main before reads and before each command. Lookup failure,
unsupported families and an in-session main change block controls and clear live
system readings; no old-address or 5000 fallback. Reinitialization is required to
bind again after such a block. No automatic cross-generation merging or migration.

Reporter changes retain accumulated charged/discharged energy, invalidate the old
raw baselines, and re-anchor to the new reporter without importing lifetime totals
or integrating downtime. Raw-baseline nulls and their source identity persist so
restart before the first new counter sample remains safe. Existing counters are
not rewritten to correct past reporting. A small default-no-op base startup hook
binds the source before REST/MQTT starts; other drivers retain existing behaviour.
Daily history starts only after a successful original binding. Late lookup results
cannot overwrite a newer initialized session. Diagnostic checks remain read-only.

Validation: locked npm ci; 1175 tests pass (seven new relinking/source/command/restart
regressions); lint passes; release:check passes with hardware gates still pending;
npm audit reports zero vulnerabilities; pinned Homey CLI 4.5.3 verified-level local
validation passes. No installation, restart, pairing, Homey setting/Flow/device
command or store publication. Codex tasks remain paused. This is
source on the diagnostic branch and was not deployed by that source-only work.
The separate approved 224ad5f installation is recorded above; a1391f0 remains uninstalled.
Physical acceptance and controlled power-flow tests remain separate approval gates.


Updated 29 October 2026. This is the portable starting point for the active
EcoFlow STREAM integration work. It does not grant permission to deploy or send
commands. See STATUS for the dated evidence behind each statement.

## Installed Development 1.10.61 — approved 224ad5f archive

Owner approved the corrective archive and resuming one ES21 aggregate pairing.
Delivery completed 29 October 22:20:18 UTC, clean=false/debug=false; SDK/UI confirm
running/enabled Development 1.10.61. Source 224ad5f, exact CI 40964207952 green;
archive-provenance runtime fingerprint
`0b32aa19c02e36b14249c070009547ca039e114bfdfeae89ff1959181d31f02b`.
1168 tests and documented software checks passed before deployment. Corrected
original main role now matches the private API identity. All 12 existing device
IDs, 99 full Flows and six counters preserved through this update; the expected
role/nine-tile correction was reviewed. Historical 1.10.60 1 Wh drop is not erased.

Exactly one approved Home Battery 5000 is now paired, same full serial as the
house ES21, enabled for Homey Energy; total EcoFlow devices 13. Pairing preserves
all original definitions/settings/metadata/Flows/counters; the sole global setting
change is the approved gate. Physical monitor has no second Energy contribution;
original reporter trial stays off. No grid-meter source or battery command changed.

New aggregate receives fresh grid/temperature/health but has not received battery
SOC/flow/state in the three-minute observation. Zero counters with zero accepted
power samples are waiting for data, NOT an idle/accounting pass. Desktop pairing
and device-panel UI render. Owner confirms the new battery is visible in mobile Energy → Batteries. Fresh
native comparison and mobile reading accuracy remain pending; native computer
access timed out. Do not infer zero/standby from
empty SOC. Natural physical numeric expiry is observed while temperature remains
fresh, but five-second latency/hint horizon/recovery are not accepted. See newest
STATUS and monitoring RC owner development 11061 pairing readback. Mainline/Test/
Live, Dual CT Energy, hardware tasks/controls, native linking and Flows unchanged.
All aggregate accuracy/recovery/final-candidate soak gates stay open. Checkbox
removal and ordinary pairing are not complete.

## Previous installation — Development 1.10.60; pairing paused

Owner-approved delivery completed 29 October 22:00:49 UTC; SDK/UI confirm
running/enabled, archive-provenance fingerprint a4e8e24c…028a42fc. All 12 identities,
99 complete Flows and app-setting hashes remain, but preservation is NOT fully
passed: one original unit's role/capabilities changed, and the office meter's
imported total decreased about 1 Wh. Owner reports recent relinking; fresh API
lookup names another original BK61 as main, consistent with the role change.
Do not restore old roles/controls automatically. See newest STATUS and monitoring
RC for exact delivery, differences and evidence limits. No 5000 aggregate was
added, Energy pairing gate remains off, and Mainline/Test/Live are unchanged.
Further installation/pairing must use a newly reviewed candidate and approval;
no automatic retry or rollback. All aggregate/hardware/soak gates remain open.

## Previous source preparation — diagnostic 1.10.60

Home Battery 5000 Energy qualification now has nine additional regressions and
confirmed fixes for rejected/unapplied power accounting, expired/missing gaps,
projected counter restoration and retry at zero power. EN/DE/NL copy distinguishes
monitoring from Energy contribution and battery settings managed in EcoFlow.
1165 tests and documented software checks pass. Runtime fingerprint:
`a4e8e24c39d77037971706359e8848680e4fed92a3aa01e4c985ba6e028a42fc`.
See HOME_BATTERY_5000_ENERGY_VALIDATION.md for the exact archive and bounded next
native step. Installed app remains Development 1.10.59; checkbox and channels
are unchanged. No native gates transfer to this candidate. Owner confirms no
direct PV on the ES21; that limits this test scope, not general PV support.

## Previous installation — diagnostic 1.10.59

New separate Dual CT CT1 Energy driver is wired through owned discovery, Homey
contributor inventory, review/confirmation, persistent session and shared MQTT
subscription. It is hidden from Add Device (`deprecated: true`) and runtime-off;
production contract registry remains empty and firmware readback unavailable.
Do not equate implemented driver plumbing with qualified or activated Energy.
The existing preview and other Energy roles are unchanged.

Existing app-connected roles now offer source-preserving account Repair. It checks
ownership of all existing consumers and protected account bindings, requires fresh
confirmation, reads back the shared credential write and resumes only prior
monitoring consent. Partial writes attempt private rollback; no new Energy/control
permission or device identity is created. Native Repair acceptance remains open.
Late/cancelled/superseded sign-ins cannot overwrite the selected pending account.

1156 tests, locked Node 22 dependencies, lint/release/diff/audit and pinned Homey
verified checks pass. New source fingerprint `e0216df13cb1fc67ab11f1ccdef7ac94dc7b9e10b258bf4b3dc1ad7706bc2d7b`.
Owner approved the exact non-clean archive update, completed 29 October at
21:19:16 UTC. Independent SDK/UI readback confirms Development 1.10.59 running.
All 12 identities, 99 full Flows, settings/fixed Energy configuration and six
checked cumulative counters were preserved. Later original Smart Meter note and
zone changes were owner edits, explicitly confirmed and retained; zero unexpected
differences remain. Settings and blank Repair entry render; no Repair was submitted.
Seven passive samples over three minutes show fresh traffic, not expiry or soak
acceptance. Fingerprint attribution is verified archive delivery provenance,
not an independent installed-filesystem hash. See newest STATUS and RC for the
archive SHA256, exact CI, observation limits and private preservation record.
Mainline/Test/Live and Energy permissions stay unchanged; no store publication.
Limited Test publication needs separate review/approval; full Energy gates remain
open. Implementation c745ee63a536abe303bf6d2718e88c4f6ca46e05 and pre-install
documentation tip 9e6afb3f3f6ffc2cd4e1ee19f55663f3cd92b233 had green exact CI.

## Previous source checkpoint — production settings and complete Energy scope

29 October: diagnostic source settings cleanup separates connections, Energy setup
and collapsed optional Support. New guidance is localised EN/DE/NL; obsolete Beta
copy removed while real preview/validation limitations and consent stay explicit.
Raw settings exceptions are no longer displayed; existing IDs/behaviour preserved.
See ENERGY_RELEASE_COMPLETION.md for the source/SDK role audit, fresh read-only
owner Energy inclusion and remaining engineering dependencies. Dual CT is still
unwired/default off; normal discovery does not provide a demonstrated firmware
readback. Dedicated 5000 solar Energy scope and account re-authentication also
need explicit completion decisions. Do not claim every Energy integration or
sprints 4–6 complete. New source is not the installed runtime; installation and
all channels remain unchanged. Hardware results below retain their exact older
fingerprints. See newest STATUS for source verification outcome.

## Previous owner installation — Development 1.10.58

Latest read-only native comparison on 29 October accepts ES21 identity and the
single-unit idle operating point for this exact runtime. Full serial matched
privately; current native system has that unit plus Dual CT and offers original
units separately for linking. Native firmware is V1.1.6.18; nominal 5 kWh/1x is
not usable-capacity evidence. Temperature sensor/display difference stays open.
See STATUS/RC owner-native-idle-comparison; no charge/discharge/recovery/soak,
linked-pack or aggregate Energy gate is inherited from this point.

Owner completed CLI consent and separately approved the reviewed non-clean
diagnostic update. Source `85c5cad`, exact CI `40913604866` green, delivered
29 October 16:50:07 UTC; running 1.10.58 independently read back. Runtime fingerprint
`da1da009bfe7ee65d02b0c67bc5ccb238ee6242bb397347331722219a75baee1`.
All 12 current EcoFlow device definitions/settings/capability metadata, all 99
complete Flow definitions and global app-setting hashes match private baseline;
six cumulative sequences are nondecreasing. No store publication or Energy/control
activation. Native comparison/sparse expiry/charge/discharge/accessories/rollback/
soak remain open. See newest STATUS and RC owner-diagnostic-installation checkpoint.
CLI is authenticated now; earlier failed login and not-installed notes are history.

## Latest candidate preparation — diagnostic 1.10.58, historical pre-install notes

Sprint 4 adds an unwired, source-bound adoption review/confirmation workflow;
Sprint 5/6 readiness combines the separate meter and all battery model/role gates.
1126 tests, locked-dependency Node 22 checks, lint/release/diff/audit and pinned
Homey verified validation pass. Runtime fingerprint:
`da1da009bfe7ee65d02b0c67bc5ccb238ee6242bb397347331722219a75baee1`.
See the newest STATUS checkpoint and SPRINT_4_6_ACCEPTANCE_PLAN.md. Actual Energy
driver/UI/subscription integration and firmware/timing qualification remain open;
resolver/runtime are still closed. Installed host is still Development 1.10.56,
linked physical battery scope is unverified, Dual CT showed another stale interval,
and native computer-control timed out. CLI is unauthenticated. No new hardware
pass, deployment or publication. Do not equate requested sprint work with specific
approval to install, operate hardware or change Energy sources.

## Current continuation — Dual CT property Energy release work

Owner confirms Dual CT installed/paired, CT1 at the single-phase property incomer
including the office/shed submeter, CT2 disconnected. Original batteries are in
the office; the electrically connected microinverter has its own reported EcoFlow
space. The target is Dual CT CT1 as the future authoritative property Energy
meter, not an interim switch to another source. See DUAL_CT_RELEASE_SPRINTS.md,
DUAL_CT_ENERGY_RC.md and the new exact-candidate acceptance ledger.

Fresh 29 October portal: Test 1.10.56 / Build 70, Live 1.10.3; installed enabled
Development 1.10.56 (package not rehashed). Source e469c37 / 1.10.57 is pushed,
exact CI 40781605070 passed. The earlier local-only paragraphs below are history.
The new diagnostics/acceptance/device-adapter sprint is checkpointed on the diagnostic branch and unwired/default
off for Energy. No install/publish, source transition or hardware operation.
Native Dual CT firmware V1.0.0.41 and approximate import-point agreement are
partial older-runtime observations, not qualification of the new source.

## Current release preparation — 1.10.57

The owner authorized committing/pushing the consolidated diagnostic changes and
publishing one new Test build. Version 1.10.57 is prepared; fingerprint
`f790f04fd12985cf0cdf28dce191397195388eea2f7c7b446acb179309a64ec5`.
Fresh locked-dependency validation passes 1101 tests, lint/release/audit/verified
checks. Follow the newest STATUS checkpoint for CI and actual channel outcome;
preparation is not publication. Mainline/Live and owner Development f1234365…9ba2
must remain unchanged. The local-only entries below describe earlier preparation.

## Latest local source — field-aware original STREAM reconciliation

The newest STATUS checkpoint records a local fix for REST starvation by unrelated
MQTT packets on the original STREAM aggregate. Conflicting raw fields/aliases and
derived power/counter/PV/mode groups are withheld; unrelated REST fields recover.
Five new regressions plus the existing suite pass (**1101 tests**, lint/release/
verified validation). Latest local fingerprint:
`8dc2d532deca2dc995b664f7745d757668983659791b46e4bed365632be53d9a`.
The widget changes below remain included. None of this local work is committed,
pushed, installed or published. Installed f1234365…9ba2 and historical hardware
acceptance remain separate. Stefan's exact freeze has not been hardware-reproduced.

## Local follow-up in the new checkout — 28 October 2026

Uncommitted diagnostic work now follows the synced `63b229c` checkpoint. The
original STREAM freeze/capacity investigation fixed locally reproduced widget
refresh stalls (unsettled bridge response and page restoration), with ten page-
script regressions. Capacity setting hints now explicitly distinguish widget
estimates from Homey Energy capacity; a selected-installation regression guards
against inferred unit-count/other-space capacity. The reporter's built-in Sensors
freeze and Energy screen concern remain unreproduced pending version/screen
clarification. Do not announce those symptoms fixed from widget tests.

All 1096 tests, lint, release checks, diff checks and pinned verified Homey
validation pass. Local source fingerprint is
`5ca108a2fd945dfbe83ed37c14da9a3deffe7584a5da1dcdf0bea681d65812c9`.
This candidate is NOT installed, pushed or published. The owner installation and
its `f1234365…9ba2` evidence below remain unchanged; no hardware acceptance is
transferred to the new fingerprint. See the newest STATUS checkpoint for details.

## 1. Clone the right branch

Repository: https://github.com/zarbjustin/uk.co.zarb.ecoflow (public).

Active branch: `codex/mixed-generation-reporting-diagnostics`.
The default branch is `master`, which does **not** contain this diagnostic wave.
Do not merge it or change the repository default branch during migration.

```sh
git clone --branch codex/mixed-generation-reporting-diagnostics https://github.com/zarbjustin/uk.co.zarb.ecoflow.git ecoflow-stream
cd ecoflow-stream
git fetch origin
git status --short
git rev-parse HEAD origin/codex/mixed-generation-reporting-diagnostics
```

Use a normal local, non-cloud-synchronised development folder. The old checkout
was a linked worktree whose `.git` file points to another checkout on the old
Mac; copying that folder alone is not a portable repository. Fresh cloning is
preferred. macOS offloaded its six-byte `commondir` file and blocked even basic
Git reads; keeping that file downloaded restored access. iCloud storage was full.
Do not rewrite Git metadata or copy absolute worktree pointers to fix migration.

## 2. Current source, CI and installed candidate

- Implementation: `e270578568718afd2fd3450694dc8226a2a897a2`.
- Validation records and anchor correction through
  `17d985db61c60c59965b106525d841f503bbf64f` are documentation/ledger-only.
- Implementation CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40614977219
- Follow-up CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40615632941
- Local full suite: **1085 tests**, lint, release checks; verified Homey validation
  also passed. Check the new handover commit's CI independently on resumption.
- Installed owner candidate: running **Development 1.10.56**, non-clean direct
  installation at **28 October 2026 01:27:41 UTC**; not a store installation.
- Exact runtime fingerprint:
  `f1234365433db279bc9418a29beaaf863ef593d291864e6018de8388c4cf9ba2`.
  Documentation/AGENTS changes do not change this fingerprint. Recompute with
  `npm run release:check`; never identify an installed runtime by version alone.
- Mainline stayed untouched: local historical `master` is `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` was `66b1cb5f828a53333739798281fce86125f61c28`. They differ;
  do not push local master or assume the difference is a new merge instruction.
- Last **recorded** store state: Test 1.10.56 / Build 70 and Live 1.10.3 / Build 18.
  Those portal observations are historical, not freshly reverified for this
  handover. The new diagnostic changes were not published to either channel.

Recheck current GitHub HEAD/CI and the installed host before making fresh claims.
The repository is not yet production-release-ready.

## 3. What changed most recently

**Physical STREAM 5000 expiry:** the three-minute watt/state freshness threshold
is unchanged. Physical monitors now have a five-second local cleanup timer,
separate from the existing one-minute connection watchdog. Checks are serialized,
coalesced while pending and cancelled on teardown. No extra EcoFlow requests,
faster reconnects or aggregate accounting changes. Five seconds is a normal
scheduling bound, not a hard real-time guarantee during blocked/failed SDK writes.

**Original STREAM history:** removed startup cleanup which deleted existing
daily-history capabilities merely because values were null. Existing capability
IDs/custom titles remain; day rollover still clears yesterday's values to
unknown. Fresh numeric history, including zero, updates in place. Missing tiles
are added only when their own data is returned, not as fabricated empty defaults.

Key implementation/tests:

- `lib/Stream5000UnitDevice.ts`, `lib/stream5000Readings.ts`,
  `lib/stream5000BatteryPresentation.ts`, `test/stream5000Lifecycle.test.js`.
- `drivers/stream/device.ts`, `test/streamEnergyLifecycle.test.js`.
- `scripts/check-stream-5000-acceptance.mjs`,
  `docs/STREAM_5000_MONITORING_ACCEPTANCE.json`.

## 4. Hardware evidence and its limits

The owner's currently paired 5000 is **ES21, PV-equipped STREAM 5000**, despite
earlier shorthand calling it AC5000. Do not conflate it with ES22 AC-only.
It is in a separate EcoFlow space. The owner's Dual CT had arrived but was **not
installed** at the last confirmed hardware checkpoint; do not assume it is a
usable independent grid meter. No 5000 aggregate is paired on the owner host.

The latest installation preserved all 11 device identities/settings, existing
capabilities, 99 Flow definitions and six cumulative meter sequences. Six daily
history tiles previously removed by the old cleanup returned with real numeric
history responses. There were no null daily tiles at the immediate upgrade
baseline, so that exact native null-preservation input is software-tested only.

EcoFlow explicitly showed Standby/0 W/1% at 01:28:42 UTC, matching Homey. The
standalone ES21 idle point is accepted for this fingerprint. The native Mac app
was quit at 01:28:43 and confirmed not running. Through 01:34:25, battery reports
continued roughly every two minutes, independently of fresh temperature. One
active subscription attempt, no reconnect; no expiry interval on this candidate.

Earlier `ac38129` hardware showed true silence expiry: power/state became null,
temperature stayed fresh and the tile became explicitly last-reported standby.
It exposed the old watchdog delay. That event is **not** hardware acceptance for
the new runtime's faster timer. Earlier supervised charging/discharging and
restoration are recorded in STATUS/RC, not approval for repeating those tests.

Open gates include actual fast expiry and recovery, retained-hint horizon,
controlled reconnect/rollback, sustained soak, configuration background refresh,
PV/socket/accessory scope, ES22 and linked-pack/model coverage, aggregate Energy
scope/continuity. The JSON ledger is authoritative per exact runtime/model/role.

## 5. Safe next work

1. Re-establish read-only access and verify installed state, device/Flow/counter
   baselines, and whether physical setup has changed since this checkpoint.
2. Observe a naturally sparse battery interval with the native app closed;
   verify numeric expiry within the five-second cleanup cadence, unrelated-field
   independence and explicitly non-live standby. Stop if fresh reports continue;
   do not create network silence, restart or trigger Flows to force a pass.
3. Observe natural receipt recovery and retained-hint expiry when available.
   Deliberate restart/reconnect/rollback needs a separate bounded owner approval.
4. Plan the remaining model/accessory/configuration/soak checks for a narrow
   monitoring release. Do not silently enable Home Battery (5000) Energy pairing,
   Dual CT Energy or 5000 controls to make the release look complete.

Keep remaining-time estimates unmapped; the bounded passive timer observer stays
disabled. New controls, automatic mixed-generation merging and new-product
admission are outside the monitoring release. Original STREAM guarded controls
and accounting remain distinct from these new gated paths.

## 6. Build/release checks on the new machine

CI uses Node 22 and Homey CLI 4.5.3. Use the committed lockfile:

```sh
npm ci
npx playwright install chromium
npm test
npm run lint
npm run release:check
git diff --check
npx --yes homey@4.5.3 app validate --level verified
```

Linux may need Playwright system dependencies (`--with-deps`, as in CI).
`npm run release:acceptance` / `release:monitoring` deliberately fail while
hardware gates are open. Do not weaken them to make a release pass.

Builds/dependencies under `.homeybuild/` and `node_modules/` are ignored and
regenerable; do not transfer them as authoritative source. Direct-install CLI
packing previously needed care to avoid a nested `.homeybuild` path and native
dependency loading in the desktop REPL. Follow the installed CLI source/docs
for the new machine; never reuse old host addresses, sessions or ad-hoc REPL
variables. Do not install with `clean:true`. Before any authorised install,
privately back up/read back definitions, settings, capability sets, Flows and
meters, validate the exact package and verify the running host independently.

## 7. Information map

- Current checkpoints: `docs/STATUS.md` (newest first; older blocks are history).
- Release scope/ledger: `docs/STREAM_5000_MONITORING_RC.md` and its JSON ledger.
- API/model research: `docs/STREAM_5000_API_REVIEW.md`,
  `docs/STREAM_REPORTING_API_AUDIT_2026_10_09.md`, `docs/STREAM_MODEL_COVERAGE.md`.
- Topology/mixed generation: `docs/STREAM_REPORTER_TRANSITION_PLAN.md`,
  `docs/MONITORING_REPORTER_TRIAL.md`, `docs/MIXED_GENERATION_VALIDATION.md`.
- Dual CT: `docs/DUAL_CT_RELEASE_GATES.md`, `docs/DUAL_CT_POWER_ENERGY_PATH.md`,
  `docs/DUAL_CT_GRID_ENERGY_PREPARATION.md`, `docs/DUAL_CT_CIRCUIT_PRESENTATION.md`.
- Controls/time: `docs/STREAM_CONTROL_CONTRACT_AUDIT.md`,
  `docs/STREAM_5000_REMAINING_TIME_AUDIT.md`, `docs/LEGACY_FLOW_RELIABILITY.md`.
- Community/coordination: `docs/COMMUNITY_FEEDBACK_ROADMAP.md`,
  `docs/STREAM_COORDINATION_PREVIEW.md`, `docs/COORDINATION_SOURCE_AUDIT.md`.
- Product photos/wireframes: `docs/assets/`, driver assets and their README files.
- Reproducible evidence: committed synthetic/masked `test/fixtures/` and tests.

Older sprint documents may say Beta/opt-in or local/unpublished for superseded
checkpoints. Current source has ungated physical 5000 monitoring; aggregate
Energy pairing has its own default-off consent. Do not restart completed sprints
or mistake catalogue support for hardware acceptance.

## 8. Private data and local-only recovery

GitHub is public. Credentials, app-account sessions, `env.json`, Homey CLI tokens,
full device IDs/serials, raw household reports/screenshots and support email
attachments must **not** be uploaded. They are not portable through GitHub or
Codex chat memory. Authenticate on the new machine through the normal supported
flow; do not paste secrets into chat or reconstruct them from local caches.
The Homey hub retains its own installed settings/data; cloning does not move or
reset the hub. Access still needs owner-authorised authentication.

Before wiping the old machine, privately transfer any needed evidence. The
latest migration pack is held outside the repository under the old machine's
`.codex/private-handoffs/` directory. It includes a Git recovery bundle of local
refs and a selected recent telemetry/screenshot archive, **not** credentials,
complete Homey backups, raw baseline inventories or all historical private files.
The local companion manifest identifies the private temporary evidence folders.
Temporary `/tmp` evidence can disappear; that selected archive is a safeguard,
not a complete hardware backup. Older raw reports/support correspondence and
credentials need a separate owner-controlled secure transfer if required.

Seven historical commits were not reachable from fetched remote refs at the
handover audit (`1a39a4c`, `2679d9a`, `fe84e33`, `5c41522`, `8bb4e46`,
`ed81e94`, `c7f9804`). They are kept in the private Git bundle; they are not
current-work omissions to merge automatically or authority to overwrite master.
No local stash or untracked project source was found. Preserve the bundle if
those historical local branches matter; the active diagnostic source is on GitHub.

## 9. Prompt to resume in another Codex instance

> Continue this EcoFlow STREAM repository on
> `codex/mixed-generation-reporting-diagnostics`. Read AGENTS.md,
> docs/CODEX_HANDOVER.md, the latest docs/STATUS.md checkpoint and the monitoring
> RC/acceptance ledger first. Verify GitHub HEAD/CI and local dirty state; do not
> assume the default master is current. Keep Mainline, Test and Live unchanged.
> No publishing, installation, pairing, battery settings/tasks, Flow execution,
> forced silence/reconnect or Energy/control activation without fresh approval.
> Start with a read-only state/acceptance review and propose the next bounded
> hardware check. Preserve paired tiles, Flows, custom titles and counters. Raw
> evidence/credentials stay private; do not depend on the old chat's REPL state.

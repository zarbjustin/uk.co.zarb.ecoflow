# STREAM 5000 monitoring release candidate

## Owner bounded charge test

27 October: owner approved a revised attended manual-stop test after the native
ten-minute scheduling precheck failed. The native fallback window was a single
23:30–00:00 (+1) occurrence on 27 October at a requested 500 W grid charging
limit, with manual cancellation due at 23:40. Owner confirmed attendance, a local
stop route and an independent alarm. The saved task was reopened to verify
Never / 27 Oct 2026, exact time/power and unchanged SOC target. No recurring task
was left enabled. Native custom controls were used; no undocumented API writer,
integration control activation or additional MQTT session was introduced.

Baseline had no tasks, standalone native membership, no direct saved Homey Flow
reference to this physical unit, zero observed solar and fresh standby telemetry.
Absence of a direct Flow reference is not proof of no external controllers.
Existing reserve, SOC and global grid limits were preserved. Observed firmware
baseline was 1.1.6.18. Raw screenshots, readings and the timestamped observation
journal remain private outside Git.

Charging was first observed at 23:30:29 UTC. Native and Homey charging direction,
near-time watts and SOC increase agreed at this standalone operating point.
Independent applied reading ages remained fresh, the sampled temperature did not
rise, and the subscription needed no reconnect. The native unit displayed an
explicit remaining-charge estimate, unlike its earlier standby estimate. This
does not establish an API field mapping; remaining-time display stays withheld
and the passive observer was not activated. No electrical-efficiency, calibrated
cell-side measurement or full-power-range enforcement claim is made.

Cancellation was requested at 23:39:47.973; the native deletion confirmation was
applied at 23:40:01.737. Fresh Homey readback at 23:40:11.807 reported an empty
task list and discharge rather than charge. Thus this is an approximately
ten-minute scheduled test with manual/UI timing, not a precise ten-minute
physical-duration measurement. The later midnight fallback cutoff was not used.

Native discharge and Homey signed power agreed near 23:41:11 UTC, showing the
original unscheduled discharge fallback resumed rather than an invented idle.
The two-minute recovery readback at 23:42:19 confirms the empty task list, fresh
non-charging readings and unchanged reported mode, reserve, SOC/grid limits,
socket state and output-ceiling observation. All 11 device identities/settings/
capability sets and all 99 saved Flow definitions match baseline. Six cumulative
meter readings are comparable and nondecreasing. No 5000 aggregate was paired,
and no Energy gate, deployment, Mainline or store state changed.

ES21 charge and the newly observed natural discharge are accepted only for
installed runtime ac38129 and this unlinked operating point, without accessory-load validation.
ES22, linked packs, accessories, aggregate Energy, reserve/limit enforcement,
controlled reconnect, rollback and normal-use soak are not approved by this test.
Idle/freshness/configuration gates retain their existing partial status.

## Bounded charge precheck

27 October, approximately 22:42–22:46 UTC: owner authorized the proposed 500 W,
10-minute test only after its preconditions pass. Fresh monitoring showed standby,
no configured tasks, no saved Homey Flows directly referencing this physical
unit and no paired aggregate. Native task list confirmed no tasks. Direct Flow
reference absence does not prove there are no external/scripted controllers.
Physical attendance/local-stop confirmation was requested but not yet received
at this initial checkpoint. It was subsequently confirmed for the separately
approved revised manual-stop test recorded above.

The native editor exposed only minute choices 00 and 30 for start/end times.
A ten-minute native task could not be configured, so the agreed timing
precondition failed. No save/confirm was invoked: the default charge draft was
discarded through Don't save. Native No tasks and support's empty task list
were rechecked; battery remained idle and settings/Flow definitions unchanged.

Do not replace the approved ten-minute task with a thirty-minute window or use
undocumented control commands as a workaround. A manual-stop test or a different
duration needs a separately reviewed bound/stop route and explicit owner approval.
No charging gate was promoted by this failed initial attempt. Evidence screenshots remain private; no runtime,
installation, Mainline or store change occurred. The previous proposed native
ten-minute test was provisional and is not executable in the observed editor.

## Firmware and history review

27 October, approximately 22:32–22:34 UTC: read-only native EcoFlow firmware
listing for the paired ES21 reports **1.1.6.18**, with no devices available for
update in that view. No updater, command or setting was activated. This is the
owner device's displayed version/status, not a universal latest-release claim
or a separate inventory of every internal component's firmware.

Homey SDK Insights history was read at last-hour (five-second bins) and
last-24-hours (five-minute bins) resolutions, preserving nulls. The recent SOC,
battery-flow and temperature display series have no null/timestamp gaps in the
queried window; after the candidate installation the numeric values remain
consistent with standby. Independent system-grid-meter history is entirely
unknown, as expected in this unmetered space. Flow-derived import/consumption
have a leading null run before this candidate was installed, covering at least
11 minutes of the queried window; the true beginning is outside that window.
This is unavailable reading history, not evidence of an app crash or network
outage. Prior-day signed battery activity predates the new candidate and cannot
approve its physical charge/discharge gates.

Important platform limitation: battery Insights shows numeric zero through the
brief startup interval when the independently recorded post-install capability
readback was null. A continuous resampled graph therefore does not prove
continuous telemetry or faithfully preserve every transient unknown. Do not
derive a receipt cadence, outage duration or energy acceptance from these bins.

Current per-field applied/receipt ages are independently available: the two
support snapshots show a new battery receipt while temperature/health have their
own recent ages. Subscription remains active, one attempt and no reconnects in
this installed session. These samples establish fresh application at those
times, not the maximum gap over the preceding day. No raw per-packet receipt
history was reconstructed or invented. Sparse expiry/recovery is still open.

All 11 devices remain available with identities/settings/capability sets
unchanged; all 99 saved Flow definitions match the install baseline. Private
firmware screenshot and selected history/receipt data are outside Git. No
runtime change, restart, observer activation, extra MQTT session, acceptance-gate
promotion or publication occurred. Continue normal-use observation; deliberately
inducing silence or charging still requires separately bounded approval.

## Owner read only comparison

27 October 2026, approximately 22:22–22:24 UTC: native EcoFlow application and
the installed ac38129 candidate were compared read-only. The native device
management identity exactly matches the paired Homey ES21. Native membership
shows that device in the new system; the original STREAM units are offered as
unlinked candidates. No Link, confirm, slider, toggle, mode, schedule or power
action was invoked. Device/Flow IDs, settings and capability sets remain intact.
Private screenshots and selected support data stay outside Git.

At this natural standby operating point, native SOC and zero battery flow agree
with Homey SOC/idle/zero. Native Custom mode, reported grid input/output limits,
charge/discharge SOC limits and disabled backup reserve agree with Homey. The
stored reserve percentage is separately reported but is not visible as an
active reserve in EcoFlow while disabled; it is not inferred to be an effective
discharge floor. This is display/readback agreement, not electrical enforcement.
The native grid-input help explicitly distinguishes circuit draw from total
charging power and excludes the Gateway-connected path from that setting.

The native system diagram's grid/consumption flow is distinct from its device
GRID-port input. Homey preserves that distinction: no independent whole-grid
meter reading is invented, and flow-derived import is not a measured whole-house
claim. The Dual CT is still not installed. Night-time PV zero and unavailable
socket output do not validate accessories under load.

The native unit page displays a multi-day remaining-time estimate despite zero
SOC and standby. Its semantic and source remain unverified; no Homey timer is
enabled, computed from SOC, or accepted from this observation. The disabled
passive observer was not started, and no additional MQTT session was opened.

Only ES21 identity is newly signed off for this exact runtime and observation.
Idle is partial (a steady standby comparison, not a charge/discharge transition).
Configuration and freshness/recovery remain partial. ES22 and prior-fingerprint
discharge evidence are not promoted. Charge, accessories, controlled recovery,
rollback, normal-use soak and aggregate Energy remain separate open gates.

Next checks in order: inspect normal-use history and per-field receipt gaps
without new commands, then compare any naturally occurring state changes with
the corresponding native unit view. Current empty standby and an empty reported
task list cannot validate discharge or promise a scheduled charge. To exercise
both directions promptly, obtain a separate bounded owner approval for charging
through the commissioned setup, agreed limits/stop conditions and restoration;
do not infer an electrically safe test limit from the reported configuration.
After some charge, compare normal discharge and return to idle without adding
an aggregate. Read-only telemetry can observe these tests, but initiating charge
or a load is a physical change, not covered by a read-only request.

A deliberate integration restart also needs a separate window because it affects
all paired EcoFlow devices and their Flows. Do not interrupt household networking,
revoke credentials or reset/re-pair the battery to manufacture a recovery test.
PV/socket, linked-pack and Dual CT commissioning remain later accessory-specific
checks; no new high-power load is needed for this monitoring-record update.

## Monitoring recovery installation

27 October: owner-authorized implementation `935547d` passed exact-commit CI
(1080 tests, lint, release boundaries, audit, verified validation) and was directly
installed non-clean at 22:17 UTC. Runtime fingerprint:
`ac38129ed5d61435f0092f96180718708ee594a767e352fc3fd84609d600f2c9`.
This supersedes the local/not-installed state in the historical validation wave
below; installed Development version remains 1.10.56/schema 19.

Readback preserves all 11 device identities/settings/capability sets, all 99 saved
Flow definitions and six cumulative meter readings without reset. Aggregate
pairing consent remains off with no 5000 aggregate paired. The physical monitor
starts with unknown power/state/configuration and waiting status; fresh applied
temperature/health and SOC-limit configuration have returned on an active
subscription. Do not call unrelated receipts fresh battery power, infer reserve
state, or promote the new fingerprint's physical acceptance gates from this.

No battery commands, Energy activation, re-pairing, version bump, store upload or
publication occurred. Mainline/Live/Test remain unchanged. Previous source and
the preservation baseline are privately retained; rollback is unexercised.
Continue natural-state and native-display comparison, then the bounded recovery
and normal-use soak plan. No additional Robert captures are requested.

## Current validation wave

27 October 2026: local diagnostic-branch preparation only. The installed owner
candidate remains 4834191; this wave is not installed, committed, pushed or
published. Mainline, store Test/Live, hardware configuration and Energy gates
remain unchanged. Do not use observations from the installed candidate to
sign off this newer fingerprint.

Scope remains ES21/ES22 physical unit monitoring. The support clarification
acknowledges aggregate SOC and battery-power fields but does not supply an
authoritative mixed-generation reporter/membership contract, grid-port scope,
remaining-time mapping or a supported new control contract. Do not turn those
unresolved semantics into automatic merging, SOC averaging, counter transfer,
new controls or inferred timer estimates. The owner's Dual CT is not installed.

Prepared reliability changes:

- Reconnect discards session-old configuration before subscription recovery.
  Mode, reserve enabled/disabled state, reserve target and reported limits must
  return from new configuration telemetry. Unrelated live readings do not renew
  them, and configuration-only telemetry cannot establish live battery flow.
- A failed configuration tile write no longer prevents the other expired tiles
  being cleared; subsequent watchdog passes retry the failed tile. Flow
  conditions use the fresh tracker, not a possibly uncleared display value.
- Report projection requires an explicit fresh status. An omitted or malformed
  status cannot become a fresh reserve/mode observation.
- Software regression covers charge/discharge/idle presentation and independent
  expiry, reconnect configuration reset/recovery, failed-clear retry, unknown
  reserve versus disabled, unchanged identity/store and no unit Energy/timers.
  These are software replays, not newly performed physical charge/reconnect tests.

Read-only owner baseline at 22:10 UTC found the installed Development 1.10.56
running with all 11 EcoFlow devices available. The physical ES21 appropriately
showed a non-live last-standby status with expired power/state unknown. This is
a single observation, not a 48-hour soak, current native EcoFlow comparison,
controlled recovery test or acceptance of the uninstalled candidate.

Readiness can now be checked at an explicit boundary:

- `npm run release:monitoring`: both admitted models, physical units only;
  fails unless their exact-fingerprint hardware gates pass.
- `node scripts/check-stream-5000-acceptance.mjs --model es21 --role unit --require-ready`:
  an explicitly narrowed ES21 unit decision; never approves ES22 or Energy.
- `npm run release:acceptance`: unchanged full model/role acceptance.

All still fail readiness while hardware gates remain open. Invalid/duplicate
selection options fail closed. No gate is removed or promoted by selecting a
smaller scope. Remaining-time capabilities remain withheld rather than showing
zero, guessing from SOC/power or borrowing legacy fields.

Next acceptance sequence: review the local increment, authorize a non-clean
owner candidate update separately, then compare natural charge/discharge/idle
and independent expiry with EcoFlow on that exact fingerprint. Deliberate
restart/reconnect, charging/settings changes, accessory loads or aggregate
pairing each need bounded approval; no such operation occurred in this wave.
ES22 needs its own acceptance; ES21 hardware cannot sign it off. Retain the
normal-use soak and recovery/rollback gates before a production decision.

## Decision and authority

25 October 2026: owner subsequently authorized a non-clean direct candidate
installation and further read-only validation on their Homey. The installed
EcoFlow app is now the development candidate, still version 1.10.56. Mainline,
store Live/Test, battery settings and existing Flow definitions are unchanged.
No commit/push, version bump, publication, re-pairing, meter installation or
physical setting command is included in this checkpoint. Installation restarted
the integration; no additional disruptive network/recovery test was performed.
This document is an acceptance plan, not a release announcement or signoff.

Release target: read-only monitoring for the explicitly admitted ES21 STREAM
5000 and ES22 STREAM AC 5000. Keep the optional physical monitor separate from
the installation Home Battery. Existing original STREAM functionality remains
supported; its saved Flows, IDs, settings and counters must survive the upgrade.

New 5000 controls, remaining-time estimates, Dual CT Energy, automatic
mixed-generation merging and new product admission are not required features
of this monitoring release. Their gates stay closed. The passive timer observer
remains disabled with no runtime start route. Existing previews stay opt-in;
their presence must not be described as production validation.

## Read only baseline

Owner observations on 25 October, approximately 21:26–21:35 UTC, used the
installed **Test 1.10.56**, not the newer uninstalled source candidate.
Only sanitized qualitative findings are retained here; no names, serials,
account responses, private screenshots or household measurements are committed.

- Developer inventory identifies the owner's new unit as **ES21**, not ES22.
  Main-address resolution returns the same unit; this does not establish space
  membership. A fresh full-quota read returns **1006**, so Developer-key telemetry
  is not available for this unit in the tested context. Existing app-connected
  MQTT is the working transport. No additional MQTT session was opened.
- Native EcoFlow battery SOC and discharge direction agree with the paired
  Homey physical monitor. Near-time power readings are close, not simultaneous
  measurements or electrical calibration. Reported power, SOC, temperature and
  health had independent recent successful-application ages in the Homey report.
- Native Custom mode, charge/discharge limits and grid limits agree with the
  reported configuration. Reserve is disabled while a stored target exists.
  This checks display/readback only, not physical limit enforcement. The newer
  reserve-status tile and migrated labels are not yet installed or accepted.
- The new 5000 physical monitor has no battery accounting report. No 5000
  aggregate is paired. The separate original Home Battery remains present with
  its own counters. This is coexistence observation, not an upgrade/continuity test.
- A fresh flow matrix agrees with the native system diagram; the grid-meter
  capability is unknown while separate flow-derived import/export are present.
  The Dual CT is not installed. Do not treat the native diagram or calculated
  import/export as an independently measured whole-house grid reading.
- Night-time solar is zero; the native AC output is unavailable. Neither fact
  validates PV under load, a connected socket, charging or an idle transition.
- Insights history through the connected tool failed its response schema because
  entries contain nulls. This is a collection limitation, not evidence of an
  application outage or a zero-valued battery history. No history was discarded
  or fabricated, and no replacement measurement was written.

These observations remain **partial** in the acceptance record. They do not
approve unpublished source or satisfy ES22, charging, recovery or Energy gates.

## Model boundaries

Use exact registry models/adapters: ES21 → `es21`; ES22 → `es22`.
Owner ES21 observations cannot approve ES22. Existing public masked fixtures and
community findings support ES22 identity/core decoding, but do not automatically
pass current-candidate Homey acceptance. Review already-held evidence first;
no new Robert capture request is made by this plan. No generic ES-prefix,
3000, Gateway or expansion admission is introduced.

## Owner candidate installation

Direct non-clean install completed on 25 October; Homey readback at
21:44:47 UTC reports `devkit_install`, version 1.10.56, running, not crashed.
Candidate runtime fingerprint:
`a15ae0d7888477c0835f26594799087e8cdccef69d1e6b48fea4829637f5d5f3`.
This is not Build 70, a new store build, a mainline merge or a Live release.

Pre-state: the owner host reports a successful backup earlier the same day.
Previous Test-tag source was retained locally as a recovery option. Private
in-memory identity/settings/counter and Flow-definition baselines were compared
afterward. No credential extraction, clean install, deletion or re-pair occurred.
Rollback was prepared, not exercised; native-upgrade acceptance remains partial.

The initial CLI dependency-copy step stalled on a fixture file before contacting
Homey and was interrupted. Generated production dependencies were reconstructed
offline with `npm ci --omit=dev --ignore-scripts` from the identical lockfile,
TypeScript rebuilt, and the official Homey SDK shim restored. Staged manifest
and lockfile were compared with source; verified-level staging validation passed.
The validated generated package was then installed without another copy/build
step. No dependency version or runtime source changed during this workaround.

Observed through 21:49:48 UTC, then continued normal-use readback:

- All **11** EcoFlow devices retained ID, driver, data identity and settings;
  all returned available. No existing capability was lost. The 5000 unit gained
  only the expected read-only reserve-state capability.
- All **99** saved standard/Advanced Flow definitions matched their pre-install
  hashes. This is structural preservation, not an execution test of every Flow;
  no Flow was manually triggered by this validation.
- Original Home Battery and meter cumulative counters did not reset. Existing
  unit SOC/power Insights logs contain readings before and after installation.
  Direct Homey SDK history retrieval succeeds with legitimate null gaps; the
  connected tool's numeric schema limitation does not mean history is missing.
- Candidate ES21 identity is confirmed by retained device data, working explicit
  adapter and native product view. SOC updates and natural-discharge
  direction/power agree with EcoFlow at the observed standalone operating point.
  These two checks are accepted for this fingerprint only. No full-power-range
  electrical calibration, linked-pack direction or ES22 acceptance is inferred.
- The unit has no battery Energy accounting; no 5000 aggregate is paired.
  Unknown grid-meter power stays null, distinct from flow-derived import/export.
  No new Energy source, controls or passive observer was activated.
- Installed capability titles match the intended migration and remain read-only.
  Reserve state/target and configuration fields cleared at startup. SOC limits
  returned first; mode/grid/reserve fields remained unknown until fresh config
  telemetry arrived after opening EcoFlow's native settings view read-only.
  They then matched the native display, with reserve disabled and the stored
  target separately visible. This is **event/receipt-driven configuration**, not
  a guarantee of an autonomous immediate post-restart refresh. Do not persist an
  old setting as current to hide this limitation. Further background-refresh/
  expiry comparisons remain open.
- Desktop Homey Configure → integration support report works on the installed
  candidate and reports `unit_reading_available`, still with unverified physical
  pack scope and no Energy contribution. Native mobile settings acceptance,
  controlled silence/reconnect, rollback, charging/idle and the longer soak are
  not completed by this short session.

No raw reports, private device/Flow identities, household measurements or secrets
are retained in this record. Next useful physical steps need their own bounded
approval: charging/idle comparison and pairing one Home Battery (5000) for the
new space to validate aggregate accounting without touching the original system.

## Owner sparse idle installation

26 October: diagnostic implementation `a6e4e31`, exact CI green (1074 tests), was
directly installed non-clean after staged verified validation. Runtime fingerprint:
`4834191f7d05103da42b500c17dedd6587aaafa754d3ac6210d65a9db0c5a7b0`.
The cloud upload was rejected without updating the previous app; standard direct
discovery succeeded. Running Development 1.10.56/schema 19 and the new read-only
status capability independently confirm delivery. No Mainline/store changes.

At 16:28:51 UTC all 11 devices, identities/settings/capabilities, 99 saved Flow
definitions and counter continuity were preserved. Exactly one expected new
status tile was added to the physical unit. Desktop Homey displayed its live
state with fresh zero/idle battery evidence. At 16:32:43 UTC, the last coherent
standby receipt was still fresh; the subscription was active. Native EcoFlow
navigation stopped when owner app use was noticed. No battery setting was
changed by this validation.

Native sparse expiry, reconnect, retained-hint horizon, charging/accessories and
48-hour soak remain open; fresh reports continuing in this window cannot pass
the sparse-idle transition. Software replays cover those edge cases, not native
acceptance. Aggregate Energy pairing stays off, no aggregate was added, timer
research stays disabled, and no remaining-time capability is introduced.
Previous source is retained privately for recovery; rollback is not exercised.

## Core transitions

26 October follow-up (now owner-installed only): sparse-idle presentation adds a
separate physical-monitor status tile. A coherent successfully applied zero/idle
delta can be described as `Last report: Standby (not live)` after numeric expiry,
for at most 20 minutes and never across a reconnect. No watts/state are revived,
no missing value becomes zero, and this hint is not an Energy/Flow numeric source.
The previous 9d9881d candidate remains distinct from installed 4834191. See STATUS
for checks and privacy-safe findings; idle acceptance is still open.

On the installed candidate, continue checking fresh zero/idle, then sparse
idle with fresh unrelated temperature receipts: live power/state must expire,
the last-report tile must be clearly non-live and bounded, and new nonzero or
zero battery evidence must recover independently. Verify no aggregate tile,
automatic Flow tag, extra requests or counter changes. Test deliberate session
loss/reconnect only with separate approval. No remaining-time estimate is added.

For each model and accepted role, compare SOC, sign, state and power against
the corresponding EcoFlow view in natural charge, discharge and idle. Record
receipt skew; distinguish battery flow from inverter/GRID-port output. Preserve
real zero, clear missing values, and do not infer physical pack scope from a
system reporter. A direction change must not reuse an old state or timer.

Observe natural transitions when available. Deliberate charging, schedules,
outlet loads or other physical changes need a separately approved bounded test
with safe starting state and restoration. No new control writer is needed.

## Accessory scope

Current unit runtime can add serial-attributed PV/string and socket tiles after
nonzero evidence. Validate the accessories actually exposed by each model:
own versus peer attribution, units, sign, zero, independent expiry and no extra
solar/Energy source. ES22 does not inherit an ES21 direct-PV expectation.
Night-time zero is not an accessory test. If a mapping cannot be accepted,
explicitly withhold that unvalidated display in the candidate rather than waive
the gate or silently remove a user's previously paired capability/history.

## Aggregate energy

This is required for a **Home Battery (5000)** production claim, not for the
optional physical monitor alone. With explicit owner pairing approval, add one
aggregate for the new space without replacing the original system's battery.
Establish actual installation/reporter membership and exclude overlap.

Compare signed battery flow in charge/discharge/idle, then time-bounded kWh
increments. These are integrated observed-power counters, not historical EcoFlow
lifetime totals; do not compare unlike time windows. Check restart persistence,
duplicate samples, downtime gaps and recovery. The unit monitor must not add a
second battery Energy source. No independent whole-grid claim without a meter.

If unit acceptance passes first, assess a narrower release explicitly. The
existing aggregate driver must not silently become normal/default pairing merely
because the unit-monitor gate passes. Keep aggregate admission opt-in until its
own acceptance, retaining existing paired devices and histories.

## Recovery

Software replays cover stale, missing, zero, slow/failed writes, role separation,
late subscription completion, restart persistence and large gaps. They are not
native Homey recovery evidence. With separate approval, observe a bounded app
restart/reconnect and silence/recovery sequence. Check stale clearing, no
unrelated-field refresh, no downtime backfill and no loss of original devices.
Do not revoke credentials, disconnect household networking or reset a battery
as an acceptance shortcut.

## Candidate upgrade

Delivered follow-up: diagnostic commit `2119122` separates normal unit monitoring
from default-off Home Battery Energy pairing. Exact-commit CI passed and it was
directly installed non-clean; store Test/Live remain unchanged.
`stream5000AggregatePairingEnabled` is new explicit consent; the old saved Beta
flag is inactive but retained. Existing paired devices/accounting are unaffected.
Installed runtime fingerprint is now
`9d9881df03aba7c5dd2c21f8dd006877a42bbff6b59314b6cc7f7ea09ebd3924`.
Earlier a15ae0d hardware passes cannot automatically approve this newer source.
Readback at 22:30:13 UTC confirms schema 18, running Development 1.10.56, no crash,
all 11 EcoFlow devices available with identities/settings retained, all 99 saved
Flow definitions unchanged and no 5000 aggregate paired. Update readback found no
lost capabilities or counter resets. Desktop Settings and both pairing entry
screens were inspected: normal unit disclosure, aggregate disabled-consent block.
Both were cancelled before account entry/addition, without saving consent.
Full inventory/add, mobile-host, rollback and per-model hardware acceptance remain
open. See the [current delivery checkpoint](STATUS.md) for CI and installation evidence.

Before installing, identify the exact candidate runtime fingerprint, preserve
the existing app/version/device/Flow/counter baseline privately, and agree a
safe update and rollback route. A Git revert alone does not restore Homey stores.
Native update/rollback and deliberate restart require separate approval.

Verify default-title migration, custom labels, reserve status, desktop/mobile
settings, support report and original saved Flow references on the installed
candidate. Pairing tests must preserve stable IDs and avoid delete/re-pair.
Normal unit pairing in the prepared source is not a declaration that every
model/feature is production accepted. Aggregate consent remains independently
checked; native cleanup pairing and per-model/role release acceptance stay open.

## Normal use

After acceptance installation, observe at least 48 hours of ordinary use across
the states available on each claimed model. Capture only a concise private
baseline/readback, not repeated timed exports from testers. Check meaningful
errors, freshness, subscriptions, memory behaviour, counters and legacy devices.
Software endurance replay does not substitute for the native observation period.

## Checking readiness

`npm run release:check` validates software boundaries and the acceptance record;
it prints open gates without calling them software failures. Separately,
`npm run release:acceptance` intentionally exits nonzero until **all** declared
model/role hardware gates pass for the exact runtime fingerprint. The checker
cannot approve, activate, install or publish anything. It fingerprints packaged
runtime/configuration/assets, not changing prose or test totals.

`STREAM_5000_MONITORING_ACCEPTANCE.json` is the sanitized ledger. Partial older
Test/community evidence cannot pass a current-candidate gate. Per-model and
per-role assessments permit an explicitly narrowed release decision; passing
ES21/unit does not pass ES22 or system Energy. Changed runtime invalidates prior
fingerprint signoffs. Preserve evidence privately and record only qualitative
scope/outcome references here. This is an engineering check, not vendor certification.

Next release sequence, only when separately authorized: reviewed diagnostic
commit → exact CI → version/tag/archive checks → Test candidate → owner acceptance
and soak → reviewed mainline integration → certification/Live decision. None of
those external steps is performed by preparing this candidate.

# STREAM 5000 monitoring release candidate

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

## Owner sparse-idle installation

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

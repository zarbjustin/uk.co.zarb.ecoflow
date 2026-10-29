# Project Status & Handoff — EcoFlow STREAM Series

> Living status doc. Read this first when resuming work on `uk.co.zarb.ecoflow`.

For a fresh Codex instance/machine, read [CODEX_HANDOVER.md](CODEX_HANDOVER.md)
and the repository-root AGENTS.md before the dated history below. They identify
the active branch, installed fingerprint, open gates and private transfer limits.
The latest handover-only commit does not alter the installed runtime or channels.

## Development 1.10.60 installed; Energy pairing held — 29 October 2026

Owner-approved archive delivered at 22:00:49 UTC; SDK/UI confirm running/enabled
Development **1.10.60**, fingerprint a4e8e24c…028a42fc. Preservation found a
relinked original-unit role change and an approximately 1 Wh original Smart Meter
imported-counter decrease. All 12 identities and 99 full Flows remain, with no
newly broken Flows; app-setting hashes match. This is NOT a full preservation
pass. Owner reports recent relinking, consistent with a fresh API result naming
a different original BK61 as main. No native topology/control change was sent.
Expected 5000 monitoring status wording also updated. See monitoring RC owner
development 11060 preservation findings for the full sanitised record.

Pairing stopped before enabling the gate: no aggregate was added. Mainline,
Test/Live, grid-meter settings, hardware tasks and Flows remain unchanged. Source
**1.10.61**, NOT installed, now restores original Smart Meter counters from the
higher valid checkpoint/projected floor and persists recovery without downtime
fill. A regression reproduces a 1 Wh rollback before the fix and passes afterward.
**1168 tests**, lint/release/diff and pinned Homey verified validation pass;
locked dependencies retained. Fingerprint `0b32aa19c02e36b14249c070009547ca039e114bfdfeae89ff1959181d31f02b`.
Archive SHA256 `9d4555a171b56e4bd3dc3dcc8a01555d634b55c39fcf540b5c1da4d48abfdf91`. This prevents subsequent startup rollback; it does not
rewrite the already-recorded 1 Wh decrease or restore removed capabilities.
Relinking investigation also found zero original Homey units labelled main even
though the API-selected new main is paired. A cached `mainSn` bypassed role
refresh for former members. Source 1.10.61 now resolves each unit at startup,
without changing polling cadence, retains existing system capability IDs and
clears their values when the lookup fails, and blocks unverified system controls.
Two additional failing regressions now pass (1168 total tests). Existing control
writers/Flow identities are unchanged; current main/member tile layout is an
expected readback item for the next reviewed installation, not a native relink.
A fresh exact-candidate installation approval is needed before continuing the
previously reviewed one-aggregate validation. No hardware gate is promoted.

## Home Battery 5000 Energy qualification started — 29 October 2026

Diagnostic **1.10.60** fixes confirmed aggregate accounting defects before native
Energy pairing: rejected or unapplied power cannot advance/re-anchor counters,
unknown/expired power cannot be bridged, higher valid Homey totals survive older
checkpoints, and failed counter projections retry even at zero power. Nine new
lifecycle regressions; **1165 tests**, locked Node 22 tooling, lint/release/diff,
audit zero and pinned Homey verified validation pass. Clearer EN/DE/NL wording
separates monitoring, Energy contribution and managing settings in EcoFlow.
Runtime fingerprint `a4e8e24c39d77037971706359e8848680e4fed92a3aa01e4c985ba6e028a42fc`.
Archive SHA256 `6a4ccf09037faf4e8c43e11cfdf2600dc290f29412894f2154b58028aed20e50`.

Installed Development remains **1.10.59**. Fresh native/SDK comparison agrees at
0% and zero battery watts; private exact serial matches the house ES21. Native
membership remains ES21 plus Dual CT with originals separate. Owner confirms no
direct PV connected. This is an older-runtime unit idle/identity observation,
not 1.10.60 system Energy acceptance. Checkbox stays gated pending validation.
No new pairing, installation, Energy setting, hardware task or store action.
Mainline/Test/Live unchanged. See HOME_BATTERY_5000_ENERGY_VALIDATION.md for the
bounded Development-plus-one-aggregate step and subsequent physical, grouping,
recovery and final-candidate soak gates. Prior dotted-heading ledger reference
is repaired; no hardware gate is promoted.

## Owner-approved Development 1.10.59 installation — 29 October 2026

Owner explicitly approved the reviewed non-clean update and read-only preservation/UI
checks. The exact archive was delivered at **21:19:16 UTC**, with clean=false and
debug=false; independent SDK and Homey UI readback confirm **1.10.59 Development,
enabled/running**. Implementation c745ee63a536abe303bf6d2718e88c4f6ca46e05 and
pre-install documentation tip 9e6afb3f3f6ffc2cd4e1ee19f55663f3cd92b233 had green
exact CI (40934944955 and 40935985448). Runtime fingerprint:
`e0216df13cb1fc67ab11f1ccdef7ac94dc7b9e10b258bf4b3dc1ad7706bc2d7b`.
Reviewed archive SHA256:
`5b36d4895dc8e140e04e68a57f51f9762232a73b3a00128c61f780800c3beaee`.
Fingerprint attribution follows the verified archive/delivery provenance; the
installed filesystem was not independently rehashed.

All 12 paired identities, capability semantics/metadata, settings, fixed Energy
configuration, 55 standard and 44 advanced complete Flows and global app-setting
hashes were preserved. Six comparable cumulative counters did not decrease; no
newly broken Flows were observed. Immediate readback matched; later original
Smart Meter note and zone differences were confirmed by the owner as their edits
and retained. Latest comparison has zero unexpected differences. Live watts and
session-specific icon transport URLs are excluded from fixed-configuration
comparison; semantic icon IDs remain checked. Private evidence stays outside Git.

Installed settings and the blank account Repair entry rendered successfully;
aggregate Energy pairing remains unchecked. Repair sign-in was not submitted.
Seven passive cached observations from 21:32:21 to 21:35:22 UTC showed recent
Dual CT traffic and live STREAM 5000 battery readings. Fresh battery reports
prevented the three-minute expiry condition: fast expiry is still unverified.
This short window is not native EcoFlow comparison, counter qualification or a
48-hour soak. Rejected preview frames were observed; transport activity alone
is not firmware/sign/replay or accounting acceptance.

No store publication, Mainline change, Energy adoption/exclusion, new pairing,
account credential change, battery setting/task, Flow execution, forced silence
or reconnect was performed. Mainline/Test/Live remain unchanged by this work;
store channel state was not freshly reverified. Existing hardware passes retain
their recorded older fingerprints. Native Repair, charge/discharge/accessories,
expiry/recovery, qualified Dual CT contract/accounting, 5000 solar scope and final
candidate soak remain open. Next bounded release step is a separately reviewed
limited Test publication; full Energy production readiness is not claimed.

## Dual CT driver and account Repair — 29 October 2026

Prepared diagnostic **1.10.59** on the active branch. New `smartmeter_dual_ct_energy`
driver wires source-bound review/confirmation, owned/model identity and a firmware-provider interface,
conservative Homey electricity contributor inventory, real persistent session and
shared subscription lifecycle. Gas/water, excluded meters and downstream meter
roles are distinguished; malformed/unknown inventory blocks adoption. Confirmation
and final Add recheck source, inventory, expiry and activation before credentials
are committed. No preview conversion or edits to other sources. The driver stays
hidden from Add Device and runtime-off; the registry remains empty. Normal discovery
still has no demonstrated firmware readback; tests inject a synthetic code-owned
reader, never customer verification flags.

Counter restoration rejects a missing/older checkpoint when Homey already holds
higher projected totals. Restart establishes a fresh anchor without downtime fill.
Process-wide authority, stale-power clearing, identity/credential invalidation,
late callbacks, owned subscription teardown and bounded retry are covered. This
cannot detect every whole-app backup rollback when both stores and capabilities
roll back together; native recovery policy/acceptance stays open.

Source-preserving account Repair is registered for app-connected device roles.
It validates ownership of all existing consumers and protected account bindings,
expires review after 90 seconds, requires confirmation and verifies persisted
credential revision. Failed/partial writes attempt restoration without printing
credentials. Only prior monitoring consent can resume; no paired definition,
Energy permission, Flow or battery control is changed. Native Repair is unverified.
Shared auth now fences disposed/superseded asynchronous logins and retains shared
credentials when another consumer still needs them.

**1156 tests**, locked Node 22 dependencies, lint/release/diff checks, zero audit
findings and Homey CLI 4.5.3 verified validation pass. EN/DE/NL desktop/mobile tests
cover blocked Energy pairing, review consent/expiry and account Repair without
creating a device. Full readiness also rejects a disabled/unadmitted source even
if hardware ledgers are marked passed. Current source fingerprint:
`e0216df13cb1fc67ab11f1ccdef7ac94dc7b9e10b258bf4b3dc1ad7706bc2d7b`.

Fresh read-only owner verification remains running Development **1.10.58**;
all 12 full device definitions/settings and 99 complete Flow definitions match
the private baseline, app-setting hashes match, six cumulative sequences are
nondecreasing. Source 1.10.59 is **not installed or published**. No account Repair,
new pairing, Energy inclusion, battery operation, Flow execution or forced reconnect
was performed. Mainline/Test/Live remain unchanged. Firmware/sign/timing contract,
5000 solar scope, native UI/accounting/Repair/recovery and final-candidate 48-hour
soak remain open. A verified full archive readback contains production MQTT dependencies, the new
driver and all six Repair views; root app/package/lock metadata match source.
Archive `ecoflow-stream-1.10.59-e0216df1-diagnostic.tgz`, 1978 files,
10446748 bytes; SHA256
`5b36d4895dc8e140e04e68a57f51f9762232a73b3a00128c61f780800c3beaee`.
The archived runtime flag is false and the driver hidden. Read-only SDK inventory
classification is complete and identifies one included electricity property meter;
this is not native adoption/HTTP-provider acceptance. Implementation
`c745ee63a536abe303bf6d2718e88c4f6ca46e05` is pushed to the diagnostic branch and
exact CI [40934944955](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40934944955)
passed. This delivery record changes no runtime files or hardware acceptance.
The documentation tip's CI remains a separate check when resuming.

## Production settings and Energy completion audit — 29 October 2026

Diagnostic source now separates account connections, Homey Energy setup and
collapsed optional Support tools. New guidance is localised in EN/DE/NL; obsolete
Beta/history wording removed from settings and the store description. Native
preview/validation limitations remain explicit. Existing consent settings, device
IDs and runtime Energy gates are unchanged. Fixed raw exception disclosure in
settings failures and removed the instruction to re-pair after account removal.

Locked Node 22 dependencies, **1128 tests**, lint, release/diff checks, zero audit
findings and Homey CLI 4.5.3 verified validation pass. Browser workflows include
all three languages on desktop/mobile, no capture/settings writes from opening
sections, existing consent and private-error regressions. New source fingerprint:
`10f6af684f6e76fa4c4b6dc6bb9beefa9f7a448c7611811a740d8f02d50431bf`.
This source is NOT installed. Existing Development 1.10.58 / da1da009…5baee1
remains running, and its hardware evidence is not transferred to the new source.

Fresh read-only Energy inspection confirms the original meter still contributes
as a property source despite its downstream role; Home/Emporia and Octopus
electricity remain excluded. Gas is separate. Dual CT preview remains non-Energy.
No owner setting, account, device, Flow, Energy source or channel was changed.

See [Energy completion audit](ENERGY_RELEASE_COMPLETION.md) for the Homey SDK role
review and actual remaining work. Dual CT source qualification and real driver/UI/
subscription integration remain incomplete; normal discovery has no demonstrated
firmware readback. 5000 solar Energy scope and account re-authentication need
completion decisions too. Native meter/battery intervals, expiry/recovery,
persistence/rollback and final-candidate soak remain open. `release:full` remains
nonzero; cosmetic cleanup and software checks cannot complete sprints 4–6.
Mainline, Test, Live and the installed app remain unchanged. CI/source push outcome
must be verified separately; no deployment or publication follows from this record.

## Native ES21 identity and idle point — 29 October 2026

Fresh native access confirms the complete ES21 identity matches the paired unit,
with Dual CT as current main-breaker meter and original units offered separately
for linking. Native Standby/zero battery flow/system SOC and individual unit SOC
agree with fresh Homey zero/idle/SOC on installed 1.10.58. Only ES21 identity and
this single-unit idle point are accepted for exact runtime da1da009…5baee1;
transitions, physical pack calibration and aggregate scope are not accepted.
Native firmware V1.1.6.18 was read without updating. Nominal capacity display is
not a usable-capacity test. A native/Homey temperature display difference remains
unresolved; no field/offset fix or temperature acceptance. No settings, tasks,
controls, Energy, Flows, forced reconnect, installation or channels changed.
See [native idle comparison](STREAM_5000_MONITORING_RC.md#owner-native-idle-comparison).

## Owner-approved 1.10.58 diagnostic installation — 29 October 2026

After the owner completed normal CLI consent, authenticated private readback
captured all 12 EcoFlow device definitions and all 99 complete Flow definitions.
Owner then specifically approved the reviewed non-clean Development 1.10.58
update and read-only preservation checks. Exact source `85c5cad`, CI `40913604866`
green, delivered at 16:50:07 UTC; running 1.10.58 read back independently.
All paired IDs/data/settings/capability metadata, 99 Flow definitions and app
setting hashes match; all six cumulative counters are comparable/nondecreasing.
Archive SHA256:
`11112d1a8d583a47990e3c4e2eebef4dceb1846499782130b694494ecf7f8315`.
Runtime fingerprint remains `da1da009bfe7ee65d02b0c67bc5ccb238ee6242bb397347331722219a75baee1`.

Fresh Dual CT transport/accepted diagnostics and a live ES21 reading are present.
Scope/native comparison, actual sparse expiry, charging/discharging, aggregate
Energy, persistence/rollback and 48-hour soak are not passed by this short window.
No battery setting/task, Flow execution, pairing/activation, forced reconnect or
Mainline/Test/Live publication. Adoption/driver qualification remains incomplete.
See [owner diagnostic installation](STREAM_5000_MONITORING_RC.md#owner-diagnostic-installation).
Private evidence stays outside Git; recovered historical source is not a native
store backup or accepted rollback. Earlier unauthenticated/not-installed statements
below describe preparation, not current delivery.

## Sprint 4 adoption and combined battery readiness — 29 October 2026, HISTORICAL PREPARATION

Prepared diagnostic version 1.10.58. Added a source-bound, one-shot adoption
review/confirmation workflow with 90-second expiry, fresh owned identity/firmware,
fresh account-matched contributor inventory, overlap rejection and explicit
external review. Confirmation rechecks the source/inventory and fences cancellation,
account/firmware changes, duplicate Add and late activation withdrawal. External
discovery errors are scrubbed. Client-supplied device/store objects are ignored.
The workflow is unwired, not a registered Energy driver or adoption UI; production
contract resolver remains empty and runtime false. Source/firmware/timing provider
qualification and actual driver/subscription integration remain incomplete.

Added release:full to assess Dual CT plus both STREAM 5000 model/role ledgers for
one fingerprint. Open/old-runtime gates remain nonzero. Fresh locked-dependency
Node 22 checks pass: **1126 tests**, lint, release/diff checks, audit with zero
findings and Homey CLI 4.5.3 verified validation. Full CLI build and archive
readback include production MQTT dependencies and compiled new modules; app,
package and lock metadata match source. Version preparation is not publication.
Runtime fingerprint:
`da1da009bfe7ee65d02b0c67bc5ccb238ee6242bb397347331722219a75baee1`.

Read-only installed Homey remains Development 1.10.56. The 5000 subscription is
active with recent configuration/empty task reports, but linked physical scope
and battery power/state remain unverified. Another Dual CT stale interval was
observed. Native computer-control timed out; no fresh native comparison, restart
or forced silence was performed. No hardware gate passed. CLI authentication is
absent; full private preservation baseline requires authenticated SDK readback.

See [Sprint 4–6 execution and battery matrix](SPRINT_4_6_ACCEPTANCE_PLAN.md).
No install, pairing, settings/Flow/hardware operation, Energy activation,
Mainline/Test/Live change or publication. A diagnostic update and any later
controlled hardware/adoption trial require separate bounded approval/readback.

## Dual CT CT1 release sprints — 29 October 2026, DIAGNOSTIC SOURCE / NOT INSTALLED

Owner authorizes diagnostic-branch release engineering with CT1 as the future
property Energy meter. Current source base e469c37 matches fetched origin; its
exact CI 40781605070 passed. Fresh portal readback still shows Test 1.10.56 /
Build 70 and Live 1.10.3; owner is running Development 1.10.56. Earlier Test
preparation below did not complete publication. Mainline/installed/channels stay
unchanged in this continuation.

Added independent received/rejected frame counts and transport age to the preview
and numeric-free support projection; rejected traffic cannot renew accepted data.
A separate Dual CT hardware ledger/checker is now part of release:check, while
release:dual-ct intentionally fails pending hardware gates. Added an unwired,
production-default-off Homey write adapter around the existing persistent session.
It rechecks consent/qualification around async SDK writes, keeps failed/partial
projections unavailable, clears stale power without resetting committed totals,
serializes teardown and coalesces refresh ticks. No new driver, permission,
capability or Energy activation is introduced. Full scope/dependencies are in
[the sprint record](DUAL_CT_RELEASE_SPRINTS.md).

Read-only native Dual CT firmware V1.0.0.41 and approximate Phase A/import-point
agreement support partial evidence only. Existing direct-meter/preview data
recovered naturally after a stale interval, and sampled existing counters are
nondecreasing. Original meter remains configured as a property Energy meter
despite reported downstream relocation; no settings corrected without a reviewed
source transition. Firmware readback/timing contract, export/zero/energy intervals,
native storage/upgrade/rollback and 48-hour soak remain open. Validation: 1114
tests, lint, release/diff checks and Homey CLI 4.5.3 verified validation pass.
Runtime fingerprint: `ae5f67bfc05c1bbf1e91b88badfd232de594fe7c1875233271d53e70bb540e37`.
Private UI evidence
and household numbers stay outside Git; no tester capture requested.

## Consolidated 1.10.57 Test preparation — 28 October 2026

Owner authorized diagnostic commit/push and one new Test release, keeping Mainline,
Live and the owner Development installation unchanged. Final review checked raw
mapping aliases/derived groups; disabling reconciliation reproduces three queue
regression failures, and the previous widget pages fail all ten new lifecycle
tests. Version 1.10.57 includes the reconciliation/widget fixes, capacity wording
and previously owner-installed history/physical-expiry changes from this branch.
No claim is made that Stefan's exact setup has passed or that 5000 hardware gates
have closed. The Energy screenshot shows today's charged energy, not capacity.

Fresh npm ci on Node 22: 1101 tests, lint, release checks, zero audit findings,
verified Homey CLI 4.5.3 validation and diff checks pass. Runtime fingerprint:
`f790f04fd12985cf0cdf28dce191397195388eea2f7c7b446acb179309a64ec5`.
Source CI and Test upload/activation must be recorded independently after success.
At preparation, CLI authentication is pending and local browser access is disabled.
No store upload/activation or owner installation has happened in this checkpoint.

## Original STREAM field-aware reconciliation — 28 October 2026, LOCAL ONLY / NOT INSTALLED

Stefan's follow-up (public thread posts 77–78) distinguishes an aggregate device
freeze from a widget-only failure: Homey device values stop while EcoFlow keeps
updating, and an app restart restores them. Version is 1.10.56. The displayed
1.9 kWh screenshot is today's charged energy, not installed capacity; the separate
setting screenshot shows 3.84 kWh already configured. This does not establish a
missing battery or prove this race caused the user's freeze.

Reproduced a software starvation path: temperature-only MQTT during each REST
poll caused the whole REST SOC/power/counter response to be discarded. Original
STREAM aggregate now filters only conflicting REST fields. A request-local set
tracks MQTT fields from request start until queued application; filtering happens
when the serialized work runs, including same-millisecond/slow-write races.
No MQTT payload is replayed, cached reply mutated or receipt timestamp renewed.
Other drivers retain the conservative whole-response guard.

Aliases are withheld together (temperature, health, heating, mode); all PV
fallback/string dependencies form one group. Battery power/state derivation,
charge/discharge counters and system remaining times are withheld together so
an old REST snapshot cannot overwrite newer counters or enter power accounting
around a newer battery receipt. Unrelated REST SOC/grid/configuration can still
update. This is conservative omission, not merging old and new packet fields.

Five new tests cover repeated starvation, queued conflicts, real-driver counter
continuity, derived groups/aliases, zero and invalid newer fields. Existing queue
teardown/default-driver guards and all earlier widget regressions remain green.
Validation: **1101 tests**, lint, release checks, diff checks and pinned Homey
4.5.3 verified validation pass on Node 22 with existing locked dependencies.
Local source fingerprint:
`8dc2d532deca2dc995b664f7745d757668983659791b46e4bed365632be53d9a`.
This is not native acceptance of Stefan's setup or any 5000 model/role. The owner
installation remains the recorded f1234365…9ba2 candidate; all hardware gates for
this new local source remain pending. Previous local widget work is preserved.
No commit/push, installation, Mainline/Test/Live change, publication, settings/task
change, Flow execution, forced reconnect or control/Energy activation.

## Original STREAM freeze/capacity investigation — 28 October 2026, LOCAL ONLY / NOT INSTALLED

Community reports distinguish frozen Homey dashboard Sensors readings from an
Energy capacity display concern on an original two-AC-Pro setup. Exact installed
version, affected screen/device role and whether EcoFlow/device pages keep
updating are still requested; no customer cause or native fix is claimed.
No additional Robert capture is requested.

Local execution of all five widget page scripts reproduced two refresh defects:
a never-settling Homey bridge request permanently held the busy lock, and
`pagehide` cleared polling without a `pageshow` restart. Widgets now expire the
local wait after 15 seconds, retry on the existing cadence, ignore obsolete
success/rejection/finalization, and restore exactly one polling interval after
page restoration. This deadline does not cancel the underlying Homey bridge
request or change EcoFlow subscription/polling behaviour. These widgets are
separate from Homey's built-in Sensors dashboard; the customer's report remains
unreproduced. Ten deterministic regressions execute the actual page scripts and
cover timeout, overlap protection, late completion, restoration and cleanup.

Capacity investigation found `installed_capacity_kwh` used by widget estimates,
not a Homey Energy capacity declaration. Clarified that scope in EN/DE/NL hints
and the composed manifest. A regression verifies selected-installation capacity,
unknown capacity and isolation from physical-unit count/other spaces. No nominal
capacity is guessed and no Energy declaration, counters, settings IDs, paired
identity, Flow contract or backend telemetry mapping is changed.

The existing REST/MQTT revision guard deliberately discards REST replies overtaken
by MQTT, including counters. No speculative merging change was made: retaining
newer counter/field evidence matters, and the report does not yet identify a
transport failure. Widget reproduction is software evidence only.

Validation: all **1096 tests**, lint, release boundary/acceptance-schema checks,
verified Homey validation with CLI 4.5.3 and diff whitespace checks pass using
Node 22 and the existing committed-lockfile dependencies.
Local candidate fingerprint:
`5ca108a2fd945dfbe83ed37c14da9a3deffe7584a5da1dcdf0bea681d65812c9`.
Hardware readiness remains PENDING for this changed fingerprint; prior installed
signoffs are not promoted. Installed owner app remains Development 1.10.56 with
recorded fingerprint `f1234365433db279bc9418a29beaaf863ef593d291864e6018de8388c4cf9ba2`.
No commit/push, installation, version bump, Mainline/Test/Live change, publication,
physical setting/task/Flow execution, reconnect or control/Energy activation.

## History retention delivery — 28 October 2026, PUSHED / CI GREEN / OWNER-INSTALLED

Implementation `e270578568718afd2fd3450694dc8226a2a897a2` is pushed to the
diagnostic branch. [Exact-commit CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40614977219)
passed tests, lint, release checks, audit and verified Homey validation.
Runtime fingerprint remains
`f1234365433db279bc9418a29beaaf863ef593d291864e6018de8388c4cf9ba2`.
The validated package was directly installed non-clean at 01:27:41 UTC;
independent readback confirms running Development 1.10.56. No store command.

All 11 device identities/settings, all existing capabilities, 99 Flow definitions
and six cumulative meter sequences are preserved. The six previously removed
daily-history tiles were re-added by fresh numeric history responses, not by
inventing values or forcibly migrating capabilities. No blank daily tiles were
present immediately before installation, so native preservation of a null-valued
tile is not claimed; the regression tests cover that specific input.

Native EcoFlow at 01:28:42 explicitly displayed Standby/0 W/1%, matching Homey's
fresh zero/idle/SOC. This accepts the standalone idle point for this fingerprint,
not other earlier candidate gates. EcoFlow was then quit normally and confirmed
not running. Battery and temperature receipt ages remain independent, with one
active subscription attempt and no reconnect. Through 01:30:57, new battery
receipts continued before the three-minute threshold; actual fast-expiry timing
on this installed candidate remains unexercised, not passed by software replay.

Git access initially blocked because a six-byte worktree metadata file was
offloaded by macOS. Finder's Keep Downloaded restored access without editing Git
metadata or changing refs; iCloud quota exhaustion was visible and merits a
separate repository-storage review. Remote branch equality was independently
verified before the normal non-forced push. Mainline refs are unchanged;
store Test/Live, hardware configuration, Energy gates and controls are untouched.
Private baselines, measurements and native screenshots remain outside Git.
See [owner history-retention installation](STREAM_5000_MONITORING_RC.md#owner-history-retention-installation).

## Legacy daily-history capability retention — 28 October 2026, HISTORICAL LOCAL PREPARATION

Removed the original STREAM startup routine that deleted existing daily-history
capabilities merely because their values were null. Paired capability identities
and custom titles now survive blank readings, restart/reinitialization and
unavailable history. Day rollover still clears yesterday's values to unknown;
fresh data (including true zero) updates existing tiles in place. Missing tiles
are still added only when their own history metric is returned, not as empty
defaults. No history/counter source, Flow contract or settings change.

Three regression tests cover startup with history enabled/disabled, repeated
initialization, null/zero/populated values, custom titles, rejected/empty history,
rollover, recovery and on-demand addition. All 1085 tests, lint and release checks
pass. Local source fingerprint:
`f1234365433db279bc9418a29beaaf863ef593d291864e6018de8388c4cf9ba2`.
This fix has NOT been installed; owner Homey remains on the fba275ff expiry
candidate below. It does not automatically restore tiles already removed by that
older runtime; absent tiles return on fresh history under the existing behavior.
Native upgrade/preservation must be rechecked after a separately requested install.
No commit/push, Mainline change, store publication or hardware setting change.

## Physical reading expiry hardening — 28 October 2026, OWNER-INSTALLED / EXPIRY TIMING PENDING

Local diagnostic source separates physical-monitor reading expiry from the
60-second connection watchdog. A five-second local timer clears stale readings
through the existing serialized write chain; pending checks coalesce so slow
SDK writes cannot accumulate an unbounded queue. No EcoFlow requests, faster
reconnects, aggregate accounting, controls or Energy activation are introduced.
Timers stop on teardown; failed clears remain diagnostic failures and retry.

1082 tests (including two new lifecycle regressions), lint, release checks and
verified Homey validation passed. Runtime fingerprint:
`fba275ff6c225d77d1e377675a28612df9aaa8c3827625103211cafc36ed6093`.
The official package was installed non-clean on the owner Homey at 01:07:32 UTC;
independent readback shows running Development 1.10.56, with fresh zero/idle
battery telemetry. The uploaded compiled device file matches the local build.
Native EcoFlow remains closed. Earlier ac38129 hardware signoffs remain
historical; this new runtime does not inherit them.

Read-only app-closed observation 01:07:37–01:14:12 UTC found fresh zero/idle,
independent temperature ages and zero reconnects. Battery receipts renewed
approximately every two minutes, so the installed fast-expiry callback was not
physically exercised in this bounded window. Do not substitute the previous
candidate's expiry event or software tests for new-candidate timing acceptance.
Natural silence/expiry, recovery and the hint horizon remain hardware-pending.

All 11 identities/settings and 99 Flow definitions are preserved; six cumulative
meters are nondecreasing. Capability sets are NOT fully identical: one original
STREAM's six daily-history tiles, all null in the baseline, were removed by its
existing `cleanupBlankHistoryCapabilities` startup routine. That code was not
changed; a working history feed can re-add the tiles. No measurement value is
claimed lost, but this is recorded as an upgrade-preservation exception, not
silently passed. Review legacy blank-tile retention before production release.

No commit/push, Mainline change, version bump or store upload/publication.

## Owner app-closed sparse standby — 28 October 2026, READ-ONLY VALIDATION

After quitting EcoFlow on the Mac, battery receipts became sparse while
temperature stayed fresh. Battery diagnostics were stale at 199 seconds;
numeric watts/state cleared by the next observed watchdog readback, leaving
only the explicitly non-live `last_reported_standby` tile. They stayed null
at battery age 318 seconds, with an active subscription and no reconnect.

Record the timing limitation: freshness expires after three minutes, but
capability clearing is on a 60-second watchdog and is not instantaneous.
Recovery/hint horizon/reconnect remain untested; the combined hardware gate
stays partial. All 11 device definitions and 99 Flows are unchanged; 56 targeted
software tests passed. Local records only, no runtime changes or publication.
See [app-closed sparse standby](STREAM_5000_MONITORING_RC.md#owner-app-closed-sparse-standby).

## Owner natural standby — 28 October 2026, READ-ONLY VALIDATION

Native EcoFlow explicitly shows Standby/0 W/1%, matching fresh Homey zero/idle/SOC
on installed runtime `ac38129`. The standalone ES21 idle gate is accepted for
that fingerprint. History places settled zero at approximately 23:58 UTC,
after discharge and a short positive-flow interval; the exact transition and
reason were not witnessed. No explanation is inferred from the low SOC alone.

Battery receipt ages advance separately from temperature updates. Fresh battery
receipts continue, so actual silence expiry/retained-standby/recovery remains an
open hardware gate, despite 13 passing software freshness/presentation tests.
All 11 device definitions and 99 Flows are preserved; no reconnect or setting
change. These are local validation-record changes only: no runtime change,
installation, commit/push or publication; Main and Live remain unchanged.
See [natural standby observation](STREAM_5000_MONITORING_RC.md#owner-natural-standby-observation).

## Owner manual-stop charging test — 27 October 2026, COMPLETED / RESTORED / VALIDATION RECORD

Owner approved the revised 500 W one-time 23:30–00:00 native task, with manual
stop at 23:40, confirmed physical attendance/local stop and an independent alarm.
Saved non-recurrence/date/time/power were verified in EcoFlow and the existing
read-only app-connected subscription before start. No undocumented controls were used.

Native/Homey charging direction, near-time power and SOC increase agreed on the
installed ac38129 candidate. Sampled temperature stayed unchanged; per-field
receipts remained fresh and the subscription did not reconnect. Cancellation
was initiated at 23:39:47.973 and confirmed at **23:40:01.737 UTC**, followed by
fresh empty-task/discharge readback. This is manual timing, not a claim of an
exact ten-minute physical interval. Existing normal discharge resumed as expected.

At 23:42:19, the two-minute recovery check passed: reported configuration matches
baseline, all 11 device identities/settings/capability sets and 99 Flow definitions
are preserved, and six cumulative meter readings are nondecreasing. No remaining
test task or persistent setting change. This diagnostic record update changes
no Energy gate, runtime, installation, Mainline or store state. Detailed private
evidence stays outside Git.

ES21 charge and current-candidate natural discharge gates are recorded for this
standalone operating point only. ES22/accessories/linked packs, controlled
recovery, rollback, soak and Energy remain unaccepted. Overall readiness stays
PENDING. See [owner bounded charge test](STREAM_5000_MONITORING_RC.md#owner-bounded-charge-test).

## Charging precheck — 27 October 2026, HISTORICAL INITIAL ATTEMPT NOT STARTED

The owner-approved 500 W / ten-minute test was gated on a native one-time end
time and physical supervision. Native timing controls expose 00/30-minute
choices only, so the ten-minute scheduling prerequisite failed. The unsaved
default draft was discarded (Don't save); native No tasks and the support
empty-task readback were verified, with battery still idle and device settings/
Flow definitions unchanged. No native task was saved or activated at this initial
checkpoint. Physical attendance/local stop was confirmed later, and a separately
approved revised test was completed as recorded above. No replacement duration
or undocumented command was used in this initial attempt.
See [bounded charge precheck](STREAM_5000_MONITORING_RC.md#bounded-charge-precheck).
This is a local evidence update only, not a runtime/source delivery or publication.

## Firmware/history check — 27 October 2026, READ-ONLY VALIDATION RECORD

Native firmware listing for the owner ES21 reports **1.1.6.18**, with no update
available in that view. No update was started. Last-hour/five-second and
last-day/five-minute Homey histories were reviewed alongside fresh support
receipt ages. Current installed candidate remains ac38129/Development 1.10.56.

Recent battery/SOC/temperature graphs contain no gaps, but Insights masks the
brief independently observed startup-unknown interval with numeric values; it
is not a packet freshness log. The independent grid-meter channel stays unknown
as expected. A leading flow-derived import/consumption null run, at least eleven
minutes within the retrieved window, predates the current installation; its
full duration/cause is not established. Prior-day activity does not sign off
this candidate. Current battery receipts renewed independently of temperature/
health, with one active subscription attempt and no reconnect in this session.

All 11 devices/99 Flow definitions remain preserved. No runtime, hardware
setting, restart, observer, Energy, store or Mainline change. Evidence remains
private; this diagnostic records-only update leaves hardware gates unchanged.
See [firmware and history review](STREAM_5000_MONITORING_RC.md#firmware-and-history-review)
for the limits on interpreting gaps, resampling and firmware status.

## Read-only native comparison — 27 October 2026, VALIDATION RECORD

Installed ac38129 was compared with the native EcoFlow application at
approximately 22:22–22:25 UTC. Exact device identity matches the paired ES21;
only that identity gate is newly accepted for the current fingerprint. Standby
SOC/zero battery flow, Custom mode, grid limits, SOC limits and disabled reserve
agree at this operating point. Stored reserve target is not an enabled floor.
Native diagram versus unit GRID-port scopes remain distinct; no independent
whole-house meter is inferred. The native multi-day timer during empty standby
remains semantically unresolved and is not exposed in Homey.

Native membership lists the new unit; legacy units are unlinked suggestions.
Nothing was linked or configured. All 11 devices remain available, identity/
settings/capability sets and all 99 Flow definitions match the install baseline.
Subscription stays active with fresh per-field battery receipts; this window
does not exercise sparse expiry, controlled reconnect or the longer soak.
Charge/discharge, accessory loads, rollback and aggregate Energy remain open.

This record-only diagnostic update changes no runtime source, installation,
settings or store channel. Acceptance tests (13) and release
boundary/schema checks pass; overall readiness stays PENDING. Private screenshots
and selected timestamped observations remain outside Git. See
[owner read-only comparison](STREAM_5000_MONITORING_RC.md#owner-read-only-comparison).

## Monitoring recovery delivery — 27 October 2026, PUSHED / CI GREEN / DIRECTLY INSTALLED

Implementation `935547d455413357c2d4c034e065dce32733d252` is pushed on the
diagnostic branch. [Exact implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40593150462)
passed 1080 tests, lint, release checks, online audit and Homey verified validation.
Runtime fingerprint is
`ac38129ed5d61435f0092f96180718708ee594a767e352fc3fd84609d600f2c9`.
Earlier local-preparation statements below are historical, not current delivery.

Owner explicitly authorized non-clean installation. The initial CLI attempt
looked for a nested build directory and failed local validation before contacting
Homey. A programmatic packing attempt in the desktop runtime could not load a
native CLI dependency and also never contacted Homey. The normal shell runtime
then used the official CLI packer and Homey SDK devkit route with the explicit
validated staging directory, `clean:false`, and no debug session. Installation
returned the expected app ID at **22:17:10 UTC**. Production dependencies came
from the identical lockfile with scripts disabled; the official SDK shim was
restored. No dependency version, candidate source or store channel changed.

Independent readback at **22:17:26 UTC**: running Development 1.10.56, schema 19,
all 11 EcoFlow devices available; IDs, driver/data identities, settings and
capability sets match the private baseline. All 99 standard/Advanced Flow
definitions match. Six existing cumulative meter readings are comparable and
nondecreasing. Zero 5000 aggregates are paired, unit monitoring needs no opt-in,
and aggregate Energy pairing stays off. No Flows or battery commands were run.

The physical unit cleared its persisted power/state/configuration at startup;
its reading status is waiting. The subscription is active, with fresh applied
temperature/health receipts and fresh SOC-limit configuration. This demonstrates
initial reconnection and safe unknowns, not recovery of all battery/config fields,
natural charge/discharge/idle acceptance or a completed soak. Mode/reserve values
must not be restored from the old session merely to populate the display.

Previous source and the private pre-install preservation baseline are retained
outside Git. Rollback was prepared, not exercised. Mainline, store Test/Live,
hardware settings and existing Energy contracts remain unchanged. The next
physical step is continued read-only comparison on this exact runtime; hardware
acceptance gates remain open and require their own evidence.

## Monitoring validation — 27 October 2026, LOCAL / NOT INSTALLED / NOT PUBLISHED

Prepared on `codex/mixed-generation-reporting-diagnostics` after verifying local
and remote diagnostic HEAD `43669cc` agree. No commit/push or CI dispatch in this
wave; Mainline and Test/Live remain unchanged. Installed owner Development
1.10.56/schema 19 remains the older 4834191 runtime.

Reconnect now clears the previous session's configuration tracker and tiles;
failed tile clears no longer prevent unrelated clears, and watchdog retry is
preserved. Flow conditions remain unknown until fresh configuration evidence.
Report projection also requires explicit freshness rather than promoting an
omitted flag. Added regression tests cover these cases plus physical-monitor
charge/discharge/idle expiry, unchanged identity/store, no Energy/timers and
strict per-model/per-role release-readiness selection. No capability, control,
setting, permission, Flow identity or aggregate Energy contract was added.

The monitoring-only readiness command separates physical-unit acceptance from
system Energy. It does not waive model/hardware gates. See
[current validation wave](STREAM_5000_MONITORING_RC.md#current-validation-wave)
for scope, read-only owner baseline and the next acceptance steps. Hardware
acceptance remains open for the new candidate; previous fingerprint signoffs
are not inherited. Raw evidence and support email remain outside Git.

Local results: **1080/1080 tests**, lint, release-boundary/acceptance-schema
checks, offline dependency audit (zero reported vulnerabilities), diff whitespace
checks and Homey CLI 4.5.3 verified validation passed. Full tests include existing
desktop/mobile workflow checks. Candidate runtime fingerprint:
`ac38129ed5d61435f0092f96180718708ee594a767e352fc3fd84609d600f2c9`.
No new native mobile-host acceptance or EcoFlow-screen comparison was performed.
Readiness remains PENDING, independently of these green software checks.

## Sparse-idle delivery — 26 October 2026, PUSHED / CI GREEN / DIRECTLY INSTALLED

Implementation `a6e4e316cc25aae49be9cabb609df550c9bfa1c1` is pushed to the
diagnostic branch. [Exact-commit CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40358890530)
passed all 1074 tests, lint, release checks, audit (zero vulnerabilities) and
verified Homey validation. Source/runtime fingerprint remains
`4834191f7d05103da42b500c17dedd6587aaafa754d3ac6210d65a9db0c5a7b0`.

Direct non-clean installation succeeded using Homey's normal direct discovery
route. The initial cloud-routed upload was rejected (400); readback confirmed the
previous schema-18 candidate still running before retrying. CLI exit zero alone
is not success evidence. The normal direct retry explicitly reported successful
installation; subsequent readback confirmed running Development 1.10.56,
schema 19, no crash, ungated unit monitoring and aggregate pairing consent off.
No version bump, store upload/publication, Mainline merge or battery command.

Owner readback at **16:28:51 UTC**: all 11 EcoFlow devices available, identities,
settings and existing capabilities preserved; exactly the expected new status
capability was added to the physical unit. All 99 saved standard/Advanced Flow
definitions match the immediate pre-install baseline, and cumulative counters
show no reset. Zero 5000 aggregates are paired. These are preservation checks,
not physical execution of every Flow or aggregate accounting acceptance.

Installed desktop Homey shows the read-only `Battery reading status` tile and a
fresh zero/idle pair. At **16:32:43 UTC**, report and tile both remained `live`
with a recent coherent standby receipt; unrelated connection receipts had their
own ages. Active EcoFlow app use was noticed and native navigation was stopped.
Fresh receipts continued during this short window, so native sparse expiry,
20-minute retention, reconnect and recovery are NOT signed off by the replay
tests or this installation. A native long soak and charge/idle/model/accessory
and rollback gates remain open. No extra Robert capture is requested.

The install package used the identical production lockfile, staged SDK shim and
verified validation without the CLI's dependency-fixture copy path. The previous
owner source is privately retained as a recovery archive; rollback was not
exercised. Raw reports, household values, IDs and credentials remain outside Git.
Earlier local/pre-install checkpoints below are historical; the installed
runtime is now 4834191, not 9d9881d.

The documentation-only follow-up CI caught a literal-heading/anchor mismatch in
the acceptance link check. The heading was corrected without changing its
GitHub anchor or the runtime; this is not a candidate runtime test failure.

### Delivery authorization and baseline (historical pre-install checkpoint)

The owner authorizes committing/pushing the prepared diagnostic increment,
checking exact-commit CI, and directly installing it non-clean for read-only
validation. Store Test/Live and Mainline must stay unchanged. No charging test,
battery-setting write, aggregate pairing, Energy activation or observer start.
Remote diagnostic HEAD was independently checked against local `91b0093` with
no intervening work. Fresh owner readback: running Development 1.10.56, schema 18,
all 11 EcoFlow devices available, 99 Flow definitions, aggregate pairing opt-in
off. Detailed identity/settings/counter baseline is private. The prepared runtime
is 4834191 (full fingerprint below); installed runtime was still 9d9881d at this
checkpoint. Completed delivery/readback above supersedes this state.

## Sparse-idle presentation — 26 October 2026, LOCAL / NOT INSTALLED / NOT PUBLISHED

Read-only owner validation of the installed 9d9881d candidate found natural
discharge-to-standby history and a healthy subscription, but sparse battery-flow
receipts during standby. Temperature/health receipts continued while the live
power/state tiles expired. EcoFlow's expanded battery view reported Standby;
the unit page's remaining-time estimate is still unmapped. Its settings panel
did not populate reliable power-limit values, so configuration parity was not
signed off. Legacy units briefly reported offline and recovered; this does not
establish a 5000 regression. Cloud Homey reads recovered access after a cached
local SDK route timed out; no app crash or deliberate restart was observed.
Private comparisons found device identities/settings/capabilities, saved Flow
definitions and cumulative-counter continuity preserved. Raw evidence remains
private. No hardware acceptance gate was promoted on this basis.

Prepared on the diagnostic branch:

- Physical monitors gain a read-only `Battery reading status` enum tile, including
  `Last report: Standby (not live)`. It requires zero flow and idle state together
  in a successfully applied delta, and is never a replacement current-state value.
- Last-standby evidence is memory-only, bounded to the shorter of the connection
  limit and 20 minutes, and discarded on reconnect, teardown, clock rollback,
  failed application, conflicting/missing direction or linked-pack uncertainty.
  Unrelated updates cannot renew it. Status writes share the telemetry queue;
  optional tile failures clear best-effort without preventing unit subscriptions.
- The 180-second live-power/state expiry, standard numeric capabilities,
  accounting, controls and Flow identities/contracts are unchanged. No extra
  polling, requests, timers, observer activation or aggregate Energy admission.
  The new tile has no automatic Flow tag or Insights history and is not added to
  aggregate drivers. Existing devices receive it in place only on a future update.
- Support schema 19 adds a fixed anonymous status/age projection, not last-known
  watt numbers or private identities. Desktop/mobile report UI explains why a
  connected device can have expired live battery readings.

Local checks: **1074/1074 tests**, lint, release-boundary/acceptance-schema checks,
zero audit vulnerabilities and verified Homey validation pass. Browser tests cover
desktop/mobile report wording, layout and no writes. Runtime fingerprint:
`4834191f7d05103da42b500c17dedd6587aaafa754d3ac6210d65a9db0c5a7b0`.
Source version remains 1.10.56. This work is uncommitted and has no exact-commit CI
or installed-host acceptance. Main/Live, store Test, installed candidate and
battery configuration remain unchanged. Do not carry old hardware signoffs over.

Next: with approval, commit/push/check CI and directly install this increment;
then compare live-to-expired standby status and fresh recovery on the owner unit.
Separate bounded approval is required for deliberate charging, silence/reconnect
or aggregate pairing. Continue a native 48-hour soak and per-model/accessory
acceptance; neither a healthy endpoint nor averaged Insights proves fresh power.
No additional Robert capture is required.

## Diagnostic delivery — 25 October 2026, PUSHED / CI GREEN / DIRECTLY INSTALLED

Implementation commit `21191228ed90a4fb171b18363a7cdcbad8e63c69` is on the
diagnostic branch. [Exact-commit CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40239765856)
passed: 1064 tests, lint, release checks, dependency audit (zero vulnerabilities)
and verified-level Homey validation. Version remains 1.10.56.

The updated candidate was directly installed non-clean on the owner Homey.
Readback at **22:30:13 UTC** confirms running Development 1.10.56, no crash,
support schema 18, unit monitoring requiring no opt-in and aggregate Energy
pairing disabled. All **11** EcoFlow devices are available with unchanged
identities/settings; no capability was lost or counter reset on the update.
All **99** saved standard/Advanced Flow definitions match the private baseline.
Preservation is not an execution test of those Flows.

Installed desktop inspection confirms the retired Beta checkbox is absent, the
separate Energy switch/help is present, unit pairing opens the monitoring
disclosure without an opt-in and aggregate pairing stops at the disabled-consent
screen without Continue. Both sessions were cancelled before credentials or
device addition; no setting was saved. Zero 5000 aggregates remain paired.
Inventory/add completion and mobile-host acceptance are still untested.

Runtime fingerprint is
`9d9881df03aba7c5dd2c21f8dd006877a42bbff6b59314b6cc7f7ea09ebd3924`.
Earlier a15ae0d physical signoffs remain historical, not silently carried over.
Charging/idle, accessory/model coverage, recovery/rollback, aggregate Energy and
48-hour native soak remain open. Passive timer observation and new controls stay
disabled. No additional Robert capture is requested for this delivery.

Mainline refs, store Test/Live, physical configuration and Energy participation
are unchanged. No store command or version bump was performed. The staged
installation first needed a local validation-path correction before contacting
Homey; the subsequent validated package installed successfully. Deployment notes
and acceptance evidence below retain their historical checkpoint dates.

### Delivery authorization and baseline (historical pre-install checkpoint)

Owner now authorizes committing and pushing the prepared diagnostic work,
checking exact-commit CI, and directly installing the updated candidate on their
Homey after CI succeeds. Mainline and store Test/Live must stay unchanged; no
store publication, version bump, aggregate pairing, Energy activation, battery
configuration change or manual Flow execution is authorized by this delivery.
The source remains monitoring-only with new aggregate pairing default-off and
the passive timer observer disabled.

Before delivery, remote diagnostic HEAD matched local `1b5f7ef`; no competing
diagnostic commits were found. Fresh owner baseline: running Development 1.10.56,
support schema 17, 11 EcoFlow devices, 99 Flow definitions and no 5000 aggregate.
Identity/settings/Flow/counter baselines remain private. Candidate runtime
fingerprint is `9d9881df03aba7c5dd2c21f8dd006877a42bbff6b59314b6cc7f7ea09ebd3924`.
Source commit, CI and updated installation were pending at this checkpoint;
the completed delivery above supersedes it.
Earlier local-only restrictions below describe their historical checkpoints.

## Pairing cleanup — 25 October 2026, LOCAL / NOT INSTALLED / NOT PUBLISHED

Current authority: separate unit monitoring from aggregate Energy pairing on
the diagnostic branch, add regression tests, keep Main/Live unchanged and do not
publish or reinstall. The owner Homey remains on the earlier directly installed
Development 1.10.56 fingerprint recorded below, with its older pairing UI.
No live setting, device, Flow, account or Energy participation changed this wave.
No commit/push or version bump was performed.

- Unit/legacy physical-monitor discovery no longer needs a Beta setting. Exact
  ES21/ES22 model/adapter admission and same-role duplicate checks remain intact.
- Home Battery (5000) new pairing has its own default-off key:
  `stream5000AggregatePairingEnabled`. Only boolean true permits it. Actual driver
  ID determines the role; browser-supplied data cannot choose the unit exemption.
  Consent is checked before inventory, after asynchronous inventory and before
  credential commitment on device addition. Generic app-auth users keep their
  prior behaviour when no admission hook is supplied.
- The retired `stream5000BetaEnabled` value is neither read, overwritten nor
  removed. It cannot silently grant new Energy consent. Existing paired units
  and aggregates keep their data/settings/identity/accounting independently of
  pairing consent; no repair/delete/re-pair or credential migration is performed.
- Unit pairing starts with a connection disclosure; aggregate pairing has a
  separate Energy-access screen. Settings, credential headings, EN/DE/NL store
  summaries and wrong-path guidance no longer direct users to a shared Beta gate.
  Unknown models, mixed-generation trials, Dual CT previews/energy and controls
  keep their existing restrictions.
- Support schema 18 adds anonymous role-specific pairing access. The old
  `betaPairingEnabled` field remains false as a retired compatibility field.
  The report reads only the new non-secret setting, not the old flag or credentials.
- Source/runtime fingerprint changes deliberately invalidate prior candidate
  signoffs for the new source. Earlier owner observations/passes remain attached
  to the installed a15ae0d candidate; do not relabel them as cleanup acceptance.

Local checks: **1064/1064 tests** (9 new regressions), lint, release boundaries
and ledger checks pass. Desktop/mobile Chromium pairing pages check normal unit
entry, strict aggregate consent/recheck and layout without JavaScript errors.
The settings tests cover old-flag isolation, cancellation, save failure and a late
initial read; real lifecycle regression keeps existing aggregate accounting and
unit monitoring running with pairing opt-ins off. Dependency audit reports zero
vulnerabilities. Verified-level Homey validation passes with the existing broad
API review warning; it does not install. Build-folder regeneration conflicted
with one overlapping check run; the final full suite was rerun sequentially and
passed. Native pairing acceptance of this cleanup remains open.

New source fingerprint:
`9d9881df03aba7c5dd2c21f8dd006877a42bbff6b59314b6cc7f7ea09ebd3924`.
Hardware readiness correctly remains pending, including previously observed
checks whose saved fingerprint belongs to the older installed candidate. No new
remote CI or hardware acceptance is claimed. No further Robert capture requested.

## Owner monitoring candidate — 25 October 2026, DIRECTLY INSTALLED / STORE UNCHANGED

Owner authorized installation on their Homey and continued STREAM 5000 validation.
The candidate was non-clean installed directly; readback at 21:44:47 UTC confirms
version **1.10.56**, origin **devkit_install** (Development), running, not crashed.
This supersedes the earlier uninstalled/local-only checkpoint below for installed
state only. Mainline, store Test/Live and physical battery configuration are
unchanged by this work. No commit/push, version bump, store upload/publication,
new pairing, manual Flow execution or battery-setting command was performed.

Exact source runtime fingerprint remains
`a15ae0d7888477c0835f26594799087e8cdccef69d1e6b48fea4829637f5d5f3`.
The source is still local/uncommitted. No new remote CI is claimed. The disabled
passive observer remains disabled, as do new 5000 controls and Dual CT Energy.

Installation preparation recovered from a CLI dependency-fixture copy stall
before contacting Homey: production dependencies were reconstructed offline in
the generated build from the identical lockfile, TypeScript rebuilt, the official
SDK shim restored and the staged package verified-level validated. The validated
package then installed successfully without a further copy/build pass. Runtime
source/manifest/dependency versions did not change. No clean install was used.

Native acceptance through 21:49:48 UTC:

- All **11** EcoFlow devices returned available with unchanged IDs, driver/data
  identities and settings; no existing capability was removed. Only the expected
  5000 reserve-state tile was added. Known default labels migrated in place.
- All **99** standard/Advanced Flow definitions matched their pre-install hashes.
  This is preservation, not a physical execution test of every Flow. Original
  Home Battery and meter counters did not reset; unit SOC/power Insights contain
  samples before and after installation. Direct SDK history reads work with null
  gaps; the connected reader's numeric-only schema is a separate limitation.
- ES21 identity and observed standalone natural-discharge SOC/sign/power comparison
  pass for this exact fingerprint. No full-range calibration, ES22, linked-pack
  direction, charging/idle or aggregate Energy acceptance follows from this.
- New read-only reserve state and stored target remain separate and agree with
  EcoFlow. Configuration cleared at restart and only repopulated on fresh receipt;
  mode/grid/reserve data arrived after native settings navigation. Immediate
  autonomous configuration refresh is not established. Configuration/recovery
  acceptance remains partial rather than displaying old settings as current.
- Installed desktop Configure/support report works and correctly distinguishes
  available unit readings from unverified physical-pack scope and Energy. The
  5000 aggregate remains unpaired; independent grid-meter reading remains unknown.
- A pre-existing same-day Homey backup and retained previous Test source provide
  recovery options, but rollback was not exercised. No raw reports, household
  numbers, private IDs or credentials enter the repository.

See [candidate plan and native findings](STREAM_5000_MONITORING_RC.md#owner-candidate-installation)
and the sanitized model/role ledger. Overall readiness intentionally remains
pending. Next physical steps require a bounded charge/idle test and separate
approval to pair one new-space Home Battery (5000); do not replace the original
battery, install the Dual CT or alter wiring/schedules as an implicit test.
Longer native soak, mobile settings, controlled silence/reconnect and rollback
remain open. No additional Robert capture is requested.

Post-install local checks: **1055/1055 tests**, lint and software/acceptance-ledger
checks pass; the staged package passed Homey CLI 4.5.3 verified validation before
installation. The expected broad-API review warning remains. Hardware readiness
is still pending. End readback at **21:52:43 UTC**: running Development app,
no crash reported, all 11 EcoFlow devices available and no 5000 aggregate paired.

## Monitoring release candidate — 25 October 2026, LOCAL / VALIDATION STARTED / UNPUBLISHED

Current authority: read-only owner validation and local monitoring-candidate
preparation on the diagnostic branch. Mainline, Live, Test, installed app,
battery configuration and existing Flows remain unchanged. No commit/push,
version bump, installation, restart, re-pairing or publication is performed.
The preceding disabled observer preparation remains intact and inactive.
Source version remains 1.10.56; installed Test 1.10.56 does not contain this work.

- Fresh near-time native EcoFlow/Homey comparisons corroborate ES21 discharge
  SOC/direction/power and configuration, with independent successful receipt ages.
  Fresh Developer-key inventory/main-address reads corroborate identity/routing;
  full quota still returns 1006. The app-connected feed remains the working path.
- The owner's new device is the optional physical monitor; no 5000 aggregate is
  paired. The original Home Battery remains separate. Grid flow is not an
  independent whole-house meter. Night-time zero PV and unavailable socket output
  do not validate those accessories. No settings or physical commands changed.
- Native battery-management display confirms reserve is disabled while a stored
  target is reported. New reserve-state tile/label migrations remain uninstalled.
  The connected Insights history reader rejects null entries at its schema
  boundary; no history-based acceptance or device fault is inferred from that.
- Added a [bounded monitoring release plan](STREAM_5000_MONITORING_RC.md), sanitized
  per-model/per-role acceptance ledger and exact-runtime fingerprint checker.
  Partial installed/community evidence cannot sign off unpublished source, another
  model or aggregate Energy. Unknown/raw evidence fields are rejected.
- Normal software `release:check` reports pending hardware gates; separate
  `release:acceptance` deliberately refuses readiness until the declared model/
  role gates pass. This tool cannot activate, install or publish anything.
  Current pairing gates remain in place until their scope is accepted.
- Added regression coverage for ledger/schema/privacy, evidence provenance,
  fingerprint mismatch, model/role separation, readiness exit status and unchanged
  monitoring/control/pairing boundaries. Updated model/architecture pointers so
  historical version/build statements are not read as today's release status.

Final local checks: **1055/1055 tests** (11 new acceptance regressions), lint,
release boundaries/ledger validation, zero reported dependency-audit
vulnerabilities and Homey CLI 4.5.3 verified validation pass. The existing broad
Homey API permission review warning remains. Runtime fingerprint:
`a15ae0d7888477c0835f26594799087e8cdccef69d1e6b48fea4829637f5d5f3`.
The explicit hardware-readiness command returns exit 1, as intended: gates are
still open, not failed software tests. Source stays local/uncommitted; no new
remote CI or hardware charging/idle/recovery/upgrade/Energy pass is claimed.
Next: explicitly approved candidate installation and acceptance on owner Homey,
then bounded state/recovery/aggregate comparisons and normal-use observation.
No further Robert capture is requested by this wave.

## Passive remaining-time observer — 25 October 2026, LOCAL / DISABLED / UNPUBLISHED

Current authority: prepare the bounded observer and regressions on the diagnostic
branch only. Keep it disabled. No commit/push, publication, installed-host update,
physical command, mainline/Live/Test change or activation is authorised this turn.
The preceding source checkpoint `1b5f7efe2d20ed3e45d27d1199ba07c37feb3348`
passed exact [CI 40230853803](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40230853803);
the work below is local only and has no new remote CI. Version remains 1.10.56.

- Added an inert existing-subscription tap. Runtime default is false and there
  is no start call, setting, API/Flow activation, new connection or polling.
- Explicit-start test instances collect only bounded numeric structural
  candidates/receipt times. No raw payload, text, serial/peer record, credential,
  schedule window, guessed duration, scalar scaling or production reading write.
- Caps: 2-minute capture, 10-minute evidence-access deadline, 16 KiB/frame,
  2 MiB input, 512 inspected frames, 64 samples, 2,048 rows, bounded headers and
  scalar parsing. Read/receipt/watchdog expiry does not refresh evidence; explicit
  driver resubscription and teardown purge it. No extra timer, persistence,
  logging or general export. Transparent broker/account-session epoch binding
  remains an activation gate; no reconnect continuity is inferred.
- Status getter is numeric-evidence-free. Private candidate retrieval is not
  wired to support reports, UI, Insights, Flows or Energy. Existing support
  schema/capabilities, pairing, version and control/accounting contracts unchanged.
- Release-boundary checks reject accidental gate activation or runtime start.
  See [timer audit](STREAM_5000_REMAINING_TIME_AUDIT.md) for limits, privacy,
  lazy cleanup semantics and the future explicitly authorised activation gate.

Local tests: **1044/1044** (19 added), lint, release-boundary checks, zero
reported dependency-audit vulnerabilities and Homey CLI 4.5.3 verified validation
pass. The existing broad-API review warning remains. These are offline checks,
not capture/activation/native-upgrade acceptance or a new remote CI result.
No new owner or Robert capture was requested or started.

## Configuration labels / reserve status / timer audit — 25 October 2026, PUBLICATION HELD

Current authority: commit/push the diagnostic branch and verify its exact CI.
Publication, version bump, installed-host update and physical commands are not
authorised. Mainline, Live and Test remain unchanged. Source remains 1.10.56.
This includes the earlier local owner-validation wave below; Build 70 does not
contain these changes. CI is pending at this source checkpoint; read the exact
commit's validation result independently of the local checks below.

- Configuration titles now match EcoFlow terminology, translated EN/DE/NL.
  Known defaults migrate in place while custom titles/options, capability IDs,
  mode IDs and Flow arguments survive. No control listeners were added.
- New read-only `stream_5000_backup_reserve_state` distinguishes enabled/disabled
  from the existing numeric stored target. Unknown/stale status stays null;
  state and target expire independently and restart clears both until receipt.
  An optional capability-add failure cannot prevent telemetry subscription.
- The report explains subscription-source versus independently verified system
  scope, grid draw versus total charging/task power, and electrical-capacity limits.
- Native EcoFlow display comparison corroborates observed configuration and
  natural-discharge readings, not electrical calibration or setting enforcement.
  No raw private reports, screenshots or household measurements are committed.
- Remaining time is still unmapped, not zero. Fresh primary upstream review and
  offline public-capture replay do not identify a verified duration contract.
  Tests reject accidental BK-field borrowing and SOC/capacity/power estimates.
  See [remaining-time audit](STREAM_5000_REMAINING_TIME_AUDIT.md) for evidence
  boundaries and owner-hardware next steps; no further Robert capture requested.

Checks: **1025/1025 tests** (6 added this wave), lint, release-boundary check,
zero reported dependency-audit vulnerabilities, and Homey CLI 4.5.3 verified
validation. Existing broad-API review warning remains. Desktop/mobile synthetic
settings workflow passes without writes/discovery; mobile report inspected.
A pre-existing browser-test zero-age race appeared under full-suite load;
its clock is now explicitly paused and expiry remains explicitly advanced.
Local checks are not new remote CI or native upgrade acceptance.

## Owner ES21 read-only validation — 25 October 2026, LOCAL / UNPUBLISHED

Owner authorises available STREAM 5000 validation and diagnostic-branch
improvements only. Mainline, Live and Test remain unchanged. Source version is
still 1.10.56; Build 70 does not contain this local work. No commit/push, version
bump, pairing, installed app update/restart, Flow execution or battery-setting
write was performed. The owner confirms the Dual CT is not installed.

Live, read-only Homey/settings evidence identifies the new device as ES21 and
the physical-monitor role, not a 5000 Energy aggregate. Repeated snapshots show
fresh discharge/SOC/temperature and reported configuration. The app flow matrix
is internally consistent in those discharge snapshots, but is not an independent
EcoFlow-screen, electrical or whole-house-meter comparison. The Developer API
lists the unit and resolves its main address to itself; quota access returns
1006. That is routing evidence, not verified space membership. Raw reports,
credentials, serials, device names and household measurements are not in Git.

Local improvements:

- Physical diagnostics now distinguish a fresh successfully applied Unit watt
  reading (including zero) from waiting/stale/write-failed values. Existing
  linked-scope warnings take precedence. `physicalScopeVerified` stays false;
  neither diagnostics nor optional unit tiles acquire Energy authority.
- EN/DE/NL report UI separates reserve enablement from the independently fresh
  stored percentage. A disabled reserve's target is not presented as active
  protection. No setting/capability/control contract is changed.
- Unit-only setup guidance explains that a separate Home Battery (5000) is
  needed for installation accounting, without replacing a legacy battery in
  another space or pairing one aggregate per unit. It does not infer topology.
- Updated the indirect MQTT `ip-address` lock entry from 10.7.2 to 10.7.4 for
  [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).
  No direct dependency/API changed. An isolated, deadline-bounded regression
  checks valid addresses and oversized multiline-zone rejection. The lock URL
  remains the public npm registry, not the local registry mirror.

Local checks: **1019/1019 tests** (7 added), lint, release-boundary checks, zero
reported audit vulnerabilities and sequential Homey CLI 4.5.3 verified validation.
The existing broad-API review warning remains. Desktop/mobile report workflows
passed with synthetic inputs, no settings writes or automatic discovery. These
are local checks, not a new CI, Test or native-upgrade acceptance claim.

Still open: charging/idle transitions, independent power/sign/scale comparison,
PV, backup socket, reconnect/restore behaviour, 5000 aggregate energy continuity,
meter installation and two-space membership/overlap validation. ES22 and mixed
generation acceptance do not follow from this ES21 observation. No new controls,
Dual CT Energy, automatic grouping or legacy accounting changes. No further
Robert captures requested. See RELEASE_CANDIDATE_CHECKLIST.md.

## Test v1.10.56 / Build 70 — published 17 October 2026

Supersedes the authorised/local checkpoints below. Diagnostic source commit
`a3ab79186bbffa086903bbf82b2c1914d424251c`; version/tag commit
`62838e235748b5ebdc986b529dc2ffd620b5f566`. Source CI
[39074643490](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39074643490),
version workflow [39074789623](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39074789623),
exact-tag CI [39074866974](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39074866974)
and upload [39075018472](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39075018472)
all passed. Both validation runs passed **1012/1012 tests**, lint, release-boundary
checks, zero-vulnerability dependency audit and Homey CLI 4.5.3 verified validation.
Fresh local checks and versioned package validation also passed. The existing
broader-API extended-review warning remains; no permission was added this wave.

Build 70 archive readback matched **24 exact runtime/settings/locale/store-copy
files**. The complete packaged manifest matches except Homey's author-email
privacy filtering. Dual CT remains a custom-only read-only preview, without an
Energy declaration; no new controls or public API routes were added. Archive
SHA256: `a7fc8142e68908fecc066603c5321c07ca9d01f76116277d547cc85969adff5f`.

Portal permanent-record reload and public listing confirm **Test v1.10.56 /
Build 70**, observed by **2026-10-17 22:28 UTC**:
[portal](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/70),
[Test](https://homey.app/en-gb/app/uk.co.zarb.ecoflow/EcoFlow-STREAM-Series/test/).
Live remains **v1.10.3 / Build 18**. Local `master` remains
`8bb4e468e9bcc510c28049ec4e89736ac2733879`; remote `master` remains
`66b1cb5f828a53333739798281fce86125f61c28`. No mainline merge or certification
submission was made. No manual installed-host update, Flow activation, physical
command or owner-hardware acceptance is claimed. No new Robert capture requested.

The recovery fix, clearer source/access UX, endurance regressions and scope/API
audits are included in this Test archive. Native upgrade/recovery and per-model
hardware acceptance remain open; see RELEASE_CANDIDATE_CHECKLIST.md. New charging
controls and Dual CT Energy activation remain disabled. Existing Flow identities
and argument contracts, driver identities and energy accounting are preserved.

## Four release-hardening sprints — 17 October 2026, Test release AUTHORISED

Owner now authorises committing/pushing this diagnostic wave, checking exact
source and version/tag CI, and publishing a new Test build only after checks
pass. Mainline and Live remain unchanged. Publication is pending; the local
implementation checkpoint below records the earlier restricted scope, not the
current release authority. No installed-host update or physical command is
authorised, and controls / Dual CT Energy activation remain gated.

Owner authorises diagnostic-only implementation, regression tests and local
release checks. No commit/push, version bump, Test upload, mainline merge,
certification, installed-host update or physical command. Source version remains
1.10.55. The published Build 69 below does not contain these local changes.

1. Recovery: timed-out/cancelled workspace requests release their operation slot
   immediately, including uncooperative SDK promises. Generation/operation-owned
   cleanup prevents late success/rejection or an old timer from affecting a retry.
   Revocation settles callers, cancels owned timers/HTTP and discards late readers.
   Account changes also revoke the page reader. No guessed platform-token revoke.
2. Regression/endurance: 100 page read/revoke cycles, 96 explicitly started
   observation leases over 48 simulated UTC hours spanning UK DST, resource/dwell
   checks and original/ES21/ES22/preview transport coexistence. Existing actual
   driver restore/checkpoint/Flow-compatibility regressions also pass. Synthetic
   transport subscribers are not model decoding or native Homey acceptance.
3. Source/access UX: shared display-only candidate classification; explicit source
   versus reported units and capability-timestamp ages; no invented heartbeat,
   timing exemption, vendor admission or upstream-zero guarantee. Failed sessions
   disable further reads until explicit picker retry. SDK permission/token and
   application-reader lifetimes are distinguished in EN/DE/NL. Public Fronius
   source and Solis reference evidence reviewed; installed vendor contracts remain
   unverified. See COORDINATION_SOURCE_AUDIT.md.
4. Release scope: `npm run release:check` adds manifest/legacy-contract/permission /
   no-new-actions/no-Energy/no-preview-autostart fences, including negative tests,
   and is added to the local CI definition. Model matrix and EN/DE/NL store copy
   now distinguish monitoring/previews from controls/Insights. The rendered
   official STREAM API and pinned upstream 5000 command source were reviewed;
   task charge-power readback is not physical enforcement. Original 95% guidance
   versus legacy 100% helpers remains an explicit control-release review item.
   See STREAM_CONTROL_CONTRACT_AUDIT.md and RELEASE_CANDIDATE_CHECKLIST.md.

Final local checks: **1012/1012 tests** (19 added), lint clean, release-boundary
check passed, dependency audit **0 vulnerabilities**, diff checks clean, and
Homey CLI 4.5.3 verified validation passed sequentially after tests. Expected
broader-API extended-review warning remains; no additional permission/dependency
was added. Desktop/mobile browser workflows passed with synthetic Homey bridge.
Version/manifests, driver capabilities/Energy and existing command/accounting
modules are unchanged. Core Flow identities/argument contracts are preserved.

Mainline refs remain local `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote
`66b1cb5f828a53333739798281fce86125f61c28`; diagnostic HEAD remains `894f058`
with local changes only. No new remote CI or portal/hardware state is claimed.
No new Robert capture/export is requested. Dual CT Energy and new charging
controls remain disabled; native settings, backup/upgrade/rollback and per-model
physical commissioning remain open and need separate approval/equipment.

## Test v1.10.55 / Build 69 — published 17 October 2026

Supersedes the authorised/local checkpoints below. Diagnostic source commit
`4d0ba6e05782fab6f56027f3acab78ccf6be93cd`; version/tag commit
`c3690b8d9b3fbef4541e5f02288c84dcf21c8a3d`. Source CI
[39072576820](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39072576820),
version workflow [39072671453](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39072671453),
exact-tag CI [39072728019](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39072728019)
and upload [39072853123](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39072853123)
all passed. Both CI validation runs passed **993/993 tests**, lint, zero-vulnerability
dependency audit and Homey CLI 4.5.3 verified validation. Local versioned validation
also passed. The broader API permission produces the expected extended-review warning.

Build 69 archive readback matched **19 exact compiled/runtime/settings/locale
files**. Manifest matches the local packaged manifest except Homey's author-email
privacy filtering; it confirms two new WHEN cards, four AND cards, no new THEN
card and a custom-only Dual CT preview with no Energy declaration. Archive SHA256:
`3724bf9c03de4b6e80c2609ae1dcf3154def762356f2a758f459e3c8c11348b1`.

Portal and public listing confirm **Test v1.10.55 / Build 69** at
`2026-10-17T21:55:41.845Z`:
[portal](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/69),
[Test](https://homey.app/en-gb/app/uk.co.zarb.ecoflow/EcoFlow-STREAM-Series/test/).
Live remains **Build 18 / v1.10.3**, unchanged July release. Local `master`
remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`; remote `master` remains
`66b1cb5f828a53333739798281fce86125f61c28`. No mainline merge or certification
submission was made. No manual installed-host update, Flow activation, physical
command or owner-hardware acceptance is claimed.

The selected-source workspace and separate temporary Flow monitor stay opt-in.
The platform API permission is broad, although these implementations use fixed
GET-only routes; consent does not narrow the platform permission itself. Known
Dual CT preview candidates remain excluded from the new Flow monitor. Existing
Flow identities/argument contracts are preserved, but unknown or expired readings
now deliberately reject condition evaluation. New charging controls and Dual CT
Energy remain disabled. No further Robert capture/export is requested.

## Consolidated coordination / legacy reliability — 17 October 2026, Test release AUTHORISED

Owner authorises committing and pushing the accumulated diagnostic changes,
checking exact CI, and publishing a consolidated Test build. Mainline and Live
must remain unchanged. The four local checkpoints below describe implementation
history, not the final publication state. All 993 local tests, lint, dependency
audit (zero vulnerabilities), diff checks and sequential Homey CLI 4.5.3 verified
validation passed. Current source still requires remote CI and portal readback.

This adds explicit circuit scopes, an opt-in selected-source advisory workspace,
six observation-only WHEN/AND cards with separate temporary monitoring consent,
and original-STREAM/forecast Flow reliability and wording fixes. Existing Flow
identities and argument contracts are preserved. The prepared broader Homey API
permission requires additional store review; implementation reads are fenced and
default-off. No new THEN actions, control activation, Dual CT Energy adoption,
installed-host update or hardware acceptance is authorised or claimed. Known
Dual CT candidate-preview capabilities cannot feed the new observation monitor.
No further Robert captures are requested.

## Legacy card reliability / wording — 17 October 2026, LOCAL / UNPUBLISHED

Owner authorised diagnostic-only implementation, preserving the earlier local
coordination changes below. Existing original-STREAM Flow listeners now reject
unknown/stale/mismatched inputs, including inversions, using per-field applied
receipt checks. Solar/load inference requires all three coherent observations;
missing load is no longer zero and its wording no longer promises solar origin.
Reported mode/feed-in and percentage-limit/export-permission wording is clearer.
Existing card IDs, argument contracts, dropdown values, tokens and driver targets
are preserved; no user Flow was changed. Invalid inputs now stop deliberately.

Forecast cards require the correct provider-labelled Homey-local date/timezone,
matching location/calibration, successful application and receipt age under six
hours. Midnight/DST, restart, changed settings, malformed/missing data, failed
writes and late responses cannot qualify a cached forecast. Pending requests
coalesce; settings changes wait for actual SDK commit before weather refetch.
Original receipt and reconnect baselines reset without changing energy accounting
or broadening control commands. See LEGACY_FLOW_RELIABILITY.md for limits.

No new cards/commands/permissions/Energy paths in these sprints. No installed
device access, Robert capture request, commit/push, CI, version bump or Test
publication. Mainline/Live remain untouched; earlier local work is retained.
Final local checks: **993/993 tests** (17 new legacy/forecast regressions), lint
clean, dependency audit 0 vulnerabilities and clean diff checks. Homey CLI 4.5.3
verified validation passes with the pre-existing broader-API review warning;
validation is run sequentially after the final tests. A pinned, public-metadata
v1.10.54 Flow-contract fixture avoids reliance on mutable HEAD or Git history
in CI. Existing arguments and identities are exact, not merely resolvable.
No installed Flow/hardware acceptance, CI run or publication is claimed.

## Coordination Flow observation sprints 1/2 — 17 October 2026, LOCAL / UNPUBLISHED

Owner authorised local implementation on the diagnostic branch, preserving the
uncommitted source-workspace/advisory changes below. Six new app-level WHEN/AND
cards cover advisory state/availability transitions, current coherent readings,
external-battery priority, sustained grid export and explicit-role branch power.
No THEN action, charging control, new device/capability or Energy adoption.

The separate opt-in settings controls start a RAM-only 30-minute observation
lease. Polls read only selected devices, about every 15 seconds, with ten-second
deadlines. No automatic start/restore/renewal; closing the page does not stop
this explicitly separate session. Stop, saved-source/account changes, restart
or expiry revoke it. Server revisions prevent delayed Starts undoing Stop.
Timestamp/contract/coherence checks, bounded advancing-observation histories,
internal advisory state, stale expiry and reconnect resets prevent cached or
caller-forged dwell. Unknown conditions reject even when inverted. Known Dual CT
candidate-preview sources remain blocked; selecting them does not enable their
Flow automation. Hardware freshness/solar origin are never claimed verified.

See COORDINATION_FLOW_OBSERVATIONS.md for card IDs, consent warnings (events may
run existing user THEN actions), exact limits and acceptance gates. No captures
requested, no installed Homey/API activation, CI, commit/push, version bump or
publication. Mainline/Live and published Test v1.10.54 / Build 68 are unchanged
by this work. Final local verification: **976/976 tests** (17 new Flow/lifecycle
and settings regressions), lint clean, dependency audit 0 vulnerabilities and
diff checks clean. Homey CLI 4.5.3 verified validation passes with the expected
broad-API-permission review warning; checks run sequentially after tests.
Semantic manifest comparison confirms exactly six new WHEN/AND cards and the
private monitor route, alongside the earlier workspace route/permission only.
Version, existing actions/Flow cards, drivers, capabilities and Energy declarations
are unchanged. Browser tests cover desktop/mobile with synthetic sources; no
installed-host, real Flow scheduling or vendor hardware acceptance is claimed.

## Coordination sprints 1/2 — 17 October 2026, LOCAL / UNPUBLISHED

Supersedes the local advisory-only checkpoint below. On the diagnostic branch,
the visible EN/DE/NL settings workspace and explicit selected-source bindings
are implemented locally. Cross-app `homey:manager:api` permission preparation
was explicitly approved, but nothing was installed or activated. Permission is
broad; the implementation uses only fixed local GET routes, no new dependency,
no automatic polling and no controls/Flow actions/Energy activation.

Owner consent and individual reads are explicit. The local picker projects
metadata; saved configuration contains bindings only. Selected capabilities are
checked for numeric type, W/kW/% units, signs, source identity and availability.
Capability `lastUpdated`, not read time, determines conservative 60-second
expiry; it is not a verified hardware heartbeat. Source edits reset all review
confirmations, data gaps/source/session changes reset advice, and opt-out/hidden
page/shutdown/session expiry revoke access and discard late results. See
COORDINATION_SOURCE_WORKSPACE.md for the precise permission, scope and timing
limits. Synthetic browser/HTTP tests are not multivendor hardware acceptance.

No commit/push, CI, version bump, Test upload or publication was undertaken.
Mainline and Live remain unchanged; published Test baseline remains the recorded
v1.10.54 / Build 68. Existing driver capabilities, Flow and Energy declarations
are unchanged. Final local verification: **959/959 tests** (14 new workspace
regressions in addition to the 20 advisory cases below), lint clean, dependency
audit 0 vulnerabilities and diff checks clean. Homey CLI 4.5.3 verified validation
passed after the tests, sequentially. Manifest comparison confirms only the
approved permission and private workspace route changed; package dependencies,
version, drivers, capabilities, Flow and Energy declarations are unchanged.
Desktop/mobile and local HTTP checks use synthetic fixtures, not installed-host
or owner-hardware acceptance. Refreshed remote diagnostic/mainline refs are
unchanged from the starting checkpoint.

## Circuit roles / external-battery advisory — 17 October 2026, LOCAL / UNPUBLISHED

Owner authorised local diagnostic-branch implementation and regression tests.
Mainline/Live remain unchanged. No commit/push/version/publication or hardware
control; the published Test baseline remains v1.10.54 / Build 68 below.

Shared circuit-role semantics now distinguish whole-installation grid exchange,
solar-only branch, hybrid solar+battery exchange and load branch. Existing Dual
CT settings/IDs/labels remain compatible and display-only. No role auto-verifies
telemetry, adopts an Energy source, or infers external-battery SOC/power.

The stateless authenticated `/coordination-preview` adds a v2 caller-input path
for generic external batteries (including Fronius/BYD or Solis), explicit grid
scope/direction and optional secondary circuit. P1-only grid observation remains
supported. Separate battery power/SOC is mandatory; branch/battery power is never
added to grid export to manufacture surplus. External-battery priority, flow
conflicts, individually fresh/coherent readings, source/site/session bindings,
advancing power observations, sustained export, hysteresis and cooldown are
evaluated for advice only. Role/source/policy changes and data gaps reset advice.
Legacy SOC-only callers explicitly remain `surplusAssessed: false`.

All command/Energy/solar-origin flags stay false. Existing driver does not call
the new advisory. Caller assertions/state are not independently trusted command
authority. No device data is fetched, persisted, exported or sent; no Robert
message or new capture request. See STREAM_COORDINATION_PREVIEW.md for schema
and conservative limitations; STREAM_EXTERNAL_BATTERY_ROADMAP.md defines the
visible rehearsal, source-binding, control-contract research, owner-hardware
commissioning and separately approved Flow/parallel Energy sprints.

Final local test/lint/audit checks: **945/945 tests** (20 new regression cases),
lint clean, dependency audit 0 vulnerabilities and diff checks clean. Version,
all driver/capability/Flow/permission manifests and Energy declarations unchanged.
Homey CLI 4.5.3 verified validation passed after the final tests, run sequentially.
No CI run, commit/push, publication, installed-host or physical validation claim.

## Test v1.10.54 / Build 68 — published 17 October 2026

Supersedes the authorised/local checkpoints below. Diagnostic-only source
`89c5729230895ae8c9c1eb4568bee1fcdd03451c`, version/tag
`3c39087355f7f2c5e2cce6ec93c7343f5752fcd1`. Source CI
[39064070729](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39064070729),
version [39064152571](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39064152571),
exact-tag CI [39064226030](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39064226030)
and upload [39064352983](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39064352983)
passed. Local and exact-tag CI: **925 tests**, lint, dependency audit (0
vulnerabilities), Homey CLI 4.5.3 verified validation. Checks ran sequentially.

Build 68 archive readback matched 14 targeted compiled/runtime/locale files,
including the preview's required `driver.compose.json`. Manifest is semantically
identical apart from Homey's author-email privacy filtering. Archive SHA256:
`28e35466df418bce9b96298000d9bd3c27360a1c66b80e4901fb1221cafa1777`.
The archive confirms 34 custom-only preview capabilities, class `other`, no
Energy declaration, runtime activation false and empty grid-contract resolver.

Reopened portal and public listing confirm **Test v1.10.54 / Build 68** at
`2026-10-17T19:57:13.873Z`:
[portal](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/68),
[Test](https://homey.app/en-gb/app/uk.co.zarb.ecoflow/EcoFlow-STREAM-Series/test/).
Live remains **Build 18 / v1.10.3**, timestamp `2026-07-26T22:49:51.597Z`.
Local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote
`master` remains `66b1cb5f828a53333739798281fce86125f61c28`.

Visible phase/circuit improvements are available in Test; grid Energy modules
are preparatory only and remain unwired. Existing devices gain no Dual CT Energy
participation; other driver Energy/Flow/permission definitions stay unchanged.
No certification, manual installed-host update, controls or physical/native
acceptance claim. No new Robert capture/export requested; reply is draft-only.

## Consolidated phase/Grid Energy preparation — 17 October 2026, Test release AUTHORISED

Owner now authorises committing/pushing the diagnostic branch, checking source
and exact-version CI, and publishing one consolidated Test build. This supersedes
the publication holds in the local checkpoints below. Mainline and Live must stay
unchanged; existing devices must NOT gain Energy participation. Robert's updated
reply remains DRAFT ONLY for review, not authorised for sending.

Release includes the visible individual-phase cards, per-circuit candidate sums,
circuit descriptions and guarded upgrade path, plus UNWIRED grid-source,
checkpointed accounting and adoption plumbing. Contract resolver stays empty,
runtime activation stays false, preview has no Energy declaration and no app /
driver imports the preparatory Energy session. No new capture, hardware command,
certification, installed-host update or physical-acceptance claim is authorised.
Fresh source/CI/upload/channel results will be recorded after each gate passes.

## Grid Energy preparation sprints 1–3 — 17 October 2026, LOCAL / UNPUBLISHED

Owner authorised the three preparatory sprints after the circuit-display work
below. Changes stay on `codex/mixed-generation-reporting-diagnostics`. No
commit/push, publication, mainline merge or Energy activation for existing devices.
The last published Test remains v1.10.53 / Build 67, not this local code.

- Strict same-packet CT1 grid adapter, developer-owned firmware/sign/encoding /
  timing contract, source-specific consent and fresh firmware readback. No
  contract registered; runtime switch remains false.
- Persistent serialised power-accounting session, single-key scoped checkpoint,
  readback-before-projection, no downtime fill and explicit recovery after an
  ambiguous write. Strict measurement time and separately gated receipt-timed
  estimates remain distinct; no fabricated timestamps or receipt-only fallback.
- Explicit NEW-device adoption plan and per-grid single-writer authority; fresh
  overlap inventory and external-meter review, no existing-preview conversion,
  source takeover or counter/power mixing. Pending saves retain authority until
  settled, including close/revocation/overload. No app/driver wires this session.
- Proposed Homey cumulative grid configuration/kWh projection only, not applied.
  Preview metadata/accounting and all existing devices stay unchanged by these
  Energy modules. No Homey/physical command, capture or message sent.

Details, technical limits and remaining native/physical activation work:
[DUAL_CT_GRID_ENERGY_PREPARATION.md](DUAL_CT_GRID_ENERGY_PREPARATION.md).
Robert's updated reply remains draft-only. Final local checks passed:
**925/925 tests** (30 new Energy regressions), lint, dependency audit (0
vulnerabilities), diff checks and Homey CLI 4.5.3 verified validation. Tests and
CLI validation ran sequentially. Other nine drivers, Flow declarations,
permissions and version remain unchanged; preview still has no Energy config.
No native Homey storage/upgrade or physical acceptance is claimed. Work remains
uncommitted/unpushed, no new CI run or release performed.

## Circuit-aware phase preview — 17 October 2026, LOCAL / UNPUBLISHED

Owner authorised implementation and regression tests only on
`codex/mixed-generation-reporting-diagnostics`. No commit/push, version bump,
publication, mainline merge, device command or Robert message in this continuation.
The published Test baseline below remains v1.10.53 / Build 67, not this code.

18 native per-phase V/A/W cards and two per-circuit signed phase sums/statuses
are additive to the existing preview IDs. Sums require one decoded payload with
all three power fields, reject conflicting reported totals, clear on partial
power updates and expire independently at 90 seconds. Native values keep raw
numeric precision; technical string groups retain individual wire IDs/ages and
now identify each candidate phase on its own line. User-selected circuit labels
default to unspecified and cannot adopt an Energy source or alter signs/mapping.
Hybrid inverter means solar plus possible battery exchange, not pure generation.
Existing paired previews migrate additively before subscribing; old consent,
identity and lifecycle/privacy fences remain. All Energy/accounting/Flow/control
gates, other drivers and mainline/Live stay unchanged. No further captures asked.

See [DUAL_CT_CIRCUIT_PRESENTATION.md](DUAL_CT_CIRCUIT_PRESENTATION.md) for official
manual/product findings, packet/receipt versus measurement-time limitations,
counter hypotheses, source-overlap gates and outstanding native acceptance.
Final local checks passed: **895/895 tests** (13 new regressions), lint,
dependency audit (0 vulnerabilities), diff checks and Homey CLI 4.5.3 verified
validation. Tests and CLI validation ran sequentially after an initial parallel
run exposed their shared compiled-folder interference; the final run is clean.
Manifest readback confirms all other nine drivers, previous capability definitions,
permissions, app Flow declarations and app version unchanged. Native Homey tile
layout and physical/installed-device behaviour are not established by these tests.

## Test v1.10.53 / Build 67 — published 17 October 2026

Supersedes the preparation/local checkpoints below. CT1/CT2 presentation and raw
counter clarity changes are committed/pushed on the diagnostic branch and now
available on **Test only**. Robert's updated reply remains DRAFT ONLY for owner
review. No new capture/export requests, Community message or device command sent.

- Source `2d4c94315805dec5d06ac27983c99a10a05498c6`;
  CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39055239853 passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39055356626 passed;
  tag `v1.10.53` / `c248eee567e110a755e9cc8367351a17b86b40aa`.
- Exact-tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39055424697 passed:
  **882 tests**, lint, audit (0 vulnerabilities), Homey CLI 4.5.3 verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39055590336 passed,
  producing Build 67 / v1.10.53. Portal showed Draft before publication. Read-back
  archive manifest/drivers match source; compiled formatter/monitor/gates/device,
  EN/DE/NL, consent HTML and settings were SHA256/byte-compared to local output.
- Test publication **2026-10-17T17:53:40.044Z**, verified after reopening Developer
  Tools. Public Test listing independently shows v1.10.53 and exact new changelog:
  https://homey.app/en-gb/app/uk.co.zarb.ecoflow/EcoFlow-STREAM-Series/test/.
- Live remains Build 18 / v1.10.3 at unchanged `2026-07-26T22:49:51.597Z`, checked
  beside the new Test row. Main refs unchanged: local master `8bb4e468` and remote
  master `66b1cb5`. No mainline merge, certification submission or manual install.
  Installed-host and physical acceptance remain unverified, not inferred from CI.

Visible changes: CT1/CT2 phase-group labels, EN/DE/NL decimal formatting, V/W at one
decimal and A at three, with signed tiny nonzero values preserved. Same driver /
capability IDs, no re-pairing path. Counter card warns that units, period and circuit
are unconfirmed; each raw field/trend has its own age since receipt. Partial packets
cannot refresh older counters; expiry stays independent of scalar traffic. Totals
remain raw/unscaled and no sign flip or mixed-age aggregate is introduced.

Official contract, physical phase order, source roles, direction, counter scale /
period and runtime Energy adoption remain unverified/gated. No standard power /
meter capabilities, controls, app Flow cards, tags or Insights added to the preview.
Other driver definitions, permissions, Energy mappings and Flow cards are identical
to v1.10.52 (manifest comparison verified). The question for Robert is a plain
description of his CT circuits, existing Homey grid meter and expected Energy
roles, not another diagnostic bundle. No raw customer data added to Git.

## CT labels and counter clarity — 17 October 2026, release authorised

Owner now authorises consolidating the local CT1/CT2 display work below with a
counter caveat and individual receipt ages, running checks, committing/pushing
the diagnostic branch, checking exact CI and publishing Test only. Mainline,
Live, Energy activation and hardware controls remain unchanged. Robert reply
must remain draft-only for owner review. This supersedes prior publication hold.

Private `.52 assignments` post 8 adds a counter screenshot and tentative circuit
interpretation. Its fields satisfy `1+2+3=7` and `4-6=7`, already hypotheses in the
single-record arithmetic checker. This does not establish CT2 production, Wh/kWh
scale, daily/lifetime period, counter origin or a grid source. No private readings
or screenshots are stored in Git; tests use generated, unrelated values.

Counter card now explicitly warns in EN/DE/NL that units, period and circuit are
unconfirmed. Each raw field and trend shows its own age since receipt. Partial
counter/scalar packets cannot refresh older fields, and exact expiry still removes
their numbers. No inferred totals, converted units, role relabels, packet-coherence
claim, source adoption, new collection or numeric support export is introduced.
Native Homey/hardware acceptance remains pending; verify each release gate before
claiming the consolidated continuation is available to testers.

Local consolidated checks passed: **882/882 tests**, lint, audit (0 vulnerabilities),
diff checks and Homey CLI 4.5.3 verified validation. Display/preview targeted suite:
23/23. Exact source CI, version-tag CI, upload and actual Test channel still need
independent verification; local success is not a publication or hardware claim.

## CT1/CT2 display refinement — 17 October 2026, LOCAL / UNPUBLISHED

Owner authorised presentation improvements and regression tests on the diagnostic
branch only. No commit/push, version bump or new Test publication is authorised.
Mainline, Live and Energy adoption remain unchanged. Robert reply is draft-only.

Reviewed all seven posts/images in private `.52 assignments` (topic 161001).
Community comparisons support A as CT1 and B as CT2 for the displayed voltage,
current and power groups on that installation. These are observed mappings, not
an official model/firmware contract or universal phase/grid/direction verification.
The newer CT2 power screenshot is a second observed operating point, not evidence
that negative always means export. No new JSON/support attachment in these posts.
Private screenshots and actual readings are not added to Git or test fixtures.

- Existing six `dual_ct_preview_fields.*` cards now use CT1/CT2 names (EN/DE/NL),
  with unchanged device/capability IDs; no re-pairing/migration path is introduced.
- Presentation-only formatter: V/W at one decimal, A at three decimals, localized
  decimal separators, field IDs and independent receipt ages retained. Very small
  nonzero values use signed scientific notation rather than becoming apparent
  zero. Raw decoder/cache precision and signs remain unchanged.
- No speculative phase labels or combined totals are created from asynchronous
  fields. Missing/stale stays explicit and exact <90-second expiry is unchanged.
  Totals 515/998 and counter candidates retain raw/unscaled displays without units.
- Pairing, persistent warning and settings hint explain community evidence versus
  verified contract, receipt-only time, uncertain circuit roles/direction/phase
  order, and no Energy/control/Flow/tag/Insights activation. No new data collection.
- Pure contract/decoder, default bank-role assumptions, source selection, standard
  meter/accounting, power/counter trials and numeric-free support schema untouched.

Tester follow-up asks only for a plain description of the CT1/CT2 circuits, existing
Homey grid meter and desired Homey Energy roles. No new captures, screenshots,
exports, rewiring or mode changes are requested. Native Homey display/upgrade and
hardware acceptance remain pending; this local change is not available in Test.

Local checks passed: **880/880 tests** (six new display regressions), lint, audit
(0 vulnerabilities), diff checks and Homey CLI 4.5.3 verified validation. Targeted
display/preview suite: 21/21. EN/DE/NL formatting, all 18 phase fields, zero/tiny
signed values, missing/stale per-field ages, unchanged raw precision, identifiers
and Energy/Flow fences covered. Desktop/mobile consent regression passed and the
mobile screenshot was inspected outside Git. These are synthetic/local checks,
not native Homey display or hardware acceptance. Changes uncommitted/unpushed.

## Test v1.10.52 / Build 66 — published 17 October 2026

Supersedes the local/preparation checkpoints below. The optional raw Dual CT
preview driver, guided export workflow and unwired power-based Energy preparation
are committed/pushed on `codex/mixed-generation-reporting-diagnostics` and now
available on **Test only**. Robert's active capture requests remain paused; no new
Community message has been sent. No automatic device addition or Energy adoption.

- Source `1666605918510144867333a894525690780603f4`;
  CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39025906166 passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39026010717 passed;
  tag `v1.10.52` / `0f76b240913f75e3b761536aaebf42d70c4a5618`.
- Exact-tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39026090521 passed:
  **874 tests**, lint, audit (0 vulnerabilities), Homey CLI 4.5.3 verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/39026183594 passed,
  producing Build 66 / v1.10.52. Developer Tools independently showed Draft before
  publication. Uploaded manifest, compiled preview/monitor/pairing/shared-auth and
  power trial modules, EN/DE/NL, settings, consent screen and product photo were
  read back and SHA256/byte-compared against the tested source/build output.
- Test publication timestamp **2026-10-17T10:48:51.944Z**, verified on reopened
  Developer Tools. Public Test listing independently shows v1.10.52, matching
  changelog and the new Smart Meter Dual CT (read-only preview) with product photo:
  https://homey.app/en-gb/app/uk.co.zarb.ecoflow/EcoFlow-STREAM-Series/test/.
  Build 65 / v1.10.51 is Superseded.
- Live remains **Build 18 / v1.10.3**, unchanged timestamp
  `2026-07-26T22:49:51.597Z`, checked alongside the new Test row after publication.
  Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and origin/master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. No mainline merge,
  certification submission, manual installation or hardware command was performed.
  Installed version and native Homey/hardware acceptance were not checked here.

The preview requires explicit pairing/continuous-monitoring consent and owned
productType 421 admission. It displays unverified raw A/B readings, receipt ages
and counter candidates. No W/V/A/kWh contract, physical CT-port/phase/direction
verification, standard meter/Energy capabilities, app Flow cards, tags, Insights
or controls are enabled for that driver. Existing meter/battery Energy paths are
unchanged. Ordinary support reports include only fixed numeric-free preview
health, not telemetry/account IDs or raw payloads.

Power-based Energy accounting is **prepared and tested, NOT activated**. It is a
pure unwired alternative to the counter trial; native counters are not required
for that future route. Verified grid source/unit/sign/freshness, overlap adoption,
persistence/migration/rollback and physical acceptance still gate runtime wiring.
Use owner hardware for those remaining gates; no more Robert captures requested.

## Consolidated preview and power-path release preparation — 17 October 2026

Owner authorised completing the gated Energy preparation and publishing one
consolidated Test build after checks and CI. This supersedes the unpublished-only
restriction in the local checkpoints below. Mainline and Live remain out of scope;
no installation, certification, hardware commands or new tester capture request.

Adds `dualCtPowerEnergyTrial.ts`, an unwired alternative to native counters:
confirmed normalized grid W only, single scoped source, separate import/export
integration including zero crossings, strict freshness/gap handling, retained
totals on restart but no downtime baseline. Receipt-only/raw bank candidates are
not eligible. Separate readiness gates explicitly state native counters are NOT
required for a future validated power route. Runtime Energy adoption stays closed.
See `DUAL_CT_POWER_ENERGY_PATH.md` for the contract and remaining activation work.

Release includes the local preview driver and guided workflow below. Source,
validation, exact CI, version, upload and actual Test availability must each be
verified before describing this preparation as published.

Local checks passed: **874/874 tests**, lint, audit (0 vulnerabilities), diff
checks and Homey CLI 4.5.3 verified validation. Desktop/mobile pairing and export
workflow regressions are synthetic; native Homey/hardware acceptance remains open.

## Opt-in Dual CT preview driver — 17 October 2026, local only, NOT published

Owner explicitly authorised a separate read-only preview driver on the diagnostic
branch, superseding the older blanket no-Dual-CT-pairing fence for this experimental
display role only. Verified meter contracts, Energy adoption, controls and existing
driver identities remain unchanged. Tester capture requests remain paused while
the owner awaits hardware later in October; this work requests no further evidence.

- New `smartmeter_dual_ct_preview` driver: per-pairing consent to continuous
  monitoring, distinct from two-minute diagnostic collection/sharing consent.
  Owned app productType 421 plus corroborating metadata only; no name/prefix
  guessing, shared devices, generic meter conversion or duplicate preview pairing.
  Account binding is a local digest of EcoFlow session identity/host, never a
  normal report field. Pending/declined/cancelled pairing does not save credentials.
- Latest-value candidate displays: raw bank A/B totals, power/voltage/current field
  hypotheses with receipt ages, 773 unscaled candidates and raw change labels.
  997 stays structure-only. No W/V/A/kWh assignment, CT1/CT2 or Grid/Solar claim,
  phase-order verification, counters integration or automatic source selection.
- Reuses existing listen-only app MQTT. Exact live device topic/header/encoding
  checks, per-field <90-second freshness, precise expiry timer, local age ticker,
  coalesced bounded display work, bounded connection retry, generation guards and
  clearing on stop/account change/restart/deletion. No raw packets or numeric
  readings are written to app stores/logs. Homey itself can retain last capability
  values; pairing explains this and initialization clears those values before use.
- No standard meter/power capabilities, Energy definition, control listeners or
  app Flow cards. Custom displays are get-only, preventTag/preventInsights enabled
  and Insights disabled. Administrator scripts are not a security boundary; the
  persistent warning says not to use candidates for decisions/automation.
- Shared app credentials are retained while ANY battery/preview consumer remains
  (including original physical STREAM monitors using app telemetry for PV3/4),
  including conservative retention for unreadable existing driver/device state.
- Integration report schema 17 adds numeric-free preview health only (status,
  accepted packet count, receipt age). No candidate values, account binding,
  names, serials, credentials or raw payloads are projected.
- Reuses the stored Dual CT contour icon and exact product-photo derivatives.
  Original Smart Meter assets/identity/accounting are untouched.

Local checks: full suite **867/867 pass**, lint, diff checks and Homey CLI 4.5.3
verified validation. Desktop/mobile consent screenshots inspected outside Git;
native Homey pairing/hosting, live hardware roles/scales/direction and physical
acceptance remain pending. New code and the preceding workflow improvements are
UNCOMMITTED/UNPUSHED. No version bump, CI dispatch, upload, Test publication,
certification, installed-device change, mainline change or Live change occurred.

## Guided Dual CT capture/export — 17 October 2026, local only, not published

Supersedes the local qualification checkpoint below. Robert's `.51 Report`
contains three posts: a `dual_ct_compact` metadata report, a description of a
combined export, then understandable confusion about the flags. No attachment
or numeric comparison JSON was present. It confirms numeric and counter opt-ins,
59 accepted MQTT packets, no rejected frames/cleanup failures, consistent bank
arithmetic, and record 773 arithmetic checks. Compact `valuesIncluded: false`
is intentional; the posted text does not establish whether a separate numeric
download succeeded or failed. Do not blame the tester or request another capture.
The prior one-capture instructions were posted and reopened at
https://community.homey.app/t/51-check/160974/2. The new reply is DRAFT ONLY.

Settings now present capture choices before Start, a numeric-specific Start label,
one local completion refresh while this page stays open, a default combined
format without automatic sharing consent, clear export type/filename, and the
primary numeric download before long JSON/raw fields. Compact exports and their
summary live under collapsed technical diagnostics explicitly marked no readings.
EN/DE/NL explain `valuesCaptured` versus `valuesIncluded` and the encoding safeguard.

The one-shot refresh only follows an explicit numeric Start with valid effective
mode, capture ID and bounded age. It is a GET of the local view, not cloud
discovery/polling; no auto retry, capture restart, counter adoption or retention
renewal. Stop, account removal/change, page teardown, errors and superseded/mismatched
captures invalidate it. An active response after the one-shot read asks for manual
refresh rather than looping. Collection/sharing consent, fixed retention, units,
mapping and all pairing/Energy/Flow/control gates remain unchanged.

Regression coverage includes the actual UI→API→app→research→export path on desktop
and mobile with synthetic inventory/transport/clock, the wrong technical export,
explicit numeric consent, combined file contents/name, identity/lifecycle failure
guards and the one-shot bounds. Local full suite: **852/852 pass**, lint and diff
checks pass. Synthetic screenshots inspected outside Git. No native Homey/mobile
host or physical validation claimed. Changes remain uncommitted/unpushed; no new
version, CI, upload or publication. Mainline and Live are unchanged.

## Capture-to-export qualification — 17 October 2026, local only

Robert's private `.51 check` reports v1.10.51, a local refresh, and both export
choices disabled with the numeric-preview-off explanation. He did not recapture,
as requested. This verifies the explanation on his installation, not the export
download or meter field mappings. The `.49?` reply below was subsequently posted
and reopened at https://community.homey.app/t/topic/160970/2; it is no longer draft-only.

Added `test/dualCtCaptureToExport.test.js`: desktop/mobile settings exercise the
production API, app capture lifecycle, research decoder and combined exporter
together with synthetic inventory, transport and clock only. It reproduces a
structure-only capture; Stop before changing modes; both numeric/counter opt-ins
before Start; effective-mode confirmation; automatic completion; local-only
refresh; retained historical export after live expiry; explicit format/sharing
consent; and a downloaded `ecoflow-dual-ct-comparison.json` identical to the reviewed
JSON. It checks bounded/private output, no discovery or recapture from local
refresh, and no API request from download. No Stop is used after the numeric capture, because
manual Stop clears retained evidence. Automatic completion preserves it within
the existing 15-minute window; refresh does not extend retention.

Local checks: **846/846 tests**, lint and diff checks pass. Desktop/mobile synthetic
screenshots inspected outside Git. No runtime changes were needed. This test and
handover are uncommitted/unpushed; no new CI, version, upload or publication was
requested. Mainline and Live remain unchanged. Native Homey/mobile hosting and
physical readings remain separate acceptance gates. A short reply with one
deliberate numeric capture (both opt-ins) and one combined export is draft-only
for owner review; no new customer message sent.

## Test v1.10.51 / Build 65 — published 16 October 2026

Supersedes the preparation/local-only checkpoints below. The four release sprints
and export-availability fixes are now committed/pushed on the diagnostic branch,
uploaded and published to **Test only**. Robert's `.49?` reply is DRAFT ONLY for
owner review; no new customer message was sent.

- Consolidated source: `842eb66931630e868e73a443a67ee1f552fb94f9`;
  CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38956863056 passed.
- Later-refresh expiry edge fix: `8b07f8dd7e86c52537ad1ab1012c554c610107d9`;
  CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38957406110 passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38957619745 passed;
  tag `v1.10.51` / `6a8d93a2050f6d2c2b6cca0b29016a6a183b5b4c`.
- Exact-tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38957741069 passed:
  **845 tests**, lint, full audit (0 vulnerabilities), Homey 4.5.3 verified validation.
  Counts and individual successful steps were read from the actual run/logs.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38958031638 passed,
  producing Build 65 / v1.10.51. Developer Tools showed Draft before publication.
- Test publication and reopened-page readback confirmed at
  **2026-10-16T19:53:51.011Z**. The public Test listing independently displays
  v1.10.51 and the exact new changelog. Build 64 / v1.10.49 is Superseded.
- Build 18 / v1.10.3 remains Live, with unchanged timestamp
  `2026-07-26T22:49:51.597Z`, checked alongside Build 65 after publication.
  Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain untouched. No certification,
  installation, hardware command, physical acceptance or mainline merge occurred.
- Read the uploaded archive without running the app. App ID/version verified;
  SHA256 matches for settings HTML/status/comparison/shared-contract assets,
  EN/DE/NL translations and compiled contract/decoder/preview modules. Verified
  the package contains no active paired Dual CT driver. New shared browser/backend
  profile is present in the package, not merely the checkout. Publication screenshot
  inspected outside Git; no credentials, raw reports or private screenshots added.

Visible changes: both export choices reflect validated retained data and explain
disabled states. Missing samples, numeric capture off, stale/cleared historical
data, missing identity, invalid snapshot, blocked decoding, pending refresh and
request failures are distinct. Later refresh after server-side retention expiry
now says expired; live-only 90-second expiry does not block still-retained history.
Numeric consent stays explicit. No new capture, polling or sharing is automatic.

The v1.10.50 tag was created and validated but NEVER uploaded to Homey: release
review found the later-refresh expiry explanation first. Do not rewrite that tag
or ask testers to install it. The consolidated available version is v1.10.51.
Native Homey hosting/upgrade/rollback and hardware role/sign/unit/counter acceptance
remain open. Dormant adapter, pairing, Energy adoption and controls remain gated.

## Consolidated diagnostic Test preparation — 16 October 2026

Release review addendum: source CI `38956863056` passed and the first patch-version
workflow `38957065913` created v1.10.50 (`68e1818`). It has NOT been uploaded to
Homey. A later-refresh expiry-message edge case was found before upload: the server
removes the historical object entirely at its deadline, so `reason: expired` with
no snapshot must not be described as a generic missing snapshot. A real-backend
regression and desktop/mobile case cover it. Release will use a further patch
version after this fix passes exact CI; never rewrite the v1.10.50 tag.

Owner explicitly approved committing/pushing this diagnostic continuation, checking
CI and publishing one consolidated Test build. Mainline, Live and installed devices
must stay unchanged; Robert's reply is draft-only. This supersedes the earlier
local-only publication restriction below. No new release exists until upload and
Test readback are verified; version/tag workflow follows successful source CI.

Includes all four release-preparation sprints below plus the export availability
fix prompted by Robert's private `.49?` message. Both export choices now follow
validated retained data, rather than leaving the combined-format option available
when numeric sharing is blocked. A dedicated accessible EN/DE/NL status explains
numeric capture off, no accepted samples, missing capture identity/snapshot,
validation failure, blocked decoding, expiry, pending request and transport/lifecycle
failures. It never includes raw exception details or identifiers and never starts
a capture or opts into sharing. Same-capture refresh retains consent only after
validating the returned identity; failure/expiry/account change clears it.

Fresh checks before the addendum: 844 tests pass (21 above released v1.10.49), lint, full dependency
audit (0 vulnerabilities), diff checks and Homey 4.5.3 verified validation. Desktop
and mobile browser cases cover disabled states, valid recovery, slow request,
timeout/late response, exact retention expiry, copy/download and no automatic
capture/transmission. Screenshots inspected outside Git; native Homey hosting and
physical mapping acceptance remain separate. Portal before release: Build 64 /
v1.10.49 Test; Build 18 / v1.10.3 Live, last updated 2026-07-26T22:49:51.597Z.
Source CI, new version/tag CI, upload and Test readback are pending here.

## Four release-preparation sprints — 16 October 2026, LOCAL / UNPUBLISHED

Owner requested implementation, regression tests and local release checks on
`codex/mixed-generation-reporting-diagnostics`. Based on synced `dd97437197e02d5de50ac1240aa83c68bda03d12`.
No commit, push, version bump, CI dispatch, Test upload/publication, certification,
mainline/Live/installed-device change or new customer message in this wave.
The published v1.10.49 / Build 64 checkpoint below remains historical evidence,
not a fresh portal check or a release of these working-tree changes.

1. **Reading contract:** one frozen browser/backend field and bank profile in
   `settings/dual-ct-contract.js`, typed through `lib/dualCtContract.ts`. Exact
   90-second receipt/measurement expiry is stale throughout the relevant paths.
   Unknown measurement timestamps stay null/receipt-only; cached snapshots need
   a genuine measurement timestamp. Invalid clocks clear dormant state. Equal-time
   scalar updates retain the first existing value rather than inventing order.
   Complementary fields in separate packets still cannot form packet coherence.
2. **Pipeline replay:** generated two-meter wire sequences exercise decoding,
   independent fields, raw sign changes and zeros, sparse counter receipts,
   continuity/source/gap boundaries, comparison schema sharing, numeric-free
   reports and the dormant adapter. Stop, account replacement, restart, fixed
   retention and backward-clock cases erase runtime evidence. Synthetic inputs
   only; no customer captures or identifying fixtures.
3. **Disabled adapter:** `lib/dualCtDevicePreview.ts` rehearses independent A/B
   totals and three candidate phases per bank. Account/device/session scope is
   private runtime state, not an anonymous capture index. It preserves raw signs
   and missing/stale/recent-receipt states. It is not imported by app/API/drivers,
   applies no Homey capabilities, creates no paired device, combines no grid
   totals and has no Energy/control/activation path. A/B are NOT physical CT ports.
4. **Upgrade qualification:** public contract fixture pinned to actual Live tag
   v1.10.3 / `74a3f024c21b4179e0f137303414c541f84cb3fe`, not today's master.
   Six existing driver identities, capability/settings/Energy contracts and 36
   Flow card argument/target contracts remain resolvable. Real driver methods in
   mocked Homey lifecycle tests retain synthetic original-meter/STREAM stores,
   identity, settings and totals across upgrade/restart without downtime backfill,
   candidate-counter adoption or concurrent power accounting. Existing 5000 role,
   mixed-generation rollback, source-selection and 72-hour deterministic-soak
   regressions also run. This does NOT qualify a native Homey upgrade or downgrade.

Validation: **840 tests pass (17 added)**, including desktop/mobile browser
settings workflows; lint passes, full dependency audit reports zero vulnerabilities,
diff checks pass and Homey 4.5.3 verified validation passes. Shared browser asset
loads before its projectors; compiled backend resolves the same field definitions.
Desktop/mobile screenshots inspected outside Git. Native Homey hosting and the
future uploaded archive remain separate checks, not implied by local browser/tsc.

Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
`66b1cb5f828a53333739798281fce86125f61c28` remain unchanged; remote diagnostic
still points at `dd97437197e02d5de50ac1240aa83c68bda03d12`. Remote CI has not run
for these uncommitted changes. No new export request to Robert is needed for this
engineering work. Direction/phase/units, counter period/reset/origin, native
upgrade/rollback and original/mixed-hardware acceptance remain release gates.

## Test v1.10.49 / Build 64 — published 16 October 2026

Supersedes the preparation/local-only checkpoints below. Source commit
`f11c690ac42447cda447022ed12c16f205c95af3` is pushed on
`codex/mixed-generation-reporting-diagnostics`; the version/tag commit is
`e3113a741a9287c31bf2c4622486faa530385dd9` (`v1.10.49`).

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38949012595 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38949189198 — passed; diagnostic branch patch only.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38949303098 — passed: 823 tests, lint, audit (0 vulnerabilities), Homey 4.5.3 verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38950559602 — passed; created Build 64 / v1.10.49.
- Official authenticated Homey Apps API confirmed Draft at 18:52:25 UTC, then
  Test-only publication and readback at 18:53:34 UTC on 16 October 2026.
  Build 18 / v1.10.3 remains Live with its original state-change timestamp.
  Developer Tools independently says Build 64 (v1.10.49) is available for testing;
  the public Test listing displays version 1.10.49 and the exact new changelog.
  Publication screenshot was inspected outside Git.
- Read the uploaded archive without executing it: app ID/version verified and
  SHA256 matches for `settings/index.html`, `settings/dual-ct-comparison.js`,
  `settings/dual-ct-status.js`, `settings/reporter-status.js` and the compiled
  `lib/dualCtContinuity.js`. These are the packaged visible/export/freshness changes,
  not merely source files that were absent from the archive.
- Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and origin/master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. No mainline merge,
  certification, Live, installed-device, physical command or customer-message action.

Visible changes: working Grid and Solar/inverter labels, possible battery-discharge
scope, raw-sign-preserving candidate kWh alongside unscaled counters, per-counter
receipt age versus latest packet age, explicit conflicting observations and more
complete schema-2 comparison sharing. All assumptions remain provisional/read-only.
There is no new paired Dual CT driver, Energy adoption, Flow or control change.
997 remains structure-only. Native Homey and physical acceptance remain open.

The owner-approved reply was posted and verified in the private Tests Dual CT
conversation: https://community.homey.app/t/tests-dual-ct/160963/4, signed JZ.
It explains the preview improvements and Test version without requesting another
export/report bundle. Optional normal two-minute preview uses the existing numeric
and counter opt-ins; no rushed/timed capture, reset or mode change. No new message
was sent during the subsequent local-only four-sprint work above.

## Test-only release preparation — 16 October 2026

Owner authorised committing/pushing the evidence-to-preview changes on
`codex/mixed-generation-reporting-diagnostics`, checking exact CI, and publishing
a new Test build, then preparing a short Robert reply for review only. No mainline,
Live, certification, installed-device change or message publication is authorised.
This supersedes the no-release-authority statement in the implementation checkpoint
below; the source scope and provisional/read-only gates remain unchanged.

Fresh pre-commit checks: 823 tests and lint pass; diff checks pass. Source CI,
version/tag CI, upload and Test channel readback are pending at this checkpoint.
Baseline source is `247a7fcb6538e1d5ea7cf2c1a397ce9ca13f93e9`, package v1.10.48.
Use the repository patch-version workflow after source CI passes; confirm its
actual output rather than treating an expected version as already published.

## Local Dual CT evidence-to-preview improvements — 16 October 2026

Diagnostic branch only, based on `247a7fcb6538e1d5ea7cf2c1a397ce9ca13f93e9`.
Owner requested implementation and regression tests, not publication. Mainline,
Live, installed devices and the published Test build are unchanged. No version
bump, commit/push, remote CI dispatch or customer message in this wave.

- Combined comparison sharing uses schema 2 with shared scalar receipt tables
  (age, encoding basis, float representation and packet index) and references
  to identical latest/last-complete checks. The canonical local view and older
  schema-1 imports remain supported. Check arithmetic is revalidated on readback.
  The actual copy/download/manual text uses compact JSON within 7500 characters;
  ordinary reports and scalar-only export schemas are unchanged. Power groups,
  bank checks and counter candidates take priority over secondary voltage/current
  detail. All omissions remain explicit. A one-meter synthetic comparison retains
  all 20 scalars, both bank checks, both nested record structures and six numeric
  counter candidates; two-meter and sparse-receipt pressure have regression tests.
- Missing counter records in scalar packets are now `not_updated`, not a missing
  measurement/reset. Last counter receipt age and latest packet age are separate;
  scalar traffic cannot freshen a counter. Whole-record baselines survive absent
  packets only; actual partial/invalid/equal-time ambiguity, source changes and
  >=90-second counter gaps remain conservative. No merging partial child records,
  inferred resets, persistent baselines, extra capture or background collection.
- Settings comparison cards now show explicitly provisional assumptions: A is
  Grid, B is EcoFlow Solar / inverter circuit, which can include battery discharge.
  Raw signs remain unchanged; bank letters are not physical CT-port identifiers.
  Under the existing separate counter consent, 773 fields 1/2/3/4/6/7 also show
  candidate phase-net/import/export/net values divided by 1000 (Wh-to-kWh
  hypothesis). Raw numbers remain alongside them. Scale, roles, direction, period
  and reset origin are NOT verified; there is no daily-total or lifetime claim.
  A conflicting user observation is visibly flagged, not used to activate a map.
  EN/DE/NL wording and desktop/mobile workflows are covered by regression tests.

No new pairing driver, Homey capabilities, Energy accounting, Flow, control or
original-meter changes. Record 997 remains structure-only. Work from the existing
evidence first; do not ask the tester for repeat compact/full/crash bundles.
The next physical check should validate useful visible behaviour, especially
inverter direction under meaningful output, not repeat decoder discovery.
See [DUAL_CT_RELEASE_GATES.md](DUAL_CT_RELEASE_GATES.md) for current assumptions
and remaining promotion gates.

Local acceptance: 823 tests pass (11 added), lint passes, current dependency audit
reports zero vulnerabilities, diff checks pass and Homey 4.5.3 verified validation
passes. Desktop 1280px / mobile 390px workflows cover provisional labels and
conflicts, candidate energy, sparse receipt ages, schema-2 copy/manual/download
equivalence, expiry and Stop without cloud polling/device writes. Synthetic
screenshots were visually inspected; no horizontal overflow. These are local
browser/automated checks, NOT native Homey, physical or electrical acceptance.
Mainline refs remain local master `8bb4e468e9bcc510c28049ec4e89736ac2733879`
and origin/master `66b1cb5f828a53333739798281fce86125f61c28`; diagnostic HEAD and
origin remain `247a7fcb6538e1d5ea7cf2c1a397ce9ca13f93e9`. Changes are uncommitted,
unpushed and unpublished. No Live/installed app or customer-message action.

## Test v1.10.48 / Build 63 — published 15 October 2026

Diagnostic source `f4338f73715a315ca2d2ba49d5dcda5655424fc2`; exact release/tag
`v1.10.48` is `7542d4b30bc953419a3a8f5cf3b9e8f2c00d2b5d`. Later handover commits
are not the uploaded source. Supersedes the preparation/unpublished checkpoints below.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38815499264 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38815662598 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38815830126 — passed: 812 tests, lint, audit (0 vulnerabilities), Homey 4.5.3 verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38816065220 — passed; created Build 63 / v1.10.48.
- Official authenticated Homey Apps API confirmed Draft at 2026-10-15 22:18:25 UTC,
  then Test-only publication/readback at 22:18:27 UTC: Build 63 / v1.10.48 `test`.
  Build 18 / v1.10.3 remains `live`. Developer Tools independently says Build 63
  (v1.10.48) is available for testing. The public Test listing returned HTTP 200
  and showed the exact v1.10.48 changelog/version; its screenshot was inspected
  outside Git. No certification/Live action.
- Read back the published archive without executing it: app ID/version match,
  all four settings HTML/JS files and four new continuity/counter/readiness/trial
  JS modules are present and SHA256-match the locally validated assets (8 files).
- Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. A read-only installed
  app check found the owner's EcoFlow app enabled on v1.10.3, not this Test;
  no install/update, capture, setting or control action was performed there.
  Native Homey Test-host and physical Dual CT acceptance remain open.

This consolidates the numeric-free bank summary and sprints 1–5 foundations:
neutral Bank A/B comparison cards, optional local user observations, separate
unscaled 773 candidate opt-in, fixed receipt-continuity metadata and one reviewed
7500-character combined JSON with honest omissions. Both numeric consent flags
are immutable during capture; the two-minute capture, 15-minute retention,
freshness/Stop/account/restart/rollback clearing and privacy boundaries remain.
997 stays structure-only. Normal support/compact reports remain numeric-free.
There is no new paired Dual CT driver, verified role/unit/direction/period,
Homey Energy adoption, Flow/control change or counter-accounting migration.
The energy-adoption trial is unwired and always refuses migration/accounting.

Robert's .47 private conversation (160897) was re-read: four posts, including
daylight Grid/Solar screenshots and a question about cumulative versus daily
totals. No newer numeric candidate export was present in that topic. A reply is
DRAFT ONLY for owner review: acknowledge the supplied evidence, explain v1.10.48
and the unresolved counter origin, ask for one convenient daylight comparison
and one optional combined JSON plus corresponding app views, not repeated
compact/full/crash bundles or rushed/midnight captures. No message was posted.

## Test release preparation — 15 October 2026

Owner approved committing/pushing the diagnostic wave, exact-release CI and
Test-only publication, followed by a Robert reply DRAFT for review. No message,
mainline merge, installation, certification or Live action is authorised.

Preparing the local sprints 1–5 foundations below for the next patch version
(expected 1.10.48; confirm the version workflow output). Local acceptance is
812 tests, lint, zero-vulnerability audit and Homey verified validation. Exact
source CI, version/tag CI, upload and Test readback are pending at this checkpoint.
Portal baseline observed 15 October: Test 1.10.47 / Build 62; Live 1.10.3 / Build 18.
Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879`, remote master
`66b1cb5f828a53333739798281fce86125f61c28`; diagnostic origin/HEAD
`effb8deae72f6ece3cef2708aee0c8507cc04235` before this source commit.

Release scope is read-only comparison, separate unscaled-counter opt-in,
numeric-free bank/continuity outcomes, bounded historical sharing and lifecycle
regressions. No new paired Dual CT driver, verified bank-role/unit/direction
contract, Homey Energy adoption, Flow/control path or accounting migration.
997 remains structure-only. Native Homey and physical acceptance remain open.
Supersedes the unpublished-state notes below once the release is verified.

## Unpublished Dual CT sprints 3–5 foundations — 15 October 2026

Diagnostic branch only, based on `effb8deae72f6ece3cef2708aee0c8507cc04235`,
including the preceding uncommitted sprints 1–2. No commit/push, version bump,
CI dispatch, publication, installed-device change or tester message. Mainline
and Live untouched. Full release/driver/Energy activation is NOT complete.

- Capture-local counter continuity under existing explicit counter consent:
  signed increase/decrease/unchanged/missing, invalid records, out-of-order and
  equal-receipt ambiguity, admission-source changes and >=90s gaps. Whole-record
  baselines only; two-meter isolation, no inferred resets or zeros. Same fixed
  two-minute capture / 15-minute retention and Stop/account/restart/rollback
  cleanup, no extra background collection or persistent baseline.
- Comparison UI shows numeric-free continuity statuses and release blockers in
  EN/DE/NL, with daily unavailable and cumulative origin unknown. Optional
  consented comparison sharing retains the 7500-character budget and honest
  continuity/counter-record omission counts. Normal compact/support and scalar
  candidate exports are unchanged. Calendar helper covers local midnight and
  23/25-hour DST days but computes no daily totals.
- Developer-owned readiness remains blocked: no registered verified contract,
  no new paired driver/phase capabilities or Energy contributor. User bank
  observations cannot unlock it. 997 is still structure-only.
- Pure unwired Wh-counter adoption trial tests anchoring existing totals,
  single-source/no-power-fallback, conservative decrease/gap/source/restart
  handling, versioned restore/rollback rejection and monotonic totals. It always
  returns migration/energy false, is not imported by production drivers/app,
  and is not a live Dual CT counter mapping or migration.
- Release fences preserve original-meter identity/pairing/accounting paths.
  Physical/native-client, bank-role/unit/direction/counter-period and real
  upgrade/rollback gates remain open. See
  [DUAL_CT_RELEASE_GATES.md](DUAL_CT_RELEASE_GATES.md) for the acceptance matrix
  and one-session validation plan. Do not ask for repeated exports meanwhile.

Local acceptance: 812 tests pass (20 added after sprints 1–2), lint, audit
(0 vulnerabilities), diff checks and Homey 4.5.3 verified validation pass.
Chromium desktop/mobile workflows cover continuity, explicit unavailable/blocked
states, freshness, sharing/expiry and the 7500-character budget. Synthetic
390px/1280px screenshots were inspected; no horizontal overflow. No native
Homey/physical acceptance claimed. Changes remain local and uncommitted.

## Unpublished Dual CT sprints 1–2 — comparison and counter research, 15 October 2026

Diagnostic branch only, still based on `effb8deae72f6ece3cef2708aee0c8507cc04235`.
Includes the prior uncommitted numeric-free bank-summary wave. No version bump,
commit/push, CI, upload, publication or tester message. Mainline and Live unchanged.

- New local Bank A/B cards group the bounded scalar candidates by phase with
  W/V/A hypothesis headings, genuine zero, missing-not-zero, receipt ages and
  stale indicators. No physical measurement-time or simultaneous-sampling claim.
- Optional fixed Grid/Solar/no-match observations are ephemeral user assertions,
  never global mappings. They clear on capture/account/navigation/expiry changes;
  changing an observation or export mode revokes sharing consent until reviewed.
- One optional `dual_ct_comparison` schema-1 JSON includes the historical scalar
  projection, fixed observations and counter research. The local view retains
  all 2 x 20 allowed scalar fields; sharing reapplies a 7500-character budget,
  per-device evidence and honest omission counts. Distinct comparison filename,
  copy/download/manual-text fallback; no automatic sending. Existing scalar-only
  historical export remains schema 4 and compact remains numeric-free schema 6.
- Counter numbers require BOTH explicit numeric-preview and separate counter
  opt-ins before capture; active capture reuse cannot change either mode. Strict
  owned-model/live-topic/message/header/encoding/scalar-signature gates remain.
- Counter inspector walks exactly one level of 773/997, bounded to 2048 bytes
  and 32 children per parent. Only 773 children 1/2/3/4/6/7, wire 5, can become
  finite unscaled candidates with null units; 5 and deeper/unknown children do not.
  997 stays structure-only: no independent numeric contract was found. No Wh/kWh,
  direction, phase, daily/lifetime or commissioning-origin assumptions.
- Counter checks are hypothetical `4-6=7` and `1+2+3=7` arithmetic within ONE
  complete 773 record, never cached-child completion. Whole records replace
  partials, with independent device isolation/provenance/ages. Existing fixed
  15-minute retention/Stop/account/restart/rollback/timer cleanup also clears
  counter data. Normal reports contain only bounded structure/status metadata.
- Regression exposed and fixed a binary classification edge: protobuf field-1
  newline plus length byte 123 looked like JSON after trimming whitespace. A
  failed JSON parse now falls through only for the protobuf field-1 prefix to
  the existing strict header/encoding path; genuine whitespace JSON still works.

No Energy accounting, driver, capability, pairing, Flow or control changes.
Local acceptance: 792 tests, lint, audit (0 vulnerabilities), diff checks and
Homey 4.5.3 verified validation pass. Eighteen regression tests were added since
the prior 774-test unpublished wave, including real Chromium desktop/mobile
comparison/export workflows. The inspected synthetic mobile view has no
horizontal overflow. Native Homey webviews and hardware acceptance are not claimed.
Regression, desktop/mobile and privacy/export checks are recorded in
[DUAL_CT_COUNTER_AUDIT.md](DUAL_CT_COUNTER_AUDIT.md). Native Homey/physical
mapping, counter units/period and hardware acceptance remain open. No new request
to Robert has been sent; next release/validation remains owner-authorized only.

## Unpublished numeric-free bank outcomes and counter audit — 15 October 2026

Diagnostic branch only, based on `effb8deae72f6ece3cef2708aee0c8507cc04235`.
Local changes only: no commit/push, CI dispatch, version bump, upload, publication
or message sent. Mainline refs unchanged; no Live or installed-device actions.
The last publication remains Test .47 / Build 62, not this implementation.

- `previewDiagnostics.bankCheckSummary` projects only bounded anonymous Bank A/B
  outcomes and receipt ages into support/compact reports. Latest partial/invalid
  and independently aged last-complete consistent/mismatch remain separate.
  At 90 seconds evidence is marked stale; fixed historical retention and all
  existing Stop/account/new-capture/restart/rollback cleanup apply unchanged.
- Backend and browser fixed allowlists strip values, operands, residuals,
  tolerances, payload indices and identities. Older evidence is not reported,
  never inferred successful. Compact schema 6 stays within 7500 characters;
  optional numeric historical export stays schema 4 with separate consent.
- Settings show the numeric-free summary in EN/DE/NL, with receipt ages explicitly
  at last refresh and no Grid/Solar/CT role or unit/direction verification claim.
- Nested 773/997 remain opaque. Counter investigation and the five next sprints
  are in [DUAL_CT_COUNTER_AUDIT.md](DUAL_CT_COUNTER_AUDIT.md). The live official
  STREAM page documents separate historical buckets, not a Dual CT nested-record
  contract. Upstream BK21 lifetime-counter semantics cannot be promoted to 421.
- No Energy accounting, capability, driver, pairing, Flow or control change.
  New tests protect the nested-record boundary as well as summary freshness,
  isolation, privacy, projection compatibility and workflow behaviour.

Local acceptance: 774 tests, lint, audit (0 vulnerabilities), diff checks and
Homey 4.5.3 verified validation pass. Chromium desktop/mobile-sized tests pass;
both synthetic summary screenshots were visually inspected. Native Homey and
physical acceptance remain open. No private customer values/frames in Git.

Robert's .46 approved reply was posted and reopened at 160876/post 3. The .47
topic 160897 has four messages: compact structure, explanation, two daylight
screenshots and a cumulative-kWh question. No new numeric candidate export or
crash/support identifier in those posts. Do not ask for another compact report
to infer numeric bank checks absent from schema 5; do not request repeats now.

## Test v1.10.47 / Build 62 — published 14 October 2026

Diagnostic source `57f962f1b0647f80460607d3f3b3d65d429c6797`; exact release/tag
`v1.10.47` is `29ceba7b3475d9ec6791be550d54d0fcfaeeb9c4`. Later handover commits
are not the uploaded source. Supersedes the unpublished implementation checkpoint below.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38647762422 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38647903265 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38647991635 — passed: 762 tests, lint, audit (0 vulnerabilities), Homey verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38648234169 — passed; created Build 62 / v1.10.47.
- Official authenticated Homey Apps API confirmed Draft at 2026-10-14 22:32:55 UTC,
  then Test-only publication/readback at 22:33:00 UTC: Build 62 / v1.10.47 `test`.
  Build 18 / v1.10.3 remains `live`.
- Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. No certification,
  Live, installation, control or physical-acceptance action. Native Homey webview
  and physical Dual CT acceptance remain open.

Release adds read-only neutral candidate bank labels, capture-local decoded-payload
indices and same-payload signed power-sum diagnostics with independently aged
latest/last-complete evidence. Historical candidate export is schema 4; normal
support/compact remains numeric-free. No CT port/grid/Solar role assignment,
verified units/direction, Energy accounting, driver, pairing, Flow or control changes.

Robert's .46 reply remains a draft for owner review, not sent. It acknowledges
the successful 20-field export and earlier screenshots without claiming a matched
measurement. It explains the Test build and that late-night conditions are not a
useful sunlight-generation comparison; no further captures are requested tonight.
Do not ask him to repeat the exports already supplied.

## Dual CT candidate banks/coherent-payload checks — implementation checkpoint, 14 October 2026

Diagnostic branch only, based on `a2b8c6e99d6da9430f85c73b120c7f0603dfcc2f`.
Robert's .46 private topic 160876 contains a successful schema 3 historical
export with 20/20 fields and no trimming. Candidate phase sums match both totals,
but that export has no payload indices: equal receipt ages do NOT establish
same-payload provenance retrospectively. No customer values/raw packets were
added to fixtures or source. The .45 approved reply was posted and reopened at
160872/post 4; this turn's .46 response remains draft-only.

Implemented locally:

- Neutral Bank A/B hypotheses for the 20 candidate fields. No CT1/CT2, grid,
  solar/load or import/export assignment. Existing secondary `candidateUnit`
  remains null; possible W/V/A and phase ordering are explicit hypotheses only.
- Strict decoding performs separate signed power-sum checks only when a total
  and all three phase candidates occur in ONE decoded pdata. Missing is not zero;
  no cross-bank sum, V*A, absolute-value conversion or cached-field completion.
  Float32 tolerance checks arithmetic only. Mismatches are retained as evidence,
  not used to discard otherwise valid readings or change controls/accounting.
- Every accepted payload observation receives a bounded capture-local index,
  including distinct headers delivered together at the same receipt time.
  Latest payload status and independently aged last-complete evidence remain
  separate per device/bank; partial deltas cannot refresh old complete evidence.
- Consented historical schema 4 export includes fixed hypotheses, provenance,
  bounded same-payload check evidence and honest reading/check trimming counts.
  Historical/not-live/non-simultaneous and all verification gates remain false.
  Support/compact reports stay numeric-free. The existing 90-second per-field
  preview and fixed 15-minute historical retention/Stop/account cleanup remain.

Screenshot comparison: re-opened all three images in .43 topic 160827/post 1.
The grid-style page displays net import/export and phase A/B/C; the Solar page
has separate L1/L2/L3 power/voltage/current. Screenshot clocks show 22:23 and
22:24; the later .46 export is not a matching-time sample. Earlier Solar phase
values are nonzero/signed, unlike some later zero candidates: do not label those
phases unused/disconnected or infer a universal sign rule. This corroborates a
two-view arrangement, not bank-to-port/role/phase/direction verification.
The upstream BK21 parser was rechecked at `1471a74a117d78ce5120e30a9f1826b51e1c23a6`;
it supports original-meter overlap, not a Dual CT second-bank contract.

Local acceptance: 762 automated tests, lint, audit (0 vulnerabilities), diff
checks and Homey 4.5.3 verified validation pass. Chromium desktop/mobile-sized
checks cover the neutral labels, latest-partial/last-complete distinction,
delayed export, age advancement and retention expiry. Native/physical acceptance
remains open. Uncommitted, no new CI/version/upload/publication, no message sent.
Mainline refs and Live remain unchanged; last published Test is .46 / Build 61.

## Test v1.10.46 / Build 61 — published 14 October 2026

Diagnostic source `81e34ace714e6097ab4d7ab27d6b6d15843e47c0`; exact release/tag
`v1.10.46` is `a76cb5d90fc7db159c1b7f40580250b84acc44ba`. Later handover commits
are not the uploaded source. Supersedes the implementation checkpoint below.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38636434166 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38636640942 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38636848877 — passed: 749 tests, lint, audit (0 vulnerabilities), Homey verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38637133817 — passed; created Build 61 / v1.10.46.
- Authenticated official Homey Apps API first confirmed the exact build as Draft.
  Test-only publication succeeded; readback at 2026-10-14 21:04:24 UTC confirms
  Build 61 / v1.10.46 `test`. Build 18 / v1.10.3 remains `live`.
- Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. No certification,
  Live, installation or physical-acceptance action. Native Homey webview and
  physical Dual CT acceptance remain open.

Release scope: live fields expire individually at 90 seconds; separate historical
candidate evidence is retained in memory for a fixed 15 minutes from the first
accepted packet and exported only after separate consent/review. Schema 3 labels
historical/not-live/non-simultaneous and retains ages/provenance, unverified units
and bounded coverage. Stop/new capture/account change/restart/rollback clear
evidence. No Energy accounting, driver, pairing, Flows or control changes.

Robert's private .45 conversation was refreshed: still three posts, including
41/41 candidate acceptance and the disabled export after expiry; no separate
candidate JSON. Updated reply remains draft-only for owner review. It requests
one fresh .46 capture for ONE optional candidate export, not another compact/full
report or timed screenshots. Export before Stop/new capture; those erase evidence.
Expired .45 values cannot be recovered. If unavailable, exact wording suffices;
no repeated attempts. No message sent this release turn.

## Dual CT export/expiry fix — implementation checkpoint, 14 October 2026

Diagnostic branch only, based on `67ca6bab12f34cd30f49cb08738753efc3eadb56`.
Robert's .45 compact report confirms 41/41 accepted numeric candidate payloads;
his following message reports that expiry disabled sharing before export. No
candidate JSON was supplied in those three messages. The approved .44 follow-up
was previously posted and reopened at topic 160837/post 3. This turn's .45 reply
is draft-only; no new tester request was sent.

- Live preview fields still expire individually at 90 seconds, now consistently
  at the exact boundary. A local timer prunes each expired field and re-renders
  remaining fields rather than clearing the whole preview at its oldest age.
- Separate opt-in historical diagnostic retention: latest accepted candidate per
  field, at most two meters/20 fields each, in memory only. A fixed deadline of
  15 minutes from the first accepted packet is not renewed by packets, reads or
  exports. An actual cleanup timer clears numeric memory even without a refresh.
- Automatic completion/sample limit retains this historical evidence; Stop,
  new capture, account change, app restart and clock rollback clear it. Leaving
  settings clears the displayed copy/consent, not the still-bounded server cache.
- Separate consented schema 3 `dual_ct_candidate_snapshot` export explicitly
  states historical/not-live/non-simultaneous, preserves per-field receipt ages,
  encoding provenance and unverified units, and remains capped at 7500 characters
  with honest trimming counts. No raw frames, device/account identities or
  automatic sharing. Normal compact/support reports remain numeric-free.
- Pending/failed/late reads and capture identity changes cannot restore prior
  sharing consent. Historical evidence is never admitted to live readings,
  capabilities, Energy, Flows or controls.

Local acceptance: 749 automated tests, lint, zero-vulnerability audit, diff checks
and Homey 4.5.3 verified validation pass, including Chromium desktop/mobile-sized
workflow tests. Native Homey webviews/physical acceptance remain unverified.
Changes are uncommitted; no new CI, version, upload or publication. Mainline refs
remain unchanged; the last published Test remains .45 / Build 60, not these fixes.

## Test v1.10.45 / Build 60 — published 14 October 2026

Diagnostic source `ce747ee9b176b6f732c750b63ab4de8727c1f3e5`; exact release/tag
`v1.10.45` is `a82055ca1737451dfeb9691500a16e69f07cb5a2`. Later documentation
commits are not the uploaded source. This supersedes the preparation checkpoint
below.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38630258029 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38630527288 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38630688421 — passed: 739 tests, lint, audit (0 vulnerabilities), Homey verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38631012286 — passed; created Build 60 / v1.10.45.
- Official Homey Apps API, using the existing CLI authentication, first confirmed
  Build 60 as Draft. Test-only channel publication succeeded; authenticated
  readback at 2026-10-14 20:20:24 UTC confirms Build 60 / v1.10.45 state `test`.
  Build 18 / v1.10.3 remains `live`. No certification or Live action.
- Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. No installation,
  native Homey webview or physical Dual CT acceptance is claimed.

Release scope: narrowly gated absent-marker unchanged-byte candidate decoding,
per-field encoding provenance, unitless additional scalar candidates, compact
schema 5 structural coverage and separate consented candidate schema 2 export.
These remain unverified candidates, not a supported Dual CT measurement contract.
No driver pairing, Energy source, Flows, controls or energy-accounting changes.
No customer raw telemetry or credentials committed.

Robert's reply is draft-only for owner review. Optional next request: ONE compact
report from .45; only if values appear and he wants to share them, ONE separate
reviewed candidate export. If blocked/rejected/expired, the compact report and
exact preview wording suffice; no repeated capture, full report, crash log or
rushed screenshots requested. No message sent this release turn.

## Dual CT encoding wave — preparation checkpoint, 14 October 2026

Diagnostic branch `codex/mixed-generation-reporting-diagnostics` only. Sprints
1–3 and local/software release checks are complete; physical acceptance remains
pending. Commit/push, exact-release CI and Test-only publication are now approved.
The release is not published at this preparation checkpoint; record the exact
source, CI and channel readback below when verified. Robert's reply remains a
draft for review. Main and Live must remain unchanged.

The .44 evidence isolates the numeric blocker: preview enabled, 68 app packets,
all absent encoding markers, no decoder attempts. Refreshed primary sources
support a narrow unchanged-byte candidate trial, not verified plaintext. The
new model-421/live-254/21 policy preserves marker presence, blocks masked/unknown
encodings and requires two known correctly wired legacy fields for the absent
marker path. No global header defaulting, XOR fallback or cached-packet renewal.
Per-field provenance and omitted-marker attempt/accept metadata remain separate
from units, roles, direction and hardware validation. Critical-header overflow
and payload-length ambiguity are rejected for research only.

Additional 985–993/998 float32 candidates are unitless and unassigned; nested
energy/counters remain untouched. Normal compact schema 5 includes no numeric
values. Separate consented candidate schema 2 retains provenance and honest
size-coverage metadata. Existing consent, per-field freshness and clear-on-Stop/
account-change behaviour remain enforced.

Own-account read-only Developer inventory/original-meter quota checks did not
provide a binary Dual CT envelope; no hardware claim follows. The official
STREAM page and pinned third-party sources were refreshed. Details and remaining
field gates are in SMART_METER_DUAL_CT_PLAN.md.

Local checks: 739 tests, lint, zero-vulnerability audit, diff checks and Homey
4.5.3 verified validation pass, including desktop/mobile-sized Chromium preview/
sharing checks. Mainline refs remain unchanged. No controls, driver pairing,
Flows or energy accounting changed; native/hardware validation stays open.

## Test v1.10.44 / Build 59 — published 13 October 2026

Diagnostic source `a3ff20aa45c84150e0a994d1a7c6b7c1230b2591`; exact release/tag
`v1.10.44` is `7d020a62547869030afda98c9b02525b9f0389b2`. Later handover commits
are not the uploaded source. Supersedes the unpublished follow-up notes below.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38467980503 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38468217057 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38468410290 — passed: 730 tests, lint, audit (0 vulnerabilities), Homey verified validation.
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38468663549 — passed; created Build 59 and uploaded v1.10.44.
- Build 59 was observed Draft with the correct version/changelog, then Publish
  to Test was clicked. Browser control timed out during readback. Recovery used
  the official Homey Apps API via the existing CLI login, without exposing tokens:
  `getBuild` confirms build 59, version 1.10.44, state `test`; build 18 remains
  version 1.10.3, state `live`. No duplicate publication or certification action.
- No new portal screenshot/public store readback is available because browser
  control became unavailable; the authenticated API is the channel proof.
- Local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged. No installation,
  native Homey webview acceptance or physical Dual CT validation this turn.

Release scope: per-route receipt evidence, compact schema 4 preview/encoding
metadata, effective-mode feedback, locked active-capture option, coherent local
summary/preview refresh and capture-correlated explicit candidate-sharing consent.
Normal reports remain structural. Missing encoding remains a numeric blocker;
second-bank units/roles/direction stay unverified. No new Dual CT driver, pairing,
Energy source, Flows or controls. No raw customer telemetry committed.

Robert's .43 Report conversation was refreshed: still two messages, with the
49 app-packet observation and previously reviewed screenshots. Updated reply is
draft-only. Optional next request is ONE compact report from .44; only if numeric
candidates appear and he chooses to share them, one separate candidate export.
If blocked/expired, exact preview wording suffices; no repeated capture, full
report, new crash log or rushed screenshots. Nothing sent to Robert this turn.

## Test v1.10.43 / Build 58 — published 13 October 2026

Unpublished diagnostic follow-up: per-transport receipt counts/ages and legacy
history-backed UI correction; compact schema 4 includes preview consent/reason,
header encoding buckets and decode attempt/accept counts, without numeric values.
Unknown additional scalar IDs are structural evidence only. Encoding review
supports absent flags on other EcoFlow paths but not an established Dual CT live
contract, so explicit plaintext gating remains unchanged. Second-bank roles,
units/signs and energy counters remain unverified. Tests and draft reply are local;
no new commit/push/version/upload, certification or Live change. See
SMART_METER_DUAL_CT_PLAN.md for pinned research and acceptance boundaries.
Two additional unpublished workflow sprints now expose the effective capture
mode and reused-Start mismatch without silently restarting or changing consent.
The option is locked while an active capture is displayed. A dedicated local
GET view refreshes structure and the separate preview together; no numeric values
enter normal reports. Start also opens that preview after its explicit action.
Sharing consent survives a successful refresh only for the same random local
capture ID; new/unknown capture, account removal, Stop, failure and expiry clear
prepared exports. Pending values cannot be copied. Copy/download fallback points
to the candidate JSON itself. No automatic polling, upload or EcoFlow controls.

Local acceptance: 730 tests, lint, diff checks, npm audit (0 vulnerabilities), and
Homey 4.5.3 verified validation pass. Chromium desktop/mobile-sized workflow checks
include receipt messaging, mode lock, same-capture refresh, separate consent,
copy/download fallback and expiry. Native mobile/hardware acceptance remains
open. Changes are uncommitted; remote CI for these changes has NOT run. Fetched
diagnostic HEAD remains `0db15e6cd474a19ef09d55024aae07c76412da97`; its existing
CI passed, which is baseline evidence only. No commit/push/version/publication
was performed. Robert reply is draft-only and asks no new capture at this stage.

Diagnostic implementation `41601e1e3a5521501dbdce4cb8e0f2c2bae81ece`;
exact uploaded release/tag `v1.10.43` is
`d030937aed34973b691e0ccd00efec21a92e77c6`. Later handover commits are not the
uploaded source.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38458787492 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38458982295 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38459130914 — passed (714 tests, lint, audit, Homey verified validation).
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38459375546 — passed.
- Developer Tools Build 58 explicitly published to Test; readback confirms
  v1.10.43 available for testing. Screenshot retained outside Git.
- Public store readback was not verified: browser policy blocked accessing the
  existing failed store tab. No workaround attempted; portal Test state is the
  publication evidence. No installation or native mobile/hardware acceptance.
- No certification submission; Live remains v1.10.3 / Build 18. Local master
  `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged.

Release scope: optional local read-only numeric candidate preview, explicit
plaintext/model gates, per-field expiry, clear unavailable reasons and separate
reviewed/consented candidate JSON. Normal support reports stay structure-only.
No Dual CT driver/pairing, Energy source, Flows, controls or verified units/signs.

Robert's .42 report was reread live: 105 app-MQTT samples, two message groups and
41 retained field/wire entries; no numeric measurement values. Reply is draft
only. Next optional evidence is ONE candidate export from .43, plus an EcoFlow
Dual CT view/channel-role description for comparison. If preview is unavailable,
the exact reason/screenshot suffices instead: no repeated captures, full report
or crash-log request. No need to change operating mode or clamp configuration.

## Dual CT candidate preview — implementation notes (now in Test .43)

Preview-state/shareability follow-up: reason-specific unavailable messages,
separate unchecked candidate-export consent, visible reviewable bounded numeric
JSON with manual Copy/Download/fallback and dedicated filename. Normal reports
stay structure-only. Expiry/navigation/account changes and consent removal clear
the prepared export. EN/DE/NL wording now reflects both opt-ins. Receipt age is
labelled separately from capture-window age. Desktop and mobile-sized Chromium
workflow regression added; native Homey mobile webview and hardware acceptance
remain unverified. No publication, mainline or Live changes.

Audit of v1.10.42 structural fields against official STREAM guidance and pinned
third-party meter implementations supports ten legacy-overlap scalar candidates,
not a verified Dual CT contract. See SMART_METER_DUAL_CT_PLAN.md for field map,
provenance and the intentionally unmapped second-channel/energy fields.

Pure decoder added for explicitly plain 421/app-MQTT/254-21 pdata only, with
strict protobuf/size/duplicate/context/receipt-age checks. Output is unverified
numeric candidates with candidate units, never Energy/capability values. The
decoder is connected only to an explicit opt-in, bounded local research preview.
Default discovery remains structure-only. Numeric candidates are never included
in support exports; capture consent and export exclusion are distinguished.
No automatic measured value export, driver, pairing, commands or accounting changes. No masked-frame
guessing, phase summing, V*A inference, counters or zero substitution.

Mainline/Live unchanged; no commit/push/version bump/Test publication. Test stays
v1.10.42 / Build 57. The mappings are software-tested with synthetic fixtures,
not physically validated. No new tester request made this turn.
Preview requires explicit plaintext marker and app productType 421, shows field
numbers with unverified candidate units and receipt age, and never assigns CT,
phase, import/export or Energy roles. Per-field expiry is 90 seconds; stop/account
change/clock rollback clear private candidates. Missing encoding metadata leaves
the preview unavailable. Tests cover decoder gates, per-field expiry, UI consent,
late callbacks, export exclusion and API separation. No raw customer telemetry
added to Git. Local acceptance: 714 tests pass, including desktop/mobile-sized
Chromium workflow and sharing/privacy regressions; lint, diff checks and Homey
4.5.3 verified-level validation pass. These are software checks, not Dual CT
hardware acceptance. Source work remains uncommitted on the diagnostic branch.

## Test v1.10.42 / Build 57 — published 13 October 2026

Diagnostic source `8029a019f35453487b11ce49887da1766776d0ea`; exact uploaded
release/tag `v1.10.42` is `557a5787671ba42f323a88463a1579dcc3c8cb9e`.
Later documentation-only commits are not the uploaded release source.

- Source CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450103020 — passed.
- Version: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450330827 — passed.
- Exact tag CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450467205 — passed (tests/lint/audit/verified Homey validation).
- Upload: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450707887 — passed.
- Build 57 explicitly published to Test. Developer Tools readback confirms
  v1.10.42 available for testing; screenshot retained privately outside Git.
  Public-store browser readback timed out; do not claim it was verified this turn.
- 696 local tests and lint pass. No real Dual CT mapping, installed-host/mobile
  acceptance, installation or physical validation claimed.
- Mainline/Live untouched: local master `8bb4e468e9bcc510c28049ec4e89736ac2733879`,
  remote master `66b1cb5f828a53333739798281fce86125f61c28` unchanged. Portal Live
  remained v1.10.3 / Build 18 before Test action. No certification submission.

Compact schema 3 preserves representative structure/coverage/provenance, not
measurement values. Next optional evidence: install v1.10.42, Homey app settings
> Dual CT research > Start two-minute discovery and let finish; Refresh local
summary, then Copy compact Dual CT report and send one private report. No full
integration JSON/new screenshots/manual splitting requested. Update restarts the
app, so old in-memory captures cannot be assumed retained. Dual CT pairing,
measurements, Energy, Flows and controls remain disabled. Robert reply is draft-only.

## Dual CT structure-retaining exporter — unpublished diagnostic work

Field feedback from v1.10.41 confirms provisional 421 admission, 58 accepted
samples and recognised structure, but schema 2 dropped all structures at the
size threshold. No retained field numbers/paths or measurement values were
received from that report. Do not interpret its empty arrays as absent telemetry.

### Sprint 1: representative export — implemented locally

Compact schema 3 unions unique fields by JSON device/source and protobuf
device/command. Duplicate packets no longer consume the budget. Optional
inventory candidates are trimmed first to reserve structure space, headers
are admitted across both formats, then fields are allocated round-robin with
scalar JSON leaves ahead of containers. Selected identity and route results
remain. A 7,400-character allocation ceiling reserves flag space within the
7,500-character pretty-JSON limit. No all-or-nothing structural deletion.
Coverage records included/available unique groups and fields; omission flags
now indicate partial coverage. Counts concern sanitised bounded inputs only,
not every packet or unknown field the vendor might send. Stored capture is not
mutated, and refreshing/exporting remains local-only.

### Sprint 2: reception provenance — implemented locally

Protobuf structure explicitly belongs to app MQTT. Export retains up to eight
anonymous recognised-source/format history summaries with relative receipt age
and retained-history sample counts. A listening subscription is not counted as
observed telemetry. Counts are bounded historical observations, not guaranteed
total capture counts or confirmed measurement freshness. No raw values/identities.

### Sprint 3: decoding evidence — gated pending retained structure

Next inspect representative field paths/numbers and transport provenance, match
them against audited vendor/upstream contracts, then build synthetic/redacted
fixtures for genuinely evidenced fields. Establish grid versus solar roles,
per-phase versus total values, units, sign and field-level freshness. The current
58-sample summary does not permit those mappings. No guessed decoder or driver.

### Sprint 4: read-only driver acceptance — later gate

Only after mappings are supported by real evidence, enable dedicated read-only
pairing and compare with EcoFlow. Keep Energy and controls independently gated.
Existing STREAM/5000 production acceptance can progress without full Dual CT.

No commit/push/version bump/Test publication in this implementation turn. Mainline
and Live unchanged; Test remains v1.10.41 / Build 56. Capture lifetime remains
in-memory only; do not promise earlier structure survives an app update/restart.
Local acceptance: 696 tests and lint pass; diff checks pass. Regressions cover
oversized mixed-format coverage, duplicate merging/field unions, privacy, size
limits, deterministic non-mutating export, scalar prioritisation and received
versus subscribed provenance. No new hardware observation or remote CI claimed.

## Test v1.10.41 / Build 56 — published 13 October 2026

Diagnostic source `dbfc1a3bd5df2ed9dcfbad903d0fccf44893f8e2`; exact uploaded
release/tag `v1.10.41` is `349cb7df59cfe002afbb13f07f863884112dedea`.
Later documentation-only commits are not the uploaded source.

- Source CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446293310 — passed.
- Version: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446511526 — passed.
- Exact release CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446697699 — passed (tests, lint, audit, verified Homey validation).
- Upload: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446932148 — passed.
- Build 56 explicitly published to Test; portal readback confirms available for
  testing and public Test listing shows v1.10.41. No certification submission.
- 692 local tests and lint pass. No actual Dual CT capture/decoded measurement,
  installed-host/mobile acceptance or physical validation claimed.
- Mainline/Live untouched. Portal Live still v1.10.3 / Build 18 before Test action.
  Protected local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote
  master `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged.

Provisional productType 421 admission affects opt-in discovery only. Dual CT
driver/pairing/readings/Energy/Flows/controls remain disabled. Optional next
capture: install v1.10.41, Homey app settings > Dual CT research > Start two-minute
discovery, then Refresh local summary and Copy compact Dual CT report. One private
compact report when convenient; no new screenshots/full JSON/manual splitting.
Report even a failure outcome: identification, subscription and structure are
separate gates. Reply to Robert remains draft-only for owner review.

## Selected identity and discovery outcomes — unpublished diagnostic work

Capture now retains up to two anonymous selected-meter records: identity basis,
provisional flag and authorised account-route availability, never serial/name.
The compact report preserves these and transport results ahead of optional
candidate metadata/structure. EN/DE/NL settings distinguish identification,
subscription without recognised structure, unavailable transports, unmapped
responses and recognised structure. No measurement contract is inferred.

### Production acceptance gates (separate from Dual CT completeness)

- Existing devices: update-in-place, retained IDs/Flows/counters, restart and
  account reconnect; no deletion/re-pairing required for a routine update.
- STREAM/5000: compare unit versus installation scope, freshness and charging/
  discharging signs; verify missing/stale telemetry cannot drive wrong decisions.
- Energy: charging/discharging integration, outages/restarts and socket flows;
  no double counting, discontinuity or unexpected cumulative-counter reset.
- Reliability: concurrent normal/research subscriptions, connection recovery,
  expired/cancelled captures and no diagnostic load regression during a soak.
- Settings/report export: actual Homey mobile/web host acceptance and review of
  privacy/size/fallback; passing synthetic DOM tests is not installed-host proof.
- Release: exact source CI, upgrade smoke/soak evidence, clear supported-model
  matrix and known limitations, then separately approved certification/Live.

Dual CT can remain quarantined while otherwise validated app functionality
progresses. Full Dual CT support additionally needs actual telemetry structure,
field units/signs/channel roles (grid versus solar, per phase versus total),
freshness, corroborated model identity, verified decoder fixtures, then dedicated
read-only pairing acceptance. Energy and commands are later gates, not automatic
consequences of identifying productType 421. Do not make repeated/time-limited
tester captures a condition of progress; finish software checks independently.

## ProductType 421 discovery fix — local only, 13 October 2026

Unpublished diagnostic-branch work after Test v1.10.40. Field report plus matching
EcoFlow screenshots corroborate app productType 421 on one Dual CT installation.
Independent upstream/official confirmation is still absent (see Dual CT plan).
Provisional opt-in discovery admits owned app productType 421 with empty/numeric
fallback name, rejects contradictory names and other identifiers, and separates
observed-code counts from explicit-name counts. It does not enable pairing,
readings, Energy, Flows or controls. Mainline/Live unchanged; no publish, version
bump, commit or push in this turn. Reply to tester is draft-only.
Local verification: 691 tests pass, lint and diff checks pass. Regression coverage
includes observed-code versus explicit-name counts, app-owned identity admission,
Developer-only exclusion, contradictory names/shared/invalid identities, wrong
code fields, cached-reply rejection, structure-only live capture and Stop cleanup.
No real Dual CT telemetry or hardware validation occurred in this turn.

## Test v1.10.40 / Build 55 — published 13 October 2026

Diagnostic branch source `ae9c5b70a47b63653af61953353386df17258b55`;
exact release/tag `v1.10.40` is `775958850e9764458c040bc6524746f82d5b0d13`.
Later handover commits are not the uploaded release source.

- Source CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38441836511
- Version workflow passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38442012964
- Exact tag CI passed (tests/lint/audit/Homey verified validation): https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38442809440
- Upload passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38443074136
- Developer Tools Build 55 explicitly published to Test; readback confirms
  available for testing. Public Test store shows v1.10.40 and its changelog.
- Mainline refs unchanged: local master `8bb4e468e9bcc510c28049ec4e89736ac2733879`,
  remote master `66b1cb5f828a53333739798281fce86125f61c28`.
  Portal Live remains v1.10.3 / Build 18. No certification submission or install.
- 688 local tests and lint pass; hardware/mobile-host acceptance remains open.

Optional next evidence: install Test v1.10.40, open app settings in Homey,
Dual CT research, Start two-minute discovery, then Refresh local summary and
Copy compact Dual CT report. Send that small report privately when convenient;
download and displayed-text fallback are available. No full integration report,
manual splitting or repeated screenshots requested. Even no_explicit_model is
useful identification evidence. Do not claim the model or channel mapping is fixed.
Dual CT values, pairing, Energy, Flows and controls are still disabled.
Reply to Robert is draft-only pending owner review.

## Dual CT next-wave sprints — unpublished, 13 October 2026

Sprints 1–2 implemented locally on the diagnostic branch, extending the compact
report work below. Capture retains only allowlisted numeric vendor model/type
codes for up to eight anonymous meter-like candidates per account. App inventory
normalisation preserves those codes; Developer inventory is projected directly.
No custom names, serials, arbitrary metadata strings or measurement values are
exported. Codes and display-name hints do not authorise capture or pairing.
Unsupported string model identifiers remain an evidence gap, not guessed models.

Compact schema 2 includes safe installed app version, inventory evidence,
allowlisted JSON paths/types and bounded protobuf field/wire structure. Pretty
JSON is limited to 7,500 characters by omitting structure, then excess candidate
metadata, with explicit flags when necessary. Copy acknowledgement, failed-copy/download fallback, a distinct
download filename and mobile download-request wording are provided in EN/DE/NL.
Exports remain manual/local; no automatic transmission or new telemetry polling.

Sprint 3 has an honest gated preview in opt-in research settings: grid, solar
and phase readings are explicitly Not available, not zero. There is no verified
Dual CT channel decoder or live field contract yet, so candidate measurements
are not implemented. No selectable driver, Energy, Flows or controls enabled.

Sprint 4 release is held: no commit/push, remote CI, version bump, upload or Test
publication this turn. Mainline and Live remain unchanged. Next step is owner
review, then approved Git/CI/Test release and one convenient compact report from
Robert. Do not request repeated screenshots or promise the model issue is fixed.

Local acceptance: 688 tests pass, lint and diff checks pass. Regressions include
numeric model-code projection, unsafe metadata rejection, structural export
privacy, report size/omission flags, settings copy success/fallback, local-only
refresh, clearing on navigation and the distinct compact download filename.
No hardware, actual mobile download or remote CI acceptance claimed.

## Dual CT identification and compact report — local work, 13 October 2026

Unpublished diagnostic-branch changes. Robert reports `no_explicit_model` with
zero devices/frames while EcoFlow shows house/grid and solar three-phase views.
This proves discovery selected no eligible model, not that telemetry is absent.
No raw inventory/report has been received to establish the rejected metadata.

- Retain exact product-metadata and ownership admission; display-name hints do
  not authorise subscriptions or infer a model/channel mapping.
- Manual discovery now retains anonymous per-account inventory availability,
  bounded row counts, missing metadata, explicit matches and display-name hints.
  No names, serials, account identifiers or raw metadata are exported.
- Settings provide a compact fixed-field Dual CT summary, copy and JSON download
  with visible text fallback; unrelated integration payloads are excluded.
  This is an identification summary, not a substitute for full protocol evidence.
- Main/Live unchanged; no publication, version bump, commit or push requested.
  Real Dual CT mapping still requires evidence; no Energy/control enablement.
- Local verification: 682 tests pass, lint and diff whitespace checks pass.
  Five new regressions cover name-only rejection, ownership/bounds, compact
  export privacy, forged input and clearing inventory after account changes.
  No new hardware validation or remote CI run claimed.

## Test v1.10.39 / Build 54 — Dual CT discovery and reliability, 13 October 2026

Published to Test from the diagnostic branch only. Combined implementation
`b6ab1dd4c37aceb7049012727bb4e0dbc0326255`; exact release/tag `v1.10.39` is
`61cb03f90607f909d6a04a84ecff58f40b7d2629`. A later documentation-only handover
commit is not the uploaded release source.

- [Source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38394491908).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38394773771).
- [Exact release CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38394907919):
  tests, lint, dependency audit and verified Homey validation.
- [Upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38395137964).
- [Build 54](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/54)
  explicitly published to Test; portal readback says available for testing.
  [Public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows v1.10.39
  and the discovery/reliability changelog. No certification submission.
- Protected local master remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote master remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Developer Tools still showed Live v1.10.3 / Build 18. No Mainline/Live action,
  installation, hardware command or Community message was performed.
- Local acceptance: 677 tests, lint and Homey 4.5.3 verified validation pass,
  with synthetic/browser fixtures. Real Dual CT/broker behaviour remains pending.

Optional testing: install the Test update in place; in app settings open Dual CT
research and Start two-minute discovery. Afterwards refresh the local summary
and export one integration report when convenient. No timed screenshots,
deletion/re-pairing, operating-mode change or repeat of earlier live comparisons
is needed for this exploratory capture. Shared account connections may affect
an EcoFlow app session, as disclosed in the settings overview.

This release is **not full Dual CT support**: actual channel values/roles/units
remain unverified; vendor-contract registry and dormant channel foundation are
not connected to live data. No Dual CT pairing, Energy contribution, Flows or
controls are enabled. Next work must be evidence-led rather than guessing a
channel mapping from discovery structure.

## Combined Dual CT diagnostic Test release preparation — 13 October 2026

Owner approved commit/push and a new Test build from the diagnostic branch only.
Source and exact release CI must pass before upload and explicit Publish to Test.
No Mainline merge, certification submission, Live update or hardware action.
Dual CT discovery records anonymous structure only; channel-state foundation
remains dormant and pairing, actual channel readings, Energy and controls remain
disabled. Release verification receipts will be added after portal readback.

## Dual CT sprint 4 reliability — 13 October 2026

Local diagnostic-branch work on top of uncommitted sprint 3; no commit/push,
version bump, Test publication or Mainline/Live action in this implementation.

- App/Developer subscriptions accept a capture cancellation guard and re-check
  it after connection readiness, preventing late stopped captures attaching.
  Replaced connection objects cannot receive stale registrations.
- Pending subscriber counts protect a shared connection while other devices
  are awaiting readiness. Research removes only its own callbacks; normal meter
  and status-only listeners keep the connection alive. An otherwise idle research
  Developer connection is released after pending work settles, stopping its retry
  activity without shutting down an active ordinary-device connection.
- An inventory response arriving beyond the capture window cannot start further
  connections/probes. Probe responses after Stop are discarded before attachment.
- Cleanup exceptions are isolated per listener. Generation guards invalidate all
  capture callbacks first; failures are counted anonymously and shown as a warning
  rather than allowing one failed detachment to prevent all subsequent cleanup.
- Synthetic tests use actual shared MQTT handler registries, including same-SN
  research/ordinary meter coexistence. No hardware/Broker acceptance is inferred.

All 677 tests, lint and Homey 4.5.3 verified validation pass locally. Release gate:
commit/push the combined sprint 3/4 work, inspect exact-source CI, and obtain
explicit Test-release approval before versioning/uploading. Real Dual CT identity,
channel contract and account/broker behaviour still require hardware evidence.
Pairing, channel readings, Energy and controls remain disabled.

## Dual CT sprint 2 Git/CI and sprint 3 tester UX — 13 October 2026

Sprint 2 pushed as `a6da2abc210d5e17652cf4c65705571a397fec17` on the diagnostic
branch. [Exact source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38391670497)
(tests, lint, audit and Homey verified validation). No Test build published.

Sprint 3 is local/uncommitted: plain-language EN/DE/NL capture summary distinguishes
model-not-found, source-unavailable, empty responses, subscribed-without-receipt
and observed structure. It never claims confirmed channel values, units or roles.
Manual summary refresh reads only the existing local support endpoint: no cloud
enumeration, new capture or polling. Late/duplicate callbacks cannot replace newer
action results. A bounded 24-entry anonymous event timeline coalesces repeated
events, stores no payload/identity/values, exports relative ages and clears on
account changes/restart. It is not a full packet trace or measurement history.

The legacy one-minute screenshot/report deadline has been removed from support
guidance in EN/DE/NL. Existing live comparisons are acknowledged; fresh captures
are requested only for a specific issue and can be sent when convenient.
Pairing, actual channel decoder, Energy and controls remain disabled. Mainline,
Live and current Test releases are untouched; no version bump or upload.

Sprint 3 local verification: all 669 tests pass, lint passes and Homey 4.5.3
verified validation passes. Chromium settings checks at 390px confirm readable
summary, no horizontal overflow, one local request per explicit refresh and no
hidden polling; JSON download/message-part integrity remains covered. Synthetic
preview at `/tmp/ecoflow-dualct-local-summary.png` is not a hardware capture.

## Dual CT sprint 1 Git/CI and sprint 2 foundation — 13 October 2026

Sprint 1 committed/pushed as `bad386a7331c41302364aa97b4fed10fee8ac434` on
`codex/mixed-generation-reporting-diagnostics`.
[Exact source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38391007733),
including tests, lint, audit and verified Homey validation. No version bump,
Test upload/publication or Mainline/Live action.

Sprint 2 (now committed/pushed as noted above): `DualCtChannels` prepares independent CT1/CT2
normalized reading state, explicit unknown/grid/solar/load roles and one selected
source per channel. Per-field measurement/receipt ages, zero/signed power,
partial frames, source/role changes and clock rollback are covered by tests.
Grid import/export direction requires an explicit sign convention; channels are
never summed and missing voltage/current are never manufactured from power.

This is deliberately dormant: no vendor field decoder or verified contract is
registered, and it is not connected to the live research recorder, Homey
capabilities, Energy, Flows or controls. Synthetic normalized fixtures establish
software behaviour only. Hardware field units/channel roles remain unverified.

Sprint 2 local verification: all 662 tests, lint and Homey 4.5.3 verified
validation pass; exact-source CI subsequently passed before sprint 3 began.
No upload/publication is authorised. Protected
local/remote master refs remain unchanged; existing Test/Live releases are untouched.

## Unpublished Dual CT research option — 13 October 2026

Sprint 1 follow-up broadens manual discovery to independently authorised app and
Developer inventories, JSON/protobuf app frames, Developer JSON MQTT, and bounded
own/resolved-host quota snapshots. Sources remain separate and values are not
captured or promoted to capabilities. Host probing requires a known STREAM model
in the same Developer inventory; resolution is not a CT-role or membership claim.
Read [the model/API audit](SMART_METER_DUAL_CT_PLAN.md) for pinned upstream findings
and the remaining hardware evidence gate. Sprint 1 commit/push is approved on
13 October, with CI required before proceeding. No publication is authorised;
prior opt-in probe commit `6164d84` already passed CI.

Diagnostic branch only. Commit/push approved on 13 October; CI must pass before
any future release decision. No version bump, Test upload/publication, Mainline
merge or Live change is authorised by this work.

- Settings offer explicit Start/Stop for a two-minute read-only discovery capture.
  One list operation per saved app/Developer account; at most two owned devices with exact Dual CT
  product metadata. No guessed serial prefix, custom-name admission or shared devices.
- Uses shared app/Developer MQTT transports, not second competing sessions.
  Cached app replies cannot count as fresh data; bounded REST snapshots are labelled separately.
  Counts, protobuf command/field/wire and allowlisted JSON path/types only: no values, raw payloads,
  names, serials, credentials or persistence. Shapes/frames/payload sizes are bounded.
- Local support JSON adds `dualCtResearch`; no automatic upload or extra polling.
  Stop, expiry, account change and teardown remove only this capture's callbacks.
  Late inventory/subscription completions cannot resume stopped capture.
- This is an opt-in transport/structure probe, **not** a Dual CT driver or verified
  CT1/CT2 adapter. Product names may be absent and the meter may expose data via its
  host or Developer transport instead; absent/rejected frames remain inconclusive.
  No nested field interpretation, channel mapping, units/sign or native counters are
  inferred. Dedicated pairing, capabilities, Energy and controls remain disabled.
- Next evidence gate: confirm actual discovery identity/transport, then add a
  narrowly allowlisted channel decoder once semantics are established. Existing
  original-meter and battery accounting remain unchanged.

Robert's live comparisons are accepted as display evidence for the conditions he
tested. The one-minute multi-screen/report request has been withdrawn; no repeat
capture is required before this software work can proceed.

Verification after sprint 1: all 654 tests pass, lint passes, and Homey CLI 4.5.3 verified
validation passes. Regression coverage includes explicit metadata admission,
manual-only UI actions, cached/wrong-source/malformed/oversized frames, privacy
projection, frame limits, expiry, clock rollback, account changes/teardown and
late discovery/subscription/callback races. This does not validate real Dual CT
hardware or establish that the meter uses any particular transport. New regressions
cover independent inventory authorisation, Developer-only discovery, off-account
host rejection, bounded own/host reads, JSON wrappers/arrays/privacy, separate
source labels and stopped/restarted account/subscription races.

## Test v1.10.38 / Build 53 — bounded comparison diagnostics, 12 October 2026

Published to Test from `codex/mixed-generation-reporting-diagnostics` only.
Implementation `5ff1c3a86e06ecd3ec73f5ab242e9785db3ee80b`; exact release source
and tag `v1.10.38` are `223e9e24875a7aac0552308f6ee4d19fa944198b`.

- [Source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38316958615).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38317077235).
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38317157501),
  including tests, lint, dependency audit and Homey verified validation.
- [Upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38317307780).
- [Build 53](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/53)
  explicitly published to Test. The portal says available for testing; a refreshed
  [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows v1.10.38
  and its comparison/queue/report-transport changelog.
- Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Live remains v1.10.3 / Build 18. No Mainline merge/push, certification submission,
  Live publication, user installation, or hardware command was performed.
  This subsequent handover-only commit is not the uploaded release source.

- Support schema 16 adds anonymous BMS/peer/grid comparisons with separate
  scopes and receipt ages. Peer minus BMS magnitude is diagnostic only: neither
  common measurement, sign/scale nor conversion loss is certified. Exact serial
  matching remains private; prefix, SOC and naming similarities never match.
- Five-minute session-only histories retain at most 16 samples per fixed power
  field. BMS charge/discharge components remain paired in the same 32/50 frame;
  no rescaling, aggregate substitution, energy-source migration or new controls.
- Original Unit app telemetry now has one running and one merged pending batch,
  rather than an unbounded promise backlog. Partial fields keep their own receipt
  times. Rejected/expired BMS writes cannot renew freshness; teardown discards
  pending work, but cannot cancel an already-running Homey SDK write.
- Monitoring trial diagnostics distinguish applied versus current candidate
  watts and report the last application-start age. Its 15-second local cadence
  and all accounting/control boundaries are unchanged.
- Numbered report messages use ASCII-encoded, fenced parts with capture grouping,
  part counts and a copy-integrity checksum. The JSON download is unchanged.
  `scripts/reassemble-support-report.cjs` reconstructs complete parts locally;
  missing, mixed or damaged parts fail closed. Encoding is not encryption.
- Local validation: 638/638 tests, lint and Homey `verified` validation passed.
  Tests cover slow SDK writes, burst coalescing, retained partial receipt ages,
  stale queued samples, fixed privacy projections, Unicode report reconstruction
  and inconsistent-part rejection. This does not certify physical accuracy.

Latest field review confirmed installed v1.10.37 and the expected idle-versus-
discharging remaining-time display in the supplied screenshots. Some screenshots
and JSON receipts are not simultaneous; DC-pack and peer/grid values must not be
treated as an established scale error. Native mobile file download is not proven
by a pasted report. The separate app-log ID and Homey mobile app version remain
outstanding. No new message is sent here; the user is reviewing a draft first.
Private reports/screenshots/identities are not retained in this repository.
Installed v1.10.38, the native mobile encoded-parts workflow and physical accuracy
remain unverified. The updated draft asks for an in-place update, five minutes of
normal operation, a close-timed combined EcoFlow/AC Keller/Home Battery screenshot
set, schema-16 JSON (or all complete encoded parts), and a matching app-log ID.

## Test v1.10.37 / Build 52 — support export and original Unit readings, 12 October 2026

The diagnostic follow-up described below is now published to Test. Mainline and
Live are unchanged; no certification submission or Live action was performed.

- Implementation `1b335122abb20e16e3c5e10dd61d3ea5364881e7`; final source
  `682a2aba355b917c1ce20cc335f89172ec3d08d6` adds deterministic ordering to the
  real-clock lifecycle regression. Direction is established before its matching
  estimate; the earlier test was timing-sensitive under the new safety rule.
- All 625 tests and lint pass locally. Final source
  [CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308419331).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308587294).
  Tag `v1.10.37` / exact uploaded source is
  `8022af83269ed72b6965a067e7ed17c90ddb9ba7`.
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308734683)
  including tests, lint, dependency audit and verified Homey validation, then
  [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308891943).
- [Build 52](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/52)
  explicitly published to Test. Portal says available for testing, and a refresh
  of the [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  shows v1.10.37 and the new report/BMS/runtime changelog.
- Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Portal Live baseline remains v1.10.3 / Build 18. These refs intentionally
  differ; neither was synced, reset, merged or pushed.
- Installed v1.10.37, native mobile export, matching pack/AC comparisons and
  physical acceptance remain unverified. Draft asks for update-in-place, five
  minutes of normal operation, a matching screenshot/report set, complete JSON
  or all numbered parts, and a separate app-log ID. No message sent this turn.
  This later handover-only commit is not the uploaded release source.

## Test v1.10.36 / Build 51 — original-Unit startup hotfix, 12 October 2026

### Diagnostic follow-up — export, original Unit BMS flow and runtime (released above)

The tester confirmed that v1.10.36 restored both original Units without restart
or re-pairing. Later feedback describes a silent JSON-download failure, available
grid-port watts but blank original battery flow/state, and simultaneous charge
and discharge estimates. Private messages/images are not stored in Git.

- Browser download now delays blob-URL revocation rather than racing the
  download. UI says requested, not successfully saved. A manual, lossless
  8000-character parts fallback works without downloads or clipboard permission;
  it uses the same snapshot, resets on refresh/pagehide, never uploads or polls,
  and includes EN/DE/NL instructions. Native Homey mobile download is not proven.
- Original Units can restore their existing flow/state tiles from a live,
  subscribed-identity BK BMS 32/50 packet containing both field 26 charge watts
  and field 27 discharge watts. DC pack sign is charge minus discharge. No
  aggregate/port fallback, cross-packet pairing, cached get-reply promotion,
  Energy participation, or hardware control is added. Invalid packets fail
  closed; writes use the device queue and independent three-minute freshness.
- Pinned [upstream parser and public masked captures](https://github.com/shuette42/ecoflow-energy-ha/tree/12509ef6f198f57675a98872b08a870fc009943d)
  support this BMS path. Included public masked pdata regressions reproduce
  -843 W discharge, +532 W charge and -2 W idle; other admitted BK layouts and
  the tester's installation still need physical comparison. DC pack power is
  not expected to equal the app's AC-side system/connection power exactly.
- Runtime tiles require fresh same-scope signed battery power; idle, unknown,
  stale and opposite-direction estimates clear. A direction change requires a
  new matching estimate, rather than reviving the old inactive duration. 5939
  is not treated as a magic sentinel. Schema 15 keeps bounded raw minutes and
  fixed suppression reasons plus anonymous original DC pack watts. Combined
  trial time suppression and energy accounting remain unchanged. Known released
  Time to full/empty defaults migrate safely to existing scoped titles.
- Local verification: 625 automated tests passed, including lifecycle/SDK
  failures, malformed/partial/wrong-source BMS, expiry, charging/discharging/
  idle, runtime direction changes, public captures, and browser downloads,
  lossless multipart/manual clipboard fallback, refresh and pagehide.
  Verified Homey validation passed. Lint and final checks recorded in the turn.
- This increment was initially held locally on the diagnostic branch, then
  released as v1.10.37 / Build 52 with the receipts above. Mainline and Live
  remain unchanged. The response to the new feedback is draft only, pending
  user review; private messages, raw reports and screenshots stay out of Git.

After Test v1.10.35, two original STREAM units were reported unavailable with
`Invalid Capability: stream_unit_power_grid`; the combined Home Battery and
5000 monitor remained available. The same exception was reproduced in a
synthetic original-Unit startup test before changing the code. A valid custom
capability can have no driver/instance options entry, and an uncaught synchronous
`getCapabilityOptions` error aborted onReady before polling/subscription setup.
This Homey behavior is also described in [SDK issue 296](https://github.com/athombv/homey-apps-sdk-issues/issues/296).
The Build 50 crash-report inventory was empty when checked; a device init error
does not necessarily produce an app crash report. No private reports/images are
stored here.

- A shared optional title migration boundary now catches synchronous getters,
  synchronous setters and rejected writes for original grid, original runtime
  and 5000 scope labels. Failed/unknown reads are skipped, not replaced by {},
  so existing custom titles/options are not overwritten. Missing capabilities,
  missing SDK methods and teardown are guarded.
- The original Unit driver explicitly declares grid-title options for fresh
  metadata. Existing capability IDs, device identities, Flows, history, signs,
  energy accounting and control behavior remain unchanged. No deletion/re-pair.
- Regressions reproduce the exact exception on synthetic Ultra/AC Pro devices,
  exercise full init with polling/MQTT and runtime updates, and cover 5000 startup
  and metadata failures. The Unit harness now models unreadable custom options
  instead of always returning {}, and gives timers distinct handles.
- All 614 tests, lint and verified Homey validation passed locally.
  Implementation `52149cd6bbde407ddc145dcbc4089e9e4e5e9861` committed/pushed;
  [implementation CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38300678209).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38300839521).
  Tag `v1.10.36` / uploaded source `f01fce67a1840658200827b152b47b81577d0cef`;
  [exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38300943783)
  including dependency audit, then [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38301096223).
- [Build 51](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/51)
  explicitly published to Test. Portal confirms available for testing and the
  [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows 1.10.36.
  No certification/Live action or mainline merge. Protected local `master`
  remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`; remote `master` remains
  `66b1cb5f828a53333739798281fce86125f61c28`. Live baseline v1.10.3 / Build 18.
- Actual restoration on the affected installation requires update-in-place and
  tester confirmation. Prior detailed capture request is secondary to confirming
  both original devices are accessible. The new apology/update reply is draft
  only; no further community/private message was sent in this hotfix turn.

## Test release v1.10.35 / Build 50 — EcoFlow terminology, 12 October 2026

Diagnostic branch only. Original STREAM's default grid tile now reads **Unit
grid connection port**, matching the native EcoFlow app's **Grid connection
port** with an explicit unit scope. EN/DE/NL capability assets and support
explanations are consistent. The translations are ours, not a claim about
EcoFlow's localized app labels. Migration recognizes both the pre-1.10.34
import/export defaults and the released 1.10.34 grid-port defaults, while
preserving custom titles, options, capability IDs and Flow references.

The [official STREAM contract](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
describes `gridConnectionPower` as grid-port active power in W with positive
input and negative feed-in. The native app displays magnitude with Input/Output
arrows. This is a wording change only: no sign conversion, inferred battery
direction, energy accounting or control changes. Whole-house grid-meter and
individual battery-flow capabilities remain separate. Naming regressions cover
both default generations, partial localized custom names, idempotent migration,
packaged/compose agreement and unchanged positive/negative/zero values.
All 610 tests, lint, dependency audit and verified Homey validation passed.
Other suggested naming changes are not part of this increment.

- Implementation `df5d738f502d6559d0ec5c642de32e69b6bf344d` committed/pushed
  on the diagnostic branch; [CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296486924).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296648201).
  Tag `v1.10.35` / uploaded source `f1686752b1ea49259124daabbd8b9e2f914025ae`.
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296783935),
  then [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296947705).
- [Build 50](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/50)
  published explicitly to Test. Portal and [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  verified as v1.10.35 at approximately 19:35 UTC. A browser-control stall was
  recovered before publishing; no duplicate upload or repeated publish occurred.
- Live still v1.10.3 / Build 18; no certification or Live action performed.
  Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
- The approved follow-up was sent privately and reopened for verification,
  updated to v1.10.35 and the final grid label. It asks for one matching capture
  set with screenshots, downloaded integration JSON, separate app-log ID and
  capture time/timezone. Existing evidence is retained; no mode/grouping change.
  Private message content, raw reports, screenshots and identifiers are not in Git.
- Installed version and physical acceptance are still unverified. Later
  handover-only commits are not the uploaded release tag.

## Test release v1.10.34 / Build 49 — original STREAM freshness and support capture, 12 October 2026

The user now authorizes Test publication from the diagnostic branch, including
the earlier unshipped grid/scope/runtime fixes below. Local and remote `master`
already differ and are protected separately; neither is merged/reset/pushed.
Live remains v1.10.3 / Build 18. Test advanced from v1.10.33 / Build 48 to
v1.10.34 / Build 49; portal and public Test listing verified at 18:43 UTC.

Release receipts:

- Implementation commit: `1e0ef6601771f8f0ac57788994b135dca3041771` on
  `codex/mixed-generation-reporting-diagnostics`;
  [implementation CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38291679387).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38291823684).
  Tag `v1.10.34` and uploaded release source:
  `4a3ccdc335df905be8692e94a606709b6bfe0733`.
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38291955747),
  then [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38292136499).
- [Build 49](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/49)
  explicitly published to Test. Portal confirms available for testing;
  [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows 1.10.34.
  No certification submission or Live publication was performed.
- Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Neither was changed. Any later handover-only commit is not the uploaded tag.
- Installed version and physical acceptance are not established by this release.
  Matching hardware captures and restart/recovery/rollback/soak checks remain open.

- Original Home Battery/Unit watt and state tiles have independent three-minute
  receipts and minute expiry. Empty REST, SOC-only and temperature-only updates
  cannot renew old watts; unit-port packets cannot renew house-meter watts.
  Startup clears persisted watts. Actual unchanged receipts and zero are valid;
  SDK failures, delayed/future/out-of-order packets, clock rollback, trial
  suppression and teardown have regressions. Energy accounting stays unchanged.
- EN/DE/NL support settings include a matching-capture checklist: combined
  EcoFlow flow with units expanded, matching Homey pages, the same downloaded
  JSON, and an immediately-created separate Homey app-log ID. Aim for one minute
  and record local time/timezone or a longer gap. No automatic upload, deletion,
  re-pair or mode change is required.
- Anonymous schema 14 adds original applied/received watt freshness and
  `originalLimits`. A bounded BK 254/21 decoder observes four limit/max fields
  from pinned upstream definitions. Cached get replies do not renew limits;
  readings expire in three minutes. Known models and subscribed identity are
  required. Maxima and setpoints stay distinct, scope remains unverified and
  controls disabled. Existing shared app telemetry is used, not another login.
- Fresh read-only API queries at 18:15 UTC covered all six owned batteries:
  two BK61 and four BK31. Each quota/all returned 15 fields; neither all nor
  targeted reads returned the four limit fields. Other routes/models may differ.
  No commands were sent; credentials, raw responses and serials are not stored.

Local checks: 608 tests, TypeScript, lint, dependency audit (zero vulnerabilities),
Homey CLI 4.5.3 verified validation and whitespace checks passed. Matched hardware
captures, restart/recovery/rollback and normal-use soak remain production gates.

## Earlier unshipped follow-up — freshness, scopes and diagnostic continuity, 12 October 2026

Changes confined to `codex/mixed-generation-reporting-diagnostics`, based on
`ab08bf20eb950792ba4afe7ea90c1f53fc2b7ece`. Diagnostic-branch commit/push and
exact-commit CI verification were authorized on 12 October. This earlier increment
was held for Test; the new authorization above included it in the v1.10.34 Test
release. Mainline merge and Live changes remain on hold. The baseline below remains
separate from these unshipped changes. Check the exact branch HEAD in
[GitHub Actions](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/workflows/homey-app-validate.yml)
when continuing; source sync and CI success do not establish hardware acceptance.

- A telemetry receipt is no longer marked successfully applied before the
  Homey capability write completes. Anonymous schema 13 `readingFreshness`
  separates `receivedAgeSec`, the last applied `ageSec` and fixed
  `applicationStatus` (`applied`, `write_failed`, `stale`, `unavailable`).
  Rejected writes do not renew freshness or restore availability. Clearing
  failures remain visible and retry on the watchdog; clearing old values is
  not another telemetry receipt. A fresh successful reading of the failed
  field is required for recovery; unrelated temperature deltas cannot mask it.
- Expired/future/out-of-order queued writes cannot overwrite fresh values or
  manufacture availability. Slow writes retain original receipt age. Expired
  accessory data cannot create tiles. SDK failures are isolated per reading;
  later fields and queued work continue, with teardown guards retained.
- Physical 5000/legacy monitors label battery readings as **Unit** and house/grid
  context as **System**. The signed reported meter and flow-derived import/export
  remain separate sources. Default-title migration preserves custom titles,
  existing options, capability IDs and Flow references; no re-pair is needed.
- Original STREAM `stream_unit_power_grid` is now **Unit grid-port power**,
  sourced unchanged from `gridConnectionPower`. A supplied AC Pro screenshot
  shows positive port watts while sockets are zero and signed battery tiles
  are blank. These measurements are distinct: do not invert port power or
  substitute combined power/state for an unverified individual reading.
  The screenshot is not a matched API capture or proof of a universal sign
  convention. Subsequent read-only app/API checks on original hardware confirm
  the app shows positive port watts with an Output arrow and a distinct signed
  system battery reading. This is not acceptance of mixed-generation unit power.
- Original Home Battery grid now reads only `powGetSysGrid`. Neither unit
  `gridConnectionPower` nor installation AC `sysGridConnectionPower` can replace
  the whole-house meter in a partial packet. Startup clears persisted fallback
  grid values. Unit port watts and their existing sign remain unchanged.
- Original remaining-time capabilities use BMS estimates for physical units
  and CMS estimates for the Home Battery; absent CMS never borrows a pack's
  estimate. EN/DE/NL default titles identify Unit/System while retaining custom
  titles/options/IDs. Estimates are non-negative finite minutes; explicit zero
  and long durations such as 5939 are retained, not guessed to be sentinels.
  Independent three-minute receipts, startup clearing, minute expiry/retry,
  SDK-write failures, delayed/future packets, clock rollback and teardown are
  covered. Widgets reject expired/failed estimates before the watchdog clears
  tiles. Trial/rollback suppression remains intact. Missing system estimates
  intentionally stay unavailable instead of displaying individual runtime.
  Anonymous `remainingTime` diagnostics project fixed source/age/status fields
  only; no raw values, identities, network calls or private captures are added.
- Energy integration, counters, checkpoints, reporter selection, controls and
  grouping remain unchanged. No private reports/screenshots/identities are
  stored in this increment; tests use synthetic and already-masked fixtures.
- The mixed-discharge regression separates idle AC 5000/Ultra observations,
  active original AC Pro peer watts and combined battery power. Raw peer watts
  remain diagnostic-only; they do not enable signed physical flow or accounting.
- Anonymous schema 13 `readingExplanations` and the support UI distinguish
  unverified physical flow, expiry, application failure and missing reports.
  Trial wording explicitly separates combined monitoring from original counters.
- Exact private peer identity can correlate a paired original STREAM monitor to
  an anonymous driver/index reference. SOC and raw-power-versus-port comparisons
  require independent fresh receipts within 30 seconds of each other. Prefix/SOC
  similarity, duplicates and stale peers never establish a match. No public
  serial, automatic grouping, verified measurement equivalence or control
  authority is created; optional getter failures remain isolated.
- Session-only counter continuity records missing/invalid/stale/baseline,
  unchanged, advances and reset evidence. A five-minute unchanged counter plus
  current matching-direction watts is only a possible stall, not proof of a
  faulty counter or sustained discharge. Missing fields do not renew receipts;
  gaps, invalid recovery, rollback and teardown prevent false continuity.
  Counter sources and cumulative totals are unchanged.
- A read-only native-app/Developer API/Homey comparison on the owner's original
  STREAM installation found close combined power/SOC agreement, duplicated
  parallel port flows and an advancing Homey discharge counter. Individual
  remaining-time estimates are not proof of combined runtime. App-only grid
  output/AC charging limits remain investigation candidates, not guessed writes.
  See the 12 October section of `STREAM_REPORTING_API_AUDIT_2026_10_09.md`.

Local checks: all 596 tests passed, TypeScript, lint, Homey CLI 4.5.3 `verified`
validation and whitespace checks passed. These local checks do not establish
real-hardware acceptance; GitHub CI is a separate exact-commit gate.
Next release gates remain matched combined/individual discharge evidence,
restart/recovery/rollback checks and a normal-use soak, not a capability-label
change alone. Test is now explicitly authorized above; Live is not.

## Latest Test release — v1.10.33 / Build 48, 12 October 2026

Working only on `codex/mixed-generation-reporting-diagnostics`, based on the
latest mixed-generation feedback and review of manually submitted reports.
Committed and pushed to the diagnostic branch, then released to Test with
support schema 12. Mainline and Live remain unchanged; the Robert reply is a
review-only draft, not posted.

- Implementation: `f4d90a5edf65a093b19461262acd05ade5d7c2da`;
  release/tag: `adda09b60af2db6cd66aa081c15c628ba5284eb7` / `v1.10.33`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38257541669),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38257723239),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38257851008)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38258048377)
  succeeded. Exact-release CI passed 554 tests, lint, zero-vulnerability audit
  and Homey CLI 4.5.3 validation at `verified` level.
- [Build 48](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/48)
  was published using Publish to Test; the portal confirmed available for
  testing and the [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  showed v1.10.33. The refreshed Live store remains v1.10.3. Remote `master`
  remains `66b1cb5f828a53333739798281fce86125f61c28`. No mainline merge,
  certification submission, hub installation, Community post or hardware
  acceptance occurred. Publication was explicitly authorized for Test only.

- Fresh, fully applied combined SOC/power/state remain available while newer
  donor values await the next local tick. Their own conservative three-minute
  expiry cannot be renewed by later packets. Removal, changed identity, stale
  evidence, clock rollback and capability-write failures still fail closed.
  Core Flow conditions and widgets retain exact-current-value checks; a
  superseded snapshot cannot fire a crossing. `updatePending` is separately
  reported rather than misclassifying every value change as a connection loss.
- Individual watts/PV/socket/state have a three-minute freshness limit,
  independent of the configurable connection timeout. Temperature-only deltas
  cannot renew old watts. Expiry clears values on the existing minute watchdog;
  diagnostics mark them stale immediately. SOC/temperature/health retain their
  existing timeout. Accounting algorithms, checkpoints and sources are unchanged.
- Linked physical monitors explain intentionally unavailable signed power and
  direction with a localized warning. System watts are not substituted for unit
  watts. Support schema 12 adds fixed anonymous `physicalPower` explanations and
  `ownUnit` SOC/raw-power observations, independent of system and peer records.
  Raw sign/scale and pack scope remain unverified; no new Energy input or control.
- EN/DE/NL support guidance separates the JSON file from Homey's app-log ID and
  warns that pasted report messages may be truncated. A screenshot-first route
  is offered; technical JSON is collapsed by default. No automatic network
  refresh, upload or support message is introduced.
- Local validation: 554 tests passed, including a serial-keyed self-record
  lifecycle replay, write-race/removal/expiry/clock regressions, independent
  reading expiry, safe diagnostic projection and browser settings checks.
  TypeScript, lint, `git diff --check`, dependency audit (zero vulnerabilities)
  and Homey CLI 4.5.3 validation at `verified` level also passed locally.
  Implementation and exact-release GitHub CI also passed; no hardware soak occurred.

The latest evidence supports combined charging monitoring but the screenshots
and JSON were captured at different times. Combined discharge while original
units contribute, cumulative-counter scope and physical control migration are
not accepted. Preserve all supplied evidence; request only a matching EcoFlow
combined/individual breakdown and refreshed JSON during natural original-unit
discharge. New app-log IDs are needed for reproduced problems, not every snapshot.
See the updated [trial plan](MONITORING_REPORTER_TRIAL.md) for late-October hardware
acceptance. Private reports, serials, contact details and screenshots remain out
of Git; tests use synthetic or already-masked public fixtures.

## Previous Test release — v1.10.32 / Build 47, 11 October 2026

Implemented on `codex/mixed-generation-reporting-diagnostics` while waiting for
the time-matched evidence requested in [Community reply 67](https://community.homey.app/t/157399/67).
Published to Test with support schema 11. Mainline and Live remain unchanged.

- Implementation: `912cf6810fb00477ce7cdcc61e8e4312fd71ff79`;
  release/tag: `13fef587ee6a45860ebc44e89909540ee383bdf6` / `v1.10.32`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181513564),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181645010),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181714544)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181838179)
  succeeded. Exact-release CI passed 543 tests, lint, dependency audit (zero
  vulnerabilities) and verified Homey validation.
- [Build 47](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/47)
  confirmed available for testing; the refreshed [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  showed v1.10.32. The refreshed Live store remains v1.10.3. Remote `master`
  remains `66b1cb5f828a53333739798281fce86125f61c28`. No mainline merge,
  certification submission, hub installation, Community post or hardware
  acceptance occurred. Publication was explicitly authorized for Test only.

- Settings report requests have a 15-second local-report deadline and a
  180-second explicit reporter-check deadline (up to eight sequential bounded
  checks). A timeout permits manual retry, clears copy/download, and rejects
  late/duplicate callbacks. There is no automatic retry or server cancellation
  claim. Page teardown cancels UI timers and invalidates pending callbacks.
- EN/DE/NL capture metadata shows app version, UTC capture time and elapsed age.
  A ten-second local UI ticker does not fetch telemetry or change the saved JSON.
  Readiness, receipt ages and stale flags remain explicitly capture-time values.
  Invalid/future capture timestamps show an unknown/clock-mismatch warning.
- Peer and system/flow caches reject future receipts and discard future cached
  observations after a backwards wall-clock jump. New partial packets cannot
  revive old power or PV fields. Delayed packets on an unchanged clock remain
  out-of-order packets, not a reset. This does not affect energy accounting.
- Anonymous session summaries retain active/unavailable/unobserved durations,
  longest observed unavailable/stale-or-disconnected intervals, state transitions,
  discarded-event counts and clock-reset counts even after the 32-event tail
  rolls over. Repeated identical checks renew observation without adding events.
  Healthy time is bounded by the three-minute freshness window; unchecked gaps
  are not counted as healthy. Backwards clock jumps start a new measurement epoch.
  These are observed software states, not packet-level gap measurements or proof
  of hardware/controller/whole-installation acceptance.
- A deterministic 72-hour mixed-generation simulation exercises 4,320 steps,
  outages/recovery, partial/delayed packets, identity changes, six restarts and
  rollback. Original counters/address stay unchanged; controls remain blocked.
  Another test checks timer/subscription cleanup over 100 physical-monitor
  sessions. Existing duplicate/overlap and write-failure regressions remain.
- Local validation: 543/543 tests, lint, TypeScript, `git diff --check` and
  Homey CLI 4.5.3 validation at `verified` level passed. The mobile capture-age
  display and unchanged JSON download/no hidden API polling were checked in
  Playwright. Implementation and exact-release CI also passed; no new hardware
  soak has been run.

Next: review Robert's original v1.10.31 JSON, EcoFlow combined/individual
screenshots and separate app diagnostic ID together before changing combined
capacity/grouping, energy-counter sources or 5000 controls. Preserve any existing
v1.10.31 capture and its timestamps; identify the installed version for subsequent
captures. v1.10.32 adds diagnostic reliability, not a combined-system repair or
new battery controls. Keep release and hardware acceptance claims separate.

## Previous Test release — v1.10.31 / Build 46, 11 October 2026

Released from `codex/mixed-generation-reporting-diagnostics`, following the
[pasted report in reply 65](https://community.homey.app/t/157399/65) and
[Homey overview screenshot in reply 66](https://community.homey.app/t/157399/66).
The screenshot is not an EcoFlow combined-system screen; individual tile SOCs
do not prove combined capacity, membership or controller ownership. No raw
reports, device identities, contact details or screenshots are stored in Git.

- Implementation: `84c5f393cd4cf9531bdd5a4b256592c6d12413eb`;
  release/tag: `30c0f975d93b25ec540f340f219f5100b485285a` / `v1.10.31`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38177795236),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38177904291),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38177957863)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38178064178)
  succeeded. Exact-release CI passed 533 tests, lint, dependency audit (zero
  vulnerabilities) and verified Homey validation.
- [Build 46](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/46)
  confirmed available for testing; the refreshed [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  showed v1.10.31. Live was rechecked and remains v1.10.3. Remote `master` remains
  `66b1cb5f828a53333739798281fce86125f61c28`; no mainline merge, certification
  submission, hub installation, Community post or hardware acceptance occurred.

- Support schema 10 adds bounded, anonymous peer SOC/raw-power/PV values with
  independent receipt ages and three-minute stale flags. Partial records do not
  refresh absent fields; invalid/future data, foreign sources and out-of-order
  overwrites cannot appear as fresh readings. Session reset clears the cache.
- Peer power remains raw protocol data with unverified sign/scale and entity
  scope. It is diagnostic-only: no power summation, SOC averaging, capacity
  inference, capability remapping or accounting input.
- Grid-meter and flow-derived grid power now have separate fixed source labels
  and a receipt-aligned diagnostic comparison in EN/DE/NL settings. A difference
  is not labelled battery loss or a verified common measurement boundary.
- Readiness explicitly labels eligibility as activation-only. An active trial
  is not failed merely because it is no longer eligible for activation.
- A synthetic mixed-generation regression joins two original peers, original
  zero readings, selected reporter SOC/power and disagreeing grid sources;
  restart clears cached donor values until fresh evidence returns. Counter
  continuity and blocked controls remain asserted.
- Local tests: 533/533 passed; TypeScript build, lint, whitespace checks and
  Homey validation at `verified` level passed. Mobile settings layout and JSON
  download were checked. Physical acceptance remains pending.
- The capture request was subsequently approved, posted and reopened for
  verification as [Community reply 67](https://community.homey.app/t/157399/67).
  Await one time-matched EcoFlow combined/individual battery capture, Homey Home
  Battery detail, refreshed schema-10 JSON and a separate app diagnostic ID from
  v1.10.31. Preserve any original capture; v1.10.32 now exports schema 11 and
  subsequent captures must identify the installed app version.

## Previous Test release — v1.10.30 / Build 45, 11 October 2026

Published to Test from `codex/mixed-generation-reporting-diagnostics`, following
Robert's close-time follow-up capture in reply 59. The portal confirmed "Your app
is currently available for testing" and the refreshed Test store showed v1.10.30.
Mainline `master` and Live remain unchanged (v1.10.3 / Build 18). No certification,
hub installation or hardware acceptance was performed. This is a default-off
monitoring trial, not an automatic migration or a validated whole-system repair.

- Implementation commit: `63a7304a1c7c9bbe2b03ef394f4559e6de303b21`;
  exact release/tag: `16a006728ac2d6af8d66b1ec622a427455f7802b` / `v1.10.30`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159264875),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159378948),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159459071)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159612115)
  succeeded. CI passed 529 tests, lint, dependency audit and verified Homey validation.
- [Build 45](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/45)
  is published to [Test](https://homey.app/a/uk.co.zarb.ecoflow/test/).

- Default-off per-original-Home-Battery opt-in reuses an exact, fresh, paired
  ES21/ES22 reporter for system SOC, derived battery watts and charging state.
  Existing device ID/Flows stay; no re-pairing or extra Energy aggregate.
- Original charged/discharged accounting and history sources are unchanged and
  not promoted to verified combined-system totals. Old installation flow tiles
  clear during the trial; battery controls are blocked, not migrated.
- Fail-closed freshness, duplicate/overlap checks, restart, persisted rollback
  wait, capability-write failure and in-flight operation safeguards are tested.
  Widgets remain local-only; old control floors do not create combined runtime
  estimates. Missing solar is not treated as zero by below-threshold conditions.
- Reliability hardening rechecks trial receipts and applied values when Flow
  conditions execute; unavailable/suppressed conditions throw even if inverted.
  Local expiry clearing continues while network lookup is pending. Identity
  checks have a 20-second overall abort deadline and REST attempts a 15-second
  wall-clock deadline. Cancelled requests and HTTP 429 are not retried.
- Private binding/rollback state uses one versioned record; setting/record
  mismatches and corrupt records fail safely on restart. Setting changes are
  bounded/serialized and cancelled across teardown; rollback completion stays
  unavailable until persistence succeeds. Failure-injection tests cover these
  paths, delayed packets and timer cleanup without hardware commands.
- Schema 9 adds anonymous trial state and independent raw-flow/grid comparison
  diagnostics; existing formulas and accounting are unchanged.
- Readiness panel explains fixed blockers and safe next steps, with local JSON
  download separate from Homey's app-log ID. Refresh/check requests cannot
  overlap. Widgets distinguish selected system readings from original-source
  history and suppress old control advice during trial/rollback.
- Session-only anonymous timeline is bounded to 32 events. Local refreshes
  coalesce during slow Homey writes; post-write freshness is checked before
  availability or threshold triggers can recover. Widget freshness is captured
  once per response. No additional widget polling or subscriptions.
- Local checks: 529 tests passed; TypeScript, lint, whitespace checks and Homey
  CLI 4.5.3 verified validation passed. Exact-commit CI also passed as linked above.
- See [implementation and tester acceptance steps](MONITORING_REPORTER_TRIAL.md).
  Real combined coverage, charging/daytime/original-unit-active captures,
  counter scope, a normal-operation hardware soak and 5000 command acceptance
  remain external gates.

## Previous Test release — v1.10.29 / Build 44, 10 October 2026

Published to Test from `codex/mixed-generation-reporting-diagnostics` and
verified in the portal and refreshed store listing. Mainline `master` is unchanged;
Live remains v1.10.3 / Build 18. No certification submission, hub installation or
physical acceptance was performed. See [the comparison and acceptance plan](REPORTER_SHADOW_VALIDATION.md).

- Exact source/tag: `82fedeaad159896ee1b87025f38e226b0ce9105b` / `v1.10.29`;
  implementation commit `c50ca99f81fb10bb045116ef7a467431b585699f`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38077544151),
  [exact-release validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38077593274)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38077674719)
  succeeded. CI passed tests, lint, dependency audit and verified Homey validation.
- [Build 44](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/44)
  confirmed "Your app is currently available for testing";
  [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/) showed v1.10.29.

- Support schema 8 adds a UTC `capturedAt` and anonymous `reporterShadow`
  comparisons. Exact main-serial resolution and fresh peer correlation must agree;
  model-family similarity alone cannot select a reporter. Duplicate paired
  representations remain ambiguous instead of silently choosing one.
- Resolved identity is session-only and private. Teardown/reinitialization and
  failed lookups invalidate it; late lookup completions cannot restore it.
- Original aggregate observations and candidate system SOC/power are compared
  per field, with freshness and receipt skew. SOC is a reported system field;
  battery power is derived from app-protocol flow data. Neither is promoted to
  verified installation-wide evidence by the comparison.
- No accounting, history, device identity, Flow, control target, grouping or
  pairing changes. No extra subscriptions, polling timers or automatic lookups.
- Local build, lint, Homey verified validation and all 474 tests passed.
  Mixed-generation captures and hardware acceptance remain required; this release
  does not repair the aggregate source or change Homey Energy accounting.

## Previous Test release — v1.10.28 / Build 43, 10 October 2026

Both STREAM 5000 Series Unit and STREAM Home Battery (5000) store cards now
show the supplied actual AC 5000 product photo on white, visually verified on
the refreshed Test listing. The shared wireframe SVG icons remain byte-for-byte
unchanged. Photo preparation and wireframe raster preparation now target separate
directories to prevent accidental replacement of store photos.

- Source/tag: `18b0b54fe2c001e247b9c4fdc0e18cb20f85041f` / `v1.10.28`;
  photo fix commit `8ed98d0` on `codex/mixed-generation-reporting-diagnostics`.
- All 459 local tests, lint and verified Homey validation passed.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064896023),
  [exact-release validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064956742)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38065084696)
  succeeded for this release.
- [Build 43](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/43)
  is published to Test; portal confirmed "Your app is currently available for
  testing." Store version and both photos were verified after refreshing.
- No pairing, runtime, Energy accounting or control changes. No re-pairing is
  required. Mainline `master` and Live are unchanged; no certification, hub
  install or physical acceptance was performed. Existing hardware acceptance
  gates below remain open.

## Previous Test release — v1.10.27 / Build 42, 10 October 2026

Owner approved lifting the publication hold for this diagnostic release. Build
42 is published to Test and verified in the developer portal: "Your app is
currently available for testing." [Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Source remains on `codex/mixed-generation-reporting-diagnostics`; mainline
`master` was not merged or changed. Live remains v1.10.3 / Build 18, verified
in the portal before publishing. No certification, hub install or physical
acceptance was performed.

- Exact source/tag: `85d8fb7ecf823548f8281c2379dbff2b47f0a931` / `v1.10.27`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38063812285),
  [exact-release validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064181883)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064286184)
  succeeded. CI passed tests, lint, dependency audit and verified Homey validation.
- [Build 42](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/42)
  includes Sprint 3 source/freshness guidance, original-meter direct MQTT and
  host fallback, reporter/counter diagnostics, and the prior AC 5000 artwork/name
  changes. No re-pairing is required. Energy accounting and control safeguards
  remain unchanged; native counter migration and Dual CT admission stay disabled.
- Next acceptance: installed meter source/freshness checks, Robert's integration
  report plus separate app-log ID, original-meter midnight/export/restart evidence,
  and authorised Dual CT channel discovery. Software checks do not establish
  installation-wide reporting, CT roles or physical control behaviour.

## Diagnostic meter Sprint 3 — 10 October 2026 (publication hold)

The diagnostic branch `codex/mixed-generation-reporting-diagnostics` now includes
the original-meter direct MQTT/fallback implementation, counter evidence checks
and meter UX follow-up. App settings show anonymous direct/fallback/missing/stale
grid summaries with receipt ages and EN/DE/NL guidance. Energy accounting remains
integrated power; native counter migration, topology repair and Dual CT admission
remain disabled. Existing device IDs and pairings are preserved.

All 456 tests, lint and local verified-level Homey validation passed; Chromium
mobile-width summary rendering was checked. No installed hardware acceptance is
claimed. See [meter roadmap and evidence gates](SMART_METER_DUAL_CT_PLAN.md).

At this implementation checkpoint, publishing to Test was explicitly on hold;
the owner subsequently approved Build 42 above. The earlier uploaded Build 41 contains
the artwork/name release only, not these subsequent meter/reporting changes.
To test the new diagnostic code through the store, first approve a new versioned
release from this branch, validate that exact release commit, upload a new build
and then publish it to Test. Do not publish Build 41 expecting it to contain Sprint
3. Last verified store status below is historical, not rechecked by this Git sync.
Mainline `master`, release version and store channels remain unchanged.

## Artwork and display-name update — 10 October 2026

Owner requested photo-derived AC 5000 wireframe artwork and removal of Beta
from the two active driver names. Shared icon SVG and 75/500/1000px transparent
store images now derive from the supplied photo through one contour-art source.
Names are STREAM 5000 Series Unit and STREAM Home Battery (5000), with DE/NL
equivalents and matching current UI/readme references. Driver IDs, saved device
names, pairing opt-in, API warnings, read-only gates and Energy roles are unchanged.
No re-pairing is required. See [artwork provenance](STREAM_5000_ARTWORK.md).
Local 419 tests, lint and verified-level Homey validation passed. Release status
is v1.10.26 / uploaded Build 41, NOT verified as published to Test. The developer
portal first returned Failed to fetch, then the browser connection timed out
twice before the Publish to Test action could be taken. Last verified Test remains
v1.10.25 / Build 40; Live remains v1.10.3 / Build 18. This earlier release plan is
superseded by the diagnostic publication hold above; Build 41 does not contain
the subsequent meter sprints.

- Source/tag: `93fc6e951d47a33025dbbc8588cf2b9458b42d2a` / `v1.10.26`.
- [Version](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38051359738),
  [exact-version validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38051419457)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38051500730)
  succeeded. Upload log confirms `uk.co.zarb.ecoflow@1.10.26 successfully uploaded`
  and gives [Build 41](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/41).
  No certification, Live publication, hub install or physical acceptance.

## Current handover — 9 October 2026

### Latest Test release — v1.10.25 / build 40

Published to Test and verified in the developer portal on 9 October 2026:
“Your app is currently available for testing.”
[Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Production remains v1.10.3/build 18; no certification submission or hub install
was performed. This release supersedes the build 39 Test status below.

- Release source/tag: `fad5d64882180259b2e9229b20344eb576ece371` / `v1.10.25`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37998965819),
  [exact-version validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37999128465)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37999282609)
  succeeded. Tests, lint, dependency audit and verified-level Homey validation passed.
- [Build 40](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/40)
  includes the optional BK PV3/4 read-only decoder, independent freshness/stale
  clearing and reporting/topology regression follow-up described below.
  Energy accounting and control gates remain unchanged. Existing pairings are
  preserved. Physical port ordering, live app-transport validation and Robert's
  report remain pending; Test availability is not hardware acceptance.
- Mainline `master` and the diagnostic branch contain the release version.
  The separate local `master` worktree remains deliberately untouched.

### Mainline integration

The user approved promoting the diagnostic branch (reporting improvements,
regression/API audit and optional BK PV diagnostics) to the GitHub mainline,
which is named `master`. The remote is an ancestor, so promotion is fast-forward;
the separate local `master` worktree is deliberately left untouched. This is a
source integration was followed by the v1.10.25 Test release recorded above;
there is no production release or hardware acceptance. Robert's report and
physical PV-port verification are still pending.

### Local follow-up — reporting/topology regression and fresh API audit

Implemented optional original-BK app telemetry PV3/4 diagnostics locally on this
branch. `streamBkPvDiagnostics` decodes only four float fields from 254/21; shared
header framing is reused, not ES telemetry mapping. Known-model limits admit
BK11/BK61 PV3/4 and BK12 PV3. Observed voltage/current tiles are read-only,
candidate-port-labelled and excluded from Insights; each expires after 20 minutes
(watchdog every minute), clears on restart and appears only when observed.
No app login means the existing REST/JSON path still works unchanged. A newly
configured app login requires device/app restart to establish this optional
subscription. App frames never enter quota/power/energy accounting. Support JSON
exports only fixed-list receipt ages/staleness. Synthetic decoder/lifecycle/privacy
regressions pass: 418 tests total, lint and diff checks pass. Hardware port ordering
and live app-transport validation remain open; now included in Test build 40.
Pinned Homey CLI 4.5.3 also passed verified-level validation and TypeScript
compilation. It warned that local Node 22 is below its declared Node >=24 engine;
release CI should still perform validation on its configured supported runtime.

Added seven synthetic regression tests on the diagnostic branch; no runtime or
release changes. [Audit and next evidence](STREAM_REPORTING_API_AUDIT_2026_10_09.md)
records fresh read-only Developer API calls and independent ES21/ES22 upstream
evidence, including the official-versus-app transport distinction and new BK
PV3/4 diagnostic candidates. Await Robert's report; preserve pairings, control
gates and beta labels. This follow-up is not included in Test build 39.

### Latest Test release — v1.10.24 / build 39

Published and verified in the developer portal on 9 October 2026: “Your app is
currently available for testing.” [Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Production remains v1.10.3/build 18. No certification submission or hub install
was performed. `master` remains unchanged; work is on
`codex/mixed-generation-reporting-diagnostics`.

- Release source/tag: `7dfe9ad6d5d2b9ff07c9da8d7da67869f64c550a` / `v1.10.24`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991704150),
  [exact-version validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991909121)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37992320031)
  succeeded. Tests, lint, dependency audit and verified-level Homey validation
  passed; local tests passed 402 cases.
- [Build 39](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/39)
  was separately published to Test. Includes Copy report, manual-copy guidance
  and safe fixed-list control-failure reason/action/count diagnostics. It does
  not change grouping, energy accounting, command plans or control safeguards.
- Docker Hub 429 failures were resolved by replacing the three Athom Docker
  wrappers with their equivalent pinned `homey@4.5.3` CLI commands in existing
  GitHub workflows (`f0141b257a04fffe1da1a36e5d13a877fc8ad5cf`). Official pinned
  action entrypoints were inspected first. Authentication uses the existing
  GitHub secret; no validation gate was bypassed.
- [Community reply 45](https://community.homey.app/t/157399/45) was posted and
  verified. Robert was asked to update in place, wait five minutes, send copied
  Show support report JSON privately after review, a fresh Homey app-log ID,
  concurrent screenshots and the original warning action/Flow. No re-pair or
  control retry was requested. Await his response; do not send duplicates.
- Robert's 0% combined reading remains unresolved. Ed gets better report
  sharing, not Solis control or battery coordination. Hardware gates remain.

### Earlier release attempt — report sharing and control diagnostics (superseded)

Implementation is pushed as `c7e82b97722659b65d97c438ccb835bb00487430` on the
diagnostic branch; local 402 tests and lint passed. Release attempt on 9 October
is blocked by Docker Hub `429 Too Many Requests` building Athom action containers.
[Version run 37991299242](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991299242)
failed initially and on retry before any version changes;
[validation run 37991352859](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991352859)
also failed at container preparation. No new upload or Test publication occurred.
Test remains v1.10.23/build 38. Resume version workflow, exact-version validation,
upload and portal publication when registry access recovers; do not bypass CI.
Robert's follow-up has not been posted. Once released, request copied displayed
report AND fresh Homey app-log ID, screenshots and the original warning trigger;
do not ask him to retry controls or re-pair.

Post 44 and manual log `ed73698e-c303-40fe-9783-7810e2366f01` confirm individual
SOC readings around 9–10% while the original aggregate remains 0%. The emailed
screenshots are available under the collapsed attachments section. The manual
log shows live ES22 telemetry and established transports, but does not contain
the displayed schema-6 support snapshot. Ask for that JSON separately; preserve
pairings and identify the action/Flow which produced the no-commands warning.

Local changes add Copy report with clipboard-failure/manual-copy guidance and
explicitly distinguish the displayed JSON from Homey's log ID. Control failures
retain only fixed safe reason/action codes; the original Home Battery exposes
the latest failure counts in its session-only reporting diagnostics, reset on
initialisation or successful warning-clearing control. Raw exceptions are not
returned. These changes do not alter command plans, aggregation or safeguards.
They are not included in the published v1.10.23 build and have not been posted
to the community. A new release would need the normal validation/upload gates.

**Latest Test release: v1.10.23 / build 38.** The developer portal confirmed
“Your app is currently available for testing” on 9 October. Production remains
v1.10.3 / build 18; no certification submission or hub installation was made.

The diagnostic release is on `codex/mixed-generation-reporting-diagnostics`;
`master` is unchanged. Implementation commit: `f618c229914166a9bc4ead158a0087d154dce938`;
version/tag: `175ad1d4dcae728d657d64c2a8765861059ae067` / `v1.10.23`.

- [Version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37986052851),
  [exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37986141316)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37986479957)
  succeeded. CI passed 399 tests, lint, audit and verified-level Homey validation.
- [Build 38](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/38)
  was separately published to [Test](https://homey.app/a/uk.co.zarb.ecoflow/test/).
- Ask Robert and Ed to update in place, confirm v1.10.23, run for approximately
  five minutes and provide **Show support report** with concurrent EcoFlow/Homey
  screenshots. Preserve devices, pairing history, counters and Flows.
  [Community post 43](https://community.homey.app/t/157399/43) was published and
  verified on 9 October with these instructions. Await their response rather
  than sending duplicate follow-ups.
- Ed benefits from cached EcoFlow readings in the report, not new controls.
  Solis has no THEN actions in his reported integration; confirm whether its
  “Capaciteit” percentage represents battery SOC. Charging inhibition and
  Solis/BYD coordination remain unimplemented and hardware-gated.

### Diagnostic increment — 9 October 2026 (v1.10.23, superseded)

Community replies 41–42 clarify that the mixed-generation installation was
linked after its original Homey pairing, and that the Solis integration provides
readings/conditions but no action cards. The original STREAM aggregate still
uses its paired serial for reads; a changed reporting device is a hypothesis,
not a confirmed cause of the reported zero totals. Preserve existing pairings.

Support schema 6 adds an anonymous `reporting` section per device with fixed-list
cached capability values. The original STREAM aggregate additionally records
session-only per-reading receipt age/source and whether its read address matches
the saved main address. Missing readings remain null; explicit zero and signed
power are preserved. Receipt age is not device-time freshness or proof of current
installation membership. Restart clears receipt evidence; unrelated deltas do
not refresh it. No cloud requests, full serials, raw quota, names or secrets are
included. 5000 readings retain their existing independent freshness section;
absent receipt observations must not be inferred from cached capability values.

This increment does not change reporting addresses, aggregation, counters,
availability, controls, pairing or Energy roles. It does not repair Robert's
installation yet. Collect the new support report and compare
the aggregate and individual devices with simultaneous EcoFlow screenshots.
No uninstall/re-pair or hardware controls were undertaken.

### Previous release handover — 7 October 2026

**Latest Test release: v1.10.22 / build 37.** Published to Homey Test on
6 October 2026; the developer portal confirmed “Your app is currently available
for testing.” Production remains **v1.10.3 / build 18 / Live**. No certification
submission, live-hub installation or physical control acceptance was performed.

- GitHub default branch is `master`, not `main`. Both the ecosystem wave and
  original STREAM bug bash are merged there. Implementation tip: `7a2c551`;
  version/tag: `a3c8c25e76851d0e8b2dbde2bcff08b5bff6e0a0` / `v1.10.22`.
- [Version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37531769282),
  [exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37532011154)
  and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37532286444)
  passed. Exact-version CI includes tests, lint, dependency audit and Homey
  validation. Upload created build 37; publishing its draft to Test was a
  separate, verified browser action.
- [Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/).
  Existing IDs, pairings and cumulative counters are preserved. No re-pair is
  required. Home Battery remains the installation's Homey Energy contributor;
  physical-unit monitors remain excluded to prevent double counting.
- Release includes per-reading 5000 expiry/restart clearing, read-only reported
  settings and Flow conditions, observed physical MPPT/backup-socket monitoring,
  stale-gap energy re-anchoring, widget freshness/estimates, and the original
  STREAM aggregate/unit, socket routing, command readback, transport and history
  fixes. See [ecosystem wave](STREAM_5000_ECOSYSTEM_WAVE.md) and
  [bug bash](ORIGINAL_STREAM_BUG_BASH.md).
- [Community update, post 34](https://community.homey.app/t/157399/34) and
  [reply to Robert, post 35](https://community.homey.app/t/157399/35) were publicly
  verified on 7 October. They request model details, paired EcoFlow/Homey
  screenshots, diagnostics and Fronius/BYD integration/control information.
  Do not send duplicate follow-ups while awaiting a response.

### Open acceptance and next work

1. Compare ES21/ES22 and original STREAM readings on real installations: charge,
   discharge, idle, backup socket, restart/reconnect and a 24–48-hour soak.
   Review socket Flows on Max, AC and unidentified models after capability fixes.
2. Robert's requested BYD-first charging policy is **not implemented as an
   actuator**. `/coordination-preview` is stateless advisory preparation; it
   does not read devices, send commands or coordinate either battery system.
   Establish reliable BYD/grid inputs, actual linked models and whole-system
   charge inhibition before designing a live controller. A grid-input limit is
   not proof that all STREAM charging has stopped.
3. Mixed-generation membership, combined SOC/capacity and per-unit boundaries
   need already-linked hardware evidence. Do not automatically merge systems.
4. 5000 commands and Expansion/Gateway/3000 pairing remain evidence-gated.
   REST readback or automated tests do not prove physical response.
5. Original-series per-reading freshness, empty-quota availability and history
   timezone/granularity remain focused follow-ups. Do not turn missing data into
   zero or silently backfill cumulative meters from historical totals.

### Checkout and privacy handover

Active checkout: `work/uk.co.zarb.ecoflow-energy`, branch
`codex/mixed-generation-reporting-diagnostics`. Sync this branch normally;
never force-push to resolve divergence. The separate `uk.co.zarb.ecoflow-icon`
worktree has an older local `master` with local commits: preserve it, and do not
reset it to the remote release. Fetch and inspect before any cross-device merge.

Credentials, full serials, raw account responses, private diagnostics and browser
sessions must stay out of Git. This handover contains project knowledge only,
not a copy of the user's private memory store. Future releases must use the
version workflow, exact-version green CI, upload, then verified Test publication.

## Historical implementation and release records — 6 October 2026

The entries below describe earlier stages. Unpublished/pending wording is
superseded by the current release handover above, not a current release status.

**Original-series bug-bash candidate:** [API review and fixes](ORIGINAL_STREAM_BUG_BASH.md)
on `codex/original-stream-bug-bash` follows the ecosystem wave's merge into GitHub
master at `9c81abc`. Authenticated read-only BK account checks and current online
documentation informed aggregate/unit separation, socket routing/layout, shared
control readback, transport/cache and history fixes. Local tests pass 396 cases;
lint/full audit pass. This candidate is not merged/published and its exact-commit
CI/Homey packaging gate is still pending. Live controls were not exercised.

**Latest development increment:** [ecosystem wave](STREAM_5000_ECOSYSTEM_WAVE.md)
integrates per-reading expiry, restart clearing, read-only settings/Flow conditions,
observed physical MPPT/socket tiles and stale-gap Energy re-anchoring. Local tests
pass 372 cases; widgets use fresh reported settings and conservative reserve
estimates. Runtime observation is not hardware acceptance. Model identities,
saved counters and installation-only Homey Energy roles are preserved. Controls,
automatic consolidation and new product adapters remain gated. No publication.

**Development branch:** `codex/stream-charging-coordination` starts from the clean,
synced Test handover tip `5c984770e805e4f2a2e192b7c92c64faab0eb9b2`. Community
reply 33 adds BYD-priority and anti-reciprocal-charging requirements; see the
[next-wave branch and sprint plan](COMMUNITY_FEEDBACK_ROADMAP.md). Build 36 remains
the Test baseline. Development now includes runtime advisory/diagnostic code;
5000 controls, Energy roles and production remain unchanged. Keep focused release hotfixes separate.

Sprint 4A–6 research preparation now adds test-only ES22 input-payload replay,
explicit-system topology review and new-product evidence gates. There is no
runtime import, routed writer or new pairing admission. See the roadmap's offline
implementation section for verified source pointers and remaining acceptance.
The simulation-only coordination policy adds stale-input rejection, SOC
hysteresis and opposing-flow checks. Local verification passes 351 tests, lint,
full audit (zero vulnerabilities) and whitespace checks. Hardware-dependent
completion of Sprints 4–6 remains open; no build/version or channel change.

The next development increment adds a stateless, non-actuating
[`/coordination-preview` API](STREAM_COORDINATION_PREVIEW.md), support schema 5
control/topology assessments, and category-specific product evidence requirements.
The preview never accesses Homey devices or EcoFlow, persists state or grants
command permission. Settings explains recent receipts versus verified behaviour.
This is runtime preparation, not completion of hardware controls, automatic
mixed-generation consolidation or new product adapters. Local validation passes
361 tests, lint, whitespace checks and dependency audit (zero vulnerabilities).
It is not published.

**Latest Test release: v1.10.21 / build 36**, published on 6 October 2026 from
`codex/stream-next-wave-test`. The socket/configuration wave below is now in Test.
Implementation: `4997c1f9edcf1d4cc05951e25908a842c5b45f9f`; store guidance:
`0e6688ebe532aeee7fca6e25eced3b431b51e677`; version/tag:
`740b14669738f8f4d46cf084c55825f7326d0fd9` / `v1.10.21`.
[Version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37507493785),
[exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37507611559)
and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37507798632)
passed. Homey visibly confirmed Test publication. The downloaded archive contains
schema 4, configuration diagnostics, ES21 store guidance and installation-only
Energy roles, with an empty environment and no checked private auth paths.
Build 35 / v1.10.20 remains an unpublished draft because its store guidance was
outdated. Production remains v1.10.3 / build 18 / Live; `master` is unchanged.
No certification submission, hub installation, control or re-pairing was done.
Sprint 3's release gate is complete; independent ES21/ES22 hardware comparisons
and a 24–48-hour soak remain pending. See [tester checklist](TESTER_VALIDATION.md).

**Pre-release implementation record (superseded by the release above):** the new six-sprint socket/configuration
wave is recorded in `COMMUNITY_FEEDBACK_ROADMAP.md`. Sprints 1–2 now implement
battery-to-backup-socket accounting and session-only configuration diagnostics
(support schema 4), with pinned public captures and lifecycle/privacy tests.
Version remains 1.10.19; no counter reset, re-pair, Energy-role change, 5000
control, automatic grouping, new model or network request is added. The
read-only configuration observations have receipt age only, not authoritative
device-revision ordering. Hardware and Test-release acceptance remain pending;
do not treat this local source as the published build described next.
Local checks: 337 tests pass, TypeScript/lint pass, full dependency audit reports
zero vulnerabilities, whitespace checks pass and Homey verified-level package
validation succeeds. No commit, push, version bump or upload occurred in this
increment. The next step is the Sprint 3 Test-release/hardware gate, not controls.

**Release update:** the combined Sprint 1–5/ES21 candidate is now published as
**v1.10.19 / build 34 / Test**, from `codex/stream-next-wave-test`. This supersedes
the local/unpublished wording below, which records each implementation stage.
Production remains **v1.10.3 / build 18 / Live**; `master` was not changed.

- Implementation commit: `34d097254e88d5e632224dd69782f5742ee1c93d`.
- Version/tag commit: `c87813072428b421f62dce47d59137c6febf8a39` / `v1.10.19`.
- [Exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37392187407),
  [version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37392089835)
  and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37392358711)
  passed. All 313 tests, lint, full audit and Homey validation passed.
- Homey UI confirmed Test publication. The downloaded build-34 archive contains
  v1.10.19, ES21 admission, discovery diagnostics and support schema 3. Its
  manifest retains installation-only Energy meters and an empty environment;
  no env.json, .env or Git directory is packaged.
- [Install Test](https://homey.app/a/uk.co.zarb.ecoflow/test/). No certification,
  production promotion or installation/control action on a live Homey was done.
  ES21, mixed-generation, expansion/Gateway/3000 and BK control hardware gates
  remain open. No deletion/re-pairing is required for existing devices.
- Store README text still describes ES22-only beta support; refresh that listing
  guidance before the next release. The v1.10.19 changelog describes ES21 correctly.

The [Sprint 5 expansion-discovery increment](SPRINT_5_EXPANSION_DISCOVERY.md)
adds anonymous cached account inventory and peer-field visibility to support
schema 3. It adds no requests, new-model admission, capacity guesses, grouping
or controls. Account discovery is not installation membership. Expansion 5000/
3000, Gateway/Dual CT and STREAM 3000 hardware/API validation remain open.
This is local/unpublished; the existing ES21 and Sprint 1–4 changes are preserved.
The combined candidate passes 313 tests, TypeScript/lint, full audit (zero
findings), Homey publish-level validation and whitespace checks. No version,
commit, push, store upload or physical validation occurred in this increment.

The [model expansion increment](STREAM_MODEL_COVERAGE.md) now admits ES21 STREAM
5000 core monitoring locally, behind the beta gate, with a dedicated adapter and
both existing Energy roles. ES22/BK identities and counters remain unchanged.
PV/string tiles, 3000, expansion, Gateway/Dual CT adapters, mixed-generation
consolidation and 5000 controls are not enabled. This supersedes the earlier
Sprint 3 ES21 offline-only decision below, not its extra-capability gates.
ES21 Homey hardware acceptance remains open; nothing has been pushed or released.
All 304 tests, build/lint, full audit (zero findings), whitespace checks and Homey
publish-level validation pass locally for this combined candidate.

Sprint 4's [original STREAM control safety increment](SPRINT_4_CONTROL_SAFETY_STATUS.md)
is implemented locally: fresh main-target baseline/readback, per-target command
serialization, partial-failure warnings and no optimistic control updates. Price
conditions reject missing or >90-minute-old prices, including inverted conditions;
refresh the current tariff at least hourly and after restart/unit changes. No
automatic rollback, wattage target or 5000 write is added. All 294 tests, build,
lint, full audit (zero findings) and Homey publish validation pass locally.
No commit, push, version or publication was performed. Hardware
validation remains open, and Sprint 1–3 changes below are preserved.

The user authorized Sprint 3. The [capability preparation increment](SPRINT_3_CAPABILITIES_STATUS.md)
adds serial-keyed PV parsing and isolated ES21 offline research, without enabling
new models or Homey tiles. It remains local/unpublished with Sprint 1–2 changes.
The full suite passes 272 tests, build/lint, full audit and Homey publish-level
validation; hardware admission remains open.

Sprint 2's read-only
[topology discovery increment](SPRINT_2_TOPOLOGY_STATUS.md) is implemented locally:
observed peers/freshness and anonymous overlap-review hints, with no grouping,
identity change, Energy-role change or control write. It remains on
`codex/stream-next-wave-test`, together with Sprint 1's unpublished fixes. Local
Sprint 2 checks passed 261 tests, build/lint, full audit and Homey publish-level
validation before the Sprint 3 additions above.

The
[Sprint 1 ledger](SPRINT_1_VALIDATION_STATUS.md) records a new non-manual
production SDK startup report, a read-only numerical Energy lead and local
shutdown-race fixes with regression tests. These follow-up changes are not
published, versioned or pushed. Hardware/support/picker validation remains open.

The October [community roadmap](COMMUNITY_FEEDBACK_ROADMAP.md) supersedes the
historical sprint/current-version statements below. Sprint 1 and next-wave
changes are published as **v1.10.18 / build 33 / Test**, from
`codex/stream-next-wave-test`, based on v1.10.17. The user authorized this
Test-channel release on 4 October. Production remains **v1.10.3 / build 18 / Live**.
Production promotion, automatic grouping, live-device installation and control
writes are not part of this release. Existing pairing is preserved.

- [Install Test v1.10.18](https://homey.app/a/uk.co.zarb.ecoflow/test/).
- Implementation commit: `2f7e14b755c96e5fa02e864a0f8102c7fed9562f`.
- Version/tag commit: `a3ec1ff8d79e409876184f228a5dd8f52288adeb` / `v1.10.18`.
- [GitHub validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37162940122),
  [version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37163119488)
  and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37163190955)
  passed. Homey developer UI confirmed Test publication; certification was not submitted.
- Uploaded archive checked: version, support route, compiled support module and
  system-only Energy meters. Store upload is not a live hardware/endpoint pass.

- Telemetry corrections: [API review](STREAM_5000_API_REVIEW.md).
- Next-wave accounting: persist initial BK counter baselines, retry failed
  checkpoints, serialize writes, snapshot values before awaiting, use receipt
  timestamps and suppress REST replies superseded by newer MQTT.
- Local settings support report: version/platform, packaged versus registered
  beta drivers, anonymous accounting evidence; no credentials/names/serials.
- Development dependency upgrade uses Athom config 4.0.2 with its supported
  ESLint 8.57.1 peer. Full npm audit is clear; CI now checks full dependencies.
- [Tester validation and mixed-generation evidence plan](TESTER_VALIDATION.md).
- [Original STREAM Flow capability audit](BK_FLOW_CAPABILITY_AUDIT.md).
- [Mixed-generation discovery plan](MIXED_GENERATION_VALIDATION.md), including
  API source/scope changes and history risks. The broader tester request is
  published in community post 29; no new reply was sent in this validation pass.
- Eight manual reports are not proven process crashes; a new non-manual SDK
  startup/cleanup report is tracked separately. Energy calculation and
  missing-picker reports remain open. No automatic grouping or 5000 controls.
- Verified locally and in GitHub CI: build, lint, 242 tests, clean `npm ci`, full
  audit (zero findings), whitespace checks and Homey verified/publish validation. No hardware
  or Homey endpoint verification is implied.

Read the validation documents before inviting testers or promoting a build.

## Outstanding / next actions (resume here)

- [ ] Complete [Sprint 5 host-plus-expansion and discovery validation](SPRINT_5_EXPANSION_DISCOVERY.md)
  on existing configurations. Capture system/host/pack boundaries, capacity units,
  negative account-only cases and Gateway/3000 identities before adding adapters.

- [ ] Complete the [Sprint 4 BK hardware matrix](TESTER_VALIDATION.md), including
  accepted-but-unapplied writes, EcoFlow policy conflicts, actual power response
  and manual recovery. Release only with explicit authorization and green CI.

- [ ] Complete [ES21 beta hardware acceptance](STREAM_MODEL_COVERAGE.md) and
  [Sprint 3 capability admission](SPRINT_3_CAPABILITIES_STATUS.md) before exposing new socket/PV tiles. Expansion/gateway capacity and
  identity remain unverified; no model-prefix guessing or control writes.

- [ ] Validate [Sprint 2 discovery](SPRINT_2_TOPOLOGY_STATUS.md) on already-linked
  mixed-generation hardware and independent installations before any consolidation.
  Test v1.10.19 now contains this candidate; hardware evidence remains required.

- [ ] Complete the active [validation sprint](SPRINT_1_VALIDATION_STATUS.md):
  confirm installed Test/support report, investigate counter scope and the
  production startup timeout, reproduce Ed's mobile picker, then collect hardware evidence.
- [ ] **STREAM AC 5000 live gate** — install Test v1.10.19 and complete the
  charging/discharging/idle plus 24–48-hour soak matrix in
  `docs/STREAM_AC5000_SPRINTS.md`. Code-side Sprint 1–4 work is complete.
- [ ] **Hardware verification** — run the HomeyScript probe in `docs/HARDWARE_VERIFICATION.md`:
  confirm the self-heating field, STREAM Max (BK41) 2-PV count, and per-socket fields; then adjust
  `lib/streamModels.ts` / `lib/streamMapping.ts` if needed.

## Current development state (2026-08-10)

- Source version: **v1.10.7**; this working change has not been versioned or
  published yet.
- New pairing entry: `stream_5000_unit` (**STREAM 5000 Series Unit**).
- Current verified product: STREAM AC 5000 with serial prefix `ES22`, using the
  dedicated `es22` monitoring adapter.
- Legacy `stream_ac5000` is deprecated but remains operational for existing
  Homey devices; both drivers share one lifecycle and credential scope.
- STREAM 5000, STREAM Expansion Battery 5000 and STREAM Gateway remain hidden
  until a serial prefix and product-specific telemetry adapter are verified.
- Future-product policy and admission checklist:
  `docs/STREAM_5000_ARCHITECTURE.md`.

## Suggested next-release changelog (family-driver architecture)

> Adds the future-ready STREAM 5000 Series Unit pairing entry, with verified
> STREAM AC 5000 monitoring today. Existing AC 5000 devices keep working through
> the deprecated compatibility entry. New 5000-series hardware is only exposed
> after its serial prefix and telemetry protocol have been verified.

## Suggested next-release changelog (for the version workflow)

> STREAM AC 5000 now reports battery percentage on firmware V1.1.4.35 and is
> recognised as a home battery by Homey Energy. Diagnostics now provide safe,
> time-aligned telemetry snapshots and clearer connection/parser health while
> preserving the verified battery, house and grid power calculations.

## Release state (2026-07-26)

- **Latest version:** **v1.10.3** — **Build ID 18** is **live in the Homey App Store**.
- v1.10.3 replaces all five light/dark widget preview pairs with deterministic, text-free,
  transparent 1024x1024 artwork that follows Homey's Widget Preview guidelines.
- The release is tagged as `v1.10.3`; the public Homey Apps API reports `liveVersion: 1.10.3`,
  `liveBuild.id: 18`, and `liveBuild.state: live`.
- v1.10.1 was the previously certified feature release containing the multi-model review,
  fit-and-finish sprints, enriched App Store tags, and `bugs` URL. PayPal donate = `zarbie`.

## Fit-and-finish sprints (2026-07-20, after v1.9.0 / Build 14)

Merged to `master` via PRs #2–#5 (each build/lint/test/validate green):
- **S1 hardening:** REST retry (`lib/retry.ts`), `batteryEnergyMode` latch tests, widget in-flight
  guard + pagehide teardown.
- **S2 i18n:** German + Dutch across the whole app (279 localized objects).
- **S3 solar forecast:** real Open-Meteo forecast (`lib/solarForecast.ts`), `solar_forecast_today/
  tomorrow` capabilities, geolocation permission, forecast widget + conditions.
- **S4 tariff (provider-agnostic):** `Set current electricity price` action + `Electricity price`
  capability + price/negative-price conditions (shared `lib/thresholds.ts`); works with any tariff
  app (Octopus/Tibber/aWATTar/…) in any region; Energy Recommendation widget shows the price.
- **S5/S6 polish + hardware tooling:** README/docs refresh, provider-agnostic `OCTOPUS_FLOWS.md`,
  `docs/HARDWARE_VERIFICATION.md` + the HomeyScript probe.
- **Status:** 68/68 tests pass; lint clean; validates at `--level publish`.

## Suggested v1.10.0 changelog (for the version workflow)
> German & Dutch translations. New: real solar forecast (today & tomorrow) from your local weather,
> and tariff-aware Flows that work with any electricity-price app. Plus sturdier connectivity and
> more reliable widgets.

## Previously — review & hardening pass on v1.8.6 (2026-07-20)
- [ ] Optional: verify the 8524-safe reserve sequence, `Release battery for export now`, and the
  new grid threshold triggers on the live STREAM.

## Review & hardening pass on v1.8.6 (2026-07-20)

A full multi-model review + implementation pass on the current release (branch
`copilot/review-v1.8.6`, PR pending):
- **Deliverables:** `docs/PRODUCT_RESEARCH.md`, `docs/CODE_REVIEW_v1.8.6.md` (GPT-5.6 Sol +
  GPT-5.5 + Opus 4.8), `docs/FEATURE_EVALUATION.md`, `docs/SPECIFICATION.md`, `docs/SPRINTS.md`,
  `docs/PRE_SUBMISSION_CHECKLIST.md`.
- **Widgets (Sprint 1, certification fix):** replaced the shared placeholder with a **distinct,
  simplified, text-free preview pair per widget** (`npm run widgets:preview`), exported on
  transparent 1024x1024 canvases; fixed the reversed Energy-Flow grid arrow; renamed "Solar
  Forecast" → "Solar Target" and "Tariff Opportunity" → "Energy
  Recommendation"; qualified the estimated consumption/independence values; mute on no-device.
- **High fixes (Sprint 2):** H1 backup-reserve 8524 ordering + verify (+ `Release battery for
  export now`); H2 `onUninit` flushes `EnergyCheckpoint` so meters stay monotonic across restarts;
  H3 counter-latch stops battery double-count; H4 MQTT session can't survive teardown.
- **Medium/low (Sprint 3):** BK41 PV count 4→2; history midnight reset + blank-parse; MQTT
  reconnect credential refresh; timer/reference cleanups.
- **Features (Sprint 4):** solar-below, charging-from-solar, grid import/export threshold triggers.
- **Status:** 51/51 tests pass; lint clean; `homey app validate --level publish` clean.
- **Already-fixed on master (not redone):** trigger state machine (`flowStates`), empty-string
  parsing, poll/MQTT serialization, `getId()` binding, signing/SSRF security, 3–100% reserve.

## Suggested v1.9.0 changelog (for the version workflow)
> Five dashboard widgets now each have their own Homey-compliant preview; safer backup-reserve control
> (fixes a silent no-op); trustworthy energy meters across restarts; sturdier realtime connection;
> new tariff/grid Flow cards; STREAM Max solar-input fix.

## Session log

- **2026-07-26** — Rebuilt all ten widget preview assets as distinct, deterministic SVG-derived
  illustrations with transparent canvases and no text or screenshots. Added preview compliance
  tests, updated reviewer documentation, released **v1.10.3**, and published **Build 18** live in
  the Homey App Store.
- **2026-06-25** — Cloned repo; renamed app **"EcoFlow - Stream Systems" → "EcoFlow STREAM Series"**;
  set app icon to white EF monogram on black (`brandColor #000000`). Drafted the standalone-app
  certification reply + refreshed reviewer notes. Implemented recommendation sets **A/B/C**
  (see below) and shipped **v1.8.0 / Build 7**, installed on the local Homey Pro. Releases this
  session: v1.7.9 (black icon) → v1.7.10 (rename) → v1.8.0 (A/B/C features).

## Historical snapshot — v1.8.6 (2026-07-17)

- **App:** `uk.co.zarb.ecoflow` — "EcoFlow STREAM Series" · SDK v3 · TypeScript.
- **Latest version:** **v1.8.6** (tag `v1.8.6`).
- **Release note:** Backup reserve controls now support the full 3-100% STREAM range,
  and App Store search tags improve discoverability.
- **Local install:** v1.8.6 installed on **Justin's Homey Pro** (192.168.1.142) via
  `homey app install`.
- **Branding:** app icon is the **white EcoFlow EF monogram on a black background**
  (`brandColor: #000000`, `assets/icon.svg` monogram fill white). Black `brandColor`
  also tints the app's accent colour elsewhere in the Homey UI — this is intentional.

## Recent feature additions (v1.8.0)

Grounded in the EcoFlow STREAM product line + the app's own backlog:
- **A1** Corrected MPPT/solar-input counts from official specs (Ultra=4, Pro=3, Ultra X=4)
  in `lib/streamModels.ts`; per-unit PV tiles follow automatically.
- **A2** Daily-history tiles (`energy_*_today`, `co2_today`, `energy_independence`) are now
  **added on demand** only when EcoFlow's history feed returns data, and blank ones are
  cleaned up on upgrade — no empty energy tiles for models whose history API is rejected.
- **A3** Removed dead PowerStream-only capabilities (`output_target_power`, `supply_priority`,
  `ps_charge_limit`, `ps_discharge_limit`, `led_brightness`) from the shipped surface.
- **B5** New tariff Flow actions: **Prepare for cheap grid import** and **Prepare for peak / export**.
- **B6** New condition: **Battery level is above/below**.
- **C7** New read-only **AC output** info setting (notes the 2300 W paired figure for Ultra/Ultra X).
- **C8** New **Self-heating** read-only tile, added on demand when the unit reports a heating field
  (candidate field names pending hardware confirmation — see `docs/FEATURE_BACKLOG.md`).
- **B4** Added `docs/OCTOPUS_FLOWS.md` — ready-made Octopus Agile automation recipes.

## Scope (deliberate)

- Focused **only** on the EcoFlow **STREAM** balcony-solar/battery product line and the
  EcoFlow **Smart Meter**.
- PowerStream and portable power stations are **intentionally excluded** — PowerStream
  lives in `disabled-drivers/powerstream/` and is not shipped.
- Shipped drivers: `stream`, `stream_unit`, `stream_solar`, `stream_micro`,
  `stream_socket`, `smartmeter`, `stream_5000_system`, `stream_5000_unit`, plus deprecated
  compatibility driver `stream_ac5000`.

## Homey Energy integration (the differentiator)

- `stream` → `energy.homeBattery: true` + `meter_power.charged/.discharged` (home storage).
- `stream_unit` → optional physical telemetry monitor; no Homey Energy contribution.
- `stream_5000_system` → app-auth installation Home Battery with charged/discharged meters.
- `stream_5000_unit` / deprecated `stream_ac5000` → optional physical telemetry monitors;
  no Homey Energy contribution.
- `smartmeter` → `energy.cumulative` + `meter_power.imported/.exported` (grid meter).
- `stream_solar` / `stream_micro` → `meterPowerExportedCapability` (solar production).
- Energy-decision Flow cards: `set_operating_mode`, `set_backup_reserve`,
  `set_charge_limit`, `set_discharge_limit`, `set_feed_in`; plus grid/solar triggers and
  conditions. Core use case: drive STREAM charge/discharge from **Octopus Agile** prices
  via Homey Flow.

## App Store certification — resolved

The Homey reviewer flagged device overlap with **Marcus Valk's** app
**"EcoFlow - Portable power stations"** (`com.ecoflow.ecoflowpro`,
<https://homey.app/a/com.ecoflow.ecoflowpro>), which already lists the STREAM models
(AC Pro/Pro/AC/Max/Ultra/Ultra X) plus PowerStream, Smart Plug, Smart Home Panel and the
Delta portable stations. The reviewer asked us to merge/PR into that app or justify a
standalone app.

- **Our position:** standalone app justified by **focus** (STREAM-only) + **Energy-native
  design** + **Octopus tariff automation** — not device exclusivity (the overlap is real).
- **Drafted reply + evidence table:** [`docs/CERTIFICATION_REPLY.md`](./CERTIFICATION_REPLY.md).
- **Reviewer test notes:** [`docs/REVIEWER_NOTES.md`](./REVIEWER_NOTES.md).
- **Outcome:** the standalone STREAM-focused app was approved. The widget-preview correction
  shipped in **v1.10.3 / Build 18**, which is live in the Homey App Store.
- Keep the reply and reviewer notes as evidence for future certification questions. If device
  overlap is raised again, continue to ground the response in focus, Energy-native integration,
  and tariff automation rather than device exclusivity.

## Release process (verified this session)

1. Commit & push changes to `master`.
2. **Version bump:** GitHub Actions → run *Update Homey App Version* workflow
   (`homey-app-version.yml`, `workflow_dispatch`) with `version=patch|minor|major` +
   `changelog`. It bumps `app.json`/`.homeycompose`, updates `.homeychangelog.json`,
   commits, tags `vX.Y.Z` and creates a release.
   - CLI: `gh workflow run homey-app-version.yml -f version=patch -f changelog="..."`
3. **Publish to App Store:** run *Publish Homey App* workflow (`homey-app-publish.yml`,
   `workflow_dispatch`). Uses `HOMEY_PAT`; creates a new Build ID and uploads.
   - CLI: `gh workflow run homey-app-publish.yml`
4. **Local install (optional):** `npx homey app install` (installs on the selected Homey
   Pro; requires `homey login` + `homey select`).
5. `git pull` to sync the version-bump commit/tag the workflow pushed.

> Do not hand-edit the version — let the version workflow own it. Edit `brandColor`,
> icons, etc. in **`.homeycompose/app.json`** (source of truth); `homey app build`
> regenerates `app.json`.

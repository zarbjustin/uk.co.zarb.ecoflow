# Current development roadmap — community feedback and STREAM 5000

Updated: 6 October 2026. This is the current priority order; older sprint documents
remain historical records. Local implementation, automated verification, hardware
validation and store deployment are separate milestones.

**6 October release update:** the combined Sprint 1–5/ES21 work below is published
as **v1.10.19 / build 34 / Test** on `codex/stream-next-wave-test`. Earlier
local/unreleased descriptions are implementation history. Exact-version GitHub
CI passed (313 tests, lint, full audit and Homey validation), and the uploaded
archive was checked. Production remains v1.10.3 / build 18; hardware acceptance,
mixed-generation consolidation and unverified-model/control gates remain open.
See [release evidence](STATUS.md) and the [tester checklist](TESTER_VALIDATION.md).
No new community post, certification submission or live-hub installation was made.

[Sprint 5 expansion/installation discovery](SPRINT_5_EXPANSION_DISCOVERY.md) is
implemented locally: anonymous cached account inventory and peer-field visibility
in support schema 3. Expansion 5000/3000, STREAM 3000 hosts, Gateway and Dual CT
remain evidence candidates, not newly paired products. The next acceptance wave
needs already-configured hardware and authoritative system/pack boundaries.

6 October model expansion: [ES21 core monitoring](STREAM_MODEL_COVERAGE.md) is
now admitted locally through an explicit beta adapter. Hardware acceptance is
still open. The earlier Sprint 3 offline-only model decision below is superseded;
PV/string tiles, expansion/Gateway/3000 admission and controls remain gated.

Sprint 4's [BK control safety increment](SPRINT_4_CONTROL_SAFETY_STATUS.md) is
implemented locally: fresh target readback, serialized/no-op-aware writes,
partial-failure review and tariff freshness. No automatic rollback or 5000
controls. Sprint 1–3 hardware/support gates remain open; none of these local
follow-ups has been released.

Sprint 3's [model/capability preparation](SPRINT_3_CAPABILITIES_STATUS.md) is
implemented locally, without new model pairing or Homey tiles. Hardware admission
remains open. Sprint 2's read-only topology discovery increment is also local;
see its [status and remaining gates](SPRINT_2_TOPOLOGY_STATUS.md). No automatic
grouping or migration is enabled. Sprint 1's validation remains open. See the
[Sprint 1 validation ledger](SPRINT_1_VALIDATION_STATUS.md) for fresh dashboard
checks, the new non-manual production startup report, locally reproduced
shutdown races, and the still-open numerical Energy/picker/hardware gates.

## Evidence and current release boundary

- The [Homey developer dashboard](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow)
  now identifies build 18 / v1.10.3 as Live and build 34 / v1.10.19 as Test;
  build 33 / v1.10.18 is the previous Test baseline.
  An uploaded test build is not automatically the production version.
- The eight available build-18 reports are **manually submitted diagnostics**.
  Seven show repeated Developer API 1006 errors for ES22 devices paired through
  the original `stream` or `stream_unit` interface. One reports a Homey Energy
  charge/discharge calculation concern and contains upstream 500/504 and request
  timeouts. These reports do not establish a process crash or a crash stack.
  On 5 October, build 18 also lists one non-manual SDK startup/cleanup report;
  this is separate from those manual submissions. Build 33 lists zero reports
  and 18 installations at this check. Do not infer error-free hardware behaviour.
- Existing v1.10.17 code already excludes ES22 from BK pairing and quarantines
  wrongly paired ES22 devices before Developer API polling or writes. The current
  changes clarify the correct Home Battery route; they did not introduce this guard.
- Both `stream_5000_system` and `stream_5000_unit` are present, non-deprecated and
  local-platform capable in build 32's uploaded `app.json`. Ed's missing-picker
  report is therefore **unresolved**, not explained by missing packaged drivers.
- [Sprint 1 evidence and implementation](STREAM_5000_API_REVIEW.md) distinguishes
  official BK API guidance from observed ES22 app-protocol behaviour. No stable
  cross-generation membership contract or ES22 control contract was established.

Private diagnostic contents, credentials, full serials and report identifiers are
not included here or used as public regression fixtures.

## Priority 0 — safe onboarding and support triage

**Implemented in Test v1.10.18:** settings distinguish the Homey integration from the
EcoFlow mobile app; explain the test channel and pairing-only beta switch; make
the one-installation Energy role and optional monitor explicit; discourage
deleting existing devices before the correct replacement is visible. Regression
tests check generated beta choices and guidance. The production MQTT dependency's
`ip-address` lock entry is updated from 10.3.1 to 10.7.2; production-only npm audit
passes. The subsequent next-wave compatibility review upgrades Athom's config to
4.0.2 and its supported ESLint 8.57.1 peer; full dependency audit now has zero
findings. CI checks development dependencies too. ESLint 8 remains deprecated
upstream; this is an Athom-compatible security cleanup, not a claim that the
lint toolchain is on the newest ESLint major.

**Still open:** reproduce Ed's picker issue using installed app version/channel,
Homey OS, mobile-app version and a picker screenshot. Compare clients without
assuming a cache or region cause. Confirm replacements before recommending
re-pairing; warn that deletion can affect Flows and history.

**Exit gate:** beta choices are discoverable on the affected client and setup
guidance produces one working installation Home Battery without duplicate Energy.

## Sprint 1 — trustworthy monitoring and Energy accounting

**Implemented in Test v1.10.18:** serial-keyed records, correct system versus unit SOC,
capture-verified MPPT and socket flow edges, conservative ambiguous-unit power,
role-specific availability, privacy redaction and replay/lifecycle coverage.
Driver identities and existing kWh checkpoints are preserved. Physical monitors
remain excluded from Energy; do not restore their Energy meters as a shortcut.
Lifecycle replay verifies saved-total restoration, restart anchoring, duplicate
timestamps and an oversized reconnect gap. A graceful-restart simulation is not
proof that an abrupt process crash cannot lose unflushed checkpoint increments.

**Next-wave code audit included in Test v1.10.18:** initial BK counter baselines now
checkpoint even before totals increase; failed persistence retries, concurrent
writes serialize and each write snapshots totals/baselines before awaiting.
Receipt timestamps govern integration, and newer MQTT suppresses superseded
REST replies even when queued or received within the same millisecond. Teardown
drains accepted samples before its checkpoint and ignores late REST results.
Counter authority/reset semantics remain conservative; these fixes do not by
themselves reproduce or close the build-18 calculation report.

The on-demand settings support report separates packaged from registered beta
drivers and exposes anonymous accounting source/baseline/gap/checkpoint evidence.
It makes no EcoFlow requests and excludes credentials, device names and serials.
It cannot inspect the mobile picker or infer the installed store channel.

**Still open:**

1. Time-aligned single-unit charge/discharge/idle screenshots and diagnostic
   snapshots, including app restart and saved charged/discharged totals.
2. Linked-unit SOC and power tests: a unit must not display the aggregate power
   as its own or borrow another unit's percentage.
3. A reproducible numerical example for the build-18 Energy calculation concern.
   Inspect counter versus integrated-power selection, simultaneous REST/MQTT,
   timeout gaps, firmware counter resets and restart persistence. Timeouts alone
   do not explain or close the reported calculation issue.
4. Loaded AC-socket and direct PV-charge validation, then a 24–48-hour soak with
   reconnect and stale-data checks.

**Exit gate:** automated checks plus hardware evidence for each admitted reading;
no historical counter rewriting, invented readings or unverified crash-fix claim.

## Sprint 2 — mixed-generation installation topology

**Implemented locally, not published:** adapter-owned peer observations,
freshness/bounded session retention, cached BK routing-address evidence and
anonymous support schema 2. Possible overlap between installation aggregates is
flagged for review only; physical monitors are not mistaken for duplicate Energy
sources. No account-wide grouping, new identity, Energy exclusion or migration.
See [implementation, pinned sources and verification](SPRINT_2_TOPOLOGY_STATUS.md).

The user reports that EcoFlow's app can combine original and new-generation
batteries. Support that arrangement only after determining how the API represents
membership, aggregate SOC/capacity and system power.

The [mixed-generation discovery plan](MIXED_GENERATION_VALIDATION.md) now records
the user-supplied first-hand linked-system evidence, positive/negative cases,
linking history risk, API-source/control-scope questions and implementation gates.
Recruit already-linked installations first; do not ask users to link/unlink
solely for testing or assume that the current AC-5000-only registry admits the
PV-equipped STREAM 5000. The broader tester request was published in
[community post 29](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/29);
the detailed checklist remains available for follow-up, not proof of completed testing.

- Obtain paired EcoFlow installation/device screenshots and redacted telemetry
  from an actual mixed BK/ES setup, including separate installations if possible.
- Identify stable system identity and membership. An account, serial prefix or
  observed peer list alone is not proof of installation membership.
- Select one authoritative aggregate per real installation. Do not sum a BK
  aggregate and an ES aggregate that already describe the same energy flow.
- Define capacity-weighted SOC only if explicit capacity and non-overlapping
  membership are verified; prefer EcoFlow's authoritative system percentage.
- Specify an explicit, reversible migration with counter/history/Flow impact
  before changing immutable pairing identities. No automatic merge is approved.

**Exit gate:** a real mixed installation and a separate-installation negative
case establish that grouping neither misses batteries nor double counts them.

## Sprint 3 — additional models and capability admission

**Implemented locally, not published:** serial-keyed direct PV total/strings,
conservative omission handling, separate socket/solar-node candidate projection
and an isolated ES21 offline research adapter. Eleven new regression cases replay
public masked night/day/relayed captures and verify admission stays closed.
See [evidence, admission matrix and remaining gates](SPRINT_3_CAPABILITIES_STATUS.md).
No new capability tile, widget, control, Energy source or paired identity.

Use typed adapters and verified model identity, not marketing family names.
ES21, expansion batteries and gateways remain research-gated. ES21 public captures
are parser evidence, not sufficient pairing admission or proof of controls.

Validate each proposed PV, socket, expansion/capacity or gateway capability against
documented units, freshness, source identity and hardware. Avoid displaying an
expansion battery twice when its capacity is already included in system totals.

**Exit gate:** model-specific fixtures, capability tests and physical validation;
unsupported models stay out of the picker rather than falling through to ES22.

## Sprint 4 — useful automation, then verified 5000 controls

**Implemented locally, not published:** the five BK controls and three existing
helpers now require fresh target state and per-step readback. Required missing
settings fail closed, accepted-but-unconfirmed writes stop the sequence, and
warnings retain prior reported settings for manual recovery. No automatic restore.
Price conditions reject missing/expired (>90-minute) session prices, including
inverted conditions; restart/unit changes require a fresh applicable price.
No wattage promise or external authority lock. See the
[implementation and hardware gates](SPRINT_4_CONTROL_SAFETY_STATUS.md).

- First audit existing BK Flow cards for Henry's cheap-tariff/surplus-charging use
  case. Document only supported commands and their actual semantics. External
  Enphase solar is not necessarily STREAM MPPT telemetry; accept an explicit
  external power/price source in a recipe where appropriate.
- Establish whether minimum charge/discharge power or a wattage target is really
  supported. Do not advertise a setpoint where only an operating mode is available.
- Keep 5000 read-only until command support, safe limits, authentication, device
  readback and hardware behaviour are verified. Add rollback/restore and failure
  handling before exposing controls or control widgets.
- Extend widgets only after topology and control semantics are stable; retain
  installation-only Energy sources and make unavailable readings explicit.

**Next-wave audit recorded:** [BK Flow capability audit](BK_FLOW_CAPABILITY_AUDIT.md)
maps existing commands to their actual behaviour and outlines conservative
external-price/surplus recipes. A 700 W minimum-or-idle command is not established;
no new control, Flow or tariff schedule was deployed.

**Exit gate:** safe observed command/readback behaviour and regression coverage;
monitoring success alone cannot certify control support.

## Release policy

Every candidate passes build, lint, the full test suite, full dependency
audit and Homey publish-level validation. Promotion still needs the relevant
hardware gates and explicit authorization to promote to production.
Do not ask users to re-pair simply for Sprint 1 telemetry or guidance changes.

Earlier Sprint 1 verification on 4 October passed 220 tests. Next-wave build,
lint and all 242 tests now pass, with a clean reproducible `npm ci` and zero full
audit findings. Homey publish-level validation and diff whitespace checks also
pass. Local browser rendering checks the support report at mobile width; this
does not validate the endpoint on an actual Homey.
The [tester checklist](TESTER_VALIDATION.md) records on-device settings, numerical
Energy reproduction, restart/soak and mixed-generation positive/negative cases.

## Test release handoff — 4 October 2026

The user authorized the Test release. Implementation is committed/pushed on
`codex/stream-next-wave-test`; GitHub CI, version and upload workflows passed.
Homey build **33 / v1.10.18** is visibly **Test**, and build **18 / v1.10.3**
remains **Live**. The uploaded manifest includes the support endpoint and retains
installation-only Energy meters. No certification submission or hub installation
was performed. Use the [Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/)
with the tester checklist; do not delete/re-pair existing devices for this update.

Remaining next step is hardware validation, including the on-device support view,
numerical Energy/picker reproduction, restart and soak. Mixed-generation discovery
uses [linked-positive and independent-negative cases](MIXED_GENERATION_VALIDATION.md)
before any migration, grouping or 5000 controls. The community release/tester
request is now published as post 29; no later replies are present at the
5 October check. Local follow-up changes are recorded in the validation ledger
and are not part of the already published build 33.

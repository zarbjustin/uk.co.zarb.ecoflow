# Current development roadmap — community feedback and STREAM 5000

Updated: 4 October 2026. This is the current priority order; older sprint documents
remain historical records. Local implementation, automated verification, hardware
validation and store deployment are separate milestones.

## Evidence and current release boundary

- The [Homey developer dashboard](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow)
  currently identifies build 18 / v1.10.3 as Live and build 32 / v1.10.17 as Test.
  An uploaded test build is not automatically the production version.
- The eight available build-18 reports are **manually submitted diagnostics**.
  Seven show repeated Developer API 1006 errors for ES22 devices paired through
  the original `stream` or `stream_unit` interface. One reports a Homey Energy
  charge/discharge calculation concern and contains upstream 500/504 and request
  timeouts. These reports do not establish a process crash or a crash stack.
  Build 32 currently lists no reports. Do not infer error-free hardware behaviour.
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

**Implemented locally:** settings distinguish the Homey integration from the
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

**Implemented locally:** serial-keyed records, correct system versus unit SOC,
capture-verified MPPT and socket flow edges, conservative ambiguous-unit power,
role-specific availability, privacy redaction and replay/lifecycle coverage.
Driver identities and existing kWh checkpoints are preserved. Physical monitors
remain excluded from Energy; do not restore their Energy meters as a shortcut.
Lifecycle replay verifies saved-total restoration, restart anchoring, duplicate
timestamps and an oversized reconnect gap. A graceful-restart simulation is not
proof that an abrupt process crash cannot lose unflushed checkpoint increments.

**Next-wave code audit completed locally:** initial BK counter baselines now
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

The user reports that EcoFlow's app can combine original and new-generation
batteries. Support that arrangement only after determining how the API represents
membership, aggregate SOC/capacity and system power.

The [mixed-generation discovery plan](MIXED_GENERATION_VALIDATION.md) now records
the user-supplied first-hand linked-system evidence, positive/negative cases,
linking history risk, API-source/control-scope questions and implementation gates.
Recruit already-linked installations first; do not ask users to link/unlink
solely for testing or assume that the current AC-5000-only registry admits the
PV-equipped STREAM 5000. The tester request is a draft, not a sent message.

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

Use typed adapters and verified model identity, not marketing family names.
ES21, expansion batteries and gateways remain research-gated. ES21 public captures
are parser evidence, not sufficient pairing admission or proof of controls.

Validate each proposed PV, socket, expansion/capacity or gateway capability against
documented units, freshness, source identity and hardware. Avoid displaying an
expansion battery twice when its capacity is already included in system totals.

**Exit gate:** model-specific fixtures, capability tests and physical validation;
unsupported models stay out of the picker rather than falling through to ES22.

## Sprint 4 — useful automation, then verified 5000 controls

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
hardware gates and explicit authorization to version, commit/push and deploy.
Do not ask users to re-pair simply for Sprint 1 telemetry or guidance changes.

Earlier Sprint 1 verification on 4 October passed 220 tests. Next-wave build,
lint and all 242 tests now pass, with a clean reproducible `npm ci` and zero full
audit findings. Homey publish-level validation and diff whitespace checks also
pass. Local browser rendering checks the support report at mobile width; this
does not validate the endpoint on an actual Homey.
The [tester checklist](TESTER_VALIDATION.md) records on-device settings, numerical
Energy reproduction, restart/soak and mixed-generation positive/negative cases.
No version bump, commit/push or deployment has been performed for these changes.

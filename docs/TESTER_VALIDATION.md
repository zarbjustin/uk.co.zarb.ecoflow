# Next-wave tester validation

## Socket/configuration Test release: v1.10.21 / build 36

The published Test release corrects ES22 battery-to-backup-socket discharge and
adds read-only configuration to **Show support report**, schema 4. Existing
pairing, identity, saved counters and installation-only Homey Energy stay intact.
Do not delete or re-pair devices for this increment.
[Install Test](https://homey.app/a/uk.co.zarb.ecoflow/test/); publication is confirmed,
but hardware acceptance is not. Production has not been changed.

After release, an owner should compare a normal safe backup-socket load in
EcoFlow and Homey against the installation's signed battery power. With minimal
other flows, 45 W discharging for ten minutes adds about 0.0075 kWh to discharged
energy, not charged energy or grid export. Changing PV/grid conditions require
a time series rather than that constant-load approximation. Use equipment
normally operated within manufacturer instructions; no wiring/grouping changes.
Optional physical-unit monitors must remain outside Homey Energy. Linked-unit
signed power may remain blank when attribution cannot be established.

Capture configuration at the same time as EcoFlow settings screenshots:
input/output limits, mode, reserve and schedules. Per-field age is receipt age,
not device revision; old cloud replies may arrive late. Empty support values
mean not observed this session, not disabled settings. Check task deletion,
zero-watt tasks and overnight schedules by observing normal EcoFlow-app use.
No Homey controls or new requests are added. Do not alter settings solely to
test an unverified control. Review report contents before sharing: schedules
and energy patterns can reveal household activity even without identifiers.

Complete charge/discharge/idle, restart/reconnect and a 24–48-hour soak for ES21
and ES22 separately. For mixed-generation research, use already-linked systems
and compare authoritative system SOC with the unit percentages; account lists
and matching SOC are not installation membership. An independent-installation
negative case is required before any consolidation.

## Expansion-discovery follow-up (Test v1.10.19 / build 34)

The [Sprint 5 candidate](SPRINT_5_EXPANSION_DISCOVERY.md) adds support schema 3:
anonymous cached account inventory and serial-keyed peer-field visibility.
After installing Test v1.10.19, open a beta pairing device list and cancel
without adding/deleting anything, then use **Show support report**. Opening
pairing uses its existing account-list request; the report itself makes none.
Account inventory resets after app restart/account changes and may be stale.
It includes four-character prefixes and controlled product-category hints, not
full serials/names. Peer-field flags describe fields seen during the session,
not fresh readings, certified membership, expansion count or capacity.

Owners of already-configured host-plus-expansion, Gateway, Dual CT or 3000
systems can supply time-aligned system/host/pack screenshots and their actual
configuration. Missing discovery entries do not prove absence of nested packs.
No new pairing support, Energy meters or controls are enabled for these products.
Do not change EcoFlow grouping or electrical configuration just for testing.

## ES21 follow-up (Test v1.10.19 / build 34)

The [model expansion candidate](STREAM_MODEL_COVERAGE.md) adds STREAM 5000 ES21
core monitoring through the two existing default-off beta choices. Test publication
is complete; hardware acceptance is still open. After installing this Test
release, compare ES21 system/unit percentage, signed battery watts and counters
through charging (including direct PV), discharging, idle, silence/reconnect and
restart, then a 24–48-hour soak. Check linked units and independent installations
without changing their EcoFlow grouping. Extra PV/string tiles and controls are
not enabled. Existing devices do not need deletion/re-pairing for model admission.
Use one installation Home Battery for Energy, with optional non-Energy monitors.

## Published Test baseline

Published 6 October 2026: **v1.10.19 / build 34 / Test**.
[Install the Test build](https://homey.app/a/uk.co.zarb.ecoflow/test/) and confirm
the installed version before collecting evidence. Production remains v1.10.3 /
build 18. No device was installed on a live Homey as part of publication; hardware
validation and the on-device support endpoint remain to be checked.

## What changes, and what stays the same

- Corrected 5000 system/unit percentages and captured flow mappings; ambiguous
  linked-unit signed power is blank rather than a copied aggregate value.
- Original STREAM counter baselines now checkpoint even before totals increase;
  failed writes remain pending and retry. Newer MQTT supersedes stale REST
  replies, including equal-millisecond and queued-reply races.
- Settings offer **Show support report**: installed app/Homey versions, beta
  access, packaged/registered drivers, anonymous accounting evidence.
- ES21 core monitoring is now admitted behind the default-off beta switch.
- No driver rename, immutable identity change, automatic grouping, unverified model
  admission, unit Energy meters or 5000 control commands. Existing devices and
  counter checkpoints remain. Do not delete/re-pair simply to test this update.

## Minimum evidence for a report

1. Installed EcoFlow Homey app version and store channel; Homey OS and mobile-app
   version. Capture **Show support report** in the Homey integration settings.
   It is local, on-demand and makes no EcoFlow request. It excludes passwords,
   keys, account information, names and serials, but includes energy totals;
   review it before sharing. Per-device entries are anonymous, not stable IDs.
2. Time-aligned EcoFlow system/device and Homey battery/Energy screenshots,
   with timestamps. Crop account details, serials and unrelated personal devices.
3. For a discrepancy, give the expected and observed number, W versus Wh/kWh,
   and elapsed time. Describe charging/discharging/idle and any restart or loss
   of connection. A manual diagnostic submission is not itself a process crash;
   say explicitly if Homey restarted the app.

## Missing beta choices (Ed's report)

Enable beta pairing in **Homey → EcoFlow integration → Settings**, not EcoFlow's
mobile app. Inspect the device picker without deleting anything. The beta switch
permits pairing; it cannot install a version or register new driver types.

Compare the report's `packaged` and `registered` fields for
`stream_5000_system` / `stream_5000_unit`. If both are true but the choices are
absent, retain the client screenshot/mobile version and investigate the picker.
If a field is false, investigate installed manifest/runtime registration first.
The report cannot inspect the mobile picker or infer Live/Test store channel.
Do not prescribe a region switch, reinstall or destructive repair as a proven fix.

## Single AC 5000 / original STREAM accounting

Use the installation **Home Battery** for Homey Energy. A physical monitor is
optional and excluded from Energy. For each charge, discharge and idle state:

- Compare system percentage and signed watts. Homey positive means charging,
  negative means discharging; EcoFlow may show a positive magnitude plus state.
- Note charged/discharged kWh at the start and end of a known interval. For
  roughly constant 600 W over ten minutes, the matching bucket should rise by
  approximately 0.1 kWh. Varying power requires a time series, not one screenshot.
- Original BK devices prefer device counters once observed; missing counter
  frames then do not integrate power again. If only one counter has appeared,
  obtain a diagnostic showing whether the other counter ever arrives before
  changing that policy. First counter samples anchor, not import historical totals.
- 5000 totals currently integrate observed signed power. Restart should restore
  saved totals; the first subsequent sample must not backfill downtime. Gaps
  longer than one hour are discarded/re-anchored. This is an estimate, not a
  recovery of unobserved energy or EcoFlow historical totals.
- Perform a normal app restart and compare saved totals. Abrupt termination can
  lose unflushed checkpoint increments; multi-key persistence is not a transaction.
  Do not claim crash-proof accounting or rewrite old Energy history.

Report `source`, `skippedSamples`, `ignoredGaps`, `counterResets` and checkpoint
`failures` alongside numerical differences. `counterResets` counts observed raw
decreases handled by the existing reset policy; it is not proof of a firmware reset.

## Linked, socket-loaded and PV-capable installations

- Verify authoritative system SOC against each unit SOC; compare units at visibly
  different percentages. Never substitute one unit SOC or a simple average.
- For linked units, verify ambiguous signed unit power/state clears while system
  power remains available. Missing unit direction is intentional until validated.
- Check grid import with an AC socket load and direct MPPT charging when present.
  Parser fixtures alone do not admit an unverified product model to pairing.
- Complete a 24–48-hour soak covering charge/discharge/idle, reconnect and stale
  telemetry availability. Unknown/unit-only frames must not keep an aggregate
  online without usable system data.

## Mixed-generation research (no automatic merge)

The [Sprint 2 increment](SPRINT_2_TOPOLOGY_STATUS.md), now in Test v1.10.19, adds
anonymous observed-peer counts/freshness and possible aggregate overlap. These
are retained in support schema 3. Collect its report without deleting or re-pairing devices.
Overlap hints are not verified membership; empty hints are not proof of independent
systems. Continue to supply time-aligned screenshots and private redacted evidence.

Seek one volunteer with original BK and new ES batteries combined in EcoFlow,
and a negative case where separate installations share an account. Request:

- EcoFlow's installation overview, combined battery percentage/capacity, and
  individual unit pages at the same time.
- Whether the units were deliberately grouped, and whether EcoFlow shows one
  or separate installations before/after grouping.
- Redacted membership and flow evidence through requested diagnostics. Do not
  publish full raw/private dumps or credentials in the repository.

Do not sum existing BK/ES Home Batteries experimentally in Homey Energy: their
reported aggregates may overlap. No automatic merge or migration is part of this
candidate. Stable membership, authoritative SOC/capacity and disjoint power must
be understood before implementing consolidation.

## Original BK control candidate (Sprint 4, Test v1.10.19)

Only test after installing this Test release. Do not delete/re-pair for
these changes. Use a controllable original BK installation, record prior mode,
feed-in, charge/discharge limits and reserve, and resolve competing schedules/AI
before testing. No 5000 control contract or write is admitted by this increment.

- Compare the main target's reported controls before/after each action and UI
  setting. Check normalization, already-matching no-op requests and reserve /
  discharge ordering. Observe actual power separately: API/readback success does
  not prove charging/export at any wattage.
- Where safely reproducible, distinguish API acceptance from an unapplied
  setting. Confirm read failure/missing required fields stops the action without
  cached success; partial sequences stop without further commands. Review prior
  settings in the warning and restore the complete normal configuration manually.
  No automatic rollback or automatic retry of a write is expected.
- Check concurrent Flows against one installation, another installation, and
  an EcoFlow policy change between steps. This app serializes its own target
  writes, but cannot lock other clients; don't deliberately stress live devices.
- Restart/unload during readback: no subsequent command or queued operation
  should resume from the old session. A sent command may still have applied;
  review EcoFlow before retrying.
- Feed a valid current negative, zero and positive price. Verify both price
  conditions reject missing/>90-minute-old prices, including inverted conditions.
  Restart or changing units also requires a fresh price. Refresh at least hourly.
  The displayed last price is not freshness proof, and expiry must not be assumed
  to undo an earlier charging policy. Test explicit normal-state/failure Flows.
- Repeat charge, discharge and idle measurements after restoring normal settings;
  preserve numerical Energy evidence and the separate 24–48-hour soak gate.

## Promotion gate (all increments)

The [Sprint 3 research increment](SPRINT_3_CAPABILITIES_STATUS.md) is in
Test v1.10.19 but does not add PV/socket tiles. ES21 users can use the dedicated
beta model admission and contribute redacted, time-aligned EcoFlow device/system
evidence; do not force an AC-5000 identity or change an installation for testing.
Distinguish direct MPPT strings from the solar-system node, and record each
unit's page separately. Expansion/gateway evidence must show capacity units and
whether expansion energy is already included in the installation total.

Automated build/lint/tests/audit/Homey validation must pass. On-device settings
and the support endpoint must work. Complete the relevant live matrices and soak,
retain the unresolved calculation/picker reports until reproduced or explained,
and seek explicit authorization to promote to production. No hardware pass is implied by a
local test or a successfully uploaded package.

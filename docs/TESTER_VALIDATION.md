# Next-wave tester validation

Published 4 October 2026: **v1.10.18 / build 33 / Test**.
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
- No driver rename, immutable identity change, automatic grouping, new model
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

## Promotion gate

Automated build/lint/tests/audit/Homey validation must pass. On-device settings
and the support endpoint must work. Complete the relevant live matrices and soak,
retain the unresolved calculation/picker reports until reproduced or explained,
and seek explicit authorization to promote to production. No hardware pass is implied by a
local test or a successfully uploaded package.

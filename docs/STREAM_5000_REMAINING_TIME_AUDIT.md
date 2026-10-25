# STREAM 5000 configuration and remaining-time review

25 October 2026 — diagnostic branch only, unpublished. No battery commands,
installed app update, new capture setting, pairing or Energy change.

## Configuration presentation

The owner's native EcoFlow app was inspected read-only before this implementation.
Its system settings corroborate the reported mode, charge/discharge limits and
grid-power limits. The battery-management view independently shows reserve
enablement, with its stored percentage hidden when disabled. This is a display
comparison, not a command, electrical-capacity or limit-enforcement test. Private
screenshots, device addresses and household numeric readings are not retained here.

Homey now uses these English labels (with German/Dutch translations):

| Capability identity, unchanged unless noted | Display |
| --- | --- |
| `stream_5000_charge_limit` | Charge limit |
| `stream_5000_discharge_limit` | Discharge limit |
| `stream_5000_grid_input_limit` | Max Power from Grid |
| `stream_5000_grid_output_limit` | Max grid-tied output power |
| `stream_5000_backup_reserve` | Backup reserve target (stored) |
| `stream_5000_backup_reserve_state` (new, read-only) | Backup reserve: Enabled / Disabled |

Existing mode IDs are preserved; `self_powered` displays Self-consumption and
`custom` displays Custom mode. No legacy Flow argument or writer changes.
Only known default capability titles migrate; custom titles/options survive.
An optional capability-add failure does not prevent telemetry subscription.
Reserve state and target independently expire from session-only observations.
Missing/stale state is unknown, never interpreted as disabled. A stored target
does not request charging or prove active protection. Neither grid limit is a
charging-task setpoint or approval of electrical wiring. The report explains
subscription-source versus independently verified system scope.

## Remaining time: not yet mapped

The native device page displays a discharge time estimate. The current 5000
parser/lifecycle does not expose a duration. Existing `StreamRemainingTime`
handles original BK-series named BMS/CMS estimates; that is not evidence of an
ES21/ES22 duration field or of matching unit/system semantics.

Reviewed primary developer implementation:
[STREAM AC 5000 parser at 6830cd3](https://github.com/shuette42/ecoflow-energy-ha/blob/6830cd3649c1a4f3603d9379157fba5ee88e1f63/custom_components/ecoflow_energy/ecoflow/parsers/stream_ac5000_proto.py).
This pinned parser maps no charge/discharge-duration field. Its BMS capacity
fields are electrical charge (mAh), not minutes or directly usable energy (Wh).
`f33.7`/`f33.8` are SOC-limit copies, while `f33.9` is not a confirmed timer.
Task window minutes are schedule boundaries, not time remaining. New upstream
power/PV mappings are separate from this investigation and were not imported.

The official [STREAM documentation page](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
could not be retrieved by the documentation reader in this pass; this is not a
claim that EcoFlow documents no such field. Existing owner Developer API quota
access for ES21 returned unsupported; no new endpoint probing or secret extraction
was performed in this implementation turn.

Public masked ES21/ES22 core, BMS, linked-unit, socket and configuration fixtures
were replayed. Regression tests ensure the existing decoder does not invent a
duration, borrow a BK named field, or turn SOC/power/capacity into an estimate.
These tests freeze a safe absence; they do not prove the protocol cannot carry
a timer. No blank/guessed timer capability is added.

### Evidence needed before enabling a timer

1. Owner-only, locally retained, time-aligned native-app and passive telemetry
   observations through natural discharge, idle and charging transitions.
2. Identify a reported duration or a corroborated app calculation, its units,
   unknown/sentinel behaviour, update cadence, SOC/reserve target and whether it
   belongs to the device pack or combined system. Numeric coincidence is not proof.
3. Enforce independent receipt expiry, fresh matching direction and a new estimate
   after direction changes. Never refresh a timer with unrelated packets or
   reuse a pre-restart estimate. Separate receipt from successful Homey writes.
4. Test malformed/zero/sentinel values, linked/expansion scope, late writes,
   reconnects and clock changes before adding a read-only capability. Do not
   reuse BK behaviour solely because both families share a BMS command number.

No further Robert capture is requested. The owner's hardware can provide the
next observations without changing its settings; controlled transitions require
separate bounded authorisation.

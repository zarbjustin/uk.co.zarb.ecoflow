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

## Owner follow-up and passive observer preparation

Later read-only native checks found two distinct changing estimates: the main
device card and the expanded battery panel disagree, including after normal page
navigation. This is not evidence that either is a verified system- or pack-scoped
timer. The simple displayed-capacity/SOC/power calculation does not reproduce
them reliably. The standard API returned 1006 for both full quota and targeted
named remaining-time reads; this does not prove the app protocol has no timer.
The official page was subsequently readable in the browser: it still presents
BK-series examples, with no ES21/ES22 duration contract identified there.
No private captures or numeric household observations are added to this document.

The diagnostic branch now prepares `Stream5000TimeObserver`:

- Runtime gate is **false**. Construction does not start collection; no current
  device code calls `start()`. No setting, Flow, public/private API route or saved
  flag can activate it. Tests exercise explicit-start enabled instances locally.
- It taps the existing frame callback only. There is no new MQTT connection,
  polling, get request, command publication, credential access, file write,
  log output or telemetry/counter/availability update from the observer.
- Only the exact subscribed property/get-reply topics and unencrypted, valid
  `254/39`, `32/2`, `32/50` headers are eligible. Foreign headers, set messages,
  acknowledgements and unknown commands are not candidates.
- Selection is structural, not semantic: numeric leaves in `254/39 f11/f33/f44`,
  the exactly matching serial's `f50.1/f54.1` record, `32/2 f1`, and selected BMS
  scalar positions. Scope labels describe those locations, not timer ownership.
  No minutes/seconds scaling, capacity formula, zero-fill or BK field borrowing.
  The `f44` summary does not replace BMS readings or prove the expanded-panel
  source. This narrow selection is not exhaustive; absence is not proof that
  another command/path cannot carry a timer. Repeated unknown pack lists are not
  flattened into an assumed single battery.
- Strings, serials, peer records, raw buffers, packed arrays, task windows and
  undeclared groups are not retained. Non-finite/unsafe/oversized numbers and
  duplicate selected fields/own records are rejected. Numeric unknowns remain
  private research data, not guaranteed anonymous or safe for public sharing.
- Receipt timestamps come from the observer's clock, not device time or a
  caller-supplied timestamp. Reads do not renew them. Each command is sampled
  at most once per five-second interval (bundle siblings retain one receipt).

| Limit | Hard preparation bound |
| --- | --- |
| Collection | At most 2 minutes after explicit start |
| Evidence access | Expires 10 minutes after start, not after last read/receipt |
| Frame / cumulative inspected bytes | 16 KiB / 2 MiB |
| Inspected frames / retained samples | 512 / 64 |
| Retained scalar rows / rows per header | 2,048 / 48 |
| Headers / parsed fields per frame | 8 / 1,024 |

There is no additional timer. Deadline checks run on every observation/status/
private read and on the existing watchdog. Expired evidence is never returned;
idle in-memory cleanup happens on the next watchdog tick (nominally within one
minute), not a new scheduled task. Clock rollback or invalid clock purges the
evidence. Explicit device-driver resubscription, teardown and deletion close/
purge it; no automatic restart. The shared broker's transparent reconnects are
not signalled by the existing two-argument frame callback. A future activation
must also bind capture lifetime to a transport-session epoch (or explicitly
close it on broker/account replacement); driver-resubscription tests alone do
not prove that additional boundary. The runtime gate stays false.

`status()` and the device's `getTimeObserverDiagnostics()` return only fixed
status/counts/limits. Explicit local `readEvidence()` returns cloned, bounded,
historical numeric candidates; **no support report, log, UI, Flow, Insights or
Energy export calls it**. General integration reports remain unchanged. A future
activation and private export/annotation workflow requires separate owner
authority and tests. Nothing was activated, installed or published in this wave.

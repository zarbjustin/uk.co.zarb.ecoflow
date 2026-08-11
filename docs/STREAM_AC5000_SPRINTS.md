# STREAM AC 5000 monitoring improvement sprints

Status: code complete for the next test build. Live validation remains a release gate.

## Sprint 1 — battery visibility and Homey Energy

- The V1.1.4.35 telemetry layout is covered by the tester's redacted `254/39`
  fixture. The serial-keyed float `f50.1.2` is preferred, with integer
  `f54.1.2` as its fallback; the original `f11.5` and precise `f33.6` values
  retain precedence.
- The AC 5000 installation is declared through `stream_5000_system` as a Homey
  Energy home battery with persistent charged/discharged meters.
- `stream_5000_unit` is an optional physical monitor using custom power
  capabilities, so pairing both roles cannot duplicate Homey Energy.
- This role split predates general availability. Existing app-connected test
  devices migrate to physical monitors; users add the new aggregate separately,
  without carrying a permanent Energy-compatibility layer.

Acceptance evidence to collect on the test build:

1. EcoFlow device percentage equals Homey's `measure_battery` value.
2. The installation aggregate appears in Homey Energy as a home battery; its
   optional physical-unit monitor does not appear as a second battery.
3. The verified discharge case remains unchanged: 381 W discharge is `-381 W`
   in Homey, split into 380 W home use and 1 W export.

## Sprint 2 — bounded diagnostics

- Each 100-frame summary includes subscription state, usable-telemetry age,
  per-command `frames/parsed/unparsed` counts and an allow-listed capability
  snapshot.
- Unparsed samples are grouped by command and coarse payload shape. Up to eight
  shapes are retained, samples refresh no more than every 15 minutes, and a
  session has a hard budget of 24 raw samples.
- Device settings include **Capture next telemetry snapshot**. Enable it just
  before comparison screenshots; the next `254/39` cycle is logged and the
  switch resets automatically.
- Full serials, credentials, tokens and arbitrary settings never enter the
  capability snapshot. Raw samples retain the existing serial redaction and
  192-byte cap.

## Sprint 3 — monitoring validation and stale-data hardening

- The charging-state deadband and signed power convention remain unchanged.
- Regression coverage includes the tester's 81%, -381 W, 380 W home and 1 W
  export case.
- Impossible SoC, health, temperature, battery-power and negative import/export
  readings are rejected instead of overwriting a known-good value.
- Availability is based on the age of the last **usable parsed telemetry**, not
  merely receipt of an unknown frame. A protocol change therefore cannot leave
  stale values looking online indefinitely.

Live test matrix:

| State | EcoFlow evidence | Homey expectation |
| --- | --- | --- |
| Charging | positive charging watts and SoC | aggregate: positive `measure_power`; unit: positive custom battery flow; both `charging` |
| Discharging | positive EcoFlow discharge magnitude | aggregate: negative `measure_power`; unit: negative custom battery flow; both `discharging` |
| Idle | zero or near-zero battery power | `idle` inside the 5 W deadband |
| Connection loss | no current telemetry | unavailable after the configured age |
| Reconnection | new MQTT telemetry | available with fresh values |

## Sprint 4 — release hardening

Before promotion beyond Test:

- Run build, lint, unit tests and `homey app validate --level publish`.
- Remove the pre-split test device and pair the installation aggregate, then
  optionally pair its physical-unit monitor.
- Complete the state matrix above and submit one requested diagnostic snapshot.
- Complete a 24–48-hour soak including at least one MQTT reconnect.
- Confirm English, German and Dutch setting copy on-device.

Controls remain deferred. EcoFlow has no supported public API for this model;
charged/discharged totals are therefore derived from signed battery power with
persistent checkpoints and stale-gap protection.

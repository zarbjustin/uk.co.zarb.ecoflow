# STREAM AC 5000 monitoring improvement sprints

Status: code complete for the next test build. Live validation remains a release gate.

## Sprint 1 — battery visibility and Homey Energy

- The V1.1.4.35 telemetry layout is covered by the tester's redacted `254/39`
  fixture. The serial-keyed float `f50.1.2` is preferred, with integer
  `f54.1.2` as its fallback; the original `f11.5` and precise `f33.6` values
  retain precedence.
- The AC 5000 is declared as a Homey Energy home battery instead of as a device
  powered by an internal replaceable battery.
- Existing paired devices receive the manifest energy update automatically;
  removal and re-pairing is not required.

Acceptance evidence to collect on the test build:

1. EcoFlow device percentage equals Homey's `measure_battery` value.
2. The device appears in Homey Energy as a home battery.
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
| Charging | positive charging watts and SoC | positive `measure_power`, `charging` |
| Discharging | positive EcoFlow discharge magnitude | negative `measure_power`, `discharging` |
| Idle | zero or near-zero battery power | `idle` inside the 5 W deadband |
| Connection loss | no current telemetry | unavailable after the configured age |
| Reconnection | new MQTT telemetry | available with fresh values |

## Sprint 4 — release hardening

Before promotion beyond Test:

- Run build, lint, unit tests and `homey app validate --level publish`.
- Install the Test build without deleting the existing AC 5000 device.
- Complete the state matrix above and submit one requested diagnostic snapshot.
- Complete a 24–48-hour soak including at least one MQTT reconnect.
- Confirm English, German and Dutch setting copy on-device.

Controls and cumulative charged/discharged energy remain deferred. EcoFlow has
no supported public API for this model, and neither write fields nor cumulative
energy counters have been verified on the tester's hardware.

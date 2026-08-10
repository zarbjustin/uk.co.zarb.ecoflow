# STREAM 5000 family architecture

## Purpose

EcoFlow's 5 kWh STREAM platform contains multiple products. A Homey driver must
therefore represent a stable function and protocol family rather than one launch
SKU. The active driver is `stream_5000_unit`; `stream_ac5000` is retained as a
deprecated compatibility driver for devices paired before this structure existed.

Current verified support is deliberately narrower than the product catalogue:

| Product | Serial evidence | Telemetry adapter | Pairable |
|---|---|---|---|
| STREAM AC 5000 | `ES22` | `es22` | Yes, monitoring only |
| STREAM 5000 | Not yet verified | None | No |
| STREAM Expansion Battery 5000 | Not yet verified | None | No |
| STREAM Gateway | Not yet verified | None | No; likely a separate functional driver |

Product names on a website or in an API response are not protocol evidence.
Unknown prefixes must remain absent from pairing even when their names contain
`STREAM 5000`.

## Boundaries

- `lib/stream5000Models.ts` is the allow-list of verified products, exact serial
  prefixes and adapter IDs. It also owns the shared current/compatibility driver
  ID list used by pairing and credential cleanup.
- `lib/stream5000Adapters.ts` connects an admitted model to parsing, mapping and
  privacy-safe diagnostic functions.
- `lib/stream5000Pairing.ts` is the shared app-auth discovery and pairing path.
- `lib/Stream5000UnitDevice.ts` owns transport-independent lifecycle,
  availability, capability application and cross-driver credential cleanup.
- Model-specific protocol code remains isolated. ES22 continues to use
  `streamAc5000Protocol`, `streamAc5000Mapping` and `streamAc5000Diagnostics`.

The model registry and adapter registry are intentionally separate. Adding a
serial prefix without a registered parser is a build-time/code-review error;
reusing the ES22 parser for an unverified product is not permitted.

## Driver policy

- `stream_5000_unit`: one Homey device per physical 5000-family battery or
  inverter/battery unit.
- A future installation-level aggregate should use `stream_5000_system`, so
  whole-home totals are not mixed with physical-unit telemetry.
- A gateway, meter, solar-only component or other different Homey Energy role
  receives a separate driver even if it shares app authentication and MQTT.
- Exact product names and icons belong to paired devices; the driver remains a
  family-level pairing entry.
- App-auth products remain monitoring-only until both command payloads and safe
  state verification are demonstrated on real hardware.

## Homey Energy accounting

Every supported physical battery follows Homey's home-battery contract:

- `measure_power` is positive while charging and negative while discharging.
- `measure_battery` is the current state of charge.
- `meter_power.charged` and `meter_power.discharged` are separate, cumulative
  kWh totals and are mapped through `meterPowerImportedCapability` and
  `meterPowerExportedCapability`.

When a verified telemetry adapter does not expose native lifetime counters, the
shared lifecycle derives both totals by integrating signed battery power. The
first sample only establishes a timestamp, totals are checkpointed in Homey's
device store and flushed during teardown, and intervals longer than the shared
maximum are ignored and re-anchored. This deliberately favours a small
undercount after an outage over inventing energy from a stale reading.

If a future product exposes native cumulative charged/discharged counters, its
adapter should surface and follow those counters with reset protection instead
of also integrating power. Never combine both sources for the same interval.

## Adding a product safely

Complete all of the following before exposing another model:

1. Capture the app API device-list entry and establish an exact serial prefix.
   Remove account identifiers and all but a short serial suffix from evidence.
2. Capture multiple MQTT samples across charging, discharging, idle and offline
   states. Diagnostics must remain bounded and serial-redacted.
3. Implement a dedicated parser and mapping adapter. Validate units, sign
   conventions, ranges, delta-frame behaviour and stale-data handling.
4. Add fixtures for valid, partial, malformed and unrelated frames.
5. Add the adapter ID to `Stream5000TelemetryAdapterId` and register the adapter
   in `stream5000Adapters.ts`.
6. Only then add the product and its exact prefix to `stream5000Models.ts`.
7. Confirm the Homey class, capabilities and Energy contribution. Do not expose
   both an aggregate and its physical members as `homeBattery` if that duplicates
   the same power.
8. Add product naming, imagery, translations, pairing copy and diagnostics tests.
9. Run TypeScript, lint, the full test suite and Homey validation, followed by a
   Test-channel installation on the real product.
10. Update the support table above and the public documentation.

## Compatibility

Homey identifies a device using its immutable `data` object together with its
driver ID. Existing `stream_ac5000` devices therefore cannot move transparently
to `stream_5000_unit`.

The legacy driver is marked `deprecated: true`: it remains operational but no
longer appears in Add Device. Both drivers use the same lifecycle and shared
app-auth session. Stored EcoFlow credentials are removed only after the last
device across both drivers is deleted. Pairing also suppresses serial numbers
already present under either driver, preventing the same physical battery from
being counted twice in Homey Energy. The current tester can delete the legacy
device and re-pair through `stream_5000_unit` when convenient; no forced
migration is required.

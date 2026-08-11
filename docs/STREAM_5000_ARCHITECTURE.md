# STREAM 5000 family architecture

## Purpose

EcoFlow's 5 kWh STREAM platform contains multiple products. Homey devices are
therefore split by energy role rather than launch SKU: `stream_5000_system` is
the installation-level Home Battery and `stream_5000_unit` is a physical-unit
monitor. The deprecated `stream_ac5000` ID has the same non-Energy unit role.

Current verified support is deliberately narrower than the product catalogue:

| Product | Serial evidence | Telemetry adapter | Pairable |
|---|---|---|---|
| STREAM AC 5000 | `ES22` | `es22` | Yes: one installation aggregate and an optional unit monitor |
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
  availability, role-specific capability application and cross-driver credential cleanup.
- Model-specific protocol code remains isolated. ES22 continues to use
  `streamAc5000Protocol`, `streamAc5000Mapping` and `streamAc5000Diagnostics`.

The model registry and adapter registry are intentionally separate. Adding a
serial prefix without a registered parser is a build-time/code-review error;
reusing the ES22 parser for an unverified product is not permitted.

## Driver policy

- `stream_5000_system`: one Homey Energy Home Battery per verified 5000-family
  installation. Until EcoFlow exposes a stable group/gateway identifier, each
  ES22 serial is deliberately treated as a singleton installation.
- `stream_5000_unit`: an optional monitor for one physical 5000-family battery
  or inverter/battery unit. It uses custom power capabilities and never
  contributes to Homey Energy.
- A gateway, meter, solar-only component or other different Homey Energy role
  receives a separate driver even if it shares app authentication and MQTT.
- Exact product names and icons belong to paired devices; the driver remains a
  family-level pairing entry.
- App-auth products remain monitoring-only until both command payloads and safe
  state verification are demonstrated on real hardware.

## Homey Energy accounting

Every supported installation aggregate follows Homey's home-battery contract:

- `measure_power` is positive while charging and negative while discharging.
- `measure_battery` is the current state of charge.
- `meter_power.charged` and `meter_power.discharged` are separate, cumulative
  kWh totals and are mapped through `meterPowerImportedCapability` and
  `meterPowerExportedCapability`.

When a verified aggregate telemetry adapter does not expose native lifetime counters, the
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
7. Confirm the Homey class, capabilities and Energy contribution. Add the model
   to the aggregate and unit roles together; only the aggregate may expose
   `homeBattery`, `measure_power` or charged/discharged Energy meters.
8. Add product naming, imagery, translations, pairing copy and diagnostics tests.
9. Run TypeScript, lint, the full test suite and Homey validation, followed by a
   Test-channel installation on the real product.
10. Update the support table above and the public documentation.

## Compatibility

Homey identifies a device using its immutable `data` object together with its
driver ID. The role split was made before STREAM 5000 support reached general
availability, so no permanent Energy-compatibility layer is carried forward.
An earlier app-connected test device is migrated in place to the non-Energy
physical-monitor role. Test installations then pair the new Home Battery
aggregate and may keep or delete the older monitor as preferred.

All three app-auth driver IDs share one account lifecycle. Stored EcoFlow
credentials are removed only after the last aggregate or unit device is deleted.
Duplicate suppression is role-scoped: one serial can appear once as an aggregate
and once as a physical monitor, but never twice within either role.

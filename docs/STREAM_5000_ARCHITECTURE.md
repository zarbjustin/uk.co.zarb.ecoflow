# STREAM 5000 family architecture

## Purpose

EcoFlow's 5 kWh STREAM platform contains multiple products. Installation-level
devices therefore use the existing `stream` driver and appear to users simply
as **STREAM Home Battery**, regardless of generation. `stream_5000_unit` is an
optional physical-unit monitor. The deprecated `stream_ac5000` ID has the same
non-Energy unit role.

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
- `drivers/stream/driver.ts` owns the unified pairing choice and uses Homey's
  supported `onMapDeviceClass` hook to select the Developer-API or app-connected
  runtime from immutable device identity and stored profile metadata.
- Model-specific protocol code remains isolated. ES22 continues to use
  `streamAc5000Protocol`, `streamAc5000Mapping` and `streamAc5000Diagnostics`.

The model registry and adapter registry are intentionally separate. Adding a
serial prefix without a registered parser is a build-time/code-review error;
reusing the ES22 parser for an unverified product is not permitted.

## Driver policy

- `stream`: one Homey Energy Home Battery per STREAM installation, including a
  verified 5000-family installation. Until EcoFlow exposes a stable
  group/gateway identifier, each ES22 serial is deliberately treated as a
  singleton installation.
- `stream_5000_unit`: an optional monitor for one physical 5000-family battery
  or inverter/battery unit. It uses custom power capabilities and never
  contributes to Homey Energy.
- A gateway, meter, solar-only component or other different Homey Energy role
  receives a separate driver even if it shares app authentication and MQTT.
- Product generation is a stored internal profile, not a public driver. Exact
  product names and icons belong to optional physical monitors; the Home Battery
  remains a stable installation-level pairing entry.
- App-auth products remain monitoring-only until both command payloads and safe
  state verification are demonstrated on real hardware.
- Pairing supplies a model-specific capability array. Flow cards that require
  Developer-API controls are filtered by `operating_mode`, so an app-connected
  5000 Home Battery never exposes unsupported controls.

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
7. Confirm the Homey class, capabilities and Energy contribution. Admit the
   installation through the shared `stream` Home Battery profile and the unit
   through `stream_5000_unit`; only the Home Battery may expose `measure_power`
   or charged/discharged Energy meters.
8. Add product naming, imagery, translations, pairing copy and diagnostics tests.
9. Run TypeScript, lint, the full test suite and Homey validation, followed by a
   Test-channel installation on the real product.
10. Update the support table above and the public documentation.

## Compatibility

Homey identifies a device using its immutable `data` object together with its
driver ID. The short-lived `stream_5000_system` test driver was removed before
general availability. Test users remove that device and pair the same ES22
through `stream`; no permanent duplicate public driver is carried forward.

The current and deprecated app-auth driver IDs share one account lifecycle.
Stored EcoFlow credentials are removed only after the last verified 5000 Home
Battery or physical unit is deleted. Duplicate suppression is role-scoped: one
serial can appear once as a Home Battery and once as a physical monitor, but
never twice within either role. The legacy system ID remains only in the
cross-driver duplicate/cleanup registry during the test transition.

## Reversibility and future separation

The shared public Home Battery is a presentation and identity decision, not a
protocol merge. The 5000 model allow-list, app authentication, MQTT transport,
telemetry adapters and runtime class remain isolated behind the stored
`streamProfile: stream_5000` marker. This means a later model can move to a
dedicated driver without first untangling it from the Developer-API runtime.

Create a separate public driver only when the product has a materially different
Homey role, capability contract, pairing journey or lifecycle that cannot be
represented safely by profile-based runtime selection. A split after devices
have been paired is still a user-visible migration: Homey's driver ID is part of
device identity, so affected users must remove and re-pair the device and review
Flows and Insights that referenced it. Preserve the stored profile and model ID
during any such migration so duplicate detection and account cleanup remain
deterministic.

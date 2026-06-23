# EcoFlow for Homey Pro

Monitor and control **EcoFlow STREAM** balcony-solar/battery systems and the **EcoFlow Smart Meter** from Homey Pro, with full Energy-dashboard, Flow and Insights integration.

> App ID `uk.co.zarb.ecoflow` · Homey SDK v3 · TypeScript

## Features

### STREAM (Ultra / Pro / AC Pro / Max / Ultra X)
- **System device:** one device per STREAM installation (addressed by its main SN) showing aggregated battery level & health, battery/solar/grid/home power, temperature, voltage and charge/discharge limits.
- **Per-unit devices:** each physical inverter/battery (e.g. Ultra X Left/Right, AC Pro 1.1–1.4) is also added as its own device showing its grid feed and AC-output (relay) control.
- **Control:** AC outputs 1 & 2, backup-reserve level (3–95%), operating mode (Self-powered / AI / Scheduled / Time-of-use), grid feed-in on/off.
- **Homey Energy:** the system device appears as a home battery (charge/discharge + stored energy).
- Devices are classified by serial prefix (BK11 Ultra, BK12 Pro, BK31 AC Pro, BK41 Max, BK51 AC, BK61 Ultra X), so all current STREAM models are discovered; the Microinverter (BK01) is skipped as it exposes no telemetry.

### Smart Meter (CT_EF_01)
- Added as a **Homey Energy grid meter** showing whole-home grid power (positive = importing, negative = exporting).
- When the meter is part of a STREAM system its own serial returns no data, so the reading is taken from the system's `powGetSysGrid` automatically.
- Cumulative **imported/exported energy** is derived from the live grid power as monotonic counters (the public API does not expose grid kWh totals). Standalone meters that report per-phase power/voltage/current have those values surfaced automatically.

### Automation
- **Triggers:** solar power changed, grid power changed, battery level crossed above/below a threshold.
- **Conditions:** operating mode is…, grid feed-in is enabled.
- **Actions:** set operating mode, set backup reserve, set grid feed-in, turn AC output on/off.
- **Insights:** all measurements are logged automatically.

### Under the hood
- Signed EcoFlow IoT Open Platform REST client (HMAC-SHA256, validated against the documented test vector).
- Shared **MQTT** connection for realtime (~2 s) updates, with REST polling as a fallback.

## Setup
1. Create an **Access Key** and **Secret Key** at [developer.ecoflow.com](https://developer.ecoflow.com) → *IoT Background*.
2. In Homey, add an **EcoFlow STREAM** (or **Smart Meter**) device and enter the keys + region.
3. Manage credentials later under the app's **Settings** page.

## Development
```sh
npm install
npm run build      # tsc
npm test           # tsc && node --test (signer golden-vector tests)
npm run lint
homey app validate --level publish
homey app run --remote   # run on your Homey Pro
```

## Notes & limitations
- The public API only reports *instantaneous* grid power for the Smart Meter (no kWh totals), so imported/exported energy is integrated locally into monotonic counters for the Energy dashboard.
- Per-phase Smart Meter values are only available on standalone meters; a meter integrated into a STREAM system reports a single whole-home grid figure.
- Per-unit STREAM devices mainly expose their own grid feed and AC-output relays — full battery/solar/load aggregates are only reported on the system (main) device.
- Power values use EcoFlow's documented public-API units (STREAM reports Watts directly).

## Credits
Field/command mappings cross-referenced against the community
[tolwi/hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud) integration. Not affiliated with EcoFlow.

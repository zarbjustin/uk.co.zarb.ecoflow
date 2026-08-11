# EcoFlow for Homey Pro

Monitor and control **EcoFlow STREAM** balcony-solar/battery systems and the **EcoFlow Smart Meter** from Homey Pro, with full Energy-dashboard, Flow and Insights integration.

> App ID `uk.co.zarb.ecoflow` · Homey SDK v3 · TypeScript

## Features

### STREAM (Ultra / Pro / AC Pro / Max / Ultra X)
- **Home Battery device:** one per STREAM installation (main SN) — battery level & health, battery/solar/grid/home power, temperature, voltage, charge/discharge limits, backup reserve and operating mode. Appears in **Homey Energy** as home storage with charged/discharged meters.
- **Solar device:** a `solarpanel` device per system showing PV generation + cumulative solar energy.
- **Per-unit monitors:** each physical inverter (Ultra X Left/Right, AC Pro 1.1–1.4) is available as its own device showing its grid feed.
- **AC sockets:** each AC outlet on AC Pro / Ultra X is its own **smart-plug device** (on/off + live power) — clearer than generic toggles.
- **Control:** settable charge/discharge limits, backup-reserve level (3–100%), operating mode (Self-powered / AI / Scheduled / Time-of-use), grid feed-in on/off, per-socket on/off.
- Devices are classified by serial prefix (BK11 Ultra, BK12 Pro, BK31 AC Pro, BK41 Max, BK51 AC, BK61 Ultra X), so all current STREAM models are discovered; the Microinverter (BK01) is skipped as it exposes no telemetry.

Pair **STREAM Home Battery (installation)** for one aggregate device per main system serial. It is
the whole-installation device used by Homey Energy and the STREAM widgets. Pair **Physical STREAM
Unit** only when you also want a separate monitor for one inverter or battery; unit devices do not
contain reliable whole-system totals.

### STREAM 5000 Series — AC 5000 monitoring
EcoFlow exposes **no supported public API** for the currently verified STREAM AC 5000: every Developer-API quota call for an `ES22…` serial returns code 1006. Pair **STREAM Home Battery (5000 installation)** once for Homey Energy, including battery level and health, signed power, charged/discharged energy, house consumption, grid import/export and temperature. Pair **STREAM 5000 Series Unit** only when you also want a physical monitor; it deliberately uses custom power capabilities and is not counted again by Homey Energy. Both roles use EcoFlow's app connection and require your **EcoFlow account email and password**. Today only the ES22 AC 5000 adapter is enabled and it is read-only—no commands are sent. Unverified STREAM 5000, Expansion Battery 5000 and Gateway serials are not offered merely because their product names match. Read [`docs/EXPERIMENTAL_STREAM_AC5000.md`](docs/EXPERIMENTAL_STREAM_AC5000.md) for connection/security details and [`docs/STREAM_5000_ARCHITECTURE.md`](docs/STREAM_5000_ARCHITECTURE.md) for the future-model admission policy.

### Smart Meter (CT_EF_01)
- Added as a **Homey Energy meter**. A device setting lets it show either **Grid power** (import/export) or **Home load** (total consumption).
- When the meter is part of a STREAM system its own serial returns no data, so the reading is taken from the system's main SN (`powGetSysGrid` / `powGetSysLoad`) automatically.
- Cumulative **imported/exported energy** is derived from the live power as monotonic counters (the public API does not expose grid kWh totals). Standalone meters that report per-phase power/voltage/current have those values surfaced automatically.

### Automation
- **Triggers:** solar/grid power changed, grid import/export started, grid import/export **rises above** a threshold, charging/discharging started, battery level crossed, operating mode changed, fault raised/cleared, device online/offline.
- **Conditions:** operating mode is…, grid feed-in enabled, battery level above/below, solar power **above/below**, **battery charging from solar**, **solar forecast today/tomorrow above/below**, **electricity price above/below**, **electricity price is negative**.
- **Actions:** set operating mode, backup reserve (8524-safe, verified), charge/discharge limit, grid feed-in, per-socket on/off, tariff helpers **Prepare for cheap import** / **Prepare for peak/export** / **Release battery for export now**, and **Set current electricity price**.
- **Solar forecast:** today's and tomorrow's expected yield from the local weather forecast ([Open-Meteo](https://open-meteo.com), keyless) at Homey's location, with a tunable calibration factor.
- **Tariff automation (provider-agnostic):** feed your current price from **any** tariff app (Octopus, Tibber, aWATTar, …) into the *Set electricity price* action and drive price/negative-price Flows — see [tariff recipes](docs/OCTOPUS_FLOWS.md).
- **Insights:** all measurements are logged automatically.

### Dashboard widgets
Five distinct widgets (each with its own accurate preview), bound to a chosen STREAM system:
**Energy Flow**, **Today Balance**, **Battery Plan**, **Solar Forecast**, and **Energy
Recommendation**. Widget selectors only offer aggregate **STREAM Home Battery** devices. In that
device's settings, optionally enter the installed system capacity; Battery Plan then shows stored
and usable kWh and estimates time to empty while discharge is above 50 W. The estimate respects the
higher of backup reserve and discharge limit and applies the configurable discharge efficiency
(92% by default). Without capacity or active discharge, the widget clearly labels EcoFlow's
device-reported fallback. Energy Flow and Battery Plan support both Developer-API and STREAM 5000
app-connected Home Batteries; widgets that require history, solar forecasts or tariff controls
remain limited to installations that expose those capabilities. Regenerate previews from the real widget HTML with `npm run widgets:preview`.

### Languages
English, **German** and **Dutch**.

### Under the hood
- Signed EcoFlow IoT Open Platform REST client (HMAC-SHA256, validated against the documented test vector), with bounded retry for transient blips.
- Shared **MQTT** connection for realtime (~2 s) updates, with REST polling as a fallback.
- **Troubleshooting / logs:** view the app's live log (incl. `[mqtt]` connection events) via *Homey Developer Tools → your app → Log*.

## Setup
1. Create an **Access Key** and **Secret Key** at [developer.ecoflow.com](https://developer.ecoflow.com) → *IoT Background*.
2. In Homey, add **STREAM Home Battery (installation)** for system totals and widgets. Add
   **Physical STREAM Unit** only for per-device monitoring. Enter the keys + region when prompted.
3. Manage credentials later under the app's **Settings** page.

> **STREAM AC 5000 owners:** add **STREAM Home Battery (5000 installation)** for Homey Energy, then optionally add **STREAM 5000 Series Unit** for physical telemetry. These use a separate EcoFlow app sign-in and are monitoring only—see [`docs/EXPERIMENTAL_STREAM_AC5000.md`](docs/EXPERIMENTAL_STREAM_AC5000.md).

## Development
```sh
npm install
npm run build      # tsc
npm test           # tsc && node --test (signer golden-vector tests)
npm run lint
homey app validate --level publish
homey app run --remote   # run on your Homey Pro
homey app install        # install the current build on the selected Homey Pro
```

## Release & publish
See [`docs/STATUS.md`](docs/STATUS.md) for the full handoff. In short:
1. Commit & push to `master`.
2. Run the **Update Homey App Version** workflow (patch/minor/major + changelog) — it bumps the version, updates `.homeychangelog.json`, tags and releases.
3. Run the **Publish Homey App** workflow to upload a new App Store build.
4. Optionally `homey app install` to push the build to your local Homey Pro.

## Notes & limitations
- The public API only reports *instantaneous* grid power for the Smart Meter (no kWh totals), so imported/exported energy is integrated locally into monotonic counters for the Energy dashboard.
- Per-phase Smart Meter values are only available on standalone meters; a meter integrated into a STREAM system reports a single whole-home grid figure.
- Per-unit STREAM devices mainly expose their own grid feed and AC-output relays — full battery/solar/load aggregates are only reported on the system (main) device.
- Power values use EcoFlow's documented public-API units (STREAM reports Watts directly).
- The **STREAM AC 5000 (ES22)** integration is monitoring-only. EcoFlow provides no supported public API for this model, so it uses EcoFlow's app connection, which may change without notice. It needs your EcoFlow account password, has no REST fallback (availability follows the MQTT data age), and exposes no controls, Flow cards or cumulative energy totals.

## Credits
Field/command mappings cross-referenced against the community
[tolwi/hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud) integration.
The STREAM AC 5000 (ES22) adapter, app-auth flow and protobuf field map are adapted from the MIT-licensed
[shuette42/ecoflow-energy-ha](https://github.com/shuette42/ecoflow-energy-ha) — full attribution in
[`docs/EXPERIMENTAL_STREAM_AC5000.md`](docs/EXPERIMENTAL_STREAM_AC5000.md).
Not affiliated with EcoFlow.

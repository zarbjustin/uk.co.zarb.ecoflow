# EcoFlow for Homey Pro

Monitor and control **EcoFlow STREAM** balcony-solar/battery systems and the **EcoFlow Smart Meter** from Homey Pro, with full Energy-dashboard, Flow and Insights integration.

> App ID `uk.co.zarb.ecoflow` · Homey SDK v3 · TypeScript

## Features

### STREAM (Ultra / Pro / AC Pro / Max / Ultra X)
- **Monitoring:** battery level & health, battery/solar/grid/home power, temperature, voltage, charge/discharge limits.
- **Control:** AC outputs 1 & 2, backup-reserve level (3–95%), operating mode (Self-powered / AI / Scheduled / Time-of-use), grid feed-in on/off.
- **Homey Energy:** appears as a home battery (charge/discharge + stored energy).
- Multi-device systems are resolved to their **main SN** automatically.

### Smart Meter (CT_EF_01)
- Whole-home **grid power** plus **per-phase** power, voltage and current (L1/L2/L3).
- Net energy + energy-today counters and power factor.

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
- The Smart Meter reports *net* energy; separate grid import/export counters are not exposed by the public API, so it is modelled as a cumulative import meter.
- Power values use EcoFlow's documented public-API units (STREAM reports Watts directly).

## Credits
Field/command mappings cross-referenced against the community
[tolwi/hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud) integration. Not affiliated with EcoFlow.

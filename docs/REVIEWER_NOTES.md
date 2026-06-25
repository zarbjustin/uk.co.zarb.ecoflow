# Reviewer Notes — EcoFlow - Stream Systems

Paste the relevant parts of this into the **"Submit for certification"** review-notes field on
the Homey Developer Tools. It explains to Athom's reviewer how to test a cloud-connected app
they have no hardware for.

> ⚠️ **Do not commit real API keys to this repository.** Put the demo Access/Secret keys only in
> the dashboard review-notes field (or share privately with Athom). The placeholders below are
> intentionally empty.

---

## What the app does

EcoFlow - Stream Systems integrates the EcoFlow **STREAM** balcony-solar/battery system and the
EcoFlow **Smart Meter** with Homey Energy. It is deliberately scoped to the STREAM product line
only — PowerStream and portable power stations are intentionally excluded. It reads live solar,
battery, grid and per-socket data over EcoFlow's official **IoT Open Platform** (REST + MQTT) and
exposes charge/discharge limits, backup reserve, operating mode and grid feed-in controls, plus
Flow cards. STREAM registers as a first-class Homey **Energy** home battery, the Smart Meter as the
grid meter, and STREAM solar as production — enabling tariff-aware (e.g. Octopus Agile) automation
via Flow.

## How it connects (no LAN/local API — it is a cloud app)

The app talks to EcoFlow's cloud using credentials from the **EcoFlow IoT Open Platform**:
- Portal: https://developer.ecoflow.com (or the EU portal https://developer-eu.ecoflow.com)
- Each EcoFlow account can generate an **Access Key** and **Secret Key**.
- Pairing in Homey asks for: **Access Key**, **Secret Key**, and **Region** (Global / EU).
  The app then discovers all EcoFlow devices on that account automatically.

A real EcoFlow STREAM device bound to the account is required to see live data; without
a device the app authenticates but lists no devices.

## How to test (reviewer steps)

1. Add device → **EcoFlow - Stream Systems** → choose a driver (e.g. *STREAM*).
2. On first device, enter the **Access Key**, **Secret Key** and **Region** below.
3. The pairing screen lists the discovered EcoFlow devices; select and add.
4. Verify on the device:
   - Live tiles update (battery %, solar W, grid import/export W).
   - Advanced settings: set **backup reserve**, **charge/discharge limit**.
   - Toggle **grid feed-in** and change **operating mode**.
   - Create a Flow with e.g. *"Solar power is above [W]"* (condition) → *"Set backup reserve"* (action) and run it.
5. The **STREAM Energy Flow** widget shows live Grid / Solar / Home / Battery.

## Demo credentials (fill in on the dashboard — leave blank here)

```
EcoFlow IoT Open Platform
Access Key:  <paste demo access key in the dashboard review notes>
Secret Key:  <paste demo secret key in the dashboard review notes>
Region:      <Global | EU>
Notes:       This account has a live STREAM + Smart Meter for testing.
```

If you prefer not to share account credentials, contact me via the app's
[support page](https://github.com/zarbjustin/uk.co.zarb.ecoflow/issues) and I will arrange a
temporary test account or a live screen-share.

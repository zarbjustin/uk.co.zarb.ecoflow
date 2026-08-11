# EcoFlow STREAM Series — Full Specification (v1.10.3 basis)

> Single source of truth describing the **current** architecture
> (`origin/master`, v1.10.3) and the target end-state after review sprints. When code and this
> spec disagree, reconcile. App: `uk.co.zarb.ecoflow` · Homey SDK v3 · TypeScript.

## 1. Purpose & scope
A focused, **Energy-native** Homey Pro integration for the EcoFlow **STREAM** balcony-solar/battery
line + the EcoFlow **Smart Meter**, whose core use case is **tariff-driven charge/discharge
automation** (e.g. Octopus Agile) via Homey Flow and Energy. In scope: STREAM Ultra/Pro/AC Pro/Max/
AC/Ultra X, the Microinverter (as a solar device), the Smart Meter, and experimental monitoring of
the STREAM AC 5000. Out of scope: PowerStream and portable stations (`disabled-drivers/`, not
shipped).

## 2. Architecture (current)
```
App (app.ts) — shared Developer API EcoFlowMqtt plus an isolated app-auth WSS MQTT session;
 app settings: accessKey/secretKey/host/mqtt_enabled and separate app-auth account credentials
 Drivers (9, including one compatibility entry) → Devices:
   stream (battery) · stream_unit (battery) · stream_solar (solarpanel) · stream_micro (solarpanel)
   · stream_socket (socket) · smartmeter (sensor) · stream_5000_system (monitoring-only home battery)
   · stream_5000_unit (physical monitor)
   · stream_ac5000 (deprecated compatibility driver)
 Widgets (5): stream_flow, stream_balance, stream_battery_plan, stream_solar_forecast,
   stream_tariff_opportunity (+ shared widgets/stream_common.js)
 lib/: EcoFlowClient (signed REST, cached, retry), EcoFlowMqtt (realtime), sign (HMAC-SHA256),
   apiHost (region/origin allow-list), BaseEcoFlowDevice, energyIntegration + EnergyCheckpoint
   (energy accounting/persistence), flowStates (trigger state machine), quota, streamMapping/
   streamModels/streamProtocol/streamPairing/streamHistory, smartMeterMapping, ecoflowDevices,
   appApi, pairing, types; plus EcoFlowAppAuthClient, EcoFlowAppMqtt, appAuthCrypto,
   appAuthPairing, appDevices, stream5000Models/Adapters/Pairing and the
   model-specific streamAc5000Protocol/Mapping/Diagnostics implementation.
```

### 2.1 Data flow
REST poll (per `poll_interval`) and shared MQTT push both feed `applyQuota` via a serialized
`queueQuota`/`applyChain`, with a synchronous timestamp re-anchor so poll+MQTT can't double-count
within one accounting mode. Energy is persisted through `EnergyCheckpoint` (coalesced writes).

### 2.2 Device lifecycle (BaseEcoFlowDevice) — target
`onInit`: creds → `EcoFlowClient` → `onReady` (load persisted energy, register controls) → first
poll → poll timer → subscribe MQTT. `onSettings`: restart poll timer; **rebuild REST client on
credential/region change**. `onDeleted` **and `onUninit`** (TARGET — review H2): idempotent
teardown — unsubscribe MQTT, clear timers, **flush `EnergyCheckpoint`** (so meters stay monotonic
across restarts).

## 3. Model spec (serial-prefix → capabilities)
`lib/streamModels.ts` (per-model incl. a device `icon`). Corrected per `PRODUCT_RESEARCH.md`:

| Prefix | Model | AC-coupled | PV inputs | AC output |
|---|---|---|---|---|
| BK11 | STREAM Ultra | no | 4 | 1200 W (2300 paired) |
| BK12 | STREAM Pro | no | 3 | 800 W |
| BK31 | STREAM AC Pro | yes | 0 | 800 W |
| BK41 | STREAM Max | no | **2** *(currently 4 — review M1, confirm HW)* | 800 W |
| BK51 | STREAM AC | yes | 0 | 800 W |
| BK61 | STREAM Ultra X | no | 4 | 1200 W (2300 paired) |
| BK01 | Microinverter | — | 2 (MQTT only) | 800 W |
| ES22 | STREAM AC 5000 | yes | 0 | 3000 W (installation and regional limits apply) |
| CT_EF_01 | Smart Meter | — | — | — |

### 3.1 New 5 kWh generation: confirmed and unknown

The official 2026 launch pages list a broader new-generation family. Only
STREAM AC 5000 (`ES22`) currently has a verified serial prefix and captured
protobuf layout.

| Product | Published specification | Integration position |
| --- | --- | --- |
| STREAM AC 5000 | 5,024 Wh; 3,000 W AC; no direct PV | Dedicated `ES22` monitoring driver |
| STREAM 5000 | 5,024 Wh; 3,000 W AC; 4,000 W PV / four MPPT | Do not classify until serial and frames are captured |
| STREAM Expansion Battery 5000 | 5,024 Wh expansion module | Determine whether nested under a host or separately discoverable |
| STREAM Gateway | Expansion component; EcoFlow states no rewiring is needed when expanding | Discovery identity and protocol unknown |

There is no distinct **STREAM 3000** product in the referenced UK/German launch
comparison. The pages advertise 3,000 W output, while STREAM Ultra X is listed
separately with 3,084 Wh capacity.

Future support must first add opt-in, privacy-safe app-auth discovery for unknown
new-generation products. Capture only product metadata, redacted serial prefixes,
observed command IDs and bounded serial-redacted frame samples. Never route an
unknown model to the BK or ES22 parser based on its marketing name.

## 4. Capability catalogue
Custom (`.homeycompose/capabilities/`, each with an `icon` from `assets/capabilities/*.svg`):
`backup_reserve_soc` (3–100%), `charge_limit`, `discharge_limit`, `operating_mode`
(self_powered/ai/scheduled/tou), `feed_in_control`, `battery_soh`, `battery_cycles`,
`charge_remaining`, `discharge_remaining`, `self_heating` (on-demand), `power_factor`, and the
per-unit/meter power capabilities (`stream_unit_power_*`, `smartmeter_power_*`,
`stream_micro_power_*`). Daily-history (on-demand): `energy_solar_today`,
`energy_consumption_today` *(label experimental — review M5)*, `energy_grid_import_today`,
`energy_grid_export_today`, `energy_savings_today`, `co2_today`, `energy_independence`. Standard:
`measure_battery`, `battery_charging_state`, `measure_power[.grid/.pv/.load/…]`,
`meter_power[.charged/.discharged/.imported/.exported]`, `measure_temperature`, `measure_voltage`,
`alarm_generic`.

## 5. Homey Energy contract
`stream`: `homeBattery` + `meter_power.charged/.discharged`. `stream_5000_system`:
the app-auth 5000-family installation aggregate with the same Homey Energy contract.
`stream_unit`: an individual `homeBattery` with `meter_power.charged/.discharged`, suitable for a
standalone unit. If the installation aggregate is also paired, the user excludes physical units
from Homey Energy to prevent double counting. `stream_5000_unit` and deprecated `stream_ac5000`
use the same optional-monitor rule. `smartmeter`: `cumulative` import/export. Solar devices:
exported production. **Invariant:** cumulative meters must be **monotonic** and **single-sourced**
— flush on `onUninit` (H2) and latch off power-integration once device counters are seen (H3).

## 6. Flow-card catalogue
**Current** — Actions: `set_operating_mode`, `set_backup_reserve`, `set_charge_limit`,
`set_discharge_limit`, `set_feed_in`, `refresh_now`, `prepare_for_cheap_import`,
`prepare_for_peak_export`. Conditions: `operating_mode_is`, `feed_in_enabled`, `battery_soc`,
`is_charging`, `is_exporting`, `solar_power_above`. Triggers: `solar_power_changed`,
`grid_power_changed`, `grid_import_started`, `grid_export_started`, `charging_started`,
`discharging_started`, `battery_level_crossed`, `operating_mode_changed`, `fault_raised`,
`fault_cleared`, `device_came_online`, `device_went_offline`.

**Target additions (this review):** all reserve-changing paths go through one **8524-safe** helper
(discharge-limit-then-reserve + verify — H1); action **"Release battery for export now"**;
conditions `solar_power_below`, `charging_from_solar`; threshold triggers `grid_import_above`,
`grid_export_above`.

## 7. Widget specifications (5 widgets)
Common: device picker (`device.getId()`), shared `stream_common.js` data provider, serialized
in-flight-guarded refresh, clear/mute all values on error/no-device (L1), and a **unique simplified
preview generated from dedicated text-free vector artwork** (H5). Energy Flow and Battery Plan
accept either aggregate transport through `measure_power`; richer history, solar-forecast and
tariff widgets remain restricted to the BK aggregate through `measure_power.from_battery`.
Physical unit devices do not expose the aggregate capability pair (`measure_power` plus
`measure_power.grid`) and never resolve in the backend. Preview canvases are transparent;
the live widget HTML is never used as preview artwork. Per widget:
1. **Energy Flow** — live grid/solar/home/battery topology + SoC (fix arrow direction — M2).
2. **Today Balance** — daily solar/consumption/import/export/independence (qualify unreliable — M5).
3. **Battery Plan** — SoC, stored/usable kWh from optional user-entered system capacity, effective
   reserve/discharge floor, mode, time-to-full, and calculated or EcoFlow-reported time-to-empty
with explicit provenance.
4. **Solar Target** — today's solar vs a user target/progress (rename away from "Forecast" — M3).
5. **Energy Recommendation** (rename of "Tariff Opportunity") — live recommendation from
   power/SoC/feed-in (not tariff-aware — M4).

## 8. API / MQTT data model
HMAC-SHA256 signed REST (cached + bounded retry), origin allow-list (`apiHost.ts`), shared MQTT
(`/open/{account}/{sn}/{quota|status|set}`), whole-system fields on the main SN, per-unit fields on
member SNs, `accu*Energy` counters via MQTT. Not on the open API: Smart Meter kWh totals (integrated
locally), efficiency, forecast, earnings, tariff rates.

## 9. Constraints (must respect)
8524 reserve>discharge+~3 ordering; unreliable consumption logs (solar reliable); single MQTT
session + cert refresh on reconnect; monotonic single-sourced meters; no `target_power` setpoint;
hardware-gated: BK41 PV count, self-heating field, per-socket fields.

## 10. Quality gates
Every change: `npm run build` → `npm run lint` → `npm test` → `homey app validate --level publish`.
Regenerate widget previews whenever the dedicated preview artwork changes. Version/publish via
GitHub workflows only. Land via PR from `copilot/review-v1.8.6`.

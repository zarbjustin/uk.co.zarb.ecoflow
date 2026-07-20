# EcoFlow STREAM Series — Full Specification

> Phase 3 deliverable and single source of truth for the app. Consolidates the product research,
> multi-model code review and feature evaluation into an implementable specification. When code
> and this spec disagree, treat the disagreement as a bug in one of them and reconcile.
> App: `uk.co.zarb.ecoflow` · Homey SDK v3 · TypeScript · target v1.9.0.

## 1. Purpose & scope
A **focused, Energy-native** Homey Pro integration for the EcoFlow **STREAM** balcony-solar/
battery product line and the EcoFlow **Smart Meter**, whose core use case is **tariff-driven
charge/discharge automation** (e.g. Octopus Agile) via Homey Flow and Homey Energy.

**In scope:** STREAM Ultra/Pro/AC Pro/Max/AC/Ultra X, the STREAM Microinverter (as a solar
device), and the Smart Meter. **Out of scope (intentional):** PowerStream and portable power
stations (`disabled-drivers/powerstream/`, not shipped).

## 2. Architecture
```
Homey App (app.ts)
 ├─ Shared EcoFlowMqtt (one broker session/account; manual reconnect w/ fresh cert)
 ├─ App settings: accessKey, secretKey, host/region, mqtt_enabled
 └─ Drivers (6) → Devices (extend BaseEcoFlowDevice)
      ├─ stream        (class battery)   — the STREAM system (main SN): battery+solar+grid+control
      ├─ stream_unit   (class battery)   — a physical inverter (per-unit telemetry)
      ├─ stream_solar  (class solarpanel)— system PV production
      ├─ stream_micro  (class solarpanel)— STREAM Microinverter (BK01) PV
      ├─ stream_socket (class socket)    — an AC outlet (on/off + power)
      └─ smartmeter    (class sensor)    — grid meter (import/export) or home-load
 Widgets (5) → read device capabilities via each widget's api.js
 lib/: EcoFlowClient (signed REST), EcoFlowMqtt (realtime), sign (HMAC-SHA256),
       BaseEcoFlowDevice, energyIntegration, quota, stream* mappings/models/protocol/pairing/
       history, smartMeterMapping, ecoflowDevices (serial classification), appApi, types.
```

### 2.1 Data flow
REST poll (per device `poll_interval`) **and** shared MQTT push both call `applyQuota(quota)` →
map fields → `setCapabilityValue`. Energy counters integrate power/track counters with a
**synchronous timestamp anchor** to prevent poll+MQTT double-count within the integration path.

### 2.2 Device lifecycle (BaseEcoFlowDevice) — target behaviour
`onInit`: read creds → build `EcoFlowClient` → `onReady` → first `poll` → start poll timer →
subscribe MQTT (quota + optional status). `onSettings`: restart poll timer on `poll_interval`;
recreate REST client + resubscribe on **credential/region change** *(new — review M5)*.
`onUninit` **and** `onDeleted`: idempotent teardown — unsubscribe MQTT handlers, clear poll/
subclass timers and pending post-command polls *(new — review M3)*.

## 3. Model spec (serial-prefix → capabilities)
Source of truth `lib/streamModels.ts`. Corrected per `docs/PRODUCT_RESEARCH.md`:

| Prefix | Model | AC-coupled | PV/MPPT inputs | AC output |
|---|---|---|---|---|
| BK11 | STREAM Ultra | no | 4 | 1200 W (2300 paired) |
| BK12 | STREAM Pro | no | 3 | 800 W |
| BK31 | STREAM AC Pro | yes | 0 | 800 W |
| BK41 | STREAM Max | no | **2** *(was 4 — review H5, confirm on HW)* | 800 W |
| BK51 | STREAM AC | yes | 0 | 800 W |
| BK61 | STREAM Ultra X | no | 4 | 1200 W (2300 paired) |
| BK01 | STREAM Microinverter | — | 2 (MQTT only) | 800 W |
| CT_EF_01 | Smart Meter | — | — | — |

`stream_unit` adds `measure_power.pvN` tiles up to the model's PV-input count (on-demand); the
`UNKNOWN` fallback must not over-provision PV tiles.

## 4. Capability catalogue (custom capabilities in `.homeycompose/capabilities/`)
`backup_reserve_soc`, `charge_limit`, `discharge_limit` (settable % SoC), `operating_mode`
(enum: self-powered / AI / scheduled / time-of-use), `feed_in_control` (bool), `battery_soh`,
`battery_cycles`, `charge_remaining`, `discharge_remaining`, `self_heating` (on-demand),
`power_factor`, and the daily-history set `energy_solar_today`, `energy_grid_import_today`,
`energy_grid_export_today`, `energy_consumption_today` *(label experimental — review M6)*,
`energy_savings_today`, `co2_today`, `energy_independence` (all added on demand only when the
history feed populates them). Standard capabilities: `measure_battery`, `battery_charging_state`,
`measure_power[.grid/.pv/.pvN/.load/.from_pv/.from_battery/.from_grid/.schuko1/.schuko2]`,
`meter_power[.charged/.discharged/.imported/.exported]`, `measure_temperature`, `measure_voltage`,
`alarm_generic`.

## 5. Homey Energy contract
- `stream`: `energy.homeBattery = true`, `meterPowerImportedCapability = meter_power.charged`,
  `meterPowerExportedCapability = meter_power.discharged`.
- `stream_unit`: `energy.batteries = ['INTERNAL']`.
- `smartmeter`: `energy.cumulative = true`, cumulative import/export = `meter_power.imported/
  .exported`.
- `stream_solar`/`stream_micro`: exported production via `meterPowerExportedCapability`.
- **Invariant:** cumulative `meter_power` values are **monotonic** and **single-sourced** —
  once device counters (`accu*Energy`, via MQTT) are seen, the REST power-integration fallback
  must not also accumulate (review H2).

## 6. Flow-card catalogue
**Actions:** `set_operating_mode`, `set_backup_reserve`, `set_charge_limit`, `set_discharge_limit`,
`set_feed_in`, `refresh_now`, tariff helpers `prepare_for_cheap_import`, `prepare_for_peak_export`.
**Conditions:** `operating_mode_is`, `feed_in_enabled`, `battery_soc` (above/below), `is_charging`,
`is_exporting`, `solar_power_above`.
**Triggers:** `solar_power_changed`, `grid_power_changed`, `grid_import_started`,
`grid_export_started`, `charging_started`, `discharging_started`, `battery_level_crossed`,
`operating_mode_changed`, `fault_raised`, `fault_cleared`, `device_came_online`,
`device_went_offline`.

### 6.1 Corrected/added (this spec)
- **All reserve-changing paths** (capability listener, `set_backup_reserve`,
  `prepare_for_peak_export`) go through one helper implementing the **discharge-limit-then-reserve
  ordering + verify** (review H1). Optimistic capability writes only after verification.
- **Tri-state edges:** `grid_import_started`/`grid_export_started` and `charging_started`/
  `discharging_started` fire only on entering an active state from a different state, with an idle
  band `[-5, 5] W` (review M1/M2).
- **New (feasible):** condition `solar_power_below`; condition `charging_from_solar`
  (via `measure_power.from_pv/.from_grid`); threshold triggers `grid_import_above` /
  `grid_export_above`; action *"Release battery for export now"* (safe reserve/limit sequence).

## 7. Widget specifications (5 widgets)
Common: each widget has `widget.compose.json` (name, settings incl. a **device-id picker**,
height, api), `public/index.html` (self-contained, dark card, EcoFlow palette), `api.js`
(returns a typed snapshot; serialised, in-flight-guarded refresh; clears interval on unload —
review L2), and unique `preview-light.png` + `preview-dark.png` rendered from the HTML.

1. **Energy Flow** — grid/solar/home/battery live power + SoC badge; direction sublabels.
2. **Battery & Reserve** — SoC ring with reserve + discharge-limit markers; charge state; time to
   full/empty; mode chip.
3. **Solar Today** — today's kWh headline + live PV + per-string bars; CO₂/independence when present.
4. **Grid Import/Export** — live grid direction dial; today imported/exported kWh; feed-in state.
5. **Tariff / Octopus Status** — mode + reserve + charge/discharge limits + feed-in; derived
   cheap-charge/peak-export badge (no invented price data).

## 8. API / MQTT data model
- **Auth:** EcoFlow IoT Open Platform, HMAC-SHA256 signed (flattened, sorted keys; golden vector
  in `test/sign.test.js`).
- **REST:** `getQuotaAll(sn)` snapshot (sparse — some `accu*` empty), command PUTs via
  `StreamCmd.*`, `getCertification()` for MQTT, `getHistory()` for daily tiles.
- **MQTT:** topics `/open/{account}/{sn}/{quota|status|set}`; STREAM payloads are flat
  (`param`/`params`/`data` unwrap). Delivers realtime quota incl. `accu*Energy` counters.
- **Whole-system fields** on main SN: `powGetSysGrid`, `powGetSysLoad`, `powGetPvSum`,
  `powGetSysLoadFromPv/Bp/Grid`. Per-unit: per-string PV, `bmsChgRemTime/bmsDsgRemTime`,
  `gridConnectionPower`, `chgDsgState`.
- **Not on the open API:** Smart Meter kWh totals (integrated locally), generation efficiency,
  forecast, earnings/savings, tariff rates.

## 9. Known constraints & limitations (must respect)
1. **8524 ordering:** `set_backup_reserve` needs reserve > `discharge_limit` + ~3; lower the
   discharge limit first, then set reserve, then verify.
2. **Unreliable consumption:** `energy_consumption_today`/`measure_power.load` inflated; solar is
   reliable. Never model load from EcoFlow consumption logs.
3. **Tariff precedence:** negative-price/dump-load automations must win over any charge planner.
4. **Single MQTT session** per account; manual reconnect refreshes the certificate.
5. **No watt setpoint** (`target_power`) on the open API — control is via mode/reserve/limits/
   feed-in only.
6. Hardware-gated: BK41 PV count, STREAM Max AC rating, `self_heating` field name.

## 10. Quality gates
Every change: `npm run build` (tsc) → `npm run lint` (eslint-config-athom) → `npm test`
(tsc + node --test) → `homey app validate --level publish`. Widget previews must be regenerated
whenever a widget's HTML changes. Versioning/publish via the GitHub *Update Homey App Version* and
*Publish Homey App* workflows only (never hand-edit the version).

## 11. Non-goals
Reverse-engineering EcoFlow's private/app-internal analytics (earnings, forecast, efficiency),
supporting PowerStream/portable stations, or inventing tariff price data inside the app.

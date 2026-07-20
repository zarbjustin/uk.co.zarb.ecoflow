# EcoFlow STREAM Series — Product Research

> Phase 0 deliverable for the v1.8.0 review. Purpose: give the app an accurate, grounded model
> of the real EcoFlow STREAM hardware so the code review, feature evaluation and spec are correct.
> Figures are cross-referenced from EcoFlow product pages, datasheets and independent reviews
> (pv-magazine, solarkontor, offgridtec, Energian, EcoFlow regional sites). Where sources
> disagree, the conflict is called out and marked **⚠ verify on hardware**.

## 1. What the STREAM Series is
The **EcoFlow STREAM** line is a **balcony-solar / plug-in home-battery** system (primarily
DE/EU "Balkonkraftwerk" market, now UK/EU). A STREAM *system* is one or more all-in-one
inverter+battery units, optionally an AC-coupled satellite battery, an EcoFlow **STREAM
Microinverter**, and an EcoFlow **Smart Meter (CT)** for whole-home grid sensing. All units use
**LFP (LiFePO₄)** cells rated ~**6000 cycles** to 70%, are **IP65** (Microinverter IP67), operate
roughly **-20 °C…+55 °C** with **self-heating** film below ~5 °C, and are app/Wi-Fi/BLE managed.

## 2. Model matrix
Base module capacity is **1.92 kWh** across the all-in-one units (Ultra X = 3.84 kWh), stackable
with expansion batteries.

| Model | Serial prefix | Type | Base battery | PV / MPPT inputs | Max PV | AC output (grid-tied) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| STREAM Ultra | **BK11** | Hybrid (PV+AC) | 1.92 kWh (→12 kWh) | 4 × 500 W | 2000 W | 1200 W (2300 W paired) | Flagship all-in-one |
| STREAM Pro | **BK12** | Hybrid (PV+AC) | 1.92 kWh (→12 kWh) | 3 × 500 W | 1500 W | 800 W | Most common EU unit |
| STREAM AC Pro | **BK31** | AC-coupled | 1.92 kWh (→21 kWh) | none | — | 800 W | Retrofit satellite battery |
| STREAM Max | **BK41** | Hybrid (PV+AC) | 1.92 kWh (→~11.5 kWh) | **2 × 500 W ⚠** | **1000 W ⚠** | 800 W (1200 W islanded) | See §5 discrepancy |
| STREAM AC | **BK51** | AC-coupled | 1.92 kWh | none | — | 800 W | AC-coupled variant |
| STREAM Ultra X | **BK61** | Hybrid (PV+AC) | 3.84 kWh (→12 kWh) | 4 × 500 W | 2000 W ⚠(some list 2800 W) | 1200 W (2300 W paired) | Premium, later release |
| STREAM Microinverter | **BK01** | Microinverter | — | 2 × MPPT (≤1200 W in) | — | 800 W (230 VAC) | No telemetry via open API — skipped |
| Smart Meter (CT) | CT_EF_01 | Grid CT meter | — | — | — | — | Whole-home grid import/export |

## 3. Operating modes (relevant to Flow control)
EcoFlow exposes these system modes (mapped by the app's `operating_mode` capability):
1. **Self-powered** — prioritise stored/solar energy for home load before grid import.
2. **AI / Smart** — EcoFlow cloud optimises charge/discharge from learned usage + tariff/forecast.
3. **Scheduled** — user-defined charge/discharge time windows.
4. **Time-of-use (TOU)** — charge when grid price is low, discharge/export when high.
Plus two *settings* (not modes) that gate discharge:
- **Backup reserve** (SoC %, ~3–95 %) — floor kept for outages.
- **Discharge limit** (SoC %) — hard floor the battery won't discharge below.

## 4. API / integration facts (open IoT platform)
- **Auth:** EcoFlow IoT Open Platform REST, HMAC-SHA256 signed (validated against the app's
  golden test vector in `test/sign.test.js`).
- **Realtime:** shared **MQTT** (~2 s) with REST polling fallback.
- **Serial-prefix classification** (BK11/12/31/41/51/61, BK01, CT_EF_01) drives device discovery.
- **Whole-system fields** live on the main SN (`powGetSysGrid`, `powGetSysLoad`,
  `powGetPvSum`/`powGetSysLoadFromPv/Bp/Grid`); per-unit MQTT carries richer per-string PV,
  remaining charge/discharge time, and per-unit grid feed.
- **Not exposed by the open API:** kWh grid totals for the Smart Meter (integrated locally),
  generation efficiency %, forecast, and earnings/tariff rates (EcoFlow app-internal only).

## 5. Constraints & gotchas that shape the app (must respect)
- **Backup-reserve vs discharge-limit (API error 8524):** `set_backup_reserve` is rejected unless
  the level exceeds `discharge_limit` by ~3. Homey flow cards can *swallow* 8524 → silent no-op.
  **Fix pattern:** lower `discharge_limit` first, then set reserve, and verify the value changed.
- **Consumption logs unreliable:** `energy_consumption_today` / `measure_power.load` Insights are
  inflated (~70–98 kWh/day vs real ~20–25). **`energy_solar_today` is reliable** (~0.67 kWh per
  MJ/m² shortwave). Don't model load from EcoFlow consumption logs — use Octopus meter data.
- **Negative-price/dump-load precedence:** tariff automation must let negative-price events win;
  a battery charge planner must stand down while dump-load is active.
- **HomeyScript sandbox** (companion flows, not this app but same account): no `AbortController`/
  `clearTimeout` at runtime — use `Promise.race` + `setTimeout` with a `done` flag.

### Repo-accuracy findings (feed the code review)
- **⚠ STREAM Max (BK41) PV inputs:** `lib/streamModels.ts` sets `solarInputs: 4`, but datasheets
  indicate **2 × 500 W (1000 W)**. Likely over-counts PV tiles for Max owners. Verify on
  hardware; if confirmed, set `BK41.solarInputs = 2` and AC-output note. (Already tracked as a
  hardware-confirm item in `docs/STATUS.md` / `FEATURE_BACKLOG.md`.)
- **STREAM Ultra X (BK61) PV:** repo uses 2000 W / 4 MPPT; some listings cite 2800 W. 4×500 W =
  2000 W is the consistent MPPT figure — keep 4 inputs; treat the 2800 W as marketing peak.
- **AC-output ratings:** repo labels Ultra/Ultra X "1200 W (2300 W paired)" and Pro/AC/Max
  "800 W" — consistent with sources. Confirm STREAM Max's grid-tied 800 W vs 1200 W islanded.
- **Self-heating field name** still unconfirmed (candidates in `lib/streamMapping.ts`); keep the
  on-demand tile until a cold-running unit reveals the real field.

## 6. Implications for this review
- The **5-widget** set should reflect real STREAM concepts: live power **flow**, **battery/SoC +
  reserve**, **solar today**, **grid import/export**, and **tariff/Octopus** status — each a
  distinct, glanceable view (drives Phase 2 + Sprint 1).
- Flow/feature work should lean on **reliable** fields (solar, grid power, SoC, mode) and avoid
  building on the unreliable consumption logs or unavailable earnings/forecast APIs.
- Model-spec accuracy (Max PV count) is a correctness item, not cosmetic — it changes which PV
  tiles a device exposes.

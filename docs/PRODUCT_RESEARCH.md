# EcoFlow STREAM Series — Product Research (v1.8.6 basis)

> Phase 0 deliverable for the current-release review. Gives the app an accurate model of the real
> EcoFlow STREAM hardware and reconciles it with the **current** code (`origin/master`, v1.8.6).
> Product figures cross-referenced from EcoFlow product pages/datasheets and independent reviews
> (pv-magazine, solarkontor, offgridtec, Energian, EcoFlow regional sites). Conflicts are flagged
> **⚠ verify on hardware**.

## 1. What the STREAM Series is
EcoFlow **STREAM** is a **balcony-solar / plug-in home-battery** system (DE/EU "Balkonkraftwerk",
now UK/EU). A STREAM *system* is one or more all-in-one inverter+battery units, optionally an
AC-coupled satellite battery, a **STREAM Microinverter**, and an EcoFlow **Smart Meter (CT)** for
whole-home grid sensing. LFP cells (~6000 cycles), IP65 (Microinverter IP67), ~-20…+55 °C with
self-heating below ~5 °C, Wi-Fi/BLE + cloud managed.

## 2. Model matrix
Base module 1.92 kWh (Ultra X = 3.84 kWh), stackable with expansion batteries.

| Model | Serial prefix | Type | Base battery | PV/MPPT inputs | Max PV | AC output (grid-tied) | Notes |
|---|---|---|---|---|---|---|---|
| STREAM Ultra | **BK11** | Hybrid | 1.92 kWh (→12) | 4 × 500 W | 2000 W | 1200 W (2300 paired) | Flagship all-in-one |
| STREAM Pro | **BK12** | Hybrid | 1.92 kWh (→12) | 3 × 500 W | 1500 W | 800 W | Common EU unit |
| STREAM AC Pro | **BK31** | AC-coupled | 1.92 kWh (→21) | none | — | 800 W | Retrofit satellite |
| STREAM Max | **BK41** | Hybrid | 1.92 kWh (→~11.5) | **2 × 500 W ⚠** | **1000 W ⚠** | 800 W | See §5 discrepancy |
| STREAM AC | **BK51** | AC-coupled | 1.92 kWh | none | — | 800 W | AC-coupled variant |
| STREAM Ultra X | **BK61** | Hybrid | 3.84 kWh (→12) | 4 × 500 W | 2000 W ⚠(some list 2800) | 1200 W (2300 paired) | Premium |
| STREAM Microinverter | **BK01** | Microinverter | — | 2 × MPPT (≤1200 W in) | — | 800 W (230 VAC) | No telemetry over open API — skipped |
| Smart Meter (CT) | CT_EF_01 | Grid CT meter | — | — | — | — | Whole-home grid import/export |

## 3. Operating modes (Flow control)
`operating_mode` capability maps: **Self-powered**, **AI / Smart**, **Scheduled**, **Time-of-use**.
Plus two SoC settings that gate discharge: **backup reserve** (floor kept for outages) and
**discharge limit** (hard floor the battery won't go below).

## 4. API / integration facts (open IoT platform)
- REST, HMAC-SHA256 signed (golden vector in `test/sign.test.js`); realtime shared **MQTT** (~2 s)
  with REST polling fallback. Serial-prefix classification drives discovery.
- Whole-system fields on the main SN (`powGetSysGrid`, `powGetSysLoad`, `powGetPvSum`,
  `powGetSysLoadFromPv/Bp/Grid`); per-unit MQTT carries per-string PV, remaining charge/discharge
  time, per-unit grid feed, and `accuChgEnergy`/`accuDsgEnergy` counters.
- **Not on the open API:** Smart Meter kWh totals (integrated locally), generation efficiency,
  forecast, earnings/savings, tariff rates.

## 5. Constraints & repo-accuracy findings (vs current v1.8.6 code)
- **Backup reserve range is now 3–100%** — `lib/streamProtocol.ts StreamCmd.backupReserve` clamps
  `[3,100]` (was `[3,95]`). Good.
- **⚠ 8524 ordering still unhandled:** EcoFlow rejects `set_backup_reserve` unless reserve exceeds
  `discharge_limit` by ~3. The current control path (`drivers/stream/device.ts` capability listener
  + flow helpers) just sends the reserve command and optimistically writes the capability — **no
  discharge-limit-first ordering and no verification** — so a low reserve target can silently no-op
  and the battery won't discharge. (Feeds the code review as a HIGH item.)
- **⚠ STREAM Max (BK41) PV inputs = 4 in code**, but datasheets indicate **2 × 500 W (1000 W)**.
  `lib/streamModels.ts BK41.solarInputs` should likely be `2`; otherwise Max owners get phantom
  empty PV tiles. Verify on hardware.
- **Ultra X (BK61)** = 2000 W / 4 MPPT in code; some listings cite 2800 W. 4×500 W is the
  consistent MPPT figure — keep 4.
- **Consumption logs unreliable** (inflated ~70–98 kWh/day vs real ~20–25); **solar is reliable**
  (~0.67 kWh per MJ/m² shortwave). Don't model load from EcoFlow consumption logs.
- **Self-heating field name** still unconfirmed — keep the on-demand tile.
- **Master already added** (independent of the earlier v1.8.0 review): `lib/flowStates.ts`
  (trigger state machine), `lib/EnergyCheckpoint.ts` (energy accounting), `lib/apiHost.ts`
  (host/region), 25 capability icons (`assets/capabilities/*.svg`), per-model device icons in
  `streamModels.ts`. The review must judge whether these are correct rather than re-implement them.

## 6. Implications for this review
- **Widgets:** the 5 widgets already exist and are functionally distinct in name/purpose; the
  certification fix is **distinct, simplified per-widget previews** using text-free shapes on
  transparent canvases, ensuring each preview is visibly its own (Phase 2 + Sprint 1).
- Build features on **reliable** fields (solar, grid power, SoC, mode); avoid the unreliable
  consumption logs and unavailable earnings/forecast APIs.
- Model-spec accuracy (BK41 PV count) is a correctness item; the 8524 ordering is the highest-value
  correctness fix and directly affects the app's core tariff use case.

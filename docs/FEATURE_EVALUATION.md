# Feature Evaluation — EcoFlow STREAM Series

> Phase 2 deliverable. Evaluates additive value across **widgets**, **Flow cards**, and other
> **Homey surfaces**, grounded in `docs/PRODUCT_RESEARCH.md` (real hardware/API) and
> `docs/CODE_REVIEW_v1.8.0.md` (current bugs). Reconciled with `docs/FEATURE_BACKLOG.md`
> (Sprints G–L) and `docs/ENERGY_ROADMAP.md`. Feasibility tags: ✅ open API/MQTT data exists ·
> 🟡 needs a data spike · 🚫 not available on the open API.

## A. Widgets — the 5-widget set (certification fix + core deliverable)
Certification feedback: *"all the widget previews are identical… make sure each preview fits with
the actual widget."* Today the app ships **one** widget (`stream_flow`) whose two preview PNGs are
its only previews. Decision (user-approved): ship **5 distinct widgets**, each reading real
capabilities from the `stream` (and, for grid, `smartmeter`) device, each with a **unique,
accurate** `preview-light.png` + `preview-dark.png` rendered from the actual widget HTML.

All widgets: bind to a **specific device via a device-id setting** (fixes review L2 — replace the
fragile ordinal `index`), serialise refresh with an in-flight guard, and clear timers on unload.
Shared visual language (dark card, EcoFlow accent palette) but **distinct layout + data** so each
preview is visibly different.

| # | Widget | Purpose (glanceable) | Primary data (capabilities) | Feasible |
|---|--------|----------------------|------------------------------|----------|
| 1 | **Energy Flow** (upgrade of `stream_flow`) | Live power flow between grid/solar/home/battery + SoC | `measure_power.grid/.pv/.load`, `measure_power`, `measure_battery`, `battery_charging_state`, `energy_solar_today` | ✅ |
| 2 | **Battery & Reserve** | Big SoC ring with **backup-reserve** and **discharge-limit** markers, charge state, time-to-full/empty, mode | `measure_battery`, `backup_reserve_soc`, `discharge_limit`, `charge_limit`, `charge_remaining`, `discharge_remaining`, `operating_mode`, `measure_power` | ✅ |
| 3 | **Solar Today** | Today's solar yield + live PV, per-string bars, CO₂/independence | `energy_solar_today`, `measure_power.pv`, `measure_power.pv1..4`, `co2_today`, `energy_independence` (shown only when populated) | ✅ (CO₂/independence 🟡 history) |
| 4 | **Grid Import/Export** | Live grid direction + today imported/exported kWh + feed-in state | `smartmeter` `measure_power`, `meter_power.imported/.exported`; `stream` `feed_in_control`, `measure_power.grid` | ✅ |
| 5 | **Tariff / Octopus Status** | Current mode + reserve + charge/discharge limits + feed-in, and a derived "cheap-charge / peak-export" state badge | `operating_mode`, `backup_reserve_soc`, `charge_limit`, `discharge_limit`, `feed_in_control`, `measure_power.grid` | ✅ (live tariff price 🚫 — use Octopus flows) |

Notes:
- Widget 5 shows the **app's tariff-relevant control state** (mode/reserve/limits/feed-in) and a
  badge derived from state (e.g. "Charging in cheap window" when charge_limit=100 & importing;
  "Exporting at peak" when feed-in on & exporting). Actual half-hourly prices come from the user's
  Octopus integration (EcoFlow open API exposes no tariff — see product research §4), so the
  widget does **not** invent price data.
- Widgets 3's CO₂/independence tiles render only when the history feed populates them (avoids empty
  tiles / certification concern).
- Each widget keeps the `stream_flow` API pattern (small `api.js` returning a typed snapshot).

### Preview generation (accuracy guarantee)
Render each widget's `public/index.html` with representative fixture data in a headless browser
(Playwright) at the widget's declared size, screenshot to `preview-light.png` and
`preview-dark.png`. This guarantees each preview **is** the real widget, satisfying the reviewer.

## B. Flow cards — gaps & additions
The app already has a strong set (8 actions, 6 conditions, 12 triggers). Evaluation of gaps:

**Fix first (from code review, not new features):**
- M1/M2: correct `grid_import_started/started`, `charging_started/discharging_started` state
  machines so existing triggers are reliable.

**High-value additions (✅ feasible on existing data):**
- **Trigger:** *Backup reserve reached* / *battery hit discharge limit* — edge on `measure_battery`
  crossing `discharge_limit`/`backup_reserve_soc` (complements `battery_level_crossed`).
- **Condition:** *Is charging from solar vs grid* — using `measure_power.from_pv/.from_grid`
  (data already mapped on the `stream` device).
- **Condition:** *Solar power below X* (mirror of existing `solar_power_above`).
- **Action:** *Set operating mode to Time-of-use/Scheduled* is covered by `set_operating_mode`;
  add a **safe combined tariff action** *"Release battery for export now"* that performs the
  **correct** discharge-limit-then-reserve sequence (also the fix vehicle for H1).
- **Trigger:** *Grid export power above X* / *import above X* (threshold triggers for tariff
  automations), distinct from the on/off `grid_*_started` edges.

**🟡 Needs data spike (defer):** earnings/savings triggers, forecast-based triggers — EcoFlow open
API doesn't expose earnings/forecast (product research §4; backlog Sprints I/J).

## C. Other Homey surfaces
- **Energy dashboard (✅, mostly done):** `homeBattery` + charged/discharged, smart-meter
  cumulative import/export, solar exported production are all wired. Action item: fix H2
  double-count so the Energy numbers are trustworthy; consider exposing per-unit battery Wh only
  if a reliable capacity field is confirmed (backlog Sprint H — currently 🟡).
- **Insights (✅):** measurements auto-log. Action: stop presenting the **unreliable
  consumption** metric as authoritative (review M6) — hide by default or label experimental.
- **Device settings:** add a **device-picker-free** onboarding is already done; add a clear
  "History model code" help and auto-detect where possible (backlog Sprint E).
- **Capability layout / mobile UI:** ensure `capabilitiesOptions` ordering puts the key controls
  (mode, reserve, limits, feed-in) first; group PV strings. Correct BK41 PV count (H5) so Max
  users don't see empty PV tiles.
- **Per-socket metering (🟡):** confirm `powGetSchuko1/2` on hardware for `stream_socket`
  (backlog Sprint E) — already scaffolded.

## D. Reconciliation with existing backlog
- **Sprint G/K (per-unit richness, microinverter):** ✅ already shipped (v1.5.0). No action.
- **Sprint H (battery Wh/capacity):** 🟡 keep deferred until a reliable capacity field is
  confirmed; Widget 2 shows time-to-full/empty instead of Wh for now.
- **Sprint I/J/L (daily stats/earnings/forecast/tariff rates):** 🚫/🟡 mostly not on the open API;
  rely on Octopus for tariff. Only the history model-code fix (Sprint E) is actionable.
- **New in this evaluation:** the 5-widget set (A), the reliable-trigger fixes + threshold
  triggers/conditions (B), and the Insights consumption-labelling cleanup (C).

## E. Prioritised feature list (feeds the sprints)
1. **5 distinct widgets + accurate previews** (A) — *certification blocker* → Sprint 1.
2. **Trigger/condition correctness + safe tariff release action** (B, ties to H1/M1/M2) → Sprints 2–3.
3. **New threshold triggers/conditions** (grid/solar/reserve) (B) → Sprint 4.
4. **Insights consumption labelling + BK41 PV fix + capability ordering** (C, H5) → Sprints 2–4.
5. **Deferred (🟡/🚫):** battery Wh, earnings/forecast, tariff rates — documented, not built.

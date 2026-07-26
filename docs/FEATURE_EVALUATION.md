# Feature Evaluation — EcoFlow STREAM Series (v1.8.6 basis)

> Phase 2 deliverable. Evaluates additive value across **widgets**, **Flow cards**, and other
> **Homey surfaces** against what the **current** release already ships, grounded in
> `docs/PRODUCT_RESEARCH.md` and `docs/CODE_REVIEW_v1.8.6.md`. Feasibility: ✅ open API/MQTT data
> exists · 🟡 needs a spike · 🚫 not on the open API.

## What the current release already has (don't rebuild)
- **5 widgets**: `stream_flow` (Energy Flow), `stream_balance` (Today Balance),
  `stream_battery_plan` (Battery Plan), `stream_solar_forecast` (Solar Target),
  `stream_tariff_opportunity` (Tariff Opportunity) — all functionally distinct, all sharing one
  generic placeholder preview (the certification issue), plus a shared `stream_common.js` provider
  and device binding via `device.getId()`.
- **Flow**: 8 actions, 6 conditions, 12 triggers (operating mode, backup reserve, charge/discharge
  limits, feed-in, tariff helpers cheap-import/peak-export; grid/solar/charge triggers via the
  correct `flowStates` state machine; fault + online/offline triggers).
- **Energy**: home battery + smart-meter cumulative + solar production; `EnergyCheckpoint`
  coalesced persistence (see review H2 for its restart bug).
- **Capabilities/icons**: 25 custom capability icons; per-model device icons; backup reserve 3–100%.
- **Security/host**: `apiHost.ts` origin allow-list (good).

## A. Widgets — fix, don't add (certification + correctness)
The 5 widgets are enough; the work is **quality**, and it maps directly to review findings:
| Item | Action | Source |
|---|---|---|
| Identical previews | Generate a distinct light/dark preview from dedicated text-free vector artwork on a transparent 1024x1024 canvas | H5 |
| Energy Flow arrows | Fix reversed grid direction (import = Grid→Home) | M2 |
| "Solar Forecast" naming | Rename UI/api to "Solar Target/Progress" (matches compose) or add a real forecast (🟡) | M3 |
| "Tariff Opportunity" naming | Rename to "Energy Recommendation" or feed price/window data (🟡) | M4 |
| Unreliable consumption | Qualify/omit consumption & independence in widgets | M5 |
| No-device state | Clear/mute all values, not just the title | L1 |

Optional (✅, low risk): a widget **settings** toggle to hide experimental metrics; per-widget
`height` tuning. No new widgets recommended — 5 is the right number for the reviewer's expectation.

## B. Flow cards — additive value (master lacks these)
Master still ships the original card set; these feasible additions were validated as useful:
- **Action: "Release battery for export now"** (✅) — performs the **8524-safe** discharge-limit→
  reserve sequence + feed-in on; doubles as the concrete vehicle for the H1 fix. High value for
  tariff/export automation.
- **Condition: Solar power is below X** (✅) — mirror of the existing `solar_power_above`.
- **Condition: Battery is charging from solar** (✅) — PV surplus exceeds home load
  (`measure_power.pv/.load`).
- **Trigger: Grid import rises above X W** / **Grid export rises above X W** (✅) — threshold
  crossings (distinct from the on/off `grid_*_started` edges), useful for tariff thresholds.
- 🟡 Deferred: earnings/forecast/price-based triggers — EcoFlow open API exposes no
  earnings/forecast/tariff data (`PRODUCT_RESEARCH.md §4`); rely on the user's Octopus integration.

## C. Other Homey surfaces
- **Energy dashboard (✅, once H2/H3 fixed):** the metadata is correct; the priority is making the
  numbers trustworthy (fix the restart meter regression H2 and the cross-mode double-count H3).
- **Insights (✅):** stop presenting the unreliable consumption metric as authoritative (M5).
- **Capability layout:** correct BK41 PV count (M1) so STREAM Max owners don't see empty PV tiles;
  verify the 25 capability icons all render on-device.
- **Device settings:** the existing history model-code + poll-interval settings are fine; consider a
  clearer hint that consumption is experimental.
- **Per-socket metering (🟡):** confirm `powGetSchuko1/2` on hardware for `stream_socket`.

## D. Reconciliation with existing backlog (`FEATURE_BACKLOG.md`, `ENERGY_ROADMAP.md`)
- Per-unit richness + microinverter device: already shipped. No action.
- Battery Wh/capacity (🟡): keep deferred (no reliable capacity field); Battery Plan widget uses
  time-to-full/empty instead.
- Earnings/forecast/tariff rates (🚫/🟡): not on the open API — rely on Octopus.

## E. Prioritised feature list (feeds the sprints)
1. **Widget quality pass** (A) — distinct previews + arrow/naming/consumption/no-device fixes →
   Sprint 1 (certification blocker).
2. **Reliable-energy + safe-control fixes** (H1/H2/H3, and the safe "release for export" action) →
   Sprint 2 (+ the action lands the flow feature on the fix).
3. **New Flow cards** (B: solar-below, charging-from-solar, grid threshold triggers) → Sprint 4.
4. **BK41 PV fix + Insights consumption labelling + capability-icon check** (C, M1/M5) → Sprints 3–4.
5. **Deferred (🟡/🚫):** real solar forecast, tariff-aware recommendations, earnings, battery Wh —
   documented, not built (blocked on data sources).

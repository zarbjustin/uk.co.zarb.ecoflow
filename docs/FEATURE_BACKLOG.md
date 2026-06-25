# EcoFlow App → Homey: Feature Backlog (from app screenshots + live MQTT)

Derived from the EcoFlow mobile app screens (system home, inverter statistics,
per-unit detail, aggregated savings, microinverter) and **verified against live
MQTT** on the account. Each item notes data availability:
✅ confirmed in MQTT · 🟡 needs investigation (likely separate API) · ⚙️ derived.

## Live-data facts that shape this
- Per-unit MQTT carries far more than REST: per-string PV power
  (`powGetPv`/`powGetPv2`/`powGetPv3`), `bmsChgRemTime`/`bmsDsgRemTime`,
  `remainCap`/`fullCap`/`designCap`, `accuChgEnergy`/`accuDsgEnergy`,
  `acTotalActivePower`, `chgDsgState`, per-unit `gridConnectionPower`.
- The system main's `powGetPvSum` is the **whole-system** solar total
  (= `powGetSysLoadFromPv`), so the dedicated Solar device is already correct.
- System load breakdown is present on the main: `powGetSysLoadFromPv/Bp/Grid`.
- Not found in quota (likely separate EcoFlow APIs): generation **efficiency %**,
  **predicted/forecast** generation, **earnings (£)** / tariff rates.

---

## Sprint outcomes (after the live spike)
- ✅ **G — Per-unit richness** (v1.5.0): each STREAM Unit now shows its own Solar
  (+PV1–4) and charge/discharge **time-to-full/empty**. PV mapping is scope-aware
  (unit = own strings; system = firmware total `powGetPvSum`).
- ✅ **K — Microinverter device** (v1.5.0): the STREAM Microinverter now pairs as a
  `solarpanel` device (PV1/PV2 + generated kWh + grid feed) — its rich data is on
  MQTT even though its REST quota is empty.
- 🟨 **H — Battery stored energy (Wh)**: charge/discharge **time** is delivered
  (system + per-unit). Absolute **Wh** is NOT added — the capacity fields
  (`remainCap`/`fullCap`/`designCap`) don't map cleanly to the app's Wh figure
  (modules stack), so a wrong number would be worse than none. Revisit if a
  reliable energy/capacity field is confirmed.
- 🚫 **I — Daily stats / efficiency / forecast**, **J — Earnings/savings**,
  **L — Tariff rates**: NOT available via the EcoFlow **open** IoT API. The history
  endpoint rejects every code we try (error 1006 across BK61/STREAM/etc.), and
  there are no efficiency/forecast/earnings/tariff fields in the device quota.
  These are EcoFlow **app-internal** analytics (private cloud API) — out of scope
  to reverse‑engineer (unstable, like `target_power`).

---

## Sprint G — Per-unit richness ✅ (high value, low risk)
Mirror the EcoFlow per-unit detail screen (Ultra X / AC Pro).
- **Per-unit solar**: `measure_power.pv` (sum of the unit's own strings, NOT the
  main's `powGetPvSum` which is the system total) + `measure_power.pv1..4`.
- **Per-unit charge/discharge remaining time**: `charge_remaining` /
  `discharge_remaining` from `bmsChgRemTime`/`bmsDsgRemTime`.
- (Optional) per-unit **AC output power** (`acTotalActivePower`).
- Implementation: add the capabilities to `stream_unit` compose; make
  `mapStreamQuota('unit')` compute PV from the unit's own strings. The mapping
  already yields charge/discharge time. **Compose-only + small mapping tweak.**
- Acceptance: each STREAM Unit shows its own Solar (+PV1-4) and time-to-full/empty.

## Sprint H — Battery stored energy & capacity ✅⚙️
The app shows "36% / 3840 Wh" and capacity.
- **Stored energy (Wh)** + **full/design capacity**: derive from
  `remainCap`/`fullCap`/`designCap` (verify the unit — `fullCap=200000`,
  `remainCap≈SoC×fullCap`) or `accuChgCap`/`accuDsgCap`. Add a `meter_power`-style
  "stored energy" or a numeric Wh capability on the battery + per unit.
- **System estimated charge/discharge time** on the STREAM Battery device.
- Acceptance: battery shows kWh stored + capacity, matching the app.

## Sprint I — Daily statistics & forecast 🟡
The inverter "statistics" screen (Solar generation, efficiency, predicted today,
impact).
- **Fix the history `code` first** so `energy_*_today`, savings, CO₂ actually
  populate (today they likely don't — the BK621 prefix is unverified).
- **Generation efficiency %** — find the source field/endpoint.
- **Predicted generation today** (forecast curve + kWh) — investigate EcoFlow's
  forecast endpoint; expose as a capability/insight.
- **CO₂ impact / trees** — `co2_today` exists; surface trees-equivalent.
- Acceptance: daily solar/efficiency/forecast/CO₂ tiles populate or are hidden.

## Sprint J — Earnings & savings 🟡
The "Aggregated savings" screen (today/month/lifetime £, per-system, calendar).
- **Earnings today / month / lifetime (£)** and per-system breakdown — these come
  from EcoFlow's savings/earnings API combined with the tariff config; investigate
  the endpoint. We already have `energy_savings_today` (history-based).
- Acceptance: a "savings today" + "lifetime savings" capability that matches the app.

## Sprint K — STREAM Microinverter device 🟡
The app shows the Microinverter (`STREAM Microinverter-0489`) with PV1/PV2 + grid
connection port — a device we currently **exclude** (its REST quota is empty).
- Investigate whether the Microinverter (`BK01`) publishes PV/grid data over MQTT;
  if so, add a dedicated (solarpanel or "other") device for it.
- Acceptance: the microinverter appears with its PV1/PV2 + grid port (if data exists).

## Sprint L — Tariff / rates 🟡 (low priority)
The home screen shows Consumption rate (£0.56) and Feed-in rate.
- If the open API exposes the STREAM tariff config, show consumption/feed-in rates
  as read-only info. Otherwise rely on the user's Octopus integration for tariffs.

---

## Recommended order
G (immediate, confirmed data) → H (capacity/Wh) → I (history fix unlocks daily
stats + forecast) → J (earnings) → K (microinverter) → L (tariff).

## Notes
- G and H are **confirmed feasible now** (MQTT data exists) and low risk.
- I, J, K, L need an API/endpoint investigation spike before committing.
- `target_power` remains infeasible (no watt setpoint), unchanged.

---

## Hardware-verification notes (v1.8.0)
- **Self-heating capability (`self_heating`)** — added as a read-only tile that the
  STREAM Unit adds *on demand* when the quota reports a heating field. Candidate field
  names tried in `lib/streamMapping.ts`: `bmsHeatingStatus`, `heatingStatus`,
  `selfHeating`, `heatStatus`, `sysHeatStatus`. **Confirm the real field on a cold-running
  unit** and prune the candidate list once known.
- **MPPT input counts** — corrected from official specs: STREAM Ultra (BK11)=4,
  STREAM Pro (BK12)=3, STREAM Ultra X (BK61)=4. **STREAM Max (BK41)** is not officially
  documented; currently treated as a 4-input solar model — verify its true PV-input count
  on hardware and adjust `lib/streamModels.ts` if it produces empty PV tiles.
- **AC-output rating (`ac_output` setting)** — informational, model-derived (Ultra/Ultra X
  note the 2300 W paired figure). Confirm STREAM Max's rating.

# Multi-Model Code Review & Bug Bash — EcoFlow STREAM Series v1.8.6 (current release)

> Phase 1 deliverable. Three independent parallel full-code reviews on **GPT-5.6 Sol**, **GPT-5.5**,
> and **Claude Opus 4.8** over the **current** `origin/master` (v1.8.6), de-duplicated and
> severity-ranked. HIGH findings re-verified against source. Baseline: `npm test` = 46/46.
>
> This is a re-review on the up-to-date code. Master independently added `EnergyCheckpoint.ts`,
> `flowStates.ts`, `apiHost.ts`, 25 capability icons and 5 widgets since the v1.8.0 review, so this
> report notes which earlier findings master **already fixed** and focuses on what's still broken /
> newly introduced.

## Summary table
| # | Severity | Finding | Consensus | Area |
|---|---|---|---|---|
| H1 | High | `set_backup_reserve` never lowers discharge limit first / never verifies → error 8524 silent no-op | S,5,O + verified | Flow/control |
| H2 | High | No device `onUninit` → `EnergyCheckpoint` not flushed on restart → `meter_power` **regresses (non-monotonic)** | O + verified | Lifecycle/Energy |
| H3 | High | Battery kWh double-counts across modes (MQTT `accu*` counters vs REST power integration) | S,5,O | Energy |
| H4 | High | MQTT `establish()` ignores `ended` → live session leaks past `end()`/uninit (duplicate session) | O | MQTT |
| H5 | High | **All 5 widget previews are byte-identical** (one shared placeholder) — certification blocker | S + verified | Widgets/cert |
| M1 | Med | STREAM Max (BK41) coded 4 PV inputs (likely 2) → phantom empty PV3/PV4 tiles | S,5,O | Model spec |
| M2 | Med | Energy Flow widget draws grid direction arrows **backwards** | S + verified | Widgets |
| M3 | Med | "Solar Forecast" widget performs no forecast (compares today's generation to a static target) | S | Widgets |
| M4 | Med | "Tariff Opportunity" widget consumes no tariff/price data | S | Widgets |
| M5 | Med | Widgets show known-unreliable consumption/independence without qualification | S,5 | Widgets/data |
| M6 | Med | Daily history goes stale after midnight; blank `indexValue` parses as 0 | 5 | History |
| M7 | Med | `reconnect()` during an in-flight `establish()` awaits the stale attempt → creds/region not refreshed | O | MQTT |
| L1 | Low | Widgets leave stale values visible on "no device" (only the title changes) | S | Widgets |
| L2 | Low | `connect()` doesn't clear a pending `reconnectTimer` on success | O | MQTT |
| L3 | Low | `app.ts` leaves `this.mqtt` non-null when `mqtt_enabled === false` | O | App |
| L4 | Low | Optimistic `setCapabilityValue` after `send()` can show an unconfirmed value | O | Control |

## Prior findings master ALREADY fixed (do NOT re-do)
- Trigger state machines: `lib/flowStates.ts` correctly suppresses the first sample and fires
  idle→active / tri-state grid import/export (fixes the earlier M1/M2). ✅
- Empty-string/NaN parsing: `lib/quota.ts` + `lib/streamMapping.ts` guard `v.trim() !== ''`
  (fixes the earlier socket/quota L1). ✅
- Poll/MQTT intra-mode double-count: `queueQuota`/`applyChain` serialization + synchronous
  timestamp re-anchor (earlier M4). ✅
- Smart-meter cumulative meters track grid power independent of display mode. ✅
- Widget device binding uses `device.getId()` with an index fallback (earlier L2). ✅

---

## HIGH

### H1 — Backup-reserve path ignores discharge-limit ordering / no verify (error 8524 silent no-op)
**Files:** `drivers/stream/device.ts:135` (capability listener), `:337-341` (`flowSetBackupReserve`),
`:363-386` (`flowPrepareCheapImport`/`flowPreparePeakExport`); `drivers/stream_unit/device.ts:154-165`;
`lib/streamProtocol.ts:27` (`backupReserve` clamps 3–100 only).
**Evidence:** every reserve write is a bare `send(StreamCmd.backupReserve(...))` followed by an
optimistic `setCapabilityValue`; no path reads/lowers `discharge_limit` to `≤ reserve-3` or verifies.
**Impact:** EcoFlow rejects a reserve that doesn't exceed the discharge limit by ~3 with **error
8524**. Low-reserve requests (esp. `flowPreparePeakExport`, which drops reserve to free the battery)
silently no-op while the UI shows the requested value — defeating the core tariff/export use case.
**Fix:** Centralise reserve changes: read `discharge_limit`; if `reserve ≤ limit+3`, send
`dischargeLimit(max(0, reserve-3))` first; then `backupReserve(reserve)`; then poll & verify the
device value changed (throw/notify otherwise). Wire the capability listener + all flow helpers
through it, on both `stream` and `stream_unit`. Add an 8524-ordering test.

### H2 — Missing `onUninit` → energy checkpoint not flushed → `meter_power` regresses on restart
**Files:** `lib/BaseEcoFlowDevice.ts:166-172` (`onTeardown` only via `onDeleted`; `grep onUninit` =
0 hits); `lib/EnergyCheckpoint.ts:3,15-24` (`CHECKPOINT_MS = 60_000`, flush only on explicit call);
`drivers/stream/device.ts:62,69-70,420-423` (reloads stale store on `onReady`, pushes to meter).
**Evidence (verified):** no device implements `onUninit`; `onTeardown()` (which calls
`energyCheckpoint.flush()`) runs only from `onDeleted`. Homey calls **`onUninit`** (not `onDeleted`)
on app update / reboot / re-init.
**Impact:** Up to ~60 s of accumulated `chargedWh/dischargedWh/importWh/exportWh` is **not persisted**
on restart; `onReady` then reloads the stale (lower) store value and pushes it to
`meter_power.*`, so the cumulative meter **decreases** across the restart. Homey's Energy dashboard
treats a decrease as a meter reset → **corrupted lifetime totals**. Also skips MQTT unsubscribe on
uninit. This is a *new* consequence of master's `EnergyCheckpoint` coalescing.
**Fix:** Add `async onUninit()` to `BaseEcoFlowDevice` that clears `pollTimer`, unsubscribes
realtime, and `await this.onTeardown()` (flush checkpoints) — mirroring `onDeleted`.

### H3 — Battery kWh double-counts across accounting modes
**File:** `drivers/stream/device.ts:175-219`; `lib/energyIntegration.ts:9-14`.
**Evidence:** `updateBatteryEnergy` uses the reset-proof `followResettableCounter` path only when the
*current* payload carries `accuChgEnergy/accuDsgEnergy`, else it integrates `measure_power` — with
**no sticky latch** disabling integration once counters have been seen. REST returns `accu*` empty
but still returns battery power, so on firmware that emits `accu*` over MQTT: MQTT(counter) advances
totals → REST(power) adds the same interval again. `queueQuota` serialization prevents a data race
but not this cross-mode overlap. `EnergyCheckpoint` only coalesces persistence; it doesn't reconcile.
**Impact:** `meter_power.charged/.discharged` inflate whenever counters and power both arrive
(latent — only on counter-reporting firmware, which is why it's easy to miss).
**Fix:** Add a persistent `countersAvailable` latch; once any `accu*` is seen, stop integrating
power for battery energy. Add an interleaved MQTT-counter/REST-power test.

### H4 — MQTT `establish()` ignores `ended` → session survives teardown
**File:** `lib/EcoFlowMqtt.ts:83-121` (assigns `this.client` only *after* `await
api.getCertification()`, never rechecks `this.ended`); `end():225-233` (only tears down an
already-assigned client, doesn't await `this.connecting`).
**Impact:** If `end()` runs while a `connect()`/`establish()` is mid-cert-fetch (e.g. a device
subscribes during app `onUninit`), `end()` closes nothing, then `establish()` opens and retains a
**live broker session** past uninit → EcoFlow's single-session limit rejects/flaps the next start.
**Fix:** After the cert `await` in `establish()`, bail + close the just-created client if
`this.ended`; have `end()` `await this.connecting` before tearing down.

### H5 — All 5 widget previews are byte-identical (certification blocker)
**Files:** `widgets/*/preview-light.png` (all share one SHA-1), `widgets/*/preview-dark.png` (all
share one SHA-1) — verified. The 5 widgets' layouts genuinely differ (see the differentiation table
below), so the shared generic placeholder both reproduces the reviewer's complaint and
misrepresents 4–5 widgets.
**Impact:** Exactly the reviewer note: "all the widget previews are identical." Resubmission blocker.
**Fix (Sprint 1):** Render a distinct light/dark preview from each real widget HTML populated with
representative data (Playwright → PNG).

---

## MEDIUM

### M1 — STREAM Max (BK41) declares 4 PV inputs (likely 2) → phantom PV3/PV4 tiles
`lib/streamModels.ts:62-68` (`solarInputs: 4`) → `drivers/stream_unit/device.ts:118-139` provisions
`stream_unit_power_pv3/pv4`. Datasheets indicate 2×500 W (see `docs/PRODUCT_RESEARCH.md §5`).
**Fix (HW-gated):** set `BK41.solarInputs = 2`; add a model-spec test.

### M2 — Energy Flow widget reverses grid direction arrows
`widgets/stream_flow/public/index.html:70-74,117`: `d.grid > 5 ? '→'` renders Home→Grid for a
positive value, but positive grid = **import** (Grid→Home). **Fix:** `←` for import (positive),
`→` for export (negative).

### M3 — "Solar Forecast" widget performs no forecast
`widgets/stream_solar_forecast/*`: compares today's generated solar to a static user `target`; the
compose name is "STREAM Solar Target" but the UI/api say "Forecast". **Fix:** rename UI/api to
"Solar Target/Progress" (matches compose) until a real forecast source exists.

### M4 — "Tariff Opportunity" widget is not tariff-aware
`widgets/stream_tariff_opportunity/api.js:10-26`: recommendations use only live power/SoC/feed-in —
no price/window data — so "import now" can be suggested during an expensive period. **Fix:** feed it
price/window data, or rename to a neutral "Energy Recommendation".

### M5 — Widgets present unreliable consumption/independence unqualified
`widgets/stream_common.js:68-74`, `widgets/stream_balance/…`, `widgets/stream_solar_forecast/…`
surface `energy_consumption_today`/`energy_independence` (known inflated — `PRODUCT_RESEARCH.md §5`)
next to reliable solar, with no caveat. Also the capability itself
(`.homeycompose/capabilities/energy_consumption_today.json`) is a normal Insights sensor.
**Fix:** label experimental / omit / derive from reliable meters; keep out of Insights by default.

### M6 — Daily history stale after midnight; blank parses as 0
`drivers/stream/device.ts:82-127`, `lib/streamHistory.ts:71-76`: cleanup only removes `null` on
startup; a day rollover or API gap leaves yesterday's totals shown as "today"; `Number('')===0`
resets a metric to 0. **Fix:** track the local history date and reset daily caps on change / absence;
parse with `trim() !== ''`.

### M7 — `reconnect()` during an in-flight `establish()` skips the credential refresh
`lib/EcoFlowMqtt.ts:64-76` + `connect():44-62`: after a credential/region change, if a `connect()`
is already mid-`establish()` (cert fetched with old creds), `reconnect()` just awaits it and returns
— new creds don't reach the live session until a later disconnect. **Fix:** await `this.connecting`
then force a fresh `establish()`, or use a creds-epoch check.

---

## LOW
- **L1** Widgets only change the title on "no device"; stale measurements stay visible — clear/mute
  all values (`widgets/*/public/index.html`). *(Folded into Sprint 1.)*
- **L2** `connect()` doesn't clear a pending `reconnectTimer` on success (`EcoFlowMqtt.ts:44-62`) —
  benign; clear for clarity.
- **L3** `app.ts:26-30` leaves `this.mqtt` non-null when disabled — dangling reference; low.
- **L4** Optimistic `setCapabilityValue` after `send()` in flow helpers shows an unconfirmed value
  until the +1.5 s re-poll.

## Verified CORRECT (no action — reassurance for the reviewer)
- **Security:** HMAC-SHA256 signing correct (canonical sorted params + nonce + timestamp; JSON vs
  query signed correctly); no secret leakage in logs; MQTT uses the short-lived cert account, not
  the secret. `lib/apiHost.ts` allow-lists only the two approved EcoFlow origins and throws before
  attaching credentials (good SSRF hygiene). REST cache key includes host+accessKey+secret
  fingerprint (no cross-account cache bleed).
- **Energy core:** `energyIntegration.ts` pure functions (anchoring, reset-as-delta, `MAX_GAP_MS`
  clamp) correct; `queueQuota` serialization + synchronous re-anchor prevent intra-mode double count.
- **Triggers:** `flowStates.ts` idle→active / tri-state edges correct.
- **Reserve range:** command + capability both allow 3–100%. All 46 tests pass; all referenced
  capability SVGs exist and parse.

## Fix routing
- **Sprint 1 (widgets, certification):** H5 (distinct previews) + M2 (grid arrows) + M3/M4 (naming)
  + M5 (consumption caveat) + L1 (no-device state).
- **Sprint 2 (High):** H1, H2, H3, H4 (+ regression tests).
- **Sprint 3 (Medium/Low):** M1 (BK41), M6 (history), M7 (reconnect), L2–L4.

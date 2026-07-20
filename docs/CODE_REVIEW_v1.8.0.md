# Multi-Model Code Review & Bug Bash — EcoFlow STREAM Series v1.8.0

> Phase 1 deliverable. Produced from three independent, parallel full-codebase reviews on
> **GPT-5.6 Sol**, **GPT-5.5**, and **Claude Opus 4.8**, then de-duplicated and severity-ranked.
> Every HIGH finding and the key MEDIUMs were **re-verified against the source** before inclusion.
> Baseline at review time: `npm test` = 36/36 passing.

## How to read this
- **Severity:** High = correctness/energy/reliability bug users will hit or a certification risk;
  Medium = real bug in a narrower path or degraded UX; Low = robustness/maintainability.
- **Consensus:** which of the 3 models independently raised it (S=GPT-5.6 Sol, 5=GPT-5.5, O=Opus).
- Findings feed the sprint plan (`docs/SPRINTS.md`): High → Sprint 2, Medium → Sprint 3.

## Summary table
| # | Severity | Finding | Consensus | Area |
|---|---|---|---|---|
| H1 | High | `set_backup_reserve` ignores discharge-limit ordering → error 8524 silent no-op | S,5,O + verified | Flow/control |
| H2 | High | Battery kWh meters double-count when mixing raw counters (MQTT) + power integration (REST) | S,O + verified | Energy |
| H3 | High | MQTT pending reconnect timer not cleared on (re)connect → duplicate session + leaked client | O + verified | MQTT |
| H4 | High | `establish()` doesn't check `ended` → live MQTT session survives app uninit | O + verified | MQTT |
| H5 | High* | STREAM Max (BK41) coded as 4 PV inputs (likely 2) → phantom empty PV tiles | S,5,O + research | Model spec |
| M1 | Med | Grid import/export triggers use 2-state (`grid<-5`) for a 3-state reality | S,5,O + verified | Flow triggers |
| M2 | Med | `charging_started`/`discharging_started` suppressed on idle→active edge | S,5 + verified | Flow triggers |
| M3 | Med | No `onUninit` device teardown → MQTT handlers/timers leak on disable/re-init | S,O + verified | Lifecycle |
| M4 | Med | Overlapping REST polls, no in-flight guard → stale out-of-order applies | S + verified | Polling |
| M5 | Med | Credential/MQTT setting changes not applied to live devices | S,O | Settings |
| M6 | Med | Daily-history staleness after midnight; unreliable consumption exposed as Insight | S,5 | History/Insights |
| M7 | Med | `connect()` treats an existing-but-disconnected client as connected | O | MQTT |
| L1 | Low | Socket quota `Number('')→0` turns absent values into off/0 W | S | Parsing |
| L2 | Low | Widget uses ordinal index (not device id); overlapping refresh; no teardown | S,O | Widget |
| L3 | Low | No bounded retry/backoff on transient REST failures | O | REST |
| L4 | Low | Broad `Record<string,any>` / `args: any` hide type errors | S | Types |

\*H5 is hardware-gated (confirm BK41 MPPT count) but is a real correctness/UX + certification concern.

---

## HIGH

### H1 — Backup-reserve set path ignores discharge-limit ordering (error 8524 → silent no-op)
**Files:** `drivers/stream/device.ts:129` (capability listener), `:327-330` (`flowSetBackupReserve`),
`:364-367` (`flowPreparePeakExport`); `drivers/stream_unit/device.ts:119-129`;
`lib/streamProtocol.ts` (`StreamCmd.backupReserve` only clamps 3–95).
**Evidence:**
```ts
async flowSetBackupReserve(level) { await this.send(StreamCmd.backupReserve(this.mainSn, level));
  await this.setCapabilityValue('backup_reserve_soc', level).catch(()=>{}); }
async flowPreparePeakExport(reserve) { await this.send(StreamCmd.backupReserve(this.mainSn, reserve)); ... }
```
**Impact:** EcoFlow rejects a reserve that isn't ~3 above `discharge_limit` with error 8524; the
PUT can still return `code 0`, so the error is swallowed, the capability optimistically shows the
requested value, and the battery never changes. `flowPreparePeakExport` is the worst case: it
lowers reserve to free the battery for a peak/export window but never lowers `discharge_limit`
first, so the release **silently no-ops and the battery won't discharge** — defeating the app's
core tariff use case.
**Fix:** Centralise all reserve changes in one helper: read current `discharge_limit`; if
`reserve ≤ dischargeLimit + 3`, lower `discharge_limit` (to `reserve-3` or floor) first; set
reserve; poll and **verify** the reported value changed, else throw a clear error. Use it from the
capability listener, `set_backup_reserve` action, and both tariff helpers. Only write the
capability after verification. Add a regression test for the 8524 ordering.

### H2 — Battery charged/discharged meters double-count (raw counters vs power integration)
**File:** `drivers/stream/device.ts:171-213` with `lib/energyIntegration.ts`.
**Evidence:** `updateBatteryEnergy` accumulates into the same `chargedWh`/`dischargedWh` from two
sources: a `followResettableCounter` path when `accuChgEnergy/accuDsgEnergy` are present, and an
`integrateSignedPower` fallback when they're absent — both re-anchoring the same accumulator.
**Impact:** REST polls (which the module doc says return empty `accu*`) integrate `power·dt` into
the accumulator, while any MQTT push that *does* carry `accu*` adds the full raw delta on top of
the same total. The result is steadily inflated, non-monotonic-in-truth `meter_power.charged/
.discharged`, and `followResettableCounter` then re-anchors on the inflated value so the error is
permanent. (Severity conditional on MQTT actually delivering `accu*`; confirm with a live payload
capture — but the mixing is a latent correctness bug either way.)
**Fix:** Make the source authoritative — once a raw counter has ever been observed, set a
`usingCounters` flag and stop the integration fallback (or reconcile raw deltas against energy
integrated since the last anchor). Add a mixed MQTT/REST sequence test.

### H3 — MQTT reconnect timer not cleared on (re)connect → duplicate session + leaked client
**File:** `lib/EcoFlowMqtt.ts:44-46, 63-73, 87-101, 117-130`.
**Evidence:** `scheduleReconnect()` arms `reconnectTimer` while `client===null`; the timer callback
calls `establish()` unconditionally. `connect()`/`reconnect()` create a client without clearing a
pending `reconnectTimer`.
**Impact:** If a client is established by another path (a device calling `connect()`, or
credential-change `reconnect()`) between scheduling and firing, the pending timer still fires
`establish()`, **overwrites `this.client`** (orphaning the first — its socket/timers/listeners
leak forever) and opens a **second broker session**. EcoFlow allows only one session per account,
so this causes rejection/flapping.
**Fix:** Clear any pending `reconnectTimer` at the start of `establish()` (and in
`connect()`/`reconnect()`): `if (this.reconnectTimer){clearTimeout(this.reconnectTimer);
this.reconnectTimer=null;}`.

### H4 — `establish()` ignores `ended` → a live MQTT session can survive app uninit
**File:** `lib/EcoFlowMqtt.ts:81-101, 234-241`; `app.ts` (`onUninit → mqtt.end()`).
**Evidence:** `end()` sets `ended=true` and closes `this.client` **only if it exists**;
`establish()` `await api.getCertification()` before assigning `this.client` and never checks
`ended`. `end()` doesn't await `this.connecting`.
**Impact:** If `end()` runs while an `establish()` is mid-certification-fetch (client still null),
`end()` closes nothing; `establish()` then resumes, assigns `this.client`, registers listeners and
stays connected — a leaked broker session + listeners surviving app uninit.
**Fix:** After the `getCertification()` await in `establish()`, bail and close the just-created
client if `this.ended`. Have `end()` `await this.connecting` before returning.

### H5 — STREAM Max (BK41) declares 4 PV inputs (hardware likely 2) → phantom empty PV tiles
**File:** `lib/streamModels.ts:47-49`; consumed by `drivers/stream_unit/device.ts`
(`tailorSolarCapabilities(spec.solarInputs)`).
**Evidence:** `BK41: { model: 'STREAM Max', solarInputs: 4 }` — but datasheets
(see `docs/PRODUCT_RESEARCH.md` §2/§5) indicate **2 × 500 W (1000 W)** for STREAM Max.
**Impact:** STREAM Max units dynamically gain `measure_power.pv3/pv4` tiles that never report —
empty tiles in the UI/Insights and wrong model info, exactly what the on-demand capability logic
elsewhere avoids. Certification reviewers dislike permanently-empty capabilities.
**Fix (hardware-gated):** Confirm BK41 MPPT count; set `BK41.solarInputs = 2` (and revisit the
`UNKNOWN` default of 4). Add a model-spec regression test. Track with the existing STATUS
hardware-confirm item.

---

## MEDIUM

### M1 — Grid import/export triggers use a 2-state model for 3-state reality
**File:** `drivers/stream/device.ts:233-242`.
**Evidence:** `const exporting = grid < -5; ... card = exporting ? 'grid_export_started' :
'grid_import_started';` Idle (~0 W) counts as "not exporting" = importing.
**Impact:** `grid_import_started` fires on export→idle (false positive); idle→real-import
(`grid>5`) fires nothing (missed). Unreliable automations.
**Fix:** Tri-state `importing (>5) / idle / exporting (<-5)`; fire only on entering
import/export from a different state.

### M2 — `charging_started`/`discharging_started` suppressed on idle→active edge
**File:** `drivers/stream/device.ts:244-258`.
**Evidence:** In the idle band `nowCharging=null` and `prevCharging` is set to `null`; the trigger
guard requires `prevCharging !== null`, so the next idle→charging/discharging edge is skipped.
**Impact:** After any idle period the "started charging/discharging" cards don't fire (the comment
claims otherwise — likely an incomplete v1.3.1 fix). 
**Fix:** Track explicit `charging/idle/discharging`; trigger on entering charging/discharging from
any different prior state after the first anchor.

### M3 — No device `onUninit` → MQTT handlers/timers leak on disable/re-init
**File:** `lib/BaseEcoFlowDevice.ts` (cleanup only in `onDeleted`); subclass timers via
`onTeardown` (history/attribution).
**Impact:** Homey calls `onUninit` (not `onDeleted`) on disable/enable and single-device re-init.
Old `quotaHandler`/`statusHandler` stay in `EcoFlowMqtt`'s handler sets referencing a dead
instance → duplicate `applyQuota` per push, stale-instance `setCapabilityValue` errors, and
handler accumulation. (`homey.setInterval` timers are auto-cleared, but MQTT handlers are not.)
**Fix:** Add an idempotent teardown called from both `onDeleted` and `onUninit` that unsubscribes
handlers and clears subclass timers/pending post-command polls.

### M4 — Overlapping REST polls with no in-flight guard → stale, out-of-order applies
**File:** `lib/BaseEcoFlowDevice.ts:87-103`; smartmeter `poll_interval` min 10 s vs ~15 s REST
timeout.
**Impact:** A slow request lets the next interval start; responses can apply out of order,
reverting newer MQTT state, causing false triggers and extra API load. Post-command polls also
race scheduled polls.
**Fix:** Serialise polls with an in-flight promise/mutex; optionally drop stale responses via a
sequence number.

### M5 — Credential/MQTT setting changes not applied to live devices
**File:** `lib/BaseEcoFlowDevice.ts:57-60` (client built once at `onInit`); `app.ts` MQTT.
**Impact:** After changing keys/region (or disabling MQTT) without re-pairing, devices keep using
stale REST credentials (401/region errors); MQTT may stay connected after being disabled.
**Fix:** App-settings change listener that recreates device REST clients and reconnects/ends MQTT
immediately, then triggers a refresh.

### M6 — Daily-history staleness after midnight + unreliable consumption as an Insight
**File:** `lib/streamHistory.ts`; `drivers/stream/device.ts:108-123`.
**Impact:** On empty/failed history the previous capability value is retained, so after midnight
yesterday's totals can display as "today." Also `energy_consumption_today` exposes EcoFlow's
known-inflated consumption as an authoritative Insight (see `docs/PRODUCT_RESEARCH.md` §5).
**Fix:** Track the date of cached values; clear/mark unavailable after rollover when no fresh
sample. Remove or clearly label consumption as experimental; never use it as load.

### M7 — `connect()` treats an existing-but-disconnected client as connected
**File:** `lib/EcoFlowMqtt.ts:44-46`.
**Impact:** If `this.client` exists but `connected===false` (mid-reconnect/half-open), `connect()`
returns as success; callers skip the polling fallback during a silent no-realtime window
(self-heals via the `connect` event, but with a gap).
**Fix:** Gate on `this.client?.connected` or an explicit connected flag.

---

## LOW

### L1 — Socket quota `Number('')→0` turns absent values into off/0 W
**File:** `drivers/stream_socket/device.ts:30-40`. Use `toFiniteNumber()` and a strict boolean
parser that rejects `''`/`null` instead of coercing to `0`/off.

### L2 — Widget: ordinal index, overlapping refresh, no teardown
**Files:** `widgets/stream_flow/api.js:11-18`, `public/index.html:83-118`. Ordinal `index` can
silently bind to a different system when devices change; `setInterval(refresh,3000)` has no
in-flight guard or teardown. Move to a device-id setting; serialise refresh; clear on unload.
(Also addressed by the Sprint-1 widget overhaul.)

### L3 — No bounded retry/backoff on transient REST failures
**File:** `lib/EcoFlowClient.ts`. One-shot flow actions surface transient 5xx/timeouts directly.
Add 1–2 jittered retries for idempotent GETs/timeouts.

### L4 — Broad `Record<string,any>` / `args: any` hide type errors
Introduce typed quota + Flow-argument interfaces incrementally.

---

## Verified CORRECT (not bugs — reassurance for the reviewer)
- **Synchronous timestamp re-anchor** (`stream/device.ts:182-184`, solar, smartmeter) correctly
  prevents poll+MQTT double-count in the *integration* path (concurrent call gets `dt=0`).
- **Handler-identity subscribe/unsubscribe** (`EcoFlowMqtt.ts`) uses per-SN `Set`s and only
  unsubscribes broker topics when the last handler is removed.
- **`followResettableCounter`** is monotonic and handles first-sample anchoring and resets.
- **Smart-meter cumulative meters** always integrate grid power regardless of the display-mode
  toggle — display source cannot corrupt totals.
- **`mqttOffline` precedence** prevents a stale REST 200 from overriding a realtime offline.
- **Shared MQTT is ended in app `onUninit`**; HMAC signing sorts flattened keys deterministically
  (golden-vector test); **no shipped code imports the disabled `powerStream*` modules**.

## Fix routing
- **Sprint 2 (High):** H1, H2, H3, H4, H5 (+ regression tests for each).
- **Sprint 3 (Medium/Low):** M1–M7, L1, L3, L4 (+ tests). L2 folded into **Sprint 1** widget work.

# EcoFlow STREAM — Next Sprint Wave (post code-review)

Status: planning · Produced from a **multi-model code review** (GPT‑5.4 + Gemini 3.1
Pro + Sonnet 4.6) of the app at v1.3.1. The high‑severity bugs the review found are
already fixed in v1.3.1 (see CHANGELOG). This document lists the **next wave** of
work, ordered by value.

## Already fixed in v1.3.1 (for reference)
- MQTT orphaned-client / duplicate-session race (`connect()` guard) + `onUninit` close + recreate on credential change.
- Energy double-counting under concurrent poll+MQTT (synchronous timestamp anchoring) across battery/solar/meter.
- Empty REST `accu*Energy` ('' → 0) guard (`lib/quota.toFiniteNumber`).
- Smart Meter cumulative meters decoupled from the grid/load display mode (no corruption on switch).
- `charging_started`/`discharging_started` idle-edge fix.
- Offline/online flapping (trust MQTT offline over stale REST 200).
- PowerStream unsubscribe handler-identity fix; `ensureCapability` double-add guard.

---

## Sprint A — Shared device/driver foundation (all 3 reviewers' top refactor)
**Goal:** Remove the ~50 lines of duplicated lifecycle boilerplate copied across all
6 drivers so fixes live in one place.
- `lib/BaseEcoFlowDevice.ts extends Homey.Device`: credential read + `EcoFlowClient`
  construction, poll-timer setup/teardown, `poll_interval` settings handling, and the
  `subscribeRealtime`/`unsubscribeRealtime` lifecycle (storing the handler ref).
  Subclasses implement `getReadSn()` and `applyQuota(quota)`.
- `lib/BaseEcoFlowDriver.ts`: the shared `onPair` (already partly in `lib/pairing.ts`)
  + the STREAM-unit grouping helper used by stream/stream_solar/stream_socket.
- Strongly type the app: export an `EcoFlowApp` interface and replace every
  `(this.homey.app as any).subscribeRealtime` with a typed `getApp(this)` helper.
- **Acceptance:** all drivers re-expressed on the base classes; behaviour unchanged;
  build/lint/tests/validate green; one place to fix lifecycle bugs.

## Sprint B — MQTT resilience & observability
**Goal:** Make the shared realtime path robust to real-world drops.
- Detect persistent auth failures / `close` storms and force a certificate refresh
  (re-`getCertification` + rebuild client) instead of looping on a stale cert.
- Exponential backoff + jitter; surface a single app-level "realtime connected"
  state; structured debug logging behind a setting.
- On credential change, re-subscribe existing devices (today they'd need a restart).
- **Acceptance:** simulated cert expiry recovers automatically; no duplicate sessions.

## Sprint C — Test coverage for the tricky paths
**Goal:** Lock in the v1.3.1 fixes and prevent regressions.
- Unit-test the concurrency-sensitive integration by extracting the pure step
  (compute → new totals) from the device so it's testable without Homey.
- Tests: MQTT counter + poll interaction (no double count), empty-string `accu*`,
  meter mode-switch monotonicity, charging-state idle edges, classifier edge cases,
  `EcoFlowMqtt` multi-handler subscribe/unsubscribe identity.
- **Acceptance:** meaningful coverage of energy/MQTT logic; all green in CI.

## Sprint D — Widget & UX polish
**Goal:** Make the dashboard widget robust and richer.
- Replace the fragile array-index device selection with the Homey **`devices`
  picker** (`Homey.getDeviceIds()`), filtered to the `stream` driver.
- Optional EcoFlow-style layout: big Grid headline, animated flow arrows, today's
  solar kWh, per-unit SoC strip.
- Add Flow triggers: "solar above/below X", "a unit's battery below X%",
  "operating mode changed" (some exist — audit and fill gaps).
- **Acceptance:** widget binds to a chosen system reliably; new flow cards validated.

## Sprint E — Data-availability & history truth-up (carry-over)
**Goal:** Resolve the remaining unknowns from the original roadmap.
- MQTT vs REST field-availability matrix; gate every capability that can be empty.
- Find the correct STREAM **history `code`** (likely the device `productName`) so the
  daily solar/grid/savings/CO₂ capabilities populate, or hide them when unknown.
- Per-socket metering (`powGetSchuko1/2`) confirmed on hardware for `stream_socket`.
- **Acceptance:** no permanently-empty tiles; daily stats work or are hidden.

## Sprint F — Store readiness & publish
**Goal:** Ship to the Homey App Store.
- App description/branding pass against store guidelines; driver pairing copy.
- `homey app validate --level publish` (already green) + Athom certification items.
- CI publish workflow (version bump + changelog), staged Test → Live.
- **Acceptance:** submitted for certification.

---

## Recommended order
A (foundation) → C (tests, leveraging A's testability) → B (MQTT resilience) →
D (widget/flows) → E (data truth-up) → F (publish). A first because it makes B–E
cheaper and safer; C right after A so the refactor is covered by tests.

## Deferred / not feasible
- `target_power` / `target_power_mode`: EcoFlow STREAM exposes no watt setpoint
  (confirmed). Revisit only if EcoFlow adds one.
- Per-unit AC-output control via member SN vs main SN: needs on-hardware verification.

# EcoFlow STREAM Series — Sprint Plan (v1.8.6 review)

> Ordered backlog from `docs/PRODUCT_RESEARCH.md`, `docs/CODE_REVIEW_v1.8.6.md`,
> `docs/FEATURE_EVALUATION.md` and `docs/SPECIFICATION.md`, for the **current release** (v1.8.6).
> Every sprint ends with: **build → lint → test → `homey app validate --level publish`**.
> Work lands on branch `copilot/review-v1.8.6` → PR. Version/publish stay user-owned.

## Sprint 1 — Widget quality pass (certification blocker)
**Goal:** each widget is recognisable at a glance and its App Store preview follows Homey's rules.
- **H5** Generate a **unique, simplified** `preview-light.png` + `preview-dark.png` per widget from
  purpose-built, text-free vector artwork. Export at 1024x1024 with a transparent canvas; do not
  render or screenshot the real widget HTML. Add `scripts/generate-widget-previews.mjs` +
  `npm run widgets:preview`.
- **M2** Fix the Energy Flow grid arrow direction (import = Grid→Home).
- **M3** Rename "Solar Forecast" UI/api → "Solar Target/Progress" (match the compose name).
- **M4** Rename "Tariff Opportunity" → "Energy Recommendation" (or gate behind real price data).
- **M5** Qualify/omit the unreliable consumption & independence values in widgets.
- **L1** On no-device/error, clear or mute all values (not just the title).
- **Acceptance:** 5 distinct preview pairs using simple shapes, no text or screenshots, transparent
  canvases and mode-appropriate colours; validate publish-clean; widgets render correctly.

## Sprint 2 — High-severity fixes
**Goal:** trustworthy energy + reliable control, with tests.
- **H1** Central **8524-safe reserve helper**: read `discharge_limit`; if `reserve ≤ limit+3`, lower
  the limit first; set reserve; poll & verify; only then write the capability. Wire the capability
  listener, `set_backup_reserve`, cheap-import/peak-export helpers on `stream` + `stream_unit`.
  Ship the **"Release battery for export now"** action on top of it (feature B). Test the ordering.
- **H2** Add `onUninit` to `BaseEcoFlowDevice` (mirror `onDeleted`): unsubscribe MQTT, clear timers,
  **flush `EnergyCheckpoint`** — so `meter_power.*` stays monotonic across restarts. Test the flush.
- **H3** Latch off power-integration once `accu*Energy` counters are seen (persistent
  `countersAvailable`); interleaved MQTT-counter/REST-power test proving no double-count.
- **H4** MQTT `establish()` bails + closes the client if `ended` after the cert await; `end()` awaits
  `connecting`. Test end-during-connect.
- **Acceptance:** all High fixed; new tests green; full gate green.

## Sprint 3 — Medium/low fixes & robustness
- **M1** `BK41.solarInputs = 2` (HW-confirm guard) + model-spec test (no phantom PV tiles).
- **M6** History: track the local date, reset daily caps on rollover/absence; parse `trim() !== ''`.
- **M7** `reconnect()` forces a fresh `establish()` when a connect is in-flight (creds/region refresh).
- **L2** Clear a pending `reconnectTimer` on successful connect.
- **L3** Null `this.mqtt` when `mqtt_enabled === false`.
- **L4** Keep optimistic writes but rely on verify (from H1) where it matters.
- **Acceptance:** each covered by a test where practical; full gate green.

## Sprint 4 — New features (flows)
- **Condition** `solar_power_below`; **condition** `charging_from_solar`
  (`measure_power.pv/.load`); **threshold triggers** `grid_import_above` / `grid_export_above`.
- **M5 follow-through:** label `energy_consumption_today` experimental at the capability level;
  verify the 25 capability icons render on-device.
- Update `.homeycompose/app.json` + rebuild; flow i18n + `titleFormatted`.
- **Acceptance:** new cards validate and appear; smoke-tested; full gate green.

## Sprint 5 — Polish & PR / certification readiness
- Final validation; update `docs/STATUS.md`, `docs/CERTIFICATION_REPLY.md` (per-widget previews),
  `docs/REVIEWER_NOTES.md`; changelog note for the next version bump; pre-submission checklist.
- Open the PR from `copilot/review-v1.8.6`; hand back for *Update Homey App Version* +
  *Publish Homey App*.
- **Acceptance:** clean validate; docs updated; PR opened.

## Already fixed on master (no work)
Trigger state machines (`flowStates`), empty-string parsing (`quota`), intra-mode poll/MQTT
double-count (`queueQuota`), smart-meter cumulative independence, widget device binding via
`getId()`, signing/SSRF/host security, 3–100% reserve range.

## Deferred (documented, not built)
Real solar forecast, tariff-aware recommendations, earnings/forecast/efficiency, battery Wh/capacity,
`target_power` — blocked on unavailable data sources / open-API limits.

## Dependency order
S1 (widgets) ∥ S2 (high) → S3 (medium/low) → S4 (features) → S5 (polish/PR). S1 and S2 are
independent; S5 depends on S1–S4.

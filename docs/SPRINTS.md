# EcoFlow STREAM Series — Sprint Plan (post v1.8.0 review)

> Ordered, acceptance-criteria-driven backlog produced from `docs/PRODUCT_RESEARCH.md`,
> `docs/CODE_REVIEW_v1.8.0.md`, `docs/FEATURE_EVALUATION.md` and `docs/SPECIFICATION.md`.
> Every sprint ends with the quality gate: **build → lint → test → `homey app validate
> --level publish`**. Versioning/publish stays user-owned (GitHub workflows). Target: **v1.9.0**.

## Sprint 1 — Widget overhaul + accurate previews  *(certification blocker)*
**Goal:** ship 5 distinct widgets, each with a preview that matches the real widget.
- Refactor `stream_flow` and add 4 new widgets per spec §7: **Energy Flow, Battery & Reserve,
  Solar Today, Grid Import/Export, Tariff/Octopus Status**.
- Each: `widget.compose.json` (with a **device-id picker** setting, not an ordinal index),
  `public/index.html`, `api.js` (typed snapshot; serialised + in-flight-guarded refresh; clears
  interval on unload — fixes review **L2**).
- Register all 5 in `.homeycompose/app.json`; rebuild `app.json`.
- Generate unique `preview-light.png` + `preview-dark.png` per widget by rendering each widget's
  HTML with fixture data via Playwright → PNG at the declared widget size.
- **Acceptance:** 5 widgets present and validate; each preview is a screenshot of its own widget
  (visibly different); `homey app validate --level publish` clean; widgets bind to a chosen device
  reliably. Draft an updated reviewer note referencing per-widget previews.

## Sprint 2 — High-severity bug fixes
**Goal:** fix all HIGH findings with regression tests.
- **H1** — Central reserve helper: read `discharge_limit`; if `reserve ≤ limit+3`, lower limit
  first; set reserve; poll+verify; only then write the capability. Wire capability listener,
  `set_backup_reserve`, `prepare_for_peak_export` through it. Test the 8524 ordering.
- **H2** — Single-source the battery meters: add a `usingCounters` flag; once `accu*Energy` seen,
  disable the power-integration fallback. Mixed MQTT/REST sequence test proving no double-count.
- **H3** — Clear pending `reconnectTimer` in `establish()`/`connect()`/`reconnect()`; no duplicate
  session. Test the schedule-then-connect race.
- **H4** — `establish()` bails + closes client if `ended` after the cert await; `end()` awaits
  `connecting`. Test end-during-connect.
- **H5** — Set `BK41.solarInputs = 2` (guarded as HW-confirm); reconsider `UNKNOWN` default;
  model-spec regression test so Max exposes no phantom PV tiles.
- **Acceptance:** all HIGH fixed; new tests green; full gate green.

## Sprint 3 — Medium/Low bug fixes & robustness
**Goal:** reliable triggers + lifecycle + settings.
- **M1/M2** — Tri-state grid (`import>5 / idle / export<-5`) and charge (`charge>5 / idle /
  discharge<-5`) state machines; fire only on entering an active state from a different state.
  Tests for idle→active and export→idle edges.
- **M3** — Idempotent teardown from both `onUninit` and `onDeleted` (unsubscribe handlers, clear
  timers incl. pending post-command polls).
- **M4** — Serialise polls with an in-flight guard; drop stale out-of-order responses.
- **M5** — App-settings change listener recreates device REST clients + reconnects/ends MQTT live.
- **M6** — Track history value dates; clear/mark unavailable after midnight rollover; label
  `energy_consumption_today` experimental (or hide by default).
- **M7** — `connect()` gates on `client?.connected`.
- **L1** — Socket parsing uses `toFiniteNumber` + strict boolean (no `''→0/off`).
- **L3** — Bounded jittered retry for idempotent REST GETs/timeouts.
- **Acceptance:** each fix covered by a test where practical; full gate green.

## Sprint 4 — New features (flows + surfaces)
**Goal:** additive, feasible value from the feature evaluation.
- **Flow:** new condition `solar_power_below`; condition `charging_from_solar`
  (`measure_power.from_pv/.from_grid`); threshold triggers `grid_import_above`/`grid_export_above`;
  action **"Release battery for export now"** (uses the H1 safe sequence).
- **Surfaces:** capability ordering (controls first, PV strings grouped); ensure BK41 layout clean;
  Insights consumption labelling from M6.
- **L4 (incremental):** typed quota + Flow-argument interfaces where touched.
- Update `.homeycompose/app.json` + rebuild; add flow i18n + `titleFormatted`.
- **Acceptance:** new cards validate and appear; smoke-tested logic; full gate green.

## Sprint 5 — Polish & certification readiness
**Goal:** ship-ready + resubmission.
- Final `homey app validate --level publish`; changelog entries for all fixes/features.
- Update `docs/STATUS.md` (next-actions), `docs/CERTIFICATION_REPLY.md` (per-widget previews +
  standalone justification), and `docs/REVIEWER_NOTES.md`.
- Pre-submission checklist; hand back to user for **Update Homey App Version** (minor → v1.9.0) +
  **Publish Homey App** workflows.
- **Acceptance:** clean validate; docs updated; checklist complete.

## Deferred (documented, not built)
Battery Wh/capacity (🟡 no reliable field), earnings/forecast/efficiency and tariff rates (🚫 not
on the open API), `target_power` watt setpoint (🚫). Revisit only if EcoFlow's open API adds them.

## Dependency order
S1 (widgets, independent) ∥ S2 (high bugs) → S3 (medium/low) → S4 (features) → S5 (polish).
S1 and S2 can proceed in parallel; S5 depends on S1–S4.

# Project Status & Handoff — EcoFlow STREAM Series

> Living status doc. Read this first when resuming work on `uk.co.zarb.ecoflow`.

## Outstanding / next actions (resume here)

- [ ] **Version bump to v1.9.0** via the *Update Homey App Version* workflow (minor), using the
  changelog below, then run *Publish Homey App* to create the next build.
- [ ] **Submit the new build** for certification and paste the updated `docs/REVIEWER_NOTES.md`
  (now covers the **5 distinct widgets** + previews) and `docs/CERTIFICATION_REPLY.md` into the
  review thread.
- [ ] On hardware: **confirm the self-heating field name** (candidates in
  `docs/FEATURE_BACKLOG.md`), the **STREAM Max PV-input count** (now set to **2** — verify), and
  the per-socket `powGetSchuko1/2` fields.
- [ ] Optional: verify the reserve/discharge **8524-safe sequence** and the new tariff Flows
  (release-for-export, grid threshold triggers) on the live STREAM.

### Suggested v1.9.0 changelog (for the version workflow)
> Five redesigned dashboard widgets each with its own accurate preview; more reliable grid/charge
> Flow triggers; safer backup-reserve control (fixes a silent no-op); accurate energy meters;
> sturdier realtime connection; new tariff Flow cards; STREAM Max solar-input fix.

## Review & hardening pass (2026-07-20)

A full multi-model review + implementation pass shipped on top of v1.8.0 (unreleased on `master`):
- **Deliverables:** `docs/PRODUCT_RESEARCH.md`, `docs/CODE_REVIEW_v1.8.0.md` (GPT-5.6 Sol +
  GPT-5.5 + Opus 4.8), `docs/FEATURE_EVALUATION.md`, `docs/SPECIFICATION.md`, `docs/SPRINTS.md`.
- **Widgets:** 1 → **5 distinct widgets** with per-widget previews (certification fix); device
  picker + robust refresh. Regenerate with `npm run widgets:preview`.
- **High-severity fixes:** backup-reserve 8524 ordering + verify (H1); battery-meter
  double-count guard (H2); MQTT duplicate-session/uninit races (H3/H4); STREAM Max PV count (H5).
- **Medium/low fixes:** reliable tri-state Flow triggers (M1/M2); onUninit teardown (M3);
  coalesced polls (M4); live credential updates (M5); history midnight reset + consumption label
  (M6); strict socket parsing (L1); REST retry (L3).
- **New Flow cards:** solar-below, charging-from-solar, grid import/export threshold triggers,
  release-for-export.
- **Status:** 48/48 tests pass; lint clean; `homey app validate --level publish` clean.

## Session log

- **2026-06-25** — Cloned repo; renamed app **"EcoFlow - Stream Systems" → "EcoFlow STREAM Series"**;
  set app icon to white EF monogram on black (`brandColor #000000`). Drafted the standalone-app
  certification reply + refreshed reviewer notes. Implemented recommendation sets **A/B/C**
  (see below) and shipped **v1.8.0 / Build 7**, installed on the local Homey Pro. Releases this
  session: v1.7.9 (black icon) → v1.7.10 (rename) → v1.8.0 (A/B/C features).

## Current state (2026-06-25)

- **App:** `uk.co.zarb.ecoflow` — "EcoFlow STREAM Series" · SDK v3 · TypeScript.
- **Latest version:** **v1.8.0** (tag `v1.8.0`).
- **Latest App Store upload:** **Build ID 7** —
  <https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/7>
  (uploaded by the Publish workflow; promote/submit on the dashboard).
- **Local install:** v1.8.0 installed on **Justin's Homey Pro** (192.168.1.142) via
  `homey app install`.
- **Branding:** app icon is the **white EcoFlow EF monogram on a black background**
  (`brandColor: #000000`, `assets/icon.svg` monogram fill white). Black `brandColor`
  also tints the app's accent colour elsewhere in the Homey UI — this is intentional.

## Recent feature additions (v1.8.0)

Grounded in the EcoFlow STREAM product line + the app's own backlog:
- **A1** Corrected MPPT/solar-input counts from official specs (Ultra=4, Pro=3, Ultra X=4)
  in `lib/streamModels.ts`; per-unit PV tiles follow automatically.
- **A2** Daily-history tiles (`energy_*_today`, `co2_today`, `energy_independence`) are now
  **added on demand** only when EcoFlow's history feed returns data, and blank ones are
  cleaned up on upgrade — no empty energy tiles for models whose history API is rejected.
- **A3** Removed dead PowerStream-only capabilities (`output_target_power`, `supply_priority`,
  `ps_charge_limit`, `ps_discharge_limit`, `led_brightness`) from the shipped surface.
- **B5** New tariff Flow actions: **Prepare for cheap grid import** and **Prepare for peak / export**.
- **B6** New condition: **Battery level is above/below**.
- **C7** New read-only **AC output** info setting (notes the 2300 W paired figure for Ultra/Ultra X).
- **C8** New **Self-heating** read-only tile, added on demand when the unit reports a heating field
  (candidate field names pending hardware confirmation — see `docs/FEATURE_BACKLOG.md`).
- **B4** Added `docs/OCTOPUS_FLOWS.md` — ready-made Octopus Agile automation recipes.

## Scope (deliberate)

- Focused **only** on the EcoFlow **STREAM** balcony-solar/battery product line and the
  EcoFlow **Smart Meter**.
- PowerStream and portable power stations are **intentionally excluded** — PowerStream
  lives in `disabled-drivers/powerstream/` and is not shipped.
- Shipped drivers: `stream`, `stream_unit`, `stream_solar`, `stream_micro`,
  `stream_socket`, `smartmeter`.

## Homey Energy integration (the differentiator)

- `stream` → `energy.homeBattery: true` + `meter_power.charged/.discharged` (home storage).
- `stream_unit` → `energy.batteries: ['INTERNAL']`.
- `smartmeter` → `energy.cumulative` + `meter_power.imported/.exported` (grid meter).
- `stream_solar` / `stream_micro` → `meterPowerExportedCapability` (solar production).
- Energy-decision Flow cards: `set_operating_mode`, `set_backup_reserve`,
  `set_charge_limit`, `set_discharge_limit`, `set_feed_in`; plus grid/solar triggers and
  conditions. Core use case: drive STREAM charge/discharge from **Octopus Agile** prices
  via Homey Flow.

## App Store certification — open item

The Homey reviewer flagged device overlap with **Marcus Valk's** app
**"EcoFlow - Portable power stations"** (`com.ecoflow.ecoflowpro`,
<https://homey.app/a/com.ecoflow.ecoflowpro>), which already lists the STREAM models
(AC Pro/Pro/AC/Max/Ultra/Ultra X) plus PowerStream, Smart Plug, Smart Home Panel and the
Delta portable stations. The reviewer asked us to merge/PR into that app or justify a
standalone app.

- **Our position:** standalone app justified by **focus** (STREAM-only) + **Energy-native
  design** + **Octopus tariff automation** — not device exclusivity (the overlap is real).
- **Drafted reply + evidence table:** [`docs/CERTIFICATION_REPLY.md`](./CERTIFICATION_REPLY.md).
- **Reviewer test notes:** [`docs/REVIEWER_NOTES.md`](./REVIEWER_NOTES.md).
- **Next action (manual):** paste the reply into the Homey review thread and resubmit.
  Fallback if rejected: contribute the Energy integration upstream to Marcus's app via PR.

## Release process (verified this session)

1. Commit & push changes to `master`.
2. **Version bump:** GitHub Actions → run *Update Homey App Version* workflow
   (`homey-app-version.yml`, `workflow_dispatch`) with `version=patch|minor|major` +
   `changelog`. It bumps `app.json`/`.homeycompose`, updates `.homeychangelog.json`,
   commits, tags `vX.Y.Z` and creates a release.
   - CLI: `gh workflow run homey-app-version.yml -f version=patch -f changelog="..."`
3. **Publish to App Store:** run *Publish Homey App* workflow (`homey-app-publish.yml`,
   `workflow_dispatch`). Uses `HOMEY_PAT`; creates a new Build ID and uploads.
   - CLI: `gh workflow run homey-app-publish.yml`
4. **Local install (optional):** `npx homey app install` (installs on the selected Homey
   Pro; requires `homey login` + `homey select`).
5. `git pull` to sync the version-bump commit/tag the workflow pushed.

> Do not hand-edit the version — let the version workflow own it. Edit `brandColor`,
> icons, etc. in **`.homeycompose/app.json`** (source of truth); `homey app build`
> regenerates `app.json`.

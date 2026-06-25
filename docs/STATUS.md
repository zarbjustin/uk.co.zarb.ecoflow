# Project Status & Handoff — EcoFlow STREAM Series

> Living status doc. Read this first when resuming work on `uk.co.zarb.ecoflow`.

## Outstanding / next actions (resume here)

- [ ] **Submit Build 7** for certification on the dashboard and **paste the reply** from
  `docs/CERTIFICATION_REPLY.md` into the Homey review thread (subject: "EcoFlow STREAM Series").
- [ ] On hardware: **confirm the self-heating field name** (candidates in
  `docs/FEATURE_BACKLOG.md`) and the **STREAM Max PV-input count**; adjust
  `lib/streamMapping.ts` / `lib/streamModels.ts` if needed.
- [ ] Optional: verify the new v1.8.0 tariff Flows on the live STREAM (cheap-charge /
  peak-export) and the daily-history tiles populate.

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

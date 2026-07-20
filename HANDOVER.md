# HANDOVER — EcoFlow STREAM Series (uk.co.zarb.ecoflow)

> Handover for the next model/session. Written 2026-07-20. The app is a Homey Pro SDK v3
> TypeScript app for EcoFlow STREAM balcony-solar/battery systems + Smart Meter.
> **Read `docs/SPECIFICATION.md` first** (single source of truth), then this file.

## TL;DR — current state
- Base version **v1.8.0 / Build 7** (unreleased work sits on `master`, **7 commits ahead of
  origin, not pushed**).
- A full multi-model review + implementation pass is **done and installed on the local Homey Pro**
  ("Justin's Homey Pro", 192.168.1.142) via `homey app install`.
- **All quality gates pass:** `npm test` (48/48), `npm run lint` (clean),
  `npx homey app validate --level publish` (clean).
- **There is ONE open problem:** the **driver icons/tile images still "don't look right"** to the
  user. See the dedicated section below — this is the thing to fix next.

## Commands (verified)
```sh
npm run build                       # tsc
npm test                            # tsc && node --test  (48 tests)
npm run lint                        # eslint-config-athom
npm run widgets:preview             # regenerate widget preview PNGs via Playwright
npx homey app build                 # recompose app.json from .homeycompose/ + drivers/ + widgets/
npx homey app validate --level publish
npx homey app install               # install on the selected local Homey Pro (logged in as Justin)
```
Notes: `.homeycompose/app.json` is the source of truth for the manifest; `homey app build`
regenerates `app.json`. **Do NOT hand-edit the version** — the GitHub *Update Homey App Version*
and *Publish Homey App* workflows own releases. Widgets auto-compose from the `widgets/` folder.

## What was done this session
1. **Analysis deliverables** (`docs/`): `PRODUCT_RESEARCH.md`, `CODE_REVIEW_v1.8.0.md`
   (GPT-5.6 Sol + GPT-5.5 + Opus 4.8, findings H1–H5 / M1–M7 / L1–L4), `FEATURE_EVALUATION.md`,
   `SPECIFICATION.md`, `SPRINTS.md`, `PRE_SUBMISSION_CHECKLIST.md`.
2. **Widgets (certification blocker):** 1 → **5 distinct widgets** (`stream_flow`, `stream_battery`,
   `stream_solar_today`, `stream_grid`, `stream_tariff`), each with a device picker and a
   **unique preview rendered from the real widget** (`scripts/generate-widget-previews.mjs`,
   `npm run widgets:preview`). This resolved the reviewer note that all previews were identical.
3. **High-severity fixes:** H1 backup-reserve 8524 ordering + verify
   (`lib/streamProtocol.ts backupReserveSequence`, wired in `drivers/stream` + `stream_unit`);
   H2 battery-meter double-count guard (`usingCounters`); H3/H4 MQTT duplicate-session/uninit
   races (`lib/EcoFlowMqtt.ts`); H5 STREAM Max BK41 solar inputs 4→2 (`lib/streamModels.ts`).
4. **Medium/low fixes:** M1/M2 tri-state Flow triggers (`lib/triggerState.ts`); M3 onUninit
   teardown; M4 coalesced polls; M5 live credential updates (`app.ts`); M6 history midnight reset
   + consumption labelled experimental; L1 strict socket parsing; L3 REST retry. M7 intentionally
   left (self-heals; naive fix risks duplicate sessions).
5. **New Flow cards:** `solar_power_below`, `charging_from_solar`, `grid_import_above`,
   `grid_export_above`, `release_for_export`.
6. **Deployed** to the local Homey Pro.

## ⚠️ OPEN ISSUE — driver icons still look wrong (fix this next)

### What the user wants
> "all the device driver icons have changed, and they have changed for the worse, i want them all
> as the **wireframe images i had uploaded**" … and after the first attempt: "**that still does not
> look right**".

### Facts / anatomy
Each driver has TWO icon assets:
- **Tile images:** `drivers/<driver>/assets/images/{small,large,xlarge}.png` (75, 500, 1000 px).
  These are what show large on the device tile / add-device flow.
- **Mono icon:** `drivers/<driver>/assets/icon.svg` — line-art (wireframe), referenced by Homey for
  the small monochrome icon.
Drivers: `stream`, `stream_unit`, `stream_solar`, `stream_socket`, `stream_micro`, `smartmeter`.

### Icon history (git)
- Photographic product images were introduced in **`2dda745` (v1.7.4, "real device images")** for
  `stream/stream_unit/stream_solar/stream_socket`, and earlier in **`74f636a` ("product images for
  microinverter and meter")** for `smartmeter/stream_micro`.
- The `icon.svg` files were redrawn as outlines in `233a6ed` (v1.7.2) and `71e7f12` (v1.7.3) and
  have NOT changed since — they are already wireframe line-art.

### What THIS session tried (commit `ee19607`)
Reverted the tile PNGs to the pre-photo **wireframe** versions from git:
- 4 STREAM drivers ← `2dda745^`
- `smartmeter` + `stream_micro` ← `74f636a^`
These are genuine outline/wireframe images (verified visually: battery, unit enclosure, solar panel
+ sun, socket, meter-with-Z, panel+microinverter-M). **The user says this STILL doesn't look
right**, so the git wireframes are NOT the exact images they mean.

### Hypotheses for the next model (investigate before editing)
1. **The user's "wireframe images I had uploaded" are a specific external set that is NOT in this
   repo's git history.** They were not found in: the session workspace
   (`~/.copilot/session-state/22b4152b-6796-4620-b06f-520b6aeff499/files/` was empty), the repo
   (no `*wire*` files), or `~/Downloads`. **→ Ask the user to (re)share the exact wireframe image
   files (SVG/PNG) or point to where they live.** This is the most likely resolution.
2. It may be the **`icon.svg` mono icons** (not the PNGs) that look wrong on the tiles — Homey shows
   the SVG in some views. The current SVGs are redrawn outlines that differ in drawing from the old
   PNG wireframes (e.g. the `stream` icon.svg battery ≠ the old PNG battery-with-bolt). Consider
   aligning the SVG and PNG to the SAME artwork, or regenerating the PNGs FROM the icon.svg (a
   `scripts/generate-widget-previews.mjs`-style Playwright renderer over each `icon.svg` at
   75/500/1000 on white — Playwright + Chromium are already installed).
3. **Homey image caching**: after `homey app install`, tiles can cache old art. Ask the user to
   remove/re-add a device or restart the app to confirm they're seeing the new images.
4. The user might actually want the **photographic images gone from the small icon but kept as
   large**, or a different padding/background. Clarify the exact desired look.

### Suggested next step
**Ask the user to attach the exact wireframe image files they want** (or confirm hypothesis 2/3).
Do not keep guessing from git — the two obvious git wireframe sets have both been ruled out (photos
= "worse"; git wireframes = "still not right"). Everything is committed and reversible, so it's safe
to experiment once the target artwork is known.

## Other outstanding items (user-owned / hardware-gated)
- **Release:** bump to **v1.9.0** via *Update Homey App Version* (changelog in `docs/STATUS.md`),
  then *Publish Homey App*; submit build + paste `docs/REVIEWER_NOTES.md` + `CERTIFICATION_REPLY.md`.
- **Hardware confirmations:** STREAM Max (BK41) PV-input count (set to 2 — verify);
  `self_heating` field name (candidates in `docs/FEATURE_BACKLOG.md`); per-socket
  `powGetSchuko1/2`; the 8524-safe reserve sequence and new tariff Flows on a live unit.

## Key constraints to respect (don't regress)
- EcoFlow rejects `set_backup_reserve` unless reserve exceeds `discharge_limit` by ~3 (error 8524);
  always lower the discharge limit first, then set reserve, then verify (already implemented).
- EcoFlow consumption logs are unreliable (inflated); solar is reliable.
- Single MQTT session per account; manual reconnect refreshes the certificate.
- No `target_power` watt setpoint on the open API — control is mode/reserve/limits/feed-in only.
- Only ONE Homey on the account is a Homey **Pro** (local, install target); the other is Homey
  **Cloud** (cannot take dev installs; widgets don't run there).

## Commit log this session (newest first)
```
ee19607 revert: restore wireframe driver icons (undo photographic product images)   <-- user says still wrong
8f3cda2 docs: certification readiness (widgets, reviewer notes, status, checklist)
fa8fbeb feat(flow): new tariff/energy flow cards
f1161b7 fix: medium/low review findings (M1-M6, L1, L3)
d066db1 fix: high-severity review findings H1-H5
47e1988 feat(widgets): 5 distinct STREAM widgets with accurate per-widget previews
1465477 docs: product research, multi-model code review, feature eval, spec & sprint plan
```
(These 7 commits are **not yet pushed** to `origin/master`.)

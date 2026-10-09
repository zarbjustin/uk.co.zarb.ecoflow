# Project Status & Handoff — EcoFlow STREAM Series

> Living status doc. Read this first when resuming work on `uk.co.zarb.ecoflow`.

## Current handover — 9 October 2026

**Latest Test release: v1.10.23 / build 38.** The developer portal confirmed
“Your app is currently available for testing” on 9 October. Production remains
v1.10.3 / build 18; no certification submission or hub installation was made.

The diagnostic release is on `codex/mixed-generation-reporting-diagnostics`;
`master` is unchanged. Implementation commit: `f618c229914166a9bc4ead158a0087d154dce938`;
version/tag: `175ad1d4dcae728d657d64c2a8765861059ae067` / `v1.10.23`.

- [Version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37986052851),
  [exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37986141316)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37986479957)
  succeeded. CI passed 399 tests, lint, audit and verified-level Homey validation.
- [Build 38](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/38)
  was separately published to [Test](https://homey.app/a/uk.co.zarb.ecoflow/test/).
- Ask Robert and Ed to update in place, confirm v1.10.23, run for approximately
  five minutes and provide **Show support report** with concurrent EcoFlow/Homey
  screenshots. Preserve devices, pairing history, counters and Flows.
  [Community post 43](https://community.homey.app/t/157399/43) was published and
  verified on 9 October with these instructions. Await their response rather
  than sending duplicate follow-ups.
- Ed benefits from cached EcoFlow readings in the report, not new controls.
  Solis has no THEN actions in his reported integration; confirm whether its
  “Capaciteit” percentage represents battery SOC. Charging inhibition and
  Solis/BYD coordination remain unimplemented and hardware-gated.

### Diagnostic increment — 9 October 2026 (released to Test)

Community replies 41–42 clarify that the mixed-generation installation was
linked after its original Homey pairing, and that the Solis integration provides
readings/conditions but no action cards. The original STREAM aggregate still
uses its paired serial for reads; a changed reporting device is a hypothesis,
not a confirmed cause of the reported zero totals. Preserve existing pairings.

Support schema 6 adds an anonymous `reporting` section per device with fixed-list
cached capability values. The original STREAM aggregate additionally records
session-only per-reading receipt age/source and whether its read address matches
the saved main address. Missing readings remain null; explicit zero and signed
power are preserved. Receipt age is not device-time freshness or proof of current
installation membership. Restart clears receipt evidence; unrelated deltas do
not refresh it. No cloud requests, full serials, raw quota, names or secrets are
included. 5000 readings retain their existing independent freshness section;
absent receipt observations must not be inferred from cached capability values.

This increment does not change reporting addresses, aggregation, counters,
availability, controls, pairing or Energy roles. It does not repair Robert's
installation yet. Collect the new support report and compare
the aggregate and individual devices with simultaneous EcoFlow screenshots.
No uninstall/re-pair or hardware controls were undertaken.

### Previous release handover — 7 October 2026

**Latest Test release: v1.10.22 / build 37.** Published to Homey Test on
6 October 2026; the developer portal confirmed “Your app is currently available
for testing.” Production remains **v1.10.3 / build 18 / Live**. No certification
submission, live-hub installation or physical control acceptance was performed.

- GitHub default branch is `master`, not `main`. Both the ecosystem wave and
  original STREAM bug bash are merged there. Implementation tip: `7a2c551`;
  version/tag: `a3c8c25e76851d0e8b2dbde2bcff08b5bff6e0a0` / `v1.10.22`.
- [Version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37531769282),
  [exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37532011154)
  and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37532286444)
  passed. Exact-version CI includes tests, lint, dependency audit and Homey
  validation. Upload created build 37; publishing its draft to Test was a
  separate, verified browser action.
- [Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/).
  Existing IDs, pairings and cumulative counters are preserved. No re-pair is
  required. Home Battery remains the installation's Homey Energy contributor;
  physical-unit monitors remain excluded to prevent double counting.
- Release includes per-reading 5000 expiry/restart clearing, read-only reported
  settings and Flow conditions, observed physical MPPT/backup-socket monitoring,
  stale-gap energy re-anchoring, widget freshness/estimates, and the original
  STREAM aggregate/unit, socket routing, command readback, transport and history
  fixes. See [ecosystem wave](STREAM_5000_ECOSYSTEM_WAVE.md) and
  [bug bash](ORIGINAL_STREAM_BUG_BASH.md).
- [Community update, post 34](https://community.homey.app/t/157399/34) and
  [reply to Robert, post 35](https://community.homey.app/t/157399/35) were publicly
  verified on 7 October. They request model details, paired EcoFlow/Homey
  screenshots, diagnostics and Fronius/BYD integration/control information.
  Do not send duplicate follow-ups while awaiting a response.

### Open acceptance and next work

1. Compare ES21/ES22 and original STREAM readings on real installations: charge,
   discharge, idle, backup socket, restart/reconnect and a 24–48-hour soak.
   Review socket Flows on Max, AC and unidentified models after capability fixes.
2. Robert's requested BYD-first charging policy is **not implemented as an
   actuator**. `/coordination-preview` is stateless advisory preparation; it
   does not read devices, send commands or coordinate either battery system.
   Establish reliable BYD/grid inputs, actual linked models and whole-system
   charge inhibition before designing a live controller. A grid-input limit is
   not proof that all STREAM charging has stopped.
3. Mixed-generation membership, combined SOC/capacity and per-unit boundaries
   need already-linked hardware evidence. Do not automatically merge systems.
4. 5000 commands and Expansion/Gateway/3000 pairing remain evidence-gated.
   REST readback or automated tests do not prove physical response.
5. Original-series per-reading freshness, empty-quota availability and history
   timezone/granularity remain focused follow-ups. Do not turn missing data into
   zero or silently backfill cumulative meters from historical totals.

### Checkout and privacy handover

Active checkout: `work/uk.co.zarb.ecoflow-energy`, branch
`codex/mixed-generation-reporting-diagnostics`. Sync this branch normally;
never force-push to resolve divergence. The separate `uk.co.zarb.ecoflow-icon`
worktree has an older local `master` with local commits: preserve it, and do not
reset it to the remote release. Fetch and inspect before any cross-device merge.

Credentials, full serials, raw account responses, private diagnostics and browser
sessions must stay out of Git. This handover contains project knowledge only,
not a copy of the user's private memory store. Future releases must use the
version workflow, exact-version green CI, upload, then verified Test publication.

## Historical implementation and release records — 6 October 2026

The entries below describe earlier stages. Unpublished/pending wording is
superseded by the current release handover above, not a current release status.

**Original-series bug-bash candidate:** [API review and fixes](ORIGINAL_STREAM_BUG_BASH.md)
on `codex/original-stream-bug-bash` follows the ecosystem wave's merge into GitHub
master at `9c81abc`. Authenticated read-only BK account checks and current online
documentation informed aggregate/unit separation, socket routing/layout, shared
control readback, transport/cache and history fixes. Local tests pass 396 cases;
lint/full audit pass. This candidate is not merged/published and its exact-commit
CI/Homey packaging gate is still pending. Live controls were not exercised.

**Latest development increment:** [ecosystem wave](STREAM_5000_ECOSYSTEM_WAVE.md)
integrates per-reading expiry, restart clearing, read-only settings/Flow conditions,
observed physical MPPT/socket tiles and stale-gap Energy re-anchoring. Local tests
pass 372 cases; widgets use fresh reported settings and conservative reserve
estimates. Runtime observation is not hardware acceptance. Model identities,
saved counters and installation-only Homey Energy roles are preserved. Controls,
automatic consolidation and new product adapters remain gated. No publication.

**Development branch:** `codex/stream-charging-coordination` starts from the clean,
synced Test handover tip `5c984770e805e4f2a2e192b7c92c64faab0eb9b2`. Community
reply 33 adds BYD-priority and anti-reciprocal-charging requirements; see the
[next-wave branch and sprint plan](COMMUNITY_FEEDBACK_ROADMAP.md). Build 36 remains
the Test baseline. Development now includes runtime advisory/diagnostic code;
5000 controls, Energy roles and production remain unchanged. Keep focused release hotfixes separate.

Sprint 4A–6 research preparation now adds test-only ES22 input-payload replay,
explicit-system topology review and new-product evidence gates. There is no
runtime import, routed writer or new pairing admission. See the roadmap's offline
implementation section for verified source pointers and remaining acceptance.
The simulation-only coordination policy adds stale-input rejection, SOC
hysteresis and opposing-flow checks. Local verification passes 351 tests, lint,
full audit (zero vulnerabilities) and whitespace checks. Hardware-dependent
completion of Sprints 4–6 remains open; no build/version or channel change.

The next development increment adds a stateless, non-actuating
[`/coordination-preview` API](STREAM_COORDINATION_PREVIEW.md), support schema 5
control/topology assessments, and category-specific product evidence requirements.
The preview never accesses Homey devices or EcoFlow, persists state or grants
command permission. Settings explains recent receipts versus verified behaviour.
This is runtime preparation, not completion of hardware controls, automatic
mixed-generation consolidation or new product adapters. Local validation passes
361 tests, lint, whitespace checks and dependency audit (zero vulnerabilities).
It is not published.

**Latest Test release: v1.10.21 / build 36**, published on 6 October 2026 from
`codex/stream-next-wave-test`. The socket/configuration wave below is now in Test.
Implementation: `4997c1f9edcf1d4cc05951e25908a842c5b45f9f`; store guidance:
`0e6688ebe532aeee7fca6e25eced3b431b51e677`; version/tag:
`740b14669738f8f4d46cf084c55825f7326d0fd9` / `v1.10.21`.
[Version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37507493785),
[exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37507611559)
and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37507798632)
passed. Homey visibly confirmed Test publication. The downloaded archive contains
schema 4, configuration diagnostics, ES21 store guidance and installation-only
Energy roles, with an empty environment and no checked private auth paths.
Build 35 / v1.10.20 remains an unpublished draft because its store guidance was
outdated. Production remains v1.10.3 / build 18 / Live; `master` is unchanged.
No certification submission, hub installation, control or re-pairing was done.
Sprint 3's release gate is complete; independent ES21/ES22 hardware comparisons
and a 24–48-hour soak remain pending. See [tester checklist](TESTER_VALIDATION.md).

**Pre-release implementation record (superseded by the release above):** the new six-sprint socket/configuration
wave is recorded in `COMMUNITY_FEEDBACK_ROADMAP.md`. Sprints 1–2 now implement
battery-to-backup-socket accounting and session-only configuration diagnostics
(support schema 4), with pinned public captures and lifecycle/privacy tests.
Version remains 1.10.19; no counter reset, re-pair, Energy-role change, 5000
control, automatic grouping, new model or network request is added. The
read-only configuration observations have receipt age only, not authoritative
device-revision ordering. Hardware and Test-release acceptance remain pending;
do not treat this local source as the published build described next.
Local checks: 337 tests pass, TypeScript/lint pass, full dependency audit reports
zero vulnerabilities, whitespace checks pass and Homey verified-level package
validation succeeds. No commit, push, version bump or upload occurred in this
increment. The next step is the Sprint 3 Test-release/hardware gate, not controls.

**Release update:** the combined Sprint 1–5/ES21 candidate is now published as
**v1.10.19 / build 34 / Test**, from `codex/stream-next-wave-test`. This supersedes
the local/unpublished wording below, which records each implementation stage.
Production remains **v1.10.3 / build 18 / Live**; `master` was not changed.

- Implementation commit: `34d097254e88d5e632224dd69782f5742ee1c93d`.
- Version/tag commit: `c87813072428b421f62dce47d59137c6febf8a39` / `v1.10.19`.
- [Exact-version CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37392187407),
  [version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37392089835)
  and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37392358711)
  passed. All 313 tests, lint, full audit and Homey validation passed.
- Homey UI confirmed Test publication. The downloaded build-34 archive contains
  v1.10.19, ES21 admission, discovery diagnostics and support schema 3. Its
  manifest retains installation-only Energy meters and an empty environment;
  no env.json, .env or Git directory is packaged.
- [Install Test](https://homey.app/a/uk.co.zarb.ecoflow/test/). No certification,
  production promotion or installation/control action on a live Homey was done.
  ES21, mixed-generation, expansion/Gateway/3000 and BK control hardware gates
  remain open. No deletion/re-pairing is required for existing devices.
- Store README text still describes ES22-only beta support; refresh that listing
  guidance before the next release. The v1.10.19 changelog describes ES21 correctly.

The [Sprint 5 expansion-discovery increment](SPRINT_5_EXPANSION_DISCOVERY.md)
adds anonymous cached account inventory and peer-field visibility to support
schema 3. It adds no requests, new-model admission, capacity guesses, grouping
or controls. Account discovery is not installation membership. Expansion 5000/
3000, Gateway/Dual CT and STREAM 3000 hardware/API validation remain open.
This is local/unpublished; the existing ES21 and Sprint 1–4 changes are preserved.
The combined candidate passes 313 tests, TypeScript/lint, full audit (zero
findings), Homey publish-level validation and whitespace checks. No version,
commit, push, store upload or physical validation occurred in this increment.

The [model expansion increment](STREAM_MODEL_COVERAGE.md) now admits ES21 STREAM
5000 core monitoring locally, behind the beta gate, with a dedicated adapter and
both existing Energy roles. ES22/BK identities and counters remain unchanged.
PV/string tiles, 3000, expansion, Gateway/Dual CT adapters, mixed-generation
consolidation and 5000 controls are not enabled. This supersedes the earlier
Sprint 3 ES21 offline-only decision below, not its extra-capability gates.
ES21 Homey hardware acceptance remains open; nothing has been pushed or released.
All 304 tests, build/lint, full audit (zero findings), whitespace checks and Homey
publish-level validation pass locally for this combined candidate.

Sprint 4's [original STREAM control safety increment](SPRINT_4_CONTROL_SAFETY_STATUS.md)
is implemented locally: fresh main-target baseline/readback, per-target command
serialization, partial-failure warnings and no optimistic control updates. Price
conditions reject missing or >90-minute-old prices, including inverted conditions;
refresh the current tariff at least hourly and after restart/unit changes. No
automatic rollback, wattage target or 5000 write is added. All 294 tests, build,
lint, full audit (zero findings) and Homey publish validation pass locally.
No commit, push, version or publication was performed. Hardware
validation remains open, and Sprint 1–3 changes below are preserved.

The user authorized Sprint 3. The [capability preparation increment](SPRINT_3_CAPABILITIES_STATUS.md)
adds serial-keyed PV parsing and isolated ES21 offline research, without enabling
new models or Homey tiles. It remains local/unpublished with Sprint 1–2 changes.
The full suite passes 272 tests, build/lint, full audit and Homey publish-level
validation; hardware admission remains open.

Sprint 2's read-only
[topology discovery increment](SPRINT_2_TOPOLOGY_STATUS.md) is implemented locally:
observed peers/freshness and anonymous overlap-review hints, with no grouping,
identity change, Energy-role change or control write. It remains on
`codex/stream-next-wave-test`, together with Sprint 1's unpublished fixes. Local
Sprint 2 checks passed 261 tests, build/lint, full audit and Homey publish-level
validation before the Sprint 3 additions above.

The
[Sprint 1 ledger](SPRINT_1_VALIDATION_STATUS.md) records a new non-manual
production SDK startup report, a read-only numerical Energy lead and local
shutdown-race fixes with regression tests. These follow-up changes are not
published, versioned or pushed. Hardware/support/picker validation remains open.

The October [community roadmap](COMMUNITY_FEEDBACK_ROADMAP.md) supersedes the
historical sprint/current-version statements below. Sprint 1 and next-wave
changes are published as **v1.10.18 / build 33 / Test**, from
`codex/stream-next-wave-test`, based on v1.10.17. The user authorized this
Test-channel release on 4 October. Production remains **v1.10.3 / build 18 / Live**.
Production promotion, automatic grouping, live-device installation and control
writes are not part of this release. Existing pairing is preserved.

- [Install Test v1.10.18](https://homey.app/a/uk.co.zarb.ecoflow/test/).
- Implementation commit: `2f7e14b755c96e5fa02e864a0f8102c7fed9562f`.
- Version/tag commit: `a3ec1ff8d79e409876184f228a5dd8f52288adeb` / `v1.10.18`.
- [GitHub validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37162940122),
  [version workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37163119488)
  and [upload workflow](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37163190955)
  passed. Homey developer UI confirmed Test publication; certification was not submitted.
- Uploaded archive checked: version, support route, compiled support module and
  system-only Energy meters. Store upload is not a live hardware/endpoint pass.

- Telemetry corrections: [API review](STREAM_5000_API_REVIEW.md).
- Next-wave accounting: persist initial BK counter baselines, retry failed
  checkpoints, serialize writes, snapshot values before awaiting, use receipt
  timestamps and suppress REST replies superseded by newer MQTT.
- Local settings support report: version/platform, packaged versus registered
  beta drivers, anonymous accounting evidence; no credentials/names/serials.
- Development dependency upgrade uses Athom config 4.0.2 with its supported
  ESLint 8.57.1 peer. Full npm audit is clear; CI now checks full dependencies.
- [Tester validation and mixed-generation evidence plan](TESTER_VALIDATION.md).
- [Original STREAM Flow capability audit](BK_FLOW_CAPABILITY_AUDIT.md).
- [Mixed-generation discovery plan](MIXED_GENERATION_VALIDATION.md), including
  API source/scope changes and history risks. The broader tester request is
  published in community post 29; no new reply was sent in this validation pass.
- Eight manual reports are not proven process crashes; a new non-manual SDK
  startup/cleanup report is tracked separately. Energy calculation and
  missing-picker reports remain open. No automatic grouping or 5000 controls.
- Verified locally and in GitHub CI: build, lint, 242 tests, clean `npm ci`, full
  audit (zero findings), whitespace checks and Homey verified/publish validation. No hardware
  or Homey endpoint verification is implied.

Read the validation documents before inviting testers or promoting a build.

## Outstanding / next actions (resume here)

- [ ] Complete [Sprint 5 host-plus-expansion and discovery validation](SPRINT_5_EXPANSION_DISCOVERY.md)
  on existing configurations. Capture system/host/pack boundaries, capacity units,
  negative account-only cases and Gateway/3000 identities before adding adapters.

- [ ] Complete the [Sprint 4 BK hardware matrix](TESTER_VALIDATION.md), including
  accepted-but-unapplied writes, EcoFlow policy conflicts, actual power response
  and manual recovery. Release only with explicit authorization and green CI.

- [ ] Complete [ES21 beta hardware acceptance](STREAM_MODEL_COVERAGE.md) and
  [Sprint 3 capability admission](SPRINT_3_CAPABILITIES_STATUS.md) before exposing new socket/PV tiles. Expansion/gateway capacity and
  identity remain unverified; no model-prefix guessing or control writes.

- [ ] Validate [Sprint 2 discovery](SPRINT_2_TOPOLOGY_STATUS.md) on already-linked
  mixed-generation hardware and independent installations before any consolidation.
  Test v1.10.19 now contains this candidate; hardware evidence remains required.

- [ ] Complete the active [validation sprint](SPRINT_1_VALIDATION_STATUS.md):
  confirm installed Test/support report, investigate counter scope and the
  production startup timeout, reproduce Ed's mobile picker, then collect hardware evidence.
- [ ] **STREAM AC 5000 live gate** — install Test v1.10.19 and complete the
  charging/discharging/idle plus 24–48-hour soak matrix in
  `docs/STREAM_AC5000_SPRINTS.md`. Code-side Sprint 1–4 work is complete.
- [ ] **Hardware verification** — run the HomeyScript probe in `docs/HARDWARE_VERIFICATION.md`:
  confirm the self-heating field, STREAM Max (BK41) 2-PV count, and per-socket fields; then adjust
  `lib/streamModels.ts` / `lib/streamMapping.ts` if needed.

## Current development state (2026-08-10)

- Source version: **v1.10.7**; this working change has not been versioned or
  published yet.
- New pairing entry: `stream_5000_unit` (**STREAM 5000 Series Unit**).
- Current verified product: STREAM AC 5000 with serial prefix `ES22`, using the
  dedicated `es22` monitoring adapter.
- Legacy `stream_ac5000` is deprecated but remains operational for existing
  Homey devices; both drivers share one lifecycle and credential scope.
- STREAM 5000, STREAM Expansion Battery 5000 and STREAM Gateway remain hidden
  until a serial prefix and product-specific telemetry adapter are verified.
- Future-product policy and admission checklist:
  `docs/STREAM_5000_ARCHITECTURE.md`.

## Suggested next-release changelog (family-driver architecture)

> Adds the future-ready STREAM 5000 Series Unit pairing entry, with verified
> STREAM AC 5000 monitoring today. Existing AC 5000 devices keep working through
> the deprecated compatibility entry. New 5000-series hardware is only exposed
> after its serial prefix and telemetry protocol have been verified.

## Suggested next-release changelog (for the version workflow)

> STREAM AC 5000 now reports battery percentage on firmware V1.1.4.35 and is
> recognised as a home battery by Homey Energy. Diagnostics now provide safe,
> time-aligned telemetry snapshots and clearer connection/parser health while
> preserving the verified battery, house and grid power calculations.

## Release state (2026-07-26)

- **Latest version:** **v1.10.3** — **Build ID 18** is **live in the Homey App Store**.
- v1.10.3 replaces all five light/dark widget preview pairs with deterministic, text-free,
  transparent 1024x1024 artwork that follows Homey's Widget Preview guidelines.
- The release is tagged as `v1.10.3`; the public Homey Apps API reports `liveVersion: 1.10.3`,
  `liveBuild.id: 18`, and `liveBuild.state: live`.
- v1.10.1 was the previously certified feature release containing the multi-model review,
  fit-and-finish sprints, enriched App Store tags, and `bugs` URL. PayPal donate = `zarbie`.

## Fit-and-finish sprints (2026-07-20, after v1.9.0 / Build 14)

Merged to `master` via PRs #2–#5 (each build/lint/test/validate green):
- **S1 hardening:** REST retry (`lib/retry.ts`), `batteryEnergyMode` latch tests, widget in-flight
  guard + pagehide teardown.
- **S2 i18n:** German + Dutch across the whole app (279 localized objects).
- **S3 solar forecast:** real Open-Meteo forecast (`lib/solarForecast.ts`), `solar_forecast_today/
  tomorrow` capabilities, geolocation permission, forecast widget + conditions.
- **S4 tariff (provider-agnostic):** `Set current electricity price` action + `Electricity price`
  capability + price/negative-price conditions (shared `lib/thresholds.ts`); works with any tariff
  app (Octopus/Tibber/aWATTar/…) in any region; Energy Recommendation widget shows the price.
- **S5/S6 polish + hardware tooling:** README/docs refresh, provider-agnostic `OCTOPUS_FLOWS.md`,
  `docs/HARDWARE_VERIFICATION.md` + the HomeyScript probe.
- **Status:** 68/68 tests pass; lint clean; validates at `--level publish`.

## Suggested v1.10.0 changelog (for the version workflow)
> German & Dutch translations. New: real solar forecast (today & tomorrow) from your local weather,
> and tariff-aware Flows that work with any electricity-price app. Plus sturdier connectivity and
> more reliable widgets.

## Previously — review & hardening pass on v1.8.6 (2026-07-20)
- [ ] Optional: verify the 8524-safe reserve sequence, `Release battery for export now`, and the
  new grid threshold triggers on the live STREAM.

## Review & hardening pass on v1.8.6 (2026-07-20)

A full multi-model review + implementation pass on the current release (branch
`copilot/review-v1.8.6`, PR pending):
- **Deliverables:** `docs/PRODUCT_RESEARCH.md`, `docs/CODE_REVIEW_v1.8.6.md` (GPT-5.6 Sol +
  GPT-5.5 + Opus 4.8), `docs/FEATURE_EVALUATION.md`, `docs/SPECIFICATION.md`, `docs/SPRINTS.md`,
  `docs/PRE_SUBMISSION_CHECKLIST.md`.
- **Widgets (Sprint 1, certification fix):** replaced the shared placeholder with a **distinct,
  simplified, text-free preview pair per widget** (`npm run widgets:preview`), exported on
  transparent 1024x1024 canvases; fixed the reversed Energy-Flow grid arrow; renamed "Solar
  Forecast" → "Solar Target" and "Tariff Opportunity" → "Energy
  Recommendation"; qualified the estimated consumption/independence values; mute on no-device.
- **High fixes (Sprint 2):** H1 backup-reserve 8524 ordering + verify (+ `Release battery for
  export now`); H2 `onUninit` flushes `EnergyCheckpoint` so meters stay monotonic across restarts;
  H3 counter-latch stops battery double-count; H4 MQTT session can't survive teardown.
- **Medium/low (Sprint 3):** BK41 PV count 4→2; history midnight reset + blank-parse; MQTT
  reconnect credential refresh; timer/reference cleanups.
- **Features (Sprint 4):** solar-below, charging-from-solar, grid import/export threshold triggers.
- **Status:** 51/51 tests pass; lint clean; `homey app validate --level publish` clean.
- **Already-fixed on master (not redone):** trigger state machine (`flowStates`), empty-string
  parsing, poll/MQTT serialization, `getId()` binding, signing/SSRF security, 3–100% reserve.

## Suggested v1.9.0 changelog (for the version workflow)
> Five dashboard widgets now each have their own Homey-compliant preview; safer backup-reserve control
> (fixes a silent no-op); trustworthy energy meters across restarts; sturdier realtime connection;
> new tariff/grid Flow cards; STREAM Max solar-input fix.

## Session log

- **2026-07-26** — Rebuilt all ten widget preview assets as distinct, deterministic SVG-derived
  illustrations with transparent canvases and no text or screenshots. Added preview compliance
  tests, updated reviewer documentation, released **v1.10.3**, and published **Build 18** live in
  the Homey App Store.
- **2026-06-25** — Cloned repo; renamed app **"EcoFlow - Stream Systems" → "EcoFlow STREAM Series"**;
  set app icon to white EF monogram on black (`brandColor #000000`). Drafted the standalone-app
  certification reply + refreshed reviewer notes. Implemented recommendation sets **A/B/C**
  (see below) and shipped **v1.8.0 / Build 7**, installed on the local Homey Pro. Releases this
  session: v1.7.9 (black icon) → v1.7.10 (rename) → v1.8.0 (A/B/C features).

## Historical snapshot — v1.8.6 (2026-07-17)

- **App:** `uk.co.zarb.ecoflow` — "EcoFlow STREAM Series" · SDK v3 · TypeScript.
- **Latest version:** **v1.8.6** (tag `v1.8.6`).
- **Release note:** Backup reserve controls now support the full 3-100% STREAM range,
  and App Store search tags improve discoverability.
- **Local install:** v1.8.6 installed on **Justin's Homey Pro** (192.168.1.142) via
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
  `stream_socket`, `smartmeter`, `stream_5000_system`, `stream_5000_unit`, plus deprecated
  compatibility driver `stream_ac5000`.

## Homey Energy integration (the differentiator)

- `stream` → `energy.homeBattery: true` + `meter_power.charged/.discharged` (home storage).
- `stream_unit` → optional physical telemetry monitor; no Homey Energy contribution.
- `stream_5000_system` → app-auth installation Home Battery with charged/discharged meters.
- `stream_5000_unit` / deprecated `stream_ac5000` → optional physical telemetry monitors;
  no Homey Energy contribution.
- `smartmeter` → `energy.cumulative` + `meter_power.imported/.exported` (grid meter).
- `stream_solar` / `stream_micro` → `meterPowerExportedCapability` (solar production).
- Energy-decision Flow cards: `set_operating_mode`, `set_backup_reserve`,
  `set_charge_limit`, `set_discharge_limit`, `set_feed_in`; plus grid/solar triggers and
  conditions. Core use case: drive STREAM charge/discharge from **Octopus Agile** prices
  via Homey Flow.

## App Store certification — resolved

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
- **Outcome:** the standalone STREAM-focused app was approved. The widget-preview correction
  shipped in **v1.10.3 / Build 18**, which is live in the Homey App Store.
- Keep the reply and reviewer notes as evidence for future certification questions. If device
  overlap is raised again, continue to ground the response in focus, Energy-native integration,
  and tariff automation rather than device exclusivity.

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

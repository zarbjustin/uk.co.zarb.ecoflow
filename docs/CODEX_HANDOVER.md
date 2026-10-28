# Codex cross-machine handover

Updated 28 October 2026. This is the portable starting point for the active
EcoFlow STREAM integration work. It does not grant permission to deploy or send
commands. See STATUS for the dated evidence behind each statement.

## 1. Clone the right branch

Repository: https://github.com/zarbjustin/uk.co.zarb.ecoflow (public).

Active branch: `codex/mixed-generation-reporting-diagnostics`.
The default branch is `master`, which does **not** contain this diagnostic wave.
Do not merge it or change the repository default branch during migration.

```sh
git clone --branch codex/mixed-generation-reporting-diagnostics https://github.com/zarbjustin/uk.co.zarb.ecoflow.git ecoflow-stream
cd ecoflow-stream
git fetch origin
git status --short
git rev-parse HEAD origin/codex/mixed-generation-reporting-diagnostics
```

Use a normal local, non-cloud-synchronised development folder. The old checkout
was a linked worktree whose `.git` file points to another checkout on the old
Mac; copying that folder alone is not a portable repository. Fresh cloning is
preferred. macOS offloaded its six-byte `commondir` file and blocked even basic
Git reads; keeping that file downloaded restored access. iCloud storage was full.
Do not rewrite Git metadata or copy absolute worktree pointers to fix migration.

## 2. Current source, CI and installed candidate

- Implementation: `e270578568718afd2fd3450694dc8226a2a897a2`.
- Validation records and anchor correction through
  `17d985db61c60c59965b106525d841f503bbf64f` are documentation/ledger-only.
- Implementation CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40614977219
- Follow-up CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/40615632941
- Local full suite: **1085 tests**, lint, release checks; verified Homey validation
  also passed. Check the new handover commit's CI independently on resumption.
- Installed owner candidate: running **Development 1.10.56**, non-clean direct
  installation at **28 October 2026 01:27:41 UTC**; not a store installation.
- Exact runtime fingerprint:
  `f1234365433db279bc9418a29beaaf863ef593d291864e6018de8388c4cf9ba2`.
  Documentation/AGENTS changes do not change this fingerprint. Recompute with
  `npm run release:check`; never identify an installed runtime by version alone.
- Mainline stayed untouched: local historical `master` is `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` was `66b1cb5f828a53333739798281fce86125f61c28`. They differ;
  do not push local master or assume the difference is a new merge instruction.
- Last **recorded** store state: Test 1.10.56 / Build 70 and Live 1.10.3 / Build 18.
  Those portal observations are historical, not freshly reverified for this
  handover. The new diagnostic changes were not published to either channel.

Recheck current GitHub HEAD/CI and the installed host before making fresh claims.
The repository is not yet production-release-ready.

## 3. What changed most recently

**Physical STREAM 5000 expiry:** the three-minute watt/state freshness threshold
is unchanged. Physical monitors now have a five-second local cleanup timer,
separate from the existing one-minute connection watchdog. Checks are serialized,
coalesced while pending and cancelled on teardown. No extra EcoFlow requests,
faster reconnects or aggregate accounting changes. Five seconds is a normal
scheduling bound, not a hard real-time guarantee during blocked/failed SDK writes.

**Original STREAM history:** removed startup cleanup which deleted existing
daily-history capabilities merely because values were null. Existing capability
IDs/custom titles remain; day rollover still clears yesterday's values to
unknown. Fresh numeric history, including zero, updates in place. Missing tiles
are added only when their own data is returned, not as fabricated empty defaults.

Key implementation/tests:

- `lib/Stream5000UnitDevice.ts`, `lib/stream5000Readings.ts`,
  `lib/stream5000BatteryPresentation.ts`, `test/stream5000Lifecycle.test.js`.
- `drivers/stream/device.ts`, `test/streamEnergyLifecycle.test.js`.
- `scripts/check-stream-5000-acceptance.mjs`,
  `docs/STREAM_5000_MONITORING_ACCEPTANCE.json`.

## 4. Hardware evidence and its limits

The owner's currently paired 5000 is **ES21, PV-equipped STREAM 5000**, despite
earlier shorthand calling it AC5000. Do not conflate it with ES22 AC-only.
It is in a separate EcoFlow space. The owner's Dual CT had arrived but was **not
installed** at the last confirmed hardware checkpoint; do not assume it is a
usable independent grid meter. No 5000 aggregate is paired on the owner host.

The latest installation preserved all 11 device identities/settings, existing
capabilities, 99 Flow definitions and six cumulative meter sequences. Six daily
history tiles previously removed by the old cleanup returned with real numeric
history responses. There were no null daily tiles at the immediate upgrade
baseline, so that exact native null-preservation input is software-tested only.

EcoFlow explicitly showed Standby/0 W/1% at 01:28:42 UTC, matching Homey. The
standalone ES21 idle point is accepted for this fingerprint. The native Mac app
was quit at 01:28:43 and confirmed not running. Through 01:34:25, battery reports
continued roughly every two minutes, independently of fresh temperature. One
active subscription attempt, no reconnect; no expiry interval on this candidate.

Earlier `ac38129` hardware showed true silence expiry: power/state became null,
temperature stayed fresh and the tile became explicitly last-reported standby.
It exposed the old watchdog delay. That event is **not** hardware acceptance for
the new runtime's faster timer. Earlier supervised charging/discharging and
restoration are recorded in STATUS/RC, not approval for repeating those tests.

Open gates include actual fast expiry and recovery, retained-hint horizon,
controlled reconnect/rollback, sustained soak, configuration background refresh,
PV/socket/accessory scope, ES22 and linked-pack/model coverage, aggregate Energy
scope/continuity. The JSON ledger is authoritative per exact runtime/model/role.

## 5. Safe next work

1. Re-establish read-only access and verify installed state, device/Flow/counter
   baselines, and whether physical setup has changed since this checkpoint.
2. Observe a naturally sparse battery interval with the native app closed;
   verify numeric expiry within the five-second cleanup cadence, unrelated-field
   independence and explicitly non-live standby. Stop if fresh reports continue;
   do not create network silence, restart or trigger Flows to force a pass.
3. Observe natural receipt recovery and retained-hint expiry when available.
   Deliberate restart/reconnect/rollback needs a separate bounded owner approval.
4. Plan the remaining model/accessory/configuration/soak checks for a narrow
   monitoring release. Do not silently enable Home Battery (5000) Energy pairing,
   Dual CT Energy or 5000 controls to make the release look complete.

Keep remaining-time estimates unmapped; the bounded passive timer observer stays
disabled. New controls, automatic mixed-generation merging and new-product
admission are outside the monitoring release. Original STREAM guarded controls
and accounting remain distinct from these new gated paths.

## 6. Build/release checks on the new machine

CI uses Node 22 and Homey CLI 4.5.3. Use the committed lockfile:

```sh
npm ci
npx playwright install chromium
npm test
npm run lint
npm run release:check
git diff --check
npx --yes homey@4.5.3 app validate --level verified
```

Linux may need Playwright system dependencies (`--with-deps`, as in CI).
`npm run release:acceptance` / `release:monitoring` deliberately fail while
hardware gates are open. Do not weaken them to make a release pass.

Builds/dependencies under `.homeybuild/` and `node_modules/` are ignored and
regenerable; do not transfer them as authoritative source. Direct-install CLI
packing previously needed care to avoid a nested `.homeybuild` path and native
dependency loading in the desktop REPL. Follow the installed CLI source/docs
for the new machine; never reuse old host addresses, sessions or ad-hoc REPL
variables. Do not install with `clean:true`. Before any authorised install,
privately back up/read back definitions, settings, capability sets, Flows and
meters, validate the exact package and verify the running host independently.

## 7. Information map

- Current checkpoints: `docs/STATUS.md` (newest first; older blocks are history).
- Release scope/ledger: `docs/STREAM_5000_MONITORING_RC.md` and its JSON ledger.
- API/model research: `docs/STREAM_5000_API_REVIEW.md`,
  `docs/STREAM_REPORTING_API_AUDIT_2026_10_09.md`, `docs/STREAM_MODEL_COVERAGE.md`.
- Topology/mixed generation: `docs/STREAM_REPORTER_TRANSITION_PLAN.md`,
  `docs/MONITORING_REPORTER_TRIAL.md`, `docs/MIXED_GENERATION_VALIDATION.md`.
- Dual CT: `docs/DUAL_CT_RELEASE_GATES.md`, `docs/DUAL_CT_POWER_ENERGY_PATH.md`,
  `docs/DUAL_CT_GRID_ENERGY_PREPARATION.md`, `docs/DUAL_CT_CIRCUIT_PRESENTATION.md`.
- Controls/time: `docs/STREAM_CONTROL_CONTRACT_AUDIT.md`,
  `docs/STREAM_5000_REMAINING_TIME_AUDIT.md`, `docs/LEGACY_FLOW_RELIABILITY.md`.
- Community/coordination: `docs/COMMUNITY_FEEDBACK_ROADMAP.md`,
  `docs/STREAM_COORDINATION_PREVIEW.md`, `docs/COORDINATION_SOURCE_AUDIT.md`.
- Product photos/wireframes: `docs/assets/`, driver assets and their README files.
- Reproducible evidence: committed synthetic/masked `test/fixtures/` and tests.

Older sprint documents may say Beta/opt-in or local/unpublished for superseded
checkpoints. Current source has ungated physical 5000 monitoring; aggregate
Energy pairing has its own default-off consent. Do not restart completed sprints
or mistake catalogue support for hardware acceptance.

## 8. Private data and local-only recovery

GitHub is public. Credentials, app-account sessions, `env.json`, Homey CLI tokens,
full device IDs/serials, raw household reports/screenshots and support email
attachments must **not** be uploaded. They are not portable through GitHub or
Codex chat memory. Authenticate on the new machine through the normal supported
flow; do not paste secrets into chat or reconstruct them from local caches.
The Homey hub retains its own installed settings/data; cloning does not move or
reset the hub. Access still needs owner-authorised authentication.

Before wiping the old machine, privately transfer any needed evidence. The
latest migration pack is held outside the repository under the old machine's
`.codex/private-handoffs/` directory. It includes a Git recovery bundle of local
refs and a selected recent telemetry/screenshot archive, **not** credentials,
complete Homey backups, raw baseline inventories or all historical private files.
The local companion manifest identifies the private temporary evidence folders.
Temporary `/tmp` evidence can disappear; that selected archive is a safeguard,
not a complete hardware backup. Older raw reports/support correspondence and
credentials need a separate owner-controlled secure transfer if required.

Seven historical commits were not reachable from fetched remote refs at the
handover audit (`1a39a4c`, `2679d9a`, `fe84e33`, `5c41522`, `8bb4e46`,
`ed81e94`, `c7f9804`). They are kept in the private Git bundle; they are not
current-work omissions to merge automatically or authority to overwrite master.
No local stash or untracked project source was found. Preserve the bundle if
those historical local branches matter; the active diagnostic source is on GitHub.

## 9. Prompt to resume in another Codex instance

> Continue this EcoFlow STREAM repository on
> `codex/mixed-generation-reporting-diagnostics`. Read AGENTS.md,
> docs/CODEX_HANDOVER.md, the latest docs/STATUS.md checkpoint and the monitoring
> RC/acceptance ledger first. Verify GitHub HEAD/CI and local dirty state; do not
> assume the default master is current. Keep Mainline, Test and Live unchanged.
> No publishing, installation, pairing, battery settings/tasks, Flow execution,
> forced silence/reconnect or Energy/control activation without fresh approval.
> Start with a read-only state/acceptance review and propose the next bounded
> hardware check. Preserve paired tiles, Flows, custom titles and counters. Raw
> evidence/credentials stay private; do not depend on the old chat's REPL state.

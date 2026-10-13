# Project Status & Handoff — EcoFlow STREAM Series

> Living status doc. Read this first when resuming work on `uk.co.zarb.ecoflow`.

## Test v1.10.43 / Build 58 — published 13 October 2026

Diagnostic implementation `41601e1e3a5521501dbdce4cb8e0f2c2bae81ece`;
exact uploaded release/tag `v1.10.43` is
`d030937aed34973b691e0ccd00efec21a92e77c6`. Later handover commits are not the
uploaded source.

- Source CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38458787492 — passed.
- Version workflow https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38458982295 — passed.
- Exact tag CI https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38459130914 — passed (714 tests, lint, audit, Homey verified validation).
- Upload https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38459375546 — passed.
- Developer Tools Build 58 explicitly published to Test; readback confirms
  v1.10.43 available for testing. Screenshot retained outside Git.
- Public store readback was not verified: browser policy blocked accessing the
  existing failed store tab. No workaround attempted; portal Test state is the
  publication evidence. No installation or native mobile/hardware acceptance.
- No certification submission; Live remains v1.10.3 / Build 18. Local master
  `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote master
  `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged.

Release scope: optional local read-only numeric candidate preview, explicit
plaintext/model gates, per-field expiry, clear unavailable reasons and separate
reviewed/consented candidate JSON. Normal support reports stay structure-only.
No Dual CT driver/pairing, Energy source, Flows, controls or verified units/signs.

Robert's .42 report was reread live: 105 app-MQTT samples, two message groups and
41 retained field/wire entries; no numeric measurement values. Reply is draft
only. Next optional evidence is ONE candidate export from .43, plus an EcoFlow
Dual CT view/channel-role description for comparison. If preview is unavailable,
the exact reason/screenshot suffices instead: no repeated captures, full report
or crash-log request. No need to change operating mode or clamp configuration.

## Dual CT candidate preview — implementation notes (now in Test .43)

Preview-state/shareability follow-up: reason-specific unavailable messages,
separate unchecked candidate-export consent, visible reviewable bounded numeric
JSON with manual Copy/Download/fallback and dedicated filename. Normal reports
stay structure-only. Expiry/navigation/account changes and consent removal clear
the prepared export. EN/DE/NL wording now reflects both opt-ins. Receipt age is
labelled separately from capture-window age. Desktop and mobile-sized Chromium
workflow regression added; native Homey mobile webview and hardware acceptance
remain unverified. No publication, mainline or Live changes.

Audit of v1.10.42 structural fields against official STREAM guidance and pinned
third-party meter implementations supports ten legacy-overlap scalar candidates,
not a verified Dual CT contract. See SMART_METER_DUAL_CT_PLAN.md for field map,
provenance and the intentionally unmapped second-channel/energy fields.

Pure decoder added for explicitly plain 421/app-MQTT/254-21 pdata only, with
strict protobuf/size/duplicate/context/receipt-age checks. Output is unverified
numeric candidates with candidate units, never Energy/capability values. The
decoder is connected only to an explicit opt-in, bounded local research preview.
Default discovery remains structure-only. Numeric candidates are never included
in support exports; capture consent and export exclusion are distinguished.
No automatic measured value export, driver, pairing, commands or accounting changes. No masked-frame
guessing, phase summing, V*A inference, counters or zero substitution.

Mainline/Live unchanged; no commit/push/version bump/Test publication. Test stays
v1.10.42 / Build 57. The mappings are software-tested with synthetic fixtures,
not physically validated. No new tester request made this turn.
Preview requires explicit plaintext marker and app productType 421, shows field
numbers with unverified candidate units and receipt age, and never assigns CT,
phase, import/export or Energy roles. Per-field expiry is 90 seconds; stop/account
change/clock rollback clear private candidates. Missing encoding metadata leaves
the preview unavailable. Tests cover decoder gates, per-field expiry, UI consent,
late callbacks, export exclusion and API separation. No raw customer telemetry
added to Git. Local acceptance: 714 tests pass, including desktop/mobile-sized
Chromium workflow and sharing/privacy regressions; lint, diff checks and Homey
4.5.3 verified-level validation pass. These are software checks, not Dual CT
hardware acceptance. Source work remains uncommitted on the diagnostic branch.

## Test v1.10.42 / Build 57 — published 13 October 2026

Diagnostic source `8029a019f35453487b11ce49887da1766776d0ea`; exact uploaded
release/tag `v1.10.42` is `557a5787671ba42f323a88463a1579dcc3c8cb9e`.
Later documentation-only commits are not the uploaded release source.

- Source CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450103020 — passed.
- Version: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450330827 — passed.
- Exact tag CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450467205 — passed (tests/lint/audit/verified Homey validation).
- Upload: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38450707887 — passed.
- Build 57 explicitly published to Test. Developer Tools readback confirms
  v1.10.42 available for testing; screenshot retained privately outside Git.
  Public-store browser readback timed out; do not claim it was verified this turn.
- 696 local tests and lint pass. No real Dual CT mapping, installed-host/mobile
  acceptance, installation or physical validation claimed.
- Mainline/Live untouched: local master `8bb4e468e9bcc510c28049ec4e89736ac2733879`,
  remote master `66b1cb5f828a53333739798281fce86125f61c28` unchanged. Portal Live
  remained v1.10.3 / Build 18 before Test action. No certification submission.

Compact schema 3 preserves representative structure/coverage/provenance, not
measurement values. Next optional evidence: install v1.10.42, Homey app settings
> Dual CT research > Start two-minute discovery and let finish; Refresh local
summary, then Copy compact Dual CT report and send one private report. No full
integration JSON/new screenshots/manual splitting requested. Update restarts the
app, so old in-memory captures cannot be assumed retained. Dual CT pairing,
measurements, Energy, Flows and controls remain disabled. Robert reply is draft-only.

## Dual CT structure-retaining exporter — unpublished diagnostic work

Field feedback from v1.10.41 confirms provisional 421 admission, 58 accepted
samples and recognised structure, but schema 2 dropped all structures at the
size threshold. No retained field numbers/paths or measurement values were
received from that report. Do not interpret its empty arrays as absent telemetry.

### Sprint 1: representative export — implemented locally

Compact schema 3 unions unique fields by JSON device/source and protobuf
device/command. Duplicate packets no longer consume the budget. Optional
inventory candidates are trimmed first to reserve structure space, headers
are admitted across both formats, then fields are allocated round-robin with
scalar JSON leaves ahead of containers. Selected identity and route results
remain. A 7,400-character allocation ceiling reserves flag space within the
7,500-character pretty-JSON limit. No all-or-nothing structural deletion.
Coverage records included/available unique groups and fields; omission flags
now indicate partial coverage. Counts concern sanitised bounded inputs only,
not every packet or unknown field the vendor might send. Stored capture is not
mutated, and refreshing/exporting remains local-only.

### Sprint 2: reception provenance — implemented locally

Protobuf structure explicitly belongs to app MQTT. Export retains up to eight
anonymous recognised-source/format history summaries with relative receipt age
and retained-history sample counts. A listening subscription is not counted as
observed telemetry. Counts are bounded historical observations, not guaranteed
total capture counts or confirmed measurement freshness. No raw values/identities.

### Sprint 3: decoding evidence — gated pending retained structure

Next inspect representative field paths/numbers and transport provenance, match
them against audited vendor/upstream contracts, then build synthetic/redacted
fixtures for genuinely evidenced fields. Establish grid versus solar roles,
per-phase versus total values, units, sign and field-level freshness. The current
58-sample summary does not permit those mappings. No guessed decoder or driver.

### Sprint 4: read-only driver acceptance — later gate

Only after mappings are supported by real evidence, enable dedicated read-only
pairing and compare with EcoFlow. Keep Energy and controls independently gated.
Existing STREAM/5000 production acceptance can progress without full Dual CT.

No commit/push/version bump/Test publication in this implementation turn. Mainline
and Live unchanged; Test remains v1.10.41 / Build 56. Capture lifetime remains
in-memory only; do not promise earlier structure survives an app update/restart.
Local acceptance: 696 tests and lint pass; diff checks pass. Regressions cover
oversized mixed-format coverage, duplicate merging/field unions, privacy, size
limits, deterministic non-mutating export, scalar prioritisation and received
versus subscribed provenance. No new hardware observation or remote CI claimed.

## Test v1.10.41 / Build 56 — published 13 October 2026

Diagnostic source `dbfc1a3bd5df2ed9dcfbad903d0fccf44893f8e2`; exact uploaded
release/tag `v1.10.41` is `349cb7df59cfe002afbb13f07f863884112dedea`.
Later documentation-only commits are not the uploaded source.

- Source CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446293310 — passed.
- Version: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446511526 — passed.
- Exact release CI: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446697699 — passed (tests, lint, audit, verified Homey validation).
- Upload: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38446932148 — passed.
- Build 56 explicitly published to Test; portal readback confirms available for
  testing and public Test listing shows v1.10.41. No certification submission.
- 692 local tests and lint pass. No actual Dual CT capture/decoded measurement,
  installed-host/mobile acceptance or physical validation claimed.
- Mainline/Live untouched. Portal Live still v1.10.3 / Build 18 before Test action.
  Protected local master `8bb4e468e9bcc510c28049ec4e89736ac2733879` and remote
  master `66b1cb5f828a53333739798281fce86125f61c28` remain unchanged.

Provisional productType 421 admission affects opt-in discovery only. Dual CT
driver/pairing/readings/Energy/Flows/controls remain disabled. Optional next
capture: install v1.10.41, Homey app settings > Dual CT research > Start two-minute
discovery, then Refresh local summary and Copy compact Dual CT report. One private
compact report when convenient; no new screenshots/full JSON/manual splitting.
Report even a failure outcome: identification, subscription and structure are
separate gates. Reply to Robert remains draft-only for owner review.

## Selected identity and discovery outcomes — unpublished diagnostic work

Capture now retains up to two anonymous selected-meter records: identity basis,
provisional flag and authorised account-route availability, never serial/name.
The compact report preserves these and transport results ahead of optional
candidate metadata/structure. EN/DE/NL settings distinguish identification,
subscription without recognised structure, unavailable transports, unmapped
responses and recognised structure. No measurement contract is inferred.

### Production acceptance gates (separate from Dual CT completeness)

- Existing devices: update-in-place, retained IDs/Flows/counters, restart and
  account reconnect; no deletion/re-pairing required for a routine update.
- STREAM/5000: compare unit versus installation scope, freshness and charging/
  discharging signs; verify missing/stale telemetry cannot drive wrong decisions.
- Energy: charging/discharging integration, outages/restarts and socket flows;
  no double counting, discontinuity or unexpected cumulative-counter reset.
- Reliability: concurrent normal/research subscriptions, connection recovery,
  expired/cancelled captures and no diagnostic load regression during a soak.
- Settings/report export: actual Homey mobile/web host acceptance and review of
  privacy/size/fallback; passing synthetic DOM tests is not installed-host proof.
- Release: exact source CI, upgrade smoke/soak evidence, clear supported-model
  matrix and known limitations, then separately approved certification/Live.

Dual CT can remain quarantined while otherwise validated app functionality
progresses. Full Dual CT support additionally needs actual telemetry structure,
field units/signs/channel roles (grid versus solar, per phase versus total),
freshness, corroborated model identity, verified decoder fixtures, then dedicated
read-only pairing acceptance. Energy and commands are later gates, not automatic
consequences of identifying productType 421. Do not make repeated/time-limited
tester captures a condition of progress; finish software checks independently.

## ProductType 421 discovery fix — local only, 13 October 2026

Unpublished diagnostic-branch work after Test v1.10.40. Field report plus matching
EcoFlow screenshots corroborate app productType 421 on one Dual CT installation.
Independent upstream/official confirmation is still absent (see Dual CT plan).
Provisional opt-in discovery admits owned app productType 421 with empty/numeric
fallback name, rejects contradictory names and other identifiers, and separates
observed-code counts from explicit-name counts. It does not enable pairing,
readings, Energy, Flows or controls. Mainline/Live unchanged; no publish, version
bump, commit or push in this turn. Reply to tester is draft-only.
Local verification: 691 tests pass, lint and diff checks pass. Regression coverage
includes observed-code versus explicit-name counts, app-owned identity admission,
Developer-only exclusion, contradictory names/shared/invalid identities, wrong
code fields, cached-reply rejection, structure-only live capture and Stop cleanup.
No real Dual CT telemetry or hardware validation occurred in this turn.

## Test v1.10.40 / Build 55 — published 13 October 2026

Diagnostic branch source `ae9c5b70a47b63653af61953353386df17258b55`;
exact release/tag `v1.10.40` is `775958850e9764458c040bc6524746f82d5b0d13`.
Later handover commits are not the uploaded release source.

- Source CI passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38441836511
- Version workflow passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38442012964
- Exact tag CI passed (tests/lint/audit/Homey verified validation): https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38442809440
- Upload passed: https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38443074136
- Developer Tools Build 55 explicitly published to Test; readback confirms
  available for testing. Public Test store shows v1.10.40 and its changelog.
- Mainline refs unchanged: local master `8bb4e468e9bcc510c28049ec4e89736ac2733879`,
  remote master `66b1cb5f828a53333739798281fce86125f61c28`.
  Portal Live remains v1.10.3 / Build 18. No certification submission or install.
- 688 local tests and lint pass; hardware/mobile-host acceptance remains open.

Optional next evidence: install Test v1.10.40, open app settings in Homey,
Dual CT research, Start two-minute discovery, then Refresh local summary and
Copy compact Dual CT report. Send that small report privately when convenient;
download and displayed-text fallback are available. No full integration report,
manual splitting or repeated screenshots requested. Even no_explicit_model is
useful identification evidence. Do not claim the model or channel mapping is fixed.
Dual CT values, pairing, Energy, Flows and controls are still disabled.
Reply to Robert is draft-only pending owner review.

## Dual CT next-wave sprints — unpublished, 13 October 2026

Sprints 1–2 implemented locally on the diagnostic branch, extending the compact
report work below. Capture retains only allowlisted numeric vendor model/type
codes for up to eight anonymous meter-like candidates per account. App inventory
normalisation preserves those codes; Developer inventory is projected directly.
No custom names, serials, arbitrary metadata strings or measurement values are
exported. Codes and display-name hints do not authorise capture or pairing.
Unsupported string model identifiers remain an evidence gap, not guessed models.

Compact schema 2 includes safe installed app version, inventory evidence,
allowlisted JSON paths/types and bounded protobuf field/wire structure. Pretty
JSON is limited to 7,500 characters by omitting structure, then excess candidate
metadata, with explicit flags when necessary. Copy acknowledgement, failed-copy/download fallback, a distinct
download filename and mobile download-request wording are provided in EN/DE/NL.
Exports remain manual/local; no automatic transmission or new telemetry polling.

Sprint 3 has an honest gated preview in opt-in research settings: grid, solar
and phase readings are explicitly Not available, not zero. There is no verified
Dual CT channel decoder or live field contract yet, so candidate measurements
are not implemented. No selectable driver, Energy, Flows or controls enabled.

Sprint 4 release is held: no commit/push, remote CI, version bump, upload or Test
publication this turn. Mainline and Live remain unchanged. Next step is owner
review, then approved Git/CI/Test release and one convenient compact report from
Robert. Do not request repeated screenshots or promise the model issue is fixed.

Local acceptance: 688 tests pass, lint and diff checks pass. Regressions include
numeric model-code projection, unsafe metadata rejection, structural export
privacy, report size/omission flags, settings copy success/fallback, local-only
refresh, clearing on navigation and the distinct compact download filename.
No hardware, actual mobile download or remote CI acceptance claimed.

## Dual CT identification and compact report — local work, 13 October 2026

Unpublished diagnostic-branch changes. Robert reports `no_explicit_model` with
zero devices/frames while EcoFlow shows house/grid and solar three-phase views.
This proves discovery selected no eligible model, not that telemetry is absent.
No raw inventory/report has been received to establish the rejected metadata.

- Retain exact product-metadata and ownership admission; display-name hints do
  not authorise subscriptions or infer a model/channel mapping.
- Manual discovery now retains anonymous per-account inventory availability,
  bounded row counts, missing metadata, explicit matches and display-name hints.
  No names, serials, account identifiers or raw metadata are exported.
- Settings provide a compact fixed-field Dual CT summary, copy and JSON download
  with visible text fallback; unrelated integration payloads are excluded.
  This is an identification summary, not a substitute for full protocol evidence.
- Main/Live unchanged; no publication, version bump, commit or push requested.
  Real Dual CT mapping still requires evidence; no Energy/control enablement.
- Local verification: 682 tests pass, lint and diff whitespace checks pass.
  Five new regressions cover name-only rejection, ownership/bounds, compact
  export privacy, forged input and clearing inventory after account changes.
  No new hardware validation or remote CI run claimed.

## Test v1.10.39 / Build 54 — Dual CT discovery and reliability, 13 October 2026

Published to Test from the diagnostic branch only. Combined implementation
`b6ab1dd4c37aceb7049012727bb4e0dbc0326255`; exact release/tag `v1.10.39` is
`61cb03f90607f909d6a04a84ecff58f40b7d2629`. A later documentation-only handover
commit is not the uploaded release source.

- [Source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38394491908).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38394773771).
- [Exact release CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38394907919):
  tests, lint, dependency audit and verified Homey validation.
- [Upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38395137964).
- [Build 54](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/54)
  explicitly published to Test; portal readback says available for testing.
  [Public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows v1.10.39
  and the discovery/reliability changelog. No certification submission.
- Protected local master remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote master remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Developer Tools still showed Live v1.10.3 / Build 18. No Mainline/Live action,
  installation, hardware command or Community message was performed.
- Local acceptance: 677 tests, lint and Homey 4.5.3 verified validation pass,
  with synthetic/browser fixtures. Real Dual CT/broker behaviour remains pending.

Optional testing: install the Test update in place; in app settings open Dual CT
research and Start two-minute discovery. Afterwards refresh the local summary
and export one integration report when convenient. No timed screenshots,
deletion/re-pairing, operating-mode change or repeat of earlier live comparisons
is needed for this exploratory capture. Shared account connections may affect
an EcoFlow app session, as disclosed in the settings overview.

This release is **not full Dual CT support**: actual channel values/roles/units
remain unverified; vendor-contract registry and dormant channel foundation are
not connected to live data. No Dual CT pairing, Energy contribution, Flows or
controls are enabled. Next work must be evidence-led rather than guessing a
channel mapping from discovery structure.

## Combined Dual CT diagnostic Test release preparation — 13 October 2026

Owner approved commit/push and a new Test build from the diagnostic branch only.
Source and exact release CI must pass before upload and explicit Publish to Test.
No Mainline merge, certification submission, Live update or hardware action.
Dual CT discovery records anonymous structure only; channel-state foundation
remains dormant and pairing, actual channel readings, Energy and controls remain
disabled. Release verification receipts will be added after portal readback.

## Dual CT sprint 4 reliability — 13 October 2026

Local diagnostic-branch work on top of uncommitted sprint 3; no commit/push,
version bump, Test publication or Mainline/Live action in this implementation.

- App/Developer subscriptions accept a capture cancellation guard and re-check
  it after connection readiness, preventing late stopped captures attaching.
  Replaced connection objects cannot receive stale registrations.
- Pending subscriber counts protect a shared connection while other devices
  are awaiting readiness. Research removes only its own callbacks; normal meter
  and status-only listeners keep the connection alive. An otherwise idle research
  Developer connection is released after pending work settles, stopping its retry
  activity without shutting down an active ordinary-device connection.
- An inventory response arriving beyond the capture window cannot start further
  connections/probes. Probe responses after Stop are discarded before attachment.
- Cleanup exceptions are isolated per listener. Generation guards invalidate all
  capture callbacks first; failures are counted anonymously and shown as a warning
  rather than allowing one failed detachment to prevent all subsequent cleanup.
- Synthetic tests use actual shared MQTT handler registries, including same-SN
  research/ordinary meter coexistence. No hardware/Broker acceptance is inferred.

All 677 tests, lint and Homey 4.5.3 verified validation pass locally. Release gate:
commit/push the combined sprint 3/4 work, inspect exact-source CI, and obtain
explicit Test-release approval before versioning/uploading. Real Dual CT identity,
channel contract and account/broker behaviour still require hardware evidence.
Pairing, channel readings, Energy and controls remain disabled.

## Dual CT sprint 2 Git/CI and sprint 3 tester UX — 13 October 2026

Sprint 2 pushed as `a6da2abc210d5e17652cf4c65705571a397fec17` on the diagnostic
branch. [Exact source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38391670497)
(tests, lint, audit and Homey verified validation). No Test build published.

Sprint 3 is local/uncommitted: plain-language EN/DE/NL capture summary distinguishes
model-not-found, source-unavailable, empty responses, subscribed-without-receipt
and observed structure. It never claims confirmed channel values, units or roles.
Manual summary refresh reads only the existing local support endpoint: no cloud
enumeration, new capture or polling. Late/duplicate callbacks cannot replace newer
action results. A bounded 24-entry anonymous event timeline coalesces repeated
events, stores no payload/identity/values, exports relative ages and clears on
account changes/restart. It is not a full packet trace or measurement history.

The legacy one-minute screenshot/report deadline has been removed from support
guidance in EN/DE/NL. Existing live comparisons are acknowledged; fresh captures
are requested only for a specific issue and can be sent when convenient.
Pairing, actual channel decoder, Energy and controls remain disabled. Mainline,
Live and current Test releases are untouched; no version bump or upload.

Sprint 3 local verification: all 669 tests pass, lint passes and Homey 4.5.3
verified validation passes. Chromium settings checks at 390px confirm readable
summary, no horizontal overflow, one local request per explicit refresh and no
hidden polling; JSON download/message-part integrity remains covered. Synthetic
preview at `/tmp/ecoflow-dualct-local-summary.png` is not a hardware capture.

## Dual CT sprint 1 Git/CI and sprint 2 foundation — 13 October 2026

Sprint 1 committed/pushed as `bad386a7331c41302364aa97b4fed10fee8ac434` on
`codex/mixed-generation-reporting-diagnostics`.
[Exact source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38391007733),
including tests, lint, audit and verified Homey validation. No version bump,
Test upload/publication or Mainline/Live action.

Sprint 2 (now committed/pushed as noted above): `DualCtChannels` prepares independent CT1/CT2
normalized reading state, explicit unknown/grid/solar/load roles and one selected
source per channel. Per-field measurement/receipt ages, zero/signed power,
partial frames, source/role changes and clock rollback are covered by tests.
Grid import/export direction requires an explicit sign convention; channels are
never summed and missing voltage/current are never manufactured from power.

This is deliberately dormant: no vendor field decoder or verified contract is
registered, and it is not connected to the live research recorder, Homey
capabilities, Energy, Flows or controls. Synthetic normalized fixtures establish
software behaviour only. Hardware field units/channel roles remain unverified.

Sprint 2 local verification: all 662 tests, lint and Homey 4.5.3 verified
validation pass; exact-source CI subsequently passed before sprint 3 began.
No upload/publication is authorised. Protected
local/remote master refs remain unchanged; existing Test/Live releases are untouched.

## Unpublished Dual CT research option — 13 October 2026

Sprint 1 follow-up broadens manual discovery to independently authorised app and
Developer inventories, JSON/protobuf app frames, Developer JSON MQTT, and bounded
own/resolved-host quota snapshots. Sources remain separate and values are not
captured or promoted to capabilities. Host probing requires a known STREAM model
in the same Developer inventory; resolution is not a CT-role or membership claim.
Read [the model/API audit](SMART_METER_DUAL_CT_PLAN.md) for pinned upstream findings
and the remaining hardware evidence gate. Sprint 1 commit/push is approved on
13 October, with CI required before proceeding. No publication is authorised;
prior opt-in probe commit `6164d84` already passed CI.

Diagnostic branch only. Commit/push approved on 13 October; CI must pass before
any future release decision. No version bump, Test upload/publication, Mainline
merge or Live change is authorised by this work.

- Settings offer explicit Start/Stop for a two-minute read-only discovery capture.
  One list operation per saved app/Developer account; at most two owned devices with exact Dual CT
  product metadata. No guessed serial prefix, custom-name admission or shared devices.
- Uses shared app/Developer MQTT transports, not second competing sessions.
  Cached app replies cannot count as fresh data; bounded REST snapshots are labelled separately.
  Counts, protobuf command/field/wire and allowlisted JSON path/types only: no values, raw payloads,
  names, serials, credentials or persistence. Shapes/frames/payload sizes are bounded.
- Local support JSON adds `dualCtResearch`; no automatic upload or extra polling.
  Stop, expiry, account change and teardown remove only this capture's callbacks.
  Late inventory/subscription completions cannot resume stopped capture.
- This is an opt-in transport/structure probe, **not** a Dual CT driver or verified
  CT1/CT2 adapter. Product names may be absent and the meter may expose data via its
  host or Developer transport instead; absent/rejected frames remain inconclusive.
  No nested field interpretation, channel mapping, units/sign or native counters are
  inferred. Dedicated pairing, capabilities, Energy and controls remain disabled.
- Next evidence gate: confirm actual discovery identity/transport, then add a
  narrowly allowlisted channel decoder once semantics are established. Existing
  original-meter and battery accounting remain unchanged.

Robert's live comparisons are accepted as display evidence for the conditions he
tested. The one-minute multi-screen/report request has been withdrawn; no repeat
capture is required before this software work can proceed.

Verification after sprint 1: all 654 tests pass, lint passes, and Homey CLI 4.5.3 verified
validation passes. Regression coverage includes explicit metadata admission,
manual-only UI actions, cached/wrong-source/malformed/oversized frames, privacy
projection, frame limits, expiry, clock rollback, account changes/teardown and
late discovery/subscription/callback races. This does not validate real Dual CT
hardware or establish that the meter uses any particular transport. New regressions
cover independent inventory authorisation, Developer-only discovery, off-account
host rejection, bounded own/host reads, JSON wrappers/arrays/privacy, separate
source labels and stopped/restarted account/subscription races.

## Test v1.10.38 / Build 53 — bounded comparison diagnostics, 12 October 2026

Published to Test from `codex/mixed-generation-reporting-diagnostics` only.
Implementation `5ff1c3a86e06ecd3ec73f5ab242e9785db3ee80b`; exact release source
and tag `v1.10.38` are `223e9e24875a7aac0552308f6ee4d19fa944198b`.

- [Source CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38316958615).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38317077235).
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38317157501),
  including tests, lint, dependency audit and Homey verified validation.
- [Upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38317307780).
- [Build 53](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/53)
  explicitly published to Test. The portal says available for testing; a refreshed
  [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows v1.10.38
  and its comparison/queue/report-transport changelog.
- Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Live remains v1.10.3 / Build 18. No Mainline merge/push, certification submission,
  Live publication, user installation, or hardware command was performed.
  This subsequent handover-only commit is not the uploaded release source.

- Support schema 16 adds anonymous BMS/peer/grid comparisons with separate
  scopes and receipt ages. Peer minus BMS magnitude is diagnostic only: neither
  common measurement, sign/scale nor conversion loss is certified. Exact serial
  matching remains private; prefix, SOC and naming similarities never match.
- Five-minute session-only histories retain at most 16 samples per fixed power
  field. BMS charge/discharge components remain paired in the same 32/50 frame;
  no rescaling, aggregate substitution, energy-source migration or new controls.
- Original Unit app telemetry now has one running and one merged pending batch,
  rather than an unbounded promise backlog. Partial fields keep their own receipt
  times. Rejected/expired BMS writes cannot renew freshness; teardown discards
  pending work, but cannot cancel an already-running Homey SDK write.
- Monitoring trial diagnostics distinguish applied versus current candidate
  watts and report the last application-start age. Its 15-second local cadence
  and all accounting/control boundaries are unchanged.
- Numbered report messages use ASCII-encoded, fenced parts with capture grouping,
  part counts and a copy-integrity checksum. The JSON download is unchanged.
  `scripts/reassemble-support-report.cjs` reconstructs complete parts locally;
  missing, mixed or damaged parts fail closed. Encoding is not encryption.
- Local validation: 638/638 tests, lint and Homey `verified` validation passed.
  Tests cover slow SDK writes, burst coalescing, retained partial receipt ages,
  stale queued samples, fixed privacy projections, Unicode report reconstruction
  and inconsistent-part rejection. This does not certify physical accuracy.

Latest field review confirmed installed v1.10.37 and the expected idle-versus-
discharging remaining-time display in the supplied screenshots. Some screenshots
and JSON receipts are not simultaneous; DC-pack and peer/grid values must not be
treated as an established scale error. Native mobile file download is not proven
by a pasted report. The separate app-log ID and Homey mobile app version remain
outstanding. No new message is sent here; the user is reviewing a draft first.
Private reports/screenshots/identities are not retained in this repository.
Installed v1.10.38, the native mobile encoded-parts workflow and physical accuracy
remain unverified. The updated draft asks for an in-place update, five minutes of
normal operation, a close-timed combined EcoFlow/AC Keller/Home Battery screenshot
set, schema-16 JSON (or all complete encoded parts), and a matching app-log ID.

## Test v1.10.37 / Build 52 — support export and original Unit readings, 12 October 2026

The diagnostic follow-up described below is now published to Test. Mainline and
Live are unchanged; no certification submission or Live action was performed.

- Implementation `1b335122abb20e16e3c5e10dd61d3ea5364881e7`; final source
  `682a2aba355b917c1ce20cc335f89172ec3d08d6` adds deterministic ordering to the
  real-clock lifecycle regression. Direction is established before its matching
  estimate; the earlier test was timing-sensitive under the new safety rule.
- All 625 tests and lint pass locally. Final source
  [CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308419331).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308587294).
  Tag `v1.10.37` / exact uploaded source is
  `8022af83269ed72b6965a067e7ed17c90ddb9ba7`.
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308734683)
  including tests, lint, dependency audit and verified Homey validation, then
  [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38308891943).
- [Build 52](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/52)
  explicitly published to Test. Portal says available for testing, and a refresh
  of the [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  shows v1.10.37 and the new report/BMS/runtime changelog.
- Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Portal Live baseline remains v1.10.3 / Build 18. These refs intentionally
  differ; neither was synced, reset, merged or pushed.
- Installed v1.10.37, native mobile export, matching pack/AC comparisons and
  physical acceptance remain unverified. Draft asks for update-in-place, five
  minutes of normal operation, a matching screenshot/report set, complete JSON
  or all numbered parts, and a separate app-log ID. No message sent this turn.
  This later handover-only commit is not the uploaded release source.

## Test v1.10.36 / Build 51 — original-Unit startup hotfix, 12 October 2026

### Diagnostic follow-up — export, original Unit BMS flow and runtime (released above)

The tester confirmed that v1.10.36 restored both original Units without restart
or re-pairing. Later feedback describes a silent JSON-download failure, available
grid-port watts but blank original battery flow/state, and simultaneous charge
and discharge estimates. Private messages/images are not stored in Git.

- Browser download now delays blob-URL revocation rather than racing the
  download. UI says requested, not successfully saved. A manual, lossless
  8000-character parts fallback works without downloads or clipboard permission;
  it uses the same snapshot, resets on refresh/pagehide, never uploads or polls,
  and includes EN/DE/NL instructions. Native Homey mobile download is not proven.
- Original Units can restore their existing flow/state tiles from a live,
  subscribed-identity BK BMS 32/50 packet containing both field 26 charge watts
  and field 27 discharge watts. DC pack sign is charge minus discharge. No
  aggregate/port fallback, cross-packet pairing, cached get-reply promotion,
  Energy participation, or hardware control is added. Invalid packets fail
  closed; writes use the device queue and independent three-minute freshness.
- Pinned [upstream parser and public masked captures](https://github.com/shuette42/ecoflow-energy-ha/tree/12509ef6f198f57675a98872b08a870fc009943d)
  support this BMS path. Included public masked pdata regressions reproduce
  -843 W discharge, +532 W charge and -2 W idle; other admitted BK layouts and
  the tester's installation still need physical comparison. DC pack power is
  not expected to equal the app's AC-side system/connection power exactly.
- Runtime tiles require fresh same-scope signed battery power; idle, unknown,
  stale and opposite-direction estimates clear. A direction change requires a
  new matching estimate, rather than reviving the old inactive duration. 5939
  is not treated as a magic sentinel. Schema 15 keeps bounded raw minutes and
  fixed suppression reasons plus anonymous original DC pack watts. Combined
  trial time suppression and energy accounting remain unchanged. Known released
  Time to full/empty defaults migrate safely to existing scoped titles.
- Local verification: 625 automated tests passed, including lifecycle/SDK
  failures, malformed/partial/wrong-source BMS, expiry, charging/discharging/
  idle, runtime direction changes, public captures, and browser downloads,
  lossless multipart/manual clipboard fallback, refresh and pagehide.
  Verified Homey validation passed. Lint and final checks recorded in the turn.
- This increment was initially held locally on the diagnostic branch, then
  released as v1.10.37 / Build 52 with the receipts above. Mainline and Live
  remain unchanged. The response to the new feedback is draft only, pending
  user review; private messages, raw reports and screenshots stay out of Git.

After Test v1.10.35, two original STREAM units were reported unavailable with
`Invalid Capability: stream_unit_power_grid`; the combined Home Battery and
5000 monitor remained available. The same exception was reproduced in a
synthetic original-Unit startup test before changing the code. A valid custom
capability can have no driver/instance options entry, and an uncaught synchronous
`getCapabilityOptions` error aborted onReady before polling/subscription setup.
This Homey behavior is also described in [SDK issue 296](https://github.com/athombv/homey-apps-sdk-issues/issues/296).
The Build 50 crash-report inventory was empty when checked; a device init error
does not necessarily produce an app crash report. No private reports/images are
stored here.

- A shared optional title migration boundary now catches synchronous getters,
  synchronous setters and rejected writes for original grid, original runtime
  and 5000 scope labels. Failed/unknown reads are skipped, not replaced by {},
  so existing custom titles/options are not overwritten. Missing capabilities,
  missing SDK methods and teardown are guarded.
- The original Unit driver explicitly declares grid-title options for fresh
  metadata. Existing capability IDs, device identities, Flows, history, signs,
  energy accounting and control behavior remain unchanged. No deletion/re-pair.
- Regressions reproduce the exact exception on synthetic Ultra/AC Pro devices,
  exercise full init with polling/MQTT and runtime updates, and cover 5000 startup
  and metadata failures. The Unit harness now models unreadable custom options
  instead of always returning {}, and gives timers distinct handles.
- All 614 tests, lint and verified Homey validation passed locally.
  Implementation `52149cd6bbde407ddc145dcbc4089e9e4e5e9861` committed/pushed;
  [implementation CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38300678209).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38300839521).
  Tag `v1.10.36` / uploaded source `f01fce67a1840658200827b152b47b81577d0cef`;
  [exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38300943783)
  including dependency audit, then [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38301096223).
- [Build 51](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/51)
  explicitly published to Test. Portal confirms available for testing and the
  [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows 1.10.36.
  No certification/Live action or mainline merge. Protected local `master`
  remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`; remote `master` remains
  `66b1cb5f828a53333739798281fce86125f61c28`. Live baseline v1.10.3 / Build 18.
- Actual restoration on the affected installation requires update-in-place and
  tester confirmation. Prior detailed capture request is secondary to confirming
  both original devices are accessible. The new apology/update reply is draft
  only; no further community/private message was sent in this hotfix turn.

## Test release v1.10.35 / Build 50 — EcoFlow terminology, 12 October 2026

Diagnostic branch only. Original STREAM's default grid tile now reads **Unit
grid connection port**, matching the native EcoFlow app's **Grid connection
port** with an explicit unit scope. EN/DE/NL capability assets and support
explanations are consistent. The translations are ours, not a claim about
EcoFlow's localized app labels. Migration recognizes both the pre-1.10.34
import/export defaults and the released 1.10.34 grid-port defaults, while
preserving custom titles, options, capability IDs and Flow references.

The [official STREAM contract](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
describes `gridConnectionPower` as grid-port active power in W with positive
input and negative feed-in. The native app displays magnitude with Input/Output
arrows. This is a wording change only: no sign conversion, inferred battery
direction, energy accounting or control changes. Whole-house grid-meter and
individual battery-flow capabilities remain separate. Naming regressions cover
both default generations, partial localized custom names, idempotent migration,
packaged/compose agreement and unchanged positive/negative/zero values.
All 610 tests, lint, dependency audit and verified Homey validation passed.
Other suggested naming changes are not part of this increment.

- Implementation `df5d738f502d6559d0ec5c642de32e69b6bf344d` committed/pushed
  on the diagnostic branch; [CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296486924).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296648201).
  Tag `v1.10.35` / uploaded source `f1686752b1ea49259124daabbd8b9e2f914025ae`.
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296783935),
  then [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38296947705).
- [Build 50](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/50)
  published explicitly to Test. Portal and [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  verified as v1.10.35 at approximately 19:35 UTC. A browser-control stall was
  recovered before publishing; no duplicate upload or repeated publish occurred.
- Live still v1.10.3 / Build 18; no certification or Live action performed.
  Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
- The approved follow-up was sent privately and reopened for verification,
  updated to v1.10.35 and the final grid label. It asks for one matching capture
  set with screenshots, downloaded integration JSON, separate app-log ID and
  capture time/timezone. Existing evidence is retained; no mode/grouping change.
  Private message content, raw reports, screenshots and identifiers are not in Git.
- Installed version and physical acceptance are still unverified. Later
  handover-only commits are not the uploaded release tag.

## Test release v1.10.34 / Build 49 — original STREAM freshness and support capture, 12 October 2026

The user now authorizes Test publication from the diagnostic branch, including
the earlier unshipped grid/scope/runtime fixes below. Local and remote `master`
already differ and are protected separately; neither is merged/reset/pushed.
Live remains v1.10.3 / Build 18. Test advanced from v1.10.33 / Build 48 to
v1.10.34 / Build 49; portal and public Test listing verified at 18:43 UTC.

Release receipts:

- Implementation commit: `1e0ef6601771f8f0ac57788994b135dca3041771` on
  `codex/mixed-generation-reporting-diagnostics`;
  [implementation CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38291679387).
- [Version workflow passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38291823684).
  Tag `v1.10.34` and uploaded release source:
  `4a3ccdc335df905be8692e94a606709b6bfe0733`.
- [Exact-tag CI passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38291955747),
  then [upload passed](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38292136499).
- [Build 49](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/49)
  explicitly published to Test. Portal confirms available for testing;
  [public Test listing](https://homey.app/a/uk.co.zarb.ecoflow/test/) shows 1.10.34.
  No certification submission or Live publication was performed.
- Protected local `master` remains `8bb4e468e9bcc510c28049ec4e89736ac2733879`;
  remote `master` remains `66b1cb5f828a53333739798281fce86125f61c28`.
  Neither was changed. Any later handover-only commit is not the uploaded tag.
- Installed version and physical acceptance are not established by this release.
  Matching hardware captures and restart/recovery/rollback/soak checks remain open.

- Original Home Battery/Unit watt and state tiles have independent three-minute
  receipts and minute expiry. Empty REST, SOC-only and temperature-only updates
  cannot renew old watts; unit-port packets cannot renew house-meter watts.
  Startup clears persisted watts. Actual unchanged receipts and zero are valid;
  SDK failures, delayed/future/out-of-order packets, clock rollback, trial
  suppression and teardown have regressions. Energy accounting stays unchanged.
- EN/DE/NL support settings include a matching-capture checklist: combined
  EcoFlow flow with units expanded, matching Homey pages, the same downloaded
  JSON, and an immediately-created separate Homey app-log ID. Aim for one minute
  and record local time/timezone or a longer gap. No automatic upload, deletion,
  re-pair or mode change is required.
- Anonymous schema 14 adds original applied/received watt freshness and
  `originalLimits`. A bounded BK 254/21 decoder observes four limit/max fields
  from pinned upstream definitions. Cached get replies do not renew limits;
  readings expire in three minutes. Known models and subscribed identity are
  required. Maxima and setpoints stay distinct, scope remains unverified and
  controls disabled. Existing shared app telemetry is used, not another login.
- Fresh read-only API queries at 18:15 UTC covered all six owned batteries:
  two BK61 and four BK31. Each quota/all returned 15 fields; neither all nor
  targeted reads returned the four limit fields. Other routes/models may differ.
  No commands were sent; credentials, raw responses and serials are not stored.

Local checks: 608 tests, TypeScript, lint, dependency audit (zero vulnerabilities),
Homey CLI 4.5.3 verified validation and whitespace checks passed. Matched hardware
captures, restart/recovery/rollback and normal-use soak remain production gates.

## Earlier unshipped follow-up — freshness, scopes and diagnostic continuity, 12 October 2026

Changes confined to `codex/mixed-generation-reporting-diagnostics`, based on
`ab08bf20eb950792ba4afe7ea90c1f53fc2b7ece`. Diagnostic-branch commit/push and
exact-commit CI verification were authorized on 12 October. This earlier increment
was held for Test; the new authorization above included it in the v1.10.34 Test
release. Mainline merge and Live changes remain on hold. The baseline below remains
separate from these unshipped changes. Check the exact branch HEAD in
[GitHub Actions](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/workflows/homey-app-validate.yml)
when continuing; source sync and CI success do not establish hardware acceptance.

- A telemetry receipt is no longer marked successfully applied before the
  Homey capability write completes. Anonymous schema 13 `readingFreshness`
  separates `receivedAgeSec`, the last applied `ageSec` and fixed
  `applicationStatus` (`applied`, `write_failed`, `stale`, `unavailable`).
  Rejected writes do not renew freshness or restore availability. Clearing
  failures remain visible and retry on the watchdog; clearing old values is
  not another telemetry receipt. A fresh successful reading of the failed
  field is required for recovery; unrelated temperature deltas cannot mask it.
- Expired/future/out-of-order queued writes cannot overwrite fresh values or
  manufacture availability. Slow writes retain original receipt age. Expired
  accessory data cannot create tiles. SDK failures are isolated per reading;
  later fields and queued work continue, with teardown guards retained.
- Physical 5000/legacy monitors label battery readings as **Unit** and house/grid
  context as **System**. The signed reported meter and flow-derived import/export
  remain separate sources. Default-title migration preserves custom titles,
  existing options, capability IDs and Flow references; no re-pair is needed.
- Original STREAM `stream_unit_power_grid` is now **Unit grid-port power**,
  sourced unchanged from `gridConnectionPower`. A supplied AC Pro screenshot
  shows positive port watts while sockets are zero and signed battery tiles
  are blank. These measurements are distinct: do not invert port power or
  substitute combined power/state for an unverified individual reading.
  The screenshot is not a matched API capture or proof of a universal sign
  convention. Subsequent read-only app/API checks on original hardware confirm
  the app shows positive port watts with an Output arrow and a distinct signed
  system battery reading. This is not acceptance of mixed-generation unit power.
- Original Home Battery grid now reads only `powGetSysGrid`. Neither unit
  `gridConnectionPower` nor installation AC `sysGridConnectionPower` can replace
  the whole-house meter in a partial packet. Startup clears persisted fallback
  grid values. Unit port watts and their existing sign remain unchanged.
- Original remaining-time capabilities use BMS estimates for physical units
  and CMS estimates for the Home Battery; absent CMS never borrows a pack's
  estimate. EN/DE/NL default titles identify Unit/System while retaining custom
  titles/options/IDs. Estimates are non-negative finite minutes; explicit zero
  and long durations such as 5939 are retained, not guessed to be sentinels.
  Independent three-minute receipts, startup clearing, minute expiry/retry,
  SDK-write failures, delayed/future packets, clock rollback and teardown are
  covered. Widgets reject expired/failed estimates before the watchdog clears
  tiles. Trial/rollback suppression remains intact. Missing system estimates
  intentionally stay unavailable instead of displaying individual runtime.
  Anonymous `remainingTime` diagnostics project fixed source/age/status fields
  only; no raw values, identities, network calls or private captures are added.
- Energy integration, counters, checkpoints, reporter selection, controls and
  grouping remain unchanged. No private reports/screenshots/identities are
  stored in this increment; tests use synthetic and already-masked fixtures.
- The mixed-discharge regression separates idle AC 5000/Ultra observations,
  active original AC Pro peer watts and combined battery power. Raw peer watts
  remain diagnostic-only; they do not enable signed physical flow or accounting.
- Anonymous schema 13 `readingExplanations` and the support UI distinguish
  unverified physical flow, expiry, application failure and missing reports.
  Trial wording explicitly separates combined monitoring from original counters.
- Exact private peer identity can correlate a paired original STREAM monitor to
  an anonymous driver/index reference. SOC and raw-power-versus-port comparisons
  require independent fresh receipts within 30 seconds of each other. Prefix/SOC
  similarity, duplicates and stale peers never establish a match. No public
  serial, automatic grouping, verified measurement equivalence or control
  authority is created; optional getter failures remain isolated.
- Session-only counter continuity records missing/invalid/stale/baseline,
  unchanged, advances and reset evidence. A five-minute unchanged counter plus
  current matching-direction watts is only a possible stall, not proof of a
  faulty counter or sustained discharge. Missing fields do not renew receipts;
  gaps, invalid recovery, rollback and teardown prevent false continuity.
  Counter sources and cumulative totals are unchanged.
- A read-only native-app/Developer API/Homey comparison on the owner's original
  STREAM installation found close combined power/SOC agreement, duplicated
  parallel port flows and an advancing Homey discharge counter. Individual
  remaining-time estimates are not proof of combined runtime. App-only grid
  output/AC charging limits remain investigation candidates, not guessed writes.
  See the 12 October section of `STREAM_REPORTING_API_AUDIT_2026_10_09.md`.

Local checks: all 596 tests passed, TypeScript, lint, Homey CLI 4.5.3 `verified`
validation and whitespace checks passed. These local checks do not establish
real-hardware acceptance; GitHub CI is a separate exact-commit gate.
Next release gates remain matched combined/individual discharge evidence,
restart/recovery/rollback checks and a normal-use soak, not a capability-label
change alone. Test is now explicitly authorized above; Live is not.

## Latest Test release — v1.10.33 / Build 48, 12 October 2026

Working only on `codex/mixed-generation-reporting-diagnostics`, based on the
latest mixed-generation feedback and review of manually submitted reports.
Committed and pushed to the diagnostic branch, then released to Test with
support schema 12. Mainline and Live remain unchanged; the Robert reply is a
review-only draft, not posted.

- Implementation: `f4d90a5edf65a093b19461262acd05ade5d7c2da`;
  release/tag: `adda09b60af2db6cd66aa081c15c628ba5284eb7` / `v1.10.33`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38257541669),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38257723239),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38257851008)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38258048377)
  succeeded. Exact-release CI passed 554 tests, lint, zero-vulnerability audit
  and Homey CLI 4.5.3 validation at `verified` level.
- [Build 48](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/48)
  was published using Publish to Test; the portal confirmed available for
  testing and the [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  showed v1.10.33. The refreshed Live store remains v1.10.3. Remote `master`
  remains `66b1cb5f828a53333739798281fce86125f61c28`. No mainline merge,
  certification submission, hub installation, Community post or hardware
  acceptance occurred. Publication was explicitly authorized for Test only.

- Fresh, fully applied combined SOC/power/state remain available while newer
  donor values await the next local tick. Their own conservative three-minute
  expiry cannot be renewed by later packets. Removal, changed identity, stale
  evidence, clock rollback and capability-write failures still fail closed.
  Core Flow conditions and widgets retain exact-current-value checks; a
  superseded snapshot cannot fire a crossing. `updatePending` is separately
  reported rather than misclassifying every value change as a connection loss.
- Individual watts/PV/socket/state have a three-minute freshness limit,
  independent of the configurable connection timeout. Temperature-only deltas
  cannot renew old watts. Expiry clears values on the existing minute watchdog;
  diagnostics mark them stale immediately. SOC/temperature/health retain their
  existing timeout. Accounting algorithms, checkpoints and sources are unchanged.
- Linked physical monitors explain intentionally unavailable signed power and
  direction with a localized warning. System watts are not substituted for unit
  watts. Support schema 12 adds fixed anonymous `physicalPower` explanations and
  `ownUnit` SOC/raw-power observations, independent of system and peer records.
  Raw sign/scale and pack scope remain unverified; no new Energy input or control.
- EN/DE/NL support guidance separates the JSON file from Homey's app-log ID and
  warns that pasted report messages may be truncated. A screenshot-first route
  is offered; technical JSON is collapsed by default. No automatic network
  refresh, upload or support message is introduced.
- Local validation: 554 tests passed, including a serial-keyed self-record
  lifecycle replay, write-race/removal/expiry/clock regressions, independent
  reading expiry, safe diagnostic projection and browser settings checks.
  TypeScript, lint, `git diff --check`, dependency audit (zero vulnerabilities)
  and Homey CLI 4.5.3 validation at `verified` level also passed locally.
  Implementation and exact-release GitHub CI also passed; no hardware soak occurred.

The latest evidence supports combined charging monitoring but the screenshots
and JSON were captured at different times. Combined discharge while original
units contribute, cumulative-counter scope and physical control migration are
not accepted. Preserve all supplied evidence; request only a matching EcoFlow
combined/individual breakdown and refreshed JSON during natural original-unit
discharge. New app-log IDs are needed for reproduced problems, not every snapshot.
See the updated [trial plan](MONITORING_REPORTER_TRIAL.md) for late-October hardware
acceptance. Private reports, serials, contact details and screenshots remain out
of Git; tests use synthetic or already-masked public fixtures.

## Previous Test release — v1.10.32 / Build 47, 11 October 2026

Implemented on `codex/mixed-generation-reporting-diagnostics` while waiting for
the time-matched evidence requested in [Community reply 67](https://community.homey.app/t/157399/67).
Published to Test with support schema 11. Mainline and Live remain unchanged.

- Implementation: `912cf6810fb00477ce7cdcc61e8e4312fd71ff79`;
  release/tag: `13fef587ee6a45860ebc44e89909540ee383bdf6` / `v1.10.32`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181513564),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181645010),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181714544)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38181838179)
  succeeded. Exact-release CI passed 543 tests, lint, dependency audit (zero
  vulnerabilities) and verified Homey validation.
- [Build 47](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/47)
  confirmed available for testing; the refreshed [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  showed v1.10.32. The refreshed Live store remains v1.10.3. Remote `master`
  remains `66b1cb5f828a53333739798281fce86125f61c28`. No mainline merge,
  certification submission, hub installation, Community post or hardware
  acceptance occurred. Publication was explicitly authorized for Test only.

- Settings report requests have a 15-second local-report deadline and a
  180-second explicit reporter-check deadline (up to eight sequential bounded
  checks). A timeout permits manual retry, clears copy/download, and rejects
  late/duplicate callbacks. There is no automatic retry or server cancellation
  claim. Page teardown cancels UI timers and invalidates pending callbacks.
- EN/DE/NL capture metadata shows app version, UTC capture time and elapsed age.
  A ten-second local UI ticker does not fetch telemetry or change the saved JSON.
  Readiness, receipt ages and stale flags remain explicitly capture-time values.
  Invalid/future capture timestamps show an unknown/clock-mismatch warning.
- Peer and system/flow caches reject future receipts and discard future cached
  observations after a backwards wall-clock jump. New partial packets cannot
  revive old power or PV fields. Delayed packets on an unchanged clock remain
  out-of-order packets, not a reset. This does not affect energy accounting.
- Anonymous session summaries retain active/unavailable/unobserved durations,
  longest observed unavailable/stale-or-disconnected intervals, state transitions,
  discarded-event counts and clock-reset counts even after the 32-event tail
  rolls over. Repeated identical checks renew observation without adding events.
  Healthy time is bounded by the three-minute freshness window; unchecked gaps
  are not counted as healthy. Backwards clock jumps start a new measurement epoch.
  These are observed software states, not packet-level gap measurements or proof
  of hardware/controller/whole-installation acceptance.
- A deterministic 72-hour mixed-generation simulation exercises 4,320 steps,
  outages/recovery, partial/delayed packets, identity changes, six restarts and
  rollback. Original counters/address stay unchanged; controls remain blocked.
  Another test checks timer/subscription cleanup over 100 physical-monitor
  sessions. Existing duplicate/overlap and write-failure regressions remain.
- Local validation: 543/543 tests, lint, TypeScript, `git diff --check` and
  Homey CLI 4.5.3 validation at `verified` level passed. The mobile capture-age
  display and unchanged JSON download/no hidden API polling were checked in
  Playwright. Implementation and exact-release CI also passed; no new hardware
  soak has been run.

Next: review Robert's original v1.10.31 JSON, EcoFlow combined/individual
screenshots and separate app diagnostic ID together before changing combined
capacity/grouping, energy-counter sources or 5000 controls. Preserve any existing
v1.10.31 capture and its timestamps; identify the installed version for subsequent
captures. v1.10.32 adds diagnostic reliability, not a combined-system repair or
new battery controls. Keep release and hardware acceptance claims separate.

## Previous Test release — v1.10.31 / Build 46, 11 October 2026

Released from `codex/mixed-generation-reporting-diagnostics`, following the
[pasted report in reply 65](https://community.homey.app/t/157399/65) and
[Homey overview screenshot in reply 66](https://community.homey.app/t/157399/66).
The screenshot is not an EcoFlow combined-system screen; individual tile SOCs
do not prove combined capacity, membership or controller ownership. No raw
reports, device identities, contact details or screenshots are stored in Git.

- Implementation: `84c5f393cd4cf9531bdd5a4b256592c6d12413eb`;
  release/tag: `30c0f975d93b25ec540f340f219f5100b485285a` / `v1.10.31`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38177795236),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38177904291),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38177957863)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38178064178)
  succeeded. Exact-release CI passed 533 tests, lint, dependency audit (zero
  vulnerabilities) and verified Homey validation.
- [Build 46](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/46)
  confirmed available for testing; the refreshed [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/)
  showed v1.10.31. Live was rechecked and remains v1.10.3. Remote `master` remains
  `66b1cb5f828a53333739798281fce86125f61c28`; no mainline merge, certification
  submission, hub installation, Community post or hardware acceptance occurred.

- Support schema 10 adds bounded, anonymous peer SOC/raw-power/PV values with
  independent receipt ages and three-minute stale flags. Partial records do not
  refresh absent fields; invalid/future data, foreign sources and out-of-order
  overwrites cannot appear as fresh readings. Session reset clears the cache.
- Peer power remains raw protocol data with unverified sign/scale and entity
  scope. It is diagnostic-only: no power summation, SOC averaging, capacity
  inference, capability remapping or accounting input.
- Grid-meter and flow-derived grid power now have separate fixed source labels
  and a receipt-aligned diagnostic comparison in EN/DE/NL settings. A difference
  is not labelled battery loss or a verified common measurement boundary.
- Readiness explicitly labels eligibility as activation-only. An active trial
  is not failed merely because it is no longer eligible for activation.
- A synthetic mixed-generation regression joins two original peers, original
  zero readings, selected reporter SOC/power and disagreeing grid sources;
  restart clears cached donor values until fresh evidence returns. Counter
  continuity and blocked controls remain asserted.
- Local tests: 533/533 passed; TypeScript build, lint, whitespace checks and
  Homey validation at `verified` level passed. Mobile settings layout and JSON
  download were checked. Physical acceptance remains pending.
- The capture request was subsequently approved, posted and reopened for
  verification as [Community reply 67](https://community.homey.app/t/157399/67).
  Await one time-matched EcoFlow combined/individual battery capture, Homey Home
  Battery detail, refreshed schema-10 JSON and a separate app diagnostic ID from
  v1.10.31. Preserve any original capture; v1.10.32 now exports schema 11 and
  subsequent captures must identify the installed app version.

## Previous Test release — v1.10.30 / Build 45, 11 October 2026

Published to Test from `codex/mixed-generation-reporting-diagnostics`, following
Robert's close-time follow-up capture in reply 59. The portal confirmed "Your app
is currently available for testing" and the refreshed Test store showed v1.10.30.
Mainline `master` and Live remain unchanged (v1.10.3 / Build 18). No certification,
hub installation or hardware acceptance was performed. This is a default-off
monitoring trial, not an automatic migration or a validated whole-system repair.

- Implementation commit: `63a7304a1c7c9bbe2b03ef394f4559e6de303b21`;
  exact release/tag: `16a006728ac2d6af8d66b1ec622a427455f7802b` / `v1.10.30`.
- [Implementation CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159264875),
  [version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159378948),
  [exact-release CI](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159459071)
  and [tag-pinned upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38159612115)
  succeeded. CI passed 529 tests, lint, dependency audit and verified Homey validation.
- [Build 45](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/45)
  is published to [Test](https://homey.app/a/uk.co.zarb.ecoflow/test/).

- Default-off per-original-Home-Battery opt-in reuses an exact, fresh, paired
  ES21/ES22 reporter for system SOC, derived battery watts and charging state.
  Existing device ID/Flows stay; no re-pairing or extra Energy aggregate.
- Original charged/discharged accounting and history sources are unchanged and
  not promoted to verified combined-system totals. Old installation flow tiles
  clear during the trial; battery controls are blocked, not migrated.
- Fail-closed freshness, duplicate/overlap checks, restart, persisted rollback
  wait, capability-write failure and in-flight operation safeguards are tested.
  Widgets remain local-only; old control floors do not create combined runtime
  estimates. Missing solar is not treated as zero by below-threshold conditions.
- Reliability hardening rechecks trial receipts and applied values when Flow
  conditions execute; unavailable/suppressed conditions throw even if inverted.
  Local expiry clearing continues while network lookup is pending. Identity
  checks have a 20-second overall abort deadline and REST attempts a 15-second
  wall-clock deadline. Cancelled requests and HTTP 429 are not retried.
- Private binding/rollback state uses one versioned record; setting/record
  mismatches and corrupt records fail safely on restart. Setting changes are
  bounded/serialized and cancelled across teardown; rollback completion stays
  unavailable until persistence succeeds. Failure-injection tests cover these
  paths, delayed packets and timer cleanup without hardware commands.
- Schema 9 adds anonymous trial state and independent raw-flow/grid comparison
  diagnostics; existing formulas and accounting are unchanged.
- Readiness panel explains fixed blockers and safe next steps, with local JSON
  download separate from Homey's app-log ID. Refresh/check requests cannot
  overlap. Widgets distinguish selected system readings from original-source
  history and suppress old control advice during trial/rollback.
- Session-only anonymous timeline is bounded to 32 events. Local refreshes
  coalesce during slow Homey writes; post-write freshness is checked before
  availability or threshold triggers can recover. Widget freshness is captured
  once per response. No additional widget polling or subscriptions.
- Local checks: 529 tests passed; TypeScript, lint, whitespace checks and Homey
  CLI 4.5.3 verified validation passed. Exact-commit CI also passed as linked above.
- See [implementation and tester acceptance steps](MONITORING_REPORTER_TRIAL.md).
  Real combined coverage, charging/daytime/original-unit-active captures,
  counter scope, a normal-operation hardware soak and 5000 command acceptance
  remain external gates.

## Previous Test release — v1.10.29 / Build 44, 10 October 2026

Published to Test from `codex/mixed-generation-reporting-diagnostics` and
verified in the portal and refreshed store listing. Mainline `master` is unchanged;
Live remains v1.10.3 / Build 18. No certification submission, hub installation or
physical acceptance was performed. See [the comparison and acceptance plan](REPORTER_SHADOW_VALIDATION.md).

- Exact source/tag: `82fedeaad159896ee1b87025f38e226b0ce9105b` / `v1.10.29`;
  implementation commit `c50ca99f81fb10bb045116ef7a467431b585699f`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38077544151),
  [exact-release validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38077593274)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38077674719)
  succeeded. CI passed tests, lint, dependency audit and verified Homey validation.
- [Build 44](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/44)
  confirmed "Your app is currently available for testing";
  [Test store](https://homey.app/a/uk.co.zarb.ecoflow/test/) showed v1.10.29.

- Support schema 8 adds a UTC `capturedAt` and anonymous `reporterShadow`
  comparisons. Exact main-serial resolution and fresh peer correlation must agree;
  model-family similarity alone cannot select a reporter. Duplicate paired
  representations remain ambiguous instead of silently choosing one.
- Resolved identity is session-only and private. Teardown/reinitialization and
  failed lookups invalidate it; late lookup completions cannot restore it.
- Original aggregate observations and candidate system SOC/power are compared
  per field, with freshness and receipt skew. SOC is a reported system field;
  battery power is derived from app-protocol flow data. Neither is promoted to
  verified installation-wide evidence by the comparison.
- No accounting, history, device identity, Flow, control target, grouping or
  pairing changes. No extra subscriptions, polling timers or automatic lookups.
- Local build, lint, Homey verified validation and all 474 tests passed.
  Mixed-generation captures and hardware acceptance remain required; this release
  does not repair the aggregate source or change Homey Energy accounting.

## Previous Test release — v1.10.28 / Build 43, 10 October 2026

Both STREAM 5000 Series Unit and STREAM Home Battery (5000) store cards now
show the supplied actual AC 5000 product photo on white, visually verified on
the refreshed Test listing. The shared wireframe SVG icons remain byte-for-byte
unchanged. Photo preparation and wireframe raster preparation now target separate
directories to prevent accidental replacement of store photos.

- Source/tag: `18b0b54fe2c001e247b9c4fdc0e18cb20f85041f` / `v1.10.28`;
  photo fix commit `8ed98d0` on `codex/mixed-generation-reporting-diagnostics`.
- All 459 local tests, lint and verified Homey validation passed.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064896023),
  [exact-release validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064956742)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38065084696)
  succeeded for this release.
- [Build 43](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/43)
  is published to Test; portal confirmed "Your app is currently available for
  testing." Store version and both photos were verified after refreshing.
- No pairing, runtime, Energy accounting or control changes. No re-pairing is
  required. Mainline `master` and Live are unchanged; no certification, hub
  install or physical acceptance was performed. Existing hardware acceptance
  gates below remain open.

## Previous Test release — v1.10.27 / Build 42, 10 October 2026

Owner approved lifting the publication hold for this diagnostic release. Build
42 is published to Test and verified in the developer portal: "Your app is
currently available for testing." [Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Source remains on `codex/mixed-generation-reporting-diagnostics`; mainline
`master` was not merged or changed. Live remains v1.10.3 / Build 18, verified
in the portal before publishing. No certification, hub install or physical
acceptance was performed.

- Exact source/tag: `85d8fb7ecf823548f8281c2379dbff2b47f0a931` / `v1.10.27`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38063812285),
  [exact-release validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064181883)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38064286184)
  succeeded. CI passed tests, lint, dependency audit and verified Homey validation.
- [Build 42](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/42)
  includes Sprint 3 source/freshness guidance, original-meter direct MQTT and
  host fallback, reporter/counter diagnostics, and the prior AC 5000 artwork/name
  changes. No re-pairing is required. Energy accounting and control safeguards
  remain unchanged; native counter migration and Dual CT admission stay disabled.
- Next acceptance: installed meter source/freshness checks, Robert's integration
  report plus separate app-log ID, original-meter midnight/export/restart evidence,
  and authorised Dual CT channel discovery. Software checks do not establish
  installation-wide reporting, CT roles or physical control behaviour.

## Diagnostic meter Sprint 3 — 10 October 2026 (publication hold)

The diagnostic branch `codex/mixed-generation-reporting-diagnostics` now includes
the original-meter direct MQTT/fallback implementation, counter evidence checks
and meter UX follow-up. App settings show anonymous direct/fallback/missing/stale
grid summaries with receipt ages and EN/DE/NL guidance. Energy accounting remains
integrated power; native counter migration, topology repair and Dual CT admission
remain disabled. Existing device IDs and pairings are preserved.

All 456 tests, lint and local verified-level Homey validation passed; Chromium
mobile-width summary rendering was checked. No installed hardware acceptance is
claimed. See [meter roadmap and evidence gates](SMART_METER_DUAL_CT_PLAN.md).

At this implementation checkpoint, publishing to Test was explicitly on hold;
the owner subsequently approved Build 42 above. The earlier uploaded Build 41 contains
the artwork/name release only, not these subsequent meter/reporting changes.
To test the new diagnostic code through the store, first approve a new versioned
release from this branch, validate that exact release commit, upload a new build
and then publish it to Test. Do not publish Build 41 expecting it to contain Sprint
3. Last verified store status below is historical, not rechecked by this Git sync.
Mainline `master`, release version and store channels remain unchanged.

## Artwork and display-name update — 10 October 2026

Owner requested photo-derived AC 5000 wireframe artwork and removal of Beta
from the two active driver names. Shared icon SVG and 75/500/1000px transparent
store images now derive from the supplied photo through one contour-art source.
Names are STREAM 5000 Series Unit and STREAM Home Battery (5000), with DE/NL
equivalents and matching current UI/readme references. Driver IDs, saved device
names, pairing opt-in, API warnings, read-only gates and Energy roles are unchanged.
No re-pairing is required. See [artwork provenance](STREAM_5000_ARTWORK.md).
Local 419 tests, lint and verified-level Homey validation passed. Release status
is v1.10.26 / uploaded Build 41, NOT verified as published to Test. The developer
portal first returned Failed to fetch, then the browser connection timed out
twice before the Publish to Test action could be taken. Last verified Test remains
v1.10.25 / Build 40; Live remains v1.10.3 / Build 18. This earlier release plan is
superseded by the diagnostic publication hold above; Build 41 does not contain
the subsequent meter sprints.

- Source/tag: `93fc6e951d47a33025dbbc8588cf2b9458b42d2a` / `v1.10.26`.
- [Version](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38051359738),
  [exact-version validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38051419457)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/38051500730)
  succeeded. Upload log confirms `uk.co.zarb.ecoflow@1.10.26 successfully uploaded`
  and gives [Build 41](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/41).
  No certification, Live publication, hub install or physical acceptance.

## Current handover — 9 October 2026

### Latest Test release — v1.10.25 / build 40

Published to Test and verified in the developer portal on 9 October 2026:
“Your app is currently available for testing.”
[Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Production remains v1.10.3/build 18; no certification submission or hub install
was performed. This release supersedes the build 39 Test status below.

- Release source/tag: `fad5d64882180259b2e9229b20344eb576ece371` / `v1.10.25`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37998965819),
  [exact-version validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37999128465)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37999282609)
  succeeded. Tests, lint, dependency audit and verified-level Homey validation passed.
- [Build 40](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/40)
  includes the optional BK PV3/4 read-only decoder, independent freshness/stale
  clearing and reporting/topology regression follow-up described below.
  Energy accounting and control gates remain unchanged. Existing pairings are
  preserved. Physical port ordering, live app-transport validation and Robert's
  report remain pending; Test availability is not hardware acceptance.
- Mainline `master` and the diagnostic branch contain the release version.
  The separate local `master` worktree remains deliberately untouched.

### Mainline integration

The user approved promoting the diagnostic branch (reporting improvements,
regression/API audit and optional BK PV diagnostics) to the GitHub mainline,
which is named `master`. The remote is an ancestor, so promotion is fast-forward;
the separate local `master` worktree is deliberately left untouched. This is a
source integration was followed by the v1.10.25 Test release recorded above;
there is no production release or hardware acceptance. Robert's report and
physical PV-port verification are still pending.

### Local follow-up — reporting/topology regression and fresh API audit

Implemented optional original-BK app telemetry PV3/4 diagnostics locally on this
branch. `streamBkPvDiagnostics` decodes only four float fields from 254/21; shared
header framing is reused, not ES telemetry mapping. Known-model limits admit
BK11/BK61 PV3/4 and BK12 PV3. Observed voltage/current tiles are read-only,
candidate-port-labelled and excluded from Insights; each expires after 20 minutes
(watchdog every minute), clears on restart and appears only when observed.
No app login means the existing REST/JSON path still works unchanged. A newly
configured app login requires device/app restart to establish this optional
subscription. App frames never enter quota/power/energy accounting. Support JSON
exports only fixed-list receipt ages/staleness. Synthetic decoder/lifecycle/privacy
regressions pass: 418 tests total, lint and diff checks pass. Hardware port ordering
and live app-transport validation remain open; now included in Test build 40.
Pinned Homey CLI 4.5.3 also passed verified-level validation and TypeScript
compilation. It warned that local Node 22 is below its declared Node >=24 engine;
release CI should still perform validation on its configured supported runtime.

Added seven synthetic regression tests on the diagnostic branch; no runtime or
release changes. [Audit and next evidence](STREAM_REPORTING_API_AUDIT_2026_10_09.md)
records fresh read-only Developer API calls and independent ES21/ES22 upstream
evidence, including the official-versus-app transport distinction and new BK
PV3/4 diagnostic candidates. Await Robert's report; preserve pairings, control
gates and beta labels. This follow-up is not included in Test build 39.

### Latest Test release — v1.10.24 / build 39

Published and verified in the developer portal on 9 October 2026: “Your app is
currently available for testing.” [Test link](https://homey.app/a/uk.co.zarb.ecoflow/test/).
Production remains v1.10.3/build 18. No certification submission or hub install
was performed. `master` remains unchanged; work is on
`codex/mixed-generation-reporting-diagnostics`.

- Release source/tag: `7dfe9ad6d5d2b9ff07c9da8d7da67869f64c550a` / `v1.10.24`.
- [Version run](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991704150),
  [exact-version validation](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991909121)
  and [upload](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37992320031)
  succeeded. Tests, lint, dependency audit and verified-level Homey validation
  passed; local tests passed 402 cases.
- [Build 39](https://tools.developer.homey.app/apps/app/uk.co.zarb.ecoflow/build/39)
  was separately published to Test. Includes Copy report, manual-copy guidance
  and safe fixed-list control-failure reason/action/count diagnostics. It does
  not change grouping, energy accounting, command plans or control safeguards.
- Docker Hub 429 failures were resolved by replacing the three Athom Docker
  wrappers with their equivalent pinned `homey@4.5.3` CLI commands in existing
  GitHub workflows (`f0141b257a04fffe1da1a36e5d13a877fc8ad5cf`). Official pinned
  action entrypoints were inspected first. Authentication uses the existing
  GitHub secret; no validation gate was bypassed.
- [Community reply 45](https://community.homey.app/t/157399/45) was posted and
  verified. Robert was asked to update in place, wait five minutes, send copied
  Show support report JSON privately after review, a fresh Homey app-log ID,
  concurrent screenshots and the original warning action/Flow. No re-pair or
  control retry was requested. Await his response; do not send duplicates.
- Robert's 0% combined reading remains unresolved. Ed gets better report
  sharing, not Solis control or battery coordination. Hardware gates remain.

### Earlier release attempt — report sharing and control diagnostics (superseded)

Implementation is pushed as `c7e82b97722659b65d97c438ccb835bb00487430` on the
diagnostic branch; local 402 tests and lint passed. Release attempt on 9 October
is blocked by Docker Hub `429 Too Many Requests` building Athom action containers.
[Version run 37991299242](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991299242)
failed initially and on retry before any version changes;
[validation run 37991352859](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/37991352859)
also failed at container preparation. No new upload or Test publication occurred.
Test remains v1.10.23/build 38. Resume version workflow, exact-version validation,
upload and portal publication when registry access recovers; do not bypass CI.
Robert's follow-up has not been posted. Once released, request copied displayed
report AND fresh Homey app-log ID, screenshots and the original warning trigger;
do not ask him to retry controls or re-pair.

Post 44 and manual log `ed73698e-c303-40fe-9783-7810e2366f01` confirm individual
SOC readings around 9–10% while the original aggregate remains 0%. The emailed
screenshots are available under the collapsed attachments section. The manual
log shows live ES22 telemetry and established transports, but does not contain
the displayed schema-6 support snapshot. Ask for that JSON separately; preserve
pairings and identify the action/Flow which produced the no-commands warning.

Local changes add Copy report with clipboard-failure/manual-copy guidance and
explicitly distinguish the displayed JSON from Homey's log ID. Control failures
retain only fixed safe reason/action codes; the original Home Battery exposes
the latest failure counts in its session-only reporting diagnostics, reset on
initialisation or successful warning-clearing control. Raw exceptions are not
returned. These changes do not alter command plans, aggregation or safeguards.
They are not included in the published v1.10.23 build and have not been posted
to the community. A new release would need the normal validation/upload gates.

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

### Diagnostic increment — 9 October 2026 (v1.10.23, superseded)

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

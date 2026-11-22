# Dual CT counters and next validation sprints — 15 October 2026

Publication follow-up: the implementations below are now Test v1.10.48 / Build
63, tag `7542d4b30bc953419a3a8f5cf3b9e8f2c00d2b5d`. Exact-release CI passed
812 tests, lint, zero-vulnerability audit and Homey verified validation. Official
API and public listing readback confirm Test; main/Live and device accounting
remain unchanged. Earlier "local only" sections are implementation checkpoints.
See STATUS.md and DUAL_CT_RELEASE_GATES.md; hardware/semantic gates stay open.

Scope: `codex/mixed-generation-reporting-diagnostics` only. Investigation and
numeric-free bank outcomes, not a release or a counter-accounting migration.
No customer measurements, screenshots, raw packets, account identifiers or secrets
are stored here. Regression examples are synthetic.

## Evidence and limits

- Robert's private .47 topic 160897 contains a schema-5 compact report: 32 accepted
  app-MQTT candidate payloads, no rejected payloads, 17 top-level structural fields
  and no structural omissions. The structure is a union over the capture, NOT one
  physical reading or one decoded payload. Eight power candidates, six voltage
  candidates, another scalar and two nested records are represented; none of the
  six current candidates was observed in that short capture. Absence is not zero.
- The compact report has no numeric candidate values or same-payload bank-check
  results. Its acceptance count cannot establish bank roles, units, direction or
  arithmetic consistency. New compact schema 6 carries fixed outcome metadata to
  close this reporting gap without sharing measurements.
- Two daylight EcoFlow screenshots show separate Grid and Solar views, signed
  phase power/current and internally consistent energy totals. The screenshot
  phone clocks and forum posting clock differ by an hour. These are useful UI
  references, not a verified synchronized candidate comparison or midnight test.
- The .46 approved reply was posted and reopened at topic 160876/post 3. It asked
  for no further night-time captures. No .47 reply or new tester request has been
  sent as part of this implementation.

## Sprints 1–2 implementation follow-up — local only, 15 October

Sprint 1 now has neutral Bank A/B phase cards, receipt-age/missing/stale/zero
states and local optional Grid/Solar/no-match observations. They are fixed enums,
not free text or a vendor configuration, and remain `basis: user_observation`,
`verified: false`. Capture change, Stop, failed/late requests, navigation,
retention expiry and rollback invalidate sharing and displayed evidence. No
localStorage/Homey-setting persistence or automatic upload is introduced.

Sprint 2 now has a separately opted-in research path AFTER the existing admitted
scalar payload. The one-level inspector supports 773/997 structure only within
2048 bytes / 32 child fields per parent, no deeper recursion. Numeric opt-in can
retain only 773.1/2/3/4/6/7 wire-5 finite floats with a broad corruption bound;
all units stay null, period unknown and roles unverified. Field 5 and unknown
children are not interpreted. 997 stays structure-only; its numeric mapping is
NOT implemented without independent evidence. This is the evidence-supported
limit, not complete Dual CT counter support. No new household/API experiment.

The hypothesized 773 equalities `4-6=7` and `1+2+3=7` use complete candidates
from the SAME record, with float32 arithmetic tolerance only. Signed candidates
and explicit zeros are preserved; missing children are not synthesized. A new
partial record replaces the prior whole record, never borrowing cached children.
Bad/duplicate/oversized/wrong-wire/NaN/unsupported records yield structure/status
only and do not discard independently valid scalar candidates. Invalid OUTER
framing still fails scalar admission. An out-of-order record cannot replace a
newer one; two meters and two parent IDs remain isolated.

Counter candidates share the existing fixed historical cache lifetime and real
cleanup timer. No extension, background capture, persistent copy or counter
accounting path was added. Normal reports receive fixed structure/outcome
metadata only, reprojected independently in backend and browser, with honest
structural omission counts. Compact stays schema 6; numeric scalar-only export
stays schema 4.

The new optional combined schema-1 comparison JSON uses the existing explicit
sharing consent/review workflow, a distinct filename, one Copy/Download action
and the manual text fallback. It rechecks retention/age/provenance/allowlists and
recomputes counter arithmetic. The local comparison may show all bounded 40
scalar candidates; exported JSON reapplies a shared 7500-character budget and
truthful per-device/counter/shape omissions. Review notes or export-mode changes
revoke consent. No screenshot or new tester request was sent.

A new synthetic capture regression exposed a pre-existing binary/JSON ambiguity:
protobuf's field-1 tag is a newline, followed in this fixture by length byte 123
("{"). `trimStart()` made it look like JSON. Failed JSON parsing now falls
through only for the protobuf field-1 prefix to existing strict header gates.
Tests cover both that exact frame and genuine whitespace-prefixed JSON; there
is no new decryption, guessed payload reinterpretation or relaxed model gate.

## Sources reviewed live

1. [Official EU STREAM documentation](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321),
   reopened in the browser on 15 October. The loaded page describes original BK
   STREAM models, main-device routing and a historical-data service. It does NOT
   provide a model-421 protobuf contract for nested Dual CT records 773/997.
   The web text fetch failed; the rendered page was read directly instead.
2. [Current upstream BK21 parser](https://github.com/shuette42/ecoflow-energy-ha/blob/1ab6c417c4d6910e140941a1771a09bcaa79bb0f/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py),
   repository fetched at `1ab6c417c4d6910e140941a1771a09bcaa79bb0f` on 15 October.
   Its documented midnight/export observations apply to BK21 / EF-EM-P3-120,
   not Dual CT model 421. No dedicated Dual CT second-record mapping was found in
   the reviewed parser. A numeric field ID in another model is not the same field.
3. Local original-meter `smartMeterTelemetry.ts` / `smartMeterCounterEvidence.ts`
   already keep counter evidence observational and migration disabled. They are
   not reused as a Dual CT decoder and were not changed.

## Nested-record hypotheses, not a supported Dual CT contract

| Wire path | Original BK21 interpretation reported upstream | Dual CT decision |
| --- | --- | --- |
| `773.1/.2/.3` | Signed lifetime net energy by phase, raw Wh | Hypothesis only; no zero fill, monotonic-net rule or daily label |
| `773.4` | Lifetime import, despite schema name `today_active` | No assumption of daily reset or commissioning origin |
| `773.6` | Lifetime export, despite a reactive-energy schema name | Do not inherit upstream missing-as-zero or zero suppression |
| `773.7` | Signed lifetime net; import minus export and phase sum | Test arithmetic only within one complete record once decoded |
| `773.5` | Unobserved/unmapped in the reviewed BK21 captures | Keep unknown |
| `997` and children | No contract in the reviewed meter parser | Could be another record; do not clone 773's map or assign Solar |

The present Dual CT scalar decoder deliberately skips these length-delimited
record bodies. Structurally valid opaque records cannot create scalar readings,
satisfy the missing-marker admission signature, leak into candidate exports or
write Homey counters. A malformed OUTER length remains a rejected payload;
unknown inner bytes are not claimed to have been decoded/validated. Regression
tests lock this boundary with empty, explicit-zero, negative, NaN, partial,
opaque/malformed-inner and truncated-outer synthetic records.

No nested numeric report exists in the supplied evidence, so actual child field
IDs/types/units, omitted-zero rules, per-phase ordering, reset/rollover behaviour,
device lifetime versus installation lifetime and first-commissioning origin
remain unproven. A single screenshot's total is not a reset-period observation.

## Historical query API is a separate possible route

The official page documents read-only `POST /iot-open/sign/device/quota/data`
with UTC `beginTime`, `endTime` and a metric `code`, routed via the system's main
device. It gives period-scoped Wh results for Solar (day), Grid/load/battery
(hour), plus unrelated year/day metrics. Some descriptions call energy "power"
and mix a days lookup note with hourly minimum periods; do not infer a universal
period, unit or `extra=1/2` direction without a successful typed response and
comparison. These are system historical buckets, not proof that live meter
counters are daily totals. Main-device scope may include several products.

This turn made NO authenticated household requests, changed no device mode and
issued no commands. A future bounded read-only endpoint experiment can use the
owner's authorized environment, but cannot validate a Dual CT absent from that
environment or recover expired numeric candidates from Robert's compact report.

## Implemented now

`previewDiagnostics.bankCheckSummary` is a fixed numeric-free projection of the
existing strict decoder's checks, at most two meters x two banks. Latest outcome
and last-complete outcome retain separate receipt ages; age >=90 seconds is
explicitly stale. The same fixed 15-minute capture retention/Stop/account/restart/
rollback clearing applies. No second history, raw payload retention or timer.
No last-complete result is invented from a union of fields or another device.

Backend/support and browser/compact sanitizers agree; arbitrary nested values,
identities, arithmetic operands, residuals, tolerances and payload indices are
excluded. Unknown/old evidence reports `reported: false`, not a successful check.
Compact schema 6 retains the 7500-character budget and honest structure trimming.
Historical numeric candidate export remains separately consented schema 4.
Settings show neutral A/B outcomes with EN/DE/NL text, snapshot receipt ages and
explicitly unverified mapping/units/direction; no pairing, Energy, Flows or controls.

## Roadmap (sprints 1–2 local; sprints 3–5 foundations added within evidence gates)

Continuity observations, release readiness and the unwired laboratory adoption
trial are documented in [DUAL_CT_RELEASE_GATES.md](DUAL_CT_RELEASE_GATES.md).
The driver/accounting activation portions of sprints 4–5 remain explicitly
blocked by the physical/semantic acceptance gates; they are not complete or
enabled merely because the foundations are tested. No new hardware evidence.

| Sprint | Buildable outcome | What Robert could validate in the app | Acceptance boundary |
| --- | --- | --- | --- |
| 1. Comparison workspace | Group existing candidates into readable Bank A/B cards with phase rows, missing/stale indicators and one reviewed comparison export. Local optional Grid/Solar annotations are user assertions, not global mappings. | Open EcoFlow Grid/Solar views at a convenient daylight session and say which candidate card/phase matches, or explicitly does not match. Reuse existing screenshots for layout reference. | No default role assignment, writes, pairing or Energy. No one-minute request. |
| 2. Counter research preview | Allowlist exactly one nested level of 773/997 under the existing owned-model/topic/header/encoding gates. Start with child-field/wire presence, then separately opted-in unscaled float candidates only where supported. Add same-record arithmetic and clear unknown-unit/period labels. | Read a grouped counter preview beside EcoFlow totals. One combined optional export covers missing fields and comparison notes; compact remains numeric-free. | Do not copy original-meter names, zero rules or Wh scaling blindly; no counters in capabilities or accounting. |
| 3. Continuity and period evidence | Bounded, explicitly opted-in observations distinguish counter advances, decreases, missing records and source changes. Define lifetime/net/daily views, timezone/DST baseline gaps and a truthful "since observation began" fallback. No background capture extension without fresh consent/design review. | Leave settings to collect an agreed bounded sample, then inspect whether totals persist across an ordinary restart or a scheduled midnight boundary; no reset/re-pair or midnight attendance required. | Signed net is allowed to decrease. Missing baseline means daily unavailable, not zero; no migration. |
| 4. Read-only device preview | Once role/unit/direction evidence passes, introduce explicit Dual CT selection with the correct photo/icon, per-phase power/voltage/current and validated import/export/solar views; retain safe existing-meter identification. | Pair an optional read-only preview and compare device tiles, missing-data states and ordinary restart/reconnect behaviour. | No automatic conversion/removal of existing devices or duplicate Energy contributor. Keep uncertain models/firmware read-only. |
| 5. Energy adoption and release gates | Only after validation: one authoritative source, monotonic import/export continuity offsets, no simultaneous counter plus power integration, reset/rollback handling and an evidence-based release checklist. | Opt-in household energy comparison and restart/reconnect/upgrade/rollback acceptance, including original STREAM regression checks. | No production Energy or controls until these physical gates pass; publish only after owner approval. |

Recommended batching: complete comparison UX and counter-preview prerequisites
before the next Test publication. Ask for ONE planned optional daytime session
and one combined candidate export, not a compact + full + crash-report bundle.
Only request a later continuity observation if the first session establishes the
necessary counter map. Explain what each request unlocks and stop when enough
evidence is available. No new Robert request is authorized by this roadmap.

## Local verification of this wave

Follow-up sprints 1–2: 792 tests pass (18 added after the prior 774-test wave),
plus lint, audit with zero vulnerabilities, diff checks and Homey 4.5.3 verified
validation. Counter tests cover strict admission, one-level limits, opt-out,
whole-record replacement, signed/zero/missing/nonfinite/duplicate/wrong-wire
cases, out-of-order receipts, real timer expiry, no cross-device/parent borrowing,
privacy projection, exact binary/JSON classification and immutable API consent.
Comparison tests cover full bounded local projection, 7500-character combined
sharing, truthful omission/re-export, null-unit counter candidates, 997 structure
only, annotation invalidation and actual browser copy/download/name workflows.
EN/DE/NL wording is complete. Desktop 1280px and mobile 390px screenshots were
inspected; no horizontal overflow. Native Homey/physical acceptance remain open.
No commit/push, version/CI, publication, device command or tester message.

Initial numeric-free summary wave (before these sprints):

774 tests pass (12 added), plus lint, audit with zero vulnerabilities, diff checks
and Homey 4.5.3 verified validation. Browser tests exercise both 1280px desktop and
390px mobile settings, neutral summary rendering, compact schema 6/privacy/budget
and the unchanged schema 4 consented historical export. Synthetic screenshots
were inspected outside Git. No native Homey or physical hardware result claimed.
No commit/push, new CI run, version bump or publication this wave.

# Smart Meter Dual CT — asset and integration assessment

## Candidate banks and coherent decoded payloads — unpublished, 14 October 2026

The .46 historical export supplies all 20 allowlisted numeric candidates and
shows two matching power-sum relationships. It has receipt ages but no payload
provenance, so existing values cannot be labelled same-payload merely because
their ages match. Its primary/secondary units, roles, ordering and direction are
still unverified. No raw customer numeric fixture was imported into Git.

Research mapping (hypothesis, NOT CT port or installation role):

| Candidate bank | Total power | Phase power 1/2/3 | Voltage 1/2/3 | Current 1/2/3 |
| --- | --- | --- | --- | --- |
| A | 515 | 962 / 963 / 772 | 956 / 957 / 771 | 958 / 959 / 784 |
| B | 998 | 991 / 992 / 993 | 985 / 986 / 987 | 988 / 989 / 990 |

`dualCtBanks.ts` defines these neutral hypotheses. Possible secondary W/V/A are
display hints, not a promotion from null units to verified measurements. The
existing model-421/live-topic/254/21/encoding-signature admission is unchanged.
The [reviewed upstream BK21 parser](https://github.com/shuette42/ecoflow-energy-ha/blob/1471a74a117d78ce5120e30a9f1826b51e1c23a6/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py)
supports the original field overlap only; it is not a Dual CT bank-B contract.

Each strictly decoded pdata is checked before caching. A bank needs its reported
total and all three power fields together; partial packets never borrow previous
values. Difference is signed reported total minus signed phase sum; tolerance
`0.001 + 1e-6 * (abs(total) + sum(abs(phases)))` handles float32 arithmetic only,
not meter accuracy. No cross-bank aggregation, V*A, sign flipping, zero filling
or control/accounting change. An inconsistent total is diagnostic evidence,
not permission to reject otherwise valid candidate readings or choose a source.

Per-reading capture-local payload indices distinguish multiple headers at the
same receipt clock. They are not native sequence numbers/measurement timestamps.
Each device/bank retains latest payload completeness and a separate last-complete
power check with its own index, encoding basis and receipt age. A newer partial
update cannot renew an older complete sample. Matching arithmetic does NOT verify
simultaneous physical sampling, phase order, units, CT assignment or direction.

Schema 4 optional historical export projects these fixed hypotheses and bounded
check records. It preserves the 7500-character budget with independent honest
reading/check omission counts, per-meter evidence and privacy allowlists.
Normal support/compact reports stay numeric-free. No backfilling of provenance
for older exports. Existing capture/export consent, 90-second live freshness,
15-minute fixed historical retention and Stop/account/restart/rollback clearing
apply equally to the added evidence.

Comparison against the actual .43 screenshots: net-import/export and Solar views
each show three phase power/voltage/current readings. Solar includes negative
phase power/current and all three phases are represented. The captures predate
.46 and their on-screen times differ; they are not numeric acceptance matches.
Later explicit zeros cannot imply permanently unused channels. The evidence
supports the two-bank hypothesis but cannot bind A/B to home/grid/Solar/CT ports
or settle signs. Keep unknown bank role and direction closed until compared with
configuration and appropriately matched evidence; no immediate tester repeat.

762 tests plus lint/audit/Homey verified validation pass locally, including
same-clock split payloads and multi-header deliveries, signed cancellation,
roundoff/mismatch/zeros/missing fields, phase reactivation, per-device isolation,
immutable retention, bounded provenance, privacy, size and desktop/mobile workflow.
Mainline/Live unchanged; uncommitted/unpublished; reply draft only.

## Historical export and per-field expiry — Test .46 / Build 61, 14 October 2026

Published from exact tag `v1.10.46`
(`a76cb5d90fc7db159c1b7f40580250b84acc44ba`) after source and exact-tag CI passed
749 tests, lint, audit and Homey verified validation. Official Homey Apps API
readback at 2026-10-14 21:04:24 UTC confirms Build 61 / v1.10.46 state `test`;
Live remains Build 18 / v1.10.3. Mainline refs remain unchanged. See STATUS.md for
workflow links and acceptance boundaries. This supersedes the initial local
implementation status below; no physical/native-webview acceptance is claimed.

The .45 report confirms 41 accepted numeric candidate payloads, but the next
message identifies an export-workflow failure: live expiry also erased the
candidate export snapshot. No new decoding, mapping or unit verification follows.

Live preview remains per-field/90-second receipt freshness. The UI now re-renders
at each individual deadline instead of discarding all fields when the oldest
one expires. Expired readings are removed, never replaced by zero.

A distinct historical candidate cache retains up to two meters/20 fields each,
only after numeric capture opt-in. Deadline: 15 minutes from the first accepted
packet, never renewed by later packets or refreshes. Actual timer cleanup and
read-time checks enforce expiration. Automatic completion/sample limit freezes
the latest per-field evidence; Stop/new capture/account change/restart/clock
rollback erase it. No persistent storage or automatic network/export action.
Closing settings clears its displayed copy and sharing consent; a later explicit
refresh may retrieve the still-retained server snapshot within the original limit.

Reviewed, separately consented `dual_ct_candidate_snapshot` schema 3 exports
mark historical/not-live/non-simultaneous and include fixed retention metadata
and per-field receipt ages. Age is not a measurement timestamp. Suggested units,
roles, direction and encoding remain unverified. The existing identity-free,
7500-character bounded projection and trimming metadata apply. No historical
reading is reintroduced into preview/capabilities/Energy/Flows/controls or normal
support reports. Pending/error/late responses and identity changes revoke sharing.

Regressions cover mixed-age expiry, delayed export after live expiry/completion,
fixed retention without polling, actual cleanup timer, no callback resurrection,
consent withdrawal/capture identity/Stop/account/navigation/rollback/restart,
projection privacy and two-meter size limits, with desktop/mobile-sized Chromium
checks. Local and exact-release acceptance are recorded in STATUS.md. Published
to Test only; Robert's updated reply is draft-only and asks for one optional
candidate export from .46, not another compact report or rushed screenshots.

## Field-mapping audit and candidate decoder — 13 October 2026

## Omitted-marker investigation wave — Test .45 / Build 60, 14 October 2026

Sprints 1–3 and the software part of Sprint 4 are implemented on the diagnostic
branch. Exact release `v1.10.45` (`a82055ca1737451dfeb9691500a16e69f07cb5a2`)
passed CI and was uploaded as Build 60. Official Homey Apps API readback confirms
Test at 2026-10-14 20:20:24 UTC; Live remains Build 18 / v1.10.3. Mainline and
energy accounting remain unchanged. Physical field acceptance is still pending;
Robert's reply remains a draft for review. See STATUS.md for exact release gates.

### Sprint 1: evidence and limitations

New structural evidence from Test .44 establishes enabled preview, 68 live
app-MQTT packets, zero rejected, all 68 missing the encoding marker and zero
decoder attempts. This isolates the existing explicit-zero guard; it does not
verify plaintext, scalar meanings or the second bank. Developer MQTT has an
attached subscription but no confirmed receipt; REST routes are unavailable.

Primary-source refresh: shuette42/ecoflow-energy-ha
`4c6c54991515a2a5f200ab876f50331e799f4cc2`; its header decoder, original-meter
parser and STREAM candidate helper are unchanged from the previous pinned audit.
[Header decoder](https://github.com/shuette42/ecoflow-energy-ha/blob/4c6c54991515a2a5f200ab876f50331e799f4cc2/custom_components/ecoflow_energy/ecoflow/proto/decoder.py)
identifies field 6 as integer `enc_type` without inserting absent defaults.
[Candidate helper](https://github.com/shuette42/ecoflow-energy-ha/blob/4c6c54991515a2a5f200ab876f50331e799f4cc2/custom_components/ecoflow_energy/ecoflow/parsers/stream_proto.py)
offers unchanged pdata for absent markers; masked-byte retries in that project
are intentionally NOT copied. BK21 absent-marker fixtures include cached replies,
which are not admitted here. No explicit Dual CT/421 contract was found in the
reviewed Python/proto/Markdown source. MichelFR/ha-ecoflow-iot refreshed to
`f4b4fbb2c329f95d726173940a6e3e4cf0b945ab`; targeted source search found no
Dual CT/421/enc_type implementation there either.

[Protobuf presence guidance](https://protobuf.dev/programming-guides/field_presence/)
permits implicit numeric zero to be omitted, but is not an EcoFlow encoding
contract. The official STREAM page was reread through the browser: it documents
HTTP main-device/quota/history and MQTT quota/status, not a Dual CT binary
encoding contract. No claim is made about all other developer-portal pages.

The supplied Developer credentials were used for an owned-inventory query and
one fresh quota request for its original BK21 meter. The quota was empty JSON,
not a binary app-MQTT envelope. No confirmed Dual CT productType was present in
that Developer inventory. This adds no Dual CT header/hardware validation.
No commands, foreign-account probes, credentials or raw telemetry were exported.

Decision: evidence supports a strictly bounded **candidate** trial of unchanged
bytes when the marker is absent, not certification as plaintext. Actual header
presence remains preserved; the shared decoder does not default all missing
markers to zero. Test .45 supersedes .44's explicit-marker-only candidate guard
with the tightly scoped candidate policy described below.

### Sprint 2: guarded numeric candidate path

`dualCtEncodingPolicy` admits only the already-owned model-421 live app-MQTT
254/21 route with valid headers, bounded nonempty pdata and either explicit zero
or absent marker. Nonzero/masked markers, cached replies, unknown models,
duplicate/wrong-wire critical headers and malformed payloads remain rejected.
Absent-marker payloads additionally require at least two distinct legacy
wire-5 candidates and full valid protobuf traversal. All mapped floats must be
finite/in range; conflicting or mixed-wire duplicates reject the whole packet.
There is no XOR, alternate-byte retry, guessed key or synthetic missing zero.

Each retained reading carries `explicit_zero` or `omitted_zero_candidate` plus
`float32_candidate` representation. `encodingVerified`, units/direction and
hardware validation remain false. Per-field 90-second receipt freshness,
account/Stop clearing and separate capture/export consent are unchanged.
Omitted-marker attempt/accept counters are metadata only; actual missing-marker
counts remain missing, never rewritten to explicit plaintext.

Research-validity hardening rejects over-wide header integers that could wrap
to a zero marker, and conflicting/mismatched declared payload lengths. These
checks set only the research validity flag; they do not change existing 5000
telemetry interpretation or commands.

### Sprint 3: additional fields and honest report coverage

Allowlisted wire-5 fields 985–993 and 998 can be interpreted as local float32
**candidates**, with `candidateUnit: null`, no phase/CT/grid/solar assignment and
`additionalBankMappingVerified: false`. This does not establish native scalar
types or units. Nested 773/997, runtime 254/22, counters, phase totals, V*A
inference and import/export signs remain unmapped.

Compact schema 5 remains structural-only and declares coverage scope as retained
capture structure. Inventory trimming is explained separately from retained
field coverage. Candidate schema 2 is a separate explicit-consent export:
up to two meters/20 fields each, fixed provenance, no identities/raw packets and
a 7500-character pretty-JSON budget. Coverage counts flag any truncation and
survive re-export; absence never becomes a zero reading or a guessed unit.

### Sprint 4: software checks and bounded physical acceptance

Local checks: 739 tests, lint, audit (0 vulnerabilities), diff checks and Homey
4.5.3 verified validation pass. Desktop/mobile-sized Chromium workflow checks
cover neutral unitless display, marker provenance, reviewed optional export,
refresh, expiry and manual fallback. These are not native Homey/hardware tests.
Source and exact-tag CI also pass all 739 tests, lint, audit and Homey validation.
Test publication is confirmed; installation and physical acceptance are not.

One diagnostic Test build is published. Next optional tester
request: ONE compact report; only if candidates appear and sharing consent is
given, ONE separate candidate export. A normal EcoFlow app view/channel-role
description is needed only for a specific field-mapping question, without a
synchronised deadline. A blocked/rejected/expired preview reason is sufficient
instead; do not request repeated captures/full reports/new logs by default.
Physical units, role/direction, delta/full and idle-channel acceptance remain
open before any driver/Energy/Flow promotion.

### Capture-mode and refresh/export sprints — Test .44 / Build 59

Published 13 October 2026 from exact tag `v1.10.44`
(`7d020a62547869030afda98c9b02525b9f0389b2`). Source and exact-tag CI passed.
Authenticated Homey Apps API readback confirms Build 59 state `test`; Live
remains Build 18 / v1.10.3. See STATUS.md for release evidence. The earlier
unpublished status below records the implementation stage, not current release.

Start remains idempotent for a discovering/listening capture. Its response now
distinguishes reused, superseded, requested preview mode, effective mode and
whether an explicit Stop/new Start is needed. It never silently changes consent
or restarts subscriptions. The settings checkbox reflects and locks the running
capture's actual mode; completed captures unlock the next-capture choice.

`GET /dual-ct-research/view` is a local-only explicit view: separate `research`
and `preview` objects, no account request or supplied clock/serial. The summary
refresh uses this single GET; an explicit Start follows its acknowledgement with
the same view and opens the preview panel. There is no background numeric polling.
Normal support snapshots still use only the structural projection. Random
per-capture IDs correlate local UI refreshes, not device/account identities; they
are excluded from compact/full/candidate exports.

Same-capture successful refresh retains existing sharing consent and rebuilds
the visible JSON with fresh receipt ages. No prepared values can be copied while
the request is pending. A new/unknown capture, Stop, account change, request
failure/timeout, clock rollback, navigation or expiry clears/revokes prepared
exports. Completion preserves only still-fresh candidates; it does not renew
their per-field 90-second receipt TTL. Standalone candidate refresh follows the
same identity/consent/age rules. Fallback text points to the visible candidate
JSON, not the separate compact structure report. No automatic clipboard/export.

Regression coverage: active and concurrently discovering mode mismatches,
idempotence, capture correlation, projection privacy, coherent summary/preview
refresh, new/unknown identity consent reset, unavailable reason, late callbacks,
Stop/account removal/navigation/expiry and manual sharing fallbacks. Desktop and
mobile-sized Chromium workflows pass; native Homey webviews and physical field
validation remain open. Local release checks: 730 tests, lint, npm audit with
zero vulnerabilities, diff checks and Homey 4.5.3 verified validation. Current
changes remain uncommitted; CI must run against the eventual release commit.
No mainline/Live/version/Test publication or Robert message this turn.

### .43 receipt/encoding investigation — unpublished follow-up

The new structural field report confirms 49 app-MQTT packets, zero rejected and
37 retained fields for 254/21. Two app screenshots independently show grid/home
and solar views, each displaying three-phase power, voltage and current. These
are not simultaneous numeric protobuf captures. No CT-port assignment, phase
ordering, import/export sign or counter semantics is established by them.

Receipt now has a per-device/per-transport count and relative age, separate from
subscription attachment and from valid measurement decoding. It survives bounded
history eviction, handles synchronous attach callbacks, ignores cached-reply
topics and clears on account change/clock rollback. The UI also repairs legacy
summaries from source-scoped retained history, never a global sample count. A
received packet is not proof of a currently connected transport or usable data.

Compact schema 4 adds fixed `previewDiagnostics`: actual capture opt-in state,
current reason, decoder attempts/accepted payload counts and header buckets
(`explicit_plain`, `missing`, `masked`, `unsupported`, `invalid_header`). Older
reports retain unknown/not-reported state rather than implying opt-out. Header
counts survive a structurally unreadable inner payload, without decrypting or
retrying alternate interpretations. Only 254/21 affects these diagnostics;
254/22 does not overwrite them. Full/compact reports still include no numeric
measurement candidates, encryption keys, raw frames or device identities.

Encoding source refresh: shuette42/ecoflow-energy-ha
`325cf29c85705b812557e7f00127e89ab6ed0787` (new origin/main); meter parser,
header decoder and generic runtime unchanged from the previous audit. The
[BK21 parser](https://github.com/shuette42/ecoflow-energy-ha/blob/325cf29c85705b812557e7f00127e89ab6ed0787/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py)
and tests accept absent encoding on cached plaintext get-reply bundles. Its live
property captures also exercise per-header XOR masking. The
[generic runtime](https://github.com/shuette42/ecoflow-energy-ha/blob/325cf29c85705b812557e7f00127e89ab6ed0787/custom_components/ecoflow_energy/ecoflow/proto/runtime.py)
handles encoding 1 using sequence-derived XOR and otherwise offers untouched
pdata. These are not a Dual CT live-packet contract. Protobuf implicit-presence
[rules](https://protobuf.dev/programming-guides/field_presence/) permit omitting
default-zero fields, but do not define EcoFlow's transport semantics. Refreshed
Python/Markdown/proto search found no explicit Dual CT/421 implementation;
MichelFR/ha-ecoflow-iot remains at `45d9bb2952904cffa590cb811da0c316c66dd589`.
No executable third-party code or customer raw packet was imported into this repo.

Decision: keep explicit-zero plaintext gating on the current candidate preview.
Do not treat an absent flag as proven plaintext, apply XOR speculatively, accept
unknown nonzero markers, or allow cached packets to renew measurement freshness.
The new metadata will distinguish a missing flag from disabled opt-in before a
model-specific policy change is considered. No additional tester capture yet.

Possible second-bank arrangement, **hypothesis only**:

| Additional float fields | Possible arrangement | Current acceptance |
| --- | --- | --- |
| 985–987 | Another voltage trio | Structural presence only; no V assignment |
| 988–990 | Another current trio | Structural presence only; no A assignment |
| 991–993 | Another active-power trio | Structural presence only; no W/phase assignment |
| 998 | Another aggregate value | Structural presence only; no sum or sign interpretation |

The metadata includes a bounded allowlist of additional scalar field IDs seen,
with `additionalBankMappingVerified: false`. It does not decode those values or
add them to the preview/export. `997` and `773` remain uninterpreted nested fields.
Numbers also reused by STREAM battery messages do not establish meter meanings.
Future acceptance requires values matched to both app views, evidence for each
bank's configured role and direction, and full/delta/unused-channel behaviour.
No driver, pairing, Energy, Flows, counters or control changes.

The v1.10.42 structural report identifies app-MQTT protobuf 254/21 and 254/22.
It contains field numbers/wire types only, not raw frames or scalar values.
The observed shapes overlap the original BK21 meter parser, but overlap is not
a verified Dual CT measurement contract.

Reviewed primary developer source:
[shuette42 smart-meter parser](https://github.com/shuette42/ecoflow-energy-ha/blob/563226ad9b2d40eb909eafb5b1b3aeaad39b3225/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py).
Refresh of its remote confirms this ref; this parser is unchanged from the
previously reviewed 1471a74 ref. It explicitly validates its meanings on BK21,
not Dual CT. MichelFR/ha-ecoflow-iot at
`45d9bb2952904cffa590cb811da0c316c66dd589`, STREAM quota mappings, does not supply
a Dual CT protobuf field-number contract; its energy-name assumptions are not
transferred to this implementation.

[Official STREAM page](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
was successfully read in the browser this turn (web tool could not access it).
It documents quota/main-device/MQTT transport and scalar quota names, but not
the Dual CT protobuf field numbers. Some field descriptions are inconsistent
(e.g. system-grid and battery-SoC labelled as load power); the page cannot alone
establish a meter's role or units. No claim about undocumented APIs elsewhere.

| 254/21 field | Legacy BK21 candidate meaning | Candidate unit |
| --- | --- | --- |
| 515 | Aggregate power | W |
| 962, 963, 772 | Phase 1, 2, 3 active power | W |
| 956, 957, 771 | Phase 1, 2, 3 voltage | V |
| 958, 959, 784 | Phase 1, 2, 3 current | A |

All ten were observed as wire 5 in the structural evidence and are float32
candidates according to the BK21 parser. Do not yet label them validated grid
readings, split import/export, sum phases, infer power from V*A or bind to Energy.

`lib/dualCtDecoder.ts` implements a pure candidate decoder for explicitly plain
pdata from 421/app-MQTT/254-21 only. It returns named unverified candidates,
candidate units and receipt age, with hardwareValidated false and no measurement
timestamp claim. A separate opt-in local preview now calls it from the bounded
research subscription, never drivers or capabilities. It does not handle
masking/encryption or guess alternate payloads.
Malformed/oversized/duplicate/truncated frames, invalid context, wrong commands,
nonfinite/corrupt values and stale/future receipt times fail closed. Absent fields
stay absent, while explicit zero is preserved.

Still unmapped: 985–993 and 998 (additional meter values), 997 (nested data),
773 (energy record), PF/connection fields and other configuration/status fields.
254/22 remains excluded from readings: original-meter evidence describes it as
runtime/configuration, and no Dual CT scalar interpretation is confirmed.
Counter direction/lifetime/zero-fill behaviour from BK21 is explicitly not reused.

### Optional local candidate preview (unpublished)

Settings has an unchecked, per-capture consent option and a separate manual
`GET /dual-ct-preview` refresh. No automatic numeric capture, polling, persistence
or upload. The existing two-minute/128-frame/two-owned-device limits apply.
Model admission additionally requires app `productType: 421`. A header must
explicitly carry `enc_type` field 6 = 0, with no duplicate/wrong-wire critical
header fields. Missing encoding metadata is inconclusive, not plaintext. This
conservative gate may leave genuine devices unavailable; do not remove it just
because a protobuf-shaped payload parses. Header layout follows the pinned
[upstream decoder](https://github.com/shuette42/ecoflow-energy-ha/blob/563226ad9b2d40eb909eafb5b1b3aeaad39b3225/custom_components/ecoflow_energy/ecoflow/proto/decoder.py).

The local display uses field numbers and **candidate** units, not labels such as
CT1/grid/solar/import/export. The legacy named candidates remain an internal
hypothesis only. Signed values are preserved without interpreting direction;
no scaling, phase sum, V*A calculation or counter conversion. Each field expires
after 90 seconds since receipt, independently of other fields. This is NOT a
measurement timestamp or freshness guarantee at EcoFlow. Manual stop, account
change and clock rollback clear values; restart/new capture starts empty.
At automatic capture completion, remaining values expire normally. The page
also removes its display at expiry/navigation; refresh obtains a new local
snapshot, not a device poll.

Full and compact exports retain **no numeric candidate values**. Their
`valuesCaptured` flag records whether candidates were actually decoded during
the current local session (cleared on manual stop/account change), and
`valuesIncluded: false` distinguishes the structure-only export. Raw frames,
identities and numeric values are not logged or written to Git.

### Preview states and voluntary candidate sharing

The preview now distinguishes opt-out, no eligible meter, no samples, unverified
model code, missing/unsupported encoding, invalid header, no supported candidate
values, expired values, stopped/account-changed capture and unavailable requests.
No-data states never imply zero or confirmed absence of hardware. Only accepted
254/21 packets influence encoding/candidate state; 254/22 runtime packets do not
overwrite that explanation. No encoding gate was relaxed to make a tile appear.

A **separate** candidate export can be prepared only from fresh numeric preview
data and an additional, unchecked sharing-consent checkbox. Its entire JSON is
visible before manual Copy/Download; no automatic upload. Fixed schema v1
`dual_ct_candidate_preview` includes app version, anonymous device index, field
number, signed candidate value/unit, receipt age, source/command and explicit
unverified flags. It excludes identities, credentials, raw frames, arbitrary keys
and derived channel roles. Bound: two meters, ten allowlisted fields each. Native
energy counters remain excluded. A dedicated filename distinguishes it from the
structure-only support report. Clipboard/download failures retain a visible text
fallback, without claiming a mobile file was saved.

Consent removal, expiry, stop/refresh/account clearing and page navigation remove
the prepared JSON and disable sharing. Copy/Download re-check freshness and
update receipt ages rather than copying stale readings. Existing full/compact
support paths still contain no numeric candidates. EN/DE/NL overview and privacy
wording distinguish default structural capture, optional local numeric capture
and separately consented sharing.

Regression browser checks use synthetic values in Chromium at 1280x900 desktop
and 390x844 mobile-sized viewports: no automatic requests/sharing, separate
consent, exact reviewed JSON, dedicated download, normal-report exclusion,
no horizontal overflow, expiry and navigation clearing. This is not physical
Dual CT acceptance or proof of native Homey/iOS/Android webview downloads.

Next gate: compare actual field values with EcoFlow's configured channel roles
and units, ideally with known import/export and a secondary circuit. The existing
structural report cannot validate units or direction, and synthetic regression
tests cannot replace this acceptance. Unknown new fields/energy stay unmapped.
No new capture request, hardware command, publication or Energy change.

## Observed app productType 421 — read-only discovery, 13 October 2026

A v1.10.40 field report shows one owned meter-like app candidate carrying
numeric `productType: 421`, while matching EcoFlow screenshots identify an
installed Dual CT meter. This is single-installation corroboration, not an
official vendor identity contract or an independently established channel map.

Public search and refreshed upstream review did not establish independent 421
support. Reviewed refs: shuette42/ecoflow-energy-ha
`563226ad9b2d40eb909eafb5b1b3aeaad39b3225` (model constants and smart-meter docs),
MichelFR/ha-ecoflow-iot `45d9bb2952904cffa590cb811da0c316c66dd589`
(custom_components). No 421/Dual CT identity contract found in those reviewed
locations. The official PP3 page could not be read through the web tool this
turn; earlier documentation review is not fresh proof of absence.

Discovery provisionally accepts normalised app metadata `productType: 421`
when productName is empty or its numeric fallback `421`. It rejects contradictory
model names, shared/invalid identities, arbitrary display-name hints, productId
421 and other codes. Developer-only numeric candidates remain excluded; an
exact owned Developer serial match may authorise its read-only transport only
after the app model is admitted. Existing two-device/capture/frame bounds remain.
Reports count observed-code admissions separately from explicit-name matches.

This gate exists only in opt-in research. No driver, pairing, decoded measurements,
Homey Energy, Flows or commands are enabled. Further structure capture is required
before any field interpretation. Keep raw reports and identifiers out of Git.

Reviewed 10 October 2026. No new driver, pairing admission, control, capability
or Energy source is enabled. The owner subsequently approved v1.10.27 / Build 42
for Test on 10 October 2026; it is now published. Dual CT pairing remains disabled.

## Next-wave implementation status — original meter and Dual CT

### Dual CT sprint 1 audit and discovery broadening — 13 October 2026

Sprint 4 hardens slow-connection cancellation and shared-subscription lifecycle.
Pending ordinary subscribers prevent idle teardown, and discovery detaches only
its own callbacks. Stopped/replaced sessions cannot attach later; expired lists
and stopped probes cannot trigger new reads. Cleanup exceptions are isolated and
reported without private error text. Local tests exercise real MQTT registries,
not actual cloud sessions. Broker/hardware acceptance remains open.

Sprint 3 adds a plain-language local capture summary and a bounded anonymous
event timeline, not raw packets or measured channel values. The summary labels
subscription attachment separately from actual receipt; an empty/unavailable
response is not zero. Manual refresh makes no cloud call or new capture. Support
guidance no longer demands a one-minute capture, and screenshots/logs can be
requested for a specific unresolved issue rather than repeated as a checklist.

Sprint 2 prepares a dormant normalized channel-state adapter with independent
CT1/CT2 roles, sources and field ages. The vendor-contract registry remains empty.
No generic JSON key or protobuf position is used to decode actual channel values;
the discovery recorder still retains structure only. A future verified decoder
must supply canonical W/V/A values and measurement timestamps, with configured
roles/sign conventions, before any device-capability or Energy integration.
The adapter does not persist state or calculate cumulative energy.

Unpublished diagnostic branch work; no full Dual CT adapter is claimed.
The live [official STREAM document](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
still describes the main-SN resolution, quota/all and quota MQTT routes with BK
examples. Its catalogue search for `Dual` returned no results. This is a bounded
documentation observation, not proof that EcoFlow has no Dual CT API anywhere.

Reviewed current developer source without running third-party code:

- [shuette42](https://github.com/shuette42/ecoflow-energy-ha/blob/1471a74a117d78ce5120e30a9f1826b51e1c23a6/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py),
  revision `1471a74a117d78ce5120e30a9f1826b51e1c23a6`: original BK21 meter protobuf
  support, separate from STREAM hosts; no Dual CT adapter found in the reviewed tree.
- [MichelFR](https://github.com/MichelFR/ha-ecoflow-iot/blob/45d9bb2952904cffa590cb811da0c316c66dd589/custom_components/ecoflow_iot/devices/solar_systems/stream.py),
  revision `45d9bb2952904cffa590cb811da0c316c66dd589`: original BK21 Developer quota
  support and host-localMeter fields, not a verified Dual CT contract.

The manual research option now independently checks both saved account inventories
and can observe app protobuf/JSON, Developer JSON MQTT and one-shot quota reads.
Device product metadata must explicitly identify Dual CT; names/prefixes do not
admit it. Each transport must independently authorise the exact device identity.
At most two meters; each Developer meter has at most one own quota read, one
main-SN resolution and one host quota read. Only a known STREAM host in that same
Developer inventory can be read. No arbitrary/off-account host or guessed topics.

Reports preserve source/empty/unavailable distinctions and bounded allowlisted
JSON path/type structure, never values/raw strings or payloads. Linked-host
structure is not CT membership, direction or units. Stop/expiry/account changes
invalidate late callbacks and further reads. Each capture owns its clients and
inventory, preventing a late previous list from altering a restarted capture.

No authenticated Dual CT hardware observation was made in this sprint. Software
fixtures are synthetic. Pairing, Energy, channel capabilities and controls remain
disabled; a missing model or unrecognised payload remains inconclusive.

The statement above concerns Dual CT. The original meter now has a local,
unpublished implementation based on a fresh read-only authenticated audit:

- Account inventory contained an original BK21 meter, no Dual CT meter. Direct
  meter REST quota/all and targeted phase/counter reads were empty; host REST
  exposed aggregate grid and home load, not the meter's phase details.
- Two bounded Developer MQTT observations subscribed only to the authorised
  meter/host quota topics. The meter supplied phase power/voltage/current,
  phase flags, grid state and a nested energy record. This contradicts a universal
  claim that BK21 readings require app-login authentication: the upstream account
  requirements do not describe every installation/transport.
- Observed records satisfied `todayActive - totalReactiveEnergy =
  totalActiveEnergy`, consistent with the upstream import/export/net hypothesis.
  No export or midnight experiment was performed; no raw captures, credentials,
  serials or absolute account counter values are stored here.
- The current public EU document catalogue searches for meter, Dual and 5000
  yielded no dedicated contract. The STREAM document metadata still points to
  its May 2026 content. Upstream shuette42 revision
  `3831d7741d718f28556d55a68aff47a9da37585b` supplies an original BK21 parser;
  MichelFR revision `45d9bb2952904cffa590cb811da0c316c66dd589` exposes original
  meter JSON fields. Neither reviewed tree established a Dual CT adapter.

| Sprint | Local implementation / remaining acceptance |
| --- | --- |
| 1: Original telemetry | Direct meter Developer MQTT; linked-host REST fallback; source arbitration; per-field receipt ages; stale phase/grid values cleared; serialised expiry and lifecycle teardown. Physical screenshot comparison/reconnect acceptance still needed. |
| 2: Native energy | Allowlisted raw counter candidates in diagnostics only. Existing integrated totals remain authoritative, with duplicate-source suppression and gap/source-change anchoring. Native migration is disabled pending direction/midnight/restart evidence and baseline continuity design. |
| 3: Meter UX | Native power always grid, optional separate home-load capability; retained setting ID; fresh signed threshold condition. Local settings summary distinguishes direct grid, linked-installation fallback, missing/stale data and receipt age, with EN/DE/NL guidance on grid-versus-battery Energy roles. No meter writes or protective automation. |
| 4: Dual CT discovery | Separate staged artwork and explicit metadata quarantine already present. Identity, channel role and direct-versus-host capture require an authorised installation. No guessed prefix or channel admission. |
| 5: Dual CT adapter | Not implemented without the sprint 4 contract; second-channel PV/load must remain distinct from grid and independently configured. |
| 6: Acceptance/release | Regression coverage implemented locally; deployment/installed-state and hardware validation remain separate gates. No publication or certification action authorised by this work. |

Original-meter subscription identity changes without changing paired IDs or
saved host addresses. Re-pairing is not required by this source implementation.
The phase flags/grid state currently appear in the support report, not new
unverified enum capabilities. Counter candidates are not labelled as daily,
reactive or authoritative lifetime energy based merely on their API names.

The regression suite covers direct/host arbitration, stale/future/out-of-order
receipts, explicit zeros, partial-frame ages, unknown power factor, expiry,
teardown, optional home load, fresh Flow conditions, privacy projection and
non-migration of existing counters. The new original-meter code has no device
write path. Existing battery energy accounting and topology repair are unchanged.

### Sprint 3: source/freshness guidance (diagnostic branch, Test Build 42)

The app settings now show an anonymous numbered meter summary above the raw
integration report. It refreshes only with the existing report actions: no new
cloud calls, polling, device changes or automatic Energy exclusions. The summary
shows the selected grid source and its receipt age, including linked-installation
fallback when direct meter data is absent. Explicit zero and signed export remain
valid; stale, future, malformed or missing readings cannot appear as current power.
The direct-grid diagnostic freshness label now matches the driver's existing
90-second acceptance limit rather than the 180-second phase/detail limit.

English, German and Dutch guidance explains missing-data checks, that the report
is a snapshot rather than a live connection indicator, and that native counters
remain unadopted. One authoritative grid meter per connection is recommended;
Home Battery measures battery energy, not the same grid-meter role. No phase-state
enums are promoted to user-facing capabilities without verified semantics.

All 456 tests, lint and local Homey verified validation passed. A real Chromium
settings-page check exercised direct/fallback/waiting summaries at 420px without
horizontal overflow. This is software verification, not installed acceptance.
At implementation, energy accounting, paired identities, master, version and
Test publication were unchanged. The owner then approved the versioned v1.10.27
release: exact-release CI passed and Build 42 was published to Test. Mainline,
Live, energy accounting and control gates remain unchanged. Counter midnight/export
evidence and Dual CT hardware discovery remain
the next acceptance gates.

### Sprint 2: counter evidence and continuity design

The diagnostic branch now checks complete counter records atomically: all three
candidate import/export/net fields must be present in the same record, finite,
and arithmetically consistent. Negative net energy is allowed; negative import
or export is not. Partial records are not merged, and missing export is not
filled with zero. It records observed directional advances and counter decreases,
with receipt age and restart-safe absence of cached evidence. The report continues
to state `migrationAllowed: false`, `unitsVerified: false` and
`midnightBehaviourVerified: false` regardless of how many consistent records arrive.

A pure, test-only continuity preview anchors the old Homey total to a new raw
baseline, then adds only subsequent positive deltas. A raw regression is blocked
instead of interpreted automatically as a reset. No live device calls this preview;
native counters still cannot replace the integrated meters. Battery accounting
and the publication hold are unchanged.

A separate 20-second read-only Developer MQTT probe replayed actual original
meter records through the new evidence tracker: ten complete records were
consistent, import advanced, export did not advance, and no counter decrease was
observed. This is transport/parser evidence only, not a midnight/export or native
energy migration acceptance. No raw samples or account counter values were saved.
Local lint and Homey verified-level validation passed; all 451 automated tests
passed. This does not claim a new store release or installed hardware behaviour.

Remaining acceptance before designing an active migration:

1. Privately compare complete records with EcoFlow meter import/export values,
   including ordinary naturally occurring import/export periods; establish units.
2. Obtain a bounded observation spanning local midnight, keeping counter receipts
   separate from local daily views. A daily-looking API name is not sufficient.
3. Validate reconnect/restart persistence and explicit zero behaviour. Investigate
   any regression as firmware/reset/source evidence, not automatic consumption.
4. Decide the fallback contract after counter adoption: no simultaneous power
   integration, and no filling counter gaps from unobserved power. Preserve the
   current Homey baseline and record the accounting source separately.
5. Hardware acceptance and explicit release approval remain required. Do not
   create experimental export, calibration or reset commands to collect evidence.

For Dual CT capture, record (privately) discovery product identifiers, CT role
configuration and simultaneous EcoFlow screenshots; subscribe only to that
owner's devices. Collect unused/zero/disconnected channels, direction changes,
partial/full frames and reconnects. Redact identifiers before any repo fixtures.
Do not trigger calibration, reset, safety-limit changes or electrical load tests
without a separately agreed hardware procedure.

## Confirmed product information versus integration evidence

- [UK product](https://uk.ecoflow.com/products/ecoflow-smart-meter-dual-ct?variant=54905815269715)
  confirms the catalogue product but provides little technical detail.
- [EcoFlow ES technical description](https://es.ecoflow.com/collections/all-products/products/smart-meter-dual-ct)
  describes two three-phase channels (six CTs), grid plus third-party PV or load
  monitoring, Bluetooth/Wi-Fi/RS485 and STREAM 5000/AC 5000 compatibility. These
  are hardware features, not proof of accessible API fields or local controls.
- [Upstream meter documentation](https://github.com/shuette42/ecoflow-energy-ha/blob/main/documentation/entities/smart-meter.md)
  and [parser](https://github.com/shuette42/ecoflow-energy-ha/blob/main/custom_components/ecoflow_energy/ecoflow/parsers/smart_meter_proto.py)
  explicitly describe the older BK21 EF-EM-P3-120 meter. Its app-auth measurements
  and native import/export counters are useful research for the original meter,
  but cannot be reused as a Dual CT contract without captures.

No verified Dual CT identity, channel mapping or API contract was established by
this review. No authenticated live Dual CT probe was performed; hardware is not
present in the owner's installation yet. Do not mistake absence of a verified
contract here for proof that the product cannot expose data.

## Assets

See [asset provenance](assets/smart-meter-dual-ct/README.md). A transparent
monochrome wireframe/SVG is prepared for a future Homey driver; white-backed
original product imagery is prepared for a future store listing. Neither is
bound to an active driver: changing the old meter's icon globally would mislabel
existing devices. The antenna is an accessory, not a second Homey device.

## Discovery hardening

Previously the broad Smart Meter name fallback could admit this unverified model
to the legacy smartmeter driver. Explicit Dual CT product metadata now stays in
the unsupported/research path, even if EcoFlow reuses an old prefix. A custom
name on an existing, identified old meter does not change its model. Unknown
Dual CT device names also cannot activate the legacy fallback. Cached inventory
continues to expose only anonymous product hints and no supported-model claim.
Existing paired meters and their artwork/accounting are not migrated.

## Proposed implementation once evidence is available

1. Identify product model/type and masked serial prefix from account discovery;
   establish whether telemetry is directly addressed to the meter or embedded
   in its STREAM host. Capture read-only full/delta frames with matching EcoFlow
   screenshots and timestamps. Test disconnected/unused CTs and partial frames.
2. Verify CT1/CT2 channel assignment, sign, units, phase ordering, configured role,
   receipt cadence and native counters. Do not assume CT2 is solar; it may be a
   monitored load. Do not sum CT1 and CT2 into grid demand. Do not manufacture
   voltage/current/energy when the API omits those readings.
3. Add a distinct selectable Smart Meter Dual CT model/entry using its own
   verified adapter and artwork, sharing common meter lifecycle where safe.
   Grid import/export is the Homey Energy grid role, not home storage. One
   authoritative grid meter per installation: avoid duplicate reporting through
   both this meter and another Homey grid meter or derived STREAM grid device.
4. Offer the secondary circuit as explicitly configured PV or load monitoring,
   initially non-Energy until role and accounting are confirmed. Avoid counting
   CT2 PV again when the same inverter already contributes through another app.
5. Candidate readings: per-channel signed power, per-phase voltage/current/power,
   import/export energy if exposed, availability and field freshness. Candidate
   IF/AND cards: grid direction, surplus threshold and secondary-circuit power.
   Native protective status may be informational if exposed; Homey must never
   be presented as a substitute for the device's electrical safety protection.
6. Replay regression fixtures, verify direction/zero/missing/stale behaviour,
   restart/counter continuity and Energy roles; then hardware acceptance before
   Test/store support claims. No reset, calibration, protection-limit or RS485
   command path is inferred from the product's communication methods.

Keep this separate from the original-series mixed-generation reporter repair.
The same privacy, freshness and one-authoritative-source principles apply.

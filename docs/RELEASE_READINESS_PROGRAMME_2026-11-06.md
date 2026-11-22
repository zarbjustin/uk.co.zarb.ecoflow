# Release-readiness programme — 6 November 2026

## Verdict and evidence boundary

**Full public release remains NO-GO.** This is bounded offline engineering and
candidate preparation, not deployment or hardware acceptance. Read the external
`../work/output/release-programme-2026-11-06/FINAL_RECEIPT.md` for exact final
source/CI/archive identities, reviewer returns and lease/index outcome.
Post-push receipts stay outside Git to avoid recursive receipt commits.

Canonical diagnostic baseline was clean `a8d45de7bd91324f2737b25254f64a7de0214381`.
Inspected branch/status/diffs/remotes/lease before normal fetch: 0 ahead/0 behind.
Exact baseline CI 42249328487 was independently successful. One coordinator
acquired `codex:copilot-release-programme-9da5154f`; immutable public Git exports
were used for reviewers, not concurrent canonical writers. No reset, pull,
auto-stash, branch switch, force-push or overwrite of unrelated work.
The nine previous repair families and their regressions are retained.

No Homey or household EcoFlow query, installation/restart, pairing/Repair,
control, settings, Energy, Flow, native task/reserve, forced silence/reconnect,
publication, Mainline change or external contact is included. Native EcoFlow AI
retains reserves; both Homey execution switches, historical fault/history,
lease/ownership, app gates and resident runner remain untouched.

## Confirmed defects and bounded policies

| Finding | Reproduction / repair | Residual limitation |
|---|---|---|
| U1 / P1 native decreases | Real helper and original STREAM driver inflated delayed lower readings. Retain the same-source raw high watermark; lower/duplicate reports add nothing, never lower the anchor. Persist independent charge/discharge ambiguity with the coherent checkpoint and export safe policy evidence. | No consumed protocol contract distinguishes reset from reorder. A genuine indistinguishable reset can undercount until raw exceeds the old watermark. No reset threshold, invented epoch, power fallback or cross-source transfer. |
| U2 / P1 actual Developer backlog | One held real Base consumer retained 10,000 submissions. Limit quota admission to 64 pending plus one running. FIFO accepted reports stay whole; drop the **new** whole packet when full. Count drops/failures and expose incomplete accounting. | This intentionally loses reports under overload; it is not lossless accounting, broker delivery proof, whole-app memory bound or hardware benchmark. |
| U3 / P1 accounting, P2 live fields | Solar/micro/socket retained persisted or expired live values; solar/micro could integrate ten unseen minutes. Reuse per-field receipt/application tracking, clear startup/expired live tiles, retry failed clears, preserve explicit zero/false. Three-minute TTL also bounds solar/micro integration intervals. | Local receipt age is not hardware measurement age. Expiry timers share the owned SDK queue and cannot cancel a hung SDK call. Device availability and diagnostics fail closed; an in-flight write still has to drain. |
| Additional P1 meter history | Original Smart Meter replaced malformed stored history with zero then overwrote it. Unknown structured history or unrecoverable totals now pause both accounting directions without overwriting stores/projections; live power remains usable. Valid projected floors can recover malformed primitives. | No automatic repair/migration of unknown formats. Source ownership/topology is not proven by a valid numeric floor. |
| Additional fractional meter gap | Smart Meter restored 1000.6 Wh plus its rounded 1.001 kWh display as about 1001 Wh. Recognise the native one-Wh display bin and preserve precise checkpoint totals through restart. | This is local precision preservation, not independent interval accuracy. |
| U6 / custom titles | Startup/settings unconditionally replaced Smart Meter titles/options. Use the existing known-default migration helper, preserve custom/mixed-language values and other options; failed reads do not invent empty options. | Native phone visual review remains separate. |
| U5 / accessibility | Nine credential forms had no announced validation error/status. Add alert/status semantics; real Chromium mobile-width keyboard tests exercise required-field rejection without submitting credentials. New stale-data message has EN/DE/NL translations. | Existing onboarding prose/dynamic button copy is not fully localised. This is not a screen-reader or native-phone certification. |

### Counter source contract

Exactly two production `followResettableCounter` calls exist: original STREAM
charge/discharge. MQTT unwraps quota but does not propagate qualified measurement
sequence/reset epochs. Base serialises **receipt** order and rejects conflicting
REST generations; bypassing REST cache is not hardware freshness. Source-bound
restoration/re-anchoring and the native-authority latch remain in force.

Arithmetic must keep initial totals consistent: raw `1000,1010,1005,1015`
previously produced **1025 Wh from a zero local total** (expected 15), or
**2025 Wh from a 1000 Wh local total** (expected 1015). The new fractional-floor
real-driver regression starts at 1000.125 Wh and ends at 1015.125 Wh. A lower
zero followed by small increasing values remains ambiguous, not a confirmed
reset. No supported authoritative-reset mechanism is asserted or fabricated.
Returning to the high-water region permits bounded progress; it does not prove
the chronology or recover unknown energy across a real reset. Separate per-direction
history-incomplete flags latch on a decrease and survive recovery, source re-anchors
and restart; current below-watermark ambiguity can clear without clearing that
historical warning. No automatic history-completeness reset is provided.

### Queue loss and recovery contract

Admission captures actual receipt/source identity before waiting. No partial
fields are combined and no old packet is relabelled fresh. After overflow, the
first **later admitted** report carries a discontinuity; older accepted reports
cannot consume it. A skipped REST reconciliation carries that boundary forward.
A throwing consumer also breaks the next already-admitted interval. Original
battery, solar, micro and Smart Meter reset only power integration anchors;
native high watermarks/latches and cumulative floors survive.

Native cumulative advances can recover some lost energy, not unseen transitions
or resets; loss diagnostics remain latched for the lifecycle. Pending MQTT count
is bounded even under a held consumer; accepted work still drains before terminal
checkpoint/retirement. Retired subscriptions cannot enter a new generation.
Live/remaining-time and meter-detail expiry ticks coalesce rather than append
one maintenance closure per tick. No shutdown timeout pretends to cancel SDK work.

### Legacy live-field contract

Each solar power, micro PV/channel/grid alias and socket relay/power field owns
its accepted receipt and successful SDK projection. Unrelated traffic does not
refresh it. Missing is unknown, not zero/off. Micro total PV still requires both
channels in the same report; partial PV clears total and breaks integration.
Failed writes/clears remain stale/failed and retry; fresh unchanged values and
explicit zero/false can recover. Older per-field receipts cannot overwrite newer
ones. Solar/micro preserve their separate receipt ordering across power gaps.
Cumulative counters never expire and startup clearing is not an accounting reset.
Freshness diagnostics reject ages greater than three minutes, but capability
clearing and availability expiry run on the next minute tick as the owned SDK
queue progresses; almost four minutes may elapse even without a blocked writer.
There is no exact three-minute UI/availability deadline. Solar clears startup
power before optional attribution discovery. Socket startup writes participate
in the lifecycle drain, preventing late retired clears/listener registration.
Smart Meter rounded capability floors never decrease to precise internal totals,
including subsequent sub-bin increments and repeated restart.
Availability requires each declared core live field; failed optional micro grid/PV
aliases remain individually stale/failed and retry, without masking fresh core PV.
Solar history quarantine also leaves valid same-source live power usable; no
integration, counter projection or checkpoint write is permitted while quarantined.

## U4–U7 decisions and public-release gates

- **U4:** manual publish/version workflows remain untouched and unexecuted.
  Propose separately authorised Test/full profiles; do not impose all full-release
  hardware gates on every community Test. The readiness CLI now calls its narrow
  Dual CT structural check exactly that, rather than “Energy engineering accepted”.
  Engineering/readiness records do not substitute for confirmed defect closure.
- **U5:** official Homey permissions documentation says broad API access controls
  all Homey and is generally inappropriate for branded-device apps unless core
  functionality warrants it. Current optional cross-app reader needs that scope.
  Retain with an explicit core-purpose/Athom eligibility decision, or separately
  design a companion/scope-limited architecture with feature impact. Do not remove
  functionality or permission merely to pass validation. Native multilingual/
  accessibility signoff remains open.
- **U6:** Developer login intentionally validates and immediately saves shared
  app-wide keys; cancelling device addition is not credential rollback. Changing
  this requires a separate multi-session/shared-account contract. Never erase
  credentials already used by other devices. Socket completion currently means
  cloud request acceptance, with later polling/telemetry; it is not a verified
  relay or physical completion. README now says so. A bounded matching-readback
  redesign is separate and was not exercised or silently introduced.
- **U7:** latest-cloud SOC retains `cloud_latest_report`,
  `hardwareReportedAt:null`, `hardwareFreshnessVerified:false`. Request/receipt
  age is not measurement freshness. Do not fabricate timestamps, claim verified
  hardware freshness or remove this fallback wholesale without product review.

Community Test proposal: exact reviewed artifact/CI, preserved installed devices,
scoped opt-in/model/firmware/topology declaration, known limitations, rollback
requirements, permission eligibility and explicit publication approval. A scoped
three-phase trial does not claim general three-phase acceptance.
Full public proposal additionally requires every advertised model/role's native
comparison, system scope, original-upgrade/counter preservation, 48-hour exact
runtime soak, independent single/three-phase CT qualification, permission/Athom
resolution and native multilingual/phone acceptance. No workflow enabled here.

## Independent models and actual validation

Hosted coordinator: `gpt-6.1-sol`. Actual configured independent first passes:
`gpt-6-sol`, `gpt-6-astra`, `mai-code-2`. Each returned before cross-findings were
shared; all received the same public baseline Git export (archive SHA256
`217320415130679fb5ba26b0c610d30f69f26f3a455138f2af6bbaeb22324f4f`).
Astra independently matched baseline runtime fingerprint `eef1aa086c40a513c9f882b7651f1bc1e76b2b4ef278c61a5ee3972e9096db63`.
Provider endpoints and exact **MAI-Code-2.x1 (Preview)** equivalence are
**UNVERIFIED**. `mai-code-2` participated; no unavailable Preview is claimed.
Common frozen-diff identities, correction rounds, disagreements and actual final
returns are recorded in external MODEL_PARTICIPATION.md / REVIEW_RETURNS.md.
Agreement cannot waive a correctness concern or hardware gate.

Node22.23.4, committed-lockfile `npm ci` and Chromium preparation completed.
Initial full candidate suite passed **1504/1504**; corrected full candidate passed
**1509/1509**, then **1510/1510** after solar quarantine isolation. Common-diff reviewers exposed and actual regressions reproduced
five additional gaps: historical uncertainty disappearing, startup solar clearing
behind attribution, socket startup escaping lifecycle ownership, rounded meter
projection decreases and optional micro alias failures blocking healthy core PV.
All five received bounded corrections; the minute-tick UI timing claim was also
qualified rather than represented as an exact deadline. A later MAI-only solar
quarantine/live-isolation concern was reproduced and corrected despite Sol/Astra's
earlier source approvals; all three received the resulting new frozen diff.
Final correction returns,
lint/release/whitespace, pinned Homey4.5.3 verified validation and CI are recorded
externally. Local standalone audit hit proxy HTTP400 and public-registry
ENOTCONN; these are infrastructure failures, not zero vulnerabilities. Exact
GitHub CI audit must be checked independently. No dependency/lockfile edited.
Readiness commands are run honestly; unchanged pending ledgers remain failures.
Before-fix logs cover native inflation, 10,000 backlog, all three legacy startups,
meter history/title/fractional defects and inaccessible validation feedback.

Actual Base benchmark: same Node/Mac, one held consumer, 10,000 fixed-shape
submissions, warm-up plus five alternating-order trials. Baseline retained
10,000 pending, candidate 64; candidate explicitly dropped 9936 and drained 65
accepted applications versus 10001 baseline. This is a deliberate loss/bounds
tradeoff, not a throughput or whole-app-memory improvement claim. Exact timings
and process-heap observations/limitations are in external benchmark.json and
the post-correction repeat benchmark-v2.json.

## Coverage, candidate and next owner action

Reviewed AGENTS/workflow, current handover/newest STATUS, prior full review and
sanitised receipts/findings/coverage/model returns; startup/solar/combined-counter
records, 5000/Dual CT RC/acceptance/topology/model matrices and relevant source.
External COVERAGE.md gives exact reviewed ranges and historical omissions.
Private transcripts, original images, credentials, raw household diagnostics and
correspondence were not loaded into hosted contexts. Required private semantic
history/owner-correction/export-omission review remains a gap without an approved
trusted-local inspector. No complete-conversation transfer is claimed.

Official public sources accessed 6 November 2026:
[Homey permissions](https://apps.developer.homey.app/the-basics/app/permissions),
[publishing](https://apps.developer.homey.app/app-store/publishing),
[guidelines](https://apps.developer.homey.app/app-store/guidelines), and anonymous
Chromium rendering of [EcoFlow STREAM5000 API](https://developer-eu.ecoflow.com/us/document/PP3?id=2115695633708867585).
EcoFlow documents main-SN routing, latest-report quota, selected queries, accepted
set versus later outcome and period history; it does not establish app-protobuf,
Dual CT421, every firmware/region, counter epochs or lifetime period equivalence.
Its battery history extra-value mapping itself requests confirmation. No vendor
example identifiers or command payloads were copied into the repository.

Last recorded installed Development remains version1.11.20 / 14:31 delivery,
archive `5a8daa62475500e210991ea6428024b703a72b8f7529aa5ce8eca61da30955ff`,
runtime fingerprint `89ad4da2352e91baade7a0f5150688fe2d120faf832901abf62b6875c6e3f1af`.
Last recorded Test1.11.20/build87, Live1.10.3/build18; not re-queried/changed.
Matching version is not installed-source proof. The new offline candidate is
identified only by its external exact-source/archive manifest and checksum.

Smallest next owner action: review the prepared exact artifact and explicitly
approve, if desired, a **fresh read-only preservation/quiescence preflight on
Justin's Homey Pro**. That is not installation permission. A later one-time
non-clean whole-app update interrupts all paired EcoFlow devices and dependent
automation, and needs its own exact-artifact approval. External HANDOVER.md
contains preservation/rollback requirements, bounded installation proposal,
native comparisons, model/topology acceptance and 48-hour soak stop criteria.
No archive delivery, observer or soak has started.

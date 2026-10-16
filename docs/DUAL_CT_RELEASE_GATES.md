# Dual CT continuity and adoption gates — 15 October 2026

## Release checkpoint — 16 October 2026

The diagnostic continuation below is now published to Test as v1.10.49 / Build 64,
not merely local/unpublished. Source `f11c690ac42447cda447022ed12c16f205c95af3`,
tag `e3113a741a9287c31bf2c4622486faa530385dd9`; source/version/exact-tag CI and
upload passed. Exact CI passed 823 tests, lint, zero-vulnerability audit and Homey
verified validation. Authenticated Homey Apps API readback confirmed Test at
2026-10-16 18:53:34 UTC and unchanged Live v1.10.3 / Build 18. Packaged settings
and compiled freshness assets were read back and SHA256-checked against source.
Mainline/Live/installed devices and physical acceptance are untouched. The tester
reply remains DRAFT ONLY; no new export request or message publication.
See STATUS.md for exact workflow links and acceptance boundaries.

## Diagnostic continuation — 16 October 2026, unpublished

This section supersedes the old missing-record and sharing-priority descriptions
below for the LOCAL diagnostic continuation only. The released v1.10.48 archive
is unchanged. No commit/push, remote CI, publication, mainline or Live action.

### Working assumptions that permit implementation without claiming verification

| Hypothesis | Where implemented | Still needs validation |
| --- | --- | --- |
| A = Grid | Read-only settings comparison label | Installation/firmware role, phase ordering, useful nonzero direction evidence; not a physical CT-port assignment |
| B = EcoFlow Solar / inverter circuit | Read-only label and battery-discharge scope explanation | Raw sign versus app display and meaningful inverter output; do not globally negate candidate values |
| 773.1/.2/.3 = phase net, .4 = import, .6 = export, .7 = net | Optional local raw/1000 candidate kWh display | Wh scale and exact counter/reset/period semantics; signed net decreases are not resets |
| Overview counters are not today's totals | Explicit unknown-period / no-daily wording | Reset origin and period contract; a weekly view equalling the overview does not establish lifetime origin |

The working display never changes raw numbers, registers a verified contract,
enables Energy/Flows/controls/pairing, or interprets 997 numerically. A conflicting
local user observation is shown explicitly, not silently overridden or promoted.
Candidate energy uses the same independent record age and stale/historical
wording as its raw source. Private screenshots and telemetry are not fixtures;
tests use synthetic arithmetic, mixed signs, zero and deliberately different ages.

### Engineering changes before asking for more evidence

Sparse omission means `not_updated`: the last whole record baseline retains its
own age, while `lastPacketAgeSec` describes unrelated packet traffic. Never-seen
records remain explicitly unavailable. >=90 seconds since the actual counter
receipt breaks the next comparison even with intervening scalar traffic. Invalid,
equal-time, source-change and partial-child boundaries remain protected; no
cross-record child completion or durable/overnight baseline is introduced.

Comparison JSON schema 2 shares repeated scalar receipt metadata once per device
and uses `receiptIndex` references. Each reference preserves age, encoding basis,
representation and packet index; it is NOT evidence of simultaneous physical
measurement. Identical latest/last-complete checks use `sameAsLatest`; duplicated
bank metadata and arithmetic results are reconstructed and revalidated. Schema 1
remains the canonical local projection and is accepted as an older input. Unknown
schemas, invalid reference bounds and unsupported representations fail closed.
Copy, manual text and download use the SAME compact schema-2 serialization.
Normal compact reports remain numeric-free, and the scalar-only schema is unchanged.

Within the existing 7500-character limit, complete power groups, bank checks and
counter candidates are prioritised before secondary scalar detail. Trimming
continuity field details, secondary fields or whole records is honestly marked;
last-resort power omission removes a whole bank, never selected phases. Neither
sharing nor rendering polls the cloud, modifies devices or renews retention.

### Next steps toward release

1. Finish local regressions and desktop/mobile preview/copy/download/expiry checks.
2. After separate owner approval, publish a consolidated Test with visible preview
   improvements. Explain what changed; no repeat discovery/report bundle needed.
3. When convenient, validate a meaningful daytime Grid/inverter comparison. Reuse
   existing evidence; request a further export only if a specific unresolved
   contract cannot be settled otherwise. No rushed capture, reset or mode change.
4. Promote role/sign/scale contracts only after evidence supports them. A read-only
   paired driver and later single-authoritative-source Energy adoption are separate
   implementation/review gates, not enabled by provisional preview labels.
5. Use owner hardware for reconnect, restart, reset, multi-space/source, upgrade /
   rollback and native Homey acceptance. No shipping date is hardware acceptance.

The following sections describe the preceding released foundations, not new
publication or completed physical validation.

Diagnostic branch only. Sprints 3–5 foundations are published to Test as
v1.10.48 / Build 63; source tag `7542d4b30bc953419a3a8f5cf3b9e8f2c00d2b5d`.
Source/version/tag CI and upload passed; official channel and public listing
readback confirmed Test on 15 October. Main/Live remain unchanged. See STATUS.md.
This is NOT acceptance of a paired Dual CT device, an accounting migration, a
production release or a new request for customer evidence. Private raw evidence
and credentials remain outside Git; regression examples are synthetic.

## Sprint 3: bounded continuity observations

`DualCtContinuity` runs only behind the existing numeric AND counter-preview
opt-ins, after the strict owned-model / app-MQTT / message / encoding / scalar
admission checks. It adds no subscription, endpoint, persistent setting, file,
capture extension or background timer. The actual capture still lasts at most
two minutes; the existing historical retention deadline is fixed at 15 minutes.

At most two meters x two parents are tracked, with six allowlisted 773 child
baselines, 2048 observations per record and fixed event counters. Each accepted
packet replaces the child comparison baseline; missing children/records, invalid
records and equal-receipt ambiguity break the chain. Older receipts are counted
but cannot replace/freshen evidence. A gap >=90s or a change of encoding-admission
basis anchors again without comparing across the break. Device index is stable
within one capture; a new discovery/account/source inventory starts a new
capture and clears history. 997 remains structure-only, not a cloned 773 map.

Increases, decreases and unchanged values refer to adjacent receipt observations,
not verified measurement times, import/export or resets. Signed net decreases
are legitimate candidates. No absolute values, fabricated zeros, record merging,
counter offsets or integrated energy are introduced. A replay/clock rollback,
Stop, account change, restart, new capture or fixed timer expiry clears state.
There is no durable baseline from which to claim overnight/restart continuity.

The comparison workspace displays fixed, numeric-free field statuses and event
counts, independently aged receipt evidence and explicit daily-unavailable /
unknown-cumulative-origin wording in EN/DE/NL. `dualCtPeriodEvidence` tests local
calendar boundaries using an explicit IANA zone; missing/invalid zones produce
no day assertion. UTC elapsed spans handle 23/25-hour DST days. It never computes
daily energy, even when a date boundary was observed. Since-observation means
this capture's observation history, not a new Wh/kWh or lifetime counter.

Normal support/compact and the legacy scalar export do not gain this history.
Only the optional reviewed comparison export can include it. Fixed browser
allowlists remove measurements, identities, text, source strings and baselines.
The 7500-character budget is retained; unused counter structure or entire
structure-only counter records and lower-priority scalar rows are trimmed before
continuity rows (keeping both observed bank totals where possible), with
separate honest available/included/omitted counts. Re-export preserves coverage.
Local cards retain the full bounded view independently of sharing truncation.

## Sprint 4: device-preview readiness, not a new pairing driver

`dualCtReleaseReadiness()` reads the developer-owned verified-contract gate.
That registry still returns null; telemetry, a user-assigned name, local
Grid/Solar observations or a forged `verified` flag cannot register a contract.
Settings explicitly state that device pairing remains blocked. There is no
new driver or auto-conversion, deletion, re-pairing, capability change or extra
Energy contributor. The original Smart Meter driver/artwork remain untouched.

The bank comparison cards already provide the bounded research UI. A deployable
device driver is intentionally deferred rather than publishing W/V/A/phase/CT
capabilities before their semantics have passed the following gates:

| Device gate | Current state | Evidence needed |
| --- | --- | --- |
| Model/firmware contract | Open | Explicit model-421 field/wire/scale coverage for the supported firmware |
| Both bank roles | Open | Convenient EcoFlow Grid/Solar comparison plus corresponding candidate export; local annotations alone do not verify a contract |
| Units, sign and phase order | Open | Matched comparisons including actual nonzero phase observations; absent current fields are not zero |
| Reconnect/staleness/client behaviour | Local synthetic coverage only | Physical comparison and native Homey desktop/mobile acceptance |
| 997 counter mapping | Structure only | Independent nested child/type/unit evidence; do not copy 773 |

## Sprint 5: pure energy-adoption trial and release fences

`dualCtEnergyTrial.ts` is an unwired pure replay/laboratory design tool for future
VALIDATED Wh import/export inputs. It is not imported by app, drivers, API or
research decoding, never receives live candidates, persists nothing and always
returns `migrationAllowed: false`, `contributesToEnergy: false`. It neither
establishes the current candidate units nor changes existing accounting.

The trial preserves supplied existing totals, anchors vendor lifetime values
without a jump, adds only subsequent nonnegative deltas, selects exactly one
source and blocks power fallback. Either directional decrease conservatively
anchors both streams without adding the new raw reading from zero. Source
changes, gaps and restart/restore also anchor without bridging the unknown
interval. Duplicate/older, stale, future, malformed, signed-net, wrong-unit and
overflow inputs fail closed. Version-1 restore retains totals but discards the
old receipt baseline; unknown schema/rollback versions are rejected. This is
synthetic design evidence, not a migration implementation for installed devices.

| Energy/release gate | Current state | Acceptance before enabling |
| --- | --- | --- |
| Counter units/period/origin | Open | Actual numeric counter contract and observations; no daily/lifetime inference from one screenshot |
| Reset, restart, midnight and gaps | Synthetic trial only | Scheduled bounded physical acceptance, not an urgent midnight capture |
| Authoritative grid source | Open | Installation-specific source selection; no simultaneous original meter + Dual CT + system duplicate |
| One accounting path | Trial protected; runtime unchanged | Explicit reviewed migration, never counter plus power integration |
| Upgrade/rollback | Trial schema protected | Persistence backup, app-version compatibility, downgrade handling and physical acceptance of the actual migration |
| Original STREAM/meter compatibility | Existing automated regression coverage | Physical original installation regression before full release |
| Publication | Not authorised | Owner approval, exact source CI, Test readback, then separate certification/Live decisions |

Release-fence tests ensure original meter classification and pairing capabilities
are unchanged, production drivers cannot import the research/trial paths and
developer-owned contract gates remain closed even with plausible counters or
user observations. These tests must not be interpreted as physical validation.

## Next validation, without repeating the reporting loop

No message was sent and no new customer capture was requested. The owner-approved
consolidated Test release is available; Robert's reply remains draft-only.
If Robert still wants
to help, one optional convenient daytime comparison with the combined reviewed
JSON is the first useful gate; do not request a separate compact/full/crash
bundle. Establish bank roles/units before asking for a later continuity study.
No unsupervised switching/reset/re-pairing or overnight capture is required.

The owner's expected late-October hardware can then cover physical restart,
multi-device/source selection, installation behaviour and upgrade/rollback.
That expectation is not a verified shipping event or acceptance deadline.

## Pre-release local verification

812 tests pass, with 20 new tests beyond sprints 1–2, plus lint, audit with zero
vulnerabilities, diff checks and Homey 4.5.3 verified validation. Synthetic
continuity tests cover signed changes, retained outcome history, absent/partial/
invalid records, gaps/source/equal/older receipts, independent meters/parents,
freshness, caps, fixed timer cleanup, consent/Stop/rollback/restart and timezone/
DST boundaries. Laboratory trial tests cover lifetime anchoring, monotonic totals,
source switching, counter-vs-power exclusion, reset ambiguity, stale/gap/restart/
restore/unknown-schema/overflow cases. Driver-isolation/release-fence tests pass.

Chromium checks at 390px and 1280px exercise UI and sharing. The combined export
retains useful continuity evidence before lower-priority scalar details, while
honestly reporting omissions. A worst-case two-meter report still fits 7500
characters and can be re-exported without losing coverage counts. Synthetic
mobile/desktop screenshots were inspected; no horizontal overflow. These are
browser/synthetic results, not native Homey or electrical/hardware acceptance.

Those local checks preceded the owner-approved commit/push and v1.10.48 / Build
63 Test-only release described above. Exact release CI repeated all 812 tests,
lint, audit and Homey validation. No physical-device command, customer message,
mainline, certification or Live change. The owner's installed v1.10.3 was read
but not updated; native Test-host/physical acceptance remain unclaimed.

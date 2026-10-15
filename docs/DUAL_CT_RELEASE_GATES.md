# Dual CT continuity and adoption gates — 15 October 2026

Diagnostic branch only. Sprints 3–5 foundations are local and unpublished.
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

No message was sent and no new customer capture was requested. After owner
approval, batch these local changes into one Test release. If Robert still wants
to help, one optional convenient daytime comparison with the combined reviewed
JSON is the first useful gate; do not request a separate compact/full/crash
bundle. Establish bank roles/units before asking for a later continuity study.
No unsupervised switching/reset/re-pairing or overnight capture is required.

The owner's expected late-October hardware can then cover physical restart,
multi-device/source selection, installation behaviour and upgrade/rollback.
That expectation is not a verified shipping event or acceptance deadline.

## Local verification

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

No commit, push, CI dispatch, version bump, Test/Live publication, physical-device
command or customer message. Current package stays 1.10.47; the installed/Test
build does not contain these uncommitted changes. Mainline refs unchanged.

# Dual CT grid Energy preparation — 17 October 2026

Three preparatory sprints on `codex/mixed-generation-reporting-diagnostics`.
This is implemented plumbing and synthetic verification, NOT an activated meter
integration. No existing device is converted, no Energy driver is registered and
no app/driver/preview imports or instantiates the new session. Mainline, Live and
published Test remain untouched. No publication or new tester capture authorised.

## Sprint 1 — grid source and timing

`dualCtGridEnergySource.ts` accepts a bounded owned live MQTT frame, not a display
cache. It uses the existing strict header/encoding and scalar decoder, requires
exactly one eligible payload, all three CT1 candidate power fields in that
payload, and no contradictory reported total. It nets signed phases BEFORE any
import/export split, never adds CT2, never treats hybrid-inverter throughput as
solar production, and ignores native energy-counter records.

Admission additionally requires a developer-owned model/firmware contract for
CT1/Bank A, watts, sign, encoding and live-freshness evidence. No such contract is
registered. The public resolver returns null and the runtime switch is false.
Test fixtures inject synthetic contracts through a code dependency; customer
labels, report flags, screenshots or request bodies cannot register a contract.
Fresh model/firmware readback is required at start, each packet and projection.
A firmware/model change stops the session instead of silently reusing its map.

Two explicit timing contracts are implemented:

- `device_measurement`: requires independently known fresh measurement time and
  receipt time. Missing, future or stale measurement time is rejected.
- `verified_live_receipt_estimate`: uses arrival intervals, explicitly keeps
  measurement time null and marks the proposal as approximate. This requires its
  OWN developer-validated live-channel freshness evidence; it is not a fallback
  for a failed measurement-timestamp check. A new arrival does not prove a fresh
  physical measurement. Replay/buffering behaviour must be assessed on hardware.

The current receipt-only preview qualifies for NEITHER runtime path merely by
having recent packets. The estimate is an implementable alternative for later
validation, not an invented timestamp or relaxed default gate.

## Sprint 2 — persistent power accounting

`dualCtGridEnergySession.ts` serialises observations and saves totals before
exposing a proposed Homey projection. Its bounded queue owns at most eight
payloads; overflow pauses until explicit resume rather than accumulating history.
Time integration is trapezoidal and splits direction crossings at zero via
`dualCtPowerIntervalWh`, shared with the older strict power trial. Positive
normalised power is import; negative is export. No phase-by-phase absolute-value
accounting, counter mixing, vendor lifetime seeding, daily reset or timezone math.

- First observation anchors without backfill. Invalid/partial/conflicting data
  clears the anchor. Duplicate/reordered samples cannot advance energy or refresh
  the old anchor. Gaps >=90 seconds re-anchor without filling downtime.
- Clock rollback clears/pauses the anchor, including rollback during pending IO.
  UTC millisecond intervals make DST/day boundaries irrelevant to accumulation.
- Restart/reconnect restores totals but never the previous sample/session anchor.
  New session IDs preserve the binding; account, physical meter, grid scope,
  contract, firmware, encoding, direction or timing changes do not.
- Proposed energy values are kWh derived from observed power, not vendor energy
  totals, billing-grade metering or a guarantee that gaps have been accounted for.

`dualCtEnergyCheckpoint.ts` defines one dedicated private Homey store key and a
strict versioned checkpoint containing only opaque source binding, timing basis,
revision and import/export Wh totals. No raw identity, sample baseline or packet
history. SHA256 checksums detect accidental inconsistency; they are not an
authentication mechanism. Unknown schema, corrupt or differently scoped state
fails closed without overwrite or silent zeroing.

Writes are read back before committing a projection. A failure (including an
ambiguous save whose acknowledgement was lost) disables projection; explicit
resume rereads actual stored state and re-anchors, avoiding interval replay.
Pre-write readback detects a stale/external writer. Within-session revision or
total rollback and disappearance of previously known state are rejected.

Known limit: one Homey key plus an in-process lease is NOT a distributed atomic
compare-and-swap database. A valid older whole-app backup after process loss
cannot be recognised from that checkpoint alone. Native Homey rollback/history
acceptance and any explicit physical-source transfer remain release gates.

## Sprint 3 — explicit adoption and Homey projection

`dualCtEnergyAdoption.ts` requires explicit source-specific consent, a NEW future
Energy device, power-only accounting, a qualified contract, complete fresh app
contributor inventory, no active source for the same grid, and separate review of
external/P1 meters. The session recomputes contract/binding and requires the
selected source to match; a consent for another meter cannot be replayed.

An app-process `DualCtEnergyAuthority` enforces a single owner per grid even for
duplicate aliases of the same source. A pending write retains its lease after
close, consent revocation or backpressure until queued IO settles. Other meters
are NEVER disabled, reconfigured, deleted or automatically replaced. A source
change requires a separately designed migration, not an automatic totals transfer.
Cross-app meters require owner/inventory review; this code cannot inspect other
apps or promise household-wide deduplication without that review.

The proposed SDK configuration follows the current
[Homey Energy documentation](https://apps.developer.homey.app/the-basics/devices/energy#cumulative-measuring-devices):
class sensor; `measure_power`; `meter_power.imported` / `.exported` in kWh;
`cumulative: true` with corresponding cumulative import/export properties.
Receipt-estimate proposals include the power approximation option. These are
returned as PROPOSALS ONLY: no setEnergy, setCapabilityValue, driver manifest
change or runtime store creation occurs in the installed app. Every result still
states `contributesToEnergy: false` and `migrationAllowed: false`.

## Remaining activation work

1. Validate/register a real model/firmware/encoding/grid/sign/timing contract.
2. Build a separate explicit Energy adoption UI/device with fresh inventory and
   external-meter review; do not convert the read-only preview in place.
3. Exercise native Homey storage, gaps, upgrade/downgrade/backup, reconnect and
   physical import/export comparisons on the owner's hardware. Apply no setter
   until those release gates and owner approval pass.
4. Investigate native counter units/reset periods independently; their absence
   need not block a validated power route. CT2 hybrid separation still needs
   another source to distinguish solar from battery exchange.

No further planned JSON exports/captures from the tester are needed for these
engineering tasks. They are not evidence of installed-host or hardware acceptance.

## Local verification

925/925 tests pass, including 30 new Energy-path regressions. Lint, audit (zero
vulnerabilities), diff checks and Homey CLI 4.5.3 verified validation pass. The
final full suite and CLI build ran sequentially. The earlier 35-test focused
source/session/strict-trial run also passed before the final two lifecycle cases
were added; those cases are included in the final full suite.

Coverage includes owned wire admission, complete mixed-sign CT1 netting and CT2
exclusion, timing separation, consent source binding, fresh firmware readback,
checkpoint corruption/readback/rollback, before/after-commit failures, restart,
no downtime fill, duplicates, independent stale data, queue limits, copied
payloads, authority conflicts, delayed close/revocation, clock rollback during
pending saves, overflow and a 72-hour UTC replay spanning the UK DST weekend.
Tests also assert no app/driver imports these modules and no preview gains an
Energy declaration. Other nine driver manifests/Flow/permissions/version unchanged.
This verification creates no stores on a real Homey, applies no Energy config
and is not CI, Test publication or physical acceptance evidence.

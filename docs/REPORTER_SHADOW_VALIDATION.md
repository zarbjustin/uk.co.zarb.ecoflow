# Mixed-generation reporter comparison and repair gates

10 October 2026. Read-only diagnostic increment on
`codex/mixed-generation-reporting-diagnostics`, published and verified on Test
as v1.10.29 / Build 44. Hardware acceptance and any reporter repair remain pending.

## What this addresses

The latest private support evidence indicates that an original Home Battery can
keep receiving zero core readings at its saved original-generation address while
a fresh main-device lookup resolves a 5000-series reporter. Separately, that
reporter receives system SOC, flow data and original-generation peer records.
Some original-source sensor and counter fields remain active. This is a source
transition problem, not evidence that all original telemetry has stopped.

The prior repair preview correlated peers but did not retain the exact resolved
address for a private join. This increment retains that address only in memory
and links it to an existing paired reporter. It does not introduce new account
discovery, subscriptions, commands or fallback Energy readings.

## Report interpretation

The existing **Check current battery reporter (read-only)** action performs the
bounded fresh API check. **Show integration support report** itself remains a
local snapshot; it does not contact EcoFlow. Reports now include schema 8 and a
UTC capture timestamp. No serials or raw API response objects are added to them.

`reporterShadow` contains one entry per original Home Battery:

- The exact resolved address must match a paired reporter; peer or model-family
  similarity alone is insufficient.
- The resolution must be no older than five minutes and consistent with the
  current read address and saved topology address.
- A matching original-address peer receipt must be no older than three minutes.
- Multiple reporter representations or original aggregates resolving to the
  same reporter are ambiguous. No array-order selection or implicit deletion.
- Each comparison requires fresh legacy and candidate field receipts (at most
  three minutes old) and at most 30 seconds of receipt-age skew. Missing/stale
  values produce null deltas, not zero or cached-capability fallbacks.
- Genuine reported zero is preserved. System SOC is not a member SOC or average.
  Battery power is **derived from the app-protocol flow matrix**, not a direct
  scalar battery-power field. Its derivation and full installation scope remain
  unverified on the affected hardware.

Receipt skew is a coarse diagnostic filter, not proof of simultaneous physical
sampling. `comparison_ready` means the identity/peer join is available; individual
fields can still be missing or stale. The report always keeps repair, control
migration and verified installation scope false. Native counters and their
existing source/baselines remain untouched.

## Next acceptance wave

1. Test publication is complete. Update the installed app to v1.10.29 and allow
   fresh readings to arrive. Do not ask testers to delete or re-pair their existing
   devices merely to gather this evidence, or add duplicate Home Battery devices.
2. On a mixed-generation installation, use the reporter check, copy its displayed
   JSON and send the separate Homey diagnostic app-log ID. Capture EcoFlow's
   combined battery screen and Homey's existing Home Battery close to that UTC
   capture time; include phone timezone and whether the system was charging,
   discharging or idle. Gather a later set in a different naturally occurring
   operating state, including daytime solar where available.
3. Establish whether the selected reporter really covers the entire combined
   installation. Verify power sign/scale and SOC against EcoFlow, distinguish
   aggregate fields from member records, and review partial flow-frame behaviour.
   Do not infer scope merely from matching SOC, peer presence or equal readings.
4. Only then implement an explicit reversible **monitoring-reporter** repair
   retaining the Homey device identity and Flows. Define counter-source continuity
   separately before any Energy switch. History/control targets must not silently
   follow the new monitoring address; controls remain a separate acceptance gate.
5. Verify restart/reconnect, stale fields, missing reporters, unlink/relink, saved
   rollback behaviour and numerical Energy continuity. Production startup timeout
   investigation remains separate; cleanup tests alone do not prove it fixed.

## Offline checks completed

All 474 tests, TypeScript build, lint and Homey verified validation passed. Added synthetic regression cases
cover exact versus same-family matches, stale/future receipts, failed resolution,
teardown/reinitialization races, duplicate representations, absent/invalid fields,
independent field ageing, skew boundaries, genuine zeros, unchanged stores, ES21
correlation, clock rollback, read-address changes during lookup and
anonymous report projection. No private diagnostics, identifiers or credentials
were added to fixtures or repository documents. These checks do not establish
hardware acceptance or a repaired live aggregate.

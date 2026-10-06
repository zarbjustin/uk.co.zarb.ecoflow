# Sprint 2 — mixed-generation discovery

5 October 2026. The read-only discovery increment is implemented locally on
`codex/stream-next-wave-test`. This is not a store release, confirmed hardware
pass or completed mixed-generation integration. Sprint 1's remaining validation
gates stay open in [its ledger](SPRINT_1_VALIDATION_STATUS.md).

## Research boundary

Re-read the [official STREAM page](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
in the browser on 5 October. It documents a main-device lookup and BK examples,
including system quota/history routing. This page does not establish an ES22/BK
cross-generation membership or stable installation-identity contract. A routing
serial is not necessarily a permanent system ID, especially after linking or
leader changes.

Also reviewed upstream at
[`8cc4624f10a4fe2f75d5a389937982ca8deb9736`](https://github.com/shuette42/ecoflow-energy-ha/tree/8cc4624f10a4fe2f75d5a389937982ca8deb9736):

- [App device-list normalization](https://github.com/shuette42/ecoflow-energy-ha/blob/8cc4624f10a4fe2f75d5a389937982ca8deb9736/custom_components/ecoflow_energy/ecoflow/app_api.py)
  handles ownership categories and multiple bucket layouts. These are not
  sufficient evidence that account devices belong to one battery installation.
- [ES22 parser](https://github.com/shuette42/ecoflow-energy-ha/blob/8cc4624f10a4fe2f75d5a389937982ca8deb9736/custom_components/ecoflow_energy/ecoflow/parsers/stream_ac5000_proto.py)
  attributes repeated unit records by serial. That supports source attribution,
  not complete membership or immutable cross-generation identity.
- Upstream now has additional PV/socket and control observations. These need a
  separate model/capability review with fixtures and hardware readback; this
  sprint neither imports commands nor treats upstream controls as Homey-ready.

The [first-hand linking evidence and full validation matrix](MIXED_GENERATION_VALIDATION.md)
remain relevant. One combined percentage in EcoFlow's UI does not prove that both
Homey aggregates describe disjoint power or that a peer list contains every unit.

## Local implementation

- Each admitted ES22 runtime observes serial-keyed peers from its existing
  parser, independently of capability mapping and energy integration. There
  are no extra cloud calls, subscriptions or new timers.
- Partial updates preserve observations but do not refresh absent peers.
  Receipt times distinguish fresh from historical evidence (20-minute diagnostic
  window, not the device's configurable availability timeout). Wrong-source
  telemetry and malformed identifiers are rejected.
- Retention is bounded to 64 peers and resets on device initialization. No
  membership list or new identity is written to Homey's device store. A maximum
  reported record count is an observation, not a certified battery count.
- Original Home Batteries supply only their cached main routing address. We do
  not manufacture peer membership or assume it remains a full-system route
  after EcoFlow linking.
- Support report schema **2** retains existing fields and adds anonymous
  per-driver `topology` plus `installationTopology`. Prefix-family counts do
  not admit unsupported models. An unavailable getter remains explicit.
- Potential overlap compares addresses/observed peers **only between paired
  installation aggregates**, not the optional physical monitors. It is a
  `review_only` hint with a freshness flag, not a confirmed duplicate, command
  to delete devices, or automatic Energy exclusion.
  For identical paired addresses, freshness is null: configuration equality
  does not establish fresh telemetry or device availability.
- Device indices identify entries only within that support snapshot. They are
  not persistent IDs. Full serials, names, hashes, credentials, raw telemetry
  and exception details are excluded from the public projection.

No peer match selects the authoritative aggregate; no match proves independence.
There is no automatic merge, new pairing role, arithmetic SOC averaging,
capacity summation, counter/history rewrite, Flow migration or new 5000 control.
The current installation-only Homey Energy model is unchanged.

## Verification

Regression cases cover synthetic linked BK/ES evidence, independent installations,
shared peers, identical paired addresses, missing attribution, partial/stale
updates, wrong sources, invalid values, bounded retention, restart reset and
privacy. Lifecycle replay feeds existing masked ES22 frames through the real
parser/adapter; physical monitors still have no Energy meters. Synthetic mixed
fixtures are not claims of real mixed-generation hardware validation.

Local full suite: **261 tests passed**, build/lint passed, full dependency audit
has zero findings, Homey publish-level validation and whitespace checks passed.
No version bump, commit, push, store upload or live installation was performed.

## Remaining work before consolidation

1. Release this observational candidate to Test only when authorized and CI is
   green; confirm the new support endpoint on an installed Homey.
2. Collect an already-linked BK/ES positive case and separate-installations
   negative case, with time-aligned EcoFlow system/unit pages and diagnostics.
   Do not ask users to link/unlink for testing; this may affect EcoFlow history.
3. Privately reconcile observed serials with actual membership and stable system
   identity; verify which source includes both generations' power/SOC/capacity.
   An anonymous report can flag a lead, but cannot prove the mapping itself.
4. Establish counter origin and restart/leader-change behaviour, then design a
   user-confirmed reversible migration that preserves totals and explains
   Homey Flow/history consequences. Do not merge until these facts are known.
5. In parallel, complete Sprint 1's Energy discrepancy, startup report, picker
   and hardware/soak investigations. Monitoring or topology replay does not
   resolve those outstanding reports.

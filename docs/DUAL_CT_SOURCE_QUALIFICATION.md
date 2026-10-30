# Dual CT three-phase source qualification and binding preparation

Prepared on the diagnostic branch on 30 October 2026. This is source preparation,
not three-phase hardware acceptance or activation. Test, Live and installed
Development remain unchanged. No tester was contacted.

## Working single-phase path

The existing firmware registry, default resolver, pairing and driver are unchanged.
Legacy binding serialization remains unchanged, with its pre-change SHA-256 pinned
in regression coverage. Existing exact-Wh checkpoints restore without migration,
retain export precision and anchor the first new receipt without downtime backfill.
The production single-phase session is tested with the default resolver, without
three-phase qualification or injected profiles. Nonzero phase 2/3 remains rejected
by that profile. No existing Energy counters are rewritten or re-bound.

## Separate three-phase qualification

`DualCtSourceQualifier` is an internal preparation seam. No driver, pairing form,
settings handler or HTTP endpoint invokes it. The production three-phase registry
is empty, and release-boundary checks enforce that empty state. There is no new
three-phase UI, automatic wiring detection or native wiring-discovery integration.

A future trusted app-side reader must join current owned account/device/grid and
firmware identity with reviewed three-phase wiring and signed-phase-sum netting.
The reader must supply a fresh readback, with an owned-configuration or reviewed-
installation basis. A customer checkbox or packet powers cannot establish that
basis. Selection accepts only wiring and netting policy; identity, firmware and
verification flags cannot be supplied through it. Profiles are code-owned;
synthetic profiles/readers are injected only in tests.

The opaque, process-local qualification binds to its reader and frozen source and
profile snapshots. Cancellation, failed requalification, late reads, clock failure,
backward time and expiry revoke authority. Source/qualification freshness is less
than 90 seconds; packet freshness remains separately profile-specific (5 seconds
in the synthetic tests). JSON round trips cannot carry authority. Internal object
spreads retain the private symbol so the existing session can copy its contract.
A future runtime integration must implement timely requalification and revocation;
this preparation does not claim that lifecycle is deployed.

## Binding and accounting

Explicit three-phase contracts use a separate `dual_ct_grid_binding_v2` hash
namespace. It includes account, device, grid and the complete qualified profile,
including firmware, wiring, netting, direction, timing and encoding. Qualification
receipt time and session ID are excluded so renewed qualifications can restore the
same checkpoint. Wrong source scope is rejected. Profile/source changes produce a
different binding. Legacy checkpoints are rejected without writing or migrating
counters; any future migration needs its own reviewed policy.

Synthetic qualified sessions require all three CT1 powers and a matching total
from one accepted packet. They integrate signed CT1 phase sum only; CT2 is excluded,
including hybrid-inverter/battery feeds. Consent, overlap, timing, stale-data and
checkpoint protections remain in force. Missing phases are never filled with zero.

## Validation and remaining gates

Locked Node 22 tooling: all 1,246 tests, lint, release-boundary checks and pinned
Homey CLI 4.5.3 verified validation pass. Full-release hardware readiness remains
blocked. Read-only readback confirms Test 1.11.5/build 72, Live 1.10.3/build 18
and running installed Development 1.11.5 remain unchanged.
Regression cases cover the real single-phase binding/checkpoint/session path,
three-phase authority forgery/expiry/cancellation, scope isolation, mixed-sign CT1,
CT2 exclusion, restore without backfill and rejection of incomplete totals.

The hardware planning ledger remains eight partial and six open gates, with no
registered three-phase profile or admission. Robert's historical evidence informs
the provisional signed-phase-sum policy; it does not establish current firmware,
packet timing, reference interval accuracy, zero/missing semantics or exact-runtime
Homey recovery/upgrade/48-hour soak. No more captures have been requested.
See `DUAL_CT_THREE_PHASE_EVIDENCE_REVIEW.md` and
`DUAL_CT_THREE_PHASE_PREPARATION.json` for the remaining matrix.

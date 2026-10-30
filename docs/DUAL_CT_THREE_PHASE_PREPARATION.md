# Three-phase Dual CT Homey Energy preparation

Status: source preparation only, **no three-phase Energy admission**. No new
profile, pairing setting, firmware exception, installation or channel change.
The existing single-phase CT1 profile and its paired identities remain unchanged.

## Evidence and scope

[EcoFlow's Dual CT specification](https://de.ecoflow.com/products/smart-meter-dual-ct)
describes two three-phase channels, six CTs in total, for a property incomer and
an additional circuit. Hardware capability does not establish the cloud payload's
phase assignment, sign, measurement timing or cumulative accounting policy.

The existing candidate mapping is CT1 power fields 962/963/772, total 515; CT2
power fields 991/992/993, total 998. Its basis is the previously examined native
schema and single-phase evidence, not a physical three-phase validation. The
existing generic wire adapter already sums three CT1 phases in synthetic tests.
Actual production resolution still returns only firmware 1.0.0.41's single-phase
profile and rejects nonzero phase 2/3. That restriction is not removed here.

`lib/dualCtThreePhaseReview.ts` adds offline **one-payload** inspection. It requires
all three explicit CT1 powers and a consistent reported total, and rejects
malformed/duplicate/nonfinite/missing values. It compares signed-net and separate
per-phase import/export hypotheses. CT2, raw counters, voltage and current never
enter those sums. Its outputs always say Energy-ineligible, wiring/sign/order
unverified and accounting policy unresolved. No runtime driver imports it.
Packet co-location alone is not proof of simultaneous hardware measurement.

## Accounting decision that must be resolved

With phase powers +2000, -1500, -1000 W, positive-import convention:

| Hypothesis | Import | Export |
| --- | ---: | ---: |
| Signed phase sum, then split by sign | 0 W | 500 W |
| Split each phase, then sum | 2000 W | 2500 W |

Both yield the same net balance but different import/export counters. A balanced
+1000/-500/-500 W case has zero signed net while power still flows on each phase.
Do not count only phase 1, sum magnitudes, discard negative phases or assume the
reference meter's accounting policy. Agreement during all-import operation does
not distinguish these hypotheses. Today's single-phase property cannot establish
this difference by making artificial phase values or connecting a second feed.

Proposed Homey layout: **one** property Energy source; retain the detailed monitor
for CT1/CT2 phase power, voltage and current. Do not add three competing property
meters or count a downstream Office meter again. The eventual source must match
an explicitly supported reference/accounting policy. If site/meter policy differs,
it needs an explicit separately qualified contract, not a hidden automatic switch.

## Hardware and volunteer requirement

One existing, correctly commissioned **true three-phase** Dual CT installation is
the minimum useful next test site. Obtain owner consent; do not repeatedly ask
Robert or another tester for a generic capture. The specific need is simultaneous
opposing phase flow and physical phase identification that this single-phase site
cannot provide. No message or capture request has been sent.

Required evidence/equipment:

- Exact model/discovery identity and actual current firmware; an offered upgrade
  version is not current-firmware proof. Start with model 421/1.0.0.41 only if the
  actual test unit reports that identity; otherwise review a separate profile.
- Electrician-confirmed CT1 on all three incoming phases, with phase/voltage
  association and clamp direction documented. No change to Justin's installation.
- Native EcoFlow phase/total view, Homey readings and a suitable independent
  bidirectional three-phase reference with known units, resolution, uncertainty,
  phase allocation and netting policy. Device counters of unknown period are not
  an independent lifetime or billing reference.
- A site capable of naturally or separately approved, attended mixed-direction
  flow. Ordinary loads alone may prove import but cannot prove export behaviour.
- Synchronized observation windows and privately retained packet receipt/sequence/
  retained/duplicate metadata. No credentials, raw captures, wiring photos or
  household time series in public Git. Record sanitized results only.

## Proposed hardware matrix

All entries are **open** in the separate planning ledger. Thresholds below are
proposals for review with the instrument specification, not existing passes.

| Gate | Required observation | Pass condition / rejection |
| --- | --- | --- |
| Identity/firmware | Owned discovery and current package before/after run | Same intended physical meter/model/firmware; unknown/change blocks source |
| Wiring/phase assignment | Each independently identified phase under an approved load change | Correct CT1 phase association/direction; phase permutation or wrong voltage pairing fails |
| Active power/units | Balanced and unbalanced import, all-phase export, low load | Compare reported active W, not inferred V×A; proposed error ≤max(10 W, 2% reference), subject to reference uncertainty |
| CT1 coherence | All three powers and reported total in each usable packet | Algebraic agreement within float32 tolerance; no stale-field mixing; omission is not zero |
| Mixed-phase netting | Import/export on different phases and near-zero net | Establish native total and reference import/export policy; select qualified policy explicitly; do not infer it from all-import tests |
| Partial/zero phases | Explicit idle phase, missing-field packet, zero crossing | Explicit zero retained; missing/stale phase invalidates interval; no fallback to the other phases or CT2 |
| Timing/coverage | At least 15 min with load steps and native/reference timestamps | Measure cadence, buffering/reorder and gaps; apply receipt guards, never label receipt as measurement time; proposed ≥99% eligible interval coverage |
| Energy intervals | Aligned positive, negative and opposing-flow intervals | Enough energy for reference resolution (at least 100× its smallest increment); proposed error ≤max(2%, combined instrument/quantization/timing bound), with all skipped coverage disclosed |
| CT2 isolation | CT2 connected/disconnected or changing on an approved test site | CT1 Energy unaffected; CT2 traffic cannot renew CT1 power freshness or add another property source |
| Native projection | Homey Energy and detailed device on desktop/mobile | One property source with correct sign/totals; per-phase monitor values preserved; no duplicate solar/battery contribution |
| Storage/recovery | Natural gap, separately approved restart/non-clean update | Native three-decimal kWh and precise Wh retained; first new sample is anchor only; no downtime backfill; stale checkpoint cannot lower totals |
| Upgrade/backup | Reviewed preservation baseline and separate backup/rollback test | Identities/Flows/Insights/settings retained; no manual counter correction; original STREAM startup dip tracked separately |
| Normal use | ≥48 hours on exact final runtime/firmware/wiring/policy | Retained counters, no unexplained gaps or overlap, acceptable coverage/error and native UI; any candidate change requires scope reassessment |

A proposed 99% coverage criterion is not met simply because a few power samples
match: the existing candidate has observed approximately 30-second recovery
interruptions. Measure the real lost interval/coverage before a three-phase
accuracy claim. Never scale totals up afterward to hide rejected intervals.

## Future implementation boundary

The resolver currently selects by model/firmware only. Supporting both wiring
modes on the same firmware requires an explicit source-qualification design:
verified wiring scope and reference policy must be included in the contract and
source binding. Zero phase 2/3 at one instant cannot identify single-phase wiring.
A customer setting cannot declare mapping, firmware or freshness verified.
Preserve existing single-phase bindings/checkpoints; do not silently replace its
profile ID or migrate stored totals when adding a separately qualified profile.

After the matrix supplies usable evidence:

1. Review a firmware/wiring/policy-specific contract and packet timing/zero rules.
   If phases are asynchronous or zeros are omitted without a proven snapshot
   contract, stop; the current adapter cannot safely fill those fields.
2. Add explicit qualified source selection, binding and pairing consent without
   broadening the current single-phase profile or re-pairing existing devices.
3. Add native UI/projection and quantitative regression fixtures from sanitized
   observations, preserving delivery guards, one-writer authority and precision.
4. Review an exact Development archive and preservation/commissioning window.
   Installation, Energy adoption, restart, load/export operations and any Test
   publication require their own explicit approvals.
5. Complete final native validation and soak before production consideration.

The planning ledger is not a runtime registry or a replacement for the current
single-phase acceptance checker. No three-phase profile is registered; the
existing release-boundary checker continues to enforce that fact. No new
three-phase claim is added to store metadata or pairing UI by this preparation.

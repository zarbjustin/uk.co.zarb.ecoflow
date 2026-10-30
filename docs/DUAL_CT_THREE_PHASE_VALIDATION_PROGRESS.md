# Three-phase validation using retained evidence

30 October 2026. Source/offline work only. No three-phase profile, installation,
restart, Energy/settings change, publication or tester request.

## Completed in this follow-up

- Reopened the original complete historical snapshot and indexed/pruned comparison
  in the private forum. Also checked the two concluding assignment replies, which
  contain the earlier Test announcement/questions rather than new hardware proof.
- Assessed exact transcriptions of their retained power-field excerpts privately.
  These are explicitly labelled excerpts, not lossless originals or recreated
  packets. No absent readings, arrays, timestamps or wire bytes were reconstructed.
- Added `scripts/review-dual-ct-three-phase-evidence.mjs` for repeatable offline
  classification of expanded snapshot schemas 3/4 (including comparison wrappers).
  It outputs classifications only, never household powers, serials or raw metadata.
  It is not imported by a driver and cannot issue source qualification.
- Added five synthetic regressions distinguishing arithmetic, reported packet
  association, equal receipt ages, missing phases, decoded zero and malformed data.
  All 1,251 project tests pass, including existing production single-phase binding,
  exact-Wh restore, delivery isolation and export-retention regressions. Project
  lint, release checks and pinned Homey CLI 4.5.3 verified validation also pass.
  Read-only checks confirm Test 1.11.5/build 72, Live 1.10.3/build 18 and running
  installed Development 1.11.5 remain unchanged.

## Results from the existing evidence

| Evidence type | Result | What it cannot establish |
| --- | --- | --- |
| Older complete power snapshot | Both bank sums consistent; CT1 opposing phases; equal ages within each bank | Same payload, simultaneous measurements, current firmware or reference accuracy |
| Later pruned indexed export | CT1 incomplete; CT2 complete, consistent and associated with one reported packet | Missing CT1 phases cannot be inferred from its total or borrowed from CT2 |
| Historical native mixed-sign view and owner account | Supports signed-phase-sum power as provisional site policy | Time-aligned independent import/export interval register accuracy |
| Compact accepted-packet summary | Useful historical delivery/check summary | Packet counts do not provide duration, cadence, rejected gaps or eligible interval coverage |
| Decoded zero in old bank data | Zero exists in the decoded representation | Explicit wire zero vs omitted-zero semantics or a hardware idle transition |

Equal receipt ages are deliberately not upgraded to packet identity. Reported
packet identity is deliberately not upgraded to simultaneous hardware measurement.
Snapshot arithmetic uses decoder-equivalent float32 tolerance, which is not an
instrument accuracy threshold. No raw values or private correspondence are in Git.

## Remaining work in dependency order

1. **Source qualification:** current owned meter firmware plus existing reviewed
   wiring/phase association and site netting policy. Historical app versions do
   not identify firmware. The prepared V2 binding remains isolated; the production
   registry stays empty. No new current identity was established in these excerpts.
2. **Timing and interval accuracy:** complete CT1 vectors plus totals, usable
   receipt/order/retained/duplicate provenance and aligned independent reference
   start/end import/export registers. Report retained, eligible and rejected
   duration separately; do not infer coverage from counts or scale up missed energy.
   Reference resolution must support the chosen interval. Opposing phases are
   necessary to distinguish net-before-splitting from gross per-phase accounting.
3. **Qualified native candidate:** integrate trusted source reading/renewal and
   revocation only after its evidence/policy is reviewed. Review the exact archive,
   preservation baseline, source overlap and installation/Energy steps separately.
4. **Native recovery and soak:** approved three-phase native restore/upgrade checks,
   exact-runtime counter continuity and at least 48 hours of useful normal use.

The reviewed retained material cannot finish steps 1–4. This identifies evidence
requirements, not a request for Robert to repeat any capture. Current wiring
records or reference intervals already held elsewhere can be considered before
any narrowly justified future request. Individual mapping crops and all unrelated
attachments were not newly remeasured in this follow-up.

The planning ledger stays **eight partial / six open**, no passed gates,
`admissionAllowed: false`, no registered profile and no qualified candidate runtime.
Single-phase profiles, binding serialization, paired devices and Energy accounting
are unchanged. Software tests do not transfer owner single-phase hardware results
to the three-phase installation.

## Reproduce the offline assessment privately

After supplying a local expanded JSON snapshot, run:

```sh
node scripts/review-dual-ct-three-phase-evidence.mjs /private/path/snapshot.json
```

The tool does not repair forum typography or omitted arrays and does not accept
compact numeric-free summaries as snapshots. For the current packed comparison
format, use its existing reviewed normalization/export tests; this helper makes
no new packed-schema or live-capture claim. Invalid input fails with a generic
message, without echoing paths, data or exception text.

Related: `DUAL_CT_SOURCE_QUALIFICATION.md`,
`DUAL_CT_THREE_PHASE_EVIDENCE_REVIEW.md` and the preparation ledger.

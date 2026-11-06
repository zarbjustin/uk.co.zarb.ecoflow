# Sprint 5 - passive access baseline, 6 November 2026

## Status and source boundary

Sprint 5 has started with read-only observations, not candidate deployment or
hardware signoff. Baseline diagnostic HEAD was
`76db4ef3afb94827c085ff8b1e2062e64fe2d1e0`, clean and synchronized before edits.
Reviewed production source remains
`e8c48fea948ab3adc82c26bfd1a1db93215812aa`; this checkpoint changes docs only.
Its exact source CI passed:
[run 383](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42144534823).
The prior handover commit also passed:
[run 384](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42144835830).
This checkpoint's final SHA/CI and lease/index receipt belong outside Git.

Existing Homey API authentication works without a new login or selected-Homey
change. On 6 November at 08:38 UTC, the EcoFlow app reported version **1.11.20**
and state **running**. The passive support readback reports schema 19 and
Homey 13.5.3. These are current metadata observations, not an installed source
hash. The reviewed source intentionally retains the same package version:
**version equality does not establish that the reviewed fixes are installed**.
No exact installed-source provenance was established.

## Observations and limits

Two cached support snapshots and two device inventory reads were taken about
30 seconds apart at 08:40-08:41 UTC. App-captured timestamps use the Homey's
clock; local probe timestamps use the Mac's clock and are retained separately.
Only GET requests were used. Support reads did not request a cloud refresh,
start an observer, reconnect a socket or exercise a control.

The compared device names, data, settings, capability IDs and Energy
definitions were unchanged between reads. Ten comparable
projected meter capabilities showed no decrease. This short interval does not
prove restart/checkpoint continuity, history preservation across an upgrade,
correct integration or absence of duplicate Energy contribution.

Freshness was not uniformly healthy at the first read. Several original STREAM
fields and STREAM 5000 system/unit fields changed from unavailable/stale to
fresh by the second cached read, without an induced outage or reconnect.
One physical-unit presentation changed from last-reported standby to live;
another remained scope-unverified with linked power unverified. In the second
read, the remaining unavailable fields were original-unit optional PV/AC fields
and the scope-unverified unit's battery flow/state. These are observations to
qualify against model/accessory/native-role evidence, not confirmed defects.
The initial probe's restricted presentation whitelist rendered
`scope_unverified` as `unknown`; the offline re-projection preserves the actual
documented status without another hardware request.

Reported ES21-family unit/system records were present; no ES22-family record
was observed by the bounded classifier. Records are Homey devices, not a count
of unique physical units. Observed SOC values were numeric/nonzero; zero SOC
and missing SOC rendering were not exercised. A recent Dual CT preview with
accepted packets does not prove a valid CT1 measurement, phase qualification,
direction, inclusion in Energy or three-phase physical behaviour.

No material new defect was confirmed by this short baseline. No physical
acceptance gate was closed and neither acceptance JSON was changed.

## Bounded continuation and approval gates

1. Establish exact candidate/runtime provenance. If deployment is needed,
   obtain explicit target-specific approval first. Prefer an isolated Homey;
   updating the household app affects all its devices, not just one unit.
   Capture a fresh private identity/settings/capability/counter/Insights/Flow
   preservation baseline and identify a rollback artifact before deployment.
   These two readbacks are not a complete upgrade/rollback baseline.
2. Observe the approved candidate during normal operation and complete the
   existing [STREAM 5000 RC](STREAM_5000_MONITORING_RC.md) and acceptance JSON
   by exact runtime, model, role and topology. Compare physical unit with that
   unit, and system totals with the verified system membership. Do not copy
   aggregate power into physical-unit acceptance. Do not force a discharge
   to zero, change battery tasks/reserves or fabricate missing measurements.
3. Use an owner-attended native EcoFlow display comparison where needed.
   Native app/UI access has not been established here; Homey API access does
   not establish direct native-app or EcoFlow developer-API access. Keep
   credentials, original images and raw readbacks local.
4. Qualify Dual CT against [its RC](DUAL_CT_ENERGY_RC.md) and existing ledger.
   Confirm current phase/CT binding and native role, rather than promoting
   historical single-phase observations to current or three-phase acceptance.
   Energy adoption/activation and tester contact remain separately gated.
5. Continue the documented normal-use soak only after provenance is known.
   Restart, forced reconnect/silence, pairing/Repair, configuration changes,
   control tests and any deployment require their own explicit scoped approval.
   None was performed or scheduled by this baseline.

## Evidence, checks and handover

Local evidence directory, outside the public repository:
`../work/output/copilot-bug-bash-2026-11-06/sprint-5/`.
Start with its `HANDOVER.md`, `access-baseline.json`, `read-only-baseline.json`
and `read-only-field-status.json`. Raw support/device captures remain in its
restricted `private/` directory; do not upload, index or expose them to remote
models. The deterministic local projection emits only allowlisted metadata
and health categories, never names, IDs, credentials or household readings.

Coordinator: remote Copilot `gpt-6.1-sol`; this is not local inference.
No new independent hardware review is claimed. Sprints 1-4 used actual
`gpt-6-sol`, `gpt-6-astra`, `mai-code-2` reviews; the exact MAI preview mapping
remains unattested. Trusted-local semantic review of private history remains
blocked and no historical coverage claim has been expanded.

Checks performed: local probe syntax check, successful authenticated read-only
API execution, deterministic offline re-projection, clean baseline/fetch and
diff inspection. Local lint, release-boundary/acceptance consistency checks,
staged diff whitespace check and an added-text private-identifier gate passed.
Production source did not change; the previous 1,437-test
result is dated source evidence, not a new local run or hardware result.
Native comparison, candidate deployment, ES22, zero/missing SOC, controlled
restart/reconnect, upgrade preservation, prolonged soak and three-phase
physical acceptance are **NOT RUN**.

No installation, publication, restart, settings/Flow/Energy/control mutation,
Mainline merge or external tester message occurred. Test/Live and household
automation were not changed. The final docs commit's exact CI, source sync,
knowledge refresh and lease release are recorded in the external receipt.

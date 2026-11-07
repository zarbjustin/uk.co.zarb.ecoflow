# Development1.11.23 delivery and Dual CT diagnosis — 7 November2026

## Outcome

**Committed/pushed1.11.23, exact CI passed, installed once non-clean on Justin's
Homey Pro. Preservation passed; diagnostics identify the false-overlap cause.**
Dual CT remains unavailable/reconnecting pending a reviewed corrective candidate.
No guard bypass, rollback or additional installation occurred.

Source: `e9fef96ac5e2c5690246b7c5996fb76ccf3b8326`, diagnostic branch.
[Exact CI success](https://github.com/zarbjustin/uk.co.zarb.ecoflow/actions/runs/42381892040): tests, lint, structural release checks,
audit and pinned Homey4.5.3 verified validation. Prior local1,529-test/package
receipts match the reviewed runtime. Git was clean/synced before deployment.
Only reviewed source/tests/sanitized records were committed; no private originals.

Archive SHA-256:
`60f77156be874d8352f94ac4913a15c3e38eea7733e90c1760d6c0145e053659`.
Runtime-source fingerprint:
`726847ed24b81e82a70c3fdd91d255242bce6bf536032ea0729902247275e7e6`.
Delivery acknowledgement: 2026-11-07T14:33:07.005Z; clean=false/debug=false. Two complete
readbacks confirm1.11.23/running/devkit_install with geolocation only. This proves
reviewed artifact delivery; no independent installed-filesystem hash is claimed.

## Fresh safety and preservation

Preflight passed at14:32:27UTC: both Homey execution switches disabled; reviewed
historical fault retained; empty intent/no active run lock/stopping state; completed
fault-free native reserve lease; reviewed resident runner and no competing inline
reserve writer. Fresh native configuration is intelligent_plus with empty tasks.
Checkpoints were quiescent/failure-free; no forced write or reconnect was needed.

Private baseline:15 EcoFlow identities,101 complete Flows,1217 Insights identities,
ten numeric cumulative totals,full definitions/settings/options/titles/Energy and
global setting hashes. A separate authenticated full-Homey role review confirms
only existing Dual CT included as a property source; Office original meter and
external cumulative meter excluded. Role/safety checks repeated just before delivery.

Reviewed1.11.23, prior1.11.22 and last known working1.11.21 archives all matched
recorded hashes. No checkpoint/binding schema migration. Prior1.11.22 carries
this known outage;1.11.21 restores broad API access. Artifact availability is not
an automatic rollback approval or independently proven complete Homey restore.
No new USB/cloud backup or complete private-store export was performed.

Observer 2026-11-07T14:32:55.147Z–2026-11-07T14:34:55.543Z: 102 cached inventory
samples,minimum1second interval,zero numeric decreases/read errors/throttling.
Five transient unknown-counter samples occurred; all ten counters returned.
Window spans delivery and is not two full minutes after acknowledgement. It does
not exclude shorter unseen events or establish physical energy accuracy.

Full readbacks 2026-11-07T14:35:16.768Z and 2026-11-07T14:36:35.263Z retain:

- All15 EcoFlow identities and all household device IDs.
- Settings,capabilities/options/custom titles,notes/zones and Energy definitions.
- All101 complete Flows,no new broken Flow,and1217 Insights log identities.
- Global app settings,execution config/state,native lease and app gate.
- Ten comparable cumulative totals,no decreases/new unknown totals.
- Native configuration values/fresh AI mode/empty tasks and disabled Homey execution.

Fourteen generated capability icon URLs differ; other compared definition fields
match. Phone rendering and independent precise per-device-store checksum were not
revalidated. One read-only verification began before the observer result existed;
it stopped without mutation. Its receipt is retained; no duplicate install ran.
Completed readbacks above followed observer completion.

## Confirmed false-overlap diagnosis

Both schema20 reports (2026-11-07T14:35:16.768Z and 2026-11-07T14:36:35.263Z) show:

- Owned SDK scan complete,15 devices,two cumulative meters,two treated as included.
- Both original Smart Meter and Dual CT return SDK energy_exclude and
  energy_cumulative_include as **unset** through the getSettings path.
- Single-phase Energy startup reaches admission,then blocks on grid_source_overlap;
  retryScheduled=true,active=false. Source/firmware lookup and binding stages passed.
- Dual CT power unknown/unavailable; both cumulative totals still numeric.

At the same time the separate Homey Web API baseline explicitly shows the Office
meter energy_exclude=true and energy_cumulative_include=false,while Dual CT is
included. Full settings preservation confirms these flags did not change across
delivery. Thus SDK omission is not evidence that the Office meter is included.

The code in lib/dualCtHomeyEnergyContext.ts permits undefined flags and evaluates
`settings.energy_exclude !== true && settings.energy_cumulative_include !== false`
as contributing. Runtime classifier excludes the exact own Dual CT identity,
leaving the excluded Office meter falsely classified as a competing grid source.
That triggers the observed admission/recovery cycle. The scan's complete flag
currently overstates known Energy-role visibility.

A deterministic synthetic reproduction using compiled1.11.23 confirms:
identical original-meter/own-Dual-CT rows with SDK flags absent -> grid_source_overlap;
with independently known excluded Office flags -> prepared_not_activated. No writes,
private identifiers or live qualification were used. Receipt:
MISSING_ENERGY_FLAGS_REPRODUCTION.json. This identifies this household's cause;
it does not diagnose Robert's older outages or all firmware/topology combinations.

This supersedes the previous unresolved-root-cause finding. The separate array-
settings validation defect fixed in1.11.23 is not the cause observed here.

## Corrective direction for review — not applied

Absent SDK Energy flags must be represented as unknown,not silently included or
excluded. Do not restore broad API permission,disable overlap checks or remove/
re-pair the meter to manufacture availability. The SDK-only automatic guard cannot
claim to know Homey-managed inclusion flags that this runtime does not expose.

Prepare a narrow source fix with explicit reviewed meter roles when SDK inclusion
is unknown: whole-property source versus Office/subcircuit meter,with unknown and
conflict handling. Preserve stored source/counter bindings and Homey Energy/device
settings. Verify any alternative getter against a supported contract before relying
on it. Review the manual-role responsibility honestly: automatic EcoFlow-owned
inclusion checking promised for1.11.22 cannot be guaranteed by current SDK flags.
New role acknowledgement/settings,an additional candidate installation or any
rollback need separate review/approval. No implementation or policy change beyond
the already reviewed1.11.23 was made after receiving these diagnostics.

Regression coverage should reproduce missing-SDK/present-Web-API flags,excluded
Office versus true competing whole-home meter,unknown roles,duplicate source
claims,identity/configuration drift,and single-/three-phase counter/freshness
continuity. Do not treat missing flags as a blanket no-overlap result.

## Unchanged boundaries

Authenticated store before/after:Test1.11.21/build88 and Live1.10.3/build18.
Mainline unchanged. No battery reserve/limit/mode/task,Energy inclusion,Flow execution,
pairing/Repair,forced silence/reconnect,publication or tester contact. EcoFlow AI
remains in charge; both Homey reserve execution switches remain off. The only
household mutation was the approved single non-clean Development installation.

No physical acceptance gate closed,no ledger weakened,no48hsoak begun. Full
release remains NO-GO. Existing linked5000 physical scope and pre-existing micro
availability limits remain distinct from this diagnosed Dual CT regression.

Private evidence/receipt:
../work/output/development-1.11.23-20261107T1440Z/FINAL_RECEIPT.md.
Public source/sanitized projections only in Codex remote context; raw captures,
credentials and original private histories/images remain local outside Git.
Post-delivery report/checkpoint edits are uncommitted; production source remains
the pushed e9fef96. Shared knowledge refresh/lease result is in the local receipt.

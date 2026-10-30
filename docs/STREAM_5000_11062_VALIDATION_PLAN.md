# Development 1.10.62 battery validation plan — owner review

Status: **proposed; no physical test, setting change, restart or soak authorised
by this document or started by preparing it**. Prepared 29 October 2026. Test,
Live and Mainline remain unchanged. Start/end times are deliberately unset.

## Candidate and scope

Use the already installed Development 1.10.62 only. Implementation b31eacb;
exact implementation CI 40969235537 passed. Archive-provenance fingerprint:
`31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`.
This is not an independent hash of installed files. Read back version/running
state and confirm no intervening installation before execution.

Qualify the owner's standalone **ES21 STREAM 5000** physical monitor and its
existing installation Home Battery Energy contributor. No directly connected PV
was present at the last owner confirmation; reconfirm topology before testing.
Original STREAM batteries remain a separate office installation; its microinverter
is in a separate EcoFlow space. CT1 measures the whole property including the
office/shed; CT2 is disconnected. The downstream office Smart Meter is not an
independent whole-house battery-energy reference.

Latest installed readback preserved 13 EcoFlow devices, 99 complete Flows, 1201
Insights log identities and Energy configuration across 276 Homey devices. These
are historical comparison counts, not a newly collected execution baseline.
Fresh 0 W/idle and subsequently received 0% SOC were observed on this candidate.
Nonzero energy, native comparison and recovery remain unqualified. The successful
27 October charge/discharge test was on a different runtime and role.

## Changes presented for review

| Action | Proposed change | Boundary |
| --- | --- | --- |
| Charge | One native EcoFlow charging task, target 500 W; attended stop after at most ten minutes of charging | Requires fresh approval of the actual device, native task form, absolute window and stop route |
| Task-editor fallback | If only half-hour windows remain available: one non-repeating 30-minute window, manual stop by start + ten minutes | Separate explicit acceptance of the full fallback window; not a ten-minute hardware cutoff |
| Discharge | Observe ordinary self-powered operation after the temporary task is removed | No discharge task, added load, outlet, export or mode/limit change proposed |
| Recovery | Observe natural expiry and subsequent reports | No forced silence, reconnect, network or hardware change |
| Optional restart | One app restart at idle after task cleanup, followed by read-only preservation checks | Separate fresh restart approval; not included in charge approval |
| Soak | Private read-only observation for 48 hours after short tests and restoration | Start separately agreed; this plan creates no monitor or schedule |

Keep reserve, SOC limits, operating mode, global grid-input/output limits, socket
settings, existing controls, Energy permissions, meter selection and pairing gate
unchanged. Do not lower a reserve or SOC floor to force discharge. If the native
charge form requires a different mode or any additional change, stop and present
that exact difference before saving. Never use the global grid-draw setting as a
substitute for a task's charging-power setting.

EcoFlow's [official STREAM FAQ](https://eu.ecoflow.com/collections/all-products_for-coupon/products/stream-series-solar-battery)
describes charging through a custom task. It does not establish the owner's
current firmware editor granularity or a ten-minute cutoff. The previous owner's
native editor only offered minute 00/30. Inspect the current form without saving;
never silently substitute the fallback schedule. The official manual was not
accessible through the research tool; no current task-editor guarantee is claimed.

## 1. Preflight and private baseline — read-only

1. Confirm installed candidate, app running/enabled, clocks/timezone and no
   concurrent deployment, native relinking, firmware upgrade or Energy migration.
2. Match native House battery to both existing Homey roles using full identities
   privately. Reconfirm ES21, firmware, single-unit membership, no direct PV and
   no new peer. Singleton telemetry is not independent membership proof.
3. Read native battery SOC, battery watts and state, warnings, mode, reserve,
   SOC/grid/socket limits and task list. Record field ages and the measurement
   plane. Do not substitute grid/import watts for battery watts. Zero SOC is
   valid; an absent SOC/state is unknown. Fresh temperature does not renew power.
4. Capture a new private preservation baseline: identities/data/settings,
   capability/custom metadata, complete Flows and broken status, Insights IDs,
   app-setting hashes, all Energy declarations/settings and comparable cumulative
   counters. Keep existing installation evidence immutable. Inspect relevant
   automation/schedules read-only; do not disable them. If another controller may
   conflict, postpone or obtain a separately reviewed coordination change.
5. Verify the owner is present with working native access and a verified native
   cancel/stop route, plus an independent timer. Inspect the task form read-only.
   No existing task may be overwritten; if tasks are present, revise the plan.
   A stored power limit is not proof of the circuit's permitted charging load.
6. Observe five minutes of baseline. Capture paired native/Homey readings and
   freshness; confirm no unexpected counter decrease or duplicate contributor.
   Unknown membership, conflicting tasks, native warning, stale nonzero readings
   or unavailable stop access blocks the charge step.

Keep raw readings, screenshots, full identifiers and household information in a
private local evidence folder outside Git. Public records contain only sanitised
findings with exact candidate/model/role and time bounds.

## 2. Attended charge — approval required before saving

Prefer a genuinely bounded ten-minute native task **only if the current form
supports it**. Otherwise review one explicit 30-minute window, one occurrence,
no repeat, 500 W target, owner-operated cancellation by start + ten minutes.
Approve an absolute local date/time plus UTC equivalent, including any date
rollover, before saving. Read back device, power, repeat policy and start/end.

At 500 W, ten minutes represents about 83 Wh at that power's measurement plane;
a full 30-minute fallback represents about 250 Wh. These are estimates, not hard
energy caps or usable-capacity measurements. The 30-minute end remains the
fallback if manual cancellation fails. Do not proceed unless the owner accepts
that exposure and the native stop route has been verified. If the editor cannot
express the approved parameters, cancel its draft and stop.

During the attended window, record cached Homey telemetry approximately every
five seconds, without extra EcoFlow polling or reconnects. Capture near-time
native readings at onset, steady charge, before stop and after stop. Record UI
opening times because opening EcoFlow may affect report cadence.

Pass requires fresh nonzero battery charging readings on native and Homey,
positive charging watts/state, physical-monitor versus aggregate agreement within their
verified measurement scopes, charged-counter increase and no opposite-direction
integration outside zero/deadband noise. Missing reports are not zero. Observe
SOC independently; a short 83 Wh interval may be hidden by percentage rounding.

Stop early using the approved native route for any native warning, owner concern,
wrong task/device/repeat policy, conflict with other operations, power exceeding
the verified task limit, stale battery power beyond its three-minute validity,
unexpected counter decrease, contributor overlap or unrelated settings change.
Do not diagnose a significant mismatch by increasing charging power or duration.

Cancel the temporary task at the agreed deadline; verify its removal and fresh
non-charging state. If cancellation or stop confirmation fails, the owner uses
the pre-agreed native stop route immediately; do not improvise unplugging,
network disconnection, battery reset or an unapproved mode/limit change.

## 3. Natural discharge and interval accounting

With the task removed and original settings confirmed, observe up to ten minutes
of normal discharge into existing household demand. No forced export or added
load. Stop the observation at the normal SOC floor or any warning. If there is
insufficient stored energy/demand or normal settings prevent discharge, record
pending; a different charging budget requires review rather than extending this
window silently. Task removal may return to ordinary self-powered behaviour;
verify the actual native state rather than assuming it.

Pass requires fresh native discharge and matching negative Homey battery watts/state, discharged
counter increase, no charged-counter increase during sustained discharge, and
unchanged contributor boundaries. Do not infer physical energy delivery from
an API setting or the office/whole-property grid difference.

Before either interval, declare measurement planes, units, time alignment and
reference resolution. Target native/Homey samples within five seconds; pairs
more than ten seconds apart are not point-comparison evidence. Proposed
steady-state battery-power tolerance is max(20 W, 5% of native battery watts),
only for the same measurement plane and stable readings; disclose rounding and
retain mismatches. This is a test criterion, not a manufacturer accuracy claim.

For independent interval-energy accuracy, require a native battery-energy
counter or other already available reference measuring the same plane/window.
Set tolerance before the run from its stated resolution/accuracy and measured
boundary timing. If either is unknown, or the interval is too small to resolve,
leave energy accuracy pending; do not invent a generic percentage pass. Integrating
Homey's own watts against its counters checks internal consistency only. AC
input energy, daily household totals and battery DC energy are not interchangeable.
This short test cannot validate full usable capacity or charge efficiency.

## 4. Freshness and recovery

Start only after temporary-task cleanup and fresh restoration readback.

- First seek a natural gap: record the last genuine battery-power receipt and
  independent temperature receipts. Physical numeric battery readings must
  expire after three minutes, within the next five-second local expiry tick
  (record SDK observation latency separately). A continuing battery report
  restarts that field's clock and prevents an expiry result; mark unobserved.
- Keep physical and aggregate deadlines separate: the aggregate has a one-minute
  availability watchdog, not the physical five-second expiry timer. Its energy
  integration must not bridge a power gap exceeding three minutes. Record the
  actual aggregate presentation delay; do not claim a physical-tile timing pass
  for the Energy role or quietly accept an unmet release requirement.
- Last-reported standby is a labelled hint, never fresh numeric zero or a power
  timestamp renewal. Check its documented retention limit (at most 20 minutes,
  also bounded by connection settings), if naturally observable. No deliberate
  silence solely to obtain this observation without separate approval.
- On genuine recovery, require real received SOC/power/state with individual
  ages, no invented data/outage energy, counters nondecreasing, and independent
  unit/aggregate recovery. Fresh temperature alone cannot pass recovery.
- Optional, separately approved: one app restart while idle and with no temporary
  task active. Capture counters/settings first; observe for ten minutes without
  a second automatic restart. Verify subscription recovery, first fresh power
  anchor without outage backfill, original aggregate reporter resolution and
  full preservation readback. Mark missing observations pending.

No forced reconnect, credential revocation, router change, physical relink or
rollback is included. A rollback drill needs a separately reviewed compatible
archive and preservation/restore procedure; merely reinstalling an old archive
is not a safe counter/store rollback plan. Natural recovery and restart recovery
are different evidence and cannot stand in for one another.

## 5. Restoration and 48-hour soak

Confirm task list and every setting match preflight, with fresh non-charging
readback and a final preservation/counter comparison. Any unrelated owner edit
must be identified rather than silently restored. No manual counter rewrite.
Do not start the qualifying soak with an unresolved short-test defect; an
unobserved natural-expiry gate can remain explicitly pending during the soak.

Agree T0 only after restoration and a frozen candidate/topology. End is T0 +
48 hours, using UTC elapsed time; no start or completion is claimed yet.
A proposed private cached-read collector samples once per minute (about 2,880
samples), recording field age/status, SOC, power/state, charged/discharged meters,
source/scope, app availability, accepted samples, subscription/reconnect counts
and existing error/resource metrics where exposed. Do not enable extra diagnostic
payload capture, timers, controls or active EcoFlow polling. Keep the observation
host awake and record collector clock/coverage gaps.

Review at T0, +12, +24, +36 and +48 hours, plus observed natural transitions.
Compare native readings at T0, +24 and +48 and at available charge/discharge
transitions; log native-app opening. Check all original units, office aggregate,
Smart Meter, Dual CT monitor, microinverter and daily-history tiles for regression.
Repeat full preservation comparison at +24/+48; legitimate owner changes need
explicit attribution. Counters must remain monotonic, including across naturally
occurring communication gaps; gaps must not create fabricated energy.

A 48-hour period spent entirely at 0%/idle establishes idle stability only.
Require meaningful nonzero charging and discharging observations across the
combined short-test/soak evidence, and record which states actually occurred
inside the soak. If ordinary use cannot exercise these states, normal-use coverage
remains partial. A proposed attended repeat of the same bounded charge near
+24 hours can be included in the owner's later approval packet with exact times
and restoration; no additional task is approved or scheduled here. A reviewed
planned test window is recorded explicitly rather than hidden as ordinary use.

Acceptance: 48 hours on the same fingerprint/configuration, at least 99% planned
collector coverage and no unexplained gap over five minutes; no unresolved
crash, subscription leak, persistent unavailable/stale behaviour, field freezing,
source overlap, unexpected settings/identity/Flow/Insights changes or counter
rollback. Missing resource metrics are disclosed, not assumed healthy. A
recovering connection must show honest field ages and no stale integration.
A crash, unplanned deployment, unplanned topology/settings change or material defect stops
qualification for review; fixes need a newly attributed candidate and a new soak.
Do not hide loss of coverage or count an unobserved period as a pass.

## Review and release decision

Record each outcome as passed, failed or unobserved for this exact runtime/model/
role, with private evidence references. Do not promote ledger gates from this plan.
No extension from ES21 to ES22, expansion packs, linked systems or direct PV;
no repeated community capture request without a specific need and owner approval.

A successful run supports this ES21 monitoring/Energy contributor only. Dual CT
Energy qualification, grid-source migration, other model/role coverage, account
Repair/upgrade/pairing requirements and rollback remain separate gates. Removing
the pairing checkbox or changing Energy/runtime code changes the candidate;
reassess affected tests and run the final-candidate soak before full release.
Store promotion requires a subsequent explicit review/approval. Neither planning
nor a successful soak publishes Test or Live.

Next approval packet: fresh preflight differences, exact native task screenshot/
parameters and date/time, chosen cutoff variant, stop/restoration route and any
separate restart request. The owner reviews these before any battery write.

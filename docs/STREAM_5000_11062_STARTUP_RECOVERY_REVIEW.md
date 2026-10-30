# 1.10.62 startup sample investigation and recovery review

Prepared **30 October 2026**. Status: investigation/read-only observation only.
**No restart, new battery task/setting, install, publication or soak is approved
or performed by this document.** Test, Live and Mainline remain unchanged.

## Candidate and evidence boundary

Already installed Development 1.10.62, implementation b31eacb, archive-provenance
fingerprint `31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`.
No installed-filesystem rehash is claimed. The diagnostic branch was fetched and
is 0/0 against its remote; previous uncommitted validation records are preserved.
No runtime code, version, pairing gate or Energy source is changed here.

Reviewed the private charge-run support snapshots, source decoder/mapper,
serialized application/accounting path, native comparisons, private action times,
and existing lifecycle/recovery tests. Snapshot cadence was roughly five seconds;
**original MQTT bytes for the 575 W incident were not captured**. Diagnostic fields
have independent receipt ages rounded to seconds, not verified device timestamps.
No simultaneous native battery reading exists at the peak. These gaps prevent a
claim that a particular raw packet or the physical battery reached exactly 575 W.

## Startup finding

At **23:33:37.773 UTC**, sampled battery power was 77 W; at **23:33:42.978**, 575 W;
at **23:33:48.190**, 499 W. The 575 W value appears once in the captured snapshots,
not necessarily once in the underlying packet stream. Steady charging subsequently
stayed 493–502 W; native/Homey comparison points agreed, SOC rose 0–4% and internal
charged energy ended near 219.4 Wh. Preserve the outlier rather than clipping it.

| Question | Finding |
| --- | --- |
| Was household load added to the battery reading? | No. The same observed flow has grid-to-battery 575 W and zero other battery inflows/outflows; signed battery flow is therefore 575 W. Grid import is calculated separately. |
| Was half-watt scaling applied twice? | No. The flow edge f12.7 uses scale 1. The separate f54.1.4 unit-record diagnostic uses half-watt scaling once. Both cached paths reported 575 W, but are not independent physical meters. |
| Did a REST response race newer MQTT? | This 5000 lifecycle subscribes to app-auth telemetry and does not poll Developer/Open REST for these readings. The original STREAM REST/MQTT reconciler is a different path. |
| Was old peer power summed in? | No peer was observed. Parser calls use a fresh per-frame accumulator and filter other addressed headers. Mapping does not add the unit diagnostic to the flow-derived power. |
| Was a stale value simply replayed as fresh? | At the sampled peak, both relevant diagnostic values had age zero and the accepted-sample count advanced. This supports recent decoded observations, but does not supply missing packet/device timestamps. |
| Did the counter jump/reset or count both Homey roles? | No. Only the aggregate accounts energy; the physical monitor contributes none. Precise charged energy advanced about 0.721 Wh in the adjacent five-second snapshot interval, with no counter reset or reconnect. This is not a measurement of the peak's physical duration. |

The linked-meter and flow records had a one-second receipt-age difference at the
peak; their grid-flow residual was -79 W. A grid-minus-house estimate was about
496 W while the battery flow/unit diagnostics showed 575 W. Receipt alignment is
not simultaneous physical sampling, nor are AC input and battery-side readings
necessarily the same plane. Do not call that residual a loss, use it to overwrite
battery watts, or treat it as proof of firmware enforcement failure.

Synthetic, privately encoded example checks reproduce the decoder's scale and
separation, later-frame replacement, other-address filtering, absent-flow delta
handling and duplicate-time/oversized-gap accounting. They are software checks,
not a replay of missing original incident bytes. Existing lifecycle tests cover
startup persistence, rejected/stale power, three-minute gap re-anchoring and local
physical expiry.

**Conclusion: no confirmed Homey runtime defect is established.** The most useful
classification is an unresolved startup telemetry/measurement transient, with
upstream ramping and differing sampling/smoothing as hypotheses. It does not
invalidate the witnessed stable charge/discharge reporting points. It does not
qualify power-limit enforcement or absolute energy accuracy. No runtime change,
clamp, smoothing filter or repeated charging capture is recommended just to remove
this isolated observation. If it recurs or is sustained, pause qualification and
review synchronised same-plane evidence before another hardware operation.

## Natural-gap evidence found during this investigation

At **00:13:04 UTC**, fresh read-only diagnostics still show running 1.10.62,
Self-powered, empty tasks and preserved definitions/counters. The aggregate now
reports **one ignored energy gap**, zero resets and zero reconnects. Previously
it reported no ignored gap. Existing five-second Insights history shows the
projected discharged counter flat at **77 Wh from 00:06:55 to 00:10:45**, then
increasing again. This supports skipped accounting across a natural reporting gap.

Insights also carries/interpolates power values through that period. Consequently
its chart is not proof that the tile remained live, cleared on time, or recovered
within a five-second local tick. No diagnostic poll captured that earlier gap's
receipt/expiry boundary. The aggregate measure_power log was not present in the
retrieved Insights inventory; the existing physical power and both energy logs
were inspected. This is partial natural-gap/accounting evidence, not full recovery
acceptance. The original charge collector had stopped before this gap.

A bounded six-minute observation using only cached support snapshots was also
prepared to look for a natural expiry; no native-app navigation, packet-capture
flag, forced silence or reconnect is used. It completed at 00:23:16 UTC with 343 samples, fresh 0 W/live throughout,
maximum physical-power age three seconds and no expiry. The checkpoint was clean,
mode Self-powered and tasks empty. Its result is recorded in the newest
STATUS/monitoring RC checkpoint. If fresh reports prevent expiry, record
unobserved rather than a pass. No monitoring continues beyond that bounded check.

## Recommended recovery operation — requires owner approval

**One graceful restart of this EcoFlow Development app only**, after fresh idle
preflight. The operation would be `apps.restartApp({ id: 'uk.co.zarb.ecoflow' })`
(POST /app/uk.co.zarb.ecoflow/restart). **It has not been called.** No hub reboot,
stop/start sequence, reinstall, Repair, re-pair, forced battery/network silence,
extra session or battery command is proposed. It briefly interrupts readings for
all EcoFlow devices, not only the 5000. No battery settings change is needed.

1. Agree an attended execution window after review. Reconfirm candidate version,
   archive attribution and no intervening installation or native relinking.
   Read native/Homey battery state without changing it; require fresh zero/idle
   readings in both roles on two readbacks at least fifteen seconds apart.
   Missing power or SOC remains unknown, never inferred zero. If normal operation
   is nonzero, postpone this idle case; do not force idle or alter SOC/reserve.
2. Refresh the private full preservation baseline: all EcoFlow IDs/data/settings,
   capabilities/custom metadata, full Flows and broken status, Insights IDs,
   app-setting hashes, all Energy definitions and cumulative counters. Record
   precise aggregate diagnostic totals as well as rounded projected kWh, reading
   ages, source/scope, original main resolution and connection diagnostics.
   Historical counts 13/99/1201 are comparison context, not a substitute for this
   new baseline. Inspect relevant schedules/automations read-only and avoid an
   owner-critical operation window; do not disable or execute Flows.
3. Confirm Self-powered, empty 5000 tasks, unchanged limits/reserve/socket and
   original meter/Energy configuration. Require the idle 5000 energy checkpoint
   pending=false, writing=false, failures=0 on fresh readback. Record other exposed
   checkpoint failures and current activity. An active task, write failure,
   conflicting automation, unexpected identity/setting change or unavailable
   local owner access blocks execution pending review.
4. Invoke the single app restart once and record request/return times. If the
   response is uncertain, poll running state read-only; never send a second
   restart automatically. No other device/settings write is part of recovery.
5. Observe cached telemetry every two seconds initially, then every five seconds,
   for up to ten minutes. Readback must show version 1.10.62 running; numeric SOC,
   power/state and configuration must await their own real receipts. Startup
   unknowns are expected. The last-reported standby hint must not carry across
   the session or revive numeric zero. A missing SOC immediately after restart
   is not a failure by itself; retain its receipt timing separately from power.
6. Both existing 5000 roles must receive fresh correctly scoped power/state and
   SOC, with one Energy contributor, no unit accounting, no subscription growth
   or unexplained retries, and unchanged original main/member reporter binding.
   Capture the first two accepted power samples and precise counters. The first
   fresh sample must anchor without outage backfill; cumulative meters must not
   fall, even briefly. Compare actual pre/post totals, not only graph appearance.
7. Repeat full preservation/readback immediately on recovery and two minutes
   later. Allow only explicitly understood live readings/session counters to
   change; startup samples/attempt counts naturally restart, lifetime kWh must
   not. Document owner edits separately; do not silently revert them. Require
   checkpoint failures=0 and successful normal persistence. No counter rewrite.
8. Stop for review if the app does not recover within ten minutes, fields remain
   unverified, counters fall/jump, wrong scope/duplicate source appears, definitions
   change unexpectedly or native warnings occur. Preserve evidence. Do not
   automatically retry, roll back, re-pair, change network/credentials/settings,
   force charge/discharge or execute a Flow to obtain a pass. The owner retains
   native operation; no new charging task has been left running by this plan.

An idle restart cannot physically prove nonzero-outage energy accuracy: integrating
zero over an outage would also yield zero. Existing nonzero natural-gap evidence
and software tests remain separate. If the release gate needs a nonzero restart,
prepare that as an **alternative single restart**, with fresh review of the
operating point. With no direct PV and an empty battery, any extra charging task
needed to create that point needs its own exact date/window/power/stop approval.
No repeat charge, full battery cycle or forced outage is included here.

## Natural freshness test and bridge to the soak

During independently authorised read-only observation, record genuine field
receipts and applied values, not merely Homey's unchanged-value lastUpdated.
If a natural battery gap occurs, physical watts/state must clear after 180 seconds
within the next five-second local expiry tick. Bound timing using receipt-age
rounding, request duration and observation interval; if those do not distinguish
the deadline, leave timing inconclusive. Fresh temperature cannot renew battery
power. The aggregate uses a sixty-second watchdog; assess its presentation cadence
separately. It must not integrate a power gap over three minutes. A standby hint
is labelled last-reported and bounded by its own retention/connection settings.
Fresh receipts must recover both roles without counter rollback or gap backfill.
No natural gap means this test remains unobserved. Do not manufacture silence.

After the approved restart/readback is reviewed and any confirmed defect is fixed,
agree **T0** for the 48-hour soak on a frozen fingerprint/topology. No soak is
started or scheduled by this preparation. Use the existing reviewed 48-hour plan,
with private coverage/error/counter evidence and no extra vendor polling. An
all-idle period proves idle stability, not unobserved charging/discharging,
nonzero restart, PV, expansion packs or absolute kWh accuracy. Preserve each gate's
actual scope; unobserved natural expiry may be tracked during the soak, not marked
passed in advance. Any runtime/Energy code change needs final-candidate retesting.
Dual CT Energy and ES22/other-role gates remain separate release requirements.

**For review:** the recommended next operation is one idle app restart with the
above preconditions and read-only checks, with **no battery changes**. Approval
must identify this operation; earlier charge/installation approvals do not carry
forward. Keep Test, Live and Mainline unchanged.

Validation: committed-lockfile dependencies on Node 22; all 1177 tests, lint,
release-boundary/ledger and diff checks pass. Seven synthetic example checks pass.
Runtime fingerprint is unchanged; no new build/CI/publication is claimed.

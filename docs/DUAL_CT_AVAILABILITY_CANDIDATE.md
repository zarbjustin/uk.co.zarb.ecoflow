# Dual CT availability fix — combined 1.11.7 review candidate

30 October 2026. Includes the display-settings work described in
`DUAL_CT_DISPLAY_CANDIDATE.md`. Source/archive preparation only; no installation,
restart, publication, Energy setting or counter rewrite.

## Observed issue

Read-only sampling of the installed Development app captured brief unavailable
states labelled “Updating CT1 readings”, followed by normal readings. Native
cumulative counters did not decrease during that observation. The widget itself
was not instrumented; its reported “No response” is consistent with these native
availability transitions, rather than proof of a sustained outage.

The adapter previously marked the device unavailable before every projection.
If a newer checkpoint arrived during SDK writes, it cleared power and deferred
catch-up to the next tick. Those paths could interrupt an otherwise healthy meter.
No raw household readings or private diagnostics are included in this document.

## Change

Healthy projections retain availability while sequential SDK writes publish only
committed counter values. Every asynchronous boundary still rechecks source,
consent and runtime authority. A superseded projection retries against the latest
complete checkpoint in the same refresh, with at most three attempts. Continuous
traffic cannot cause an unbounded retry loop; the next normal tick catches up.

The last successfully projected power has its own deadline, derived from the
accepted receipt/measurement window. Routine ticks never extend it. Fresh incoming
data cannot extend the deadline of an older power value blocked behind SDK IO.
The local tick checks expiry outside the serialized projection queue and issues a
coalesced unavailable/power-clear operation. That operation never writes cumulative
totals or checkpoints. This avoids hiding real expiry behind a slow UI write.

After an urgent clear, the adapter republishes a coherent fresh projection before
restoring availability. Late power-write/setAvailable callbacks are rechecked and
cleared if stale or revoked. Failed clears retain their retry flag. Startup,
stale/partial power, source withdrawal, projection/storage failure and shutdown
continue to clear power or show unavailable as appropriate. A genuine stale interval
remains unknown, rather than zero. Recovery anchors the first new sample without
filling downtime.

The source-delivery guard, five-second threshold, sequence/retained/duplicate and
clock checks, existing reconnect policy, accounting mathematics, bindings,
checkpoint format/checksum, exact Wh precision and native kWh rounding are unchanged.
Counter commits remain independent of the SDK projection queue. Existing display
settings and optional CT2 work remain in this candidate; they do not alter accounting.

## Regression evidence

Locked Node 22 install, all 1,279 project tests, lint, release checks and pinned
Homey CLI 4.5.3 verified validation pass. Full hardware readiness remains blocked.
Added/updated adapter coverage exercises:

- Routine ticks and changing power with no unavailable/null-power flicker.
- A checkpoint committed during a stalled SDK write, followed by immediate coherent
  catch-up, exact internal precision and monotonic native totals.
- Exact five-second expiry, retained counters and recovery without gap backfill.
- Expiry during a stalled counter write, even while new source packets remain fresh.
- Late power/setAvailable completion after expiry, and a clear landing immediately
  after a power write; neither may restore availability with cleared/stale power.
- Bounded continuous supersession, coalesced ticks and failed-clear retries.
- Existing consent/runtime withdrawal, SDK failures, close/late callbacks and CT2
  isolation cases continue to pass.

SDK requests already in flight cannot be cancelled by this adapter. Invalidation
is best effort while the SDK is unavailable; failed calls are retried and late
completions are rechecked. A stalled native SDK and actual widget/client caching
still require native validation, not a claim based on synthetic promises.

## Review and deployment boundary

The combined archive supersedes the earlier display-only 1.11.7 review archive;
use the newest build manifest's source commit and SHA-256 when reviewing deployment.
Test, Live and installed Development remain unchanged. Any installation needs fresh
approval, private preservation baseline/readback and native widget/mobile/desktop
checks. Observe fresh power/counter continuity and genuine stale warnings without
forcing silence/reconnect or altering battery settings. Existing three-phase field,
reference-accuracy and soak gates remain open.

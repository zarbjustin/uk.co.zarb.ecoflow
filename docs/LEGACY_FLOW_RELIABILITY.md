# Legacy Flow reliability and wording — diagnostic-only increment

17 October 2026. Local/uncommitted/unpublished on the diagnostic branch.
Preserves the earlier advisory/source-workspace/Flow-observation work. No new
Flow card, action, driver, permission, Energy source or charging command is
introduced by these two sprints. No installed Homey was changed or queried.

## Existing Flow compatibility

All existing card IDs, argument names/types/ranges, device filters, dropdown IDs
and tokens are unchanged. Titles/formatted titles/hints are clarified in
EN/DE/NL. Saved Flows remain resolvable without deletion, re-pairing or rewriting.
However, **unknown data now stops legacy conditions instead of resolving false**.
An inverted condition must not interpret missing SOC, power or setting data as
permission. This is a deliberate safety tightening, not identical behaviour for
previously invalid inputs. Existing valid comparisons retain their thresholds
and directions. No user Flow or device setting was edited.

## Receipt-checked conditions

The original STREAM driver now validates session-local applied receipts before
evaluating charging, exporting, battery SOC, solar power, the solar/load
observation, reported operating mode or feed-in permission. The read must match
the current capability value and be younger than 180 seconds, finite, not
future-dated and within its numeric/enum/boolean domain. True zero and reported
false are valid. Invalid thresholds/directions reject evaluation.

Only a received field that was successfully applied (or already matched the
received value) renews that field. Unrelated packets, SDK-only changes, old or
future packets, application failures and persisted tiles do not create receipts.
The existing verified control-readback observation callback can record reported
settings after its capability write; no command payload, sequence, address,
writer or hardware-control permission was broadened. Ambiguous mode flags or an
explicit invalid feed-in code invalidate old condition evidence instead of
pretending the setting is off.

Initialization, offline boundaries, teardown and monitoring-trial transitions
discard original receipts. Reconnect starts a new observation baseline, avoiding
false threshold/direction/mode-transition events across a data gap. The existing
monitoring reporter's identity/freshness/application checks still govern its
allowed core SOC/charging conditions. Installation/settings conditions remain
blocked during the trial. Internal display helpers are not Flow authorisation;
the registered listeners perform the strict guards.

Receipt time is **not a verified EcoFlow measurement timestamp**. This improves
handling of missing/mismatched/expired inputs, not independent proof that cloud
telemetry is physically current. The 180-second TTL follows the original
display timing; it does not loosen the separate 60-second/five-second-coherence
contract for cross-app coordination observations.

## Solar observation wording

The stable ID `charging_from_solar` is retained, but its visible wording now
describes **charging while PV exceeds reported home load**. Battery, PV and load
must each have usable receipts within five seconds of each other. Missing load
is never replaced with zero. The result does not prove exclusive solar origin,
absence of grid imports or absence of another battery supplying energy. It is
not permission for mixed-battery charging coordination.

Charge/discharge limits explicitly describe SOC percentages rather than watts.
`release_for_export` now says **Allow battery export (minimum reserve)** instead
of implying an immediate physical result. Feed-in and mode cards distinguish
reported settings/permission from actual observed power. Native modes,
schedules and constraints still determine physical behaviour. IDs and runtime
action semantics are preserved.

## Dated forecast conditions

Forecasts remain planning estimates, not measured generation. The weather request
now explicitly uses Homey's timezone. Provider `daily.time` dates and timezone
are retained and checked against the requested Homey-local today/tomorrow dates.
Malformed, stale-date or timezone-mismatched responses cannot qualify cards.

Each successful capability application has a RAM-only receipt keyed to its
calendar date, timezone, location and calibration factor. Flow evaluation needs
that matching value/context and a request-start age under six hours. Repeated
evaluation, failed writes or failed network refreshes cannot renew it. No host
timezone fallback is used. Tomorrow is computed as a calendar day, not as
24 elapsed hours, including DST boundaries. Yesterday's tomorrow is not silently
relabelled as today's forecast; both cards wait for the correct fresh labels.

Missing/negative/non-numeric provider values invalidate and clear the affected
forecast rather than becoming zero. Genuine zero forecasts still compare
normally. A transient network failure can leave a previously valid same-date
forecast usable until its fixed expiry; it cannot keep it valid indefinitely.
Guards do not rely on display-cache clearing: expiry, rollover, source/calibration
changes or restart reject stale cached capability values synchronously.

Concurrent forecast requests coalesce. Generation/context checks ignore late
results after disable, timezone/location/calibration change, date rollover or
teardown. Settings changes invalidate evidence immediately, then a bounded
local retry waits for the SDK to commit the requested settings before restarting
the existing weather refresh. Those local retries do not fetch weather until
settings match. They are cancelled on later changes/disable/teardown. No forecast
receipt or location context is persisted, exported or added to support reports.
Forecast receipt age is not the weather model's issuance time or an accuracy
guarantee.

## Verification and remaining gates

Regressions exercise registered listeners and synthetic quota/capability writes,
inversion, null versus zero, per-field expiry, incoherence, invalid arguments,
failed writes, reconnect baselines, trial guards, forecast parsing/date/timezone,
DST, midnight, source/calibration changes, settings commit, coalescing and late
responses. Golden comparisons against existing manifest contracts retain every
legacy Flow argument and identity. No Robert capture is needed for this work.

Full software/release checks are recorded in STATUS.md. These are not installed
Homey, real Flow scheduling, cloud measurement freshness or physical-hardware
acceptance. Mainline/Live/Test publication remain outside this increment.

References: [Homey Flow rejection semantics](https://apps.developer.homey.app/the-basics/flow),
[Open-Meteo forecast dates/timezone](https://open-meteo.com/en/docs),
[separate coordination Flow observations](COORDINATION_FLOW_OBSERVATIONS.md).

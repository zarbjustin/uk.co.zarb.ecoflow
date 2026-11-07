# Microinverter read-only telemetry check — 7 November2026

## Findings

**Not a proven continuous multi-day outage. Homey recorded intermittent activity,
including today. Current offline status and daytime partial-update availability
need to be treated separately.** No installed/source/settings or hardware change.

At16:45:55UTC installed Development1.11.23 was running. Homey microinverter was
unavailable/waiting for fresh readings; its live power/PV/grid fields were unknown,
not numeric zero. Its cumulative meter remained numeric. EcoFlow's existing
Developer API inventory matched the paired device and returned online=0; owner
independently confirmed the EcoFlow phone app says offline now. A bounded signed
GET quota succeeded with an empty field map. That alone is not a new API error:
this driver uses MQTT for microinverter PV/grid data and empty REST quota cannot
supply a fresh generation reading.

Native Mac inspection was unavailable because the Mac was locked. No unlock,
restart or native control action was performed. The owner asked to examine history,
so existing Homey Insights and saved private readbacks were used. This is not a
claim to have inspected EcoFlow's native historical-generation graph.

## Historical evidence and limits

- Seven-day cumulative history has daytime advances on1–6November and again7November.
  Saved direct6November14:34/14:36 readbacks show numeric power,available device and
  advancing cumulative total. Thus the recorded evidence does not support no
  reporting for several continuous days.
- On6November evening the old1.11.20 tile still exposed a >3h-old power projection.
  New startup freshness handling in1.11.21 clears old readings rather than calling
  them live. Earlier available/zero graphs cannot certify a continuous connection.
- Today13:35 readbacks show PV2/grid numeric updates while total generation is null.
  At14:35:16 Homey briefly reports the device available with numeric total power;
  by14:36:35 it is unavailable again,with total cleared at14:35:28 while PV2/grid
  continue updating. This predates the current offline observation by >2hours.
- Today's cumulative value is greater than the14:32 pre-install baseline and its
  last SDK projection change is16:05:16; power fields were cleared around16:09:10.
  These are app projection times,not hardware measurement/last-online timestamps.
  They support recent changing telemetry/accounting,not independent energy accuracy.
- Last24Hours five-minute and last7Days hourly views disagree about portions of
  this morning. The installed Homey API client's ID/URI query mapping was inspected
  and matches its supported getLogEntries wrapper. Keep both receipts; do not infer
  precise connected intervals from inconsistent/downsampled views. Earlier numeric
  power can also be held stale. No zeros were treated as authoritative offline data.
- Hourly history contains one older4November cumulative decrease,before the reviewed
  startup-counter fixes. This is not a new1.11.23 decrease finding or authority to
  rewrite counters/history. Current value remains nondecreasing against saved baseline.

Raw log identities/values and device/vendor originals remain private outside Git.
Only deterministic count/time/state projections were reviewed remotely. No complete
connection/session history was exposed by these queries.

## Sparse-PV behavior relevant to daytime No response

Current drivers/stream_micro/device.ts requires PV1 and PV2 in the same accepted
quota for a new total. A one-channel update immediately projects total power null
and breaks the energy integration anchor. BaseEcoFlowDevice.requiredLiveReadings
then makes the device unavailable without a fresh total,even if individual PV2 or
grid fields continue arriving. A partial packet is not equivalent to an offline
physical device. Explicit zero from both channels is accepted; zero alone is not
why the device becomes unavailable.

Existing test/microEnergyLifecycle.test.js deliberately covers this behavior:
`micro partial PV reports are unknown totals, break accounting continuity and
distinguish explicit zero`. It passed in an isolated offline test (one selected
test,no real network/hardware operations). This confirms the code behavior,not
that every observed field gap had that exact raw packet shape. Raw per-packet
microinverter receipts are not exposed by current battery-focused support reports.
SDK lastUpdated is a projection timestamp and cannot prove the zero-valued PV1
field received no new same-value reports. The saved pattern strongly supports a
sparse-update availability issue,but does not independently diagnose every gap.

## Proposed next bounded engineering work

Investigate/reproduce sparse and omitted PV channel updates,keeping display
freshness separate from accounting. A narrow candidate could retain the last
complete accepted total only until its original three-minute deadline when a
partial update arrives,without refreshing that total's age. Startup without a
complete total stays unknown; true expiry/offline/source change still clears it.
Partial reports must still break accounting continuity:no guessed zero channel,
no integrating a carried total across missing intervals,no downtime fill.

Add accessory-specific receipt/field-presence/queue/acceptance diagnostics without
raw identifiers/payloads. This should distinguish a fresh PV2-only stream from a
silent/offline source and from failed projection. Do not promote the microinverter
to a battery/system aggregate or claim exact physical freshness from receipts.
Then run regression tests for initial partial reports,fresh-total partial updates,
independent expiry,explicit zero,recovery,ordering,counter floor and source identity.
No production patch,version bump,installation or publication was made in this check.

A future daylight comparison should read native EcoFlow online state/current solar
and matching Homey per-field receipt diagnostics without changing loads/settings.
Current offline status may be related to conditions or connectivity,but its cause
is not established and must not be assumed to explain every daytime No response.
No need to remove/re-pair or restart to obtain this evidence.

## Boundaries and receipts

Installed app remains1.11.23; Test/Live,battery settings,AI and Homey execution
were not changed. No MQTT session/certification/subscription,forced refresh/reconnect,
control,Flow,Energy inclusion or external contact. Used existing authentication
and bounded GETs only. Homey Insights reads do not execute Flows or change history.
No private credentials were printed or stored in the new output directory.

Canonical branch/source remains e9fef96,remote equal at read-only fetch. Existing
dirty Dual CT reports/checkpoints preserved. New report/checkpoint only; no commit/
push or production edits. Documentation whitespace and the one offline existing
regression checked; no unnecessary full suite rerun or hardware acceptance claim.

Local receipt: ../work/output/microinverter-readonly-20261107T1450Z/FINAL_RECEIPT.md.

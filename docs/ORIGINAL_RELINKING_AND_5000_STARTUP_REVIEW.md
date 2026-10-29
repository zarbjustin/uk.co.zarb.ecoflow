# Original aggregate relinking and STREAM 5000 startup investigation

29 October 2026. This turn prepared source and performed read-only investigation.
No installation, restart, pairing, Homey setting/Flow or store-channel action was
performed by this investigation. Mainline, Test and Live are unchanged.

## Subsequent approved deployment

Owner approved the reviewed 1.10.62 archive, non-clean, with preservation and
read-only checks. Completed 29 October 23:01:53.660 UTC; all 13 EcoFlow identities,
99 full Flows, 1201 Insights IDs, all-device Energy settings and eight sampled
counters preserved. Matched original main and fresh zero/idle 5000 readings;
SOC remained unknown until its own report, then real zero applied. No re-pair,
battery setting/task, Test/Live action or extra restart. See latest STATUS/RC for
the authoritative installed state; the preparation/investigation below is history.

## Reconciled installed state

The HomeyPro task contains a direct owner request to deploy reviewed source
`a1391f0c51caaae0f1c39547fa03d44aa9e16077`, preserving devices/Flows/Insights,
counters and house/CT1 settings, then checking reporting/targeting without writes.
Its receipt is HTTP 200 at **22:37:59.909 UTC** (22:38 rounded). The exact archive
SHA256 was independently rechecked:
`f09d165586e6e8f93d579cd019ee3e252dec21f175add9128625dbc49fea2e3a`.
This supersedes the earlier 224ad5f delivery, although both report version 1.10.61.
The installed source fingerprint is archive-provenance
`82f0120b20fcea1033117aee3f81b51308a4631b731e615ef32610634b1521e6`,
not an independent installed-filesystem hash. Exact source CI 40966605948 passed.

The coordinating private evidence records original-main resolution matched and
all 13 EcoFlow device definitions/settings/semantic metadata, 99 complete Flows,
1201 Insights log IDs, global settings and eight sampled counters preserved.
No battery command was sent. We reviewed the direct owner approval, delivery
receipt/build hash and verification record; this is not an instruction to repeat
the installation. Existing relinking source/guard/counter tests were reviewed.
Neither existing Home Battery needs re-adding.

## STREAM 5000 findings

Earlier new-aggregate observations (22:25:49–22:28:50) had only grid/BMS deltas,
no accepted battery power samples and zero initial counters. Unknown SOC/power/
state were therefore correctly blank. At **22:41:03** a fresh read-only snapshot
shows **0% SOC, 0 W, idle**, with 87 accepted power samples, zero charged/discharged
counters, one registered subscription attempt and no reconnect in that session.
The SOC receipt was about 106 seconds old. Power came from the reported flow
matrix; the currently admitted SOC is the existing singleton-record fallback,
not independently verified installation-wide membership or explicit system SOC.

The source retains no old raw-frame replay for a newly attached listener. Grid,
temperature or health do not create a battery sample. A fresh matching singleton
record can establish SOC, and a present empty flow group can establish real zero
power/idle. The new lifecycle regression models a physical listener receiving a
core report before a late aggregate joins, unrelated deltas leaving the aggregate
unknown, then real zero reports recovering it without importing history or filling
time before its first accepted sample. It also checks no extra reconnect and
no second physical-unit Energy contribution.

The separate approved 22:38 installation restarted the app before recovery. Thus
we correct the earlier suggestion that reports returned spontaneously: this turn
sent no restart, but another owner-approved one occurred. Native-app activity is
unresolved; owner is not sure whether the EcoFlow overview was opened around
22:39. Timing is consistent with receiving later coherent battery reports after
subscription startup, not proof of a specific broker/native-app trigger. No
falsy-zero decoder defect was found; real zero data now applies correctly.
Five read-only samples from 22:48:32 to 22:50:34 UTC remain at zero SOC, zero signed battery watts and idle; battery power ages are 0–2 seconds. Both counters remain zero with 372 accepted power samples by the final snapshot. No in-session reconnect was reported. This is source telemetry/short idle-counter evidence, not independent native or nonzero interval signoff. This is not native
charge/discharge accuracy, measured-capacity, firmware/timing, restart/rollback,
ES22/linked-pack acceptance or a 48-hour final-candidate soak.

## Confirmed additional SOC scope defect

If a system mapper had admitted singleton SOC and later discovered peers without
an explicit system SOC, it previously emitted no SOC delta. Homey could retain
the old single-unit percentage until normal expiry. A strict failing regression
reproduced that behaviour. The new mapper emits an explicit null once the fallback
is disproven; a later singleton delta cannot re-enable it. Explicit system SOC,
including zero, takes priority and survives unrelated peer deltas. No arithmetic
average, guessed installed membership or zero-for-missing value is introduced.
This defect is separate from the initial missing-data gap and is not claimed as
its cause. No fresh reports are synthesized or replayed.

## Prepared 1.10.62 candidate — not installed

Includes the already-installed original relinking correction, the SOC scope
clear and two new regressions. Compared with installed a1391f0, runtime changes
are the scope guard and explicit version metadata; original identities, control
writers, Flow contracts, Energy flags and pairing gates are unchanged.

Locked Node 22 `npm ci`, **1177 tests**, lint, release/diff checks, audit zero and
pinned Homey CLI 4.5.3 verified validation pass. Hardware readiness stays pending.
Fingerprint `31c31c481516fa3c7ff4acd8ae75cd2bc9bf3f6121c7015b51ddee7c1ecd1545`.
Archive `ecoflow-stream-1.10.62-31c31c48-diagnostic.tgz`: 10471527 bytes, 1979 files.
SHA256 `ac83f47fbdd8093965a4c43699c07a774c7d16804062f8eb7e51813a1cf2e99f`. Root app/package/lock metadata match source; archive includes
production MQTT and the reviewed relinking/scope code, with no private evidence.
Exact candidate CI is recorded after commit. No original relinking reinstall is
needed just to obtain that already-installed fix. Review this candidate before
any separately approved Development update. Keep the current Home Battery
identities, histories, saved settings/Flows and cumulative totals.

Remaining work: first-report startup usability/protocol behaviour if unacceptable,
fresh independent native comparison, nonzero sign and matched-window kWh tests,
physical expiry/recovery, qualified installation scope/capacity, supported models,
Dual CT source qualification/overlap transition and final-candidate soak. Temporary
pairing opt-in and controls/default Energy boundaries remain as reviewed.

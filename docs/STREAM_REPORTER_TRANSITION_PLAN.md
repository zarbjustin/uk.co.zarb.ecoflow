# Mixed-generation reporter transition — 10 October 2026

## Release hold

The owner explicitly requested no Test publication until the next community
comment has been reviewed. This increment is local on the diagnostic branch.
No version bump, upload, certification, community reply or device migration.
The existing expansion artwork changes are separate and remain untouched.

## Evidence

[Community reply 47](https://community.homey.app/t/157399/47) supplies a schema-6
report: original Home Battery receives recent REST zero SOC/power, while two
original physical units and an AC 5000 report approximately 10% SOC. The AC 5000
observes two original-series peers. No 5000 aggregate is paired. The owner added
the 5000 after initially pairing the original installation and combined the
devices in EcoFlow's Space. This supports investigating a changed reporter;
it does not prove the complete installation's measurement or counter scope.
Do not retain raw reports, serials, email footers or credentials in this repo.

## Implemented locally

1. **Reporter diagnostics:** explicit, throttled read-only current-main lookup on
   original aggregates; bypass cached API results, compare addresses privately,
   emit only status/family/age. No address or store changes. A local support
   snapshot remains network-free. Separate 5000 system SOC/battery-power receipts
   include field-specific freshness, preserve explicit zeros and reject older,
   future or foreign-source receipts. Physical SOC is never a system fallback.
2. **Transition regressions:** synthetic original-plus-5000 topology, old-source
   zeros, anonymous identity correlation, stale/future/missing fields, restart,
   no averaging, bounded probes and unchanged address/energy stores.
3. **Guarded repair preview:** match fresh peers against existing aggregate
   addresses privately and report anonymous device references. Every candidate
   remains blocked for installation scope, counter-source transition and hardware
   acceptance. This is NOT an implemented source-switching repair.
4. **Validation preparation:** instructions below and clearer translated support
   UI distinguish integration JSON from Homey's separate app-log ID.

## Outstanding repair design and acceptance

Before implementing or enabling a source switch, collect actual system SOC and
signed system battery power from the 5000, current API resolution and close-time
EcoFlow combined-system screenshots. Confirm that fields include both older
units, remain coherent after restart and represent the same installation.
Fresh peer visibility is not enough. Discovery by account or shared percentages
does not establish membership. Never sum capacities or average percentages to
hide an unavailable aggregate.

Choose a reversible, explicit repair retaining the existing Homey device ID,
Flows and settings, rather than automatic grouping. Monitoring source selection
must not retarget original-series controls into the 5000 protocol. A source
change must invalidate old source receipts and have separate counter baselines;
retain existing monotonic totals without treating a new source's lifetime
counter as newly consumed energy. Test rollback, gaps, partial frames,
in-flight operations, restart and overlapping aggregates before acceptance.

## Robert validation checklist (after release hold is lifted)

- Update in place; do not delete/re-pair or add a second aggregate yet.
- Wait five minutes. In this app's settings, use the read-only reporter check,
  then copy the integration report. Also supply Homey's separate app-log ID.
- Send close-time EcoFlow combined-system and individual readings plus the
  Homey aggregate screenshot, privately if preferred. No credentials or full
  serial numbers are needed.
- Observe a normal charging and discharging period; do not reproduce controls
  or alter schedules solely to investigate. Repeat report after app restart.
- Confirm scope before repair implementation; then validate energy continuity,
  restart/reconnect and absence of duplicate Homey Energy contribution.

Hardware validation and active repair are pending, not completed sprints.

## Local verification

426 automated tests passed; lint passed; Homey CLI 4.5.3 verified-level validation
passed. This establishes local software checks, not a published build or hardware
acceptance. No authenticated live device probe was run here: the new optional
probe must run on the affected Homey installation to resolve its reporter.

## Ed's separate feedback

[Replies 48–49](https://community.homey.app/t/157399/48) describe Solis read-only
IF/AND capability and approximately five-minute lag. Do not add fictitious THEN
controls or infer command ownership. Cross-system coordination remains advisory,
with stale/missing inputs blocked, hysteresis and dwell safeguards. Prefer
measured power and an actual receipt timestamp over treating a scheduled
setpoint or newly fetched cached measurement as physical behaviour. A lagging
source may be unsuitable for fast surplus or reciprocal-charge protection.
Validate Solis measurement signs, timestamp availability and cadence separately
before connecting its readings to any enabled STREAM action.

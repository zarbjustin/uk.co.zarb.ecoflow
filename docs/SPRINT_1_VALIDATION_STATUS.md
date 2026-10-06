# Sprint 1 — Test-build validation and issue triage

Started 5 October 2026. **In progress; hardware gates are not complete.**
This is the validation sprint following Test v1.10.18, not the earlier
API/parser implementation sprint. Work stays on `codex/stream-next-wave-test`.

## Verified baseline

- The branch matched its GitHub tracking branch at `8bebbf9` before this work.
- Homey's developer dashboard still lists build 33 / v1.10.18 as Test and
  build 18 / v1.10.3 as Live. Build 33 lists 18 installations and zero crash
  reports at this check. This is not evidence that all installations work.
- The [community update and tester request](https://community.homey.app/t/app-pro-ecoflow-stream-series-solar-battery-smart-meter-and-homey-energy-automation/157399/29)
  is published. There are no later replies at this check. Ed's missing choices
  remain unresolved; the beta switch does not install/register a driver.
- Baseline build, all 242 tests, lint and full dependency audit passed locally.

## Findings and local changes

### Startup / teardown

Build 18 now has one **non-manual** report on Homey OS 13.5.1, in addition to
the eight previously reviewed manual submissions. Its SDK stack begins with
`Unable to initialize app: ready_timeout`, then reports access to a destroyed
`homey.app` during SDK cleanup. The stack has no application source frame that
establishes the root cause. Do not relabel this as a fixed startup timeout.

Local regression tests separately reproduced five teardown failures: retained
settings listeners, late BK/app-auth connections attaching handlers after
shutdown, an initial REST request restarting BK work, and a late 5000 connection
reviving its watchdog. The candidate now:

- Detaches app settings listeners and cancels pending settings callbacks.
- Refuses new or late connection subscriptions once app shutdown has started.
- Stops initialization from restarting polling/watchdogs/retry timers after
  teardown, including a failed 5000 connection.
- Uses captured app/handler references for subscription cleanup instead of
  consulting Homey's potentially destroyed app accessor.
- Preserves accepted-telemetry draining and the existing energy checkpoint.

Seven new regression tests cover these races. The quarantine test harness now
retains the app reference as real initialization does; its existing assertions
for stopped polling, MQTT and writes remain unchanged.

These are local changes, **not included in the published build 33**. No
version bump, GitHub push, app installation/restart or store publication is
part of this validation pass.

Candidate verification: TypeScript build, all **249 tests**, lint, full npm
audit (zero findings) and Homey publish-level validation pass. The initial
full run caught an outdated quarantine harness assumption; after it retained
the captured app reference, its original cleanup assertions and the full suite
passed. No hardware or SDK startup-timeout pass is implied.

### Numerical Energy investigation

A read-only original-STREAM Insights comparison found a substantial mismatch
between power-derived discharged energy and the charged/discharged meter delta
over an aligned interval. Unlike the earlier report, this provides a numerical
lead. It is not yet a confirmed reproduction of that report or of v1.10.18.
The installed version and the scope of the raw counters remain unverified.
Private device identifiers, exact time series and household totals are not
stored in this repository or turned into public fixtures.

Next, confirm the installed version/support snapshot, compare the same
installation's `powGetBpCms` and raw `accuChgEnergy`/`accuDsgEnergy` over matching
intervals, and establish whether each counter describes a unit, subgroup or
complete installation. Check refresh cadence, missing/partial counters, resets
and independent EcoFlow readings. Insights resampling is not raw telemetry.
Do not invent a scaling factor, sum overlapping unit counters, switch accounting
sources or rewrite historical Homey totals from this observation alone.

### On-device support report

The developer-tools hub selected during the check reports that this app is
not installed. That is not proof that the default Homey connector's hub lacks
the app: these are different selection contexts. The connector exposes original
STREAM devices but no identified 5000 installation. A Test v1.10.18 support
report has been requested; the actual endpoint and affected mobile picker
remain unverified. No device or settings change was attempted.

## Remaining gates

| Item | State | Required next evidence |
| --- | --- | --- |
| Local lifecycle hardening | Implemented locally | Build/lint/full suite/audit/Homey validation, then an authorized Test release |
| New production startup report | Open | Startup timing/reproduction and controlled restart on the affected runtime |
| On-device support endpoint | Awaiting report | Installed Test version and a successful anonymous report |
| Ed's missing beta choices | Open | Packaged/registered flags, mobile version and picker screenshot from affected client |
| Numerical Energy mismatch | Under investigation | Same-scope raw counters and signed power over aligned intervals |
| AC 5000 charge/discharge/idle | Awaiting hardware | Time-aligned EcoFlow/Homey system and unit readings |
| Saved totals/reconnect/staleness | Awaiting hardware | Authorized restart/reconnect, restored totals and no downtime backfill |
| Loaded socket/PV and 24–48-hour soak | Awaiting hardware | Relevant supported model and complete recorded matrix |

Keep existing pairing intact. Physical monitors remain excluded from Energy.
Mixed-generation grouping, additional model admission and 5000 writes remain
separate, evidence-gated work. Production promotion is not approved.

# Original STREAM API review and bug bash

Reviewed 6 October 2026. Development branch: `codex/original-stream-bug-bash`,
starting at `9c81abc` (now also GitHub master). No device command, live Flow,
schedule, main merge or Homey publication was performed in this review.

## Live account checks and online sources

The developer keys were loaded directly from the user's existing local credential
file into the client. Only device list, main identity, current quota and documented
history/targeted quota reads were called. No credentials, full serials, raw account
responses or private fixtures were saved to the repository.

- Device-list GET succeeded and returned eight BK devices. The six BK31/BK61
  batteries resolved to the same listed BK61 main. This is original-generation
  account evidence, not proof of BK/ES mixed-generation membership.
- Battery quota replies exposed 15 fields: aggregate SOC/power, PV/load/grid
  readings, reserve/charge/discharge limits, feed mode, operating flags, relays
  and the cloud heartbeat. No per-unit BMS SOC was present in these REST reads.
- Microinverter and smart-meter quota/all replies were empty. A successful empty
  HTTP response does not validate their realtime telemetry or physical operation.
- Current-day solar and battery history reads returned arrays with Wh units.
  Targeted relay reads on two AC Pro units returned the documented relay fields.
  These were POST **reads**, never PUT control commands.
- Treating the cloud timestamp as UTC placed it roughly eight hours in the
  future. Its timezone semantics remain unresolved; do not use it as a freshness
  or control-readback gate based on an assumed offset.

Read the current official
[STREAM page](https://developer-eu.ecoflow.com/us/document/PP3?id=2058828605315256321)
through the browser; the text-fetch tool could not load it. It specifies main-SN
routing for system commands and physical-SN routing for sockets, model-specific
socket support, aggregate `powGetBpCms`, quota reads and seven history metrics.
Some field descriptions are internally inconsistent (SOC is labelled as watts,
and two grid/load fields share a description). Do not treat those apparent
documentation mistakes as new scaling or scope rules.

The page supplies no reviewed revision history, so this review does **not** claim
these are newly added API features. No documented direct charging-watt setpoint,
minimum charging-power control or mixed-generation membership endpoint was
established. Existing history and supported BK controls were already implemented.

Also reviewed the current upstream
[STREAM HTTP parser](https://github.com/shuette42/ecoflow-energy-ha/blob/6f3c327fcd3bc2cdd22b7c006bb4d19607ef7e61/custom_components/ecoflow_energy/ecoflow/parsers/stream_http.py).
The upstream main SHA remains `6f3c327fcd3bc2cdd22b7c006bb4d19607ef7e61`, the
same source pinned in the earlier research. Its system/unit SOC separation
corroborates the scope issue; it is developer evidence, not an EcoFlow guarantee.

## Implemented fixes

1. Home Battery SOC uses `cmsBattSoc`; physical BMS SOC deltas can no longer
   overwrite the aggregate percentage.
2. Physical units no longer borrow aggregate battery power, derived charging
   state or whole-home grid fallback. Persisted aggregate battery-flow/state
   tiles are cleared at initialization. Missing true per-unit power stays unknown.
3. Switch values reject invalid numbers, feed modes outside 1/2 remain unknown,
   and conflicting active operating-mode flags do not choose an arbitrary mode.
4. Unit controls now use the installation device's shared target queue, fresh
   baseline/readback, bounded waits and partial-failure reporting. No optimistic
   reserve update or command retry/automatic rollback. Unit socket reads use
   documented targeted quota POSTs; system reads use fresh main quota GETs.
5. Socket layouts follow the documented matrix: two on Ultra/Pro/AC Pro/Ultra X,
   one on Max, none on AC or an unidentified model. Commands are also guarded.
6. Main-identity errors no longer silently promote the queried physical unit to
   main. Failed unit role resolution hides whole-system controls.
7. Shared writes refresh changed API credentials; missing-key guidance directs
   users to settings/restart rather than unnecessary deletion/re-pairing.
8. The shared REST cache is bounded to 256 entries and purges expired entries.
9. Interrupted/error response streams reject their requests; oversized responses
   are bounded at 4 MiB. Invalid envelopes/non-success HTTP responses are not
   accepted, and invalid-JSON errors no longer echo raw server content.
10. Nested history errors/malformed lists reject cleanly. Boolean/array/object
    history values cannot become invented numeric totals.
11. Day rollover clears unavailable daily totals to unknown, not zero. History
    results received after shutdown/reinitialization/day change are discarded.

Existing IDs, saved cumulative battery counters and installation-only Homey
Energy contributions are unchanged. A physical monitor may now show unknown
signed battery power where an older version displayed a system total; this is
intentional, not a new zero reading. Removing unsupported socket capabilities can
affect Flows that referenced those unsupported controls; review before release.

## Validation and remaining work

Local TypeScript/full tests: 396 pass. ESLint passes. Full npm audit: zero
vulnerabilities. Diff whitespace checks pass. Tests cover malformed transport,
cache retirement, aggregate/unit scope, socket targets/layout, unapplied commands,
fresh reserve planning, teardown cancellation and history recovery.

Homey CLI is not installed in this shell. New-branch GitHub CI/Homey packaging
validation has not run; passing CI on the earlier main commit is not validation
of these changes. This branch is not published or merged into main.

Next checks before a Test release:

- Run exact-commit CI/Homey validation after an authorized GitHub push.
- Compare aggregate SOC, charging/discharging and controls with time-aligned
  original STREAM app readings. Readback proves reported settings, not physical
  response; manual recovery and multi-controller behaviour remain acceptance gates.
- Original-series per-reading freshness, empty-quota availability and history
  timezone/granularity need a focused follow-up. Do not invent zero values or
  silently import historical energy into cumulative Homey meters.
- Obtain already-linked mixed-generation captures before consolidating batteries.
  Keep ES/5000 controls and additional product admission evidence-gated.

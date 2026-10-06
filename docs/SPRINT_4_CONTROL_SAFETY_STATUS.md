# Sprint 4 — original STREAM control safety

Local implementation: 6 October 2026, `codex/stream-next-wave-test`.
Unpublished, unversioned and not installed on live hardware. This increment
preserves Sprint 1–3 and their outstanding evidence gates.

## Implemented scope

The five existing BK installation controls (mode, feed-in permission, charge
limit, discharge limit and reserve) and three tariff helpers now use one
coordinator. Existing Flow IDs and `driver_id=stream` filters are unchanged.
5000 controls remain disabled; no wattage target, model admission, aggregation,
Energy-role change or control widget is added.

- Read the command's main target before writing, bypassing the short response
  cache and pre-existing polling request. Missing or ambiguous required settings
  stop the operation without writes. A fresh HTTP request is not proof that the
  cloud's snapshot or the physical device is current.
- Serialize operations per target across device instances, with at most eight
  pending operations. Unrelated targets are independent and idle queues retire.
- Normalize and validate inputs; skip commands already matching reported state.
  Preserve the reserve/discharge ordering required by the existing protocol.
- Send each command once, then attempt up to three readbacks, waiting 1.5 seconds
  before each. Read failure, unconfirmed state or a conflicting watched setting
  stops the remaining sequence. Existing GET retries/timeouts still apply, so
  this is not a 4.5-second total transaction deadline.
- Update control capabilities from observed state, not the requested value.
  These snapshots do not enter battery Energy accounting. Shutdown and lifecycle
  generation guards cancel queued work/readback waits and prevent further writes;
  an already-sent HTTP command cannot be recalled.
- Failures report attempted, API-accepted and readback-confirmed counts plus the
  previous reported settings for manual review. No raw API errors, credentials
  or serials appear in the warning. Acceptance does not establish application.

There is **no automatic rollback**. EcoFlow AI, schedules or another client may
have changed settings; blindly restoring them would be another control write.
The tested offline restore planner handles coupled reserve/discharge ordering
and the full prior discharge limit. It is not a user-facing restore button and
is never called automatically. Review the warning and current EcoFlow settings
before restoring through the existing controls.

The queue coordinates this app only. Conflict detection covers watched settings,
not every EcoFlow policy; it cannot provide a cross-client lock or atomic change.

## Tariff safeguard and behaviour change

The two electricity-price conditions require a finite price received through
the price action during the current device session, no more than 90 minutes ago.
Restart or changing price units invalidates it until the action receives a new
price. Missing/expired prices throw a Flow error, rather than returning false:
an inverted condition must not turn an unknown price into permission to act.
Fresh zero and negative prices are valid. Manual controls remain independent of
price; conditions in another tariff app have that app's own freshness semantics.

Feed the **currently applicable** price at least hourly and after restart/unit
changes, in the configured units. The tile/widget may retain the last number;
it is not a freshness indicator. Expiry does not undo earlier reserve/feed-in
changes or stop charging. Explicit normal-state and failure handling remain the
Flow owner's responsibility. Helpers change policy settings, not watts, and
cannot guarantee grid charging, export or idle regardless of mode/schedule.

This follows Homey's distinction between requested changes and
[reported capability values](https://apps.developer.homey.app/the-basics/devices/capabilities)
and its [Flow rejection semantics](https://apps.developer.homey.app/the-basics/flow).

## Verification and remaining gates

294 automated tests, build, lint, full dependency audit (zero findings) and
publish-level Homey validation passed locally. New tests cover strict state/input
validation, normalized values, no-op commands, stale cache/in-flight bypass,
accepted-but-unapplied writes, partial failure, watched-setting conflict,
per-target serialization, queue saturation, shutdown/re-init, restoration planning
and price expiry, registered Flow listeners and interrupted price updates. These
are mocked/replay checks, not physical actuation.

Before release, require green GitHub CI and explicit authorization. Before
claiming hardware verification, complete the BK control matrix in
[tester validation](TESTER_VALIDATION.md), including actual power response and
manual recovery. Keep picker, numerical Energy and production SDK startup
reports open until their separate evidence gates are met. Publishing, installation
and production promotion require explicit authorization.

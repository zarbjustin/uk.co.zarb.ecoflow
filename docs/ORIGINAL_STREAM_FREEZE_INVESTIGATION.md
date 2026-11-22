# Original STREAM freeze investigation — 31 October 2026

## Bounded consumer queue diagnostics — 1 November 2026

The separate source candidate now records REST/MQTT callbacks queued, started,
completed, skipped and failed, pending/running counts, and receipt/start/completion/
failure ages. Scope is consumer_queue; completionIsReadingAcceptance is false.
Counts saturate at 65535, storage is fixed, state is session-only, timestamps are
exported only as relative ages (future/invalid times become unknown). A second
projection strips arbitrary keys, raw values, identities and exception text.
Failures still propagate and subsequent queue work recovers. Existing queue-drain
and field-aware REST/MQTT tests remain authoritative; no change to shutdown,
reconciliation, counter or freshness semantics is intended.

A queued/pending callback while applied observations stop indicates processing
backlog. A running count while completions stop indicates an in-flight operation.
Zero queued callbacks is only absence at the consumer boundary, not proof of
broker silence. Compare with existing per-field observations and binding states.
This replaces the earlier queue-evidence gap below, but does not claim broker-level
transport qualification or identify Stefan's exact failure. Regression blocks
maintenance ahead of a delivered callback, checks failure/recovery and verifies
privacy/invalid input projection. No new field capture requested.

## Recovery audit — 1 November 2026, source candidate only

Confirmed overlapping-poll defect: the base quota request was coalesced, but the
aggregate's prerequisite fresh-main verification ran outside that guard. Timer
and manual refresh could launch competing identity checks in the same lifecycle.
A delayed failure can invalidate binding and clear live readings after a newer
check/read succeeded. This is an implementation race, not a proven cause of
Stefan's field report. The new regression fails on the previous source (two
identity lookups instead of one).

The candidate coalesces the complete identity-verification/REST operation for
one lifecycle generation. All callers await the same operation. The pending slot
clears after failure or success; a later normal poll can reverify the same source.
A lifecycle check also precedes entering the base poll. A prior generation cannot
clear a newer pending slot. Changed-main conflicts, startup-unverified blocking,
control preflights and source identity rules are retained. No new timer, network
endpoint, battery operation, MQTT reconnect or accounting algorithm is introduced.

Regression covers overlapping refreshes through a lookup failure and subsequent
same-source recovery: one verification per operation, one quota read on recovery,
correct unavailable/available state, retained monotonic counters and one recovery.
The full suite also exercises delayed REST versus newer MQTT fields/counters,
credential rotation, changed main identity, old lifecycle completions and shared
MQTT listener/session isolation. Those tests are replay evidence, not hardware
proof. A persistent initial unverified binding is still intentionally fail-closed;
this patch does not silently qualify a new main after failed startup verification.

### Diagnostic assessment

The integration support snapshot contains source-binding state (including
startup_unverified versus identity_changed), bounded failure/recovery counts,
per-field REST/MQTT receipt ages, freshness and accounting/checkpoint evidence.
This can distinguish a blocked source from stale applied readings. The detailed
shared app-MQTT transport diagnostics in Dual CT reports do NOT constitute
original Developer API MQTT transport evidence. Original diagnostics still cannot
fully distinguish no broker delivery from a queue blocked before application.
Do not infer a socket failure from a missing capability receipt. If Stefan still
freezes on a reviewed updated candidate, first inspect one existing integration
support snapshot and compare current native versus Homey behaviour; add targeted
original transport/queue evidence only if the snapshot leaves that boundary
unresolved. No generic raw capture or repeated restart is justified now.


Validation for this candidate: Node 22 committed-lockfile npm ci, all 1,366 tests,
lint, release:check, git diff --check and pinned Homey CLI 4.5.3 verified validation
passed. No new remote CI or physical acceptance claimed.

### Acceptance and release boundary

Physical acceptance is still pending on the eventual candidate. Preserve previous
runtime-specific hardware observations; do not copy their pass flags to this
changed runtime. Keep separate ES21, ES22, original STREAM, single-phase CT1 and
community three-phase qualification. No publication/installation or request to
Stefan is part of this source audit. Test remains 1.11.19/build 86; installed and
Live were not queried or changed by this work.


Publication update: the reviewed fixes are now on Test 1.11.13/build 80, from
runtime source `8adf1908e0837c7531accdb98fc88161978d740f` with passing exact CI.
See [current handover](CODEX_HANDOVER.md) for archive and preservation evidence.
The preparation findings below are historical; no new hardware pass is claimed.
Installed Development, Live and Mainline remain unchanged.

This is a source-only candidate after Test 1.11.12/build 79. No publication,
installation, restart, controls, settings/Flow change, repair or re-pair is part
of this investigation. Private reports, household values and identities remain
outside Git.

## Current evidence

The original STREAM AC Pro tester reports freezing continues on 1.11.12, perhaps
less frequently. The earlier report was generated before updating; the latest
manual Homey diagnostic matches 1.11.12, Homey 13.5.3 and Homey Pro mini (2025).
It contains startup and an initial supported-MQTT connection, with no exception
trace, later delivery evidence or field diagnostics. This is a confirmed reported
freeze, not proof of a process crash or a specific source failure.

The iPad/iPhone hypothesis is unsupported: the dashboard code reads existing
Homey capabilities; those reads do not open separate EcoFlow subscriptions.

## Confirmed source defects

1. **Permanent aggregate binding block after transient lookup failure.** Each
   original aggregate poll freshly resolves its main unit before reading quota.
   A failed lookup sets `aggregateBound = false`; the old guard also rejects
   every later successful lookup simply because that flag is false. MQTT quota
   is then ignored as well. The source can stay blocked until reinitialization.
   A regression against the published build verifies one initial quota read,
   transient failure and successful same-main lookup, but no second quota read.
2. **Credential refresh occurs too late.** Base polling refreshes rotated API
   credentials, but STREAM's prerequisite main lookup ran first. If the lookup
   failed using the old client, the base refresh was never reached.
3. **Availability could contradict the binding gate.** Incoming MQTT activity
   could mark the device available even though blocked quota application returned
   without updating capabilities. The candidate keeps that device unavailable
   until the source verification gate permits telemetry.

These are reproduced implementation failures. The diagnostic does not establish
that any of them caused the tester's exact event.

## Candidate behavior

- Remember the main identity actually verified and persisted in this initialized
  session. Only a telemetry poll may recover a temporary binding block after a
  fresh successful lookup of that **same** main identity.
- A different original main identity sets a sticky session conflict; later return
  of the former identity does not silently clear it. Initial/unverified bindings,
  foreign-family sources and source transitions are not automatically admitted.
  Normal explicit initialization retains the existing source-binding procedure.
- Refresh API credentials before the prerequisite identity lookup. The base
  refresh remains in place for ordinary polling and other drivers.
- Keep cumulative totals/raw counter baselines and paired identity/settings.
  Clear live/control values while blocked. Counter-source recovery can follow
  existing monotonic counters; power integration starts a new anchor and cannot
  fill the verification outage.
- Control/history checks cannot themselves reopen a blocked telemetry binding.
  Fresh control preflight/readback requirements remain intact; recovery sends no
  battery command. No new polling timer, MQTT reconnect or network endpoint is
  introduced.
- Emit fixed interruption/recovery log classifications and export bounded
  verification-failure/recovery counts in the local support snapshot, without
  identities, exception text, quotas or automatic upload.
- Fence late lookup completion and capability clearing against a changed device
  lifecycle generation. An old poll cannot make a newly initialized session
  unavailable.

## Regression coverage and validation

Six new regressions cover same-source recovery with cumulative counters,
changed-source blocking, credential-refresh ordering, no power-gap integration,
privacy of recovery evidence, and old-session lookup completion. The same-source
recovery case also verifies MQTT availability cannot bypass the block and a
control request cannot reopen it. Existing reconciliation tests still protect
newer MQTT fields/counters, preserve unrelated REST data, and retain original
counter-versus-power accounting behavior.

Node 22 committed-lockfile `npm ci` (zero audit findings), all 1,327 tests, lint,
release boundary/ledger checks and pinned Homey 4.5.3 verified validation pass
locally. This is not exact-commit CI or a hardware acceptance claim. Test, Live,
Mainline and the installed Development app have not been changed. Review the
candidate before versioning/publishing a further Test build; do not ask the tester
to restart/re-pair or submit another generic capture as a substitute for diagnosis.

Queue diagnostic validation: 1,368 tests, lint, release:check, diff check and pinned
Homey verified validation pass locally. Recovery-only CI passed separately.
